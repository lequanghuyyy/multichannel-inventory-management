package com.octoflow.api;

import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.ProductService;
import com.octoflow.api.service.OrderService;
import com.octoflow.api.service.ReservationService;
import com.octoflow.api.service.ReceiptService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.security.test.context.support.WithMockUser;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FoundationPostgresIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.baseline-on-migrate", () -> false);
    }

    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mockMvc;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;
    @Autowired InventoryBalanceRepository balanceRepository;
    @Autowired InventoryLedgerRepository ledgerRepository;
    @Autowired ReservationRepository reservationRepository;
    @Autowired OrderRepository orderRepository;
    @Autowired InventoryService inventoryService;
    @Autowired ReservationService reservationService;
    @Autowired ReceiptService receiptService;
    @Autowired OrderService orderService;
    @Autowired ProductService productService;

    @Test
    void cleanPostgresRunsAllMigrationsAndJPAValidatesTheSchema() {
        assertEquals(3, flyway.info().applied().length);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'idempotency_records'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'outbox_events' AND column_name = 'event_id'", Integer.class) == 1);
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
    }

    @Test
    void productCreationIsDraftZeroStockAndIdempotent() {
        String sku = "DRAFT-" + UUID.randomUUID().toString().substring(0, 8);
        var request = new CreateProductRequest("Draft stock test", null, null,
                List.of(new CreateProductRequest.CreateVariantRequest(sku, "Default", 100L, "VND", 0)));
        String key = "product-create-" + UUID.randomUUID();

        var created = productService.createProduct(request, key);
        var replay = productService.createProduct(request, key);

        assertEquals(created, replay);
        assertEquals("DRAFT", created.status());
        Long variantId = created.variants().getFirst().id();
        assertEquals(0, balanceRepository.findByVariantId(variantId).orElseThrow().getOnHand());
        assertEquals(0, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(variantId,
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(0, outboxCount(new Fixture(created.id(), variantId, sku)));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM products WHERE id = ?", Integer.class, created.id()));

        ApiException changedPayload = assertThrows(ApiException.class, () -> productService.createProduct(
                new CreateProductRequest("Changed name", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(sku, "Default", 100L, "VND", 0))), key));
        assertEquals("IDEMPOTENCY_CONFLICT", changedPayload.getErrorCode().getCode());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void productCreationRejectsNegativeOrPositiveInitialStock() throws Exception {
        for (int initialStock : List.of(-1, 1)) {
            String sku = "INVALID-" + UUID.randomUUID().toString().substring(0, 8);
            mockMvc.perform(post("/api/v1/products")
                            .with(csrf())
                            .header("Idempotency-Key", "invalid-product-" + UUID.randomUUID())
                            .contentType("application/json")
                            .content("{\"name\":\"Invalid stock\",\"variants\":[{\"sku\":\"" + sku
                                    + "\",\"title\":\"Default\",\"initialStock\":" + initialStock + "}]}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
        }

        var product = productService.createProduct(new CreateProductRequest("Status validation", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(
                                "STATUS-" + UUID.randomUUID().toString().substring(0, 8), "Default", 100L, "VND", 0))),
                "status-product-" + UUID.randomUUID());
        mockMvc.perform(patch("/api/v1/products/{id}", product.id())
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"status\":\"NOT_A_STATUS\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void productDeletionCannotEraseInventoryHistory() {
        Fixture fixture = fixture(3, 0, 0);
        inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "count", null),
                "history-delete-" + UUID.randomUUID());

        ApiException deleteWithHistory = assertThrows(ApiException.class,
                () -> productService.deleteProduct(fixture.productId()));
        assertEquals("PRODUCT_HAS_INVENTORY_HISTORY", deleteWithHistory.getErrorCode().getCode());
        assertEquals(1, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("DELETE FROM product_variants WHERE id = ?", fixture.variantId()));
    }

    @Test
    void concurrentRetryWithSameKeyAppliesMovementOnlyOnce() throws Exception {
        Fixture fixture = fixture(5, 0, 1);
        InventoryAdjustRequest request = new InventoryAdjustRequest(fixture.sku(), 2, "cycle count", null);
        String key = "adjust-replay-" + UUID.randomUUID();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<com.octoflow.api.dto.response.InventorySnapshotResponse> first = pool.submit(
                    () -> adjustSameKey(fixture, request, key, ready, start));
            Future<com.octoflow.api.dto.response.InventorySnapshotResponse> second = pool.submit(
                    () -> adjustSameKey(fixture, request, key, ready, start));
            ready.await();
            start.countDown();
            assertEquals(first.get(), second.get());
        } finally {
            pool.shutdownNow();
        }
        assertEquals(7, balance(fixture).getOnHand());
        assertEquals(1, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(1, outboxCount(fixture));
    }

    @Test
    void sameKeyAndPayloadReplaysAndSameKeyWithChangedPayloadConflicts() {
        Fixture fixture = fixture(5, 0, 1);
        String key = "adjust-" + UUID.randomUUID();
        InventoryAdjustRequest request = new InventoryAdjustRequest(fixture.sku(), 2, "cycle count", null);

        var first = inventoryService.adjustInventory(request, key);
        var replay = inventoryService.adjustInventory(request, key);

        assertEquals(first, replay);
        assertEquals(7, balance(fixture).getOnHand());

        ApiException missingKey = assertThrows(ApiException.class,
                () -> inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "count", null), null));
        assertEquals("IDEMPOTENCY_KEY_REQUIRED", missingKey.getErrorCode().getCode());
        assertEquals(1, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(1, outboxCount(fixture));

        ApiException error = assertThrows(ApiException.class, () -> inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 3, "cycle count", null), key));
        assertEquals("IDEMPOTENCY_CONFLICT", error.getErrorCode().getCode());
        assertEquals(7, balance(fixture).getOnHand());
    }

    @Test
    void createOrderRetryDoesNotReserveOrCreateTheOrderTwice() {
        Fixture fixture = fixture(6, 0, 1);
        long ordersBefore = orderRepository.count();
        CreateOrderRequest request = new CreateOrderRequest("POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 2, null)));
        String key = "order-" + UUID.randomUUID();

        var first = orderService.createOrder(request, key);
        var replay = orderService.createOrder(request, key);

        assertEquals(first, replay);
        assertEquals(ordersBefore + 1, orderRepository.count());
        assertEquals(2, balance(fixture).getReserved());
        assertEquals(1, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
    }

    @Test
    void saleConfirmationRetryDeductsTheHeldUnitsOnce() {
        Fixture fixture = fixture(5, 0, 1);
        var reservation = reservationService.reserve(new ReserveStockRequest(fixture.sku(), 1, null, 15),
                "reserve-" + UUID.randomUUID());
        String key = "sale-" + UUID.randomUUID();

        reservationService.confirmSale(reservation.id(), key);
        reservationService.confirmSale(reservation.id(), key);

        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
    }

    @Test
    void receiptCreateAndReceiveRetriesReplayWithoutAddingStockTwice() {
        Fixture fixture = fixtureWithoutBalance();
        CreateReceiptRequest createRequest = new CreateReceiptRequest("Supplier",
                List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 4, 100L)));
        String createKey = "receipt-create-" + UUID.randomUUID();

        var created = receiptService.createReceipt(createRequest, createKey);
        var createdReplay = receiptService.createReceipt(createRequest, createKey);
        assertEquals(created, createdReplay);

        ReceiveItemsRequest receiveRequest = new ReceiveItemsRequest(List.of(
                new ReceiveItemsRequest.ItemInspection(created.items().getFirst().id(), 4, 0)));
        String receiveKey = "receipt-receive-" + UUID.randomUUID();
        var received = receiptService.receiveStock(created.id(), receiveRequest, receiveKey);
        var receivedReplay = receiptService.receiveStock(created.id(), receiveRequest, receiveKey);

        assertEquals(received, receivedReplay);
        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(1, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(1, outboxCount(fixture));
    }

    @Test
    void concurrentLastUnitReservationsAllowOnlyOneCommit() throws Exception {
        Fixture fixture = fixture(1, 0, 0);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> first = pool.submit(() -> tryReserve(fixture, "hold-a-" + UUID.randomUUID(), ready, start));
            Future<Boolean> second = pool.submit(() -> tryReserve(fixture, "hold-b-" + UUID.randomUUID(), ready, start));
            ready.await();
            start.countDown();

            assertEquals(1, (first.get() ? 1 : 0) + (second.get() ? 1 : 0));
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, balance(fixture).getReserved());
        assertEquals(1, reservationRepository.findByVariantIdAndStatus(fixture.variantId(),
                com.octoflow.api.entity.Reservation.Status.ACTIVE).size());
    }

    @Test
    void concurrentConfirmAndReleaseLockBalanceBeforeReservationAndCommitOneTransition() throws Exception {
        Fixture fixture = fixture(2, 0, 0);
        var reservation = reservationService.reserve(new ReserveStockRequest(fixture.sku(), 1, null, 15),
                "terminal-race-reserve-" + UUID.randomUUID());
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> confirm = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    reservationService.confirmSale(reservation.id(), "terminal-race-confirm-" + UUID.randomUUID());
                    return true;
                } catch (BusinessRuleException alreadyReleased) {
                    return false;
                }
            });
            Future<?> release = pool.submit(() -> {
                ready.countDown();
                start.await();
                reservationService.release(reservation.id());
                return null;
            });
            ready.await();
            start.countDown();
            confirm.get();
            release.get();
        } finally {
            pool.shutdownNow();
        }

        var saved = reservationRepository.findById(reservation.id()).orElseThrow();
        assertTrue(saved.getStatus() == com.octoflow.api.entity.Reservation.Status.CONFIRMED
                || saved.getStatus() == com.octoflow.api.entity.Reservation.Status.CANCELLED);
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(2, outboxCount(fixture));
    }

    @Test
    void concurrentFirstAdjustmentsCreateOneBalanceAndPreserveBothMovements() throws Exception {
        Fixture fixture = fixtureWithoutBalance();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = pool.submit(() -> adjustAfterGate(fixture, "first-" + UUID.randomUUID(), ready, start));
            Future<?> second = pool.submit(() -> adjustAfterGate(fixture, "second-" + UUID.randomUUID(), ready, start));
            ready.await();
            start.countDown();
            first.get();
            second.get();
        } finally {
            pool.shutdownNow();
        }

        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(2, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(fixture.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
    }

    @Test
    void failedMultiLineOrderRollsBackEarlierStockLedgerAndOutboxWrites() {
        Fixture first = fixtureWithSku("AAA-" + UUID.randomUUID().toString().substring(0, 8), 3, 0, 0);
        Fixture empty = fixtureWithSku("ZZZ-" + UUID.randomUUID().toString().substring(0, 8), 0, 0, 0);
        long orderCountBefore = orderRepository.count();
        long outboxBefore = outboxCount(first);
        var items = List.of(
                new CreateOrderRequest.OrderItemRequest(first.sku(), 1, null),
                new CreateOrderRequest.OrderItemRequest(empty.sku(), 1, null));
        CreateOrderRequest request = new CreateOrderRequest("POS", null, items);

        assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(request, "failed-order-" + UUID.randomUUID()));

        assertEquals(0, balance(first).getReserved());
        assertEquals(0, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(first.variantId(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());
        assertEquals(outboxBefore, outboxCount(first));
        assertEquals(orderCountBefore, orderRepository.count());
    }

    @Test
    @WithMockUser(roles = "STAFF")
    void staffCannotAdjustInventoryAndGetsStableForbiddenEnvelope() throws Exception {
        mockMvc.perform(post("/api/v1/inventory/adjust")
                        .with(csrf())
                        .header("Idempotency-Key", "forbidden-key")
                        .contentType("application/json")
                        .content("{\"sku\":\"NOT-USED\",\"delta\":1,\"reason\":\"count\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.error.request_id").isNotEmpty());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void invalidRequestReturnsTheStandardValidationEnvelope() throws Exception {
        mockMvc.perform(post("/api/v1/inventory/adjust")
                        .with(csrf())
                        .header("Idempotency-Key", "validation-key")
                        .contentType("application/json")
                        .content("{\"sku\":\"\",\"delta\":null,\"reason\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.request_id").isNotEmpty());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void channelReconciliationCannotClaimSuccessWithoutDeliveryEvidence() throws Exception {
        Fixture fixture = fixtureWithoutBalance();
        Long channelId = jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES (?, 'Test channel', 'sandbox', 'CONNECTED') RETURNING id
                """, Long.class, "test-" + UUID.randomUUID());
        Long listingId = jdbcTemplate.queryForObject("""
                INSERT INTO channel_listings (channel_id, variant_id, external_listing_id, allocated_quota, reported_stock)
                VALUES (?, ?, ?, 5, 0) RETURNING id
                """, Long.class, channelId, fixture.variantId(), "external-" + UUID.randomUUID());

        mockMvc.perform(post("/api/v1/channels/{channelId}/inventory/{listingId}/reconcile", channelId, listingId)
                        .with(csrf()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("CHANNEL_DELIVERY_UNAVAILABLE"));

        assertEquals("UNVERIFIED", jdbcTemplate.queryForObject(
                "SELECT sync_status FROM channel_listings WHERE id = ?", String.class, listingId));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT reported_stock FROM channel_listings WHERE id = ?", Integer.class, listingId));
    }

    @Test
    void systemCapabilitiesReportUndeliveredSubsystemsAsUnavailable() throws Exception {
        mockMvc.perform(get("/api/v1/system"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.marketplace_connected").value(false))
                .andExpect(jsonPath("$.shopify_connection_verified").value(false))
                .andExpect(jsonPath("$.sync_delivery_available").value(false))
                .andExpect(jsonPath("$.sync_stream_available").value(false))
                .andExpect(jsonPath("$.simulator_delivery_available").value(false))
                .andExpect(jsonPath("$.ai_available").value(false));
    }

    private boolean tryReserve(Fixture fixture, String key, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        try {
            reservationService.reserve(new ReserveStockRequest(fixture.sku(), 1, null, 15), key);
            return true;
        } catch (BusinessRuleException ex) {
            return false;
        }
    }

    private void adjustAfterGate(Fixture fixture, String key, CountDownLatch ready, CountDownLatch start) {
        try {
            ready.countDown();
            start.await();
            inventoryService.adjustInventory(new InventoryAdjustRequest(fixture.sku(), 1, "initial count", null), key);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(ex);
        }
    }

    private com.octoflow.api.dto.response.InventorySnapshotResponse adjustSameKey(
            Fixture fixture, InventoryAdjustRequest request, String key,
            CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return inventoryService.adjustInventory(request, key);
    }

    private long outboxCount(Fixture fixture) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE aggregate_type = 'INVENTORY' AND aggregate_id = ?",
                Long.class, fixture.variantId().toString());
    }

    private InventoryBalance balance(Fixture fixture) {
        return balanceRepository.findByVariantId(fixture.variantId()).orElseThrow();
    }

    private Fixture fixture(int onHand, int reserved, int safetyBuffer) {
        Fixture fixture = fixtureWithoutBalance();
        saveBalance(fixture, onHand, reserved, safetyBuffer);
        return fixture;
    }

    private Fixture fixtureWithSku(String sku, int onHand, int reserved, int safetyBuffer) {
        Fixture fixture = fixtureWithoutBalance(sku);
        saveBalance(fixture, onHand, reserved, safetyBuffer);
        return fixture;
    }

    private void saveBalance(Fixture fixture, int onHand, int reserved, int safetyBuffer) {
        jdbcTemplate.update("""
                INSERT INTO inventory_balances (variant_id, on_hand, reserved, safety_buffer)
                VALUES (?, ?, ?, ?)
                """, fixture.variantId(), onHand, reserved, safetyBuffer);
    }

    private Fixture fixtureWithoutBalance() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        return fixtureWithoutBalance("FND-" + suffix);
    }

    private Fixture fixtureWithoutBalance(String sku) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        Product product = new Product();
        product.setName("Foundation Test " + suffix);
        product.setStatus(Product.Status.PUBLISHED);
        product = productRepository.saveAndFlush(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(sku);
        variant.setTitle("Foundation test variant");
        variant.setPrice(1000L);
        variant = variantRepository.saveAndFlush(variant);
        return new Fixture(product.getId(), variant.getId(), variant.getSku());
    }

    private record Fixture(Long productId, Long variantId, String sku) {}
}
