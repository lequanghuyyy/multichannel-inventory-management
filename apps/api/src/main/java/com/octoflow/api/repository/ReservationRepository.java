package com.octoflow.api.repository;

import com.octoflow.api.entity.Reservation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Collection;

@Repository
public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Reservation r WHERE r.id = :id")
    java.util.Optional<Reservation> findByIdForUpdate(@Param("id") Long id);

    List<Reservation> findByVariantIdAndStatus(Long variantId, Reservation.Status status);

    boolean existsByVariantIdIn(Collection<Long> variantIds);

    @Query("SELECT r.id AS id, r.variantId AS variantId FROM Reservation r " +
            "WHERE r.status = 'ACTIVE' AND r.expiresAt <= :now ORDER BY r.variantId, r.id")
    List<ExpiredReservationCandidate> findExpiredCandidates(@Param("now") Instant now);

    @Query("SELECT r.variantId FROM Reservation r WHERE r.id = :id")
    java.util.Optional<Long> findVariantIdById(@Param("id") Long id);

    /**
     * The database clock is read after the balance and reservation locks are held, so a
     * transaction that waited on a lock does not decide expiry from a stale application clock.
     */
    @Query(value = "SELECT clock_timestamp()", nativeQuery = true)
    java.sql.Timestamp databaseNow();

    interface ExpiredReservationCandidate {
        Long getId();
        Long getVariantId();
    }
}
