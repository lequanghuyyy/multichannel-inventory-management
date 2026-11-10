package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "channel_sync_evidence")
public class ChannelSyncEvidence extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "job_id")
    private Long jobId;

    @Column(name = "plan_id")
    private Long planId;

    @Column(name = "plan_item_id")
    private Long planItemId;

    @Column(nullable = false, length = 32)
    private String kind;

    @Column(nullable = false, length = 32)
    private String adapter;

    @Column(nullable = false, length = 24)
    private String status;

    @Column(name = "target_quantity")
    private Integer targetQuantity;

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

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "idempotency_reference", length = 128)
    private String idempotencyReference;

    @Column(name = "external_listing_id", length = 128)
    private String externalListingId;

    @Column(name = "external_variant_id", length = 128)
    private String externalVariantId;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long planId) { this.planId = planId; }
    public Long getPlanItemId() { return planItemId; }
    public void setPlanItemId(Long planItemId) { this.planItemId = planItemId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getAdapter() { return adapter; }
    public void setAdapter(String adapter) { this.adapter = adapter; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getTargetQuantity() { return targetQuantity; }
    public void setTargetQuantity(Integer targetQuantity) { this.targetQuantity = targetQuantity; }
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
    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getIdempotencyReference() { return idempotencyReference; }
    public void setIdempotencyReference(String idempotencyReference) { this.idempotencyReference = idempotencyReference; }
    public String getExternalListingId() { return externalListingId; }
    public void setExternalListingId(String externalListingId) { this.externalListingId = externalListingId; }
    public String getExternalVariantId() { return externalVariantId; }
    public void setExternalVariantId(String externalVariantId) { this.externalVariantId = externalVariantId; }
    public Instant getObservedAt() { return observedAt; }
    public void setObservedAt(Instant observedAt) { this.observedAt = observedAt; }
}
