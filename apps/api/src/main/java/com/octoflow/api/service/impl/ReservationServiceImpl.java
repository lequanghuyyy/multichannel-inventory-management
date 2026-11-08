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
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
public class ReservationServiceImpl implements ReservationService {

    private final ReservationRepository reservationRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final ReservationMapper reservationMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;

    public ReservationServiceImpl(ReservationRepository reservationRepository,
                                  InventoryBalanceRepository balanceRepository,
                                  ProductVariantRepository variantRepository,
                                  ReservationMapper reservationMapper,
                                  IdempotencyService idempotencyService,
                                  InventoryMovementRecorder movementRecorder) {
        this.reservationRepository = reservationRepository;
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.reservationMapper = reservationMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
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
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/inventory/reserve", request,
                ReservationResponse.class, () -> reserveInternal(request, idempotencyKey));
    }

    private ReservationResponse reserveInternal(ReserveStockRequest request, String idempotencyKey) {
        ProductVariant variant = variantRepository.findBySku(request.sku())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + request.sku()));

        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Chưa có số dư tồn kho cho SKU " + request.sku()));

        if (balance.getAvailableToSell() < request.quantity()) {
            throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Số lượng có thể bán không đủ để giữ hàng");
        }

        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        // Increase reserved count
        try {
            balance.setReserved(Math.addExact(balance.getReserved(), request.quantity()));
        } catch (ArithmeticException ex) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Số lượng giữ vượt giới hạn hỗ trợ.");
        }
        balanceRepository.save(balance);

        int ttl = request.ttlMinutes() != null && request.ttlMinutes() > 0 ? request.ttlMinutes() : 15;
        Reservation hold = new Reservation();
        hold.setVariantId(variant.getId());
        hold.setOrderId(request.orderId());
        hold.setQuantity(request.quantity());
        hold.setStatus(Reservation.Status.ACTIVE);
        hold.setExpiresAt(Instant.now().plus(ttl, ChronoUnit.MINUTES));

        Reservation saved = reservationRepository.save(hold);
        movementRecorder.record(variant.getId(), before, balance, "RESERVATION_CREATED",
                "Reserve stock for reservation " + saved.getId(), saved.getId().toString());
        return reservationMapper.toResponse(saved, variant.getSku());
    }

    @Override
    @Transactional
    public void confirmSale(Long reservationId, String idempotencyKey) {
        idempotencyService.execute(idempotencyKey, "POST:/api/v1/inventory/sell?reservationId=" + reservationId,
                Map.of("reservationId", reservationId), Void.class, () -> {
                    confirmSaleInternal(reservationId);
                    return null;
                });
    }

    private void confirmSaleInternal(Long reservationId) {
        Long variantId = reservationRepository.findVariantIdById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));
        // Keep a single inventory lock order across reservation transitions: balance, then hold.
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tồn kho cho biến thể"));
        Reservation hold = reservationRepository.findByIdForUpdate(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));

        if (hold.getStatus() != Reservation.Status.ACTIVE) {
            throw new BusinessRuleException(ErrorCode.RESERVATION_ALREADY_CONFIRMED, "Mã giữ hàng không còn hiệu lực");
        }
        if (hold.isExpired()) {
            throw new BusinessRuleException(ErrorCode.RESERVATION_EXPIRED, "Mã giữ hàng đã hết hạn");
        }

        requireHeldQuantity(balance, hold);
        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        balance.setOnHand(balance.getOnHand() - hold.getQuantity());
        balance.setReserved(balance.getReserved() - hold.getQuantity());
        balanceRepository.save(balance);

        hold.setStatus(Reservation.Status.CONFIRMED);
        reservationRepository.save(hold);
        movementRecorder.record(hold.getVariantId(), before, balance, "SALE_CONFIRMED",
                "Confirm reservation " + reservationId, reservationId.toString());
    }

    @Override
    @Transactional
    public void release(Long reservationId) {
        Long variantId = reservationRepository.findVariantIdById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tồn kho cho biến thể"));
        Reservation hold = reservationRepository.findByIdForUpdate(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.RESERVATION_NOT_FOUND, "Không tìm thấy mã giữ hàng"));

        if (hold.getStatus() != Reservation.Status.ACTIVE) {
            return;
        }

        if (balance.getReserved() < hold.getQuantity()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số lượng giữ trong reservation không khớp với số dư tồn kho.");
        }
        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        balance.setReserved(balance.getReserved() - hold.getQuantity());
        balanceRepository.save(balance);

        hold.setStatus(Reservation.Status.CANCELLED);
        reservationRepository.save(hold);
        movementRecorder.record(hold.getVariantId(), before, balance, "RESERVATION_RELEASED",
                "Release reservation " + reservationId, reservationId.toString());
    }

    @Override
    @Transactional
    public void expireHolds() {
        Instant now = Instant.now();
        List<ReservationRepository.ExpiredReservationCandidate> candidates = reservationRepository.findExpiredCandidates(now);
        for (ReservationRepository.ExpiredReservationCandidate candidate : candidates) {
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(candidate.getVariantId())
                    .orElseThrow(() -> new IllegalStateException("Reservation has no inventory balance: " + candidate.getId()));
            Reservation hold = reservationRepository.findByIdForUpdate(candidate.getId())
                    .orElseThrow(() -> new IllegalStateException("Reservation disappeared during expiry sweep: " + candidate.getId()));
            if (hold.getStatus() != Reservation.Status.ACTIVE || hold.getExpiresAt().isAfter(now)) {
                continue;
            }
            if (balance.getReserved() < hold.getQuantity()) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng giữ hết hạn không khớp với số dư tồn kho.");
            }
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            balance.setReserved(balance.getReserved() - hold.getQuantity());
            balanceRepository.save(balance);
            hold.setStatus(Reservation.Status.EXPIRED);
            reservationRepository.save(hold);
            movementRecorder.record(hold.getVariantId(), before, balance, "RESERVATION_EXPIRED",
                    "Expire reservation " + hold.getId(), hold.getId().toString());
        }
    }

    private void requireHeldQuantity(InventoryBalance balance, Reservation hold) {
        if (balance.getReserved() < hold.getQuantity() || balance.getOnHand() < hold.getQuantity()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số dư tồn kho không đủ để xác nhận reservation " + hold.getId());
        }
    }
}
