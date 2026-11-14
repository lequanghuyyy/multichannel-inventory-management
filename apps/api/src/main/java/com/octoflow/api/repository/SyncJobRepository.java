package com.octoflow.api.repository;

import com.octoflow.api.entity.SyncJob;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface SyncJobRepository extends JpaRepository<SyncJob, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM SyncJob j WHERE j.id = :id")
    Optional<SyncJob> findByIdForUpdate(@Param("id") Long id);

    @Query("SELECT j.listingId FROM SyncJob j WHERE j.id = :id")
    Long findListingIdById(@Param("id") Long id);

    List<SyncJob> findByListingIdAndStatusIn(Long listingId, Collection<SyncJob.Status> statuses);

    List<SyncJob> findByStatusInOrderByCreatedAtDescIdDesc(Collection<SyncJob.Status> statuses, Pageable pageable);

    List<SyncJob> findByListingIdOrderByCreatedAtDescIdDesc(Long listingId, Pageable pageable);

    List<SyncJob> findByStatusOrderByCreatedAtDescIdDesc(SyncJob.Status status, Pageable pageable);

    List<SyncJob> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    Optional<SyncJob> findFirstByListingIdOrderByCreatedAtDescIdDesc(Long listingId);

    boolean existsByOutboxEventIdAndListingId(Long outboxEventId, Long listingId);

    boolean existsByListingIdAndStatusIn(Long listingId, Collection<SyncJob.Status> statuses);

    boolean existsByListingIdAndStatusInAndIdNot(Long listingId, Collection<SyncJob.Status> statuses, Long id);

    long countByStatus(SyncJob.Status status);

    @Modifying
    @Query(value = """
            UPDATE sync_jobs
            SET status = 'PROCESSING',
                attempts = attempts + 1,
                claim_generation = claim_generation + 1,
                lease_owner = :owner,
                lease_until = :leaseUntil,
                last_attempt_at = clock_timestamp(),
                updated_at = clock_timestamp()
            WHERE id = :id
              AND (status IN ('PENDING', 'RETRY_PENDING')
                   OR (status = 'PROCESSING' AND (lease_until IS NULL OR lease_until < clock_timestamp())))
            """, nativeQuery = true)
    int markProcessing(@Param("id") Long id,
                       @Param("owner") String owner,
                       @Param("leaseUntil") Instant leaseUntil);

    @Query(value = "SELECT claim_generation FROM sync_jobs WHERE id = :id", nativeQuery = true)
    Long findClaimGeneration(@Param("id") Long id);

    @Modifying
    @Query(value = """
            UPDATE sync_jobs
            SET lease_owner = NULL,
                lease_until = NULL,
                updated_at = clock_timestamp()
            WHERE id = :id
              AND status = 'PROCESSING'
              AND lease_owner = :owner
              AND claim_generation = :generation
            """, nativeQuery = true)
    int releaseLease(@Param("id") Long id,
                     @Param("owner") String owner,
                     @Param("generation") long generation);

    @Query(value = """
            SELECT id FROM sync_jobs
            WHERE (status IN ('PENDING', 'RETRY_PENDING') AND next_attempt_at <= clock_timestamp())
               OR (status = 'PROCESSING' AND (lease_until IS NULL OR lease_until < clock_timestamp()))
            ORDER BY next_attempt_at ASC, id ASC
            LIMIT :batch
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Long> claimDueJobIds(@Param("batch") int batch);

    @Modifying
    @Query(value = """
            UPDATE sync_jobs
            SET status = 'SUPERSEDED',
                last_error = :reason,
                lease_owner = NULL,
                lease_until = NULL,
                updated_at = clock_timestamp()
            WHERE listing_id = :listingId
              AND status IN ('PENDING', 'RETRY_PENDING', 'PROCESSING')
            """, nativeQuery = true)
    int supersedeActiveForListing(@Param("listingId") Long listingId,
                                  @Param("reason") String reason);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE sync_jobs
            SET status = 'PENDING',
                attempts = 0,
                next_attempt_at = clock_timestamp(),
                lease_owner = NULL,
                lease_until = NULL,
                last_error = NULL,
                updated_at = clock_timestamp()
            WHERE id = :id
              AND status IN ('RETRY_PENDING', 'DEAD_LETTER', 'DRIFT', 'BLOCKED')
            """, nativeQuery = true)
    int resetForRetry(@Param("id") Long id);
}
