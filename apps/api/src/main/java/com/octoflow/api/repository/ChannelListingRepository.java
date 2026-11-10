package com.octoflow.api.repository;

import com.octoflow.api.entity.ChannelListing;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChannelListingRepository extends JpaRepository<ChannelListing, Long> {

    List<ChannelListing> findByChannelId(Long channelId);

    List<ChannelListing> findByVariantId(Long variantId);

    List<ChannelListing> findByVariantIdAndActiveTrue(Long variantId);

    List<ChannelListing> findByVariantIdAndAllocatedQuotaGreaterThan(Long variantId, int allocatedQuota);

    List<ChannelListing> findByActiveTrueAndMappingStatusAndAllocatedQuotaGreaterThanOrderByLastVerifiedAtAscIdAsc(
            ChannelListing.MappingStatus mappingStatus, int allocatedQuota);

    @Query("""
            SELECT l.id FROM ChannelListing l
            WHERE l.active = true
              AND l.mappingStatus = :mappingStatus
              AND l.allocatedQuota > 0
            ORDER BY COALESCE(l.lastVerifiedAt, l.createdAt) ASC, l.id ASC
            """)
    List<Long> findReconciliationCandidateIds(@Param("mappingStatus") ChannelListing.MappingStatus mappingStatus,
                                              Pageable pageable);

    Optional<ChannelListing> findByChannelIdAndId(Long channelId, Long id);

    @Query("""
            SELECT l FROM ChannelListing l
            JOIN FETCH l.channel
            JOIN FETCH l.variant
            WHERE l.channel.id = :channelId AND l.id = :id
            """)
    Optional<ChannelListing> findDetailedByChannelIdAndId(@Param("channelId") Long channelId,
                                                          @Param("id") Long id);

    @Query("""
            SELECT l FROM ChannelListing l
            JOIN FETCH l.channel
            JOIN FETCH l.variant
            WHERE l.id = :id
            """)
    Optional<ChannelListing> findDetailedById(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM ChannelListing l WHERE l.channel.id = :channelId AND l.id = :id")
    Optional<ChannelListing> findByChannelIdAndIdForUpdate(@Param("channelId") Long channelId,
                                                           @Param("id") Long id);

    Optional<ChannelListing> findByChannelIdAndVariantId(Long channelId, Long variantId);

    boolean existsByVariantIdIn(Collection<Long> variantIds);

    boolean existsByChannelIdAndExternalListingIdAndMappingStatusIn(
            Long channelId, String externalListingId, Collection<ChannelListing.MappingStatus> statuses);

    boolean existsByChannelIdAndExternalListingIdAndIdNotAndMappingStatusIn(
            Long channelId, String externalListingId, Long id, Collection<ChannelListing.MappingStatus> statuses);

    boolean existsByChannelIdAndExternalVariantId(Long channelId, String externalVariantId);

    boolean existsByChannelIdAndExternalVariantIdAndIdNot(Long channelId, String externalVariantId, Long id);

    Optional<ChannelListing> findByChannelIdAndExternalVariantId(Long channelId, String externalVariantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM ChannelListing l WHERE l.id = :id")
    Optional<ChannelListing> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            SELECT l FROM ChannelListing l
            WHERE l.active = true
              AND l.mappingStatus = 'VERIFIED'
              AND l.allocatedQuota > 0
            ORDER BY COALESCE(l.lastVerifiedAt, l.createdAt) ASC, l.id ASC
            """)
    List<ChannelListing> findReconciliationCandidates(Pageable pageable);

    List<ChannelListing> findByMappingStatusAndActiveTrue(ChannelListing.MappingStatus mappingStatus);
}
