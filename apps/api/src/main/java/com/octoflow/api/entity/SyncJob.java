package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "sync_jobs")
public class SyncJob extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_kind", nullable = false, length = 24)
    private String jobKind = "INVENTORY";

    @Column(name = "outbox_event_id")
    private Long outboxEventId;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "channel_id", nullable = false)
    private Long channelId;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "target_quantity", nullable = false)
    private int targetQuantity;

    @Column(name = "core_version", nullable = false)
    private Long coreVersion;

    @Column(name = "allocation_revision", nullable = false)
    private long allocationRevision;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Status status = Status.PENDING;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 8;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt = Instant.now();

    @Column(name = "lease_owner", length = 128)
    private String leaseOwner;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "claim_generation", nullable = false)
    private long claimGeneration;

    @Column(name = "sent_quantity")
    private Integer sentQuantity;

    @Column(name = "acknowledged_quantity")
    private Integer acknowledgedQuantity;

    @Column(name = "verified_quantity")
    private Integer verifiedQuantity;

    @Column(name = "remote_before")
    private Integer remoteBefore;

    @Column(name = "remote_after")
    private Integer remoteAfter;

    @Column(length = 32)
    private String adapter;

    @Column(name = "idempotency_reference", length = 128)
    private String idempotencyReference;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "last_attempt_at")
    private Instant lastAttemptAt;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    public enum Status {
        PENDING, PROCESSING, RETRY_PENDING, VERIFIED, DRIFT,
        UNCONFIRMED, SUPERSEDED, BLOCKED, DEAD_LETTER
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getJobKind() { return jobKind; }
    public void setJobKind(String jobKind) { this.jobKind = jobKind; }
    public Long getOutboxEventId() { return outboxEventId; }
    public void setOutboxEventId(Long outboxEventId) { this.outboxEventId = outboxEventId; }
    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public Long getChannelId() { return channelId; }
    public void setChannelId(Long channelId) { this.channelId = channelId; }
    public Long getVariantId() { return variantId; }
    public void setVariantId(Long variantId) { this.variantId = variantId; }
    public int getTargetQuantity() { return targetQuantity; }
    public void setTargetQuantity(int targetQuantity) { this.targetQuantity = targetQuantity; }
    public Long getCoreVersion() { return coreVersion; }
    public void setCoreVersion(Long coreVersion) { this.coreVersion = coreVersion; }
    public long getAllocationRevision() { return allocationRevision; }
    public void setAllocationRevision(long allocationRevision) { this.allocationRevision = allocationRevision; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public void setNextAttemptAt(Instant nextAttemptAt) { this.nextAttemptAt = nextAttemptAt; }
    public String getLeaseOwner() { return leaseOwner; }
    public void setLeaseOwner(String leaseOwner) { this.leaseOwner = leaseOwner; }
    public Instant getLeaseUntil() { return leaseUntil; }
    public void setLeaseUntil(Instant leaseUntil) { this.leaseUntil = leaseUntil; }
    public long getClaimGeneration() { return claimGeneration; }
    public void setClaimGeneration(long claimGeneration) { this.claimGeneration = claimGeneration; }
    public Integer getSentQuantity() { return sentQuantity; }
    public void setSentQuantity(Integer sentQuantity) { this.sentQuantity = sentQuantity; }
    public Integer getAcknowledgedQuantity() { return acknowledgedQuantity; }
    public void setAcknowledgedQuantity(Integer acknowledgedQuantity) { this.acknowledgedQuantity = acknowledgedQuantity; }
    public Integer getVerifiedQuantity() { return verifiedQuantity; }
    public void setVerifiedQuantity(Integer verifiedQuantity) { this.verifiedQuantity = verifiedQuantity; }
    public Integer getRemoteBefore() { return remoteBefore; }
    public void setRemoteBefore(Integer remoteBefore) { this.remoteBefore = remoteBefore; }
    public Integer getRemoteAfter() { return remoteAfter; }
    public void setRemoteAfter(Integer remoteAfter) { this.remoteAfter = remoteAfter; }
    public String getAdapter() { return adapter; }
    public void setAdapter(String adapter) { this.adapter = adapter; }
    public String getIdempotencyReference() { return idempotencyReference; }
    public void setIdempotencyReference(String idempotencyReference) { this.idempotencyReference = idempotencyReference; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
    public Instant getLastAttemptAt() { return lastAttemptAt; }
    public void setLastAttemptAt(Instant lastAttemptAt) { this.lastAttemptAt = lastAttemptAt; }
    public Instant getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(Instant verifiedAt) { this.verifiedAt = verifiedAt; }
}
