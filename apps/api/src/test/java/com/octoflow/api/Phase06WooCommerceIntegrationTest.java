package com.octoflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.dto.request.AllocationPreviewRequest;
import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.response.AllocationPlanResponse;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.AllocationExecutionService;
import com.octoflow.api.service.AllocationService;
import com.octoflow.api.service.ChannelService;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.OutboxDispatchService;
import com.octoflow.api.service.ReconciliationService;
import com.octoflow.api.service.SyncJobDispatchService;
import com.octoflow.api.service.SyncJobManagementService;
import com.octoflow.api.service.WooCommerceChannelService;
import com.octoflow.api.support.WooCommerceMockStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 06 end-to-end coverage against a WooCommerce-shaped HTTP server and a real PostgreSQL
 * database. The connector is exercised through the same outbox -> sync job -> adapter -> read-back
 * pipeline as the simulator; only the wire protocol differs.
 */
@SpringBootTest(properties = {
        "app.sync.workers-enabled=false",
        "app.channels.simulator.enabled=false",
        "app.channels.woocommerce.enabled=true",
        "app.channels.woocommerce.consumer-key=ck_phase06_integration",
        "app.channels.woocommerce.consumer-secret=cs_phase06_integration",
        "app.channels.woocommerce.write-enabled=true",
        "app.channels.woocommerce.read-timeout-ms=1000",
        "app.sync.retry-base-ms=1",
        "app.sync.retry-max-ms=5",
        "app.sync.allocation-max-attempts=2",
        "app.sync.max-attempts=2",
        "app.sync.lease-seconds=5",
        "app.sync.reconciliation-batch-size=1000"
})
@AutoConfigureMockMvc
@Testcontainers
@WithMockUser(roles = "ADMIN")
class Phase06WooCommerceIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final WooCommerceMockStore STORE = startStore();

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.baseline-on-migrate", () -> false);
        registry.add("app.channels.woocommerce.base-url", STORE::baseUrl);
    }

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mockMvc;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired InventoryService inventoryService;
    @Autowired ChannelService channelService;
    @Autowired WooCommerceChannelService wooCommerceChannelService;
    @Autowired AllocationService allocationService;
    @Autowired AllocationExecutionService allocationExecutionService;
    @Autowired OutboxDispatchService outboxDispatchService;
    @Autowired SyncJobDispatchService syncJobDispatchService;
    @Autowired SyncJobManagementService syncJobManagementService;
    @Autowired ReconciliationService reconciliationService;

    @BeforeEach
    void reset() {
        STORE.reset();
        jdbcTemplate.update("DELETE FROM channel_sync_evidence");
        jdbcTemplate.update("DELETE FROM sync_jobs");
        jdbcTemplate.update("DELETE FROM allocation_plan_items");
        jdbcTemplate.update("DELETE FROM allocation_plans");
        jdbcTemplate.update("DELETE FROM outbox_events");
        jdbcTemplate.update("DELETE FROM inventory_ledger");
        jdbcTemplate.update("DELETE FROM idempotency_records");
        jdbcTemplate.update("DELETE FROM channel_listings");
        jdbcTemplate.update("DELETE FROM channels");
        jdbcTemplate.update("DELETE FROM inventory_balances");
        jdbcTemplate.update("DELETE FROM product_variants");
        jdbcTemplate.update("DELETE FROM products");
    }

    // ------------------------------------------------------------------
    // Connection verification
    // ------------------------------------------------------------------

    @Test
    void connectionBecomesConnectedOnlyAfterTheLiveApiReadsProducts() throws Exception {
        Long channelId = channel("development");

        mockMvc.perform(post("/api/v1/channels/{channelId}/woocommerce/verify", channelId).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connector").value("woocommerce"))
                .andExpect(jsonPath("$.api_version").value("wc/v3"))
                .andExpect(jsonPath("$.connection_status").value("CONNECTED"))
                .andExpect(jsonPath("$.connection_verified").value(true))
                .andExpect(jsonPath("$.products_read").value(true))
                .andExpect(jsonPath("$.auth_mode").value("oauth1_dev_http"))
                .andExpect(jsonPath("$.store_name").value("OctoFlow Development Store"))
                .andExpect(jsonPath("$.wc_version").value("9.5.1"))
                .andExpect(jsonPath("$.inventory_write_enabled").value(true))
                .andExpect(jsonPath("$.inventory_write_available").value(true))
                .andExpect(jsonPath("$.read_available").value(true))
                .andExpect(jsonPath("$.last_error_code").doesNotExist());

        String statusBody = mockMvc.perform(get("/api/v1/channels/{channelId}/woocommerce/status", channelId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection_verified").value(true))
                .andExpect(jsonPath("$.products_read").value(true))
                .andReturn().getResponse().getContentAsString();
        assertFalse(statusBody.contains("ck_phase06_integration"));
        assertFalse(statusBody.contains("cs_phase06_integration"));

        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT status, connector_name, connector_version, connection_verified_at,
                       connection_products_read, connection_auth_mode, external_store_name
                FROM channels WHERE id = ?
                """, channelId);
        assertEquals("CONNECTED", row.get("status"));
        assertEquals("woocommerce", row.get("connector_name"));
        assertEquals("wc/v3", row.get("connector_version"));
        assertNotNull(row.get("connection_verified_at"));
        assertEquals(true, row.get("connection_products_read"));
        assertEquals("oauth1_dev_http", row.get("connection_auth_mode"));
        assertEquals("OctoFlow Development Store", row.get("external_store_name"));
        assertTrue(STORE.productReads.get() >= 1);

        mockMvc.perform(post("/api/v1/channels/{channelId}/woocommerce/disconnect", channelId).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection_status").value("DISCONNECTED"))
                .andExpect(jsonPath("$.connection_verified").value(false))
                .andExpect(jsonPath("$.read_available").value(false))
                .andExpect(jsonPath("$.inventory_write_available").value(false));
        assertNull(jdbcTemplate.queryForObject(
                "SELECT connection_verified_at FROM channels WHERE id = ?", java.time.Instant.class, channelId));
    }

    @Test
    void rejectedCredentialsPutTheChannelIntoErrorWithoutClaimingAConnection() throws Exception {
        Long channelId = channel("development");
        STORE.rejectProducts = true;

        mockMvc.perform(post("/api/v1/channels/{channelId}/woocommerce/verify", channelId).with(csrf()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.code").value("CHANNEL_DELIVERY_UNAVAILABLE"));

        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT status, connection_verified_at, connection_last_error_code
                FROM channels WHERE id = ?
                """, channelId);
        assertEquals("ERROR", row.get("status"));
        assertNull(row.get("connection_verified_at"));
        assertEquals("WOO_AUTH_FAILED", row.get("connection_last_error_code"));

        WooCommerceChannelStatusResponse status = wooCommerceChannelService.status(channelId);
        assertEquals("ERROR", status.connectionStatus());
        assertFalse(status.connectionVerified());
        assertFalse(status.readAvailable());
        assertFalse(status.inventoryWriteAvailable());
        assertEquals("WOO_AUTH_FAILED", status.lastErrorCode());

        STORE.rejectProducts = false;
        WooCommerceChannelStatusResponse recovered = wooCommerceChannelService.verify(channelId);
        assertTrue(recovered.connectionVerified());
        assertNull(recovered.lastErrorCode());
    }

    // ------------------------------------------------------------------
    // Mapping registration and verification
    // ------------------------------------------------------------------

    @Test
    void simpleAndVariableMappingsAreVerifiedAgainstTheExactLiveSku() {
        Long channelId = verifiedChannel();
        Fixture simple = fixture(8);
        Fixture variable = fixture(4);

        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(simple.sku(), "101", "WOO-SKU-A", null));
        assertEquals("REGISTERED", registered.mappingStatus());
        assertNull(registered.mappingVerifiedAt());

        ChannelListingResponse verifiedSimple = channelService.verifyMapping(channelId, registered.id(), null);
        assertEquals("VERIFIED", verifiedSimple.mappingStatus());
        assertNotNull(verifiedSimple.mappingVerifiedAt());
        assertEquals("WOO-SKU-A", verifiedSimple.externalSku());

        STORE.productType = "variable";
        ChannelListingResponse variableMapping = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(variable.sku(), "101", "WOO-SKU-VAR", "202"));
        ChannelListingResponse verifiedVariable = channelService.verifyMapping(
                channelId, variableMapping.id(), null);
        assertEquals("VERIFIED", verifiedVariable.mappingStatus());
        assertEquals("202", verifiedVariable.externalVariantId());
        assertEquals("WOO-SKU-VAR", verifiedVariable.externalSku());

        assertEquals(1, evidenceForListing(registered.id()).size());
        assertEquals(1, evidenceForListing(variableMapping.id()).size());
        assertTrue(evidenceForListing(registered.id()).stream()
                .allMatch(row -> "MAPPING_VERIFY".equals(row.get("kind"))
                        && "VERIFIED".equals(row.get("status"))
                        && "woocommerce".equals(row.get("adapter"))));
        assertTrue(evidenceForListing(variableMapping.id()).stream()
                .allMatch(row -> "MAPPING_VERIFY".equals(row.get("kind"))
                        && "VERIFIED".equals(row.get("status"))
                        && "woocommerce".equals(row.get("adapter"))));

        Fixture third = fixture(1);
        ApiException duplicateVariation = assertThrows(ApiException.class,
                () -> channelService.registerMapping(channelId, new RegisterChannelMappingRequest(
                        third.sku(), "101", "WOO-SKU-VAR", "202")));
        assertEquals("DATA_INTEGRITY_VIOLATION", duplicateVariation.getErrorCode().getCode());
        assertEquals(409, duplicateVariation.getStatus().value());
    }

    @Test
    void unsafeMappingsStayRegisteredAndNeverProduceVerificationEvidence() {
        Long channelId = verifiedChannel();
        Fixture wrongSku = fixture(8);
        Fixture stockDisabled = fixture(4);

        ChannelListingResponse wrong = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(wrongSku.sku(), "101", "WRONG-SKU", null));

        ApiException skuFailure = assertThrows(ApiException.class,
                () -> channelService.verifyMapping(channelId, wrong.id(), null));
        assertEquals(422, skuFailure.getStatus().value());
        assertEquals(ErrorCode.MAPPING_VERIFICATION_FAILED, skuFailure.getErrorCode());
        assertTrue(skuFailure.getMessage().contains("SKU_MISMATCH"));
        assertMappingNotVerified(wrong.id());

        STORE.productType = "variable";
        STORE.manageStock = false;
        ChannelListingResponse disabled = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(stockDisabled.sku(), "101", "WOO-SKU-VAR", "202"));
        ApiException stockFailure = assertThrows(ApiException.class,
                () -> channelService.verifyMapping(channelId, disabled.id(), null));
        assertEquals(422, stockFailure.getStatus().value());
        assertEquals(ErrorCode.MAPPING_VERIFICATION_FAILED, stockFailure.getErrorCode());
        assertTrue(stockFailure.getMessage().contains("STOCK_MANAGEMENT_DISABLED"));
        assertMappingNotVerified(disabled.id());
        assertEquals(0, STORE.putCount.get(), "mapping verification must never change stock");

        Fixture numeric = fixture(1);
        BusinessRuleException nonNumeric = assertThrows(BusinessRuleException.class,
                () -> channelService.registerMapping(channelId, new RegisterChannelMappingRequest(
                        numeric.sku(), "not-a-number", "WOO-SKU-A", null)));
        assertEquals(ErrorCode.BAD_REQUEST, nonNumeric.getErrorCode());

        BusinessRuleException missingSku = assertThrows(BusinessRuleException.class,
                () -> channelService.registerMapping(channelId, new RegisterChannelMappingRequest(
                        numeric.sku(), "101", null, null)));
        assertEquals(ErrorCode.BAD_REQUEST, missingSku.getErrorCode());
    }

    @Test
    void aStoredConnectedStatusWithoutLiveVerificationCannotVerifyMappings() {
        Long channelId = jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES ('woocommerce', 'Unverified WooCommerce', 'development', 'CONNECTED')
                RETURNING id
                """, Long.class);
        Fixture fixture = fixture(8);
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), "101", "WOO-SKU-A", null));

        ApiException failure = assertThrows(ApiException.class,
                () -> channelService.verifyMapping(channelId, registered.id(), null));

        assertEquals(503, failure.getStatus().value());
        assertEquals(ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE, failure.getErrorCode());
        assertTrue(failure.getMessage().contains("CONNECTION_NOT_VERIFIED"));
        assertEquals(0, STORE.productReads.get(), "no request may leave the backend");
        assertMappingNotVerified(registered.id());
    }

    // ------------------------------------------------------------------
    // Inventory writes and read-back
    // ------------------------------------------------------------------

    @Test
    void syncSendsOnlyTheAllocatedQuotaAndBecomesVerifiedAtEightForEight() throws Exception {
        Long channelId = verifiedChannel();
        Fixture fixture = fixture(20);
        Long listingId = verifiedListing(channelId, fixture, "101", null, "WOO-SKU-A");
        setQuota(listingId, 8);

        inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 1, "phase06 verified sync", null),
                "phase06-verified-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);

        assertEquals(8, jobTarget(jobId), "the target must be the listing quota, never global on_hand");
        processJobsUntil(jobId, "VERIFIED");
        assertTrue(STORE.awaitCompletedPuts(1, 2_000));

        assertEquals(1, STORE.putCount.get());
        assertEquals(8, STORE.stock);
        JsonNode sent = JSON.readTree(STORE.lastPutBody);
        assertEquals(1, sent.size(), "only stock_quantity may be sent; stock management is never toggled");
        assertEquals(8, sent.path("stock_quantity").asInt());

        Map<String, Object> job = jobRow(jobId);
        assertEquals("VERIFIED", job.get("status"));
        assertEquals(8, intValue(job, "target_quantity"));
        assertEquals(8, intValue(job, "sent_quantity"));
        assertEquals(8, intValue(job, "acknowledged_quantity"));
        assertEquals(8, intValue(job, "verified_quantity"));
        assertEquals("woocommerce", job.get("adapter"));
        assertTrue(((String) job.get("idempotency_reference")).startsWith("sync-job:"));

        Map<String, Object> listing = listingRow(listingId);
        assertEquals("SYNCED", listing.get("sync_status"));
        assertEquals(8, intValue(listing, "allocated_quota"));
        assertEquals(8, intValue(listing, "sent_quantity"));
        assertEquals(8, intValue(listing, "acknowledged_quantity"));
        assertEquals(8, intValue(listing, "verified_quantity"));
        assertEquals(8, intValue(listing, "reported_stock"));

        List<Map<String, Object>> evidence = evidenceForListing(listingId).stream()
                .filter(row -> "INVENTORY_SYNC".equals(row.get("kind")))
                .toList();
        assertEquals(1, evidence.size());
        assertEquals("VERIFIED", evidence.getFirst().get("status"));
        assertEquals(8, intValue(evidence.getFirst(), "target_quantity"));
        assertEquals(8, intValue(evidence.getFirst(), "sent_quantity"));
        assertEquals(8, intValue(evidence.getFirst(), "acknowledged_quantity"));
        assertEquals(8, intValue(evidence.getFirst(), "verified_quantity"));

        ListingSyncStatusResponse status = syncJobManagementService.getListingStatus(channelId, listingId);
        assertEquals(8, status.targetQuantity());
        assertEquals(8, status.sentQuantity());
        assertEquals(8, status.acknowledgedQuantity());
        assertEquals(8, status.verifiedQuantity());
        assertEquals("SYNCED", status.syncStatus());

        WooCommerceChannelStatusResponse channelStatus = wooCommerceChannelService.status(channelId);
        assertEquals(1, channelStatus.mappingCount());
        assertEquals(1, channelStatus.verifiedMappingCount());
        assertEquals(0, channelStatus.driftCount());
    }

    @Test
    void aRemoteClampToSixIsDriftAndNeverVerified() throws Exception {
        Long channelId = verifiedChannel();
        Fixture fixture = fixture(10);
        Long listingId = verifiedListing(channelId, fixture, "101", null, "WOO-SKU-A");
        setQuota(listingId, 8);
        STORE.clampStockTo = 6;

        inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 1, "phase06 drift sync", null),
                "phase06-drift-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);
        processJobsUntil(jobId, "DRIFT");

        assertEquals(1, STORE.putCount.get());
        assertEquals(6, STORE.stock);

        Map<String, Object> job = jobRow(jobId);
        assertEquals("DRIFT", job.get("status"));
        assertEquals(8, intValue(job, "target_quantity"));
        assertEquals(8, intValue(job, "sent_quantity"));
        assertEquals(6, intValue(job, "acknowledged_quantity"));
        assertEquals(6, intValue(job, "verified_quantity"));
        assertNotNull(job.get("last_error"));

        Map<String, Object> listing = listingRow(listingId);
        assertEquals("OUT_OF_SYNC", listing.get("sync_status"));
        assertEquals(6, intValue(listing, "reported_stock"));
        assertEquals(6, intValue(listing, "verified_quantity"));

        Map<String, Object> evidence = evidenceForListing(listingId).stream()
                .filter(row -> "INVENTORY_SYNC".equals(row.get("kind")))
                .findFirst().orElseThrow();
        assertEquals("DRIFT", evidence.get("status"));
        assertEquals("READ_BACK_MISMATCH", evidence.get("error_code"));
        assertEquals(8, intValue(evidence, "target_quantity"));
        assertEquals(6, intValue(evidence, "verified_quantity"));

        syncJobDispatchService.processDueJobs();
        assertEquals("DRIFT", jobStatus(jobId));
        assertEquals(1, STORE.putCount.get(), "a drift result must not be retried blindly");
    }

    @Test
    void aTimeoutIsUnconfirmedAndOnlyReconciliationCanResolveIt() throws Exception {
        Long channelId = verifiedChannel();
        Fixture fixture = fixture(10);
        Long listingId = verifiedListing(channelId, fixture, "101", null, "WOO-SKU-A");
        setQuota(listingId, 8);
        STORE.stock = 4;
        STORE.putDelayMs = 2_000;

        inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 1, "phase06 timeout sync", null),
                "phase06-timeout-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);
        processJobsUntil(jobId, "UNCONFIRMED");

        assertTrue(STORE.awaitCompletedPuts(1, 5_000),
                "the delayed mock write must finish before reconciliation reads it back");
        assertEquals(1, STORE.putCount.get());
        assertEquals(8, STORE.stock, "the write did reach the store, but its result was uncertain");

        Map<String, Object> job = jobRow(jobId);
        assertEquals("UNCONFIRMED", job.get("status"));
        assertEquals(1, intValue(job, "attempts"));
        assertEquals(8, intValue(job, "target_quantity"));
        assertNull(job.get("sent_quantity"));
        assertNull(job.get("acknowledged_quantity"));
        assertNull(job.get("verified_quantity"));
        assertTrue(((String) job.get("last_error")).toLowerCase().contains("uncertain"));

        Map<String, Object> listing = listingRow(listingId);
        assertEquals("ERROR", listing.get("sync_status"));
        assertEquals(8, intValue(listing, "allocated_quota"));

        Map<String, Object> evidence = evidenceForListing(listingId).stream()
                .filter(row -> "INVENTORY_SYNC".equals(row.get("kind")))
                .findFirst().orElseThrow();
        assertEquals("UNCONFIRMED", evidence.get("status"));
        assertEquals("WOO_TIMEOUT", evidence.get("error_code"));

        BusinessRuleException retry = assertThrows(BusinessRuleException.class,
                () -> syncJobManagementService.retry(jobId));
        assertEquals(ErrorCode.SYNC_RETRY_NOT_ALLOWED, retry.getErrorCode());

        ChannelSyncEvidenceResponse reconciled = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("VERIFIED", reconciled.status());
        assertEquals(8, reconciled.verifiedQuantity());
        assertEquals("VERIFIED", jobStatus(jobId));
        assertEquals("SYNCED", listingRow(listingId).get("sync_status"));
    }

    @Test
    void allocationExecutionPublishesTheVerifiedQuotaThroughTheRealConnector() {
        Long channelId = verifiedChannel();
        Fixture fixture = fixture(20);
        Long listingId = verifiedListing(channelId, fixture, "101", null, "WOO-SKU-A");
        STORE.stock = 19;

        AllocationPlanResponse plan = allocationService.preview(new AllocationPreviewRequest(
                fixture.sku(),
                List.of(new AllocationPreviewRequest.AllocationTargetRequest(listingId, 8))));
        allocationService.confirm(plan.id(), "phase06-allocation-" + UUID.randomUUID());
        assertTrue(allocationExecutionService.processPlan(plan.id()));

        assertEquals("COMPLETED", allocationService.get(plan.id()).status());
        assertEquals(1, STORE.putCount.get(), "the adapter must perform exactly one absolute write");
        assertEquals(8, STORE.stock);
        assertEquals(8, quota(listingId));

        Map<String, Object> item = jdbcTemplate.queryForMap("""
                SELECT status, proposed_quota, sent_quantity, acknowledged_quantity,
                       verified_quantity, remote_before, remote_after
                FROM allocation_plan_items WHERE plan_id = ?
                """, plan.id());
        assertEquals("VERIFIED", item.get("status"));
        assertEquals(8, intValue(item, "proposed_quota"));
        assertEquals(8, intValue(item, "sent_quantity"));
        assertEquals(8, intValue(item, "acknowledged_quantity"));
        assertEquals(8, intValue(item, "verified_quantity"));
        assertEquals(19, intValue(item, "remote_before"));
        assertEquals(8, intValue(item, "remote_after"));

        Map<String, Object> evidence = evidenceForListing(listingId).stream()
                .filter(row -> "ALLOCATION_INCREASE".equals(row.get("kind")))
                .findFirst().orElseThrow();
        assertEquals("VERIFIED", evidence.get("status"));
        assertEquals("woocommerce", evidence.get("adapter"),
                "allocation evidence must name the connector that delivered it");
        assertEquals(8, intValue(evidence, "target_quantity"));
        assertEquals(8, intValue(evidence, "verified_quantity"));
    }

    @Test
    void aBlockedAllocationCannotQueueAZeroQuotaRemoteWrite() throws Exception {
        Long channelId = verifiedChannel();
        Fixture fixture = fixture(20);
        Long listingId = verifiedListing(channelId, fixture, "101", null, "WOO-SKU-A");
        STORE.stock = 19;
        // The mapping was valid when verified; disabling stock management now makes the increase
        // fail without writing, leaving the listing target unconfirmed.
        STORE.manageStock = false;

        AllocationPlanResponse plan = allocationService.preview(new AllocationPreviewRequest(
                fixture.sku(),
                List.of(new AllocationPreviewRequest.AllocationTargetRequest(listingId, 8))));
        allocationService.confirm(plan.id(), "phase06-blocked-" + UUID.randomUUID());
        assertTrue(allocationExecutionService.processPlan(plan.id()));
        Thread.sleep(20);
        assertTrue(allocationExecutionService.processPlan(plan.id()));

        assertEquals("BLOCKED", allocationService.get(plan.id()).status());
        assertEquals(0, STORE.putCount.get(), "a refused allocation must not mutate the store");
        assertEquals(19, STORE.stock);
        assertEquals(0, quota(listingId));

        Map<String, Object> failure = evidenceForListing(listingId).stream()
                .filter(row -> "ALLOCATION_INCREASE".equals(row.get("kind")))
                .findFirst().orElseThrow();
        assertEquals("REFUSED", failure.get("status"));
        assertEquals("WOO_STOCK_MANAGEMENT_DISABLED", failure.get("error_code"));
        assertEquals("woocommerce", failure.get("adapter"));

        // The operator restores stock management; reconciliation now reads 19 while the blocked
        // target is 0. It must surface drift without publishing that unconfirmed target.
        STORE.manageStock = true;
        ChannelSyncEvidenceResponse observed = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("DRIFT", observed.status());
        assertEquals(0, observed.targetQuantity());
        assertEquals(19, observed.verifiedQuantity());

        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sync_jobs", Integer.class),
                "a blocked allocation target must not be queued as an automatic correction");
        syncJobDispatchService.processDueJobs();
        assertEquals(0, STORE.putCount.get());
        assertEquals(19, STORE.stock);
    }

    // ------------------------------------------------------------------
    // Environment and safety gates
    // ------------------------------------------------------------------
    @Test
    void nonDevelopmentChannelsAreBlockedBeforeAnyRequest() {
        Long channelId = channel("production");

        ApiException verifyFailure = assertThrows(ApiException.class,
                () -> wooCommerceChannelService.verify(channelId));
        assertEquals(422, verifyFailure.getStatus().value());
        assertEquals(ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED, verifyFailure.getErrorCode());
        assertEquals(0, STORE.productReads.get());

        // Even a stale CONNECTED row with verification metadata must not bypass the environment gate.
        jdbcTemplate.update("""
                UPDATE channels
                SET status = 'CONNECTED', connector_name = 'woocommerce',
                    connection_verified_at = clock_timestamp()
                WHERE id = ?
                """, channelId);
        Fixture fixture = fixture(8);
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), "101", "WOO-SKU-A", null));

        ApiException mappingFailure = assertThrows(ApiException.class,
                () -> channelService.verifyMapping(channelId, registered.id(), null));
        assertEquals(422, mappingFailure.getStatus().value());
        assertEquals(ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED, mappingFailure.getErrorCode());
        assertEquals(0, STORE.productReads.get(), "the environment gate must run before HTTP");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static WooCommerceMockStore startStore() {
        try {
            return new WooCommerceMockStore();
        } catch (IOException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    private Long channel(String environment) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES ('woocommerce', 'WooCommerce Development Store', ?, 'DISCONNECTED')
                RETURNING id
                """, Long.class, environment);
    }

    private Long verifiedChannel() {
        Long channelId = channel("development");
        WooCommerceChannelStatusResponse status = wooCommerceChannelService.verify(channelId);
        assertTrue(status.connectionVerified());
        return channelId;
    }

    private Long verifiedListing(Long channelId, Fixture fixture, String productId,
                                 String variationId, String wooSku) {
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), productId, wooSku, variationId));
        ChannelListingResponse verified = channelService.verifyMapping(channelId, registered.id(), null);
        assertEquals("VERIFIED", verified.mappingStatus());
        return registered.id();
    }

    private Fixture fixture(int onHand) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        String sku = "P06-" + suffix;
        Product product = new Product();
        product.setName("Phase 06 test " + suffix);
        product.setStatus(Product.Status.PUBLISHED);
        product = productRepository.saveAndFlush(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(sku);
        variant.setTitle("Phase 06 variant");
        variant.setPrice(1000L);
        variant = variantRepository.saveAndFlush(variant);

        jdbcTemplate.update("""
                INSERT INTO inventory_balances (variant_id, on_hand, reserved, safety_buffer)
                VALUES (?, ?, 0, 0)
                """, variant.getId(), onHand);
        return new Fixture(variant.getId(), sku);
    }

    private void setQuota(Long listingId, int quota) {
        jdbcTemplate.update("UPDATE channel_listings SET allocated_quota = ? WHERE id = ?", quota, listingId);
    }

    private int quota(Long listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT allocated_quota FROM channel_listings WHERE id = ?", Integer.class, listingId);
    }

    private void assertMappingNotVerified(Long listingId) {
        Map<String, Object> row = listingRow(listingId);
        assertEquals("REGISTERED", row.get("mapping_status"));
        assertNull(row.get("mapping_verified_at"));
        assertTrue(evidenceForListing(listingId).stream()
                .noneMatch(evidence -> "MAPPING_VERIFY".equals(evidence.get("kind"))));
    }

    private Map<String, Object> listingRow(Long listingId) {
        return jdbcTemplate.queryForMap("""
                SELECT mapping_status, mapping_verified_at, sync_status, allocated_quota,
                       sent_quantity, acknowledged_quantity, verified_quantity, reported_stock
                FROM channel_listings WHERE id = ?
                """, listingId);
    }

    private List<Map<String, Object>> evidenceForListing(Long listingId) {
        return jdbcTemplate.queryForList("""
                SELECT kind, status, adapter, target_quantity, sent_quantity,
                       acknowledged_quantity, verified_quantity, error_code
                FROM channel_sync_evidence WHERE listing_id = ? ORDER BY id ASC
                """, listingId);
    }

    private Map<String, Object> jobRow(Long jobId) {
        return jdbcTemplate.queryForMap("""
                SELECT status, attempts, target_quantity, sent_quantity, acknowledged_quantity,
                       verified_quantity, adapter, idempotency_reference, last_error
                FROM sync_jobs WHERE id = ?
                """, jobId);
    }

    private String jobStatus(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT status FROM sync_jobs WHERE id = ?", String.class, jobId);
    }

    private int jobTarget(Long jobId) {
        return jdbcTemplate.queryForObject(
                "SELECT target_quantity FROM sync_jobs WHERE id = ?", Integer.class, jobId);
    }

    private Long latestJobId(Long listingId) {
        return jdbcTemplate.queryForObject("""
                SELECT id FROM sync_jobs WHERE listing_id = ? ORDER BY id DESC LIMIT 1
                """, Long.class, listingId);
    }

    private int intValue(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).intValue();
    }

    private void dispatchOutboxUntilIdle(Long variantId) throws Exception {
        for (int i = 0; i < 100; i++) {
            outboxDispatchService.processDueEvents();
            Integer open = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM outbox_events
                    WHERE aggregate_type = 'INVENTORY' AND aggregate_id = ?
                      AND status IN ('PENDING', 'PROCESSING')
                    """, Integer.class, variantId.toString());
            if (open != null && open == 0) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("Inventory outbox events for variant " + variantId + " were not dispatched");
    }

    private void processJobsUntil(Long jobId, String expected) throws Exception {
        for (int i = 0; i < 200; i++) {
            syncJobDispatchService.processDueJobs();
            if (expected.equals(jobStatus(jobId))) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("Sync job #" + jobId + " did not reach " + expected
                + "; last status was " + jobStatus(jobId)
                + ", last error was " + jdbcTemplate.queryForObject(
                        "SELECT last_error FROM sync_jobs WHERE id = ?", String.class, jobId)
                + ", evidence was " + evidenceForListing(jdbcTemplate.queryForObject(
                        "SELECT listing_id FROM sync_jobs WHERE id = ?", Long.class, jobId)));
    }

    private record Fixture(Long variantId, String sku) {
    }
}
