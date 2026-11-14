package com.octoflow.api.repository;

import com.octoflow.api.entity.AllocationPlan;
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
public interface AllocationPlanRepository extends JpaRepository<AllocationPlan, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM AllocationPlan p WHERE p.id = :id")
    Optional<AllocationPlan> findByIdForUpdate(@Param("id") Long id);

    List<AllocationPlan> findByVariantIdOrderByCreatedAtDescIdDesc(Long variantId);

    List<AllocationPlan> findByStatusInOrderByCreatedAtDescIdDesc(Collection<AllocationPlan.Status> statuses);

    Optional<AllocationPlan> findFirstByVariantIdAndStatusOrderByCreatedAtDescIdDesc(
            Long variantId, AllocationPlan.Status status);

    boolean existsByVariantIdAndStatus(Long variantId, AllocationPlan.Status status);

    /**
     * Claims due plans for one short lease window. The row lock is released before any adapter is
     * contacted; the lease in the row is what makes a crashed worker recoverable.
     */
    @Query(value = """
            SELECT id FROM allocation_plans
            WHERE status = 'APPLYING'
              AND (lease_until IS NULL OR lease_until < clock_timestamp())
            ORDER BY updated_at ASC, id ASC
            LIMIT :batch
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Long> claimDuePlanIds(@Param("batch") int batch);

    @Modifying
    @Query(value = """
            UPDATE allocation_plans
            SET lease_owner = :owner,
                lease_until = :leaseUntil,
                claim_generation = claim_generation + 1,
                updated_at = clock_timestamp()
            WHERE id = :id
              AND status = 'APPLYING'
              AND (lease_until IS NULL OR lease_until < clock_timestamp())
            """, nativeQuery = true)
    int leasePlan(@Param("id") Long id,
                  @Param("owner") String owner,
                  @Param("leaseUntil") Instant leaseUntil);

    @Query(value = "SELECT claim_generation FROM allocation_plans WHERE id = :id", nativeQuery = true)
    Long findClaimGeneration(@Param("id") Long id);

    @Modifying
    @Query(value = """
            UPDATE allocation_plans
            SET lease_owner = NULL,
                lease_until = NULL,
                updated_at = clock_timestamp()
            WHERE id = :id
              AND status = 'APPLYING'
              AND lease_owner = :owner
              AND claim_generation = :generation
            """, nativeQuery = true)
    int releaseLease(@Param("id") Long id,
                     @Param("owner") String owner,
                     @Param("generation") long generation);

    @Modifying
    @Query(value = """
            UPDATE allocation_plans
            SET status = 'SUPERSEDED',
                last_error = :reason,
                lease_owner = NULL,
                lease_until = NULL,
                updated_at = clock_timestamp()
            WHERE variant_id = :variantId
              AND id <> :keepId
              AND status = 'PROJECTED'
            """, nativeQuery = true)
    int supersedeProjectedPlans(@Param("variantId") Long variantId,
                                @Param("keepId") Long keepId,
                                @Param("reason") String reason);
}
