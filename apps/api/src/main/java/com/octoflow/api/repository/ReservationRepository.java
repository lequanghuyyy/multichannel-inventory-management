package com.octoflow.api.repository;

import com.octoflow.api.entity.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    List<Reservation> findByVariantIdAndStatus(Long variantId, Reservation.Status status);

    @Query("SELECT r FROM Reservation r WHERE r.status = 'ACTIVE' AND r.expiresAt <= :now")
    List<Reservation> findExpiredActiveReservations(@Param("now") Instant now);
}
