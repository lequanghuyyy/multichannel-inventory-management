package com.octoflow.api.repository;

import com.octoflow.api.entity.VariantAllocationState;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VariantAllocationStateRepository extends JpaRepository<VariantAllocationState, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO variant_allocation_states
                (variant_id, current_revision, next_revision, created_at, updated_at)
            VALUES (:variantId, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (variant_id) DO NOTHING
            """, nativeQuery = true)
    int ensureExists(@Param("variantId") Long variantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM VariantAllocationState s WHERE s.variantId = :variantId")
    Optional<VariantAllocationState> findByVariantIdWithLock(@Param("variantId") Long variantId);

    Optional<VariantAllocationState> findByVariantId(Long variantId);
}
