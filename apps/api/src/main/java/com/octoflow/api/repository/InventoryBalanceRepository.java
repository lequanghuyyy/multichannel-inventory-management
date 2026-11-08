package com.octoflow.api.repository;

import com.octoflow.api.entity.InventoryBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface InventoryBalanceRepository extends JpaRepository<InventoryBalance, Long> {

    /**
     * Locks the balance row exclusively (SELECT ... FOR UPDATE) to prevent concurrency conflicts
     * and overselling during reservations, sales confirmations, and allocations.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM InventoryBalance b WHERE b.variantId = :variantId")
    Optional<InventoryBalance> findByVariantIdWithLock(@Param("variantId") Long variantId);

    Optional<InventoryBalance> findByVariantId(Long variantId);
}
