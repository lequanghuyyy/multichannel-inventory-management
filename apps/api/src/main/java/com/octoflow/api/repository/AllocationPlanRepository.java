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

    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM allocation_plans p
                LEFT JOIN variant_allocation_states s ON s.variant_id = p.variant_id
                WHERE p.variant_id = :variantId
                  AND (p.status = 'APPLYING'
                       OR (p.status = 'BLOCKED' AND p.allocation_revision = s.current_revision)))
            """, nativeQuery = true)
    boolean hasUnresolvedCurrentAllocation(@Param("variantId") Long variantId);

    /**
     * Blocked plans that still own a blocked item for this listing at the listing's current
     * allocation revision. Older plans are deliberately excluded: a newer confirmed target must
     * never be rolled back by recovering a historical plan.
     */
    @Query(value = """
            SELECT DISTINCT p.id
            FROM allocation_plans p
            JOIN allocation_plan_items i ON i.plan_id = p.id
            WHERE p.status = 'BLOCKED'
              AND p.allocation_revision = :allocationRevision
              AND i.listing_id = :listingId
              AND i.status = 'BLOCKED'
            ORDER BY p.id DESC
            """, nativeQuery = true)
    List<Long> findBlockedPlanIdsForListingAtRevision(@Param("listingId") Long listingId,
                                                      @Param("allocationRevision") long allocationRevision);

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
