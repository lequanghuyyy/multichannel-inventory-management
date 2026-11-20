package com.octoflow.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.adapter.WooCommerceApiClient.RemoteOrder;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.entity.*;
import com.octoflow.api.repository.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/** One order, its stock movement, quota change and outbox records commit together. */
@Service
public class WooCommerceOrderTransaction {
    private final ChannelRepository channels;
    private final ChannelListingRepository listings;
    private final ProductVariantRepository variants;
    private final ProductRepository products;
    private final InventoryBalanceRepository balances;
    private final AllocationPlanRepository plans;
    private final OrderRepository orders;
    private final InventoryMovementRecorder movements;
    private final OrderAuditRecorder audit;
    private final WooCommerceProperties properties;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final EntityManager entityManager;

    public WooCommerceOrderTransaction(ChannelRepository channels, ChannelListingRepository listings,
            ProductVariantRepository variants, ProductRepository products, InventoryBalanceRepository balances,
            AllocationPlanRepository plans, OrderRepository orders, InventoryMovementRecorder movements,
            OrderAuditRecorder audit, WooCommerceProperties properties, JdbcTemplate jdbc,
            ObjectMapper json, EntityManager entityManager) {
        this.channels = channels; this.listings = listings; this.variants = variants; this.products = products;
        this.balances = balances; this.plans = plans; this.orders = orders; this.movements = movements;
        this.audit = audit; this.properties = properties; this.jdbc = jdbc; this.json = json;
        this.entityManager = entityManager;
    }

    @Transactional
    public WooCommerceOrderIngestionService.Result importOrder(long channelId, RemoteOrder remote,
                                                                 List<Long> listingIds) {
        Channel channel = verifiedChannel(channelId);
        WooCommerceOrderIngestionService.Result existing = existing(channel, remote);
        if (existing != null) return existing;
        String fingerprint = fingerprint(remote, channel.getConnectionTargetFingerprint());
        if (!Set.of("processing", "completed").contains(remote.status())) {
            throw new IllegalArgumentException("Trạng thái " + remote.status() + " cần kiểm tra; chưa nhập tồn.");
        }
        if (!"VND".equals(remote.currency())) throw new IllegalArgumentException("Chỉ hỗ trợ tiền tệ VND.");
        if (!Boolean.FALSE.equals(remote.hasRefunds())) {
            throw new IllegalArgumentException("Thiếu thông tin hoàn tiền hoặc đơn đã hoàn tiền; cần kiểm tra.");
        }
        if (remote.lines().isEmpty() || remote.lines().size() != listingIds.size()) {
            throw new IllegalArgumentException("Đơn không có dòng sản phẩm hợp lệ.");
        }
        long total = amount(remote.total());
        Set<String> lineIds = new HashSet<>();
        for (var line : remote.lines()) {
            if (line.id() == null || !line.id().matches("[1-9][0-9]{0,19}") || !lineIds.add(line.id())) {
                throw new IllegalArgumentException("Định danh dòng đơn WooCommerce không hợp lệ hoặc bị trùng.");
            }
            if (!Objects.equals(line.reducedStock(), line.quantity())) {
                throw new IllegalArgumentException("Thiếu bằng chứng giảm tồn khớp số lượng cho SKU " + line.sku());
            }
        }

        return createOrder(channel, remote, listingIds, fingerprint, total);
    }

    @Transactional
    public WooCommerceOrderIngestionService.Result checkExisting(long channelId, RemoteOrder remote) {
        return existing(verifiedChannel(channelId), remote);
    }

    private Channel verifiedChannel(long channelId) {
        Channel channel = channels.findByIdForUpdate(channelId).orElseThrow();
        if (!"woocommerce".equalsIgnoreCase(channel.getCode())
                || !"woocommerce".equalsIgnoreCase(channel.getConnectorName())
                || channel.getStatus() != Channel.Status.CONNECTED || channel.getConnectionVerifiedAt() == null
                || !properties.readAvailable(channel) || properties.storeTargetIssue(channel) != null) {
            throw new IllegalStateException("Kết nối WooCommerce không còn được xác minh.");
        }
        return channel;
    }

    private WooCommerceOrderIngestionService.Result existing(Channel channel, RemoteOrder remote) {
        String fingerprint = fingerprint(remote, channel.getConnectionTargetFingerprint());
        orders.lockExternalOrderIdentity(ByteBuffer.wrap(hash(channel.getId() + ":" + remote.id())).getLong());
        Order existing = orders.findByChannelIdAndExternalOrderId(channel.getId(), remote.id()).orElse(null);
        if (existing != null) {
            List<String> fingerprints = jdbc.queryForList(
                    "SELECT fingerprint FROM woocommerce_order_imports WHERE order_id = ?", String.class, existing.getId());
            if (existing.getSource() != Order.Source.WOOCOMMERCE || fingerprints.size() != 1
                    || !fingerprint.equals(fingerprints.getFirst())) {
                throw new IllegalStateException("Đơn WooCommerce đã tồn tại với nội dung khác; cần kiểm tra.");
            }
            return new WooCommerceOrderIngestionService.Result(remote.id(), existing.getId(), null);
        }
        return null;
    }

