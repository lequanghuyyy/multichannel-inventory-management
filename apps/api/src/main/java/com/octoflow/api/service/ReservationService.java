package com.octoflow.api.service;

import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.dto.response.ReservationResponse;

import java.util.List;

public interface ReservationService {

    List<ReservationResponse> listReservations();

    ReservationResponse getReservationById(Long reservationId);

    ReservationResponse reserve(ReserveStockRequest request, String idempotencyKey);

    void confirmSale(Long reservationId, String idempotencyKey);

    void release(Long reservationId);

    /**
     * Sweeps one candidate at a time in its own transaction. A single inconsistent reservation
     * is reported and skipped; it cannot roll back other holds that were validly expired.
     */
    ExpirySweepResult expireHolds();

    record ExpirySweepResult(int expired, int skipped, int failed) {}
}
