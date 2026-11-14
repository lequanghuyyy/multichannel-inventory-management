package com.octoflow.api.repository;

import com.octoflow.api.entity.VariantUpdateAudit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface VariantUpdateAuditRepository extends JpaRepository<VariantUpdateAudit, Long> {

    List<VariantUpdateAudit> findByVariantIdOrderByChangedAtDesc(Long variantId);

    boolean existsByVariantIdIn(Collection<Long> variantIds);
}
