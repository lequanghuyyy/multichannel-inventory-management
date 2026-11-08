package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "inventory_ledger")
public class InventoryLedger {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(nullable = false)
    private int delta;

    @Column(nullable = false, length = 255)
    private String reason;

    @Column(name = "on_hand_after", nullable = false)
    private int onHandAfter;

    @Column(name = "on_hand_before", nullable = false)
    private int onHandBefore;

    @Column(name = "reserved_after", nullable = false)
    private int reservedAfter;

    @Column(name = "reserved_before", nullable = false)
    private int reservedBefore;

    @Column(name = "safety_buffer_before")
    private Integer safetyBufferBefore;

    @Column(name = "safety_buffer_after")
    private Integer safetyBufferAfter;

    @Column(nullable = false, length = 32)
    private String operation = "ADJUSTMENT";

    @Column(name = "actor_name", nullable = false, length = 64)
    private String actorName = "system";

    @Column(name = "reference_id", length = 128)
    private String referenceId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

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

    public int getDelta() {
        return delta;
    }

    public void setDelta(int delta) {
        this.delta = delta;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public int getOnHandAfter() {
        return onHandAfter;
    }

    public void setOnHandAfter(int onHandAfter) {
        this.onHandAfter = onHandAfter;
    }

    public int getOnHandBefore() { return onHandBefore; }
    public void setOnHandBefore(int onHandBefore) { this.onHandBefore = onHandBefore; }

    public int getReservedAfter() {
        return reservedAfter;
    }

    public void setReservedAfter(int reservedAfter) {
        this.reservedAfter = reservedAfter;
    }

    public int getReservedBefore() { return reservedBefore; }
    public void setReservedBefore(int reservedBefore) { this.reservedBefore = reservedBefore; }
    public Integer getSafetyBufferBefore() { return safetyBufferBefore; }
    public void setSafetyBufferBefore(Integer safetyBufferBefore) { this.safetyBufferBefore = safetyBufferBefore; }
    public Integer getSafetyBufferAfter() { return safetyBufferAfter; }
    public void setSafetyBufferAfter(Integer safetyBufferAfter) { this.safetyBufferAfter = safetyBufferAfter; }
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
    public String getActorName() { return actorName; }
    public void setActorName(String actorName) { this.actorName = actorName; }

    public String getReferenceId() {
        return referenceId;
    }

    public void setReferenceId(String referenceId) {
        this.referenceId = referenceId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
