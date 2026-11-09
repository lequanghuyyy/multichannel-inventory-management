package com.octoflow.api.repository;

import com.octoflow.api.entity.ProductVariant;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    Optional<ProductVariant> findBySku(String sku);

    /**
     * Resolves a SKU to its current product/variant identity without loading a managed entity.
     * Checkout must not keep a stale variant in the persistence context while it waits for the
     * catalog row locks; the locked re-read is the only source of price, SKU, and currency.
     */
    @Query("""
            SELECT v.id AS variantId, v.product.id AS productId, v.sku AS sku
            FROM ProductVariant v
            WHERE v.sku = :sku
            """)
    Optional<VariantIdentity> findIdentityBySku(@Param("sku") String sku);

    boolean existsBySku(String sku);

    List<ProductVariant> findAllByProduct_Id(Long productId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT v FROM ProductVariant v WHERE v.id = :id")
    Optional<ProductVariant> findByIdForUpdate(@Param("id") Long id);

    interface VariantIdentity {
        Long getVariantId();

        Long getProductId();

        String getSku();
    }
}
