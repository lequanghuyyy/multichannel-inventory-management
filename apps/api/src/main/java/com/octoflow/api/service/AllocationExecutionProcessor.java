package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.VariantAllocationState;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.AllocationPlanRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.VariantAllocationStateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Executes one allocation plan step per transaction. Adapter I/O happens between the prepare
 * and apply transactions, never while a database transaction is open. A plan is only completed
 * when every item has a verified read-back. Before every INCREASE the current core version,
 * allocation revision and available-to-sell budget are re-read; if the plan is no longer safe,
 * remaining increases are blocked while already selected DECREASE steps keep running.
 */
@Service
public class AllocationExecutionProcessor {

    private final AllocationPlanRepository planRepository;
    private final AllocationPlanItemRepository itemRepository;
    private final ChannelListingRepository listingRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final VariantAllocationStateRepository stateRepository;
    private final ChannelDeliveryEligibility eligibility;
    private final ChannelAdapterRouter adapterRouter;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final SyncEventBroadcaster broadcaster;
    private final String workerId;
    private final int maxAttempts;
    private final long leaseSeconds;
    private final long retryBaseMs;
    private final long retryMaxMs;

    public AllocationExecutionProcessor(AllocationPlanRepository planRepository,
                                        AllocationPlanItemRepository itemRepository,
                                        ChannelListingRepository listingRepository,
                                        InventoryBalanceRepository balanceRepository,
                                        VariantAllocationStateRepository stateRepository,
                                        ChannelDeliveryEligibility eligibility,
                                        ChannelAdapterRouter adapterRouter,
                                        ChannelEvidenceRecorder evidenceRecorder,
                                        SyncEventBroadcaster broadcaster,
                                        @Value("${app.sync.allocation-max-attempts:5}") int maxAttempts,
                                        @Value("${app.sync.lease-seconds:30}") long leaseSeconds,
                                        @Value("${app.sync.retry-base-ms:500}") long retryBaseMs,
                                        @Value("${app.sync.retry-max-ms:60000}") long retryMaxMs) {
        this.planRepository = planRepository;
        this.itemRepository = itemRepository;
        this.listingRepository = listingRepository;
        this.balanceRepository = balanceRepository;
        this.stateRepository = stateRepository;
        this.eligibility = eligibility;
        this.adapterRouter = adapterRouter;
        this.evidenceRecorder = evidenceRecorder;
        this.broadcaster = broadcaster;
        this.workerId = "allocation-" + UUID.randomUUID();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.leaseSeconds = Math.max(1, leaseSeconds);
        this.retryBaseMs = Math.max(1, retryBaseMs);
        this.retryMaxMs = Math.max(retryBaseMs, retryMaxMs);
    }

    public record PlanClaim(Long planId, long claimGeneration) {}

    public record PlanAction(Long planId,
                             long claimGeneration,
                             Long itemId,
                             Long listingId,
                             Long channelId,
                             Long variantId,
                             AllocationPlanItem.Direction direction,
                             int targetQuantity,
                             String idempotencyReference,
                             Channel channel,
                             ChannelListing listing,
                             long allocationRevision,
                             long mappingVersion,
                             String externalListingId,
                             String externalVariantId,
                             int attempt) {}

    @Transactional
    public List<PlanClaim> claimDuePlans(int batch) {
        List<Long> ids = planRepository.claimDuePlanIds(Math.max(1, batch));
        List<PlanClaim> claims = new ArrayList<>();
        Instant leaseUntil = Instant.now().plusSeconds(leaseSeconds);
        for (Long id : ids) {
            claim(id, leaseUntil).ifPresent(claims::add);
        }
        return claims;
    }

    /**
     * Claims one plan directly. Used by the supervisor when it already selected the plan and by
     * tests that drive a single plan.
     */
    @Transactional
    public Optional<PlanClaim> claimPlan(Long planId) {
        return claim(planId, Instant.now().plusSeconds(leaseSeconds));
    }

    private Optional<PlanClaim> claim(Long planId, Instant leaseUntil) {
        if (planRepository.leasePlan(planId, workerId, leaseUntil) != 1) {
            return Optional.empty();
        }
        Long generation = planRepository.findClaimGeneration(planId);
        return generation == null ? Optional.empty() : Optional.of(new PlanClaim(planId, generation));
    }

