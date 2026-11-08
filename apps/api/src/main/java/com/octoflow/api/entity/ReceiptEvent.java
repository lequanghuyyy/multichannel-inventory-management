package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Immutable receipt audit record. A RECEIVED event represents exactly one receive batch and owns
 * the accepted/rejected quantities of that batch, which is why stock must never be derived by
 * re-adding an item's cumulative totals.
 */
@Entity
@Table(name = "receipt_events")
public class ReceiptEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receipt_id", nullable = false)
    private Receipt receipt;

    @Column(name = "event_type", nullable = false, length = 32)
    private String eventType;

    @Column(length = 500)
    private String note;

    @Column(name = "receipt_version", nullable = false)
    private Long receiptVersion;

    @Column(nullable = false, length = 64)
    private String actor = "system";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ReceiptEventItem> items = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public enum Type {
        CREATED, UPDATED, RECEIVED, CLOSED_SHORT, CANCELLED
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

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Long getReceiptVersion() {
        return receiptVersion;
    }

    public void setReceiptVersion(Long receiptVersion) {
        this.receiptVersion = receiptVersion;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public List<ReceiptEventItem> getItems() {
        return items;
    }

    public void setItems(List<ReceiptEventItem> items) {
        this.items = items;
    }
}
