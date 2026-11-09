package com.octoflow.api;

import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.AddProductVariantRequest;
import com.octoflow.api.dto.request.CancelOrderRequest;
import com.octoflow.api.dto.request.CancelReceiptRequest;
import com.octoflow.api.dto.request.CloseShortRequest;
import com.octoflow.api.dto.request.HandoverOrderRequest;
import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.request.OrderTransitionRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.RecordPaymentRequest;
import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.request.UpdateProductVariantRequest;
import com.octoflow.api.dto.request.UpdateReceiptRequest;
import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.response.OrderHistoryResponse;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.dto.response.ReservationResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.OrderStatusHistory;
import com.octoflow.api.entity.PosPaymentDetail;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.Reservation;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.OrderStatusHistoryRepository;
import com.octoflow.api.repository.PosPaymentDetailRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReceiptRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.repository.VariantUpdateAuditRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.security.test.context.support.WithMockUser;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
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
    @Autowired OrderStatusHistoryRepository orderStatusHistoryRepository;
    @Autowired PosPaymentDetailRepository posPaymentDetailRepository;
    @Autowired ChannelListingRepository channelListingRepository;
    @Autowired VariantUpdateAuditRepository variantUpdateAuditRepository;
    @Autowired InventoryService inventoryService;
    @Autowired ReservationService reservationService;
    @Autowired ReceiptService receiptService;
    @Autowired OrderService orderService;
    @Autowired ProductService productService;
    @Autowired PlatformTransactionManager transactionManager;
    @PersistenceContext EntityManager entityManager;
    @Autowired ObjectMapper objectMapper;

    @Test
    void cleanPostgresRunsAllMigrationsAndJPAValidatesTheSchema() {
        assertEquals(7, flyway.info().applied().length);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'idempotency_records'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'outbox_events' AND column_name = 'event_id'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'channel_id'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_orders_channel_external_order'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'version'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'receipt_events'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'receipt_events' AND column_name = 'payload'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'variant_update_audit'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'order_status_history'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'pos_payment_details'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'hold_expires_at'", Integer.class) == 1);
        assertTrue(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'receipt_event_items'", Integer.class) == 1);
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
    void partialReceiptReceivingAddsOnlyEachBatchDeltaAndLedgerBooksOnlyAcceptedStock() {
        Fixture fixture = fixtureWithoutBalance();
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 5, 100L))),
                "receipt-partial-create-" + UUID.randomUUID());
        Long itemId = receipt.items().getFirst().id();
        String firstBatchKey = "receipt-partial-a-" + UUID.randomUUID();

        var first = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 2, 0))),
                firstBatchKey);
        assertEquals("PARTIALLY_RECEIVED", first.status());
        assertEquals(1L, first.version());
        assertEquals(2, first.items().getFirst().acceptedQty());
        assertEquals(3, first.items().getFirst().remainingQty());
        assertEquals(1, first.batches().size());
        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        // Replaying the same physical batch with the same key must not add stock again.
        var repeat = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 2, 0))),
                firstBatchKey);
        assertEquals(first, repeat);
        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        // A fresh key with no accepted/rejected quantity is not a meaningful batch.
        BusinessRuleException emptyBatch = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(itemId, 0, 0))),
                        "receipt-partial-empty-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", emptyBatch.getErrorCode().getCode());

        var completed = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 3, 0))),
                "receipt-partial-c-" + UUID.randomUUID());
        assertEquals("RECEIVED", completed.status());
        assertEquals(2L, completed.version());
        assertEquals(5, completed.items().getFirst().acceptedQty());
        assertEquals(0, completed.items().getFirst().remainingQty());
        assertEquals(2, completed.batches().size());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, outboxCount(fixture));

        BusinessRuleException closed = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(itemId, 1, 0))),
                        "receipt-partial-d-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", closed.getErrorCode().getCode());

        var deltas = jdbcTemplate.queryForList(
                        "SELECT delta FROM inventory_ledger WHERE variant_id = ? ORDER BY id",
                        Integer.class, fixture.variantId());
        assertEquals(List.of(2, 3), deltas);
    }

    @Test
    void receiptReceivingValidatesBatchQuantitiesAndRejectedOnlyBatchesDoNotMoveStock() {
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
                                new ReceiveItemsRequest.ItemInspection(firstItem, 2, 2, "damaged"))),
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

        BusinessRuleException negative = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, -1))),
                        "receipt-negative-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", negative.getErrorCode().getCode());

        BusinessRuleException missingReason = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 1))),
                        "receipt-missing-reason-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", missingReason.getErrorCode().getCode());

        // The preview total is receipt-wide: the untouched second line still counts as remaining.
        var multiLinePreview = receiptService.previewReceive(receipt.id(), new ReceiveItemsRequest(List.of(
                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 1, "torn packaging"))));
        assertTrue(multiLinePreview.valid());
        assertEquals(3, multiLinePreview.remainingTotal());
        assertEquals(0, ledgerCount(first));
        assertEquals(0, ledgerCount(second));

        var partial = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(firstItem, 1, 1, "torn packaging"))),
                "receipt-partial-" + UUID.randomUUID());
        assertEquals("PARTIALLY_RECEIVED", partial.status());
        assertEquals(1, balance(first).getOnHand());
        assertEquals(3, partial.remainingTotal());
        assertEquals(1, ledgerCount(first));
        assertEquals(1, outboxCount(first));

        // Rejected-only batches still produce an audit event, but never an inventory movement.
        var rejectedOnly = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(firstItem, 0, 1, "water damage"))),
                "receipt-rejected-only-" + UUID.randomUUID());
        assertEquals("PARTIALLY_RECEIVED", rejectedOnly.status());
        // The version must advance even though the status stays PARTIALLY_RECEIVED.
        assertEquals(2L, rejectedOnly.version());
        assertEquals(0, rejectedOnly.items().getFirst().remainingQty());
        assertEquals(2, rejectedOnly.batches().size());
        assertEquals(1, balance(first).getOnHand());
        assertEquals(0, balance(second).getOnHand());
        assertEquals(1, ledgerCount(first));
        assertEquals(1, outboxCount(first));

        BusinessRuleException firstComplete = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstItem, 1, 0))),
                        "receipt-first-complete-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", firstComplete.getErrorCode().getCode());

        BusinessRuleException overRemaining = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(secondItem, 3, 0))),
                        "receipt-over-remaining-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", overRemaining.getErrorCode().getCode());

        var completed = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(secondItem, 2, 0))),
                "receipt-complete-" + UUID.randomUUID());
        assertEquals("RECEIVED", completed.status());
        assertEquals(3, completed.acceptedTotal());
        assertEquals(2, completed.rejectedTotal());
        assertEquals(0, completed.remainingTotal());
        assertEquals(1, balance(first).getOnHand());
        assertEquals(2, balance(second).getOnHand());
        assertEquals(1, ledgerCount(first));
        assertEquals(1, ledgerCount(second));
        assertEquals(1, outboxCount(first));
        assertEquals(1, outboxCount(second));
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

            assertEquals("RECEIVED", first.get(15, TimeUnit.SECONDS).status());
            assertEquals("RECEIVED", second.get(15, TimeUnit.SECONDS).status());
        } finally {
            pool.shutdownNow();
        }

        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, outboxCount(fixture));
    }

    @Test
    void scenarioA_productSkuReceivesTwoIndependentBatches() {
        String sku = "SCEN-A-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        var product = productService.createProduct(new CreateProductRequest("Scenario A", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(sku, "Default", 1000L, "VND", 0))),
                "scenario-a-product-" + UUID.randomUUID());
        Fixture fixture = new Fixture(product.id(), product.variants().getFirst().id(), sku);
        assertEquals(0, balance(fixture).getOnHand());

        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Scenario supplier", null,
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 500L))),
                "scenario-a-receipt-" + UUID.randomUUID());
        Long itemId = receipt.items().getFirst().id();
        assertEquals("DRAFT", receipt.status());
        assertEquals(0, balance(fixture).getOnHand());
        assertEquals(0, ledgerCount(fixture));

        ReceiveItemsRequest firstBatch = new ReceiveItemsRequest(List.of(
                new ReceiveItemsRequest.ItemInspection(itemId, 4, 1, "torn carton")));
        var preview = receiptService.previewReceive(receipt.id(), firstBatch);
        assertTrue(preview.valid());
        assertEquals(4, preview.acceptedTotal());
        assertEquals(1, preview.rejectedTotal());
        assertEquals(5, preview.remainingTotal());
        assertEquals(4, preview.items().getFirst().projectedOnHand());
        assertEquals(0, balance(fixture).getOnHand());
        assertEquals(0, ledgerCount(fixture));

        var first = receiptService.receiveStock(receipt.id(), firstBatch,
                "scenario-a-batch-1-" + UUID.randomUUID());
        assertEquals("PARTIALLY_RECEIVED", first.status());
        assertEquals(4, first.items().getFirst().acceptedQty());
        assertEquals(1, first.items().getFirst().rejectedQty());
        assertEquals(5, first.items().getFirst().remainingQty());
        assertEquals(1, first.batches().size());
        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        var completed = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 3, 2, "crushed boxes"))),
                "scenario-a-batch-2-" + UUID.randomUUID());
        assertEquals("RECEIVED", completed.status());
        assertEquals(7, completed.acceptedTotal());
        assertEquals(3, completed.rejectedTotal());
        assertEquals(0, completed.remainingTotal());
        assertEquals(2, completed.batches().size());
        assertEquals(4, completed.batches().get(0).items().getFirst().acceptedQty());
        assertEquals(3, completed.batches().get(1).items().getFirst().acceptedQty());
        assertEquals(sku, completed.items().getFirst().sku());
        assertEquals(7, balance(fixture).getOnHand());
        assertEquals(List.of(4, 3), jdbcTemplate.queryForList(
                "SELECT delta FROM inventory_ledger WHERE variant_id = ? ORDER BY id",
                Integer.class, fixture.variantId()));
        assertEquals(2, outboxCount(fixture));
    }

    @Test
    void scenarioB_closeShortKeepsMissingQuantityOutOfStockAndStopsReceiving() {
        Fixture fixture = fixtureWithoutBalance();
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Scenario B supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 500L))),
                "scenario-b-receipt-" + UUID.randomUUID());
        Long itemId = receipt.items().getFirst().id();

        var partial = receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(itemId, 6, 0))),
                "scenario-b-receive-" + UUID.randomUUID());
        assertEquals("PARTIALLY_RECEIVED", partial.status());
        assertEquals(6, balance(fixture).getOnHand());
        assertEquals(4, partial.remainingTotal());

        var closed = receiptService.closeShort(receipt.id(), new CloseShortRequest(
                        "Supplier could not deliver the rest", partial.version()),
                "scenario-b-close-" + UUID.randomUUID());
        assertEquals("CLOSED_SHORT", closed.status());
        assertEquals("Supplier could not deliver the rest", closed.closeShortReason());
        assertNotNull(closed.closedShortAt());
        assertEquals(4, closed.remainingTotal());
        assertEquals(6, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        BusinessRuleException receiveClosed = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(itemId, 1, 0))),
                        "scenario-b-after-close-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", receiveClosed.getErrorCode().getCode());
        assertEquals(6, balance(fixture).getOnHand());

        // A draft with nothing received is cancelled, not closed short.
        var untouchedDraft = receiptService.createReceipt(new CreateReceiptRequest("Scenario B draft",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 2, 100L))),
                "scenario-b-draft-" + UUID.randomUUID());
        BusinessRuleException closeDraft = assertThrows(BusinessRuleException.class,
                () -> receiptService.closeShort(untouchedDraft.id(), new CloseShortRequest(
                                "supplier never shipped", untouchedDraft.version()),
                        "scenario-b-close-draft-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", closeDraft.getErrorCode().getCode());
    }

    @Test
    void scenarioC_reserveSellAndReleaseKeepAvailableToSellConsistent() {
        Fixture fixture = fixture(7, 0, 1);
        var hold = reservationService.reserve(
                new ReserveStockRequest(fixture.sku(), 2, null, 15),
                "scenario-c-reserve-" + UUID.randomUUID());
        assertEquals(2, balance(fixture).getReserved());
        var afterReserve = inventoryService.getInventoryBySku(fixture.sku());
        assertEquals(7, afterReserve.onHand());
        assertEquals(2, afterReserve.reserved());
        assertEquals(1, afterReserve.safetyBuffer());
        assertEquals(4, afterReserve.availableToSell());

        String confirmKey = "scenario-c-confirm-" + UUID.randomUUID();
        reservationService.confirmSale(hold.id(), confirmKey);
        reservationService.confirmSale(hold.id(), confirmKey);
        var afterSale = inventoryService.getInventoryBySku(fixture.sku());
        assertEquals(5, afterSale.onHand());
        assertEquals(0, afterSale.reserved());
        assertEquals(4, afterSale.availableToSell());

        var releasedHold = reservationService.reserve(
                new ReserveStockRequest(fixture.sku(), 2, null, 15),
                "scenario-c-reserve-release-" + UUID.randomUUID());
        reservationService.release(releasedHold.id());
        var afterRelease = inventoryService.getInventoryBySku(fixture.sku());
        assertEquals(5, afterRelease.onHand());
        assertEquals(0, afterRelease.reserved());
        assertEquals(4, afterRelease.availableToSell());
        assertEquals(Reservation.Status.CANCELLED,
                reservationRepository.findById(releasedHold.id()).orElseThrow().getStatus());
    }

    @Test
    void scenarioD_concurrentBatchesAndMultiSkuRollbackKeepBalancesLedgerAndOutboxConsistent() throws Exception {
        Fixture fixture = fixtureWithoutBalance();
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Scenario D supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 500L))),
                "scenario-d-receipt-" + UUID.randomUUID());
        Long itemId = receipt.items().getFirst().id();
        ReceiveItemsRequest sameBatch = new ReceiveItemsRequest(List.of(
                new ReceiveItemsRequest.ItemInspection(itemId, 4, 0)));
        String sameKey = "scenario-d-same-key-" + UUID.randomUUID();

        CountDownLatch sameReady = new CountDownLatch(2);
        CountDownLatch sameStart = new CountDownLatch(1);
        ExecutorService samePool = Executors.newFixedThreadPool(2);
        try {
            Future<ReceiptResponse> first = samePool.submit(() ->
                    receiveBatchAfterGate(receipt.id(), sameBatch, sameKey, sameReady, sameStart));
            Future<ReceiptResponse> second = samePool.submit(() ->
                    receiveBatchAfterGate(receipt.id(), sameBatch, sameKey, sameReady, sameStart));
            sameReady.await();
            sameStart.countDown();
            assertEquals(4, first.get(15, TimeUnit.SECONDS).acceptedTotal());
            assertEquals(4, second.get(15, TimeUnit.SECONDS).acceptedTotal());
        } finally {
            samePool.shutdownNow();
        }
        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(1, ledgerCount(fixture));
        assertEquals(1, outboxCount(fixture));

        ReceiveItemsRequest overBatch = new ReceiveItemsRequest(List.of(
                new ReceiveItemsRequest.ItemInspection(itemId, 6, 0)));
        CountDownLatch overReady = new CountDownLatch(2);
        CountDownLatch overStart = new CountDownLatch(1);
        ExecutorService overPool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> first = overPool.submit(() -> tryReceiveAfterGate(receipt.id(), overBatch,
                    "scenario-d-over-a-" + UUID.randomUUID(), overReady, overStart));
            Future<Boolean> second = overPool.submit(() -> tryReceiveAfterGate(receipt.id(), overBatch,
                    "scenario-d-over-b-" + UUID.randomUUID(), overReady, overStart));
            overReady.await();
            overStart.countDown();
            assertTrue(first.get(15, TimeUnit.SECONDS) ^ second.get(15, TimeUnit.SECONDS));
        } finally {
            overPool.shutdownNow();
        }
        assertEquals(10, balance(fixture).getOnHand());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, outboxCount(fixture));
        assertEquals("RECEIVED", receiptRepository.findById(receipt.id()).orElseThrow().getStatus().name());

        // A second SKU whose balance cannot accept the batch forces the whole multi-SKU batch to
        // roll back after the first balance has already been touched in memory.
        Fixture firstLine = fixtureWithoutBalance();
        Fixture overflowLine = fixtureWithoutBalance();
        saveBalance(firstLine, 0, 0, 0);
        saveBalance(overflowLine, Integer.MAX_VALUE - 1, 0, 0);
        var rollbackReceipt = receiptService.createReceipt(new CreateReceiptRequest("Rollback supplier",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(firstLine.variantId(), 2, 100L),
                                new CreateReceiptRequest.ReceiptItemRequest(overflowLine.variantId(), 2, 100L))),
                "scenario-d-rollback-receipt-" + UUID.randomUUID());
        Long firstLineItem = rollbackReceipt.items().stream()
                .filter(item -> item.variantId().equals(firstLine.variantId())).findFirst().orElseThrow().id();
        Long overflowItem = rollbackReceipt.items().stream()
                .filter(item -> item.variantId().equals(overflowLine.variantId())).findFirst().orElseThrow().id();

        BusinessRuleException rollback = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(rollbackReceipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(firstLineItem, 2, 0),
                                new ReceiveItemsRequest.ItemInspection(overflowItem, 2, 0))),
                        "scenario-d-rollback-" + UUID.randomUUID()));
        assertEquals("INVALID_STOCK_BALANCE", rollback.getErrorCode().getCode());
        assertEquals(0, balance(firstLine).getOnHand());
        assertEquals(Integer.MAX_VALUE - 1, balance(overflowLine).getOnHand());
        assertEquals(0, ledgerCount(firstLine));
        assertEquals(0, ledgerCount(overflowLine));
        assertEquals(0, outboxCount(firstLine));
        assertEquals(0, outboxCount(overflowLine));
        assertEquals("DRAFT", receiptRepository.findById(rollbackReceipt.id()).orElseThrow().getStatus().name());
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM receipt_events WHERE receipt_id = ? AND event_type = 'RECEIVED'",
                Integer.class, rollbackReceipt.id()));
    }

    @Test
    void draftReceiptCanBeUpdatedAndCancelledWithoutMovingStock() {
        Fixture fixture = fixtureWithoutBalance();
        Fixture second = fixtureWithoutBalance();
        var receipt = receiptService.createReceipt(new CreateReceiptRequest("Original supplier", "first note",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 100L))),
                "draft-update-create-" + UUID.randomUUID());
        assertEquals(0L, receipt.version());

        var updated = receiptService.updateReceipt(receipt.id(), new UpdateReceiptRequest(
                        "Updated supplier", "updated note",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 12, 100L),
                                new CreateReceiptRequest.ReceiptItemRequest(second.variantId(), 3, 100L)),
                        receipt.version()),
                "draft-update-" + UUID.randomUUID());
        assertEquals("Updated supplier", updated.supplierName());
        assertEquals("updated note", updated.note());
        assertEquals(2, updated.items().size());
        assertEquals(12, updated.items().get(0).expectedQty());
        assertEquals(1L, updated.version());

        BusinessRuleException stale = assertThrows(BusinessRuleException.class,
                () -> receiptService.updateReceipt(receipt.id(), new UpdateReceiptRequest(
                                "Stale supplier", null,
                                List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 5, 100L)),
                                receipt.version()),
                        "draft-update-stale-" + UUID.randomUUID()));
        assertEquals("STALE_VERSION", stale.getErrorCode().getCode());

        var cancelled = receiptService.cancelReceipt(receipt.id(), new CancelReceiptRequest(
                        "duplicate purchase order", updated.version()),
                "draft-cancel-" + UUID.randomUUID());
        assertEquals("CANCELLED", cancelled.status());
        assertEquals("duplicate purchase order", cancelled.cancelReason());
        assertNotNull(cancelled.cancelledAt());
        // Draft edits and cancellation never create or move an inventory balance.
        assertFalse(balanceRepository.findByVariantId(fixture.variantId()).isPresent());
        assertEquals(0, ledgerCount(fixture));
        assertEquals(0, outboxCount(fixture));

        BusinessRuleException receiveCancelled = assertThrows(BusinessRuleException.class,
                () -> receiptService.receiveStock(receipt.id(), new ReceiveItemsRequest(List.of(
                                new ReceiveItemsRequest.ItemInspection(updated.items().getFirst().id(), 1, 0))),
                        "draft-cancelled-receive-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", receiveCancelled.getErrorCode().getCode());
    }

    @Test
    void productVariantAddUpdateLifecycleAndDeletionSafeguards() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String firstSku = "LIFE-A-" + suffix;
        String secondSku = "LIFE-B-" + suffix;
        String renamedSku = "LIFE-C-" + suffix;
        var product = productService.createProduct(new CreateProductRequest("Lifecycle product", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(firstSku, "Default", 1000L, "VND", 0))),
                "lifecycle-product-" + UUID.randomUUID());
        Long firstVariantId = product.variants().getFirst().id();

        var added = productService.addVariant(product.id(),
                new AddProductVariantRequest(secondSku, "Second", 2000L, "VND", 0),
                "lifecycle-add-" + UUID.randomUUID());
        assertEquals(0, balanceRepository.findByVariantId(added.id()).orElseThrow().getOnHand());
        assertEquals(0, ledgerRepository.findByVariantIdOrderByCreatedAtDesc(added.id(),
                org.springframework.data.domain.PageRequest.of(0, 10)).size());

        BusinessRuleException duplicateSku = assertThrows(BusinessRuleException.class,
                () -> productService.addVariant(product.id(),
                        new AddProductVariantRequest(secondSku, "Duplicate", 2000L, "VND", 0),
                        "lifecycle-duplicate-" + UUID.randomUUID()));
        assertEquals("DUPLICATE_SKU", duplicateSku.getErrorCode().getCode());

        BusinessRuleException openingStock = assertThrows(BusinessRuleException.class,
                () -> productService.addVariant(product.id(),
                        new AddProductVariantRequest("LIFE-D-" + suffix, "Opening", 2000L, "VND", 1),
                        "lifecycle-opening-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", openingStock.getErrorCode().getCode());

        var updatedVariant = productService.updateVariant(product.id(), added.id(),
                new UpdateProductVariantRequest(null, "Renamed", 2500L, "USD", null));
        assertEquals("Renamed", updatedVariant.title());
        assertEquals(2500L, updatedVariant.price());
        assertEquals("USD", updatedVariant.currency());

        BusinessRuleException skuWithoutReason = assertThrows(BusinessRuleException.class,
                () -> productService.updateVariant(product.id(), added.id(),
                        new UpdateProductVariantRequest(renamedSku, null, null, null, null)));
        assertEquals("BAD_REQUEST", skuWithoutReason.getErrorCode().getCode());

        var renamed = productService.updateVariant(product.id(), added.id(),
                new UpdateProductVariantRequest(renamedSku, null, null, null, "correct SKU typo"));
        assertEquals(renamedSku, renamed.sku());

        BusinessRuleException duplicateRename = assertThrows(BusinessRuleException.class,
                () -> productService.updateVariant(product.id(), added.id(),
                        new UpdateProductVariantRequest(firstSku, null, null, null, "collision")));
        assertEquals("DUPLICATE_SKU", duplicateRename.getErrorCode().getCode());

        var published = productService.updateProduct(product.id(),
                new UpdateProductRequest(null, null, null, "PUBLISHED"));
        assertEquals("PUBLISHED", published.status());
        BusinessRuleException backwards = assertThrows(BusinessRuleException.class,
                () -> productService.updateProduct(product.id(),
                        new UpdateProductRequest(null, null, null, "DRAFT")));
        assertEquals("BAD_REQUEST", backwards.getErrorCode().getCode());

        var archived = productService.updateProduct(product.id(),
                new UpdateProductRequest(null, null, null, "ARCHIVED"));
        assertEquals("ARCHIVED", archived.status());
        BusinessRuleException editArchived = assertThrows(BusinessRuleException.class,
                () -> productService.updateProduct(product.id(),
                        new UpdateProductRequest("Renamed while archived", null, null, null)));
        assertEquals("BAD_REQUEST", editArchived.getErrorCode().getCode());
        BusinessRuleException addToArchived = assertThrows(BusinessRuleException.class,
                () -> productService.addVariant(product.id(),
                        new AddProductVariantRequest("LIFE-E-" + suffix, "Archived", 1L, "VND", 0),
                        "lifecycle-archived-add-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", addToArchived.getErrorCode().getCode());

        var restored = productService.updateProduct(product.id(),
                new UpdateProductRequest(null, null, null, "DRAFT"));
        assertEquals("DRAFT", restored.status());

        var clean = productService.createProduct(new CreateProductRequest("Clean delete", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest("CLEAN-" + suffix, "Default", 1L, "VND", 0))),
                "clean-product-" + UUID.randomUUID());
        productService.deleteProduct(clean.id());
        assertFalse(productRepository.existsById(clean.id()));

        // Even without ledger rows, non-zero physical stock blocks deletion.
        String stockedSku = "STOCK-" + suffix;
        var stocked = productService.createProduct(new CreateProductRequest("Stocked delete", null, null,
                        List.of(new CreateProductRequest.CreateVariantRequest(stockedSku, "Default", 1L, "VND", 0))),
                "stocked-product-" + UUID.randomUUID());
        jdbcTemplate.update("UPDATE inventory_balances SET on_hand = 1 WHERE variant_id = ?",
                stocked.variants().getFirst().id());
        ApiException hasStock = assertThrows(ApiException.class,
                () -> productService.deleteProduct(stocked.id()));
        assertEquals("PRODUCT_HAS_INVENTORY_HISTORY", hasStock.getErrorCode().getCode());

        // The first variant is referenced by a draft receipt; neither catalog row may be deleted.
        receiptService.createReceipt(new CreateReceiptRequest("Delete guard",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(firstVariantId, 1, 100L))),
                "delete-guard-receipt-" + UUID.randomUUID());
        ApiException hasReceipt = assertThrows(ApiException.class,
                () -> productService.deleteProduct(product.id()));
        assertEquals("PRODUCT_HAS_INVENTORY_HISTORY", hasReceipt.getErrorCode().getCode());
    }

    @Test
    void inventoryAdjustmentCanSetSafetyBufferAndLedgerExplainsTheBalanceChange() {
        Fixture fixture = fixture(5, 0, 0);
        var snapshot = inventoryService.adjustInventory(
                new InventoryAdjustRequest(fixture.sku(), 0, "set safety buffer", null, 2),
                "buffer-adjust-" + UUID.randomUUID());
        assertEquals(5, snapshot.onHand());
        assertEquals(2, snapshot.safetyBuffer());
        assertEquals(3, snapshot.availableToSell());

        var ledger = inventoryService.getLedgerBySku(fixture.sku(), 10);
        assertEquals(1, ledger.size());
        var entry = ledger.getFirst();
        assertEquals("ADJUSTMENT", entry.operation());
        assertEquals(0, entry.delta());
        assertEquals(0, entry.safetyBufferBefore());
        assertEquals(2, entry.safetyBufferAfter());
        assertEquals(5, entry.onHandBefore());
        assertEquals(5, entry.onHandAfter());
        assertEquals("set safety buffer", entry.reason());

        BusinessRuleException stale = assertThrows(BusinessRuleException.class,
                () -> inventoryService.adjustInventory(new InventoryAdjustRequest(
                                fixture.sku(), 1, "stale", snapshot.version() - 1),
                        "buffer-stale-" + UUID.randomUUID()));
        assertEquals("STALE_VERSION", stale.getErrorCode().getCode());

        BusinessRuleException invariant = assertThrows(BusinessRuleException.class,
                () -> inventoryService.adjustInventory(new InventoryAdjustRequest(
                                fixture.sku(), -4, "strand buffer", null),
                        "buffer-invariant-" + UUID.randomUUID()));
        assertEquals("INVALID_STOCK_BALANCE", invariant.getErrorCode().getCode());

        BusinessRuleException noChange = assertThrows(BusinessRuleException.class,
                () -> inventoryService.adjustInventory(new InventoryAdjustRequest(
                                fixture.sku(), 0, "no change", null, 2),
                        "buffer-no-change-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", noChange.getErrorCode().getCode());
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

    // =========================================================================
    // Phase 03: Order lifecycle, POS payment, cancellation, and expiry
    // =========================================================================

    @Test
    @WithMockUser(username = "cashier", roles = "STAFF")
    void posCashCheckoutDeductsStockOnceAndRecordsHistoryAndPayment() {
        Fixture fixture = fixture(5, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);

        assertEquals("PLACED", created.status());
        assertEquals("PENDING", created.paymentStatus());
        assertNotNull(created.holdExpiresAt());
        assertNull(created.payment());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(2, balance(fixture).getReserved());

        String paymentKey = "phase3-cash-pay-" + UUID.randomUUID();
        RecordPaymentRequest cash = new RecordPaymentRequest("CASH", 2500L, null, "Khách đưa 2.500");
        OrderResponse paid = orderService.confirmPayment(created.id(), cash, paymentKey);

        assertEquals("CONFIRMED", paid.status());
        assertEquals("PAID", paid.paymentStatus());
        assertNull(paid.holdExpiresAt());
        assertNotNull(paid.payment());
        assertEquals("CASH", paid.payment().method());
        assertEquals(2000L, paid.payment().amountDue());
        assertEquals(2500L, paid.payment().cashReceived());
        assertEquals(500L, paid.payment().change());
        assertEquals("cashier", paid.payment().actor());
        assertNotNull(paid.payment().paidAt());
        assertEquals(3, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));

        // Same key replays the stored response; a different key returns the paid order without
        // deducting stock or writing a second payment row.
        assertEquals(paid, orderService.confirmPayment(created.id(), cash, paymentKey));
        OrderResponse secondKey = orderService.confirmPayment(created.id(), cash,
                "phase3-cash-pay-other-" + UUID.randomUUID());
        assertEquals("PAID", secondKey.paymentStatus());
        assertEquals(3, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertTrue(posPaymentDetailRepository.findById(created.id()).isPresent());
        assertEquals(2, historyCount(created.id()));

        orderService.transitionOrderStatus(created.id(),
                new OrderTransitionRequest("PACKED", "Đã đóng gói"),
                "phase3-pack-" + UUID.randomUUID());
        orderService.transitionOrderStatus(created.id(),
                new OrderTransitionRequest("SHIPPED", "Đã giao vận chuyển"),
                "phase3-ship-" + UUID.randomUUID());
        OrderResponse delivered = orderService.transitionOrderStatus(created.id(),
                new OrderTransitionRequest("DELIVERED", "Đã giao"),
                "phase3-deliver-" + UUID.randomUUID());
        assertEquals("DELIVERED", delivered.status());
        assertEquals("PAID", delivered.paymentStatus());

        List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
        assertEquals(5, history.size());
        assertEquals("STATUS_CHANGED", history.get(0).action());
        assertEquals("SHIPPED", history.get(0).fromStatus());
        assertEquals("DELIVERED", history.get(0).toStatus());
        OrderHistoryResponse paymentHistory = history.stream()
                .filter(entry -> "PAYMENT_CONFIRMED".equals(entry.action()))
                .findFirst()
                .orElseThrow();
        assertEquals("PLACED", paymentHistory.fromStatus());
        assertEquals("CONFIRMED", paymentHistory.toStatus());
        assertEquals("PENDING", paymentHistory.fromPaymentStatus());
        assertEquals("PAID", paymentHistory.toPaymentStatus());
        assertEquals("cashier", paymentHistory.actor());
        assertEquals("CREATED", history.get(history.size() - 1).action());
        assertEquals("PLACED", history.get(history.size() - 1).toStatus());

        // Repeating a terminal handover is a no-op, not another history row.
        orderService.handoverOrder(created.id(), new HandoverOrderRequest("Đã nhận"),
                "phase3-handover-replay-" + UUID.randomUUID());
        assertEquals(5, historyCount(created.id()));
    }

    @Test
    void posBankTransferHandoverSkipsShippingAndRejectsInvalidPaymentShapes() {
        Fixture fixture = fixture(4, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);

        BusinessRuleException underpaid = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(created.id(),
                        new RecordPaymentRequest("CASH", 1999L, null, null),
                        "phase3-underpaid-" + UUID.randomUUID()));
        assertEquals("PAYMENT_UNDERPAID", underpaid.getErrorCode().getCode());

        BusinessRuleException missingCash = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(created.id(),
                        new RecordPaymentRequest("CASH", null, null, null),
                        "phase3-missing-cash-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", missingCash.getErrorCode().getCode());

        BusinessRuleException bankWithCash = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(created.id(),
                        new RecordPaymentRequest("BANK_TRANSFER", 2000L, "FT-1", null),
                        "phase3-bank-cash-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", bankWithCash.getErrorCode().getCode());

        BusinessRuleException card = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(created.id(),
                        new RecordPaymentRequest("CARD", null, null, null),
                        "phase3-card-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", card.getErrorCode().getCode());

        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(2, balance(fixture).getReserved());
        assertTrue(posPaymentDetailRepository.findById(created.id()).isEmpty());
        // Failed payment attempts must not leave audit/history or outbox rows behind.
        assertEquals(1, historyCount(created.id()));
        assertEquals(0, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM outbox_events
                WHERE aggregate_type = 'ORDER' AND aggregate_id = ? AND event_type = 'ORDER_PAYMENT_RECORDED'
                """, Integer.class, created.id().toString()));

        String paymentKey = "phase3-bank-pay-" + UUID.randomUUID();
        RecordPaymentRequest bank = new RecordPaymentRequest(
                "BANK_TRANSFER", null, "FT-20261109-001", "Đã nhận chuyển khoản");
        OrderResponse paid = orderService.confirmPayment(created.id(), bank, paymentKey);
        assertEquals("PAID", paid.paymentStatus());
        assertEquals("BANK_TRANSFER", paid.payment().method());
        assertNull(paid.payment().cashReceived());
        assertNull(paid.payment().change());
        assertEquals("FT-20261109-001", paid.payment().reference());
        assertEquals("Đã nhận chuyển khoản", paid.payment().note());
        assertEquals(2, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());

        String handoverKey = "phase3-handover-" + UUID.randomUUID();
        HandoverOrderRequest handover = new HandoverOrderRequest("Khách đã nhận tại quầy");
        OrderResponse handedOver = orderService.handoverOrder(created.id(), handover, handoverKey);
        assertEquals("DELIVERED", handedOver.status());
        assertEquals("PAID", handedOver.paymentStatus());

        List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
        assertEquals(3, history.size());
        assertEquals("HANDED_OVER", history.get(0).action());
        assertEquals("CONFIRMED", history.get(0).fromStatus());
        assertEquals("DELIVERED", history.get(0).toStatus());
        assertEquals("Khách đã nhận tại quầy", history.get(0).reason());
        assertFalse(history.stream().anyMatch(entry -> "PACKED".equals(entry.toStatus())));
        assertFalse(history.stream().anyMatch(entry -> "SHIPPED".equals(entry.toStatus())));

        assertEquals(handedOver, orderService.handoverOrder(created.id(), handover, handoverKey));
        assertEquals(3, historyCount(created.id()));

        // Currency is validated against the server-owned order currency before any payment.
        Fixture usdFixture = fixture(2, 0, 0);
        OrderResponse usdOrder = createPosOrder(usdFixture, 1);
        jdbcTemplate.update("UPDATE orders SET currency = 'USD' WHERE id = ?", usdOrder.id());
        BusinessRuleException currency = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(usdOrder.id(),
                        new RecordPaymentRequest("CASH", 1000L, null, null),
                        "phase3-usd-" + UUID.randomUUID()));
        assertEquals("INVALID_CURRENCY", currency.getErrorCode().getCode());
        assertEquals(Order.Status.PLACED, orderRepository.findById(usdOrder.id()).orElseThrow().getStatus());
        assertEquals(1, balance(usdFixture).getReserved());
    }

    @Test
    void unpaidCancellationReleasesOnlyReservedAndPaidCancellationIsBlocked() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        String reason = "Khách đổi ý trước khi thanh toán";

        String cancelKey = "phase3-cancel-" + UUID.randomUUID();
        CancelOrderRequest cancel = new CancelOrderRequest(reason);
        OrderResponse cancelled = orderService.cancelOrder(created.id(), cancel, cancelKey);

        assertEquals("CANCELLED", cancelled.status());
        assertEquals("PENDING", cancelled.paymentStatus());
        assertNull(cancelled.holdExpiresAt());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));

        List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
        assertEquals(2, history.size());
        assertEquals("CANCELLED", history.get(0).action());
        assertEquals("PLACED", history.get(0).fromStatus());
        assertEquals("CANCELLED", history.get(0).toStatus());
        assertEquals(reason, history.get(0).reason());
        String payload = latestOrderOutbox(created.id(), "ORDER_CANCELLED");
        assertEquals(reason, objectMapper.readTree(payload).path("reason").asText());

        // A different key on an already-cancelled order must not release the hold twice.
        OrderResponse secondCancel = orderService.cancelOrder(created.id(), cancel,
                "phase3-cancel-other-" + UUID.randomUUID());
        assertEquals(cancelled.id(), secondCancel.id());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, historyCount(created.id()));

        // Cancelled orders cannot be paid, transitioned, shipped, or handed over.
        BusinessRuleException payCancelled = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(created.id(),
                        new RecordPaymentRequest("CASH", 2000L, null, null),
                        "phase3-pay-cancelled-" + UUID.randomUUID()));
        assertEquals("INVALID_ORDER_STATE", payCancelled.getErrorCode().getCode());
        BusinessRuleException transitionCancelled = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(created.id(),
                        new OrderTransitionRequest("PACKED", null),
                        "phase3-transition-cancelled-" + UUID.randomUUID()));
        assertEquals("INVALID_ORDER_STATE", transitionCancelled.getErrorCode().getCode());
        BusinessRuleException shipCancelled = assertThrows(BusinessRuleException.class,
                () -> orderService.shipOrder(created.id()));
        assertEquals("INVALID_ORDER_STATE", shipCancelled.getErrorCode().getCode());
        BusinessRuleException handoverCancelled = assertThrows(BusinessRuleException.class,
                () -> orderService.handoverOrder(created.id(), new HandoverOrderRequest(null),
                        "phase3-handover-cancelled-" + UUID.randomUUID()));
        assertEquals("INVALID_ORDER_STATE", handoverCancelled.getErrorCode().getCode());

        // Paid-order cancellation is deliberately deferred, with a distinct business error.
        Fixture paidFixture = fixture(3, 0, 0);
        OrderResponse paidOrder = createPosOrder(paidFixture, 1);
        orderService.confirmPayment(paidOrder.id(),
                new RecordPaymentRequest("CASH", 1000L, null, null),
                "phase3-paid-cancel-pay-" + UUID.randomUUID());
        BusinessRuleException paidCancel = assertThrows(BusinessRuleException.class,
                () -> orderService.cancelOrder(paidOrder.id(), new CancelOrderRequest("Muốn hủy"),
                        "phase3-paid-cancel-" + UUID.randomUUID()));
        assertEquals("PAID_ORDER_CANCELLATION_BLOCKED", paidCancel.getErrorCode().getCode());
        assertEquals(Order.Status.CONFIRMED, orderRepository.findById(paidOrder.id()).orElseThrow().getStatus());
        assertEquals(2, balance(paidFixture).getOnHand());
        assertEquals(0, balance(paidFixture).getReserved());
    }

    @Test
    void stateMachineBlocksInvalidJumpsUnpaidShippingAndMarketplaceActions() {
        Fixture fixture = fixture(5, 0, 0);
        OrderResponse created = createPosOrder(fixture, 1);

        BusinessRuleException unpaidShip = assertThrows(BusinessRuleException.class,
                () -> orderService.shipOrder(created.id()));
        assertEquals("ORDER_NOT_PAID", unpaidShip.getErrorCode().getCode());
        BusinessRuleException unpaidTransition = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(created.id(),
                        new OrderTransitionRequest("PACKED", null),
                        "phase3-unpaid-transition-" + UUID.randomUUID()));
        assertEquals("ORDER_NOT_PAID", unpaidTransition.getErrorCode().getCode());
        BusinessRuleException unpaidHandover = assertThrows(BusinessRuleException.class,
                () -> orderService.handoverOrder(created.id(), new HandoverOrderRequest(null),
                        "phase3-unpaid-handover-" + UUID.randomUUID()));
        assertEquals("ORDER_NOT_PAID", unpaidHandover.getErrorCode().getCode());

        OrderResponse paid = orderService.confirmPayment(created.id(),
                new RecordPaymentRequest("CASH", 1000L, null, null),
                "phase3-sm-pay-" + UUID.randomUUID());
        assertEquals("CONFIRMED", paid.status());

        BusinessRuleException jump = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(paid.id(),
                        new OrderTransitionRequest("SHIPPED", null),
                        "phase3-jump-" + UUID.randomUUID()));
        assertEquals("INVALID_ORDER_STATE", jump.getErrorCode().getCode());

        BusinessRuleException cancelTarget = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(paid.id(),
                        new OrderTransitionRequest("CANCELLED", null),
                        "phase3-cancel-target-" + UUID.randomUUID()));
        assertEquals("BAD_REQUEST", cancelTarget.getErrorCode().getCode());

        BusinessRuleException notPacked = assertThrows(BusinessRuleException.class,
                () -> orderService.shipOrder(paid.id()));
        assertEquals("INVALID_ORDER_STATE", notPacked.getErrorCode().getCode());

        orderService.transitionOrderStatus(paid.id(),
                new OrderTransitionRequest("PACKED", null),
                "phase3-sm-pack-" + UUID.randomUUID());
        OrderResponse shipped = orderService.shipOrder(paid.id());
        assertEquals("SHIPPED", shipped.status());
        int historyAfterShip = historyCount(paid.id());
        orderService.shipOrder(paid.id());
        assertEquals(historyAfterShip, historyCount(paid.id()));

        orderService.transitionOrderStatus(paid.id(),
                new OrderTransitionRequest("DELIVERED", null),
                "phase3-sm-deliver-" + UUID.randomUUID());
        BusinessRuleException terminal = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(paid.id(),
                        new OrderTransitionRequest("PACKED", null),
                        "phase3-terminal-" + UUID.randomUUID()));
        assertEquals("INVALID_ORDER_STATE", terminal.getErrorCode().getCode());
        int deliveredHistory = historyCount(paid.id());
        orderService.handoverOrder(paid.id(), new HandoverOrderRequest(null),
                "phase3-terminal-handover-" + UUID.randomUUID());
        assertEquals(deliveredHistory, historyCount(paid.id()));

        // Marketplace orders cannot be paid, cancelled, transitioned, or handed over through POS.
        Fixture marketFixture = fixture(3, 0, 0);
        Long channelId = insertChannel();
        OrderResponse marketplace = orderService.createChannelOrder(new ChannelOrderCommand(
                        channelId, Order.Source.SHOPIFY, "P3-" + UUID.randomUUID(), "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(marketFixture.sku(), 1))),
                "phase3-market-create-" + UUID.randomUUID());
        assertEquals("PLACED", marketplace.status());
        assertEquals(1, balance(marketFixture).getReserved());

        BusinessRuleException marketPay = assertThrows(BusinessRuleException.class,
                () -> orderService.confirmPayment(marketplace.id(),
                        new RecordPaymentRequest("CASH", 1000L, null, null),
                        "phase3-market-pay-" + UUID.randomUUID()));
        assertEquals("MARKETPLACE_ACTION_FORBIDDEN", marketPay.getErrorCode().getCode());
        BusinessRuleException marketCancel = assertThrows(BusinessRuleException.class,
                () -> orderService.cancelOrder(marketplace.id(), new CancelOrderRequest("Hủy"),
                        "phase3-market-cancel-" + UUID.randomUUID()));
        assertEquals("MARKETPLACE_ACTION_FORBIDDEN", marketCancel.getErrorCode().getCode());
        BusinessRuleException marketTransition = assertThrows(BusinessRuleException.class,
                () -> orderService.transitionOrderStatus(marketplace.id(),
                        new OrderTransitionRequest("PACKED", null),
                        "phase3-market-transition-" + UUID.randomUUID()));
        assertEquals("MARKETPLACE_ACTION_FORBIDDEN", marketTransition.getErrorCode().getCode());
        BusinessRuleException marketHandover = assertThrows(BusinessRuleException.class,
                () -> orderService.handoverOrder(marketplace.id(), new HandoverOrderRequest(null),
                        "phase3-market-handover-" + UUID.randomUUID()));
        assertEquals("MARKETPLACE_ACTION_FORBIDDEN", marketHandover.getErrorCode().getCode());

        assertEquals(3, balance(marketFixture).getOnHand());
        assertEquals(1, balance(marketFixture).getReserved());
        assertTrue(posPaymentDetailRepository.findById(marketplace.id()).isEmpty());
    }

    @Test
    void abandonedPosOrdersExpireReleaseReservedOnlyAndMarketplaceOrdersAreExcluded() {
        Fixture fixture = fixture(5, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        jdbcTemplate.update(
                "UPDATE orders SET hold_expires_at = clock_timestamp() - interval '1 minute' WHERE id = ?",
                created.id());

        OrderService.OrderExpirySweepResult result = orderService.expireAbandonedOrders();
        assertTrue(result.expired() >= 1);

        Order expired = orderRepository.findById(created.id()).orElseThrow();
        assertEquals(Order.Status.CANCELLED, expired.getStatus());
        assertEquals(Order.PaymentStatus.PENDING, expired.getPaymentStatus());
        assertNull(expired.getHoldExpiresAt());
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));

        List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
        assertEquals(2, history.size());
        assertEquals("EXPIRED", history.get(0).action());
        assertEquals("PLACED", history.get(0).fromStatus());
        assertEquals("CANCELLED", history.get(0).toStatus());
        assertNotNull(history.get(0).reason());
        assertFalse(latestOrderOutbox(created.id(), "ORDER_EXPIRED").isBlank());

        // A second sweep cannot release the same hold again.
        orderService.expireAbandonedOrders();
        assertEquals(5, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));
        assertEquals(2, historyCount(created.id()));

        // The database refuses a hold expiry on a marketplace order, and the sweep leaves it alone.
        Fixture marketFixture = fixture(2, 0, 0);
        Long channelId = insertChannel();
        OrderResponse marketplace = orderService.createChannelOrder(new ChannelOrderCommand(
                        channelId, Order.Source.SHOPIFY, "P3-EXP-" + UUID.randomUUID(), "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(marketFixture.sku(), 1))),
                "phase3-expiry-market-create-" + UUID.randomUUID());
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update(
                "UPDATE orders SET hold_expires_at = clock_timestamp() WHERE id = ?", marketplace.id()));
        orderService.expireAbandonedOrders();
        assertEquals(Order.Status.PLACED, orderRepository.findById(marketplace.id()).orElseThrow().getStatus());
        assertEquals(1, balance(marketFixture).getReserved());
    }

    @Test
    void concurrentPaymentAndExpiryNeverDoubleReleaseOrDoubleDeduct() throws Exception {
        Fixture fixture = fixture(3, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        jdbcTemplate.update(
                "UPDATE orders SET hold_expires_at = clock_timestamp() - interval '1 minute' WHERE id = ?",
                created.id());

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> payment = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    return orderService.confirmPayment(created.id(),
                            new RecordPaymentRequest("CASH", 2000L, null, null),
                            "phase3-race-pay-" + UUID.randomUUID());
                } catch (BusinessRuleException expiredFirst) {
                    return null;
                }
            });
            Future<OrderService.OrderExpirySweepResult> expiry = pool.submit(() -> {
                ready.countDown();
                start.await();
                return orderService.expireAbandonedOrders();
            });
            ready.await();
            start.countDown();
            OrderResponse paid = payment.get(15, TimeUnit.SECONDS);
            expiry.get(15, TimeUnit.SECONDS);

            Order finalOrder = orderRepository.findById(created.id()).orElseThrow();
            if (finalOrder.getPaymentStatus() == Order.PaymentStatus.PAID) {
                assertNotNull(paid);
                assertEquals(Order.Status.CONFIRMED, finalOrder.getStatus());
                assertEquals(1, balance(fixture).getOnHand());
            } else {
                assertNull(paid);
                assertEquals(Order.Status.CANCELLED, finalOrder.getStatus());
                assertEquals(Order.PaymentStatus.PENDING, finalOrder.getPaymentStatus());
                assertEquals(3, balance(fixture).getOnHand());
            }
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(finalOrder.getPaymentStatus() == Order.PaymentStatus.PAID,
                    posPaymentDetailRepository.findById(created.id()).isPresent());

            List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
            long terminalEvents = history.stream()
                    .filter(entry -> "PAYMENT_CONFIRMED".equals(entry.action()) || "EXPIRED".equals(entry.action()))
                    .count();
            assertEquals(1, terminalEvents);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentCancellationAndExpiryReleaseTheHoldExactlyOnce() throws Exception {
        Fixture fixture = fixture(4, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        jdbcTemplate.update(
                "UPDATE orders SET hold_expires_at = clock_timestamp() - interval '1 minute' WHERE id = ?",
                created.id());

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> cancellation = pool.submit(() -> {
                ready.countDown();
                start.await();
                return orderService.cancelOrder(created.id(),
                        new CancelOrderRequest("Khách hủy trong lúc hết hạn"),
                        "phase3-race-cancel-" + UUID.randomUUID());
            });
            Future<OrderService.OrderExpirySweepResult> expiry = pool.submit(() -> {
                ready.countDown();
                start.await();
                return orderService.expireAbandonedOrders();
            });
            ready.await();
            start.countDown();
            cancellation.get(15, TimeUnit.SECONDS);
            expiry.get(15, TimeUnit.SECONDS);

            Order finalOrder = orderRepository.findById(created.id()).orElseThrow();
            assertEquals(Order.Status.CANCELLED, finalOrder.getStatus());
            assertEquals(Order.PaymentStatus.PENDING, finalOrder.getPaymentStatus());
            assertEquals(4, balance(fixture).getOnHand());
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(2, ledgerCount(fixture));

            List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
            long terminalEvents = history.stream()
                    .filter(entry -> "CANCELLED".equals(entry.action()) || "EXPIRED".equals(entry.action()))
                    .count();
            assertEquals(1, terminalEvents);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentPaymentAndCancellationCommitExactlyOneTerminalOutcome() throws Exception {
        Fixture fixture = fixture(4, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> payment = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    return orderService.confirmPayment(created.id(),
                            new RecordPaymentRequest("CASH", 2000L, null, null),
                            "phase3-race-pay-cancel-pay-" + UUID.randomUUID());
                } catch (BusinessRuleException cancelledFirst) {
                    return null;
                }
            });
            Future<OrderResponse> cancellation = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    return orderService.cancelOrder(created.id(),
                            new CancelOrderRequest("Khách hủy trong lúc thanh toán"),
                            "phase3-race-pay-cancel-cancel-" + UUID.randomUUID());
                } catch (BusinessRuleException paidFirst) {
                    return null;
                }
            });
            ready.await();
            start.countDown();
            OrderResponse paid = payment.get(15, TimeUnit.SECONDS);
            OrderResponse cancelled = cancellation.get(15, TimeUnit.SECONDS);

            Order finalOrder = orderRepository.findById(created.id()).orElseThrow();
            if (finalOrder.getPaymentStatus() == Order.PaymentStatus.PAID) {
                assertNotNull(paid);
                assertNull(cancelled);
                assertEquals(Order.Status.CONFIRMED, finalOrder.getStatus());
                assertEquals(2, balance(fixture).getOnHand());
                assertTrue(posPaymentDetailRepository.findById(created.id()).isPresent());
            } else {
                assertNull(paid);
                assertNotNull(cancelled);
                assertEquals(Order.Status.CANCELLED, finalOrder.getStatus());
                assertEquals(Order.PaymentStatus.PENDING, finalOrder.getPaymentStatus());
                assertEquals(4, balance(fixture).getOnHand());
                assertTrue(posPaymentDetailRepository.findById(created.id()).isEmpty());
            }
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(2, ledgerCount(fixture));

            List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
            long terminalEvents = history.stream()
                    .filter(entry -> "PAYMENT_CONFIRMED".equals(entry.action())
                            || "CANCELLED".equals(entry.action()))
                    .count();
            assertEquals(1, terminalEvents);
        } finally {
            pool.shutdownNow();
        }
    }

    // =========================================================================
    // Phase 03.1 Review Fixes: F01-F05
    // =========================================================================

    @Test
    void concurrentPriceChangeAfterResolutionUsesTheLockedVerifiedPrice() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<OrderResponse> checkout = pool.submit(() -> {
                start.await();
                return createPosOrder(fixture, 2);
            });

            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.executeWithoutResult(status -> {
                productRepository.findByIdForUpdate(fixture.productId()).orElseThrow();
                String blockerXid = entityManager.createNativeQuery("SELECT txid_current()::text")
                        .getSingleResult().toString();
                start.countDown();
                awaitLockWait(blockerXid);
                ProductVariant variant = variantRepository.findById(fixture.variantId()).orElseThrow();
                variant.setPrice(1500L);
                variantRepository.saveAndFlush(variant);
            });

            OrderResponse order = checkout.get(15, TimeUnit.SECONDS);
            assertEquals(3000L, order.totalAmount());
            assertEquals(1500L, order.items().getFirst().unitPrice());
            assertEquals(2, balance(fixture).getReserved());
            assertEquals(1, historyCount(order.id()));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentSkuChangeAfterResolutionRejectsCheckoutWithoutSilentSubstitution() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        String newSku = "CHANGED-" + UUID.randomUUID().toString().substring(0, 8);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<OrderResponse> checkout = pool.submit(() -> {
                start.await();
                return createPosOrder(fixture, 1);
            });

            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.executeWithoutResult(status -> {
                productRepository.findByIdForUpdate(fixture.productId()).orElseThrow();
                String blockerXid = entityManager.createNativeQuery("SELECT txid_current()::text")
                        .getSingleResult().toString();
                start.countDown();
                awaitLockWait(blockerXid);
                ProductVariant variant = variantRepository.findById(fixture.variantId()).orElseThrow();
                variant.setSku(newSku);
                variantRepository.saveAndFlush(variant);
            });

            ExecutionException failure = assertThrows(ExecutionException.class,
                    () -> checkout.get(15, TimeUnit.SECONDS));
            assertInstanceOf(BusinessRuleException.class, failure.getCause());
            assertEquals("PRICE_OR_STOCK_CHANGED",
                    ((BusinessRuleException) failure.getCause()).getErrorCode().getCode());
            assertEquals(0, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM order_items WHERE variant_id = ?",
                    Integer.class, fixture.variantId()));
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(5, balance(fixture).getOnHand());
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentArchiveAfterResolutionRejectsCheckoutWithoutReservingStock() throws Exception {
        Fixture fixture = fixture(5, 0, 0);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<OrderResponse> checkout = pool.submit(() -> {
                start.await();
                return createPosOrder(fixture, 1);
            });

            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.executeWithoutResult(status -> {
                productRepository.findByIdForUpdate(fixture.productId()).orElseThrow();
                String blockerXid = entityManager.createNativeQuery("SELECT txid_current()::text")
                        .getSingleResult().toString();
                start.countDown();
                awaitLockWait(blockerXid);
                productService.updateProduct(fixture.productId(),
                        new UpdateProductRequest(null, null, null, "ARCHIVED"));
            });

            ExecutionException failure = assertThrows(ExecutionException.class,
                    () -> checkout.get(15, TimeUnit.SECONDS));
            assertInstanceOf(BusinessRuleException.class, failure.getCause());
            assertEquals("BAD_REQUEST", ((BusinessRuleException) failure.getCause()).getErrorCode().getCode());
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(0, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM order_items WHERE variant_id = ?",
                    Integer.class, fixture.variantId()));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void paidOrderRejectsDifferentPaymentContentWithoutSideEffects() {
        Fixture fixture = fixture(6, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        RecordPaymentRequest cash = new RecordPaymentRequest("CASH", 2500L, null, "Khách đưa 2.500");
        String cashKey = "f02-cash-" + UUID.randomUUID();
        OrderResponse paid = orderService.confirmPayment(created.id(), cash, cashKey);
        assertEquals("PAID", paid.paymentStatus());

        int historyAfterPayment = historyCount(created.id());
        long ledgerAfterPayment = ledgerCount(fixture);
        int outboxAfterPayment = paymentOutboxCount(created.id());

        // Same key + same payload is a pure replay.
        assertEquals(paid, orderService.confirmPayment(created.id(), cash, cashKey));
        // Different key + equivalent payload returns the recorded transaction.
        OrderResponse equivalent = orderService.confirmPayment(created.id(), cash,
                "f02-cash-equivalent-" + UUID.randomUUID());
        assertEquals("CASH", equivalent.payment().method());
        assertEquals(2500L, equivalent.payment().cashReceived());

        String bankConflictKey = "f02-cash-bank-" + UUID.randomUUID();
        String amountConflictKey = "f02-cash-amount-" + UUID.randomUUID();
        String noteConflictKey = "f02-cash-note-" + UUID.randomUUID();
        String legacyConflictKey = "f02-cash-legacy-" + UUID.randomUUID();

        assertPaymentConflict(() -> orderService.confirmPayment(created.id(),
                new RecordPaymentRequest("BANK_TRANSFER", null, "FT-DIFF", null), bankConflictKey));
        assertPaymentConflict(() -> orderService.confirmPayment(created.id(),
                new RecordPaymentRequest("CASH", 2600L, null, "Khách đưa 2.500"), amountConflictKey));
        assertPaymentConflict(() -> orderService.confirmPayment(created.id(),
                new RecordPaymentRequest("CASH", 2500L, null, "Ghi chú khác"), noteConflictKey));
        assertPaymentConflict(() -> orderService.confirmPayment(created.id(), legacyConflictKey));

        assertEquals(historyAfterPayment, historyCount(created.id()));
        assertEquals(ledgerAfterPayment, ledgerCount(fixture));
        assertEquals(outboxAfterPayment, paymentOutboxCount(created.id()));
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(4, balance(fixture).getOnHand());
        PosPaymentDetail stored = posPaymentDetailRepository.findById(created.id()).orElseThrow();
        assertEquals(PosPaymentDetail.Method.CASH, stored.getMethod());
        assertEquals(2500L, stored.getCashReceived());
        assertEquals(0, idempotencyCount(bankConflictKey));
        assertEquals(0, idempotencyCount(amountConflictKey));
        assertEquals(0, idempotencyCount(noteConflictKey));
        assertEquals(0, idempotencyCount(legacyConflictKey));

        // BANK_TRANSFER -> CASH and a changed reference are both conflicts.
        Fixture bankFixture = fixture(3, 0, 0);
        OrderResponse bankOrder = createPosOrder(bankFixture, 1);
        RecordPaymentRequest bank = new RecordPaymentRequest(
                "BANK_TRANSFER", null, "FT-ORIGINAL", "bank note");
        orderService.confirmPayment(bankOrder.id(), bank, "f02-bank-" + UUID.randomUUID());
        assertPaymentConflict(() -> orderService.confirmPayment(bankOrder.id(),
                new RecordPaymentRequest("CASH", 1000L, null, null),
                "f02-bank-cash-" + UUID.randomUUID()));
        assertPaymentConflict(() -> orderService.confirmPayment(bankOrder.id(),
                new RecordPaymentRequest("BANK_TRANSFER", null, "FT-DIFFERENT", "bank note"),
                "f02-bank-ref-" + UUID.randomUUID()));
        OrderResponse bankReplay = orderService.confirmPayment(bankOrder.id(), bank,
                "f02-bank-replay-" + UUID.randomUUID());
        assertEquals("BANK_TRANSFER", bankReplay.payment().method());

        // A legacy empty-body MANUAL payment cannot be overwritten or forged into CASH/BANK_TRANSFER.
        Fixture manualFixture = fixture(2, 0, 0);
        OrderResponse manualOrder = createPosOrder(manualFixture, 1);
        OrderResponse manual = orderService.confirmPayment(manualOrder.id(),
                "f02-manual-" + UUID.randomUUID());
        assertEquals("MANUAL", manual.payment().method());
        assertPaymentConflict(() -> orderService.confirmPayment(manualOrder.id(),
                new RecordPaymentRequest("CASH", 1000L, null, null),
                "f02-manual-cash-" + UUID.randomUUID()));
        assertPaymentConflict(() -> orderService.confirmPayment(manualOrder.id(),
                new RecordPaymentRequest("BANK_TRANSFER", null, "FT-1", null),
                "f02-manual-bank-" + UUID.randomUUID()));
        OrderResponse manualReplay = orderService.confirmPayment(manualOrder.id(),
                "f02-manual-replay-" + UUID.randomUUID());
        assertEquals("MANUAL", manualReplay.payment().method());
    }

    @Test
    void concurrentDifferentPaymentContentsCommitExactlyOnePayment() throws Exception {
        Fixture fixture = fixture(3, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<OrderResponse> cashFuture = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    return orderService.confirmPayment(created.id(),
                            new RecordPaymentRequest("CASH", 2000L, null, "cash"),
                            "f02-race-cash-" + UUID.randomUUID());
                } catch (ApiException conflict) {
                    return null;
                }
            });
            Future<OrderResponse> bankFuture = pool.submit(() -> {
                ready.countDown();
                start.await();
                try {
                    return orderService.confirmPayment(created.id(),
                            new RecordPaymentRequest("BANK_TRANSFER", null, "FT-RACE", "bank"),
                            "f02-race-bank-" + UUID.randomUUID());
                } catch (ApiException conflict) {
                    return null;
                }
            });
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            OrderResponse cashResult = cashFuture.get(15, TimeUnit.SECONDS);
            OrderResponse bankResult = bankFuture.get(15, TimeUnit.SECONDS);
            assertTrue((cashResult == null) ^ (bankResult == null));

            PosPaymentDetail stored = posPaymentDetailRepository.findById(created.id()).orElseThrow();
            assertEquals(cashResult != null ? PosPaymentDetail.Method.CASH
                    : PosPaymentDetail.Method.BANK_TRANSFER, stored.getMethod());
            assertEquals(1, balance(fixture).getOnHand());
            assertEquals(0, balance(fixture).getReserved());
            assertEquals(2, ledgerCount(fixture));
            assertEquals(1, jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM order_status_history
                    WHERE order_id = ? AND action = 'PAYMENT_CONFIRMED'
                    """, Integer.class, created.id()));
            assertEquals(1, paymentOutboxCount(created.id()));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void legacyPosHoldIsBackfilledFromCreatedAtAndExpiresThroughNormalAudit() {
        Fixture fixture = fixture(4, 0, 0);
        OrderResponse created = createPosOrder(fixture, 2);
        jdbcTemplate.update("""
                UPDATE orders SET created_at = clock_timestamp() - interval '1 hour',
                                  hold_expires_at = NULL
                WHERE id = ?
                """, created.id());

        OrderService.OrderExpirySweepResult result = orderService.expireAbandonedOrders();
        assertTrue(result.expired() >= 1);

        Order expired = orderRepository.findById(created.id()).orElseThrow();
        assertEquals(Order.Status.CANCELLED, expired.getStatus());
        assertEquals(Order.PaymentStatus.PENDING, expired.getPaymentStatus());
        assertNull(expired.getHoldExpiresAt());
        assertEquals(4, balance(fixture).getOnHand());
        assertEquals(0, balance(fixture).getReserved());
        assertEquals(2, ledgerCount(fixture));

        List<OrderHistoryResponse> history = orderService.getOrderHistory(created.id());
        assertEquals(2, history.size());
        assertEquals("EXPIRED", history.get(0).action());
        assertFalse(latestOrderOutbox(created.id(), "ORDER_EXPIRED").isBlank());

        orderService.expireAbandonedOrders();
        assertEquals(2, historyCount(created.id()));
        assertEquals(2, ledgerCount(fixture));
        assertEquals(0, balance(fixture).getReserved());
    }

    @Test
    void legacyHoldBackfillIsMetadataOnlyAndDoesNotCreateLedgerOrHistory() {
        Fixture fixture = fixture(3, 0, 0);
        OrderResponse created = createPosOrder(fixture, 1);
        jdbcTemplate.update("""
                UPDATE orders SET created_at = clock_timestamp() - interval '1 minute',
                                  hold_expires_at = NULL
                WHERE id = ?
                """, created.id());

        int historyBefore = historyCount(created.id());
        long ledgerBefore = ledgerCount(fixture);

        orderService.expireAbandonedOrders();

        Order order = orderRepository.findById(created.id()).orElseThrow();
        assertEquals(Order.Status.PLACED, order.getStatus());
        assertNotNull(order.getHoldExpiresAt());
        assertTrue(order.getHoldExpiresAt().isAfter(Instant.now()));
        assertEquals(3, balance(fixture).getOnHand());
        assertEquals(1, balance(fixture).getReserved());
        assertEquals(historyBefore, historyCount(created.id()));
        assertEquals(ledgerBefore, ledgerCount(fixture));
        assertEquals(0, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM outbox_events
                WHERE aggregate_type = 'ORDER' AND aggregate_id = ? AND event_type = 'ORDER_EXPIRED'
                """, Integer.class, created.id().toString()));

        // Clean up so the hold cannot leak into a later test.
        jdbcTemplate.update(
                "UPDATE orders SET hold_expires_at = clock_timestamp() - interval '1 minute' WHERE id = ?",
                created.id());
        orderService.expireAbandonedOrders();
        assertEquals(Order.Status.CANCELLED,
                orderRepository.findById(created.id()).orElseThrow().getStatus());
    }

    @Test
    void legacyHoldRepairLeavesAnomaliesAndNonCandidatesUntouched() {
        Fixture anomalyFixture = fixture(2, 0, 0);
        OrderResponse anomaly = createPosOrder(anomalyFixture, 1);
        jdbcTemplate.update("""
                UPDATE orders SET created_at = clock_timestamp() - interval '1 hour',
                                  hold_expires_at = NULL
                WHERE id = ?
                """, anomaly.id());
        jdbcTemplate.update("UPDATE inventory_balances SET reserved = 0 WHERE variant_id = ?",
                anomalyFixture.variantId());
        int anomalyHistory = historyCount(anomaly.id());
        long anomalyLedger = ledgerCount(anomalyFixture);

        Fixture marketFixture = fixture(2, 0, 0);
        Long channelId = insertChannel();
        OrderResponse marketplace = orderService.createChannelOrder(new ChannelOrderCommand(
                        channelId, Order.Source.SHOPIFY, "P31-LEGACY-" + UUID.randomUUID(), "VND",
                        List.of(new ChannelOrderCommand.ChannelOrderLine(marketFixture.sku(), 1))),
                "p31-market-" + UUID.randomUUID());

        Fixture paidFixture = fixture(2, 0, 0);
        OrderResponse paid = createPosOrder(paidFixture, 1);
        orderService.confirmPayment(paid.id(),
                new RecordPaymentRequest("CASH", 1000L, null, null),
                "p31-paid-" + UUID.randomUUID());

        Fixture cancelledFixture = fixture(2, 0, 0);
        OrderResponse cancelled = createPosOrder(cancelledFixture, 1);
        orderService.cancelOrder(cancelled.id(), new CancelOrderRequest("Hủy legacy"),
                "p31-cancelled-" + UUID.randomUUID());

        orderService.expireAbandonedOrders();

        Order anomalyAfter = orderRepository.findById(anomaly.id()).orElseThrow();
        assertEquals(Order.Status.PLACED, anomalyAfter.getStatus());
        assertNull(anomalyAfter.getHoldExpiresAt());
        assertEquals(anomalyHistory, historyCount(anomaly.id()));
        assertEquals(anomalyLedger, ledgerCount(anomalyFixture));
        assertEquals(0, balance(anomalyFixture).getReserved());

        Order marketplaceAfter = orderRepository.findById(marketplace.id()).orElseThrow();
        assertEquals(Order.Status.PLACED, marketplaceAfter.getStatus());
        assertNull(marketplaceAfter.getHoldExpiresAt());
        assertEquals(1, balance(marketFixture).getReserved());

        Order paidAfter = orderRepository.findById(paid.id()).orElseThrow();
        assertEquals(Order.Status.CONFIRMED, paidAfter.getStatus());
        assertEquals(Order.PaymentStatus.PAID, paidAfter.getPaymentStatus());
        assertNull(paidAfter.getHoldExpiresAt());

        Order cancelledAfter = orderRepository.findById(cancelled.id()).orElseThrow();
        assertEquals(Order.Status.CANCELLED, cancelledAfter.getStatus());
        assertNull(cancelledAfter.getHoldExpiresAt());

        // Once the corrupt reserved quantity is fixed, the same row is repaired and expired.
        jdbcTemplate.update("UPDATE inventory_balances SET reserved = 1 WHERE variant_id = ?",
                anomalyFixture.variantId());
        orderService.expireAbandonedOrders();
        assertEquals(Order.Status.CANCELLED,
                orderRepository.findById(anomaly.id()).orElseThrow().getStatus());
        assertEquals(0, balance(anomalyFixture).getReserved());
    }

    private void assertPaymentConflict(Executable call) {
        ApiException conflict = assertThrows(ApiException.class, call);
        assertEquals(409, conflict.getStatus().value());
        assertEquals("PAYMENT_CONFLICT", conflict.getErrorCode().getCode());
    }

    private int paymentOutboxCount(Long orderId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM outbox_events
                WHERE aggregate_type = 'ORDER' AND aggregate_id = ? AND event_type = 'ORDER_PAYMENT_RECORDED'
                """, Integer.class, orderId.toString());
    }

    private int idempotencyCount(String key) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM idempotency_records WHERE idempotency_key = ?",
                Integer.class, key);
    }

    /**
     * Waits until another backend is blocked on the transaction that holds the product row lock.
     * PostgreSQL row locks are implemented as tuple locks, so a waiter appears as an ungranted
     * {@code transactionid} ShareLock on the blocker's xid rather than a lock on the table
     * relation. Matching that exact xid keeps scheduled workers or unrelated lock waits from
     * being mistaken for the checkout under test.
     */
    private void awaitLockWait(String blockerXid) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer waiting = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM pg_locks
                    WHERE locktype = 'transactionid'
                      AND NOT granted
                      AND transactionid::text = ?
                    """, Integer.class, blockerXid);
            if (waiting != null && waiting > 0) {
                return;
            }
            try {
                Thread.sleep(25);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                fail("Interrupted while waiting for a PostgreSQL lock wait");
            }
        }
        List<Map<String, Object>> locks = jdbcTemplate.queryForList("""
                SELECT l.pid, l.locktype, l.mode, l.granted, c.relname
                FROM pg_locks l
                LEFT JOIN pg_class c ON c.oid = l.relation
                WHERE NOT l.granted
                ORDER BY l.pid
                """);
        List<Map<String, Object>> activity = jdbcTemplate.queryForList("""
                SELECT pid, state, wait_event_type, wait_event, left(query, 160) AS query
                FROM pg_stat_activity
                WHERE datname = current_database()
                ORDER BY pid
                """);
        fail("No PostgreSQL row-lock wait observed for blockerXid=" + blockerXid
                + " locks=" + locks + " activity=" + activity);
    }

    private OrderResponse createPosOrder(Fixture fixture, int quantity) {
        return orderService.createOrder(new CreateOrderRequest("POS", null,
                        List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), quantity, null))),
                "phase3-create-" + UUID.randomUUID());
    }

    private int historyCount(Long orderId) {
        return orderStatusHistoryRepository.findByOrderIdOrderByChangedAtDescIdDesc(orderId).size();
    }

    private String latestOrderOutbox(Long orderId, String eventType) {
        return jdbcTemplate.queryForObject("""
                SELECT payload FROM outbox_events
                WHERE aggregate_type = 'ORDER' AND aggregate_id = ? AND event_type = ?
                ORDER BY id DESC LIMIT 1
                """, String.class, orderId.toString(), eventType);
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

    private ReceiptResponse receiveBatchAfterGate(Long receiptId, ReceiveItemsRequest request, String key,
                                                  CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        return receiptService.receiveStock(receiptId, request, key);
    }

    private boolean tryReceiveAfterGate(Long receiptId, ReceiveItemsRequest request, String key,
                                        CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        start.await();
        try {
            receiptService.receiveStock(receiptId, request, key);
            return true;
        } catch (BusinessRuleException ex) {
            return false;
        }
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

    // =========================================================================
    // Phase 02.1 Review Fixes: Findings F01, F02, F03, F04
    // =========================================================================

    @Test
    void cannotCreateOrderOrReservationOrMutateVariantsForArchivedProduct() {
        Fixture fixture = fixture(10, 0, 0);

        // Archive product
        productService.updateProduct(fixture.productId(), new UpdateProductRequest(null, null, null, "ARCHIVED"));

        // Creating order must be rejected
        CreateOrderRequest orderReq = new CreateOrderRequest(
                "POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 1, 1000L))
        );
        BusinessRuleException orderEx = assertThrows(BusinessRuleException.class,
                () -> orderService.createOrder(orderReq, "key-order-archived"));
        assertEquals("BAD_REQUEST", orderEx.getErrorCode().name());
        assertTrue(orderEx.getMessage().contains("ARCHIVED"));

        // Creating reservation must be rejected
        ReserveStockRequest reserveReq = new ReserveStockRequest(fixture.sku(), 1, null, 15);
        BusinessRuleException reserveEx = assertThrows(BusinessRuleException.class,
                () -> reservationService.reserve(reserveReq, "key-reserve-archived"));
        assertEquals("BAD_REQUEST", reserveEx.getErrorCode().name());
        assertTrue(reserveEx.getMessage().contains("ARCHIVED"));

        // Adding variant to ARCHIVED product must be rejected
        AddProductVariantRequest addVarReq = new AddProductVariantRequest("SKU-NEW-ARCH", "New Variant", 2000L, "VND", 0);
        BusinessRuleException addVarEx = assertThrows(BusinessRuleException.class,
                () -> productService.addVariant(fixture.productId(), addVarReq, "key-add-var"));
        assertEquals("BAD_REQUEST", addVarEx.getErrorCode().name());

        // Updating variant of ARCHIVED product must be rejected
        UpdateProductVariantRequest updateVarReq = new UpdateProductVariantRequest("SKU-MOD-ARCH", "Renamed", 1500L, "VND", "Renaming");
        BusinessRuleException updateVarEx = assertThrows(BusinessRuleException.class,
                () -> productService.updateVariant(fixture.productId(), fixture.variantId(), updateVarReq));
        assertEquals("BAD_REQUEST", updateVarEx.getErrorCode().name());
    }

    @Test
    void existingOrderAndReservationCanCompleteAfterProductArchived() {
        Fixture fixture = fixture(20, 0, 0);

        // Create order and reservation while PUBLISHED
        CreateOrderRequest orderReq = new CreateOrderRequest(
                "POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(fixture.sku(), 2, 1000L))
        );
        OrderResponse order = orderService.createOrder(orderReq, "key-pre-archive-order");
        assertEquals("PLACED", order.status());

        ReservationResponse hold = reservationService.reserve(
                new ReserveStockRequest(fixture.sku(), 3, null, 30),
                "key-pre-archive-hold"
        );
        assertEquals("ACTIVE", hold.status());

        // Now archive the product
        productService.updateProduct(fixture.productId(), new UpdateProductRequest(null, null, null, "ARCHIVED"));

        // Completing payment of existing order must succeed
        OrderResponse paid = orderService.confirmPayment(order.id(), "key-pay-pre-archive");
        assertEquals("CONFIRMED", paid.status());
        assertEquals("PAID", paid.paymentStatus());

        // Confirming sale on existing reservation must succeed
        assertDoesNotThrow(() -> reservationService.confirmSale(hold.id(), "key-sell-pre-archive"));

        // Verify inventory balance integrity
        InventoryBalance current = balanceRepository.findByVariantId(fixture.variantId()).orElseThrow();
        assertEquals(15, current.getOnHand()); // 20 - 2 (paid) - 3 (sold) = 15
        assertEquals(0, current.getReserved()); // reservations consumed
    }

    @Test
    void existingReceiptCanBeReceivedOrClosedShortAfterProductArchived() {
        Fixture fixture = fixture(0, 0, 0);

        // Create receipt while product is PUBLISHED
        CreateReceiptRequest createReceipt = new CreateReceiptRequest(
                "Supplier Inbound", "Incoming shipment",
                List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 50000L))
        );
        ReceiptResponse receipt = receiptService.createReceipt(createReceipt, "key-receipt-pre-archive");
        assertEquals("DRAFT", receipt.status());
        Long receiptItemId = receipt.items().getFirst().id();

        // Product is archived while goods are in transit
        productService.updateProduct(fixture.productId(), new UpdateProductRequest(null, null, null, "ARCHIVED"));

        // Inbound goods arrive at warehouse: receive 4 units
        ReceiveItemsRequest receiveReq = new ReceiveItemsRequest(
                List.of(new ReceiveItemsRequest.ItemInspection(receiptItemId, 4, 0))
        );
        ReceiptResponse partiallyReceived = receiptService.receiveStock(receipt.id(), receiveReq, "key-receive-pre-archive");
        assertEquals("PARTIALLY_RECEIVED", partiallyReceived.status());
        assertEquals(4, partiallyReceived.acceptedTotal());

        // Stock arrives into on_hand and ledger is recorded
        InventoryBalance bal = balanceRepository.findByVariantId(fixture.variantId()).orElseThrow();
        assertEquals(4, bal.getOnHand());
        assertEquals(1, ledgerCount(fixture));

        // Close short remaining 6 units
        CloseShortRequest closeReq = new CloseShortRequest("Supplier out of stock", partiallyReceived.version());
        ReceiptResponse closedShort = receiptService.closeShort(receipt.id(), closeReq, "key-close-short-pre-archive");
        assertEquals("CLOSED_SHORT", closedShort.status());
        assertEquals(4, closedShort.acceptedTotal());
    }

    @Test
    void multiItemOrderLocksProductsInAscendingOrderPreventingDeadlock() throws Exception {
        Fixture fixtureA = fixture(10, 0, 0);
        Fixture fixtureB = fixture(10, 0, 0);

        // Ensure distinct product IDs
        Long prodA = fixtureA.productId();
        Long prodB = fixtureB.productId();
        assertNotEquals(prodA, prodB);

        int concurrency = 4;
        ExecutorService pool = Executors.newFixedThreadPool(concurrency);
        CountDownLatch ready = new CountDownLatch(concurrency);
        CountDownLatch start = new CountDownLatch(1);

        // Two orders with reverse SKU orders
        CreateOrderRequest orderAB = new CreateOrderRequest(
                "POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(fixtureA.sku(), 1, 1000L),
                        new CreateOrderRequest.OrderItemRequest(fixtureB.sku(), 1, 1000L))
        );
        CreateOrderRequest orderBA = new CreateOrderRequest(
                "POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(fixtureB.sku(), 1, 1000L),
                        new CreateOrderRequest.OrderItemRequest(fixtureA.sku(), 1, 1000L))
        );

        Future<OrderResponse> f1 = pool.submit(() -> {
            ready.countDown();
            start.await();
            return orderService.createOrder(orderAB, "key-ab-" + UUID.randomUUID());
        });
        Future<OrderResponse> f2 = pool.submit(() -> {
            ready.countDown();
            start.await();
            return orderService.createOrder(orderBA, "key-ba-" + UUID.randomUUID());
        });
        Future<OrderResponse> f3 = pool.submit(() -> {
            ready.countDown();
            start.await();
            return orderService.createOrder(orderAB, "key-ab2-" + UUID.randomUUID());
        });
        Future<OrderResponse> f4 = pool.submit(() -> {
            ready.countDown();
            start.await();
            return orderService.createOrder(orderBA, "key-ba2-" + UUID.randomUUID());
        });

        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();

        assertNotNull(f1.get(10, TimeUnit.SECONDS));
        assertNotNull(f2.get(10, TimeUnit.SECONDS));
        assertNotNull(f3.get(10, TimeUnit.SECONDS));
        assertNotNull(f4.get(10, TimeUnit.SECONDS));
        pool.shutdown();
    }

    @Test
    void concurrentArchiveAndVariantUpdateDoesNotRaceOrCorruptState() throws Exception {
        Fixture fixture = fixture(10, 0, 0);

        int concurrency = 2;
        ExecutorService pool = Executors.newFixedThreadPool(concurrency);
        CountDownLatch ready = new CountDownLatch(concurrency);
        CountDownLatch start = new CountDownLatch(1);

        Future<ProductResponse> archiveFuture = pool.submit(() -> {
            ready.countDown();
            start.await();
            return productService.updateProduct(fixture.productId(),
                    new UpdateProductRequest(null, null, null, "ARCHIVED"));
        });

        Future<ProductResponse.VariantResponse> updateVariantFuture = pool.submit(() -> {
            ready.countDown();
            start.await();
            return productService.updateVariant(fixture.productId(), fixture.variantId(),
                    new UpdateProductVariantRequest(null, "Updated Title", 2500L, "VND", null));
        });

        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();

        // One of two valid serializations:
        // 1. Variant update wins lock first -> updates title/price -> archive wins next -> product becomes ARCHIVED.
        // 2. Archive wins lock first -> product becomes ARCHIVED -> variant update throws BAD_REQUEST ("Không thể cập nhật biến thể của sản phẩm đã ARCHIVED.").
        // In NEITHER case is there a deadlock or corrupted state.
        try {
            ProductResponse archived = archiveFuture.get(10, TimeUnit.SECONDS);
            assertEquals("ARCHIVED", archived.status());
        } catch (Exception ex) {
            fail("Archive should not fail: " + ex.getMessage());
        }

        try {
            ProductResponse.VariantResponse var = updateVariantFuture.get(10, TimeUnit.SECONDS);
            assertNotNull(var);
        } catch (Exception ex) {
            Throwable cause = ex.getCause();
            assertTrue(cause instanceof BusinessRuleException);
            assertTrue(cause.getMessage().contains("ARCHIVED"));
        }

        pool.shutdown();
    }

    @Test
    void receiptDraftUpdateStoresDetailedBeforeAfterAuditDiff() throws Exception {
        Fixture fixtureA = fixture(0, 0, 0);
        Fixture fixtureB = fixture(0, 0, 0);
        Fixture fixtureC = fixture(0, 0, 0);

        // Create draft receipt with items A and C
        CreateReceiptRequest createReq = new CreateReceiptRequest(
                "Initial Supplier", "Initial draft note",
                List.of(
                        new CreateReceiptRequest.ReceiptItemRequest(fixtureA.variantId(), 10, 50000L),
                        new CreateReceiptRequest.ReceiptItemRequest(fixtureC.variantId(), 5, 20000L)
                )
        );
        ReceiptResponse created = receiptService.createReceipt(createReq, "key-create-draft-diff");
        assertEquals("DRAFT", created.status());
        assertEquals(0L, created.version());

        // Update draft: modify A (expected 10->20, unitCost 50000->55000), add B, remove C
        UpdateReceiptRequest updateReq = new UpdateReceiptRequest(
                "Updated Supplier", "Updated draft note",
                List.of(
                        new CreateReceiptRequest.ReceiptItemRequest(fixtureA.variantId(), 20, 55000L),
                        new CreateReceiptRequest.ReceiptItemRequest(fixtureB.variantId(), 8, 30000L)
                ),
                created.version()
        );
        ReceiptResponse updated = receiptService.updateReceipt(created.id(), updateReq, "key-update-draft-diff");
        assertEquals("DRAFT", updated.status());
        assertEquals(1L, updated.version());
        assertEquals("Updated Supplier", updated.supplierName());
        assertEquals("Updated draft note", updated.note());

        // Verify UPDATED event
        assertNotNull(updated.events());
        ReceiptResponse.ReceiptEventResponse updateEvent = updated.events().stream()
                .filter(e -> "UPDATED".equals(e.eventType()))
                .findFirst()
                .orElseThrow();
        assertEquals(1L, updateEvent.receiptVersion());
        assertNotNull(updateEvent.payload());

        JsonNode payload = objectMapper.readTree(updateEvent.payload());
        assertEquals(0L, payload.get("version_before").asLong());
        assertEquals(1L, payload.get("version_after").asLong());
        assertEquals("Initial Supplier", payload.get("supplier_name_before").asText());
        assertEquals("Updated Supplier", payload.get("supplier_name_after").asText());
        assertEquals("Initial draft note", payload.get("note_before").asText());
        assertEquals("Updated draft note", payload.get("note_after").asText());

        // Check added_items contains fixture B
        JsonNode added = payload.get("added_items");
        assertEquals(1, added.size());
        assertEquals(fixtureB.variantId(), added.get(0).get("variantId").asLong());
        assertEquals(8, added.get(0).get("expectedQty").asInt());

        // Check removed_items contains fixture C
        JsonNode removed = payload.get("removed_items");
        assertEquals(1, removed.size());
        assertEquals(fixtureC.variantId(), removed.get(0).get("variantId").asLong());

        // Check updated_items contains fixture A diff
        JsonNode updatedItems = payload.get("updated_items");
        assertEquals(1, updatedItems.size());
        assertEquals(fixtureA.variantId(), updatedItems.get(0).get("variantId").asLong());
        assertEquals(10, updatedItems.get(0).get("fromExpectedQty").asInt());
        assertEquals(20, updatedItems.get(0).get("toExpectedQty").asInt());
        assertEquals(50000L, updatedItems.get(0).get("fromUnitCost").asLong());
        assertEquals(55000L, updatedItems.get(0).get("toUnitCost").asLong());
    }

    @Test
    void receiptMultipleDraftUpdatesPreserveAuditHistory() throws Exception {
        Fixture fixture = fixture(0, 0, 0);

        ReceiptResponse receipt = receiptService.createReceipt(
                new CreateReceiptRequest("Supplier 1", "Note 1",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 5, 10000L))),
                "key-multi-draft-0"
        );

        // Update 1 (v0 -> v1)
        ReceiptResponse v1 = receiptService.updateReceipt(receipt.id(),
                new UpdateReceiptRequest("Supplier 2", "Note 2",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 12000L)),
                        receipt.version()),
                "key-multi-draft-1"
        );
        assertEquals(1L, v1.version());

        // Update 2 (v1 -> v2)
        ReceiptResponse v2 = receiptService.updateReceipt(receipt.id(),
                new UpdateReceiptRequest("Supplier 3", "Note 3",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 15, 14000L)),
                        v1.version()),
                "key-multi-draft-2"
        );
        assertEquals(2L, v2.version());

        // Verify receipt_events has all 3 events
        List<Map<String, Object>> eventsInDb = jdbcTemplate.queryForList(
                "SELECT event_type, receipt_version, note, payload FROM receipt_events WHERE receipt_id = ? ORDER BY receipt_version ASC",
                receipt.id()
        );
        assertEquals(3, eventsInDb.size());
        assertEquals("CREATED", eventsInDb.get(0).get("event_type"));
        assertEquals("UPDATED", eventsInDb.get(1).get("event_type"));
        assertEquals("UPDATED", eventsInDb.get(2).get("event_type"));

        // Check payloads of both updates
        JsonNode p1 = objectMapper.readTree((String) eventsInDb.get(1).get("payload"));
        assertEquals("Supplier 1", p1.get("supplier_name_before").asText());
        assertEquals("Supplier 2", p1.get("supplier_name_after").asText());

        JsonNode p2 = objectMapper.readTree((String) eventsInDb.get(2).get("payload"));
        assertEquals("Supplier 2", p2.get("supplier_name_before").asText());
        assertEquals("Supplier 3", p2.get("supplier_name_after").asText());
    }

    @Test
    void closeShortWithExact500CharacterReasonSucceedsWithoutConstraintViolation() throws Exception {
        Fixture fixture = fixture(0, 0, 0);

        ReceiptResponse receipt = receiptService.createReceipt(
                new CreateReceiptRequest("Supplier QC", "Close short test",
                        List.of(new CreateReceiptRequest.ReceiptItemRequest(fixture.variantId(), 10, 25000L))),
                "key-close-short-500-create"
        );

        // Receive 4 items
        ReceiptResponse partiallyReceived = receiptService.receiveStock(
                receipt.id(),
                new ReceiveItemsRequest(List.of(
                        new ReceiveItemsRequest.ItemInspection(receipt.items().getFirst().id(), 4, 0)
                )),
                "key-close-short-500-receive"
        );
        assertEquals("PARTIALLY_RECEIVED", partiallyReceived.status());

        // Exactly 500 characters
        String exact500CharsReason = "X".repeat(500);
        assertEquals(500, exact500CharsReason.length());

        CloseShortRequest closeShortReq = new CloseShortRequest(exact500CharsReason, partiallyReceived.version());

        // This must NOT fail with chk_receipt_events_note_length violation
        ReceiptResponse closed = assertDoesNotThrow(() ->
                receiptService.closeShort(receipt.id(), closeShortReq, "key-close-short-500-execute"));
        assertEquals("CLOSED_SHORT", closed.status());
        assertEquals(exact500CharsReason, closed.closeShortReason());

        // Verify in database: note is exact 500 chars and constraint is satisfied
        Map<String, Object> eventRow = jdbcTemplate.queryForMap(
                "SELECT note, payload FROM receipt_events WHERE receipt_id = ? AND event_type = 'CLOSED_SHORT'",
                receipt.id()
        );
        String dbNote = (String) eventRow.get("note");
        assertEquals(500, dbNote.length());
        assertEquals(exact500CharsReason, dbNote);

        // Verify payload captures missing quantity
        JsonNode payload = objectMapper.readTree((String) eventRow.get("payload"));
        assertEquals(6, payload.get("missing_quantity").asInt());
        assertEquals(exact500CharsReason, payload.get("reason").asText());
    }

    @Test
    void variantSkuUpdateRecordsAuditTrailAndFlagsChannelListingsOutOfSync() {
        Fixture fixture = fixture(10, 0, 0);
        String oldSku = fixture.sku();
        String newSku = "SKU-RENAMED-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // Create channel and listing with status SYNCED
        Long channelId = insertChannel();
        Long listingId = jdbcTemplate.queryForObject("""
                INSERT INTO channel_listings (channel_id, variant_id, external_listing_id, external_sku, sync_status)
                VALUES (?, ?, 'ext-list-1', ?, 'SYNCED') RETURNING id
                """, Long.class, channelId, fixture.variantId(), oldSku);

        // Create order snapshotting the old SKU
        CreateOrderRequest orderReq = new CreateOrderRequest(
                "POS", null,
                List.of(new CreateOrderRequest.OrderItemRequest(oldSku, 1, 1000L))
        );
        OrderResponse order = orderService.createOrder(orderReq, "key-sku-audit-order");
        assertEquals(oldSku, order.items().getFirst().sku());

        // Update SKU with reason
        UpdateProductVariantRequest updateReq = new UpdateProductVariantRequest(
                newSku, null, null, null, "Vendor updated barcode"
        );
        ProductResponse.VariantResponse updatedVariant = productService.updateVariant(
                fixture.productId(), fixture.variantId(), updateReq
        );

        // Verify variantId is stable
        assertEquals(fixture.variantId(), updatedVariant.id());
        assertEquals(newSku, updatedVariant.sku());

        // Verify variant_update_audit table
        Map<String, Object> auditRow = jdbcTemplate.queryForMap(
                "SELECT variant_id, from_sku, to_sku, reason, actor FROM variant_update_audit WHERE variant_id = ?",
                fixture.variantId()
        );
        assertEquals(fixture.variantId(), ((Number) auditRow.get("variant_id")).longValue());
        assertEquals(oldSku, auditRow.get("from_sku"));
        assertEquals(newSku, auditRow.get("to_sku"));
        assertEquals("Vendor updated barcode", auditRow.get("reason"));
        assertEquals("system", auditRow.get("actor"));

        // Verify channel listing was flagged OUT_OF_SYNC
        String currentSyncStatus = jdbcTemplate.queryForObject(
                "SELECT sync_status FROM channel_listings WHERE id = ?", String.class, listingId
        );
        assertEquals("OUT_OF_SYNC", currentSyncStatus);

        // Verify historical order item preserved the old SKU snapshot
        String orderItemSku = jdbcTemplate.queryForObject(
                "SELECT sku FROM order_items WHERE order_id = ?", String.class, order.id()
        );
        assertEquals(oldSku, orderItemSku);
    }

    @Test
    void variantUpdateTransactionFailureRollsBackAudit() {
        Fixture fixture = fixture(5, 0, 0);
        String oldSku = fixture.sku();
        String newSku = "SKU-FAIL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        // Attempt update with negative price (invalid)
        UpdateProductVariantRequest invalidReq = new UpdateProductVariantRequest(
                newSku, null, -500L, null, "Will fail on price"
        );

        assertThrows(BusinessRuleException.class, () ->
                productService.updateVariant(fixture.productId(), fixture.variantId(), invalidReq));

        // Audit row must NOT be committed
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM variant_update_audit WHERE variant_id = ?",
                Integer.class, fixture.variantId()
        );
        assertEquals(0, count);

        // SKU must remain old SKU
        ProductVariant current = variantRepository.findById(fixture.variantId()).orElseThrow();
        assertEquals(oldSku, current.getSku());
    }
}
