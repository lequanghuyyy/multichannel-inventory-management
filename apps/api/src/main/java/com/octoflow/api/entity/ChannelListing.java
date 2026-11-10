package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "channel_listings", uniqueConstraints = {
        @UniqueConstraint(name = "uq_channel_variant", columnNames = {"channel_id", "variant_id"})
})
public class ChannelListing extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "channel_id", nullable = false)
    private Channel channel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariant variant;

    @Column(name = "external_listing_id", nullable = false, length = 128)
    private String externalListingId;

    @Column(name = "external_sku", length = 64)
    private String externalSku;

    @Column(name = "external_variant_id", length = 128)
    private String externalVariantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "mapping_status", nullable = false, length = 24)
    private MappingStatus mappingStatus = MappingStatus.UNVERIFIED;

    @Column(name = "mapping_verified_at")
    private Instant mappingVerifiedAt;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "allocated_quota", nullable = false)
    private int allocatedQuota = 0;

    @Column(name = "reported_stock", nullable = false)
    private int reportedStock = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "sync_status", nullable = false, length = 32)
    private SyncStatus syncStatus = SyncStatus.UNVERIFIED;

    @Column(name = "sent_quantity")
    private Integer sentQuantity;

    @Column(name = "acknowledged_quantity")
    private Integer acknowledgedQuantity;

    @Column(name = "verified_quantity")
    private Integer verifiedQuantity;

    @Column(name = "last_sync_error", length = 500)
    private String lastSyncError;

    @Column(name = "last_verified_at")
    private Instant lastVerifiedAt;

    @Column(name = "target_allocation_revision", nullable = false)
    private long targetAllocationRevision = 0L;

    public enum SyncStatus {
        UNVERIFIED, SYNCED, OUT_OF_SYNC, ERROR
    }

    public enum MappingStatus {
        UNVERIFIED, REGISTERED, VERIFIED
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Channel getChannel() {
        return channel;
    }

    public void setChannel(Channel channel) {
        this.channel = channel;
    }

    public ProductVariant getVariant() {
        return variant;
    }

    public void setVariant(ProductVariant variant) {
        this.variant = variant;
    }

    public String getExternalListingId() {
        return externalListingId;
    }

    public void setExternalListingId(String externalListingId) {
        this.externalListingId = externalListingId;
    }

    public String getExternalSku() {
        return externalSku;
    }

    public void setExternalSku(String externalSku) {
        this.externalSku = externalSku;
    }

    public String getExternalVariantId() {
        return externalVariantId;
    }

    public void setExternalVariantId(String externalVariantId) {
        this.externalVariantId = externalVariantId;
    }

    public MappingStatus getMappingStatus() {
        return mappingStatus;
    }

    public void setMappingStatus(MappingStatus mappingStatus) {
        this.mappingStatus = mappingStatus;
    }

    public Instant getMappingVerifiedAt() {
        return mappingVerifiedAt;
    }

    public void setMappingVerifiedAt(Instant mappingVerifiedAt) {
        this.mappingVerifiedAt = mappingVerifiedAt;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public int getAllocatedQuota() {
        return allocatedQuota;
    }

    public void setAllocatedQuota(int allocatedQuota) {
        this.allocatedQuota = allocatedQuota;
    }

    public int getReportedStock() {
        return reportedStock;
    }

    public void setReportedStock(int reportedStock) {
        this.reportedStock = reportedStock;
    }

    public SyncStatus getSyncStatus() {
        return syncStatus;
    }

    public void setSyncStatus(SyncStatus syncStatus) {
        this.syncStatus = syncStatus;
    }

    public Integer getSentQuantity() {
        return sentQuantity;
    }

    public void setSentQuantity(Integer sentQuantity) {
        this.sentQuantity = sentQuantity;
    }

    public Integer getAcknowledgedQuantity() {
        return acknowledgedQuantity;
    }

    public void setAcknowledgedQuantity(Integer acknowledgedQuantity) {
        this.acknowledgedQuantity = acknowledgedQuantity;
    }

    public Integer getVerifiedQuantity() {
        return verifiedQuantity;
    }

    public void setVerifiedQuantity(Integer verifiedQuantity) {
        this.verifiedQuantity = verifiedQuantity;
    }

    public String getLastSyncError() {
        return lastSyncError;
    }

    public void setLastSyncError(String lastSyncError) {
        this.lastSyncError = lastSyncError;
    }

    public Instant getLastVerifiedAt() {
        return lastVerifiedAt;
    }

    public void setLastVerifiedAt(Instant lastVerifiedAt) {
        this.lastVerifiedAt = lastVerifiedAt;
    }

    public long getTargetAllocationRevision() {
        return targetAllocationRevision;
    }

    public void setTargetAllocationRevision(long targetAllocationRevision) {
        this.targetAllocationRevision = targetAllocationRevision;
    }
}
