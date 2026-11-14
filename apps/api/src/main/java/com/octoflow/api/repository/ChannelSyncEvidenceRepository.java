package com.octoflow.api.repository;

import com.octoflow.api.entity.ChannelSyncEvidence;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChannelSyncEvidenceRepository extends JpaRepository<ChannelSyncEvidence, Long> {

    List<ChannelSyncEvidence> findByListingIdOrderByObservedAtDescIdDesc(Long listingId, Pageable pageable);

    List<ChannelSyncEvidence> findByJobIdOrderByObservedAtDescIdDesc(Long jobId);

    List<ChannelSyncEvidence> findByPlanIdOrderByObservedAtDescIdDesc(Long planId);
}