    @Transactional
    public PlanAction prepareNextAction(PlanClaim claim) {
        AllocationPlan plan = planRepository.findByIdForUpdate(claim.planId()).orElse(null);
        if (!ownedAndApplying(plan, claim)) {
            return null;
        }

        List<AllocationPlanItem> items = itemRepository.findByPlanIdOrderByChannelIdAscIdAsc(claim.planId());
        boolean changed = false;
        for (AllocationPlanItem item : items) {
            if (item.getDirection() == AllocationPlanItem.Direction.NONE
                    && item.getStatus() == AllocationPlanItem.Status.PENDING) {
                item.setStatus(AllocationPlanItem.Status.VERIFIED);
                item.setVerifiedAt(Instant.now());
                itemRepository.save(item);
                changed = true;
            }
        }

        AllocationPlanItem blocked = items.stream()
                .filter(item -> item.getStatus() == AllocationPlanItem.Status.BLOCKED)
                .findFirst().orElse(null);
        if (blocked != null) {
            blockPlan(plan, "Item #" + blocked.getId() + " đã bị chặn: " + blocked.getLastError());
            return null;
        }

        List<AllocationPlanItem> pendingDecreases = pending(items, AllocationPlanItem.Direction.DECREASE);
        if (!pendingDecreases.isEmpty()) {
            AllocationPlanItem due = firstDue(pendingDecreases);
            if (due == null) {
                releaseOwnLease(plan, claim);
                return null;
            }
            return prepareItem(plan, claim, due);
        }

        List<AllocationPlanItem> decreases = items.stream()
                .filter(item -> item.getDirection() == AllocationPlanItem.Direction.DECREASE)
                .toList();
        if (decreases.stream().anyMatch(item -> item.getStatus() != AllocationPlanItem.Status.VERIFIED)) {
            // A decrease is blocked or otherwise unresolved. No increase may run.
            if (decreases.stream().anyMatch(item -> item.getStatus() == AllocationPlanItem.Status.BLOCKED)) {
                blockPlan(plan, "Có kênh giảm quota chưa được xác minh.");
            } else {
                releaseOwnLease(plan, claim);
            }
            return null;
        }

        List<AllocationPlanItem> pendingIncreases = pending(items, AllocationPlanItem.Direction.INCREASE);
        if (!pendingIncreases.isEmpty()) {
            String stale = increaseBudgetIssue(plan);
            if (stale != null) {
                blockPendingIncreases(plan, items, stale, "ALLOCATION_BUDGET_STALE");
                return null;
            }
            AllocationPlanItem due = firstDue(pendingIncreases);
            if (due == null) {
                releaseOwnLease(plan, claim);
                return null;
            }
            return prepareItem(plan, claim, due);
        }

        if (changed || items.stream().allMatch(item -> item.getStatus() == AllocationPlanItem.Status.VERIFIED)) {
            finishPlan(plan, items);
        } else {
            releaseOwnLease(plan, claim);
        }
        return null;
    }

    private PlanAction prepareItem(AllocationPlan plan, PlanClaim claim, AllocationPlanItem item) {
        if (item.getAttempts() >= maxAttempts) {
            blockItemAndPlan(plan, item, "Đã vượt số lần thử tối đa (" + maxAttempts + ").",
                    ChannelAdapterException.Kind.TIMEOUT.name());
            return null;
        }

        ChannelListing listing = listingRepository.findById(item.getListingId()).orElse(null);
        if (listing == null) {
            blockItemAndPlan(plan, item, "Listing không còn tồn tại.", "PREFLIGHT");
            return null;
        }
        if (!listing.getVariant().getId().equals(plan.getVariantId())) {
            blockItemAndPlan(plan, item, "Listing không còn thuộc SKU của kế hoạch.", "PREFLIGHT");
            return null;
        }
        List<String> issues = eligibility.issues(listing);
        if (!issues.isEmpty()) {
            blockItemAndPlan(plan, item, String.join(" ", issues), "PREFLIGHT");
            return null;
        }
        Channel channel = eligibility.loadChannel(listing);
        if (channel == null) {
            blockItemAndPlan(plan, item, "Không tìm thấy kênh.", "PREFLIGHT");
            return null;
        }

        item.setAttempts(item.getAttempts() + 1);
        item.setNextAttemptAt(null);
        itemRepository.save(item);

        String reference = "alloc-item:" + item.getId() + ":plan:" + plan.getAllocationRevision()
                + ":target:" + item.getProposedQuota();
        return new PlanAction(
                plan.getId(),
                claim.claimGeneration(),
                item.getId(),
                listing.getId(),
                channel.getId(),
                plan.getVariantId(),
                item.getDirection(),
                item.getProposedQuota(),
                reference,
                snapshotChannel(channel),
                snapshotListing(listing, channel),
                plan.getAllocationRevision(),
                listing.getMappingVersion(),
                listing.getExternalListingId(),
                listing.getExternalVariantId(),
                item.getAttempts());
    }

