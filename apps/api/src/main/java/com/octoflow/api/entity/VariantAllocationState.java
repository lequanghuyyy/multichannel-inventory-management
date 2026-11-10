package com.octoflow.api.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "variant_allocation_states")
public class VariantAllocationState extends BaseEntity {

    @Id
    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "current_revision", nullable = false)
    private long currentRevision;

    @Column(name = "next_revision", nullable = false)
    private long nextRevision = 1L;

    public Long getVariantId() { return variantId; }
    public void setVariantId(Long variantId) { this.variantId = variantId; }
    public long getCurrentRevision() { return currentRevision; }
    public void setCurrentRevision(long currentRevision) { this.currentRevision = currentRevision; }
    public long getNextRevision() { return nextRevision; }
    public void setNextRevision(long nextRevision) { this.nextRevision = nextRevision; }
}
