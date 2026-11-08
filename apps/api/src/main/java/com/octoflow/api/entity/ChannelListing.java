package com.octoflow.api.entity;

import jakarta.persistence.*;

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

    @Column(name = "allocated_quota", nullable = false)
    private int allocatedQuota = 0;

    @Column(name = "reported_stock", nullable = false)
    private int reportedStock = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "sync_status", nullable = false, length = 32)
    private SyncStatus syncStatus = SyncStatus.UNVERIFIED;

    public enum SyncStatus {
        UNVERIFIED, SYNCED, OUT_OF_SYNC, ERROR
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
}
