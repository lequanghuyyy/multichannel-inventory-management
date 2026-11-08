package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "receipt_event_items")
public class ReceiptEventItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    private ReceiptEvent event;

    @Column(name = "receipt_item_id", nullable = false)
    private Long receiptItemId;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(nullable = false, length = 64)
    private String sku;

    @Column(name = "accepted_qty", nullable = false)
    private int acceptedQty;

    @Column(name = "rejected_qty", nullable = false)
    private int rejectedQty;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ReceiptEvent getEvent() {
        return event;
    }

    public void setEvent(ReceiptEvent event) {
        this.event = event;
    }

    public Long getReceiptItemId() {
        return receiptItemId;
    }

    public void setReceiptItemId(Long receiptItemId) {
        this.receiptItemId = receiptItemId;
    }

    public Long getVariantId() {
        return variantId;
    }

    public void setVariantId(Long variantId) {
        this.variantId = variantId;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public int getAcceptedQty() {
        return acceptedQty;
    }

    public void setAcceptedQty(int acceptedQty) {
        this.acceptedQty = acceptedQty;
    }

    public int getRejectedQty() {
        return rejectedQty;
    }

    public void setRejectedQty(int rejectedQty) {
        this.rejectedQty = rejectedQty;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
