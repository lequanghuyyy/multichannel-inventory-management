package com.octoflow.api.repository;

import com.octoflow.api.entity.IdempotencyRecord;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO idempotency_records
                (scope, idempotency_key, request_hash, status, expires_at, created_at, updated_at)
            VALUES (:scope, :key, :requestHash, 'PROCESSING', :expiresAt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (scope, idempotency_key) DO UPDATE
                SET request_hash = EXCLUDED.request_hash,
                    status = 'PROCESSING', response_status = NULL, response_body = NULL,
                    expires_at = EXCLUDED.expires_at, updated_at = CURRENT_TIMESTAMP
                WHERE idempotency_records.expires_at <= CURRENT_TIMESTAMP
            """, nativeQuery = true)
    int claim(@Param("scope") String scope,
              @Param("key") String key,
              @Param("requestHash") String requestHash,
              @Param("expiresAt") Instant expiresAt);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM IdempotencyRecord r WHERE r.scope = :scope AND r.idempotencyKey = :key")
    Optional<IdempotencyRecord> findForUpdate(@Param("scope") String scope, @Param("key") String key);

    @Modifying
    @Query(value = "DELETE FROM idempotency_records WHERE expires_at <= :now AND status = 'COMPLETED'", nativeQuery = true)
    int deleteExpiredCompleted(@Param("now") Instant now);
}
