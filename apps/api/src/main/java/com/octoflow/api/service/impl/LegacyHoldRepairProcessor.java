package com.octoflow.api.service.impl;

import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.PosPaymentDetailRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Repairs legacy POS orders created before V7. Those rows can be PLACED/PENDING with no
 * {@code hold_expires_at}, so the normal expiry sweep can never see them even though their
 * inventory is still reserved.
 *
 * <p>The repair is deliberately metadata-only: it derives the deadline from the order's
 * database-authored {@code created_at} and the configured hold TTL. It never writes a ledger,
 * history, or outbox row and never releases stock. Actual release stays in the expiry
 * processor, which owns the normal audit trail. Rows whose items, payment state, totals, or
 * reserved quantity are inconsistent are reported as anomalies and left untouched.</p>
 *
 * <p>Each order runs in its own {@code REQUIRES_NEW} transaction. Locks are taken in the same
 * canonical order as checkout and expiry: inventory balances by ascending variant id, then the
 * order row. Two worker instances therefore cannot repair or release the same hold twice.</p>
 */
@Service
public class LegacyHoldRepairProcessor {

    private final OrderRepository orderRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final PosPaymentDetailRepository paymentRepository;
    private final Duration holdTtl;

    public LegacyHoldRepairProcessor(OrderRepository orderRepository,
                                     InventoryBalanceRepository balanceRepository,
                                     PosPaymentDetailRepository paymentRepository,
                                     @Value("${app.orders.hold-ttl:PT15M}") Duration holdTtl) {
        this.orderRepository = orderRepository;
        this.balanceRepository = balanceRepository;
        this.paymentRepository = paymentRepository;
        this.holdTtl = holdTtl;
        if (holdTtl == null || holdTtl.isZero() || holdTtl.isNegative()) {
            throw new IllegalArgumentException("app.orders.hold-ttl must be a positive duration");
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public RepairOutcome repairOne(Long orderId) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderRepository.VariantQuantity row : orderRepository.findVariantQuantitiesByOrderId(orderId)) {
            if (row.getVariantId() == null || row.getQuantity() == null || row.getQuantity() <= 0) {
                return anomalyAfterLock(orderId, "order line quantity is invalid");
            }
            quantities.put(row.getVariantId(), row.getQuantity());
        }

        Map<Long, InventoryBalance> balances = new LinkedHashMap<>();
        for (Long variantId : quantities.keySet()) {
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variantId).orElse(null);
            if (balance == null) {
                return anomalyAfterLock(orderId, "missing inventory balance for variant #" + variantId);
            }
            balances.put(variantId, balance);
        }

        Order order = orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null || !isLegacyCandidate(order)) {
            return RepairOutcome.skipped();
        }
        if (quantities.isEmpty()) {
            return anomaly(order, "order has no items");
        }

        Map<Long, Long> lockedQuantities;
        long computedTotal;
        try {
            lockedQuantities = aggregateQuantities(order.getItems());
            computedTotal = totalAmount(order.getItems());
        } catch (ArithmeticException | IllegalArgumentException ex) {
            return anomaly(order, "order line totals are invalid or overflow");
        }
        if (!lockedQuantities.equals(quantities)) {
            return anomaly(order, "order lines changed while repairing");
        }
        if (paymentRepository.existsById(orderId)) {
            return anomaly(order, "payment record exists for a PENDING order");
        }

        Instant createdAt = order.getCreatedAt();
        if (createdAt == null) {
            return anomaly(order, "created_at is missing");
        }
        if (order.getTotalAmount() == null || !order.getTotalAmount().equals(computedTotal)) {
            return anomaly(order, "total_amount does not match order items");
        }
        for (Map.Entry<Long, Long> entry : lockedQuantities.entrySet()) {
            InventoryBalance balance = balances.get(entry.getKey());
            if (balance == null || balance.getReserved() < entry.getValue()) {
                return anomaly(order, "reserved stock does not cover the order hold");
            }
        }

        Instant holdExpiresAt;
        try {
            holdExpiresAt = createdAt.plus(holdTtl);
        } catch (RuntimeException ex) {
            return anomaly(order, "created_at cannot be converted to a hold deadline");
        }
        order.setHoldExpiresAt(holdExpiresAt);
        orderRepository.save(order);
        return RepairOutcome.repaired(order.getOrderNumber(), holdExpiresAt);
    }

    private RepairOutcome anomalyAfterLock(Long orderId, String reason) {
        Order order = orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null || !isLegacyCandidate(order)) {
            return RepairOutcome.skipped();
        }
        return anomaly(order, reason);
    }

    private RepairOutcome anomaly(Order order, String reason) {
        return RepairOutcome.anomaly(order.getOrderNumber(), reason);
    }

    private boolean isLegacyCandidate(Order order) {
        return order != null
                && order.getSource() == Order.Source.POS
                && order.getStatus() == Order.Status.PLACED
                && order.getPaymentStatus() == Order.PaymentStatus.PENDING
                && order.getHoldExpiresAt() == null;
    }

    private Map<Long, Long> aggregateQuantities(List<OrderItem> items) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderItem item : items) {
            if (item.getVariantId() == null || item.getQuantity() <= 0) {
                throw new IllegalArgumentException("invalid order line");
            }
            quantities.merge(item.getVariantId(), (long) item.getQuantity(), Math::addExact);
        }
        return quantities;
    }

    private long totalAmount(List<OrderItem> items) {
        long total = 0L;
        for (OrderItem item : items) {
            if (item.getUnitPrice() == null || item.getUnitPrice() < 0) {
                throw new IllegalArgumentException("invalid unit price");
            }
            total = Math.addExact(total,
                    Math.multiplyExact(item.getUnitPrice(), (long) item.getQuantity()));
        }
        return total;
    }

    public enum RepairStatus {
        REPAIRED, SKIPPED, ANOMALY
    }

    public record RepairOutcome(RepairStatus status, String orderNumber, String detail) {

        static RepairOutcome repaired(String orderNumber, Instant holdExpiresAt) {
            return new RepairOutcome(RepairStatus.REPAIRED, orderNumber, holdExpiresAt.toString());
        }

        static RepairOutcome skipped() {
            return new RepairOutcome(RepairStatus.SKIPPED, null, null);
        }

        static RepairOutcome anomaly(String orderNumber, String detail) {
            return new RepairOutcome(RepairStatus.ANOMALY, orderNumber, detail);
        }
    }
}
