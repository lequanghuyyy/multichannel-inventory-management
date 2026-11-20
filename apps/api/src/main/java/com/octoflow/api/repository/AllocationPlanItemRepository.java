package com.octoflow.api.repository;

import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface AllocationPlanItemRepository extends JpaRepository<AllocationPlanItem, Long> {

    List<AllocationPlanItem> findByPlanIdOrderByChannelIdAscIdAsc(Long planId);

    List<AllocationPlanItem> findByPlanIdAndStatusIn(Long planId,
                                                      Collection<AllocationPlanItem.Status> statuses);

    List<AllocationPlanItem> findByPlanIdAndDirectionAndStatusIn(
            Long planId,
            AllocationPlanItem.Direction direction,
            Collection<AllocationPlanItem.Status> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM AllocationPlanItem i WHERE i.id = :id")
    Optional<AllocationPlanItem> findByIdForUpdate(@Param("id") Long id);

    long countByPlanIdAndStatusIn(Long planId, Collection<AllocationPlanItem.Status> statuses);

    @Query("""
            SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END
            FROM AllocationPlanItem i, AllocationPlan p
            WHERE i.planId = p.id
              AND i.listingId = :listingId
              AND p.status = :planStatus
              AND i.status IN :itemStatuses
            """)
    boolean existsActiveForListing(@Param("listingId") Long listingId,
                                   @Param("planStatus") AllocationPlan.Status planStatus,
                                   @Param("itemStatuses") Collection<AllocationPlanItem.Status> itemStatuses);

    /**
     * True when the listing's current allocation target belongs to a plan that was blocked
     * before delivery. Such a target was never confirmed by the remote read-back, so it must
     * not be treated as a settled quota by automatic reconciliation.
     */
    @Query("""
            SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END
            FROM AllocationPlanItem i, AllocationPlan p
            WHERE i.planId = p.id
              AND i.listingId = :listingId
              AND p.allocationRevision = :allocationRevision
              AND p.status = :planStatus
            """)
    boolean existsForListingAtRevision(@Param("listingId") Long listingId,
                                       @Param("allocationRevision") long allocationRevision,
                                       @Param("planStatus") AllocationPlan.Status planStatus);
}
