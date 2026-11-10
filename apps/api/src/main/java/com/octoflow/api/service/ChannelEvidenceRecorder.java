package com.octoflow.api.service;

import com.octoflow.api.entity.ChannelSyncEvidence;
import com.octoflow.api.repository.ChannelSyncEvidenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Writes append-only evidence for every delivery attempt and reconciliation observation.
 */
@Service
public class ChannelEvidenceRecorder {

    private final ChannelSyncEvidenceRepository repository;

    public ChannelEvidenceRecorder(ChannelSyncEvidenceRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public ChannelSyncEvidence record(Long listingId,
                                      Long jobId,
                                      Long planId,
                                      Long planItemId,
                                      String kind,
                                      String adapter,
                                      String status,
                                      Integer targetQuantity,
                                      Integer sentQuantity,
                                      Integer acknowledgedQuantity,
                                      Integer verifiedQuantity,
                                      Integer remoteBefore,
                                      Integer remoteAfter,
                                      String errorCode,
                                      String errorMessage,
                                      String idempotencyReference) {
        ChannelSyncEvidence evidence = new ChannelSyncEvidence();
        evidence.setListingId(listingId);
        evidence.setJobId(jobId);
        evidence.setPlanId(planId);
        evidence.setPlanItemId(planItemId);
        evidence.setKind(kind);
        evidence.setAdapter(adapter == null ? "unknown" : adapter);
        evidence.setStatus(status);
        evidence.setTargetQuantity(targetQuantity);
        evidence.setSentQuantity(sentQuantity);
        evidence.setAcknowledgedQuantity(acknowledgedQuantity);
        evidence.setVerifiedQuantity(verifiedQuantity);
        evidence.setRemoteBefore(remoteBefore);
        evidence.setRemoteAfter(remoteAfter);
        evidence.setErrorCode(errorCode);
        evidence.setErrorMessage(truncate(errorMessage, 500));
        evidence.setIdempotencyReference(idempotencyReference);
        evidence.setObservedAt(Instant.now());
        return repository.save(evidence);
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
