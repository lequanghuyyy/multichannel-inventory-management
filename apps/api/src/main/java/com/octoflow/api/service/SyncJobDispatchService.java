package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Supervises durable sync jobs. A job sends an absolute target, reads the remote value back,
 * and only becomes VERIFIED when that independent read matches the target.
 */
@Service
public class SyncJobDispatchService {

    private static final Logger log = LoggerFactory.getLogger(SyncJobDispatchService.class);

    private final SyncJobProcessor processor;
    private final ListingLeaseService listingLeaseService;
    private final ChannelAdapterRouter adapterRouter;
    private final int batchSize;
    private final long leaseSeconds;

    public SyncJobDispatchService(SyncJobProcessor processor,
                                  ListingLeaseService listingLeaseService,
                                  ChannelAdapterRouter adapterRouter,
                                  @Value("${app.sync.job-batch-size:50}") int batchSize,
                                  @Value("${app.sync.lease-seconds:30}") long leaseSeconds) {
        this.processor = processor;
        this.listingLeaseService = listingLeaseService;
        this.adapterRouter = adapterRouter;
        this.batchSize = Math.max(1, batchSize);
        this.leaseSeconds = Math.max(1, leaseSeconds);
    }

    public int processDueJobs() {
        List<Long> jobIds = processor.claimDue(batchSize, leaseSeconds);
        int processed = 0;
        for (Long jobId : jobIds) {
            try {
                if (processJob(jobId)) {
                    processed++;
                }
            } catch (RuntimeException ex) {
                log.error("Sync job #{} failed unexpectedly: {}", jobId, ex.getMessage(), ex);
                try {
                    processor.completeFailure(jobId, ChannelAdapterException.Kind.PROTOCOL,
                            "Unexpected sync worker error: " + ex.getMessage());
                } catch (RuntimeException nested) {
                    log.error("Unable to record sync job failure #{}: {}", jobId, nested.getMessage(), nested);
                }
            }
        }
        return processed;
    }

    public boolean processJob(Long jobId) {
        SyncJobProcessor.SyncJobSnapshot snapshot = processor.prepare(jobId);
        if (snapshot == null) {
            return false;
        }
        boolean acquired = listingLeaseService.tryWithLock(snapshot.listingId(), () -> execute(snapshot));
        if (!acquired) {
            processor.releaseLease(jobId);
            return false;
        }
        return true;
    }

    private boolean execute(SyncJobProcessor.SyncJobSnapshot snapshot) {
        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(snapshot.channel());
        } catch (ChannelAdapterException ex) {
            processor.completeFailure(snapshot.jobId(), ex.getKind(), ex.getMessage());
            return true;
        }
        try {
            ChannelInventoryAdapter.RemoteStock before = adapter.readStock(snapshot.channel(), snapshot.listing());
            ChannelInventoryAdapter.DeliveryReceipt receipt = adapter.writeStock(
                    snapshot.channel(), snapshot.listing(), snapshot.targetQuantity(),
                    snapshot.idempotencyReference());
            ChannelInventoryAdapter.RemoteStock after = adapter.readStock(snapshot.channel(), snapshot.listing());
            // completeSuccess compares the read-back value with the target and records DRIFT instead
            // of claiming VERIFIED when they differ.
            processor.completeSuccess(snapshot, before.quantity(),
                    receipt.sentQuantity(), receipt.acknowledgedQuantity(), after.quantity());
        } catch (ChannelAdapterException ex) {
            processor.completeFailure(snapshot.jobId(), ex.getKind(), ex.getMessage());
        } catch (RuntimeException ex) {
            processor.completeFailure(snapshot.jobId(), ChannelAdapterException.Kind.PROTOCOL,
                    "Unexpected adapter error: " + ex.getMessage());
        }
        return true;
    }
}
