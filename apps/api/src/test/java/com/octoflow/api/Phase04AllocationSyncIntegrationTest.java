package com.octoflow.api;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.adapter.SimulatorStateService;
import com.octoflow.api.dto.request.AllocationPreviewRequest;
import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.request.SimulatorFaultRequest;
import com.octoflow.api.dto.response.AllocationPlanResponse;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.dto.response.SyncJobResponse;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.AllocationExecutionService;
import com.octoflow.api.service.AllocationService;
import com.octoflow.api.service.ChannelMappingRecorder;
import com.octoflow.api.service.ChannelService;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.OutboxDispatchService;
import com.octoflow.api.service.ReconciliationService;
import com.octoflow.api.service.SimulatorAdminService;
import com.octoflow.api.service.SyncJobDispatchService;
import com.octoflow.api.service.SyncJobManagementService;
import com.octoflow.api.service.SyncJobProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
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
 * Phase 04 end-to-end integration coverage: manual allocation preview/confirm, the
 * Decrease -> verify -> Increase rule, durable outbox fan-out, sync retries/dead letters,
 * simulator reconciliation and fail-closed behaviour for real channels.
 */
@SpringBootTest(properties = {
        "app.sync.workers-enabled=false",
        "app.channels.simulator.enabled=true",
        "app.sync.retry-base-ms=1",
        "app.sync.retry-max-ms=5",
        "app.sync.allocation-max-attempts=2",
        "app.sync.max-attempts=2",
        "app.sync.lease-seconds=5",
        "app.sync.reconciliation-batch-size=1000"
})
@AutoConfigureMockMvc
@Testcontainers
class Phase04AllocationSyncIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.baseline-on-migrate", () -> false);
    }

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mockMvc;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired InventoryService inventoryService;
    @Autowired AllocationService allocationService;
    @Autowired AllocationExecutionService allocationExecutionService;
    @Autowired OutboxDispatchService outboxDispatchService;
    @Autowired SyncJobDispatchService syncJobDispatchService;
    @Autowired SyncJobManagementService syncJobManagementService;
    @Autowired ReconciliationService reconciliationService;
    @Autowired SimulatorAdminService simulatorAdminService;
    @Autowired SimulatorStateService simulatorStateService;
    @Autowired ChannelService channelService;
    @Autowired ChannelMappingRecorder channelMappingRecorder;
    @Autowired SyncJobProcessor syncJobProcessor;

    // ------------------------------------------------------------------
    // Preview and confirm safety
    // ------------------------------------------------------------------

    @Test
    void previewNeverMutatesInventoryOrQuotaAndRejectsOverAllocation() {
        Fixture fixture = fixture(10, 1, 2);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 2, ChannelListing.MappingStatus.VERIFIED);

        AllocationPlanResponse plan = preview(fixture.sku(), targets(listingId, 7));

        assertEquals("PROJECTED", plan.status());
        assertEquals(10, plan.onHand());
        assertEquals(1, plan.reserved());
        assertEquals(2, plan.safetyBuffer());
        assertEquals(7, plan.availableToSell(), "available_to_sell must be computed once, not after a second buffer subtraction");
        assertEquals(7, plan.totalTarget());
        assertTrue(plan.canExecute());
        assertEquals("INCREASE", plan.items().getFirst().direction());

        assertEquals(2, quota(listingId));
        assertBalance(fixture, 10, 1, 2);
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE aggregate_type = 'ALLOCATION' AND aggregate_id = ?",
                Integer.class, plan.id().toString()));

        AllocationPlanResponse omitted = preview(fixture.sku());
        assertFalse(omitted.canExecute());
        assertTrue(omitted.issues().stream().anyMatch(issue -> issue.contains("phải có mặt tường minh")));

        BusinessRuleException over = assertThrows(BusinessRuleException.class,
                () -> preview(fixture.sku(), targets(listingId, 8)));
        assertEquals(ErrorCode.QUOTA_EXCEEDS_ATS, over.getErrorCode());

        assertEquals(2, quota(listingId));
        assertBalance(fixture, 10, 1, 2);
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void confirmRequiresIdempotencyKeyAndReplaysTheStoredResponse() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);
        AllocationPlanResponse plan = preview(fixture.sku(), targets(listingId, 2));

        mockMvc.perform(post("/api/v1/inventory/allocations/{planId}/execute", plan.id())
                        .with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REQUIRED"));

        String key = "confirm-" + UUID.randomUUID();
        mockMvc.perform(post("/api/v1/inventory/allocations/{planId}/execute", plan.id())
                        .with(csrf())
                        .header("Idempotency-Key", key))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(plan.id()))
                .andExpect(jsonPath("$.status").value("APPLYING"));

        mockMvc.perform(post("/api/v1/inventory/allocations/{planId}/execute", plan.id())
                        .with(csrf())
                        .header("Idempotency-Key", key))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(plan.id()))
                .andExpect(jsonPath("$.status").value("APPLYING"));

        assertEquals("APPLYING", planStatus(plan.id()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE aggregate_type = 'ALLOCATION' AND aggregate_id = ?",
                Integer.class, plan.id().toString()));
        assertEquals(0, quota(listingId), "confirm must not change quota before the decrease/increase is verified");
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void confirmRejectsStaleCoreVersionAndStaleAllocationRevision() {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);

        AllocationPlanResponse first = preview(fixture.sku(), targets(listingId, 2));
        AllocationPlanResponse second = preview(fixture.sku(), targets(listingId, 2));
        assertEquals("SUPERSEDED", planStatus(first.id()), "a newer preview must supersede the older one");
        assertEquals("PROJECTED", planStatus(second.id()));

        ApiException superseded = assertThrows(ApiException.class,
                () -> allocationService.confirm(first.id(), "stale-first-" + UUID.randomUUID()));
        assertEquals(ErrorCode.ALLOCATION_PLAN_BLOCKED, superseded.getErrorCode());

        jdbcTemplate.update("UPDATE inventory_balances SET version = version + 1 WHERE variant_id = ?",
                fixture.variantId());
        ApiException staleCore = assertThrows(ApiException.class,
                () -> allocationService.confirm(second.id(), "stale-core-" + UUID.randomUUID()));
        assertEquals(ErrorCode.ALLOCATION_PLAN_STALE, staleCore.getErrorCode());

        AllocationPlanResponse third = preview(fixture.sku(), targets(listingId, 2));
        jdbcTemplate.update("UPDATE variant_allocation_states SET current_revision = current_revision + 1 WHERE variant_id = ?",
                fixture.variantId());
        ApiException staleRevision = assertThrows(ApiException.class,
                () -> allocationService.confirm(third.id(), "stale-revision-" + UUID.randomUUID()));
        assertEquals(ErrorCode.ALLOCATION_PLAN_STALE, staleRevision.getErrorCode());
        assertEquals(0, quota(listingId));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void onlyOneApplyingPlanPerVariantIsAllowed() {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);

        AllocationPlanResponse first = preview(fixture.sku(), targets(listingId, 2));
        allocationService.confirm(first.id(), "competing-" + UUID.randomUUID());

        AllocationPlanResponse second = preview(fixture.sku(), targets(listingId, 2));
        ApiException competing = assertThrows(ApiException.class,
                () -> allocationService.confirm(second.id(), "competing-second-" + UUID.randomUUID()));
        assertEquals(ErrorCode.ALLOCATION_PLAN_BLOCKED, competing.getErrorCode());
        assertEquals(409, competing.getStatus().value());
        assertEquals("APPLYING", planStatus(first.id()));
    }

    // ------------------------------------------------------------------
    // Decrease -> verify -> Increase execution
    // ------------------------------------------------------------------

    @Test
    @WithMockUser(roles = "ADMIN")
    void decreasesMustVerifyBeforeAnyIncreaseRuns() {
        Fixture fixture = fixture(10, 0, 0);
        Long decreaseChannel = channel("simulated");
        Long increaseChannel = channel("simulated");
        Long decreaseListing = listing(decreaseChannel, fixture.variantId(), 3,
                ChannelListing.MappingStatus.VERIFIED);
        Long increaseListing = listing(increaseChannel, fixture.variantId(), 0,
                ChannelListing.MappingStatus.VERIFIED);
        simulatorStateService.setExternalStock(decreaseListing, 3);
        simulatorStateService.setExternalStock(increaseListing, 0);

        Map<Long, Integer> desired = new LinkedHashMap<>();
        desired.put(decreaseListing, 1);
        desired.put(increaseListing, 2);
        AllocationPlanResponse plan = preview(fixture.sku(), desired);
        allocationService.confirm(plan.id(), "ordered-" + UUID.randomUUID());

        assertTrue(allocationExecutionService.processPlan(plan.id()));
        assertEquals(1, quota(decreaseListing));
        assertEquals(1, simulatorStateService.getState(decreaseListing).quantity());
        assertEquals(0, quota(increaseListing), "increase must wait until the decrease is verified");
        assertEquals(0, simulatorStateService.getState(increaseListing).quantity());
        assertEquals("APPLYING", planStatus(plan.id()));
        assertEquals(0, evidenceForPlan(plan.id()).stream()
                .filter(row -> "ALLOCATION_INCREASE".equals(row.get("kind")))
                .count());

        assertTrue(allocationExecutionService.processPlan(plan.id()));
        assertEquals("COMPLETED", planStatus(plan.id()));
        assertEquals(1, quota(decreaseListing));
        assertEquals(2, quota(increaseListing));
        assertEquals(2, simulatorStateService.getState(increaseListing).quantity());
        assertBalance(fixture, 10, 0, 0);

        List<Map<String, Object>> evidence = evidenceForPlan(plan.id());
        assertEquals(List.of("ALLOCATION_DECREASE", "ALLOCATION_INCREASE"),
                evidence.stream().map(row -> (String) row.get("kind")).toList());
        assertTrue(evidence.stream().allMatch(row -> "VERIFIED".equals(row.get("status"))));
        assertEquals(List.of(1, 2), evidence.stream()
                .map(row -> ((Number) row.get("verified_quantity")).intValue())
                .toList());

        AllocationPlanResponse completed = allocationService.get(plan.id());
        assertTrue(completed.items().stream().allMatch(item -> "VERIFIED".equals(item.status())));
        assertTrue(completed.items().stream().allMatch(item ->
                item.sentQuantity() != null && item.sentQuantity().equals(item.proposedQuota())));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void timedOutDecreaseBlocksAllIncreasesAndThePlan() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long decreaseChannel = channel("simulated");
        Long increaseChannel = channel("simulated");
        Long decreaseListing = listing(decreaseChannel, fixture.variantId(), 5,
                ChannelListing.MappingStatus.VERIFIED);
        Long increaseListing = listing(increaseChannel, fixture.variantId(), 0,
                ChannelListing.MappingStatus.VERIFIED);
        simulatorStateService.setExternalStock(decreaseListing, 5);
        simulatorStateService.setExternalStock(increaseListing, 0);

        Map<Long, Integer> desired = new LinkedHashMap<>();
        desired.put(decreaseListing, 2);
        desired.put(increaseListing, 3);
        AllocationPlanResponse plan = preview(fixture.sku(), desired);
        allocationService.confirm(plan.id(), "timeout-" + UUID.randomUUID());
        simulatorStateService.injectFault(decreaseListing,
                com.octoflow.api.entity.SimulatorFault.FaultType.TIMEOUT, 10, 0);

        assertTrue(allocationExecutionService.processPlan(plan.id()));
        assertEquals("BLOCKED", planStatus(plan.id()),
                "a timeout during the decrease write is uncertain and must block immediately");
        assertEquals("BLOCKED", itemStatus(plan.id(), decreaseListing));
        assertEquals("PENDING", itemStatus(plan.id(), increaseListing));
        assertEquals(1, evidenceForPlan(plan.id()).stream()
                .filter(row -> "TIMEOUT".equals(row.get("error_code")))
                .count());

        assertFalse(allocationExecutionService.processPlan(plan.id()),
                "the same uncertain write must never be retried automatically");

        assertEquals(5, quota(decreaseListing), "an uncertain remote result must never be treated as applied");
        assertEquals(0, quota(increaseListing));
        assertEquals(0, simulatorStateService.getState(increaseListing).quantity());
        assertTrue(evidenceForPlan(plan.id()).stream().noneMatch(row ->
                "ALLOCATION_INCREASE".equals(row.get("kind"))));
        assertTrue(evidenceForPlan(plan.id()).stream()
                .filter(row -> "ALLOCATION_DECREASE".equals(row.get("kind")))
                .allMatch(row -> "UNCONFIRMED".equals(row.get("status"))
                        && "TIMEOUT".equals(row.get("error_code"))));
        assertFalse(allocationExecutionService.processPlan(plan.id()));
    }

    // ------------------------------------------------------------------
    // Outbox and sync jobs
    // ------------------------------------------------------------------

    @Test
    void outboxFanOutCreatesOneActiveJobPerEligibleListingAndSupersedesStaleJobs() throws Exception {
        Fixture fixture = fixture(0, 0, 0);
        Long firstChannel = channel("simulated");
        Long secondChannel = channel("simulated");
        Long ineligibleChannel = channel("simulated");
        Long firstListing = listing(firstChannel, fixture.variantId(), 2, ChannelListing.MappingStatus.VERIFIED);
        Long secondListing = listing(secondChannel, fixture.variantId(), 1, ChannelListing.MappingStatus.VERIFIED);
        Long ineligibleListing = listing(ineligibleChannel, fixture.variantId(), 1,
                ChannelListing.MappingStatus.UNVERIFIED);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 10, "phase04 fanout", null),
                "fanout-1-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());

        List<Map<String, Object>> jobs = jobsForVariant(fixture.variantId());
        assertEquals(2, jobs.size(), "only active + verified + connected listings get a sync job");
        assertEquals(Map.of(firstListing, 2, secondListing, 1), targetsByListing(jobs));
        assertTrue(jobs.stream().allMatch(row -> "PENDING".equals(row.get("status"))));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sync_jobs WHERE listing_id = ?", Integer.class, ineligibleListing));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE aggregate_type = 'INVENTORY' AND aggregate_id = ? AND status <> 'PUBLISHED'",
                Integer.class, fixture.variantId().toString()));

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "phase04 fanout 2", null),
                "fanout-2-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());

        List<Map<String, Object>> afterSecond = jobsForVariant(fixture.variantId());
        assertEquals(4, afterSecond.size());
        assertEquals(2, afterSecond.stream().filter(row -> "PENDING".equals(row.get("status"))).count());
        assertEquals(2, afterSecond.stream().filter(row -> "SUPERSEDED".equals(row.get("status"))).count());
        assertEquals(Map.of(firstListing, 2, secondListing, 1), targetsByListing(afterSecond.stream()
                .filter(row -> "PENDING".equals(row.get("status"))).toList()));
        assertEquals(2, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM sync_jobs
                WHERE variant_id = ? AND status IN ('PENDING', 'PROCESSING', 'RETRY_PENDING')
                """, Integer.class, fixture.variantId()));
    }

    @Test
    void syncJobRetriesBoundedlyThenDeadLettersAndCanRecoverAfterFaultClear() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 5, ChannelListing.MappingStatus.VERIFIED);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "phase04 sync", null),
                "sync-seed-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);
        assertEquals("PENDING", jobStatus(jobId));
        assertEquals(5, jobTarget(jobId));
        assertEquals(2, jobMaxAttempts(jobId));

        simulatorAdminService.injectFault(channelId, listingId,
                new SimulatorFaultRequest("REFUSE", 10, 0));

        processJobsUntil(jobId, "RETRY_PENDING");
        assertEquals(1, jobAttempts(jobId));
        assertNotNull(jobLastError(jobId));
        assertEquals(0, simulatorStateService.getState(listingId).quantity());

        processJobsUntil(jobId, "DEAD_LETTER");
        assertEquals(2, jobAttempts(jobId));
        assertEquals("ERROR", syncStatus(listingId));
        assertTrue(jobEvidence(jobId).stream()
                .anyMatch(row -> "REFUSED".equals(row.get("status"))));

        simulatorAdminService.clearFault(channelId, listingId);
        SyncJobResponse retried = syncJobManagementService.retry(jobId);
        assertEquals("PENDING", retried.status());
        assertEquals(0, retried.attempts());

        processJobsUntil(jobId, "VERIFIED");
        assertEquals("VERIFIED", jobStatus(jobId));
        assertEquals(5, simulatorStateService.getState(listingId).quantity());
        assertEquals("SYNCED", syncStatus(listingId));
        Map<String, Object> job = jobRow(jobId);
        assertEquals(5, ((Number) job.get("sent_quantity")).intValue());
        assertEquals(5, ((Number) job.get("acknowledged_quantity")).intValue());
        assertEquals(5, ((Number) job.get("verified_quantity")).intValue());
        assertEquals(0, ((Number) job.get("remote_before")).intValue());
        assertEquals("simulator", job.get("adapter"));
        assertNotNull(job.get("idempotency_reference"));

        List<Map<String, Object>> evidence = jobEvidence(jobId);
        assertTrue(evidence.stream().anyMatch(row -> "VERIFIED".equals(row.get("status"))
                && ((Number) row.get("target_quantity")).intValue() == 5
                && ((Number) row.get("sent_quantity")).intValue() == 5
                && ((Number) row.get("acknowledged_quantity")).intValue() == 5
                && ((Number) row.get("verified_quantity")).intValue() == 5));
    }

    // ------------------------------------------------------------------
    // Reconciliation and fail-closed behaviour
    // ------------------------------------------------------------------

    @Test
    @WithMockUser(roles = "ADMIN")
    void reconciliationUsesSimulatorEvidenceAndQueuesACorrectionOnDrift() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 5, ChannelListing.MappingStatus.VERIFIED);
        simulatorStateService.setExternalStock(listingId, 5);

        ChannelSyncEvidenceResponse matched = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("VERIFIED", matched.status());
        assertEquals("RECONCILE", matched.kind());
        assertEquals("simulator", matched.adapter());
        assertEquals(5, matched.targetQuantity());
        assertEquals(5, matched.verifiedQuantity());
        assertEquals(5, matched.remoteAfter());
        assertEquals("SYNCED", syncStatus(listingId));

        simulatorAdminService.setStock(channelId, listingId, 3);
        ChannelSyncEvidenceResponse drift = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("DRIFT", drift.status());
        assertEquals(5, drift.targetQuantity());
        assertEquals(3, drift.verifiedQuantity());
        assertEquals(5, drift.remoteBefore());
        assertEquals(3, drift.remoteAfter());
        assertEquals("RECONCILIATION_DRIFT", drift.errorCode());
        assertEquals("OUT_OF_SYNC", syncStatus(listingId));
        assertNotNull(lastSyncError(listingId));

        List<Map<String, Object>> jobs = jdbcTemplate.queryForList("""
                SELECT id, status, target_quantity FROM sync_jobs
                WHERE listing_id = ? ORDER BY id DESC
                """, listingId);
        assertEquals("PENDING", jobs.getFirst().get("status"));
        assertEquals(5, ((Number) jobs.getFirst().get("target_quantity")).intValue());
        Long correctionId = ((Number) jobs.getFirst().get("id")).longValue();

        processJobsUntil(correctionId, "VERIFIED");
        assertEquals("VERIFIED", jobStatus(correctionId));
        assertEquals(5, simulatorStateService.getState(listingId).quantity());
        assertEquals("SYNCED", syncStatus(listingId));

        ListingSyncStatusResponse status = syncJobManagementService.getListingStatus(channelId, listingId);
        assertEquals(5, status.targetQuantity());
        assertEquals(5, status.sentQuantity());
        assertEquals(5, status.acknowledgedQuantity());
        assertEquals(5, status.verifiedQuantity());
        assertEquals("SYNCED", status.syncStatus());
        assertEquals("VERIFIED", status.mappingStatus());
        assertTrue(status.evidence().stream()
                .anyMatch(evidence -> "RECONCILE".equals(evidence.kind())
                        && "DRIFT".equals(evidence.status())));
        assertTrue(status.evidence().stream()
                .anyMatch(evidence -> "INVENTORY_SYNC".equals(evidence.kind())
                        && "VERIFIED".equals(evidence.status())));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void realChannelsRemainFailClosedForVerificationReconciliationAndSimulatorAdmin() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        Long channelId = channel("sandbox");
        Long listingId = listing(channelId, fixture.variantId(), 1, ChannelListing.MappingStatus.VERIFIED);

        ApiException reconcile = assertThrows(ApiException.class,
                () -> reconciliationService.reconcileListing(channelId, listingId));
        assertEquals(503, reconcile.getStatus().value());
        assertEquals(ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE, reconcile.getErrorCode());

        ApiException verify = assertThrows(ApiException.class,
                () -> channelService.verifyMapping(channelId, listingId, null));
        assertEquals(503, verify.getStatus().value());
        assertEquals(ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE, verify.getErrorCode());
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM channel_sync_evidence WHERE listing_id = ?", Integer.class, listingId));

        mockMvc.perform(get("/api/v1/channels/simulator/{channelId}/listings/{listingId}",
                        channelId, listingId))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("SIMULATOR_NOT_AVAILABLE"));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void mappingMustBeRegisteredAndVerifiedBeforeAllocationCanExecute() {
        Fixture fixture = fixture(5, 0, 0);
        Long channelId = channel("simulated");
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), "ext-" + UUID.randomUUID(),
                        fixture.sku(), "ext-variant-" + UUID.randomUUID()));
        assertEquals("REGISTERED", registered.mappingStatus());
        assertNull(registered.mappingVerifiedAt());
        assertEquals(0, registered.allocatedQuota());

        AllocationPlanResponse blocked = preview(fixture.sku(), targets(registered.id(), 1));
        assertFalse(blocked.canExecute());
        assertTrue(blocked.issues().isEmpty(), "the only allocated listing is explicitly present");
        assertTrue(blocked.items().getFirst().issues().stream()
                .anyMatch(issue -> issue.contains("Mapping chưa được xác minh")));
        ApiException confirm = assertThrows(ApiException.class,
                () -> allocationService.confirm(blocked.id(), "unverified-" + UUID.randomUUID()));
        assertEquals(ErrorCode.ALLOCATION_PLAN_BLOCKED, confirm.getErrorCode());

        ChannelListingResponse verified = channelService.verifyMapping(channelId, registered.id(), null);
        assertEquals("VERIFIED", verified.mappingStatus());
        assertNotNull(verified.mappingVerifiedAt());
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM channel_sync_evidence WHERE listing_id = ? AND kind = 'MAPPING_VERIFY' AND status = 'VERIFIED'",
                Integer.class, registered.id()) >= 1);

        AllocationPlanResponse allowed = preview(fixture.sku(), targets(registered.id(), 1));
        assertTrue(allowed.canExecute());
        assertTrue(allowed.items().getFirst().canExecute());
    }

    // ------------------------------------------------------------------
    // Phase 04.1 safety hardening (F01-F06)
    // ------------------------------------------------------------------

    @Test
    @WithMockUser(roles = "ADMIN")
    void increasesRecheckCoreVersionRevisionAndAtsBeforeEveryStep() {
        assertIncreaseBlockedAfterBump(fixture -> jdbcTemplate.update(
                "UPDATE inventory_balances SET version = version + 1 WHERE variant_id = ?",
                fixture.variantId()));
        assertIncreaseBlockedAfterBump(fixture -> jdbcTemplate.update(
                "UPDATE variant_allocation_states SET current_revision = current_revision + 1, "
                        + "next_revision = next_revision + 1 WHERE variant_id = ?",
                fixture.variantId()));
        assertIncreaseBlockedAfterBump(fixture -> jdbcTemplate.update(
                "UPDATE inventory_balances SET reserved = 6 WHERE variant_id = ?",
                fixture.variantId()));
    }

    @Test
    void syncTimeoutBecomesUnconfirmedAndOnlyReconciliationResolvesIt() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 5, ChannelListing.MappingStatus.VERIFIED);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "phase041 timeout", null),
                "timeout-seed-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);

        simulatorStateService.injectFault(listingId,
                com.octoflow.api.entity.SimulatorFault.FaultType.TIMEOUT_AFTER_WRITE, 1, 0);
        processJobsUntil(jobId, "UNCONFIRMED");

        assertEquals(5, simulatorStateService.getState(listingId).quantity(),
                "the simulator applied the write before timing out");
        assertEquals(5, quota(listingId), "an uncertain remote result must never change the allocation");
        assertEquals("ERROR", syncStatus(listingId));
        assertTrue(jobEvidence(jobId).stream().anyMatch(row -> "UNCONFIRMED".equals(row.get("status"))
                && "TIMEOUT".equals(row.get("error_code"))));
        assertTrue(reconciliationService.candidateListingIds().contains(listingId),
                "an unresolved job must make the listing a reconciliation candidate");

        BusinessRuleException retry = assertThrows(BusinessRuleException.class,
                () -> syncJobManagementService.retry(jobId));
        assertEquals(ErrorCode.SYNC_RETRY_NOT_ALLOWED, retry.getErrorCode());

        ChannelSyncEvidenceResponse observed = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("VERIFIED", observed.status());
        assertEquals("VERIFIED", jobStatus(jobId));
        assertEquals("SYNCED", syncStatus(listingId));
        assertTrue(jobEvidence(jobId).stream().anyMatch(row -> "VERIFIED".equals(row.get("status"))));
    }

    @Test
    void staleSyncCompletionIsAlwaysUnconfirmedOrSuperseded() throws Exception {
        assertStaleSyncCompletion(listingId -> jdbcTemplate.update("""
                UPDATE channel_listings
                SET allocated_quota = 3, target_allocation_revision = target_allocation_revision + 1
                WHERE id = ?
                """, listingId), 3);

        assertStaleSyncCompletion(listingId -> jdbcTemplate.update("""
                UPDATE channel_listings
                SET external_listing_id = ?, mapping_version = mapping_version + 1
                WHERE id = ?
                """, "remapped-" + UUID.randomUUID(), listingId), 2);
    }

    @Test
    void quotaZeroDriftIsReconciledAndQueuesAZeroCorrection() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);
        simulatorStateService.setExternalStock(listingId, 3);

        assertTrue(reconciliationService.candidateListingIds().contains(listingId),
                "a quota=0 listing with remote stock must still be reconciled");

        ChannelSyncEvidenceResponse observed = reconciliationService.reconcileListing(channelId, listingId);
        assertEquals("DRIFT", observed.status());
        assertEquals(0, observed.targetQuantity());
        assertEquals(3, observed.verifiedQuantity());
        assertEquals("OUT_OF_SYNC", syncStatus(listingId));

        Long correctionId = latestJobId(listingId);
        assertEquals("PENDING", jobStatus(correctionId));
        assertEquals(0, jobTarget(correctionId));

        processJobsUntil(correctionId, "VERIFIED");
        assertEquals(0, simulatorStateService.getState(listingId).quantity());
        assertEquals(0, quota(listingId));
        assertEquals("SYNCED", syncStatus(listingId));
    }

    @Test
    void oneExternalProductMayHostSeveralVariantsButOneExternalVariantOnlyOnce() {
        Fixture fixture = fixture(0, 0, 0);
        Long channelId = channel("simulated");
        String externalProductId = "catalog-" + UUID.randomUUID();
        String secondSku = addVariant(fixture, "P04-B");
        String thirdSku = addVariant(fixture, "P04-C");
        String fourthSku = addVariant(fixture, "P04-D");

        ChannelListingResponse first = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), externalProductId, fixture.sku(), "ext-var-1"));
        ChannelListingResponse second = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(secondSku, externalProductId, secondSku, "ext-var-2"));
        assertEquals(externalProductId, first.externalListingId());
        assertEquals(externalProductId, second.externalListingId());
        assertEquals(2, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM channel_listings
                WHERE channel_id = ? AND external_listing_id = ?
                """, Integer.class, channelId, externalProductId));

        ApiException duplicateVariant = assertThrows(ApiException.class, () -> channelService.registerMapping(
                channelId, new RegisterChannelMappingRequest(fourthSku,
                        "catalog-other-" + UUID.randomUUID(), fourthSku, "ext-var-2")));
        assertEquals(HttpStatus.CONFLICT, duplicateVariant.getStatus());
        assertEquals(ErrorCode.DATA_INTEGRITY_VIOLATION, duplicateVariant.getErrorCode());

        String standaloneProductId = "standalone-" + UUID.randomUUID();
        channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(thirdSku, standaloneProductId, thirdSku, null));
        ApiException duplicateProduct = assertThrows(ApiException.class, () -> channelService.registerMapping(
                channelId, new RegisterChannelMappingRequest(fourthSku, standaloneProductId, fourthSku, null)));
        assertEquals(HttpStatus.CONFLICT, duplicateProduct.getStatus());
        assertEquals(ErrorCode.DATA_INTEGRITY_VIOLATION, duplicateProduct.getErrorCode());
        assertEquals(1, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM channel_listings
                WHERE channel_id = ? AND external_listing_id = ?
                """, Integer.class, channelId, standaloneProductId));
    }

    @Test
    void staleVerificationIsRejectedAndUnsafeRemapsAreBlocked() {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        String externalListingId = "product-" + UUID.randomUUID();
        String externalVariantId = "variant-" + UUID.randomUUID();
        ChannelListingResponse registered = channelService.registerMapping(channelId,
                new RegisterChannelMappingRequest(fixture.sku(), externalListingId, fixture.sku(), externalVariantId));
        ChannelListingResponse verified = channelService.verifyMapping(channelId, registered.id(), null);
        assertEquals("VERIFIED", verified.mappingStatus());

        long mappingVersion = jdbcTemplate.queryForObject(
                "SELECT mapping_version FROM channel_listings WHERE id = ?", Long.class, registered.id());
        int mappingEvidence = mappingEvidenceCount(registered.id());

        ApiException stale = assertThrows(ApiException.class, () -> channelMappingRecorder.applyVerified(
                channelId, registered.id(), "simulator", mappingVersion - 1,
                externalListingId, externalVariantId, fixture.sku(),
                new ChannelInventoryAdapter.MappingSnapshot(fixture.sku(), externalVariantId, 0, 0)));
        assertEquals(HttpStatus.CONFLICT, stale.getStatus());
        assertEquals(ErrorCode.CONCURRENT_MODIFICATION, stale.getErrorCode());
        assertEquals(mappingEvidence, mappingEvidenceCount(registered.id()),
                "a rejected stale verification must not append verification evidence");

        jdbcTemplate.update("UPDATE channel_listings SET allocated_quota = 1 WHERE id = ?", registered.id());
        assertRemapBlocked(channelId, fixture.sku(), externalVariantId);

        jdbcTemplate.update("""
                UPDATE channel_listings SET allocated_quota = 0, sync_status = 'OUT_OF_SYNC' WHERE id = ?
                """, registered.id());
        assertRemapBlocked(channelId, fixture.sku(), externalVariantId);

        jdbcTemplate.update("UPDATE channel_listings SET sync_status = 'SYNCED' WHERE id = ?", registered.id());
        jdbcTemplate.update("""
                INSERT INTO sync_jobs (listing_id, channel_id, variant_id, target_quantity,
                                       core_version, allocation_revision, status, attempts,
                                       max_attempts, next_attempt_at)
                VALUES (?, ?, ?, 0, 0, 0, 'PENDING', 0, 8, clock_timestamp())
                """, registered.id(), channelId, fixture.variantId());
        assertRemapBlocked(channelId, fixture.sku(), externalVariantId);

        assertEquals(externalListingId, jdbcTemplate.queryForObject(
                "SELECT external_listing_id FROM channel_listings WHERE id = ?",
                String.class, registered.id()));
    }

    @Test
    void expiredWorkerCannotCompleteANewerClaimAndRetryRulesAreEnforced() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 2, ChannelListing.MappingStatus.VERIFIED);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "phase041 fencing", null),
                "fencing-seed-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);

        SyncJobProcessor.JobClaim older = claimJob(jobId);
        jdbcTemplate.update(
                "UPDATE sync_jobs SET lease_until = clock_timestamp() - interval '1 minute' WHERE id = ?", jobId);
        SyncJobProcessor.JobClaim newer = claimJob(jobId);
        assertTrue(newer.claimGeneration() > older.claimGeneration());

        syncJobProcessor.completeFailure(older, ChannelAdapterException.Kind.PROTOCOL, "late worker result");
        assertEquals("PROCESSING", jobStatus(jobId), "an expired claim must not complete the newer claim");
        assertNull(jobRow(jobId).get("last_error"));

        syncJobProcessor.releaseLease(older);
        assertNotNull(jdbcTemplate.queryForObject(
                "SELECT lease_owner FROM sync_jobs WHERE id = ?", String.class, jobId));
        syncJobProcessor.releaseLease(newer);
        assertNull(jdbcTemplate.queryForObject(
                "SELECT lease_owner FROM sync_jobs WHERE id = ?", String.class, jobId));
    }

    @Test
    void retryRejectsSupersededUnconfirmedAndStaleTargetJobs() throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 2, ChannelListing.MappingStatus.VERIFIED);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "retry seed 1", null),
                "retry-seed-1-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long replacedJob = latestJobId(listingId);

        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "retry seed 2", null),
                "retry-seed-2-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long currentJob = latestJobId(listingId);
        assertEquals("SUPERSEDED", jobStatus(replacedJob));
        assertEquals("PENDING", jobStatus(currentJob));

        BusinessRuleException superseded = assertThrows(BusinessRuleException.class,
                () -> syncJobManagementService.retry(replacedJob));
        assertEquals(ErrorCode.SYNC_RETRY_NOT_ALLOWED, superseded.getErrorCode());

        simulatorStateService.injectFault(listingId,
                com.octoflow.api.entity.SimulatorFault.FaultType.TIMEOUT_AFTER_WRITE, 1, 0);
        processJobsUntil(currentJob, "UNCONFIRMED");
        BusinessRuleException unconfirmed = assertThrows(BusinessRuleException.class,
                () -> syncJobManagementService.retry(currentJob));
        assertEquals(ErrorCode.SYNC_RETRY_NOT_ALLOWED, unconfirmed.getErrorCode());

        assertEquals("VERIFIED", reconciliationService.reconcileListing(channelId, listingId).status());
        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "retry seed 3", null),
                "retry-seed-3-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long deadLetterJob = latestJobId(listingId);
        simulatorAdminService.injectFault(channelId, listingId,
                new SimulatorFaultRequest("REFUSE", 10, 0));
        processJobsUntil(deadLetterJob, "DEAD_LETTER");
        simulatorAdminService.clearFault(channelId, listingId);

        jdbcTemplate.update("UPDATE channel_listings SET allocated_quota = 3 WHERE id = ?", listingId);
        BusinessRuleException staleTarget = assertThrows(BusinessRuleException.class,
                () -> syncJobManagementService.retry(deadLetterJob));
        assertEquals(ErrorCode.SYNC_RETRY_NOT_ALLOWED, staleTarget.getErrorCode());
    }

    @Test
    void simulatorAppliesSameReferenceOnceAndRejectsADifferentPayload() {
        Fixture fixture = fixture(0, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);

        SimulatorStateService.Snapshot first = simulatorStateService.applyWrite(listingId, 5, false, "ref-1");
        assertEquals(5, first.quantity());

        SimulatorStateService.Snapshot replay = simulatorStateService.applyWrite(listingId, 5, false, "ref-1");
        assertEquals(5, replay.quantity());
        assertEquals(first.version(), replay.version(), "same reference and payload must be a no-op");

        ChannelAdapterException conflict = assertThrows(ChannelAdapterException.class,
                () -> simulatorStateService.applyWrite(listingId, 6, false, "ref-1"));
        assertEquals(ChannelAdapterException.Kind.REFUSED, conflict.getKind());
        assertEquals(5, simulatorStateService.getState(listingId).quantity());

        simulatorStateService.setExternalStock(listingId, 4);
        SimulatorStateService.Snapshot afterExternalChange =
                simulatorStateService.applyWrite(listingId, 6, false, "ref-1");
        assertEquals(6, afterExternalChange.quantity(),
                "an external stock change invalidates the previous idempotency reference");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private AllocationPlanResponse preview(String sku, Map<Long, Integer> targets) {
        List<AllocationPreviewRequest.AllocationTargetRequest> items = targets.entrySet().stream()
                .map(entry -> new AllocationPreviewRequest.AllocationTargetRequest(
                        entry.getKey(), entry.getValue()))
                .toList();
        return allocationService.preview(new AllocationPreviewRequest(sku, items));
    }

    private AllocationPlanResponse preview(String sku) {
        return allocationService.preview(new AllocationPreviewRequest(sku, List.of()));
    }

    private Map<Long, Integer> targets(Long listingId, int quantity) {
        return Map.of(listingId, quantity);
    }

    private Fixture fixture(int onHand, int reserved, int safetyBuffer) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        String sku = "P04-" + suffix;
        Product product = new Product();
        product.setName("Phase 04 test " + suffix);
        product.setStatus(Product.Status.PUBLISHED);
        product = productRepository.saveAndFlush(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(sku);
        variant.setTitle("Phase 04 variant");
        variant.setPrice(1000L);
        variant = variantRepository.saveAndFlush(variant);

        jdbcTemplate.update("""
                INSERT INTO inventory_balances (variant_id, on_hand, reserved, safety_buffer)
                VALUES (?, ?, ?, ?)
                """, variant.getId(), onHand, reserved, safetyBuffer);
        return new Fixture(product.getId(), variant.getId(), sku);
    }

    private Long channel(String environment) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES (?, 'Phase 04 channel', ?, 'CONNECTED') RETURNING id
                """, Long.class, "p04-" + UUID.randomUUID(), environment);
    }

    private Long listing(Long channelId, Long variantId, int quota, ChannelListing.MappingStatus mappingStatus) {
        Timestamp verifiedAt = mappingStatus == ChannelListing.MappingStatus.VERIFIED
                ? Timestamp.from(Instant.now()) : null;
        return jdbcTemplate.queryForObject("""
                INSERT INTO channel_listings (
                    channel_id, variant_id, external_listing_id, external_sku, external_variant_id,
                    mapping_status, mapping_verified_at, active, allocated_quota, reported_stock,
                    sync_status, target_allocation_revision)
                VALUES (?, ?, ?, ?, NULL, ?, ?, TRUE, ?, 0, 'UNVERIFIED', 0)
                RETURNING id
                """, Long.class,
                channelId, variantId, "ext-" + UUID.randomUUID(), "EXT-" + UUID.randomUUID(),
                mappingStatus.name(), verifiedAt, quota);
    }

    private int quota(Long listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT allocated_quota FROM channel_listings WHERE id = ?", Integer.class, listingId);
    }

    private String syncStatus(Long listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT sync_status FROM channel_listings WHERE id = ?", String.class, listingId);
    }

    private String lastSyncError(Long listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT last_sync_error FROM channel_listings WHERE id = ?", String.class, listingId);
    }

    private void assertBalance(Fixture fixture, int onHand, int reserved, int safetyBuffer) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT on_hand, reserved, safety_buffer FROM inventory_balances WHERE variant_id = ?",
                fixture.variantId());
        assertEquals(onHand, ((Number) row.get("on_hand")).intValue());
        assertEquals(reserved, ((Number) row.get("reserved")).intValue());
        assertEquals(safetyBuffer, ((Number) row.get("safety_buffer")).intValue());
    }

    private String planStatus(Long planId) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM allocation_plans WHERE id = ?", String.class, planId);
    }

    private String itemStatus(Long planId, Long listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM allocation_plan_items WHERE plan_id = ? AND listing_id = ?",
                String.class, planId, listingId);
    }

    private List<Map<String, Object>> evidenceForPlan(Long planId) {
        return jdbcTemplate.queryForList("""
                SELECT kind, status, error_code, verified_quantity
                FROM channel_sync_evidence WHERE plan_id = ? ORDER BY observed_at ASC, id ASC
                """, planId);
    }

    private List<Map<String, Object>> jobsForVariant(Long variantId) {
        return jdbcTemplate.queryForList("""
                SELECT id, listing_id, status, target_quantity
                FROM sync_jobs WHERE variant_id = ? ORDER BY id ASC
                """, variantId);
    }

    private Map<Long, Integer> targetsByListing(List<Map<String, Object>> jobs) {
        return jobs.stream().collect(Collectors.toMap(
                row -> ((Number) row.get("listing_id")).longValue(),
                row -> ((Number) row.get("target_quantity")).intValue()));
    }

    private Long latestJobId(Long listingId) {
        return jdbcTemplate.queryForObject("""
                SELECT id FROM sync_jobs WHERE listing_id = ? ORDER BY id DESC LIMIT 1
                """, Long.class, listingId);
    }

    private Map<String, Object> jobRow(Long jobId) {
        return jdbcTemplate.queryForMap("""
                SELECT status, attempts, max_attempts, target_quantity, sent_quantity,
                       acknowledged_quantity, verified_quantity, remote_before, remote_after,
                       adapter, idempotency_reference, last_error
                FROM sync_jobs WHERE id = ?
                """, jobId);
    }

    private String jobStatus(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT status FROM sync_jobs WHERE id = ?", String.class, jobId);
    }

    private int jobAttempts(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT attempts FROM sync_jobs WHERE id = ?", Integer.class, jobId);
    }

    private int jobMaxAttempts(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT max_attempts FROM sync_jobs WHERE id = ?", Integer.class, jobId);
    }

    private int jobTarget(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT target_quantity FROM sync_jobs WHERE id = ?", Integer.class, jobId);
    }

    private String jobLastError(Long jobId) {
        return jdbcTemplate.queryForObject("SELECT last_error FROM sync_jobs WHERE id = ?", String.class, jobId);
    }

    private List<Map<String, Object>> jobEvidence(Long jobId) {
        return jdbcTemplate.queryForList("""
                SELECT status, target_quantity, sent_quantity, acknowledged_quantity,
                       verified_quantity, error_code
                FROM channel_sync_evidence WHERE job_id = ? ORDER BY id ASC
                """, jobId);
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
        for (int i = 0; i < 100; i++) {
            syncJobDispatchService.processDueJobs();
            if (expected.equals(jobStatus(jobId))) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("Sync job #" + jobId + " did not reach " + expected
                + "; last status was " + jobStatus(jobId));
    }

    private void assertIncreaseBlockedAfterBump(Consumer<Fixture> bump) {
        Fixture fixture = fixture(10, 0, 0);
        Long decreaseChannel = channel("simulated");
        Long increaseChannel = channel("simulated");
        Long decreaseListing = listing(decreaseChannel, fixture.variantId(), 5, ChannelListing.MappingStatus.VERIFIED);
        Long increaseListing = listing(increaseChannel, fixture.variantId(), 0, ChannelListing.MappingStatus.VERIFIED);
        simulatorStateService.setExternalStock(decreaseListing, 5);
        simulatorStateService.setExternalStock(increaseListing, 0);

        Map<Long, Integer> desired = new LinkedHashMap<>();
        desired.put(decreaseListing, 2);
        desired.put(increaseListing, 3);
        AllocationPlanResponse plan = preview(fixture.sku(), desired);
        allocationService.confirm(plan.id(), "budget-" + UUID.randomUUID());
        bump.accept(fixture);

        assertTrue(allocationExecutionService.processPlan(plan.id()));
        assertEquals("VERIFIED", itemStatus(plan.id(), decreaseListing),
                "decreases must keep running when only increases become unsafe");
        assertEquals(2, quota(decreaseListing));

        assertFalse(allocationExecutionService.processPlan(plan.id()),
                "the stale budget must block without executing another remote write");
        assertEquals("BLOCKED", planStatus(plan.id()));
        assertEquals("BLOCKED", itemStatus(plan.id(), increaseListing));
        assertEquals(0, quota(increaseListing));
        assertEquals(0, simulatorStateService.getState(increaseListing).quantity());
        assertEquals(2, simulatorStateService.getState(decreaseListing).quantity());
        assertTrue(evidenceForPlan(plan.id()).stream()
                .filter(row -> "ALLOCATION_INCREASE".equals(row.get("kind")))
                .anyMatch(row -> "ERROR".equals(row.get("status"))
                        && "ALLOCATION_BUDGET_STALE".equals(row.get("error_code"))));
    }

    private void assertStaleSyncCompletion(Consumer<Long> mutation, int expectedReplacementTarget) throws Exception {
        Fixture fixture = fixture(10, 0, 0);
        Long channelId = channel("simulated");
        Long listingId = listing(channelId, fixture.variantId(), 2, ChannelListing.MappingStatus.VERIFIED);
        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "phase041 stale", null),
                "stale-seed-" + UUID.randomUUID());
        dispatchOutboxUntilIdle(fixture.variantId());
        Long jobId = latestJobId(listingId);

        SyncJobProcessor.JobClaim claim = claimJob(jobId);
        SyncJobProcessor.SyncJobSnapshot snapshot = syncJobProcessor.prepare(claim);
        assertNotNull(snapshot);

        mutation.accept(listingId);
        syncJobProcessor.completeSuccess(snapshot, 2, 2, 2, 2);

        assertEquals("SUPERSEDED", jobStatus(jobId));
        assertTrue(jobEvidence(jobId).stream().anyMatch(row -> "UNCONFIRMED".equals(row.get("status"))
                && "STALE_AFTER_WRITE".equals(row.get("error_code"))));
        assertTrue(jobEvidence(jobId).stream().noneMatch(row -> "VERIFIED".equals(row.get("status"))),
                "a stale result must never become VERIFIED");

        Long replacementId = latestJobId(listingId);
        assertNotEquals(jobId, replacementId);
        assertEquals(expectedReplacementTarget, jobTarget(replacementId));
    }

    private SyncJobProcessor.JobClaim claimJob(Long jobId) throws Exception {
        for (int i = 0; i < 100; i++) {
            for (SyncJobProcessor.JobClaim claim : syncJobProcessor.claimDue(1000, 5)) {
                if (claim.jobId().equals(jobId)) {
                    return claim;
                }
            }
            Thread.sleep(10);
        }
        throw new AssertionError("Sync job #" + jobId + " could not be claimed");
    }

    private String addVariant(Fixture fixture, String label) {
        Product product = productRepository.findById(fixture.productId()).orElseThrow();
        String sku = "P04-" + UUID.randomUUID().toString()
                .replace("-", "").substring(0, 12).toUpperCase();
        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(sku);
        variant.setTitle(label);
        variant.setPrice(1000L);
        variantRepository.saveAndFlush(variant);
        return sku;
    }

    private void assertRemapBlocked(Long channelId, String sku, String externalVariantId) {
        BusinessRuleException blocked = assertThrows(BusinessRuleException.class,
                () -> channelService.registerMapping(channelId, new RegisterChannelMappingRequest(
                        sku, "remap-" + UUID.randomUUID(), sku, externalVariantId)));
        assertEquals(ErrorCode.MAPPING_REMAP_BLOCKED, blocked.getErrorCode());
    }

    private int mappingEvidenceCount(Long listingId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM channel_sync_evidence
                WHERE listing_id = ? AND kind = 'MAPPING_VERIFY'
                """, Integer.class, listingId);
    }

    private record Fixture(Long productId, Long variantId, String sku) {}
}
