package com.octoflow.api.repository;

import com.octoflow.api.entity.InventoryLedger;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Collection;

@Repository
public interface InventoryLedgerRepository extends JpaRepository<InventoryLedger, Long> {

    List<InventoryLedger> findByVariantIdOrderByCreatedAtDesc(Long variantId, Pageable pageable);

    boolean existsByVariantIdIn(Collection<Long> variantIds);
}
