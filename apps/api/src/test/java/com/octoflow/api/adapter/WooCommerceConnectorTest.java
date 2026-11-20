package com.octoflow.api.adapter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.support.WooCommerceMockStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Connector-level safety tests against a local WooCommerce-shaped HTTP server. They prove what
 * goes over the wire (absolute stock only, no write when the flag is off) without needing a store.
 */
class WooCommerceConnectorTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private WooCommerceMockStore store;
    private WooCommerceProperties properties;
    private WooCommerceApiClient client;
    private WooCommerceChannelAdapter adapter;

    @BeforeEach
    void setUp() throws IOException {
        store = new WooCommerceMockStore();
        properties = new WooCommerceProperties();
        properties.setEnabled(true);
        properties.setBaseUrl(store.baseUrl());
        properties.setConsumerKey("ck_phase06_test");
        properties.setConsumerSecret("cs_phase06_test");
        properties.setWriteEnabled(true);
        properties.setReadTimeoutMs(1_000);
        client = new WooCommerceApiClient(properties, JSON);
        adapter = new WooCommerceChannelAdapter(properties, client);
    }

    @AfterEach
    void tearDown() {
        store.close();
    }

    @Test
    void connectionVerificationReadsTheStoreAndReportsAuthMode() {
        WooCommerceApiClient.ConnectionSnapshot snapshot = client.inspectConnection();

        assertTrue(snapshot.productsRead());
        assertEquals("OctoFlow Development Store", snapshot.site().name());
        assertEquals("9.5.1", snapshot.wcVersion());
        assertEquals("6.7.1", snapshot.wpVersion());
        assertEquals("VND", snapshot.currency());
        assertEquals("oauth1_dev_http", snapshot.authMode());
    }

    @Test
    void rejectedCredentialsAreClassifiedAsAuthFailures() {
        store.rejectProducts = true;

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> client.inspectConnection());

        assertEquals(ChannelAdapterException.Kind.REFUSED, failure.getKind());
        assertEquals(WooCommerceReason.AUTH_FAILED, failure.getReasonCode());
        assertFalse(failure.getMessage().contains("ck_phase06_test"));
        assertFalse(failure.getMessage().contains("cs_phase06_test"));
    }

    @Test
    void simpleProductMappingRequiresExactSkuAndEnabledStockManagement() {
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelInventoryAdapter.MappingSnapshot snapshot = adapter.verifyMapping(channel(), listing);

        assertEquals("WOO-SKU-A", snapshot.externalSku());
        assertNull(snapshot.externalVariantId());
        assertEquals(8, snapshot.quantity());
    }

    @Test
    void variableProductMappingResolvesTheVariation() {
        store.productType = "variable";
        store.variationSku = "WOO-SKU-VAR";
        store.variationStock = 4;
        ChannelListing listing = listing("101", "202", "WOO-SKU-VAR");

        ChannelInventoryAdapter.MappingSnapshot snapshot = adapter.verifyMapping(channel(), listing);

        assertEquals("WOO-SKU-VAR", snapshot.externalSku());
        assertEquals("202", snapshot.externalVariantId());
        assertEquals(4, snapshot.quantity());
    }

    @Test
    void skuMismatchNeverVerifiesTheMapping() {
        ChannelListing listing = listing("101", null, "WRONG-SKU");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.verifyMapping(channel(), listing));

        assertEquals(ChannelAdapterException.Kind.REFUSED, failure.getKind());
        assertEquals(WooCommerceReason.SKU_MISMATCH, failure.getReasonCode());
    }

    @Test
    void stockManagementIsNeverEnabledAutomatically() {
        store.manageStock = false;
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.verifyMapping(channel(), listing));

        assertEquals(ChannelAdapterException.Kind.REFUSED, failure.getKind());
        assertEquals(WooCommerceReason.STOCK_MANAGEMENT_DISABLED, failure.getReasonCode());
        assertEquals(0, store.putCount.get(), "verification must not PUT stock");
    }

    @Test
    void writeAndIndependentReadBackAtEightMatch() {
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelInventoryAdapter.DeliveryReceipt receipt =
                adapter.writeStock(channel(), listing, 8, "phase06:8");

        assertEquals(8, receipt.sentQuantity());
        assertEquals(8, receipt.acknowledgedQuantity());
        assertEquals(1, store.putCount.get());
        assertEquals(8, store.stock);

        ChannelInventoryAdapter.RemoteStock readBack = adapter.readStock(channel(), listing);
        assertEquals(8, readBack.quantity());
    }

    @Test
    void remoteClampingToSixIsVisibleAsAReadBackMismatch() {
        store.clampStockTo = 6;
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelInventoryAdapter.DeliveryReceipt receipt =
                adapter.writeStock(channel(), listing, 8, "phase06:clamped");
        ChannelInventoryAdapter.RemoteStock readBack = adapter.readStock(channel(), listing);

        assertEquals(8, receipt.sentQuantity());
        assertEquals(6, receipt.acknowledgedQuantity());
        assertEquals(6, readBack.quantity());
        assertFalse(receipt.sentQuantity() == readBack.quantity(),
                "the caller must classify 8 -> 6 as DRIFT, not VERIFIED");
    }

    @Test
    void timeoutIsUncertainAndNeverReportedAsSuccess() {
        store.putDelayMs = 1_500;
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.writeStock(channel(), listing, 8, "phase06:timeout"));

        assertEquals(ChannelAdapterException.Kind.TIMEOUT, failure.getKind());
        assertEquals(WooCommerceReason.TIMEOUT, failure.getReasonCode());
        assertTrue(failure.isUncertain());
    }

    @Test
    void writeFlagOffMeansNoHttpWriteAtAll() {
        properties.setWriteEnabled(false);
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.writeStock(channel(), listing, 8, "phase06:disabled"));

        assertEquals(ChannelAdapterException.Kind.UNAVAILABLE, failure.getKind());
        assertEquals(WooCommerceReason.WRITE_DISABLED, failure.getReasonCode());
        assertEquals(0, store.putCount.get());
    }

    @Test
    void unverifiedConnectionCannotReadOrWrite() {
        Channel channel = channel();
        channel.setConnectionVerifiedAt(null);

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.readStock(channel, listing("101", null, "WOO-SKU-A")));

        assertEquals(ChannelAdapterException.Kind.UNAVAILABLE, failure.getKind());
        assertEquals(WooCommerceReason.CONNECTION_NOT_VERIFIED, failure.getReasonCode());
        assertEquals(0, store.productReads.get());
    }

    @Test
    void plainHttpToAnUnknownHostIsRejectedBeforeAnyRequest() {
        properties.setBaseUrl("http://woocommerce.example.test");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.readStock(channel(), listing("101", null, "WOO-SKU-A")));

        assertEquals(ChannelAdapterException.Kind.UNAVAILABLE, failure.getKind());
        assertEquals(WooCommerceReason.HTTP_TRUSTED_HOST_REQUIRED, failure.getReasonCode());
    }

    @Test
    void putResponseWithoutStockQuantityIsNotAnAcknowledgement() {
        store.omitStockQuantityOnPut = true;
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelInventoryAdapter.DeliveryReceipt receipt =
                adapter.writeStock(channel(), listing, 11, "phase06:no-ack");

        assertEquals(11, receipt.sentQuantity());
        assertNull(receipt.acknowledgedQuantity(),
                "an omitted PUT field must stay null; the target is never copied into it");
        assertEquals(11, store.stock);
        assertEquals(1, store.putCount.get());
    }

    @Test
    void unreadablePutResponseIsUncertainInsteadOfRetryable() {
        store.malformedPutResponse = true;
        ChannelListing listing = listing("101", null, "WOO-SKU-A");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.writeStock(channel(), listing, 11, "phase06:bad-json"));

        assertEquals(ChannelAdapterException.Kind.TIMEOUT, failure.getKind(),
                "the write may have landed; it must not be classified as a safe-to-retry refusal");
        assertEquals(WooCommerceReason.INVALID_RESPONSE, failure.getReasonCode());
        assertEquals(11, store.stock, "the mutation did reach the store");
        assertEquals(1, store.putCount.get());
    }

    @Test
    void changedStoreTargetInvalidatesTheVerifiedConnectionBeforeAnyHttp() {
        Channel channel = channel();
        properties.setBaseUrl("http://127.0.0.1:1");

        ChannelAdapterException failure = assertThrows(ChannelAdapterException.class,
                () -> adapter.readStock(channel, listing("101", null, "WOO-SKU-A")));

        assertEquals(ChannelAdapterException.Kind.UNAVAILABLE, failure.getKind());
        assertEquals(WooCommerceReason.STORE_TARGET_CHANGED, failure.getReasonCode());
        assertEquals(0, store.productReads.get());
    }

    private Channel channel() {
        Channel channel = new Channel();
        channel.setCode("woocommerce");
        channel.setName("WooCommerce test");
        channel.setEnvironment("development");
        channel.setStatus(Channel.Status.CONNECTED);
        channel.setConnectorName("woocommerce");
        channel.setConnectionVerifiedAt(Instant.now());
        channel.setConnectionTargetFingerprint(properties.targetFingerprint());
        return channel;
    }

    private ChannelListing listing(String productId, String variationId, String sku) {
        ChannelListing listing = new ChannelListing();
        listing.setExternalListingId(productId);
        listing.setExternalVariantId(variationId);
        listing.setExternalSku(sku);
        return listing;
    }
}
