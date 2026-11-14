package com.octoflow.api.repository;

import com.octoflow.api.entity.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") Long id);

    Optional<Order> findByOrderNumber(String orderNumber);

    Optional<Order> findByChannelIdAndExternalOrderId(Long channelId, String externalOrderId);

    @Query("""
            SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END
            FROM OrderItem i
            WHERE i.variantId IN :variantIds
            """)
    boolean existsByVariantIdIn(@Param("variantIds") Collection<Long> variantIds);

    /**
     * Returns the order's variant quantities without loading the Order entity. Payment
     * confirmation needs the variant ids before it can lock inventory balances, but loading the
     * managed Order first would put a stale PENDING entity in the persistence context while the
     * transaction waits for a concurrent confirmation.
     */
    @Query("""
            SELECT i.variantId AS variantId, SUM(i.quantity) AS quantity
            FROM OrderItem i
            WHERE i.order.id = :orderId
            GROUP BY i.variantId
            ORDER BY i.variantId
            """)
    List<VariantQuantity> findVariantQuantitiesByOrderId(@Param("orderId") Long orderId);

    /**
     * Serializes creation for one (channel, external order) identity. A unique index is the
     * durable backstop, but the advisory lock lets the service re-read an existing order and
     * return it without first reserving stock or translating a constraint violation.
     */
    @Query(value = "SELECT pg_advisory_xact_lock(:key)", nativeQuery = true)
    void lockExternalOrderIdentity(@Param("key") long key);

    /**
     * Candidates for the abandoned-hold sweep. The caller passes a timestamp read from the
     * PostgreSQL clock, and the processor re-checks the deadline after locking. The batch is
     * bounded and ordered by the deadline (then id) so a busy sweep is stable and predictable.
     */
    @Query("""
            SELECT o.id AS id FROM Order o
            WHERE o.source = :source
              AND o.status = :status
              AND o.paymentStatus = :paymentStatus
              AND o.holdExpiresAt IS NOT NULL
              AND o.holdExpiresAt <= :now
            ORDER BY o.holdExpiresAt ASC, o.id ASC
            """)
    List<ExpiredOrderCandidate> findExpiredOrderCandidates(@Param("source") Order.Source source,
                                                           @Param("status") Order.Status status,
                                                           @Param("paymentStatus") Order.PaymentStatus paymentStatus,
                                                           @Param("now") Instant now,
                                                           Pageable pageable);

    /**
     * Legacy POS orders created before V7 have no hold deadline. They are repaired in small
     * keyset-paged batches so an anomaly at the start of the table cannot starve later rows.
     */
    @Query("""
            SELECT o.id AS id FROM Order o
            WHERE o.source = :source
              AND o.status = :status
              AND o.paymentStatus = :paymentStatus
              AND o.holdExpiresAt IS NULL
              AND o.id > :afterId
            ORDER BY o.id ASC
            """)
    List<LegacyHoldCandidate> findLegacyPosHoldCandidates(@Param("source") Order.Source source,
                                                          @Param("status") Order.Status status,
                                                          @Param("paymentStatus") Order.PaymentStatus paymentStatus,
                                                          @Param("afterId") Long afterId,
                                                          Pageable pageable);

    /**
     * The database clock is read after inventory and order locks are held, so a transaction that
     * waited on a lock does not decide expiry from a stale application clock.
     */
    @Query(value = "SELECT clock_timestamp()", nativeQuery = true)
    java.sql.Timestamp databaseNow();

    interface VariantQuantity {
        Long getVariantId();

        Long getQuantity();
    }

    interface ExpiredOrderCandidate {
        Long getId();
    }

    interface LegacyHoldCandidate {
        Long getId();
    }
}
