package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "variant_update_audit")
public class VariantUpdateAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "from_sku", nullable = false, length = 64)
    private String fromSku;

    @Column(name = "to_sku", nullable = false, length = 64)
    private String toSku;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(nullable = false, length = 64)
    private String actor = "system";

    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt;

    @PrePersist
    protected void onCreate() {
        if (changedAt == null) {
            changedAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getVariantId() {
        return variantId;
    }

    public void setVariantId(Long variantId) {
        this.variantId = variantId;
    }

    public String getFromSku() {
        return fromSku;
    }

    public void setFromSku(String fromSku) {
        this.fromSku = fromSku;
    }

    public String getToSku() {
        return toSku;
    }

    public void setToSku(String toSku) {
        this.toSku = toSku;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public Instant getChangedAt() {
        return changedAt;
    }

    public void setChangedAt(Instant changedAt) {
        this.changedAt = changedAt;
    }
}
