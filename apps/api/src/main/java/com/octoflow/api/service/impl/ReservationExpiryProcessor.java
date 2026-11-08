package com.octoflow.api.service.impl;

import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Reservation;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.InventoryMovementRecorder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Expires exactly one reservation in its own transaction. Keeping this in a separate bean is
 * deliberate: a {@code REQUIRES_NEW} annotation on a self-invocation from
 * {@link ReservationServiceImpl#expireHolds()} would be ignored by the Spring proxy.
 */
@Service
public class ReservationExpiryProcessor {

    private final ReservationRepository reservationRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryMovementRecorder movementRecorder;

    public ReservationExpiryProcessor(ReservationRepository reservationRepository,
                                      InventoryBalanceRepository balanceRepository,
                                      InventoryMovementRecorder movementRecorder) {
        this.reservationRepository = reservationRepository;
        this.balanceRepository = balanceRepository;
        this.movementRecorder = movementRecorder;
    }

    /**
     * @return true when this call performed the expiry, false when another writer won the race
     *         or the hold is no longer due.
     * @throws BusinessRuleException when the reservation exists but the stock balance does not
     *         cover it; the caller records the failure and continues with other holds.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean expireOne(Long reservationId) {
        Long variantId = reservationRepository.findVariantIdById(reservationId).orElse(null);
        if (variantId == null) {
            return false;
        }

        // Canonical lock order: balance first, then reservation.
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variantId)
                .orElseThrow(() -> new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Không tìm thấy số dư tồn kho cho variant #" + variantId));
        Reservation hold = reservationRepository.findByIdForUpdate(reservationId).orElse(null);
        if (hold == null || hold.getStatus() != Reservation.Status.ACTIVE) {
            return false;
        }

        // Read the database clock after both locks: a transaction that waited must not decide
        // expiry from a clock sampled before it acquired the row.
        Instant now = reservationRepository.databaseNow().toInstant();
        if (hold.getExpiresAt().isAfter(now)) {
            return false;
        }
        if (balance.getReserved() < hold.getQuantity()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số lượng giữ hết hạn không khớp với số dư tồn kho cho reservation " + reservationId + ".");
        }

        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
        balance.setReserved(balance.getReserved() - hold.getQuantity());
        balanceRepository.save(balance);

        hold.setStatus(Reservation.Status.EXPIRED);
        reservationRepository.save(hold);
        movementRecorder.record(hold.getVariantId(), before, balance, "RESERVATION_EXPIRED",
                "Expire reservation " + hold.getId(), hold.getId().toString());
        return true;
    }
}
