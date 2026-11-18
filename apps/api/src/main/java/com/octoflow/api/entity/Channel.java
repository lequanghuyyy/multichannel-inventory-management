package com.octoflow.api.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "channels")
public class Channel extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(nullable = false, length = 32)
    private String environment = "sandbox";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.DISCONNECTED;

    @Column(name = "connector_name", length = 64)
    private String connectorName;

    @Column(name = "connector_version", length = 64)
    private String connectorVersion;

    @Column(name = "connection_verified_at")
    private Instant connectionVerifiedAt;

    @Column(name = "connection_products_read", nullable = false)
    private boolean connectionProductsRead = false;

    @Column(name = "connection_auth_mode", length = 32)
    private String connectionAuthMode;

    @Column(name = "external_store_name", length = 255)
    private String externalStoreName;

    @Column(name = "external_store_url", length = 512)
    private String externalStoreUrl;

    @Column(name = "external_wc_version", length = 64)
    private String externalWcVersion;

    @Column(name = "external_wp_version", length = 64)
    private String externalWpVersion;

    @Column(name = "external_currency", length = 8)
    private String externalCurrency;

    @Column(name = "connection_last_error_code", length = 64)
    private String connectionLastErrorCode;

    @Column(name = "connection_last_error_message", length = 500)
    private String connectionLastErrorMessage;

    @OneToMany(mappedBy = "channel", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ChannelListing> listings = new ArrayList<>();

    public enum Status {
        CONNECTED, DISCONNECTED, ERROR
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public String getConnectorName() {
        return connectorName;
    }

    public void setConnectorName(String connectorName) {
        this.connectorName = connectorName;
    }

    public String getConnectorVersion() {
        return connectorVersion;
    }

    public void setConnectorVersion(String connectorVersion) {
        this.connectorVersion = connectorVersion;
    }

    public Instant getConnectionVerifiedAt() {
        return connectionVerifiedAt;
    }

    public void setConnectionVerifiedAt(Instant connectionVerifiedAt) {
        this.connectionVerifiedAt = connectionVerifiedAt;
    }

    public boolean isConnectionProductsRead() {
        return connectionProductsRead;
    }

    public void setConnectionProductsRead(boolean connectionProductsRead) {
        this.connectionProductsRead = connectionProductsRead;
    }

    public String getConnectionAuthMode() {
        return connectionAuthMode;
    }

    public void setConnectionAuthMode(String connectionAuthMode) {
        this.connectionAuthMode = connectionAuthMode;
    }

    public String getExternalStoreName() {
        return externalStoreName;
    }

    public void setExternalStoreName(String externalStoreName) {
        this.externalStoreName = externalStoreName;
    }

    public String getExternalStoreUrl() {
        return externalStoreUrl;
    }

    public void setExternalStoreUrl(String externalStoreUrl) {
        this.externalStoreUrl = externalStoreUrl;
    }

    public String getExternalWcVersion() {
        return externalWcVersion;
    }

    public void setExternalWcVersion(String externalWcVersion) {
        this.externalWcVersion = externalWcVersion;
    }

    public String getExternalWpVersion() {
        return externalWpVersion;
    }

    public void setExternalWpVersion(String externalWpVersion) {
        this.externalWpVersion = externalWpVersion;
    }

    public String getExternalCurrency() {
        return externalCurrency;
    }

    public void setExternalCurrency(String externalCurrency) {
        this.externalCurrency = externalCurrency;
    }

    public String getConnectionLastErrorCode() {
        return connectionLastErrorCode;
    }

    public void setConnectionLastErrorCode(String connectionLastErrorCode) {
        this.connectionLastErrorCode = connectionLastErrorCode;
    }

    public String getConnectionLastErrorMessage() {
        return connectionLastErrorMessage;
    }

    public void setConnectionLastErrorMessage(String connectionLastErrorMessage) {
        this.connectionLastErrorMessage = connectionLastErrorMessage;
    }

    public List<ChannelListing> getListings() {
        return listings;
    }

    public void setListings(List<ChannelListing> listings) {
        this.listings = listings;
    }
}
