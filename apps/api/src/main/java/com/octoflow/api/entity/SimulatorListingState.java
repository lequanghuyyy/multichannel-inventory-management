package com.octoflow.api.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "simulator_listing_states")
public class SimulatorListingState extends BaseEntity {

    @Id
    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private long version;

    @Column(name = "last_idempotency_reference", length = 128)
    private String lastIdempotencyReference;

    @Column(name = "last_write_quantity")
    private Integer lastWriteQuantity;

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }
    public String getLastIdempotencyReference() { return lastIdempotencyReference; }
    public void setLastIdempotencyReference(String lastIdempotencyReference) { this.lastIdempotencyReference = lastIdempotencyReference; }
    public Integer getLastWriteQuantity() { return lastWriteQuantity; }
    public void setLastWriteQuantity(Integer lastWriteQuantity) { this.lastWriteQuantity = lastWriteQuantity; }
}
