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

    void expireHolds();
}
