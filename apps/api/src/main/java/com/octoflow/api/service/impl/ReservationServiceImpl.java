package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.dto.response.ReservationResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.Reservation;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ReservationMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.ReservationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class ReservationServiceImpl implements ReservationService {

    private final ReservationRepository reservationRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final ReservationMapper reservationMapper;

    public ReservationServiceImpl(ReservationRepository reservationRepository,
                                  InventoryBalanceRepository balanceRepository,
                                  ProductVariantRepository variantRepository,
                                  ReservationMapper reservationMapper) {
        this.reservationRepository = reservationRepository;
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.reservationMapper = reservationMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReservationResponse> listReservations() {
        List<Reservation> holds = reservationRepository.findAll();
        return reservationMapper.toResponseList(holds, variantId ->
                variantRepository.findById(variantId).map(ProductVariant::getSku).orElse("UNKNOWN")
        );
    }

    @Override
    @Transactional(readOnly = true)
    public ReservationResponse getReservationById(Long reservationId) {
        Reservation hold = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng #" + reservationId));

        String sku = variantRepository.findById(hold.getVariantId())
                .map(ProductVariant::getSku)
                .orElse("UNKNOWN");
        return reservationMapper.toResponse(hold, sku);
    }

    @Override
    @Transactional
    public ReservationResponse reserve(ReserveStockRequest request, String idempotencyKey) {
        ProductVariant variant = variantRepository.findBySku(request.sku())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + request.sku()));

        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Chưa có số dư tồn kho cho SKU " + request.sku()));

        if (balance.getAvailableToSell() < request.quantity()) {
            throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Số lượng có thể bán không đủ để giữ hàng");
        }

        // Increase reserved count
        balance.setReserved(balance.getReserved() + request.quantity());
        balanceRepository.save(balance);

        int ttl = request.ttlMinutes() != null && request.ttlMinutes() > 0 ? request.ttlMinutes() : 15;
        Reservation hold = new Reservation();
        hold.setVariantId(variant.getId());
        hold.setOrderId(request.orderId());
        hold.setQuantity(request.quantity());
        hold.setStatus(Reservation.Status.ACTIVE);
        hold.setExpiresAt(Instant.now().plus(ttl, ChronoUnit.MINUTES));

        Reservation saved = reservationRepository.save(hold);
        return reservationMapper.toResponse(saved, variant.getSku());
    }

    @Override
    @Transactional
    public void confirmSale(Long reservationId, String idempotencyKey) {
        Reservation hold = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));

        if (hold.getStatus() != Reservation.Status.ACTIVE) {
            throw new BusinessRuleException(ErrorCode.RESERVATION_ALREADY_CONFIRMED, "Mã giữ hàng không còn hiệu lực");
        }
        if (hold.isExpired()) {
            hold.setStatus(Reservation.Status.EXPIRED);
            reservationRepository.save(hold);
            throw new BusinessRuleException(ErrorCode.RESERVATION_EXPIRED, "Mã giữ hàng đã hết hạn");
        }

        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(hold.getVariantId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tồn kho cho biến thể"));

        // Confirm sale: deduct both onHand and reserved atomically
        balance.setOnHand(Math.max(0, balance.getOnHand() - hold.getQuantity()));
        balance.setReserved(Math.max(0, balance.getReserved() - hold.getQuantity()));
        balanceRepository.save(balance);

        hold.setStatus(Reservation.Status.CONFIRMED);
        reservationRepository.save(hold);
    }

    @Override
    @Transactional
    public void release(Long reservationId) {
        Reservation hold = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));

        if (hold.getStatus() != Reservation.Status.ACTIVE) {
            return;
        }

        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(hold.getVariantId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tồn kho cho biến thể"));

        balance.setReserved(Math.max(0, balance.getReserved() - hold.getQuantity()));
        balanceRepository.save(balance);

        hold.setStatus(Reservation.Status.CANCELLED);
        reservationRepository.save(hold);
    }

    @Override
    @Transactional
    public void expireHolds() {
        List<Reservation> expiredHolds = reservationRepository.findExpiredActiveReservations(Instant.now());
        for (Reservation hold : expiredHolds) {
            balanceRepository.findByVariantIdWithLock(hold.getVariantId()).ifPresent(balance -> {
                balance.setReserved(Math.max(0, balance.getReserved() - hold.getQuantity()));
                balanceRepository.save(balance);
            });
            hold.setStatus(Reservation.Status.EXPIRED);
            reservationRepository.save(hold);
        }
    }
}
