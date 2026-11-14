package com.octoflow.api.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "simulator_faults")
public class SimulatorFault extends BaseEntity {

    @Id
    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Enumerated(EnumType.STRING)
    @Column(name = "fault_type", nullable = false, length = 32)
    private FaultType faultType;

    @Column(name = "remaining_count", nullable = false)
    private int remainingCount = 1;

    @Column(name = "delay_ms", nullable = false)
    private int delayMs;

    public enum FaultType {
        REFUSE, TIMEOUT, TIMEOUT_AFTER_WRITE, WRONG_READ, DELAY, DUPLICATE
    }

    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public FaultType getFaultType() { return faultType; }
    public void setFaultType(FaultType faultType) { this.faultType = faultType; }
    public int getRemainingCount() { return remainingCount; }
    public void setRemainingCount(int remainingCount) { this.remainingCount = remainingCount; }
    public int getDelayMs() { return delayMs; }
    public void setDelayMs(int delayMs) { this.delayMs = delayMs; }
}
