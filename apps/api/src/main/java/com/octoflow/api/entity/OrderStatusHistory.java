package com.octoflow.api.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Append-only order lifecycle audit. Rows are written in the same transaction as the order
 * mutation they describe; they are never updated or deleted.
 */
@Entity
@Table(name = "order_status_history")
public class OrderStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Action action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 32)
    private Order.Status fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 32)
    private Order.Status toStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_payment_status", length = 32)
    private Order.PaymentStatus fromPaymentStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_payment_status", length = 32)
    private Order.PaymentStatus toPaymentStatus;

    @Column(length = 500)
    private String reason;

    @Column(nullable = false, length = 64)
    private String actor;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    public enum Action {
        CREATED, PAYMENT_CONFIRMED, STATUS_CHANGED, HANDED_OVER, CANCELLED, EXPIRED
    }

    @PrePersist
    protected void initializeAuditMetadata() {
        if (changedAt == null) {
            changedAt = Instant.now();
        }
        if (actor == null || actor.isBlank()) {
            actor = "system";
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Action getAction() {
        return action;
    }

    public void setAction(Action action) {
        this.action = action;
    }

    public Order.Status getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(Order.Status fromStatus) {
        this.fromStatus = fromStatus;
    }

    public Order.Status getToStatus() {
        return toStatus;
    }

    public void setToStatus(Order.Status toStatus) {
        this.toStatus = toStatus;
    }

    public Order.PaymentStatus getFromPaymentStatus() {
        return fromPaymentStatus;
    }

    public void setFromPaymentStatus(Order.PaymentStatus fromPaymentStatus) {
        this.fromPaymentStatus = fromPaymentStatus;
    }

    public Order.PaymentStatus getToPaymentStatus() {
        return toPaymentStatus;
    }

    public void setToPaymentStatus(Order.PaymentStatus toPaymentStatus) {
        this.toPaymentStatus = toPaymentStatus;
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
