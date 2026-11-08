package com.octoflow.api.repository;

import com.octoflow.api.entity.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") Long id);

    Optional<Order> findByOrderNumber(String orderNumber);

    Optional<Order> findByChannelIdAndExternalOrderId(Long channelId, String externalOrderId);

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

    interface VariantQuantity {
        Long getVariantId();

        Long getQuantity();
    }
}
