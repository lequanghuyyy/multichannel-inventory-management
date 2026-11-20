package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Drives allocation plans one item at a time. The processor is a separate bean so its
 * transactional boundaries stay real; adapter I/O runs under a per-listing advisory lock and
 * outside any database transaction. The lock is the same one used by sync job dispatch and
 * reconciliation, so no two flows write the same listing concurrently.
 */
@Service
public class AllocationExecutionService {

    private static final Logger log = LoggerFactory.getLogger(AllocationExecutionService.class);

    private final AllocationExecutionProcessor processor;
    private final ListingLeaseService listingLeaseService;
    private final ChannelAdapterRouter adapterRouter;
    private final int batchSize;

    public AllocationExecutionService(AllocationExecutionProcessor processor,
                                      ListingLeaseService listingLeaseService,
                                      ChannelAdapterRouter adapterRouter,
                                      @Value("${app.sync.allocation-batch-size:25}") int batchSize) {
        this.processor = processor;
        this.listingLeaseService = listingLeaseService;
        this.adapterRouter = adapterRouter;
        this.batchSize = Math.max(1, batchSize);
    }

    public int processDuePlans() {
        List<AllocationExecutionProcessor.PlanClaim> claims = processor.claimDuePlans(batchSize);
        int processed = 0;
        for (AllocationExecutionProcessor.PlanClaim claim : claims) {
            try {
                if (processPlan(claim)) {
                    processed++;
                }
            } catch (RuntimeException ex) {
                log.error("Allocation plan #{} failed unexpectedly: {}", claim.planId(), ex.getMessage(), ex);
                safeRelease(claim);
            }
        }
        return processed;
    }

    public boolean processPlan(Long planId) {
        return processor.claimPlan(planId).map(this::processPlan).orElse(false);
    }

    public boolean processPlan(AllocationExecutionProcessor.PlanClaim claim) {
        AllocationExecutionProcessor.PlanAction action = processor.prepareNextAction(claim);
        if (action == null) {
            return false;
        }
        Optional<Boolean> result = listingLeaseService.tryCallWithLock(action.listingId(),
                () -> execute(action));
        if (result.isEmpty()) {
            // Another worker owns the listing. Release only this claim so a later tick can retry.
            safeRelease(claim);
            return false;
        }
        return result.get();
    }

    private boolean execute(AllocationExecutionProcessor.PlanAction action) {
        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(action.channel());
        } catch (ChannelAdapterException ex) {
            processor.applyFailure(action, ex.getKind(), ex.reasonCodeOrKind(), ex.getMessage(), false);
            return true;
        }

        boolean writeAttempted = false;
        try {
            ChannelInventoryAdapter.RemoteStock before = adapter.readStock(action.channel(), action.listing());
            if (adapter.requiresVerifiedStockBaseline()) {
                Integer baseline = action.baselineQuantity();
                if (baseline == null) {
                    processor.applyFailure(action, ChannelAdapterException.Kind.UNAVAILABLE,
                            "NO_STOCK_BASELINE",
                            "No verified remote stock baseline exists for this listing; reconcile before allocating.",
                            false);
                    return true;
                }
                if (before.quantity() != baseline) {
                    processor.applyPreWriteDrift(action, before.quantity(), baseline);
                    return true;
                }
            }
            writeAttempted = true;
            ChannelInventoryAdapter.DeliveryReceipt receipt = adapter.writeStock(
                    action.channel(), action.listing(), action.targetQuantity(), action.idempotencyReference());
            ChannelInventoryAdapter.RemoteStock after = adapter.readStock(action.channel(), action.listing());
            if (after.quantity() != action.targetQuantity()) {
                throw new ChannelAdapterException(ChannelAdapterException.Kind.PROTOCOL,
                        "Read-back quantity " + after.quantity() + " does not match target "
                                + action.targetQuantity() + ".");
            }
            processor.applySuccess(action, before.quantity(),
                    receipt.sentQuantity(), receipt.acknowledgedQuantity(), after.quantity());
        } catch (ChannelAdapterException ex) {
            processor.applyFailure(action, ex.getKind(), ex.reasonCodeOrKind(), ex.getMessage(), writeAttempted);
        } catch (RuntimeException ex) {
            processor.applyFailure(action, ChannelAdapterException.Kind.PROTOCOL,
                    ChannelAdapterException.Kind.PROTOCOL.name(),
                    "Unexpected adapter error: " + ex.getMessage(), writeAttempted);
        }
        return true;
    }

    private void safeRelease(AllocationExecutionProcessor.PlanClaim claim) {
        try {
            processor.releaseLease(claim);
        } catch (RuntimeException ex) {
            log.warn("Unable to release allocation plan lease #{}: {}", claim.planId(), ex.getMessage());
        }
    }
}