    private WooCommerceOrderIngestionService.Result createOrder(Channel channel, RemoteOrder remote,
            List<Long> listingIds, String fingerprint, long total) {
        long channelId = channel.getId();
        Map<Long, ChannelListing> selected = new HashMap<>();
        for (Long listingId : listingIds) {
            ChannelListing listing = listings.findById(listingId).orElseThrow();
            selected.put(listingId, listing);
        }
        List<Long> variantIds = selected.values().stream().map(l -> l.getVariant().getId()).distinct().sorted().toList();
        Map<Long, Long> productIds = new HashMap<>();
        for (Long variantId : variantIds) {
            ProductVariant variant = variants.findById(variantId).orElseThrow();
            productIds.put(variantId, variant.getProduct().getId());
        }
        for (Long productId : productIds.values().stream().distinct().sorted().toList()) {
            products.findByIdForUpdate(productId).orElseThrow();
        }
        for (Long variantId : variantIds) {
            ProductVariant variant = variants.findByIdForUpdate(variantId).orElseThrow();
            entityManager.refresh(variant, LockModeType.PESSIMISTIC_WRITE);
            if (!Objects.equals(variant.getProduct().getId(), productIds.get(variantId))) {
                throw new IllegalStateException("Sản phẩm của SKU đã thay đổi; hãy thử lại.");
            }
        }
        Map<Long, InventoryBalance> lockedBalances = new LinkedHashMap<>();
        for (Long variantId : variantIds) {
            lockedBalances.put(variantId, balances.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new IllegalStateException("SKU chưa có số dư tồn kho.")));
            if (plans.hasUnresolvedCurrentAllocation(variantId)) {
                throw new IllegalStateException("SKU đang có phân bổ chưa hoàn tất; hãy đối soát trước khi nhập.");
            }
        }
        for (Long id : selected.keySet().stream().sorted().toList()) {
            entityManager.refresh(selected.get(id), LockModeType.PESSIMISTIC_WRITE);
        }

        Map<Long, Line> merged = new TreeMap<>();
        for (int i = 0; i < remote.lines().size(); i++) {
            var line = remote.lines().get(i);
            ChannelListing listing = selected.get(listingIds.get(i));
            String variation = "0".equals(line.variationId()) ? null : line.variationId();
            if (!listing.isActive() || listing.getMappingStatus() != ChannelListing.MappingStatus.VERIFIED
                    || listing.getMappingVerifiedAt() == null || !Objects.equals(listing.getChannel().getId(), channelId)
                    || !Objects.equals(listing.getExternalListingId(), line.productId())
                    || !Objects.equals(listing.getExternalVariantId(), variation)
                    || !Objects.equals(listing.getExternalSku(), line.sku())
                    || !lockedBalances.containsKey(listing.getVariant().getId())) {
                throw new IllegalStateException("Mapping WooCommerce đã thay đổi; hãy thử lại.");
            }
            long lineTotal = amount(line.total());
            if (lineTotal % line.quantity() != 0) {
                throw new IllegalArgumentException("Đơn giá VND không nguyên; cần kiểm tra SKU " + line.sku());
            }
            long unitPrice = lineTotal / line.quantity();
            Long variantId = listing.getVariant().getId();
            Line old = merged.get(variantId);
            if (old != null && (!Objects.equals(old.listingId(), listing.getId()) || old.unitPrice() != unitPrice)) {
                throw new IllegalArgumentException("Các dòng cùng SKU có đơn giá hoặc mapping khác nhau.");
            }
            int quantity = Math.addExact(old == null ? 0 : old.quantity(), line.quantity());
            if (quantity > 1_000_000) throw new IllegalArgumentException("Số lượng SKU vượt giới hạn.");
            merged.put(variantId, new Line(listing.getId(), quantity, unitPrice));
        }

