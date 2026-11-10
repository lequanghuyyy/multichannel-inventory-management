package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "allocation_plan_items")
public class AllocationPlanItem extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plan_id", nullable = false)
    private Long planId;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "channel_id", nullable = false)
    private Long channelId;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "external_sku", length = 64)
    private String externalSku;

    @Column(name = "current_quota", nullable = false)
    private int currentQuota;

    @Column(name = "proposed_quota", nullable = false)
    private int proposedQuota;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Direction direction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.PENDING;

    @Column(columnDefinition = "TEXT")
    private String issues;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

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

    @Column(name = "verified_at")
    private Instant verifiedAt;

    public enum Direction {
        NONE, DECREASE, INCREASE
    }

    public enum Status {
        PENDING, RETRY_PENDING, VERIFIED, BLOCKED, SUPERSEDED
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long planId) { this.planId = planId; }
    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public Long getChannelId() { return channelId; }
    public void setChannelId(Long channelId) { this.channelId = channelId; }
    public Long getVariantId() { return variantId; }
    public void setVariantId(Long variantId) { this.variantId = variantId; }
    public String getExternalSku() { return externalSku; }
    public void setExternalSku(String externalSku) { this.externalSku = externalSku; }
    public int getCurrentQuota() { return currentQuota; }
    public void setCurrentQuota(int currentQuota) { this.currentQuota = currentQuota; }
    public int getProposedQuota() { return proposedQuota; }
    public void setProposedQuota(int proposedQuota) { this.proposedQuota = proposedQuota; }
    public Direction getDirection() { return direction; }
    public void setDirection(Direction direction) { this.direction = direction; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getIssues() { return issues; }
    public void setIssues(String issues) { this.issues = issues; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public void setNextAttemptAt(Instant nextAttemptAt) { this.nextAttemptAt = nextAttemptAt; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
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
    public Instant getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(Instant verifiedAt) { this.verifiedAt = verifiedAt; }
}
