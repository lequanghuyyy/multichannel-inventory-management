package com.octoflow.api;

import com.octoflow.api.service.*;
import com.octoflow.api.support.WooCommerceMockStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
        "app.sync.workers-enabled=false", "app.channels.woocommerce.enabled=true",
        "app.channels.woocommerce.consumer-key=ck_test", "app.channels.woocommerce.consumer-secret=cs_test",
        "app.channels.woocommerce.write-enabled=true", "app.channels.woocommerce.read-timeout-ms=1000"
})
@Testcontainers
class Phase07WooCommerceOrderIntegrationTest {
    static final WooCommerceMockStore STORE = store();
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.channels.woocommerce.base-url", STORE::baseUrl);
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired WooCommerceChannelService connection;
    @Autowired WooCommerceOrderIngestionService ingestion;
    @Autowired OutboxDispatchService outbox;
    @Autowired SyncJobDispatchService sync;
    @Autowired ReconciliationService reconciliation;
    long channel;

    @BeforeEach void reset() {
        STORE.reset();
        jdbc.execute("TRUNCATE TABLE products, channels, orders, outbox_events RESTART IDENTITY CASCADE");
        channel = jdbc.queryForObject("INSERT INTO channels(code,name,environment,status) VALUES ('woocommerce','Woo','test','DISCONNECTED') RETURNING id", Long.class);
        connection.verify(channel);
    }

