package com.octoflow.api.repository;

import com.octoflow.api.entity.SimulatorListingState;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SimulatorListingStateRepository extends JpaRepository<SimulatorListingState, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO simulator_listing_states
                (listing_id, quantity, version, created_at, updated_at)
            VALUES (:listingId, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (listing_id) DO NOTHING
            """, nativeQuery = true)
    int ensureExists(@Param("listingId") Long listingId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SimulatorListingState s WHERE s.listingId = :listingId")
    Optional<SimulatorListingState> findByListingIdForUpdate(@Param("listingId") Long listingId);
}
