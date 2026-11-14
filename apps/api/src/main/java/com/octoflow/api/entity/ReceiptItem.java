package com.octoflow.api.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "receipt_items")
public class ReceiptItem extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receipt_id", nullable = false)
    private Receipt receipt;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(nullable = false, length = 64)
    private String sku;

    @Column(name = "variant_title", nullable = false, length = 128)
    private String variantTitle;

    @Column(name = "expected_qty", nullable = false)
    private int expectedQty;

    @Column(name = "accepted_qty", nullable = false)
    private int acceptedQty = 0;

    @Column(name = "rejected_qty", nullable = false)
    private int rejectedQty = 0;

    @Column(name = "unit_cost", nullable = false)
    private Long unitCost = 0L;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    public int getProcessedQty() {
        return acceptedQty + rejectedQty;
    }

    public int getRemainingQty() {
        return expectedQty - getProcessedQty();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Receipt getReceipt() {
        return receipt;
    }

    public void setReceipt(Receipt receipt) {
        this.receipt = receipt;
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

    public String getVariantTitle() {
        return variantTitle;
    }

    public void setVariantTitle(String variantTitle) {
        this.variantTitle = variantTitle;
    }

    public int getExpectedQty() {
        return expectedQty;
    }

    public void setExpectedQty(int expectedQty) {
        this.expectedQty = expectedQty;
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

    public Long getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(Long unitCost) {
        this.unitCost = unitCost;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }
}
