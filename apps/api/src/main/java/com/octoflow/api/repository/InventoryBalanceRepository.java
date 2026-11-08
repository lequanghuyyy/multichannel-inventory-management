package com.octoflow.api.repository;

import com.octoflow.api.entity.InventoryBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.Optional;

@Repository
public interface InventoryBalanceRepository extends JpaRepository<InventoryBalance, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO inventory_balances
                (variant_id, on_hand, reserved, safety_buffer, version, created_at, updated_at)
            VALUES (:variantId, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (variant_id) DO NOTHING
            """, nativeQuery = true)
    int ensureBalanceExists(@Param("variantId") Long variantId);

    /**
     * Locks the balance row exclusively (SELECT ... FOR UPDATE) to prevent concurrency conflicts
     * and overselling during reservations, sales confirmations, and allocations.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM InventoryBalance b WHERE b.variantId = :variantId")
    Optional<InventoryBalance> findByVariantIdWithLock(@Param("variantId") Long variantId);

    Optional<InventoryBalance> findByVariantId(Long variantId);

    /**
     * Guards catalog deletion even when historical side tables are empty: any non-zero physical,
     * reserved, or buffer quantity represents real stock that must not disappear with a product.
     */
    @Query("""
            SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END
            FROM InventoryBalance b
            WHERE b.variantId IN :variantIds
              AND (b.onHand <> 0 OR b.reserved <> 0 OR b.safetyBuffer <> 0)
            """)
    boolean existsWithNonZeroStock(@Param("variantIds") Collection<Long> variantIds);
}
