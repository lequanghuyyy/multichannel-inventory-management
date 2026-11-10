package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "allocation_plans")
public class AllocationPlan extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Status status = Status.PROJECTED;

    @Column(name = "core_version", nullable = false)
    private Long coreVersion;

    @Column(name = "base_allocation_revision", nullable = false)
    private long baseAllocationRevision;

    @Column(name = "allocation_revision", nullable = false)
    private long allocationRevision;

    @Column(name = "on_hand", nullable = false)
    private int onHand;

    @Column(nullable = false)
    private int reserved;

    @Column(name = "safety_buffer", nullable = false)
    private int safetyBuffer;

    @Column(name = "available_to_sell", nullable = false)
    private int availableToSell;

    @Column(name = "total_target", nullable = false)
    private int totalTarget;

    @Column(nullable = false, length = 16)
    private String policy = "MANUAL";

    @Column(name = "can_execute", nullable = false)
    private boolean canExecute;

    @Column(columnDefinition = "TEXT")
    private String issues;

    @Column(name = "idempotency_key", length = 128)
    private String idempotencyKey;

    @Column(name = "created_by", nullable = false, length = 64)
    private String createdBy;

    @Column(name = "confirmed_by", length = 64)
    private String confirmedBy;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "lease_owner", length = 128)
    private String leaseOwner;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    public enum Status {
        PROJECTED, APPLYING, COMPLETED, BLOCKED, SUPERSEDED
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getVariantId() { return variantId; }
    public void setVariantId(Long variantId) { this.variantId = variantId; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Long getCoreVersion() { return coreVersion; }
    public void setCoreVersion(Long coreVersion) { this.coreVersion = coreVersion; }
    public long getBaseAllocationRevision() { return baseAllocationRevision; }
    public void setBaseAllocationRevision(long baseAllocationRevision) { this.baseAllocationRevision = baseAllocationRevision; }
    public long getAllocationRevision() { return allocationRevision; }
    public void setAllocationRevision(long allocationRevision) { this.allocationRevision = allocationRevision; }
    public int getOnHand() { return onHand; }
    public void setOnHand(int onHand) { this.onHand = onHand; }
    public int getReserved() { return reserved; }
    public void setReserved(int reserved) { this.reserved = reserved; }
    public int getSafetyBuffer() { return safetyBuffer; }
    public void setSafetyBuffer(int safetyBuffer) { this.safetyBuffer = safetyBuffer; }
    public int getAvailableToSell() { return availableToSell; }
    public void setAvailableToSell(int availableToSell) { this.availableToSell = availableToSell; }
    public int getTotalTarget() { return totalTarget; }
    public void setTotalTarget(int totalTarget) { this.totalTarget = totalTarget; }
    public String getPolicy() { return policy; }
    public void setPolicy(String policy) { this.policy = policy; }
    public boolean isCanExecute() { return canExecute; }
    public void setCanExecute(boolean canExecute) { this.canExecute = canExecute; }
    public String getIssues() { return issues; }
    public void setIssues(String issues) { this.issues = issues; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(String confirmedBy) { this.confirmedBy = confirmedBy; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
    public String getLeaseOwner() { return leaseOwner; }
    public void setLeaseOwner(String leaseOwner) { this.leaseOwner = leaseOwner; }
    public Instant getLeaseUntil() { return leaseUntil; }
    public void setLeaseUntil(Instant leaseUntil) { this.leaseUntil = leaseUntil; }
}
