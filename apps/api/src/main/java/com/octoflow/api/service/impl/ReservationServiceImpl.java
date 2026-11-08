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
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.ReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
public class ReservationServiceImpl implements ReservationService {

    private static final Logger log = LoggerFactory.getLogger(ReservationServiceImpl.class);
    private static final int DEFAULT_TTL_MINUTES = 15;
    private static final int MAX_TTL_MINUTES = 1440;

    private final ReservationRepository reservationRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final ReservationMapper reservationMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;
    private final ReservationExpiryProcessor expiryProcessor;

    public ReservationServiceImpl(ReservationRepository reservationRepository,
                                  InventoryBalanceRepository balanceRepository,
                                  ProductVariantRepository variantRepository,
                                  ReservationMapper reservationMapper,
                                  IdempotencyService idempotencyService,
                                  InventoryMovementRecorder movementRecorder,
                                  ReservationExpiryProcessor expiryProcessor) {
        this.reservationRepository = reservationRepository;
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.reservationMapper = reservationMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
        this.expiryProcessor = expiryProcessor;
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
        if (request == null || request.sku() == null || request.sku().isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "SKU không được để trống.");
        }
        if (request.quantity() == null || request.quantity() <= 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng giữ phải lớn hơn 0.");
        }
        int ttl = request.ttlMinutes() == null ? DEFAULT_TTL_MINUTES : request.ttlMinutes();
        if (ttl < 1 || ttl > MAX_TTL_MINUTES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Thời hạn giữ phải từ 1 đến " + MAX_TTL_MINUTES + " phút.");
        }

        String sku = request.sku().trim();
        ProductVariant variant = variantRepository.findBySku(sku)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + sku));

        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Chưa có số dư tồn kho cho SKU " + sku));

        if (availableToSell(balance, sku) < request.quantity()) {
            throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Số lượng có thể bán không đủ để giữ hàng");
        }

        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        try {
            balance.setReserved(Math.addExact(balance.getReserved(), request.quantity()));
        } catch (ArithmeticException ex) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Số lượng giữ vượt giới hạn hỗ trợ.");
        }
        balanceRepository.save(balance);

        Instant now = reservationRepository.databaseNow().toInstant();
        Reservation hold = new Reservation();
        hold.setVariantId(variant.getId());
        hold.setOrderId(request.orderId());
        hold.setQuantity(request.quantity());
        hold.setStatus(Reservation.Status.ACTIVE);
        hold.setExpiresAt(now.plus(ttl, ChronoUnit.MINUTES));

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
        if (!hold.getExpiresAt().isAfter(reservationRepository.databaseNow().toInstant())) {
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

        // A release that reaches an already-overdue hold is an expiry, not a cancellation.
        boolean expired = !hold.getExpiresAt().isAfter(reservationRepository.databaseNow().toInstant());
        if (balance.getReserved() < hold.getQuantity()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số lượng giữ trong reservation không khớp với số dư tồn kho.");
        }
        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        balance.setReserved(balance.getReserved() - hold.getQuantity());
        balanceRepository.save(balance);

        hold.setStatus(expired ? Reservation.Status.EXPIRED : Reservation.Status.CANCELLED);
        reservationRepository.save(hold);
        movementRecorder.record(hold.getVariantId(), before, balance,
                expired ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED",
                (expired ? "Expire reservation " : "Release reservation ") + reservationId,
                reservationId.toString());
    }

    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ExpirySweepResult expireHolds() {
        Instant now = Instant.now();
        List<ReservationRepository.ExpiredReservationCandidate> candidates = reservationRepository.findExpiredCandidates(now);
        int expired = 0;
        int skipped = 0;
        int failed = 0;

        for (ReservationRepository.ExpiredReservationCandidate candidate : candidates) {
            try {
                if (expiryProcessor.expireOne(candidate.getId())) {
                    expired++;
                } else {
                    skipped++;
                }
            } catch (Exception ex) {
                failed++;
                // Each candidate owns a separate transaction, so valid expirations before and
                // after this one are already durable. Log enough identity to retry the bad row.
                log.error("Reservation expiry failed for reservationId={} variantId={}: {}",
                        candidate.getId(), candidate.getVariantId(), ex.getMessage(), ex);
            }
        }

        if (failed > 0) {
            log.warn("Reservation expiry sweep completed with failures: expired={} skipped={} failed={}",
                    expired, skipped, failed);
        } else if (expired > 0) {
            log.info("Reservation expiry sweep completed: expired={} skipped={}", expired, skipped);
        }
        return new ExpirySweepResult(expired, skipped, failed);
    }

    private int availableToSell(InventoryBalance balance, String sku) {
        try {
            return balance.getAvailableToSell();
        } catch (IllegalStateException ex) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số dư tồn kho của SKU " + sku + " đang không nhất quán.");
        }
    }

    private void requireHeldQuantity(InventoryBalance balance, Reservation hold) {
        if (balance.getReserved() < hold.getQuantity() || balance.getOnHand() < hold.getQuantity()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số dư tồn kho không đủ để xác nhận reservation " + hold.getId());
        }
    }
}