    @Transactional
    public void applySuccess(PlanAction action, int remoteBefore, int sent, int acknowledged, int verified) {
        AllocationPlan plan = planRepository.findByIdForUpdate(action.planId()).orElse(null);
        if (!ownedAndApplying(plan, new PlanClaim(action.planId(), action.claimGeneration()))) {
            return;
        }
        AllocationPlanItem item = itemRepository.findByIdForUpdate(action.itemId()).orElse(null);
        if (item == null || item.getStatus() != AllocationPlanItem.Status.PENDING
                && item.getStatus() != AllocationPlanItem.Status.RETRY_PENDING) {
            return;
        }

        ChannelListing listing = listingRepository.findByIdForUpdate(item.getListingId()).orElse(null);
        if (listing == null) {
            blockItemAndPlan(plan, item, "Listing không còn tồn tại sau khi ghi.", "PREFLIGHT");
            return;
        }
        if (mappingChanged(action, listing)) {
            evidenceRecorder.record(listing.getId(), null, plan.getId(), item.getId(),
                    "ALLOCATION_" + item.getDirection().name(), adapterName(action.channel()), "UNCONFIRMED",
                    item.getProposedQuota(), sent, acknowledged, verified, remoteBefore, verified,
                    "MAPPING_CHANGED_DURING_WRITE",
                    "Mapping identity changed while the allocation step was running.", action.idempotencyReference());
            blockItemAndPlan(plan, item,
                    "Mapping đã thay đổi trong lúc ghi; kết quả remote cần đối soát.",
                    "MAPPING_CHANGED_DURING_WRITE");
            return;
        }

        item.setStatus(AllocationPlanItem.Status.VERIFIED);
        item.setSentQuantity(sent);
        item.setAcknowledgedQuantity(acknowledged);
        item.setVerifiedQuantity(verified);
        item.setRemoteBefore(remoteBefore);
        item.setRemoteAfter(verified);
        item.setVerifiedAt(Instant.now());
        item.setLastError(null);
        item.setNextAttemptAt(null);
        itemRepository.save(item);

        if (listing != null && item.getDirection() != AllocationPlanItem.Direction.NONE) {
            listing.setAllocatedQuota(item.getProposedQuota());
            listing.setReportedStock(verified);
            listing.setSentQuantity(sent);
            listing.setAcknowledgedQuantity(acknowledged);
            listing.setVerifiedQuantity(verified);
            listing.setLastVerifiedAt(Instant.now());
            listing.setSyncStatus(verified == item.getProposedQuota()
                    ? ChannelListing.SyncStatus.SYNCED : ChannelListing.SyncStatus.OUT_OF_SYNC);
            listing.setLastSyncError(verified == item.getProposedQuota()
                    ? null : "Read-back quantity differs from the allocation target.");
            listing.setTargetAllocationRevision(plan.getAllocationRevision());
            listingRepository.save(listing);
        }

        evidenceRecorder.record(listing != null ? listing.getId() : item.getListingId(),
                null,
                plan.getId(),
                item.getId(),
                "ALLOCATION_" + item.getDirection().name(),
                adapterName(action.channel()),
                "VERIFIED",
                item.getProposedQuota(),
                sent,
                acknowledged,
                verified,
                remoteBefore,
                verified,
                null,
                null,
                action.idempotencyReference());

        List<AllocationPlanItem> items = itemRepository.findByPlanIdOrderByChannelIdAscIdAsc(plan.getId());
        if (item.getDirection() == AllocationPlanItem.Direction.INCREASE && publishedTotalExceedsAts(plan)) {
            // A sale or reservation landed while the adapter was running. The write itself is
            // verified, but no further increase may be published against the smaller budget.
            listing.setSyncStatus(ChannelListing.SyncStatus.OUT_OF_SYNC);
            listing.setLastSyncError("ATS dropped below the published allocation total; reconciliation required.");
            listingRepository.save(listing);
            blockPendingIncreases(plan, items,
                    "ATS hiện tại thấp hơn tổng quota đã công bố; cần đối soát và giảm tồn.",
                    "ALLOCATION_ATS_STALE");
        } else if (items.stream().anyMatch(row -> row.getStatus() == AllocationPlanItem.Status.BLOCKED)) {
            blockPlan(plan, "Có item bị chặn trong kế hoạch.");
        } else if (items.stream().allMatch(row -> row.getStatus() == AllocationPlanItem.Status.VERIFIED)) {
            finishPlan(plan, items);
        } else {
            releaseOwnLease(plan, new PlanClaim(action.planId(), action.claimGeneration()));
        }
        broadcaster.broadcastAfterCommit("ALLOCATION_STATE_CHANGED", Map.of(
                "plan_id", plan.getId(),
                "item_id", item.getId(),
                "listing_id", item.getListingId(),
                "status", item.getStatus().name(),
                "refresh_required", true));
    }

