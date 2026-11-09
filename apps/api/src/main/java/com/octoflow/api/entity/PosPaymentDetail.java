package com.octoflow.api.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Immutable POS payment record, one per order. The server owns the amount due; a CASH payment
 * additionally stores the cash received and the exact change handed back.
 */
@Entity
@Table(name = "pos_payment_details")
public class PosPaymentDetail {

    @Id
    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Method method;

    @Column(nullable = false, length = 8)
    private String currency;

    @Column(name = "amount_due", nullable = false)
    private Long amountDue;

    @Column(name = "cash_received")
    private Long cashReceived;

    @Column(name = "change_amount")
    private Long changeAmount;

    @Column(length = 128)
    private String reference;

    @Column(length = 500)
    private String note;

    @Column(nullable = false, length = 64)
    private String actor;

    @Column(name = "paid_at", nullable = false)
    private Instant paidAt;

    public enum Method {
        CASH, BANK_TRANSFER, MANUAL
    }

    @PrePersist
    protected void initializePaymentMetadata() {
        if (paidAt == null) {
            paidAt = Instant.now();
        }
        if (actor == null || actor.isBlank()) {
            actor = "system";
        }
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Method getMethod() {
        return method;
    }

    public void setMethod(Method method) {
        this.method = method;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Long getAmountDue() {
        return amountDue;
    }

    public void setAmountDue(Long amountDue) {
        this.amountDue = amountDue;
    }

    public Long getCashReceived() {
        return cashReceived;
    }

    public void setCashReceived(Long cashReceived) {
        this.cashReceived = cashReceived;
    }

    public Long getChangeAmount() {
        return changeAmount;
    }

    public void setChangeAmount(Long changeAmount) {
        this.changeAmount = changeAmount;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public void setPaidAt(Instant paidAt) {
        this.paidAt = paidAt;
    }
}
