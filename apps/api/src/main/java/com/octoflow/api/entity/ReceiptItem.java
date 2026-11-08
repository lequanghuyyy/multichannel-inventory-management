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

    @Column(name = "expected_qty", nullable = false)
    private int expectedQty;

    @Column(name = "accepted_qty", nullable = false)
    private int acceptedQty = 0;

    @Column(name = "rejected_qty", nullable = false)
    private int rejectedQty = 0;

    @Column(name = "unit_cost")
    private Long unitCost = 0L;

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
}