    @Transactional
    public void applyFailure(PlanAction action, ChannelAdapterException.Kind kind,
                             String errorCode, String message) {
        AllocationPlan plan = planRepository.findByIdForUpdate(action.planId()).orElse(null);
        if (!ownedAndApplying(plan, new PlanClaim(action.planId(), action.claimGeneration()))) {
            return;
        }
        AllocationPlanItem item = itemRepository.findByIdForUpdate(action.itemId()).orElse(null);
        if (item == null || item.getStatus() != AllocationPlanItem.Status.PENDING
                && item.getStatus() != AllocationPlanItem.Status.RETRY_PENDING) {
            return;
        }

        String safeMessage = truncate(message, 500);
        item.setLastError(safeMessage);
        boolean blocked = kind == ChannelAdapterException.Kind.UNAVAILABLE || item.getAttempts() >= maxAttempts;
        if (blocked) {
            item.setStatus(AllocationPlanItem.Status.BLOCKED);
            item.setNextAttemptAt(null);
        } else {
            item.setStatus(AllocationPlanItem.Status.RETRY_PENDING);
            item.setNextAttemptAt(Instant.now().plusMillis(backoffMs(item.getAttempts())));
        }
        itemRepository.save(item);

        String evidenceStatus = kind == ChannelAdapterException.Kind.TIMEOUT ? "UNCONFIRMED"
                : kind == ChannelAdapterException.Kind.REFUSED ? "REFUSED" : "ERROR";
        evidenceRecorder.record(action.listingId(),
                null,
                plan.getId(),
                item.getId(),
                "ALLOCATION_" + item.getDirection().name(),
                adapterName(action.channel()),
                evidenceStatus,
                item.getProposedQuota(),
                item.getSentQuantity(),
                item.getAcknowledgedQuantity(),
                item.getVerifiedQuantity(),
                item.getRemoteBefore(),
                item.getRemoteAfter(),
                errorCode,
                safeMessage,
                action.idempotencyReference());

        if (blocked) {
            blockPlan(plan, "Kênh #" + action.channelId() + ": " + safeMessage);
        } else {
            plan.setLastError(safeMessage);
            planRepository.save(plan);
            releaseOwnLease(plan, new PlanClaim(action.planId(), action.claimGeneration()));
        }
        broadcaster.broadcastAfterCommit("ALLOCATION_STATE_CHANGED", Map.of(
                "plan_id", plan.getId(),
                "item_id", item.getId(),
                "listing_id", action.listingId(),
                "status", item.getStatus().name(),
                "uncertain", kind == ChannelAdapterException.Kind.TIMEOUT,
                "refresh_required", true));
    }

    @Transactional
    public void releaseLease(PlanClaim claim) {
        planRepository.releaseLease(claim.planId(), workerId, claim.claimGeneration());
    }