        List<OrderItem> items = new ArrayList<>();
        Order order = new Order();
        order.setOrderNumber("ORD-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase(Locale.ROOT));
        order.setSource(Order.Source.WOOCOMMERCE);
        order.setChannelId(channelId);
        order.setExternalOrderId(remote.id());
        order.setCurrency("VND");
        order.setTotalAmount(total);
        for (var entry : merged.entrySet()) {
            Long variantId = entry.getKey(); Line line = entry.getValue();
            ChannelListing listing = selected.get(line.listingId());
            InventoryBalance balance = lockedBalances.get(variantId);
            ProductVariant variant = variants.findById(variantId).orElseThrow();
            if (!"VND".equalsIgnoreCase(variant.getCurrency()) || variant.getProduct().getStatus() == Product.Status.ARCHIVED) {
                throw new IllegalStateException("Sản phẩm không khả dụng hoặc tiền tệ không phù hợp.");
            }
            long totalQuota = listings.findByVariantId(variantId).stream().mapToLong(ChannelListing::getAllocatedQuota).sum();
            if (balance.getAvailableToSell() < line.quantity() || listing.getAllocatedQuota() < line.quantity()
                    || totalQuota > balance.getAvailableToSell()) {
                throw new IllegalStateException("Tồn khả dụng hoặc quota không đủ cho SKU " + variant.getSku());
            }
            OrderItem item = new OrderItem();
            item.setOrder(order); item.setVariantId(variantId); item.setSku(variant.getSku());
            item.setQuantity(line.quantity()); item.setUnitPrice(line.unitPrice()); items.add(item);
        }
        order.setItems(items);
        Order saved = orders.saveAndFlush(order);
        audit.recordHistory(saved, OrderStatusHistory.Action.CREATED, null, Order.Status.PLACED,
                null, Order.PaymentStatus.PENDING, null);
        for (var entry : merged.entrySet()) {
            InventoryBalance balance = lockedBalances.get(entry.getKey());
            Line line = entry.getValue();
            ChannelListing listing = selected.get(line.listingId());
            var before = InventoryMovementRecorder.Snapshot.from(balance);
            balance.setOnHand(balance.getOnHand() - line.quantity());
            listing.setAllocatedQuota(listing.getAllocatedQuota() - line.quantity());
            listing.setOrderReconciliationRequired(true);
            listing.setSyncStatus(ChannelListing.SyncStatus.OUT_OF_SYNC);
            listing.setLastSyncError("Đơn WooCommerce cần đối soát trước khi ghi tồn.");
            listings.save(listing);
            movements.record(entry.getKey(), before, balance, "WOO_ORDER_SALE",
                    "WooCommerce order " + remote.id(), saved.getOrderNumber());
        }
        saved.setStatus(Order.Status.CONFIRMED);
        saved.setPaymentStatus(Order.PaymentStatus.PAID);
        orders.save(saved);
        audit.recordHistory(saved, OrderStatusHistory.Action.STATUS_CHANGED, Order.Status.PLACED,
                Order.Status.CONFIRMED, Order.PaymentStatus.PENDING, Order.PaymentStatus.PAID,
                "Imported paid WooCommerce order");
        audit.recordOutbox(saved, "ORDER_CREATED", "Imported WooCommerce order", null);
        jdbc.update("INSERT INTO woocommerce_order_imports(order_id, fingerprint, store_fingerprint, external_status, external_modified_at) VALUES (?, ?, ?, ?, ?)",
                saved.getId(), fingerprint, channel.getConnectionTargetFingerprint(), remote.status(), remote.modifiedAtGmt());
        for (int i = 0; i < remote.lines().size(); i++) {
            var line = remote.lines().get(i);
            ChannelListing listing = selected.get(listingIds.get(i));
            jdbc.update("""
                    INSERT INTO woocommerce_order_import_lines(order_id, external_line_id, listing_id, mapping_version,
                        product_id, variation_id, external_sku, quantity, reduced_stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, saved.getId(), line.id(), listing.getId(), listing.getMappingVersion(), line.productId(),
                    line.variationId(), line.sku(), line.quantity(), line.reducedStock());
        }
        return new WooCommerceOrderIngestionService.Result(remote.id(), saved.getId(), null);
    }

    private record Line(Long listingId, int quantity, long unitPrice) {}

    private long amount(String value) {
        try {
            long result = new BigDecimal(value).longValueExact();
            if (result < 0) throw new NumberFormatException();
            return result;
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Số tiền VND không hợp lệ hoặc không nguyên.");
        }
    }

    private String fingerprint(RemoteOrder remote, String storeFingerprint) {
        try {
            var lines = remote.lines().stream().sorted(Comparator.comparing(line ->
                    line.id() + ":" + line.productId() + ":" + line.variationId() + ":" + line.sku() + ":" + line.quantity()
                            + ":" + line.reducedStock() + ":" + line.total())).toList();
            return HexFormat.of().formatHex(hash(json.writeValueAsString(List.of(
                    storeFingerprint, remote.id(), remote.status(), remote.currency(), Objects.toString(remote.total(), ""),
                    Objects.toString(remote.hasRefunds(), ""), lines))));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Không thể ghi nhận nội dung đơn.", ex);
        }
    }

    private byte[] hash(String value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
