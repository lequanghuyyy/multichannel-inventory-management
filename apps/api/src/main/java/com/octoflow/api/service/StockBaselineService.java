package com.octoflow.api.service;

import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ChannelSyncEvidence;
import com.octoflow.api.repository.ChannelSyncEvidenceRepository;
import org.springframework.stereotype.Service;

/**
 * The quantity a real connector last proved to be present on the channel. Only VERIFIED evidence
 * may become a baseline: a reconciliation observation marked DRIFT describes what the store held,
 * not a quantity OctoFlow delivered, and must never authorise overwriting it.
 */
@Service
public class StockBaselineService {

    private final ChannelSyncEvidenceRepository evidenceRepository;

    public StockBaselineService(ChannelSyncEvidenceRepository evidenceRepository) {
        this.evidenceRepository = evidenceRepository;
    }

    /**
     * Returns the last independently verified remote quantity, or {@code null} when the listing
     * has never been verified. The listing column is only trusted while the listing is SYNCED;
     * otherwise the append-only evidence is the source of truth.
     */
    public Integer baselineFor(ChannelListing listing) {
        if (listing == null || listing.getId() == null) {
            return null;
        }
        Integer fromEvidence = evidenceRepository
                .findFirstByListingIdAndStatusAndVerifiedQuantityIsNotNullOrderByObservedAtDescIdDesc(
                        listing.getId(), "VERIFIED")
                .map(ChannelSyncEvidence::getVerifiedQuantity)
                .orElse(null);
        if (fromEvidence != null) {
            return fromEvidence;
        }
        if (listing.getSyncStatus() == ChannelListing.SyncStatus.SYNCED
                && listing.getVerifiedQuantity() != null) {
            return listing.getVerifiedQuantity();
        }
        return null;
    }
}