    @Test void importReplayOutboxAndReconciliationStaySafe() {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        STORE.stock = 6;
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        var result = ingestion.importOne(channel, "42");
        assertEquals(result.orderId(), ingestion.importOne(channel, "42").orderId());
        assertEquals(18, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(0, number("SELECT reserved FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(6, number("SELECT allocated_quota FROM channel_listings WHERE id=" + a.listing));
        assertEquals(1, number("SELECT count(*) FROM orders"));
        assertEquals(1, number("SELECT count(*) FROM outbox_events WHERE event_type='INVENTORY_CHANGED'"));
        assertEquals(1, number("SELECT count(*) FROM inventory_ledger WHERE operation='WOO_ORDER_SALE'"));
        outbox.processDueEvents();
        sync.processDueJobs();
        assertEquals(0, STORE.putCount.get());
        assertEquals("DRIFT", reconciliation.reconcileListing(channel, a.listing).status());
        assertEquals(0, STORE.putCount.get());
        assertEquals(1, number("SELECT count(*) FROM channel_sync_evidence WHERE listing_id=" + a.listing + " AND status='VERIFIED'"));
        assertEquals(8, number("SELECT verified_quantity FROM channel_sync_evidence WHERE listing_id=" + a.listing + " AND status='VERIFIED'"));
        STORE.orderResponse = order(42, "completed", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        assertThrows(IllegalStateException.class, () -> ingestion.importOne(channel, "42"));
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "CHANGED", 2, "2", "2000"));
        assertTrue(assertThrows(IllegalStateException.class, () -> ingestion.importOne(channel, "42"))
                .getMessage().contains("nội dung khác"));
        assertEquals(18, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
    }

    @Test void twoConcurrentImportsCannotDeductTwice() throws Exception {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new java.util.concurrent.CountDownLatch(1);
            var first = pool.submit(() -> { start.await(); try { return ingestion.importOne(channel, "42"); } catch (RuntimeException e) { return null; } });
            var second = pool.submit(() -> { start.await(); try { return ingestion.importOne(channel, "42"); } catch (RuntimeException e) { return null; } });
            start.countDown();
            assertTrue(first.get() != null || second.get() != null);
        }
        ingestion.importOne(channel, "42");
        assertEquals(1, number("SELECT count(*) FROM orders"));
        assertEquals(18, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
    }

    @Test void completedSalePreservesReservedStockAndOtherChannelsQuota() {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        jdbc.update("UPDATE inventory_balances SET reserved=3 WHERE variant_id=?", a.variant);
        Long other = jdbc.queryForObject("INSERT INTO channels(code,name,environment,status) VALUES ('simulator','Simulator','test','CONNECTED') RETURNING id", Long.class);
        jdbc.update("INSERT INTO channel_listings(channel_id,variant_id,external_listing_id,allocated_quota) VALUES (?,?,'sim',4)", other, a.variant);
        STORE.orderResponse = order(42, "completed", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        ingestion.importOne(channel, "42");
        assertEquals(18, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(3, number("SELECT reserved FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(4, number("SELECT allocated_quota FROM channel_listings WHERE channel_id=" + other));
        assertEquals(2, number("SELECT quantity FROM woocommerce_order_import_lines"));
    }

    @Test void disconnectedStoreCannotImportEvenIfItsOrdersAreReadable() {
        fixture("101", "0", "WOO-SKU-A", 20, 8);
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        connection.disconnect(channel);
        assertThrows(IllegalStateException.class, () -> ingestion.importOne(channel, "42"));
        assertEquals(0, number("SELECT count(*) FROM orders"));
    }

    @Test void unresolvedAllocationCannotRaceTheSale() {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        jdbc.update("INSERT INTO variant_allocation_states(variant_id,current_revision,next_revision) VALUES (?,1,2)", a.variant);
        jdbc.update("""
                INSERT INTO allocation_plans(variant_id,status,core_version,base_allocation_revision,allocation_revision,
                    on_hand,reserved,safety_buffer,available_to_sell,total_target,created_by)
                VALUES (?,'BLOCKED',0,0,1,20,0,0,20,8,'test')
                """, a.variant);
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        assertThrows(IllegalStateException.class, () -> ingestion.importOne(channel, "42"));
        assertEquals(20, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(8, number("SELECT allocated_quota FROM channel_listings WHERE id=" + a.listing));
        assertEquals(0, number("SELECT count(*) FROM orders"));
    }

    @Test void multipleSkusAreAtomicAndInvalidMappingOrStockDoesNotPartiallyApply() {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        Fixture b = fixture("102", "202", "WOO-B", 10, 5);
        String validA = line("101", "0", "WOO-SKU-A", 2, "2", "2000");
        String bad = line("102", "202", "BAD", 1, "1", "1000");
        STORE.orderResponse = order(42, "processing", "VND", validA + "," + bad);
        assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        assertEquals(20, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        STORE.orderResponse = order(42, "processing", "VND", validA + "," + line("102", "202", "WOO-B", 11, "11", "11000"));
        assertThrows(IllegalStateException.class, () -> ingestion.importOne(channel, "42"));
        assertEquals(20, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(0, number("SELECT count(*) FROM orders"));
        STORE.orderResponse = order(42, "processing", "VND", validA + "," + line("102", "202", "WOO-B", 1, "1", "1000"));
        ingestion.importOne(channel, "42");
        assertEquals(18, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(9, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + b.variant));
        assertEquals(2, number("SELECT count(*) FROM order_items"));
    }

    @Test void unsupportedStatusCurrencyOrMissingStockProofCannotMoveInventory() {
        Fixture a = fixture("101", "0", "WOO-SKU-A", 20, 8);
        for (String status : new String[]{"pending", "on-hold", "cancelled", "failed", "refunded"}) {
            STORE.orderResponse = order(42, status, "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
            assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        }
        STORE.orderResponse = order(42, "processing", "USD", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, null, "2000"));
        assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "1", "2000"));
        assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        STORE.orderResponse = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"))
                .replace("\"refunds\":[]", "\"refunds\":[{\"id\":1}]");
        assertThrows(IllegalArgumentException.class, () -> ingestion.importOne(channel, "42"));
        assertEquals(20, number("SELECT on_hand FROM inventory_balances WHERE variant_id=" + a.variant));
        assertEquals(0, number("SELECT count(*) FROM orders"));
    }

    @Test void invalidOrderDoesNotLoseOtherResultsInSamePage() {
        fixture("101", "0", "WOO-SKU-A", 20, 8);
        String good = order(42, "processing", "VND", line("101", "0", "WOO-SKU-A", 2, "2", "2000"));
        String bad = order(43, "processing", "VND", line("101", "0", "WOO-SKU-A", 1, "1", "1000"))
                .replace("\"quantity\":1", "\"quantity\":1.5");
        STORE.ordersResponse = "[" + good + "," + bad + ",{\"id\":null}]";
        STORE.ordersById.put("42", good); STORE.ordersById.put("43", bad);
        var results = ingestion.importPage(channel, Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"), 1, 10);
        assertNotNull(results.getFirst().orderId());
        assertNotNull(results.get(1).error());
        assertNull(results.get(2).externalOrderId());
        assertNotNull(results.get(2).error());
        assertEquals(1, number("SELECT count(*) FROM orders"));
    }

    private Fixture fixture(String productId, String variationId, String sku, int stock, int quota) {
        Long product = jdbc.queryForObject("INSERT INTO products(name,status) VALUES (?, 'PUBLISHED') RETURNING id", Long.class, sku);
        Long variant = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,title,price) VALUES (?, ?, ?, 1000) RETURNING id", Long.class, product, "CORE-" + sku, sku);
        jdbc.update("INSERT INTO inventory_balances(variant_id,on_hand) VALUES (?,?)", variant, stock);
        Long listing = jdbc.queryForObject("""
                INSERT INTO channel_listings(channel_id,variant_id,external_listing_id,external_variant_id,
                    external_sku,mapping_status,mapping_verified_at,allocated_quota,reported_stock,sync_status,verified_quantity)
                VALUES (?,?,?,?,?,'VERIFIED',clock_timestamp(),?,?,'SYNCED',?) RETURNING id
                """, Long.class, channel, variant, productId, "0".equals(variationId) ? null : variationId, sku, quota, quota, quota);
        jdbc.update("INSERT INTO channel_sync_evidence(listing_id,kind,adapter,status,verified_quantity) VALUES (?, 'MAPPING_VERIFY', 'woocommerce', 'VERIFIED', ?)", listing, quota);
        return new Fixture(variant, listing);
    }
    private record Fixture(long variant, long listing) {}
    private int number(String sql) { return jdbc.queryForObject(sql, Integer.class); }
    private static String order(int id, String status, String currency, String lines) {
        return "{\"id\":" + id + ",\"status\":\"" + status + "\",\"currency\":\"" + currency
                + "\",\"total\":\"3000\",\"refunds\":[],\"line_items\":[" + lines + "]}";
    }
    private static String line(String product, String variation, String sku, int quantity, String reduced, String total) {
        return "{\"id\":" + product + ",\"product_id\":" + product + ",\"variation_id\":" + variation + ",\"sku\":\"" + sku
                + "\",\"quantity\":" + quantity + ",\"total\":\"" + total + "\",\"meta_data\":"
                + (reduced == null ? "[]" : "[{\"key\":\"_reduced_stock\",\"value\":\"" + reduced + "\"}]") + "}";
    }
    private static WooCommerceMockStore store() { try { return new WooCommerceMockStore(); } catch (IOException ex) { throw new ExceptionInInitializerError(ex); } }
}
