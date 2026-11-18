package com.octoflow.api;

import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.ChannelService;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.OutboxDispatchService;
import com.octoflow.api.service.ReconciliationService;
import com.octoflow.api.service.SyncJobDispatchService;
import com.octoflow.api.service.WooCommerceChannelService;
import com.octoflow.api.support.WooCommerceMockStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 06 write-flag safety: read/verify may work while the dedicated inventory write flag is
 * off, but no stock mutation may ever leave the backend.
 */
@SpringBootTest(properties = {
        "app.sync.workers-enabled=false",
        "app.channels.simulator.enabled=false",
        "app.channels.woocommerce.enabled=true",
        "app.channels.woocommerce.consumer-key=ck_phase06_readonly",
        "app.channels.woocommerce.consumer-secret=cs_phase06_readonly",
        "app.channels.woocommerce.write-enabled=false",
        "app.channels.woocommerce.read-timeout-ms=1000",
        "app.sync.retry-base-ms=1",
        "app.sync.retry-max-ms=5",
        "app.sync.allocation-max-attempts=2",
        "app.sync.max-attempts=2",
        "app.sync.lease-seconds=5",
        "app.sync.reconciliation-batch-size=1000"
})
@Testcontainers
class Phase06WooCommerceWriteDisabledIntegrationTest {

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
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired InventoryService inventoryService;
    @Autowired ChannelService channelService;
    @Autowired WooCommerceChannelService wooCommerceChannelService;
    @Autowired OutboxDispatchService outboxDispatchService;
    @Autowired SyncJobDispatchService syncJobDispatchService;
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

    @Test
    void writeFlagOffStillVerifiesTheConnectionAndMappingButBlocksTheJobBeforeAnyWrite() throws Exception {
        Long channelId = channel();
        WooCommerceChannelStatusResponse connected = wooCommerceChannelService.verify(channelId);
        assertTrue(connected.connectionVerified());
        assertTrue(connected.readAvailable());
        assertFalse(connected.inventoryWriteEnabled());
        assertFalse(connected.inventoryWriteAvailable());

        Fixture fixture = fixture(20);
        Long listingId = registerAndVerify(channelId, fixture);
        assertEquals("VERIFIED", jdbcTemplate.queryForObject(
                "SELECT mapping_status FROM channel_listings WHERE id = ?", String.class, listingId));

        jdbcTemplate.update("UPDATE channel_listings SET allocated_quota = 8 WHERE id = ?", listingId);
        inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 1, "phase06 write disabled", null),
                "phase06-disabled-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = jdbcTemplate.queryForObject(
                "SELECT id FROM sync_jobs WHERE listing_id = ? ORDER BY id DESC LIMIT 1",
                Long.class, listingId);

        assertEquals("PENDING", jobStatus(jobId),
                "the durable job exists, so the blocked state is visible instead of silently skipped");
        processJobsUntil(jobId, "BLOCKED");

        assertEquals("BLOCKED", jobStatus(jobId));
        assertEquals(0, STORE.putCount.get(), "the write flag is off, so no HTTP write may happen");
        assertEquals(8, STORE.stock, "remote stock must be untouched");

        Map<String, Object> evidence = evidenceForListing(listingId).stream()
                .filter(row -> "INVENTORY_SYNC".equals(row.get("kind")))
                .findFirst().orElseThrow();
        assertEquals("ERROR", evidence.get("status"));
        assertEquals("PREFLIGHT", evidence.get("error_code"));

        Map<String, Object> listing = jdbcTemplate.queryForMap("""
                SELECT sync_status, allocated_quota, sent_quantity, acknowledged_quantity, verified_quantity
                FROM channel_listings WHERE id = ?
                """, listingId);
        assertEquals("ERROR", listing.get("sync_status"));
        assertEquals(8, ((Number) listing.get("allocated_quota")).intValue());
        assertNull(listing.get("sent_quantity"));
        assertNull(listing.get("verified_quantity"));
    }

    @Test
    void readOnlyReconciliationDetectsDriftWithoutSendingAnyWrite() throws Exception {
        Long channelId = channel();
        wooCommerceChannelService.verify(channelId);
        Fixture fixture = fixture(10);
        Long listingId = registerAndVerify(channelId, fixture);
        jdbcTemplate.update("UPDATE channel_listings SET allocated_quota = 8 WHERE id = ?", listingId);

        STORE.stock = 8;
        ChannelSyncEvidenceResponse matched = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("VERIFIED", matched.status());
        assertEquals(8, matched.verifiedQuantity());

        STORE.stock = 6;
        ChannelSyncEvidenceResponse drift = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("DRIFT", drift.status());
        assertEquals(8, drift.targetQuantity());
        assertEquals(6, drift.verifiedQuantity());
        assertEquals(0, STORE.putCount.get(), "reconciliation is read-only even when it records drift");
        assertEquals(6, STORE.stock);

        Long correctionId = jdbcTemplate.queryForObject(
                "SELECT id FROM sync_jobs WHERE listing_id = ? ORDER BY id DESC LIMIT 1",
                Long.class, listingId);
        processJobsUntil(correctionId, "BLOCKED");
        assertEquals(0, STORE.putCount.get(), "the queued correction must also fail closed");
    }

    private static WooCommerceMockStore startStore() {
        try {
            return new WooCommerceMockStore();
        } catch (IOException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    private Long channel() {
        return jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES ('woocommerce', 'WooCommerce Read Only', 'development', 'DISCONNECTED')
                RETURNING id
                """, Long.class);
    }

    private Long registerAndVerify(Long channelId, Fixture fixture) {
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), "101", "WOO-SKU-A", null));
        ChannelListingResponse verified = channelService.verifyMapping(channelId, registered.id(), null);
        assertEquals("VERIFIED", verified.mappingStatus());
        return registered.id();
    }

    private Fixture fixture(int onHand) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        String sku = "P06R-" + suffix;
        Product product = new Product();
        product.setName("Phase 06 read-only " + suffix);
        product.setStatus(Product.Status.PUBLISHED);
        product = productRepository.saveAndFlush(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(sku);
        variant.setTitle("Phase 06 read-only variant");
        variant.setPrice(1000L);
        variant = variantRepository.saveAndFlush(variant);

        jdbcTemplate.update("""
                INSERT INTO inventory_balances (variant_id, on_hand, reserved, safety_buffer)
                VALUES (?, ?, 0, 0)
                """, variant.getId(), onHand);
        return new Fixture(variant.getId(), sku);
    }

    private String jobStatus(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT status FROM sync_jobs WHERE id = ?", String.class, jobId);
    }

    private java.util.List<Map<String, Object>> evidenceForListing(Long listingId) {
        return jdbcTemplate.queryForList("""
                SELECT kind, status, adapter, target_quantity, sent_quantity,
                       acknowledged_quantity, verified_quantity, error_code
                FROM channel_sync_evidence WHERE listing_id = ? ORDER BY id ASC
                """, listingId);
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
                + "; last status was " + jobStatus(jobId));
    }

    private record Fixture(Long variantId, String sku) {
    }
}