    private boolean ownedAndApplying(AllocationPlan plan, PlanClaim claim) {
        return plan != null
                && plan.getStatus() == AllocationPlan.Status.APPLYING
                && plan.getClaimGeneration() == claim.claimGeneration()
                && workerId.equals(plan.getLeaseOwner());
    }

    /**
     * Re-reads the live budget before any INCREASE. Locks are taken in plan -> balance -> state
     * order, matching confirm, so concurrent POS/reservation writes cannot be missed by the
     * budget decision.
     */
    private String increaseBudgetIssue(AllocationPlan plan) {
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(plan.getVariantId()).orElse(null);
        if (balance == null) {
            return "Không đọc được số dư tồn kho hiện tại.";
        }
        if (plan.getCoreVersion() == null || !plan.getCoreVersion().equals(balance.getVersion())) {
            return "Core version tồn kho đã thay đổi kể từ lúc confirm; dừng các bước tăng quota.";
        }
        VariantAllocationState state = stateRepository.findByVariantIdWithLock(plan.getVariantId()).orElse(null);
        if (state == null || state.getCurrentRevision() != plan.getAllocationRevision()) {
            return "Allocation revision đã thay đổi kể từ lúc confirm; dừng các bước tăng quota.";
        }
        if (plan.getTotalTarget() > balance.getAvailableToSell()) {
            return "ATS hiện tại " + balance.getAvailableToSell()
                    + " thấp hơn tổng quota kế hoạch " + plan.getTotalTarget()
                    + "; dừng các bước tăng quota.";
        }
        return null;
    }

    private boolean publishedTotalExceedsAts(AllocationPlan plan) {
        // Plain read: applySuccess already holds the listing row; locking the balance here would
        // invert the plan -> balance -> listing order used by confirm.
        return balanceRepository.findByVariantId(plan.getVariantId())
                .map(balance -> plan.getTotalTarget() > balance.getAvailableToSell())
                .orElse(false);
    }

    private boolean mappingChanged(PlanAction action, ChannelListing listing) {
        return listing.getMappingVersion() != action.mappingVersion()
                || !Objects.equals(listing.getExternalListingId(), action.externalListingId())
                || !Objects.equals(listing.getExternalVariantId(), action.externalVariantId());
    }

    private void blockPendingIncreases(AllocationPlan plan, List<AllocationPlanItem> items,
                                       String reason, String errorCode) {
        for (AllocationPlanItem item : items) {
            if (item.getDirection() != AllocationPlanItem.Direction.INCREASE) {
                continue;
            }
            if (item.getStatus() != AllocationPlanItem.Status.PENDING
                    && item.getStatus() != AllocationPlanItem.Status.RETRY_PENDING) {
                continue;
            }
            item.setStatus(AllocationPlanItem.Status.BLOCKED);
            item.setLastError(truncate(reason, 500));
            item.setNextAttemptAt(null);
            itemRepository.save(item);
            evidenceRecorder.record(item.getListingId(), null, plan.getId(), item.getId(),
                    "ALLOCATION_INCREASE", adapterName(item.getListingId()), "ERROR", item.getProposedQuota(),
                    item.getSentQuantity(), item.getAcknowledgedQuantity(), item.getVerifiedQuantity(),
                    item.getRemoteBefore(), item.getRemoteAfter(), errorCode, reason, null);
        }
        blockPlan(plan, reason);
    }

    private List<AllocationPlanItem> pending(List<AllocationPlanItem> items,
                                             AllocationPlanItem.Direction direction) {
        return items.stream()
                .filter(item -> item.getDirection() == direction)
                .filter(item -> item.getStatus() == AllocationPlanItem.Status.PENDING
                        || item.getStatus() == AllocationPlanItem.Status.RETRY_PENDING)
                .toList();
    }

    private AllocationPlanItem firstDue(List<AllocationPlanItem> items) {
        Instant now = Instant.now();
        return items.stream()
                .filter(item -> item.getNextAttemptAt() == null || !item.getNextAttemptAt().isAfter(now))
                .findFirst().orElse(null);
    }

