package com.octoflow.api.service.impl;

import com.octoflow.api.entity.Order;
import com.octoflow.api.mapper.OrderMapper;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.OrderStatusHistoryRepository;
import com.octoflow.api.repository.PosPaymentDetailRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.OrderAuditRecorder;
import com.octoflow.api.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Focused proof that the sweep selects candidates with the PostgreSQL clock, not the JVM clock,
 * and passes a bounded stable page to the repository. The integration suite covers the actual
 * locking, expiry, and multi-worker races.
 */
class OrderExpirySweepTest {

    @Test
    void sweepUsesDatabaseClockAndBoundedStableBatches() {
        OrderRepository orderRepository = mock(OrderRepository.class);
        OrderExpiryProcessor expiryProcessor = mock(OrderExpiryProcessor.class);
        LegacyHoldRepairProcessor repairProcessor = mock(LegacyHoldRepairProcessor.class);

        Instant databaseNow = Instant.parse("2000-01-01T00:00:00Z");
        when(orderRepository.databaseNow()).thenReturn(Timestamp.from(databaseNow));
        when(orderRepository.findLegacyPosHoldCandidates(
                any(), any(), any(), anyLong(), any(Pageable.class))).thenReturn(List.of());
        when(orderRepository.findExpiredOrderCandidates(
                any(), any(), any(), any(Instant.class), any(Pageable.class))).thenReturn(List.of());

        OrderServiceImpl service = new OrderServiceImpl(
                orderRepository,
                mock(ProductRepository.class),
                mock(ProductVariantRepository.class),
                mock(InventoryBalanceRepository.class),
                mock(ChannelRepository.class),
                mock(OrderStatusHistoryRepository.class),
                mock(PosPaymentDetailRepository.class),
                mock(OrderMapper.class),
                mock(IdempotencyService.class),
                mock(InventoryMovementRecorder.class),
                mock(OrderAuditRecorder.class),
                expiryProcessor,
                repairProcessor,
                Duration.ofMinutes(15),
                7);

        OrderService.OrderExpirySweepResult result = service.expireAbandonedOrders();

        assertEquals(0, result.expired());
        assertEquals(0, result.skipped());
        assertEquals(0, result.failed());
        verify(orderRepository).databaseNow();
        verify(orderRepository).findLegacyPosHoldCandidates(
                eq(Order.Source.POS), eq(Order.Status.PLACED), eq(Order.PaymentStatus.PENDING),
                eq(0L), eq(PageRequest.of(0, 7)));
        verify(orderRepository).findExpiredOrderCandidates(
                eq(Order.Source.POS), eq(Order.Status.PLACED), eq(Order.PaymentStatus.PENDING),
                eq(databaseNow), eq(PageRequest.of(0, 7)));
        verifyNoInteractions(expiryProcessor, repairProcessor);
    }
}
