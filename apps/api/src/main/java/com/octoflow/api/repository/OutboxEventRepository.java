package com.octoflow.api.repository;

import com.octoflow.api.entity.OutboxEvent;
import jakarta.persistence.LockModeType;
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
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    @Query("SELECT e FROM OutboxEvent e WHERE e.status = 'PENDING' AND e.nextAttemptAt <= CURRENT_TIMESTAMP ORDER BY e.nextAttemptAt ASC, e.createdAt ASC")
    List<OutboxEvent> findPendingEvents(org.springframework.data.domain.Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM OutboxEvent e WHERE e.id = :id")
    Optional<OutboxEvent> findByIdForUpdate(@Param("id") Long id);

    /**
     * Claims ready events, including events whose previous worker lease expired. The lease is
     * written in the claim transaction before any fan-out work starts.
     */
    @Query(value = """
            SELECT id FROM outbox_events
            WHERE (status = 'PENDING' AND next_attempt_at <= clock_timestamp())
               OR (status = 'PROCESSING'
                   AND (lease_until IS NULL OR lease_until < clock_timestamp()))
            ORDER BY next_attempt_at ASC, id ASC
            LIMIT :batch
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Long> claimDueEventIds(@Param("batch") int batch);

    @Modifying
    @Query(value = """
            UPDATE outbox_events
            SET status = 'PROCESSING',
                locked_at = clock_timestamp(),
                locked_by = :owner,
                lease_until = :leaseUntil,
                updated_at = clock_timestamp()
            WHERE id IN (:ids)
              AND (status = 'PENDING'
                   OR (status = 'PROCESSING'
                       AND (lease_until IS NULL OR lease_until < clock_timestamp())))
            """, nativeQuery = true)
    int markProcessing(@Param("ids") Collection<Long> ids,
                       @Param("owner") String owner,
                       @Param("leaseUntil") Instant leaseUntil);
}
