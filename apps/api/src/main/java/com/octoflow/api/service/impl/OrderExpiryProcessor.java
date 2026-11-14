package com.octoflow.api.service.impl;

import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.entity.OrderStatusHistory;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.OrderAuditRecorder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Expires exactly one abandoned POS order in its own transaction. The separate bean is required
 * because a {@code REQUIRES_NEW} annotation on a self-invocation would be ignored by Spring.
 */
@Service
public class OrderExpiryProcessor {

    private static final String EXPIRY_REASON = "Hết hạn giữ hàng POS sau thời gian chờ.";

    private final OrderRepository orderRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryMovementRecorder movementRecorder;
    private final OrderAuditRecorder auditRecorder;

    public OrderExpiryProcessor(OrderRepository orderRepository,
                                InventoryBalanceRepository balanceRepository,
                                InventoryMovementRecorder movementRecorder,
                                OrderAuditRecorder auditRecorder) {
        this.orderRepository = orderRepository;
        this.balanceRepository = balanceRepository;
        this.movementRecorder = movementRecorder;
        this.auditRecorder = auditRecorder;
    }

    /**
     * @return true when this call performed the expiry, false when another writer won the race
     *         or the order is no longer due.
     * @throws BusinessRuleException when the order exists but the stock balance does not cover
     *         the hold; the caller records the failure and continues with other orders.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean expireOne(Long orderId) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderRepository.VariantQuantity row : orderRepository.findVariantQuantitiesByOrderId(orderId)) {
            if (row.getVariantId() == null || row.getQuantity() == null || row.getQuantity() <= 0) {
                throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                        "Đơn hàng có số lượng dòng không hợp lệ.");
            }
            quantities.put(row.getVariantId(), row.getQuantity());
        }

        // Canonical lock order: inventory balances (ascending variant_id), then the order row.
        Map<Long, InventoryBalance> balances = new LinkedHashMap<>();
        for (Long variantId : quantities.keySet()) {
            balances.put(variantId, balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                            "Không tìm thấy số dư tồn kho cho variant #" + variantId)));
        }

        Order order = orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null
                || order.getSource() != Order.Source.POS
                || order.getStatus() != Order.Status.PLACED
                || order.getPaymentStatus() != Order.PaymentStatus.PENDING
                || order.getHoldExpiresAt() == null) {
            return false;
        }

        // Read the database clock after both locks: a transaction that waited must not decide
        // expiry from a clock sampled before it acquired the row.
        Instant now = orderRepository.databaseNow().toInstant();
        if (order.getHoldExpiresAt().isAfter(now)) {
            return false;
        }

        Map<Long, Long> lockedQuantities = aggregateOrderQuantities(order);
        if (!lockedQuantities.equals(quantities)) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Dòng đơn hàng đã thay đổi trong lúc xử lý hết hạn; hãy thử lại.");
        }

        for (Map.Entry<Long, Long> entry : lockedQuantities.entrySet()) {
            Long variantId = entry.getKey();
            long quantityLong = entry.getValue();
            if (quantityLong > Integer.MAX_VALUE) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng giữ cho variant #" + variantId + " vượt giới hạn hỗ trợ.");
            }
            int quantity = (int) quantityLong;
            InventoryBalance balance = balances.get(variantId);
            if (balance.getReserved() < quantity) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số dư không đủ để giải phóng hàng giữ của đơn " + order.getOrderNumber());
            }
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            balance.setReserved(balance.getReserved() - quantity);
            balanceRepository.save(balance);
            movementRecorder.record(variantId, before, balance, "ORDER_EXPIRED",
                    "Expire unpaid POS order " + order.getOrderNumber(), order.getOrderNumber());
        }

        order.setStatus(Order.Status.CANCELLED);
        order.setHoldExpiresAt(null);
        Order saved = orderRepository.save(order);

        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.EXPIRED,
                Order.Status.PLACED, Order.Status.CANCELLED,
                Order.PaymentStatus.PENDING, Order.PaymentStatus.PENDING, EXPIRY_REASON);
        auditRecorder.recordOutbox(saved, "ORDER_EXPIRED", EXPIRY_REASON, null);
        return true;
    }

    private Map<Long, Long> aggregateOrderQuantities(Order order) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderItem item : order.getItems()) {
            try {
                quantities.merge(item.getVariantId(), (long) item.getQuantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Tổng số lượng cho variant #" + item.getVariantId() + " vượt giới hạn hỗ trợ.");
            }
        }
        return quantities;
    }
}
