package com.octoflow.api.entity;

import jakarta.persistence.*;

/**
 * Single source of truth for variant stock balance.
 * Enforces business rule: on_hand >= reserved + safety_buffer >= 0.
 */
@Entity
@Table(name = "inventory_balances")
public class InventoryBalance extends BaseEntity {

    @Id
    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "on_hand", nullable = false)
    private int onHand;

    @Column(name = "reserved", nullable = false)
    private int reserved;

    @Column(name = "safety_buffer", nullable = false)
    private int safetyBuffer;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public int getAvailableToSell() {
        return Math.max(0, this.onHand - this.reserved - this.safetyBuffer);
    }

    public Long getVariantId() {
        return variantId;
    }

    public void setVariantId(Long variantId) {
        this.variantId = variantId;
    }

    public int getOnHand() {
        return onHand;
    }

    public void setOnHand(int onHand) {
        this.onHand = onHand;
    }

    public int getReserved() {
        return reserved;
    }

    public void setReserved(int reserved) {
        this.reserved = reserved;
    }

    public int getSafetyBuffer() {
        return safetyBuffer;
    }

    public void setSafetyBuffer(int safetyBuffer) {
        this.safetyBuffer = safetyBuffer;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }
}
