package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Drives allocation plans one item at a time. The processor is a separate bean so its
 * transactional boundaries stay real; adapter I/O runs under a per-listing advisory lock and
 * outside any database transaction.
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
        List<Long> planIds = processor.claimDuePlans(batchSize);
        int processed = 0;
        for (Long planId : planIds) {
            try {
                if (processPlan(planId)) {
                    processed++;
                }
            } catch (RuntimeException ex) {
                log.error("Allocation plan #{} failed unexpectedly: {}", planId, ex.getMessage(), ex);
                safeRelease(planId);
            }
        }
        return processed;
    }

    public boolean processPlan(Long planId) {
        AllocationExecutionProcessor.PlanAction action = processor.prepareNextAction(planId);
        if (action == null) {
            return false;
        }
        boolean acquired = listingLeaseService.tryWithLock(action.listingId(), () -> execute(action));
        if (!acquired) {
            // Another worker owns the listing. Release the plan lease so a later tick can retry.
            safeRelease(planId);
            return false;
        }
        return true;
    }

    private boolean execute(AllocationExecutionProcessor.PlanAction action) {
        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(action.channel());
        } catch (ChannelAdapterException ex) {
            processor.applyFailure(action, ex.getKind(), ex.getMessage());
            return true;
        }

        try {
            ChannelInventoryAdapter.RemoteStock before = adapter.readStock(action.channel(), action.listing());
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
            processor.applyFailure(action, ex.getKind(), ex.getMessage());
        } catch (RuntimeException ex) {
            processor.applyFailure(action, ChannelAdapterException.Kind.PROTOCOL,
                    "Unexpected adapter error: " + ex.getMessage());
        }
        return true;
    }

    private void safeRelease(Long planId) {
        try {
            processor.releaseLease(planId);
        } catch (RuntimeException ex) {
            log.warn("Unable to release allocation plan lease #{}: {}", planId, ex.getMessage());
        }
    }
}
