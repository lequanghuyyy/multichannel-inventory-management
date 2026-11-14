package com.octoflow.api.scheduler;

import com.octoflow.api.service.ReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Background worker that regularly sweeps and releases expired reservations.
 */
@Component
public class ReservationExpirationWorker {

    private static final Logger log = LoggerFactory.getLogger(ReservationExpirationWorker.class);
    private final ReservationService reservationService;

    public ReservationExpirationWorker(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @Scheduled(fixedDelay = 60000) // Every 1 minute
    public void sweepExpiredReservations() {
        try {
            var result = reservationService.expireHolds();
            if (result.failed() > 0) {
                log.warn("Reservation expiry sweep finished with {} failure(s); valid holds were still committed",
                        result.failed());
            }
        } catch (Exception ex) {
            log.error("Error during reservation expiration sweep: {}", ex.getMessage(), ex);
        }
    }
}
