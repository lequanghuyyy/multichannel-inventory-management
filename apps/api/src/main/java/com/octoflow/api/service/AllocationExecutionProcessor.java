package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.AllocationPlanRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Executes one allocation plan step per transaction. Adapter I/O happens between the prepare
 * and apply transactions, never while a database transaction is open. A plan is only completed
 * when every item has a verified read-back; any blocked decrease keeps all increases pending.
 */
@Service
public class AllocationExecutionProcessor {

    private final AllocationPlanRepository planRepository;
    private final AllocationPlanItemRepository itemRepository;
    private final ChannelListingRepository listingRepository;
    private final ChannelRepository channelRepository;
    private final ChannelDeliveryEligibility eligibility;
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
                                        ChannelRepository channelRepository,
                                        ChannelDeliveryEligibility eligibility,
                                        ChannelEvidenceRecorder evidenceRecorder,
                                        SyncEventBroadcaster broadcaster,
                                        @Value("${app.sync.allocation-max-attempts:5}") int maxAttempts,
                                        @Value("${app.sync.lease-seconds:30}") long leaseSeconds,
                                        @Value("${app.sync.retry-base-ms:500}") long retryBaseMs,
                                        @Value("${app.sync.retry-max-ms:60000}") long retryMaxMs) {
        this.planRepository = planRepository;
        this.itemRepository = itemRepository;
        this.listingRepository = listingRepository;
        this.channelRepository = channelRepository;
        this.eligibility = eligibility;
        this.evidenceRecorder = evidenceRecorder;
        this.broadcaster = broadcaster;
        this.workerId = "allocation-" + UUID.randomUUID();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.leaseSeconds = Math.max(1, leaseSeconds);
        this.retryBaseMs = Math.max(1, retryBaseMs);
        this.retryMaxMs = Math.max(retryBaseMs, retryMaxMs);
    }

    public record PlanAction(Long planId,
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
                             int attempt) {}

    @Transactional
    public List<Long> claimDuePlans(int batch) {
        List<Long> ids = planRepository.claimDuePlanIds(Math.max(1, batch));
        if (!ids.isEmpty()) {
            planRepository.leasePlans(ids, workerId, Instant.now().plusSeconds(leaseSeconds));
        }
        return ids;
    }

    @Transactional
    public PlanAction prepareNextAction(Long planId) {
        AllocationPlan plan = planRepository.findByIdForUpdate(planId).orElse(null);
        if (plan == null || plan.getStatus() != AllocationPlan.Status.APPLYING) {
            return null;
        }

        List<AllocationPlanItem> items = itemRepository.findByPlanIdOrderByChannelIdAscIdAsc(planId);
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
                planRepository.releaseLease(planId);
                return null;
            }
            return prepareItem(plan, due);
        }

        List<AllocationPlanItem> decreases = items.stream()
                .filter(item -> item.getDirection() == AllocationPlanItem.Direction.DECREASE)
                .toList();
        if (decreases.stream().anyMatch(item -> item.getStatus() != AllocationPlanItem.Status.VERIFIED)) {
            // A decrease is blocked or otherwise unresolved. No increase may run.
            if (decreases.stream().anyMatch(item -> item.getStatus() == AllocationPlanItem.Status.BLOCKED)) {
                blockPlan(plan, "Có kênh giảm quota chưa được xác minh.");
            } else {
                planRepository.releaseLease(planId);
            }
            return null;
        }

        List<AllocationPlanItem> pendingIncreases = pending(items, AllocationPlanItem.Direction.INCREASE);
        if (!pendingIncreases.isEmpty()) {
            AllocationPlanItem due = firstDue(pendingIncreases);
            if (due == null) {
                planRepository.releaseLease(planId);
                return null;
            }
            return prepareItem(plan, due);
        }

        if (changed || items.stream().allMatch(item -> item.getStatus() == AllocationPlanItem.Status.VERIFIED)) {
            finishPlan(plan, items);
        } else {
            planRepository.releaseLease(planId);
        }
        return null;
    }

    private PlanAction prepareItem(AllocationPlan plan, AllocationPlanItem item) {
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
                item.getAttempts());
    }

    @Transactional
    public void applySuccess(PlanAction action, int remoteBefore, int sent, int acknowledged, int verified) {
        AllocationPlan plan = planRepository.findByIdForUpdate(action.planId()).orElse(null);
        if (plan == null || plan.getStatus() != AllocationPlan.Status.APPLYING) {
            return;
        }
        AllocationPlanItem item = itemRepository.findByIdForUpdate(action.itemId()).orElse(null);
        if (item == null || item.getStatus() != AllocationPlanItem.Status.PENDING
                && item.getStatus() != AllocationPlanItem.Status.RETRY_PENDING) {
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

        ChannelListing listing = listingRepository.findByIdForUpdate(item.getListingId()).orElse(null);
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
                "simulator",
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
        if (items.stream().anyMatch(row -> row.getStatus() == AllocationPlanItem.Status.BLOCKED)) {
            blockPlan(plan, "Có item bị chặn trong kế hoạch.");
        } else if (items.stream().allMatch(row -> row.getStatus() == AllocationPlanItem.Status.VERIFIED)) {
            finishPlan(plan, items);
        } else {
            planRepository.releaseLease(plan.getId());
        }
        broadcaster.broadcastAfterCommit("ALLOCATION_STATE_CHANGED", Map.of(
                "plan_id", plan.getId(),
                "item_id", item.getId(),
                "listing_id", item.getListingId(),
                "status", item.getStatus().name(),
                "refresh_required", true));
    }

    @Transactional
    public void applyFailure(PlanAction action, ChannelAdapterException.Kind kind, String message) {
        AllocationPlan plan = planRepository.findByIdForUpdate(action.planId()).orElse(null);
        if (plan == null || plan.getStatus() != AllocationPlan.Status.APPLYING) {
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
                "simulator",
                evidenceStatus,
                item.getProposedQuota(),
                item.getSentQuantity(),
                item.getAcknowledgedQuantity(),
                item.getVerifiedQuantity(),
                item.getRemoteBefore(),
                item.getRemoteAfter(),
                kind.name(),
                safeMessage,
                action.idempotencyReference());

        if (blocked) {
            blockPlan(plan, "Kênh #" + action.channelId() + ": " + safeMessage);
        } else {
            plan.setLastError(safeMessage);
            planRepository.save(plan);
            planRepository.releaseLease(plan.getId());
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
    public void releaseLease(Long planId) {
        planRepository.releaseLease(planId);
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
                "simulator",
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

    private Channel snapshotChannel(Channel channel) {
        Channel copy = new Channel();
        copy.setId(channel.getId());
        copy.setCode(channel.getCode());
        copy.setName(channel.getName());
        copy.setEnvironment(channel.getEnvironment());
        copy.setStatus(channel.getStatus());
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
