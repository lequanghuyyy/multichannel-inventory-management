package com.octoflow.api;

import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.Reservation;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReceiptRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.ProductService;
import com.octoflow.api.service.OrderService;
import com.octoflow.api.service.ReservationService;
import com.octoflow.api.service.ReceiptService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.security.test.context.support.WithMockUser;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
    @Autowired ReceiptRepository receiptRepository;
    @Autowired OrderRepository orderRepository;
    @Autowired InventoryService inventoryService;
    @Autowired ReservationService reservationService;
    @Autowired ReceiptService receiptService;
    @Autowired OrderService orderService;
    @Autowired ProductService productService;

    @Test
    void cleanPostgresRunsAllMigrationsAndJPAValidatesTheSchema() {
        assertEquals(4, flyway.info().applied().length);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'idempotency_records'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'outbox_events' AND column_name = 'event_id'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'channel_id'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_orders_channel_external_order'", Integer.class) == 1);
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

    @Test
    @WithMockUser(roles = "STAFF")
    void staffCannotForgePosOrderSourceExternalIdentityOrUnitPrice() throws Exception {
        Fixture fixture = fixture(4, 0, 0);
        long ordersBefore = orderRepository.count();

        mockMvc.perform(post("/api/v1/orders")
                        .with(csrf())
                        .header("Idempotency-Key", "order-source-" + UUID.randomUUID())
                        .contentType("application/json")
                        .content("{\"source\":\"SHOPIFY\",\"items\":[{\"sku\":\"" + fixture.sku()
                                + "\",\"quantity\":1}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("ORDER_SOURCE_FORBIDDEN"));

        mockMvc.perform(post("/api/v1/orders")
                        .with(csrf())
                        .header("Idempotency-Key", "order-external-" + UUID.randomUUID())
                        .contentType("application/json")
                        .content("{\"source\":\"POS\",\"externalOrderId\":\"forged-1\",\"items\":[{\"sku\":\""
                                + fixture.sku() + "\",\"quantity\":1}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("ORDER_SOURCE_FORBIDDEN"));

        mockMvc.perform(post("/api/v1/orders")
                        .with(csrf())
                        .header("Idempotency-Key", "order-price-" + UUID.randomUUID())
                        .contentType("application/json")
                        .content("{\"source\":\"POS\",\"items\":[{\"sku\":\"" + fixture.sku()
                                + "\",\"quantity\":1,\"unitPrice\":1}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("PRICE_OR_STOCK_CHANGED"));

        assertEquals(0, balance(fixture).getReserved());
        assertEquals(ordersBefore, orderRepository.count());

        // A matching expected price is allowed, but the server price remains authoritative.
        var created = orderService.createOrder(new CreateOrderRequest("POS", null,
                        List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 1, 1000L))),
                "order-expected-price-" + UUID.randomUUID());
        assertEquals(1000L, created.totalAmount());
        assertEquals(1, created.items().size());
        assertEquals(1000L, created.items().getFirst().unitPrice());
        assertEquals(1, balance(fixture).getReserved());
        assertEquals(ordersBefore + 1, orderRepository.count());
    }

    @Test
    void duplicateSkuOrderLinesUseAggregateAvailabilityAndMergeIntoOneItem() {
        Fixture fixture = fixture(3, 0, 0);
        long ordersBefore = orderRepository.count();

        BusinessRuleException insufficient = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(new CreateOrderRequest("POS", null, List.of(
                        new CreateOrderRequest.OrderItemRequest(fixture.sku(), 2, null),
                        new CreateOrderRequest.OrderItemRequest(" " + fixture.sku() + " ", 2, null))),
                        "order-aggregate-" + UUID.randomUUID()));
        assertEquals("INSUFFICIENT_STOCK", insufficient.getErrorCode().getCode());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(ordersBefore, orderRepository.count());

        var created = orderService.createOrder(new CreateOrderRequest("POS", null, List.of(
                        new CreateOrderRequest.OrderItemRequest(fixture.sku(), 2, 1000L),
                        new CreateOrderRequest.OrderItemRequest(fixture.sku(), 1, 1000L))),
                "order-merged-" + UUID.randomUUID());
        assertEquals(1, created.items().size());
        assertEquals(3, created.items().getFirst().quantity());
        assertEquals(3000L, created.totalAmount());
        assertEquals(3, balance(fixture).getReserved());
    }

    @Test
    void orderMoneyCurrencyQuantityAndExpectedPriceValidationRejectInvalidValues() {
        Fixture fixture = fixture(2, 0, 0);
        jdbcTemplate.update("UPDATE product_variants SET price = ? WHERE id = ?", Long.MAX_VALUE, fixture.variantId());

        BusinessRuleException overflow = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(new CreateOrderRequest("POS", null,
                                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 2, null))),
                        "order-overflow-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", overflow.getErrorCode().getCode());
        assertEquals(0, balance(fixture).getReserved());

        jdbcTemplate.update("UPDATE product_variants SET price = 1000, currency = 'USD' WHERE id = ?", fixture.variantId());
        BusinessRuleException currency = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(new CreateOrderRequest("POS", null,
                                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 1, null))),
                        "order-currency-" + UUID.randomUUID()));
        assertEquals("INVALID_CURRENCY", currency.getErrorCode().getCode());

        jdbcTemplate.update("UPDATE product_variants SET currency = 'VND' WHERE id = ?", fixture.variantId());
        BusinessRuleException zeroQuantity = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(new CreateOrderRequest("POS", null,
                                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 0, null))),
                        "order-zero-qty-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", zeroQuantity.getErrorCode().getCode());

        BusinessRuleException expectedPrice = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(new CreateOrderRequest("POS", null,
                                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 1, 999L))),
                        "order-price-check-" + UUID.randomUUID()));
        assertEquals("PRICE_OR_STOCK_CHANGED", expectedPrice.getErrorCode().getCode());
        assertEquals(0, balance(fixture).getReserved());
    }

    @Test
    void concurrentMultiSkuOrdersUseCanonicalLockOrderAndBothCommit() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        Fixture low = fixtureWithSku("LOCK-A-" + suffix, 2, 0, 0);
        Fixture high = fixtureWithSku("LOCK-B-" + suffix, 2, 0, 0);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> first = pool.submit(() -> createOrderAfterGate(
                    List.of(low.sku(), high.sku()), ready, start));
            Future<OrderResponse> second = pool.submit(() -> createOrderAfterGate(
                    List.of(high.sku(), low.sku()), ready, start));
            ready.await();
            start.countDown();

            assertNotEquals(first.get(15, TimeUnit.SECONDS).id(),
                    second.get(15, TimeUnit.SECONDS).id());
        } finally {
            pool.shutdownNow();
        }

        assertEquals(2, balance(low).getReserved());
        assertEquals(2, balance(high).getReserved());
        assertEquals(2, ledgerCount(low));
        assertEquals(2, ledgerCount(high));
    }

    @Test
    void channelOrderIdentityIgnoresIdempotencyKeyAndRejectsChangedPayload() {
        Fixture fixture = fixture(5, 0, 0);
        Long channelId = insertChannel();
        String externalOrderId = "SHOPIFY-" + UUID.randomUUID();
        long ordersBefore = orderRepository.count();
        ChannelOrderCommand command = new ChannelOrderCommand(channelId, Order.Source.SHOPIFY,
                externalOrderId, "VND",
                List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 2)));

        var first = orderService.createChannelOrder(command, "channel-order-a-" + UUID.randomUUID());
        var replay = orderService.createChannelOrder(command, "channel-order-b-" + UUID.randomUUID());

        assertEquals(first.id(), replay.id());
        assertEquals(ordersBefore + 1, orderRepository.count());
        assertEquals(2, balance(fixture).getReserved());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(channelId, first.channelId());
        assertEquals("SHOPIFY", first.source());
        assertEquals(externalOrderId, first.externalOrderId());

        ApiException changedItems = assertThrows(ApiException.class, () -> orderService.createChannelOrder(
                new ChannelOrderCommand(channelId, Order.Source.SHOPIFY, externalOrderId, "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 3))),
                "channel-order-c-" + UUID.randomUUID()));
        assertEquals("EXTERNAL_ORDER_CONFLICT", changedItems.getErrorCode().getCode());
        assertEquals(409, changedItems.getStatus().value());

        ApiException changedSource = assertThrows(ApiException.class, () -> orderService.createChannelOrder(
                new ChannelOrderCommand(channelId, Order.Source.WOOCOMMERCE, externalOrderId, "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 2))),
                "channel-order-d-" + UUID.randomUUID()));
        assertEquals("EXTERNAL_ORDER_CONFLICT", changedSource.getErrorCode().getCode());

        assertEquals(ordersBefore + 1, orderRepository.count());
        assertEquals(2, balance(fixture).getReserved());

        // The same external id under a different channel is a different marketplace identity.
        Long otherChannelId = insertChannel();
        var otherChannel = orderService.createChannelOrder(new ChannelOrderCommand(otherChannelId,
                        Order.Source.SHOPIFY, externalOrderId, "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 1))),
                "channel-order-e-" + UUID.randomUUID());
        assertNotEquals(first.id(), otherChannel.id());
        assertEquals(ordersBefore + 2, orderRepository.count());
        assertEquals(3, balance(fixture).getReserved());
    }

    @Test
    void concurrentDuplicateChannelDeliveriesCreateAndReserveOnce() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        Long channelId = insertChannel();
        ChannelOrderCommand command = new ChannelOrderCommand(channelId, Order.Source.SHOPIFY,
                "RACE-" + UUID.randomUUID(), "VND",
                List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 2)));
        long ordersBefore = orderRepository.count();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> first = pool.submit(() -> createChannelOrderAfterGate(command, ready, start));
            Future<OrderResponse> second = pool.submit(() -> createChannelOrderAfterGate(command, ready, start));
            ready.await();
            start.countDown();

            assertEquals(first.get(15, TimeUnit.SECONDS).id(),
                    second.get(15, TimeUnit.SECONDS).id());
        } finally {
            pool.shutdownNow();
        }

        assertEquals(ordersBefore + 1, orderRepository.count());
        assertEquals(2, balance(fixture).getReserved());
        assertEquals(1, ledgerCount(fixture));
    }

    @Test
    void concurrentPaymentConfirmationsDeductReservedStockOnce() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        Fixture low = fixtureWithSku("PAY-A-" + suffix, 2, 0, 0);
        Fixture high = fixtureWithSku("PAY-B-" + suffix, 2, 0, 0);
        var order = orderService.createOrder(new CreateOrderRequest("POS", null, List.of(
                        new CreateOrderRequest.OrderItemRequest(high.sku(), 1, null),
                        new CreateOrderRequest.OrderItemRequest(low.sku(), 1, null))),
                "payment-setup-" + UUID.randomUUID());
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> first = pool.submit(() -> confirmPaymentAfterGate(order.id(), ready, start));
            Future<OrderResponse> second = pool.submit(() -> confirmPaymentAfterGate(order.id(), ready, start));
            ready.await();
            start.countDown();

            assertEquals("PAID", first.get(15, TimeUnit.SECONDS).paymentStatus());
            assertEquals("PAID", second.get(15, TimeUnit.SECONDS).paymentStatus());
        } finally {
            pool.shutdownNow();
        }

        assertEquals(1, balance(low).getOnHand());
        assertEquals(0, balance(low).getReserved());
        assertEquals(1, balance(high).getOnHand());
        assertEquals(0, balance(high).getReserved());
        assertEquals(2, ledgerCount(low));
        assertEquals(2, ledgerCount(high));
    }

    @Test
    void productValidationRejectsInvalidCatalogDataWithoutPersistingIt() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String baseSku = "CAT-" + suffix;
        long productsBefore = productRepository.count();
        long variantsBefore = variantRepository.count();

        BusinessRuleException blankName = assertThrows(BusinessRuleException.class,
                () -> productService.createProduct(new CreateProductRequest("   ", null, null,
                                List.of(new CreateProductRequest.CreateVariantRequest(
                                        baseSku + "-N", "Default", 100L, "VND", 0))),
                        "product-blank-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", blankName.getErrorCode().getCode());

        BusinessRuleException negativePrice = assertThrows(BusinessRuleException.class,
                () -> productService.createProduct(new CreateProductRequest("Negative price " + suffix, null, null,
                                List.of(new CreateProductRequest.CreateVariantRequest(
                                        baseSku + "-P", "Default", -1L, "VND", 0))),
                        "product-negative-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", negativePrice.getErrorCode().getCode());

        BusinessRuleException duplicateInRequest = assertThrows(BusinessRuleException.class,
                () -> productService.createProduct(new CreateProductRequest("Duplicate sku " + suffix, null, null,
                                List.of(
                                        new CreateProductRequest.CreateVariantRequest(
                                                baseSku + "-D", "Default", 100L, "VND", 0),
                                        new CreateProductRequest.CreateVariantRequest(
                                                baseSku + "-D", "Second", 100L, "VND", 0))),
                        "product-duplicate-request-" + UUID.randomUUID()));
        assertEquals("DUPLICATE_SKU", duplicateInRequest.getErrorCode().getCode());

        BusinessRuleException invalidCurrency = assertThrows(BusinessRuleException.class,
                () -> productService.createProduct(new CreateProductRequest("Invalid currency " + suffix, null, null,
                                List.of(new CreateProductRequest.CreateVariantRequest(
                                        baseSku + "-C", "Default", 100L, "US", 0))),
                        "product-currency-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", invalidCurrency.getErrorCode().getCode());

        assertEquals(productsBefore, productRepository.count());
        assertEquals(variantsBefore, variantRepository.count());

        Fixture existing = fixtureWithoutBalance();
        long productsAfterFixture = productRepository.count();
        BusinessRuleException duplicateInDatabase = assertThrows(BusinessRuleException.class,
                () -> productService.createProduct(new CreateProductRequest("Duplicate database sku " + suffix, null, null,
                                List.of(new CreateProductRequest.CreateVariantRequest(
                                        existing.sku(), "Default", 100L, "VND", 0))),
                        "product-duplicate-db-" + UUID.randomUUID()));
        assertEquals("DUPLICATE_SKU", duplicateInDatabase.getErrorCode().getCode());
        assertEquals(productsAfterFixture, productRepository.count());

        var created = productService.createProduct(new CreateProductRequest("Validated product " + suffix, null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(
                                baseSku + "-V", "Default", 100L, "vnd", 0))),
                "product-valid-" + UUID.randomUUID());
        assertEquals("DRAFT", created.status());
        assertEquals("VND", created.variants().getFirst().currency());
        assertEquals(0, created.variants().getFirst().onHand());

        BusinessRuleException blankUpdate = assertThrows(BusinessRuleException.class,
                () -> productService.updateProduct(created.id(),
                        new UpdateProductRequest("   ", null, null, null)));
        assertEquals("BAD_REQUEST", blankUpdate.getErrorCode().getCode());

        ApiException invalidStatus = assertThrows(ApiException.class,
                () -> productService.updateProduct(created.id(),
                        new UpdateProductRequest(null, null, null, "BOGUS")));
        assertEquals("BAD_REQUEST", invalidStatus.getErrorCode().getCode());

        var reloaded = productService.getProductById(created.id());
        assertEquals("Validated product " + suffix, reloaded.name());
        assertEquals("DRAFT", reloaded.status());
        assertEquals(0, balanceRepository.findByVariantId(created.variants().getFirst().id())
                .orElseThrow().getOnHand());
    }

    @Test
    void partialReceiptReceivingIsCumulativeAndLedgerBooksOnlyStockIncreases() {
        Fixture fixture = fixtureWithoutBalance();
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 5, 100L))),
                "receipt-partial-create-" + UUID.randomUUID());
        Long itemId = receipt.items().getFirst().id();

        var first = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 2, 0))),
                "receipt-partial-a-" + UUID.randomUUID());
        assertEquals("RECEIVING", first.status());
        assertEquals(2, first.items().getFirst().acceptedQty());
        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        // Repeating the same cumulative counts with a new key must not add stock or ledger rows.
        var repeat = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 2, 0))),
                "receipt-partial-b-" + UUID.randomUUID());
        assertEquals("RECEIVING", repeat.status());
        assertEquals(2, repeat.items().getFirst().acceptedQty());
        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        var completed = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 5, 0))),
                "receipt-partial-c-" + UUID.randomUUID());
        assertEquals("COMPLETED", completed.status());
        assertEquals(5, completed.items().getFirst().acceptedQty());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, outboxCount(fixture));

        BusinessRuleException closed = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(itemId, 5, 0))),
                        "receipt-partial-d-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", closed.getErrorCode().getCode());

        var deltas = jdbcTemplate.queryForList(
                        "SELECT delta FROM inventory_ledger WHERE variant_id = ? ORDER BY id",
                        Integer.class, fixture.variantId());
        assertEquals(List.of(2, 3), deltas);
    }

    @Test
    void receiptReceivingValidatesExpectedQuantitiesAndMonotonicCounts() {
        Fixture first = fixtureWithoutBalance();
        Fixture second = fixtureWithoutBalance();
        saveBalance(first, 0, 0, 0);
        saveBalance(second, 0, 0, 0);
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(first.variantId(), 3, 100L),
                                new CreateReceiptRequest.ReceiptItemRequest(second.variantId(), 2, 100L))),
                "receipt-validation-" + UUID.randomUUID());
        Long firstItem = receipt.items().stream()
                .filter(item -> item.variantId().equals(first.variantId())).findFirst().orElseThrow().id();
        Long secondItem = receipt.items().stream()
                .filter(item -> item.variantId().equals(second.variantId())).findFirst().orElseThrow().id();

        BusinessRuleException overExpected = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 2, 2))),
                        "receipt-over-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", overExpected.getErrorCode().getCode());
        assertEquals(0, balance(first).getOnHand());
        assertEquals("DRAFT", receiptRepository.findById(receipt.id()).orElseThrow().getStatus().name());

        BusinessRuleException duplicateLine = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 0),
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 0))),
                        "receipt-duplicate-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", duplicateLine.getErrorCode().getCode());

        BusinessRuleException unknownLine = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(secondItem + 999_999L, 1, 0))),
                        "receipt-unknown-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", unknownLine.getErrorCode().getCode());

        var partial = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(firstItem, 1, 1))),
                "receipt-partial-" + UUID.randomUUID());
        assertEquals("RECEIVING", partial.status());
        assertEquals(1, balance(first).getOnHand());

        BusinessRuleException decreasedRejected = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 0))),
                        "receipt-decrease-rejected-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", decreasedRejected.getErrorCode().getCode());

        BusinessRuleException decreasedAccepted = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 0, 1))),
                        "receipt-decrease-accepted-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", decreasedAccepted.getErrorCode().getCode());

        assertEquals(1, balance(first).getOnHand());
        assertEquals(0, balance(second).getOnHand());
    }

    @Test
    void concurrentReceiptsForTheSameVariantDoNotLoseAcceptedStock() throws Exception {
        Fixture fixture = fixtureWithoutBalance();
        var firstReceipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier A",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 1, 100L))),
                "receipt-race-create-a-" + UUID.randomUUID());
        var secondReceipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier B",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 1, 100L))),
                "receipt-race-create-b-" + UUID.randomUUID());
        Long firstItem = firstReceipt.items().getFirst().id();
        Long secondItem = secondReceipt.items().getFirst().id();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<ReceiptResponse> first = pool.submit(() -> receiveAfterGate(
                    firstReceipt.id(), firstItem, ready, start));
            Future<ReceiptResponse> second = pool.submit(() -> receiveAfterGate(
                    secondReceipt.id(), secondItem, ready, start));
            ready.await();
            start.countDown();

            assertEquals("COMPLETED", first.get(15, TimeUnit.SECONDS).status());
            assertEquals("COMPLETED", second.get(15, TimeUnit.SECONDS).status());
        } finally {
            pool.shutdownNow();
        }

        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, outboxCount(fixture));
    }

    @Test
    void expirySweepIsolatesInvalidReservationAndStillExpiresValidHolds() {
        Fixture broken = fixture(1, 0, 0);
        Fixture valid = fixture(1, 0, 0);
        var brokenHold = reservationService.reserve(
                new ReserveStockRequest(broken.sku(), 1, null, 15),
                "expiry-broken-" + UUID.randomUUID());
        var validHold = reservationService.reserve(
                new ReserveStockRequest(valid.sku(), 1, null, 15),
                "expiry-valid-" + UUID.randomUUID());

        jdbcTemplate.update("UPDATE inventory_balances SET reserved = 0 WHERE variant_id = ?", broken.variantId());
        jdbcTemplate.update("""
                UPDATE reservations SET expires_at = clock_timestamp() - interval '1 minute'
                WHERE id IN (?, ?)
                """, brokenHold.id(), validHold.id());

        var result = reservationService.expireHolds();

        assertEquals(1, result.expired());
        assertEquals(0, result.skipped());
        assertEquals(1, result.failed());
        assertEquals(Reservation.Status.EXPIRED,
                reservationRepository.findById(validHold.id()).orElseThrow().getStatus());
        assertEquals(Reservation.Status.ACTIVE,
                reservationRepository.findById(brokenHold.id()).orElseThrow().getStatus());
        assertEquals(0, balance(valid).getReserved());
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT reserved FROM inventory_balances WHERE variant_id = ?", Integer.class, broken.variantId()));
        assertEquals(2, ledgerCount(valid));
        assertEquals(1, ledgerCount(broken));
        assertEquals("RESERVATION_EXPIRED", jdbcTemplate.queryForObject("""
                SELECT operation FROM inventory_ledger
                WHERE variant_id = ? ORDER BY id DESC LIMIT 1
                """, String.class, valid.variantId()));

        // Resolve the intentionally corrupt hold so it cannot leak into a later sweep test.
        jdbcTemplate.update("UPDATE inventory_balances SET reserved = 1 WHERE variant_id = ?", broken.variantId());
        reservationService.release(brokenHold.id());
        assertEquals(Reservation.Status.EXPIRED,
                reservationRepository.findById(brokenHold.id()).orElseThrow().getStatus());
    }

    @Test
    void releaseAfterExpiryMarksExpiredAndConfirmAfterExpiryDoesNotDeductStock() {
        Fixture fixture = fixture(3, 0, 0);
        var releaseHold = reservationService.reserve(
                new ReserveStockRequest(fixture.sku(), 1, null, 15),
                "expiry-release-" + UUID.randomUUID());
        var confirmHold = reservationService.reserve(
                new ReserveStockRequest(fixture.sku(), 1, null, 15),
                "expiry-confirm-" + UUID.randomUUID());
        jdbcTemplate.update("""
                UPDATE reservations SET expires_at = clock_timestamp() - interval '1 minute'
                WHERE id IN (?, ?)
                """, releaseHold.id(), confirmHold.id());

        BusinessRuleException expired = assertThrows(BusinessRuleException.class,
                () -> reservationService.confirmSale(confirmHold.id(),
                        "expired-confirm-" + UUID.randomUUID()));
        assertEquals("RESERVATION_EXPIRED", expired.getErrorCode().getCode());
        assertEquals(Reservation.Status.ACTIVE,
                reservationRepository.findById(confirmHold.id()).orElseThrow().getStatus());
        assertEquals(3, balance(fixture).getOnHand());
        assertEquals(2, balance(fixture).getReserved());

        reservationService.release(releaseHold.id());

        assertEquals(Reservation.Status.EXPIRED,
                reservationRepository.findById(releaseHold.id()).orElseThrow().getStatus());
        assertEquals(3, balance(fixture).getOnHand());
        assertEquals(1, balance(fixture).getReserved());
        assertEquals("RESERVATION_EXPIRED", jdbcTemplate.queryForObject("""
                SELECT operation FROM inventory_ledger
                WHERE variant_id = ? ORDER BY id DESC LIMIT 1
                """, String.class, fixture.variantId()));

        // Resolve the second overdue hold as well so no stale ACTIVE candidate leaks forward.
        reservationService.release(confirmHold.id());
        assertEquals(Reservation.Status.EXPIRED,
                reservationRepository.findById(confirmHold.id()).orElseThrow().getStatus());
        assertEquals(0, balance(fixture).getReserved());
    }

    @Test
    void v4DatabaseConstraintsBackstopOrderIdentityAndCatalogIntegrity() {
        Long channelId = insertChannel();
        String externalOrderId = "DB-" + UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, channel_id, external_order_id)
                VALUES (?, 'SHOPIFY', 'PLACED', 'PENDING', 0, 'VND', ?, ?)
                """, "DB-ORD-" + UUID.randomUUID(), channelId, externalOrderId);

        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, channel_id, external_order_id)
                VALUES (?, 'SHOPIFY', 'PLACED', 'PENDING', 0, 'VND', ?, ?)
                """, "DB-ORD-" + UUID.randomUUID(), channelId, externalOrderId));

        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, external_order_id)
                VALUES (?, 'POS', 'PLACED', 'PENDING', 0, 'VND', 'forged')
                """, "DB-POS-" + UUID.randomUUID()));

        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, channel_id)
                VALUES (?, 'SHOPIFY', 'PLACED', 'PENDING', 0, 'VND', ?)
                """, "DB-NO-EXT-" + UUID.randomUUID(), channelId));

        // Legacy non-POS rows without a channel remain valid until Phase 02 backfills channels.
        jdbcTemplate.update("""
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, external_order_id)
                VALUES (?, 'EBAY', 'PLACED', 'PENDING', 0, 'VND', ?)
                """, "DB-LEGACY-" + UUID.randomUUID(), "legacy-" + UUID.randomUUID());

        Fixture fixture = fixtureWithoutBalance();
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO product_variants (product_id, sku, title, price, currency)
                VALUES (?, ?, 'Negative', -1, 'VND')
                """, fixture.productId(), "NEG-" + UUID.randomUUID()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update(
                "INSERT INTO products (name, status) VALUES (?, 'BOGUS')",
                "Invalid status " + UUID.randomUUID()));

        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 1, 100L))),
                "receipt-constraint-" + UUID.randomUUID());
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update(
                "UPDATE receipt_items SET accepted_qty = 1, rejected_qty = 1 WHERE id = ?",
                receipt.items().getFirst().id()));
    }

    @Test
    void channelOrderBoundaryRejectsPosSourceUnsupportedCurrencyAndMalformedIdentity() {
        Fixture fixture = fixture(2, 0, 0);
        Long channelId = insertChannel();
        long ordersBefore = orderRepository.count();
        List<ChannelOrderCommand.ChannelOrderLine> lines = List.of(
                new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 1));

        ApiException posSource = assertThrows(ApiException.class, () -> orderService.createChannelOrder(
                new ChannelOrderCommand(channelId, Order.Source.POS, "EXT-1", "VND", lines),
                "channel-invalid-source-" + UUID.randomUUID()));
        assertEquals("ORDER_SOURCE_FORBIDDEN", posSource.getErrorCode().getCode());

        BusinessRuleException identity = assertThrows(BusinessRuleException.class,
                () -> orderService.createChannelOrder(new ChannelOrderCommand(channelId,
                                Order.Source.SHOPIFY, "bad id *", "VND", lines),
                        "channel-invalid-id-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", identity.getErrorCode().getCode());

        BusinessRuleException currency = assertThrows(BusinessRuleException.class,
                () -> orderService.createChannelOrder(new ChannelOrderCommand(channelId,
                                Order.Source.SHOPIFY, "EXT-2", "USD", lines),
                        "channel-invalid-currency-" + UUID.randomUUID()));
        assertEquals("INVALID_CURRENCY", currency.getErrorCode().getCode());

        BusinessRuleException quantity = assertThrows(BusinessRuleException.class,
                () -> orderService.createChannelOrder(new ChannelOrderCommand(channelId,
                                Order.Source.SHOPIFY, "EXT-3", "VND",
                                List.of(new ChannelOrderCommand.ChannelOrderLine(fixture.sku(), 0))),
                        "channel-invalid-qty-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", quantity.getErrorCode().getCode());

        assertEquals(0, balance(fixture).getReserved());
        assertEquals(ordersBefore, orderRepository.count());
    }

    private OrderResponse createOrderAfterGate(List<String> skus,
                                               CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        List<CreateOrderRequest.OrderItemRequest> items = skus.stream()
                .map(sku -> new CreateOrderRequest.OrderItemRequest(sku, 1, null))
                .toList();
        return orderService.createOrder(new CreateOrderRequest("POS", null, items),
                "multi-sku-" + UUID.randomUUID());
    }

    private OrderResponse createChannelOrderAfterGate(ChannelOrderCommand command,
                                                      CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return orderService.createChannelOrder(command, "channel-race-" + UUID.randomUUID());
    }

    private OrderResponse confirmPaymentAfterGate(Long orderId,
                                                  CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return orderService.confirmPayment(orderId, "payment-race-" + UUID.randomUUID());
    }

    private ReceiptResponse receiveAfterGate(Long receiptId, Long itemId,
                                             CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return receiptService.receiveStock(receiptId, new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 1, 0))),
                "receipt-race-" + UUID.randomUUID());
    }

    private Long insertChannel() {
        return jdbcTemplate.queryForObject("""
                INSERT INTO channels (code, name, environment, status)
                VALUES (?, 'Test channel', 'sandbox', 'CONNECTED') RETURNING id
                """, Long.class, "test-" + UUID.randomUUID());
    }

    private long ledgerCount(Fixture fixture) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM inventory_ledger WHERE variant_id = ?",
                Long.class, fixture.variantId());
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