    private void finishPlan(AllocationPlan plan, List<AllocationPlanItem> items) {
        plan.setStatus(AllocationPlan.Status.COMPLETED);
        plan.setCompletedAt(Instant.now());
        plan.setLastError(null);
        plan.setLeaseOwner(null);
        plan.setLeaseUntil(null);
        planRepository.save(plan);
        broadcaster.broadcastAfterCommit("ALLOCATION_COMPLETED", Map.of(
                "plan_id", plan.getId(),
                "variant_id", plan.getVariantId(),
                "status", plan.getStatus().name(),
                "verified_items", items.size(),
                "refresh_required", true));
    }

    private void blockPlan(AllocationPlan plan, String reason) {
        plan.setStatus(AllocationPlan.Status.BLOCKED);
        plan.setLastError(truncate(reason, 1000));
        plan.setLeaseOwner(null);
        plan.setLeaseUntil(null);
        planRepository.save(plan);
        broadcaster.broadcastAfterCommit("ALLOCATION_BLOCKED", Map.of(
                "plan_id", plan.getId(),
                "variant_id", plan.getVariantId(),
                "status", plan.getStatus().name(),
                "refresh_required", true));
    }

    private void blockItemAndPlan(AllocationPlan plan, AllocationPlanItem item, String reason, String errorCode) {
        item.setStatus(AllocationPlanItem.Status.BLOCKED);
        item.setLastError(truncate(reason, 500));
        item.setNextAttemptAt(null);
        itemRepository.save(item);
        evidenceRecorder.record(item.getListingId(),
                null,
                plan.getId(),
                item.getId(),
                "ALLOCATION_" + item.getDirection().name(),
                adapterName(item.getListingId()),
                "ERROR",
                item.getProposedQuota(),
                item.getSentQuantity(),
                item.getAcknowledgedQuantity(),
                item.getVerifiedQuantity(),
                item.getRemoteBefore(),
                item.getRemoteAfter(),
                errorCode,
                reason,
                null);
        blockPlan(plan, reason);
    }

    private void releaseOwnLease(AllocationPlan plan, PlanClaim claim) {
        planRepository.releaseLease(plan.getId(), workerId, claim.claimGeneration());
    }

    /** Evidence label for the connector even when the write is blocked before routing. */
    private String adapterName(Channel channel) {
        return channel == null ? "none" : adapterRouter.adapterName(channel);
    }

    private String adapterName(Long listingId) {
        ChannelListing listing = listingId == null ? null
                : listingRepository.findById(listingId).orElse(null);
        return listing == null || listing.getChannel() == null
                ? "none" : adapterRouter.adapterName(listing.getChannel());
    }

    private Channel snapshotChannel(Channel channel) {
        Channel copy = new Channel();
        copy.setId(channel.getId());
        copy.setCode(channel.getCode());
        copy.setName(channel.getName());
        copy.setEnvironment(channel.getEnvironment());
        copy.setStatus(channel.getStatus());
        // Adapter I/O runs outside this transaction, so the snapshot must carry the same
        // connection proof that eligibility saw. Without it every real connector is blocked.
        copy.setConnectorName(channel.getConnectorName());
        copy.setConnectorVersion(channel.getConnectorVersion());
        copy.setConnectionVerifiedAt(channel.getConnectionVerifiedAt());
        copy.setConnectionProductsRead(channel.isConnectionProductsRead());
        copy.setConnectionAuthMode(channel.getConnectionAuthMode());
        return copy;
    }

    private ChannelListing snapshotListing(ChannelListing listing, Channel channel) {
        ChannelListing copy = new ChannelListing();
        copy.setId(listing.getId());
        copy.setExternalListingId(listing.getExternalListingId());
        copy.setExternalSku(listing.getExternalSku());
        copy.setExternalVariantId(listing.getExternalVariantId());
        copy.setChannel(snapshotChannel(channel));
        ProductVariant variant = new ProductVariant();
        variant.setId(listing.getVariant().getId());
        copy.setVariant(variant);
        copy.setAllocatedQuota(listing.getAllocatedQuota());
        copy.setMappingStatus(listing.getMappingStatus());
        return copy;
    }

    private long backoffMs(int attempts) {
        int exponent = Math.min(Math.max(attempts - 1, 0), 20);
        long value = retryBaseMs * (1L << exponent);
        return Math.min(value, retryMaxMs);
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
