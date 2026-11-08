package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "receipts")
public class Receipt extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "receipt_number", nullable = false, unique = true, length = 64)
    private String receiptNumber;

    @Column(name = "supplier_name", length = 255)
    private String supplierName;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.DRAFT;

    /**
     * Monotonic command version, incremented exactly once per audited mutation. It is not a JPA
     * {@code @Version}: a status-preserving receive batch (PARTIALLY_RECEIVED after
     * PARTIALLY_RECEIVED) does not dirty any receipt column, so Hibernate would not advance the
     * version. Receipt writes are serialized with a pessimistic row lock instead.
     */
    @Column(nullable = false)
    private Long version = 0L;

    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "close_short_reason", length = 500)
    private String closeShortReason;

    @Column(name = "closed_short_at")
    private Instant closedShortAt;

    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ReceiptItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ReceiptEvent> events = new ArrayList<>();

    public enum Status {
        DRAFT, PARTIALLY_RECEIVED, RECEIVED, CLOSED_SHORT, CANCELLED;

        public boolean isOpenForReceiving() {
            return this == DRAFT || this == PARTIALLY_RECEIVED;
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getReceiptNumber() {
        return receiptNumber;
    }

    public void setReceiptNumber(String receiptNumber) {
        this.receiptNumber = receiptNumber;
    }

    public String getSupplierName() {
        return supplierName;
    }

    public void setSupplierName(String supplierName) {
        this.supplierName = supplierName;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public String getCancelReason() {
        return cancelReason;
    }

    public void setCancelReason(String cancelReason) {
        this.cancelReason = cancelReason;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public void setCancelledAt(Instant cancelledAt) {
        this.cancelledAt = cancelledAt;
    }

    public String getCloseShortReason() {
        return closeShortReason;
    }

    public void setCloseShortReason(String closeShortReason) {
        this.closeShortReason = closeShortReason;
    }

    public Instant getClosedShortAt() {
        return closedShortAt;
    }

    public void setClosedShortAt(Instant closedShortAt) {
        this.closedShortAt = closedShortAt;
    }

    public List<ReceiptItem> getItems() {
        return items;
    }

    public void setItems(List<ReceiptItem> items) {
        this.items = items;
    }

    public List<ReceiptEvent> getEvents() {
        return events;
    }

    public void setEvents(List<ReceiptEvent> events) {
        this.events = events;
    }
}
