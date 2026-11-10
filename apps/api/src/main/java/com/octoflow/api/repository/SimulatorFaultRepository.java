package com.octoflow.api.repository;

import com.octoflow.api.entity.SimulatorFault;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SimulatorFaultRepository extends JpaRepository<SimulatorFault, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM SimulatorFault f WHERE f.listingId = :listingId")
    Optional<SimulatorFault> findByListingIdForUpdate(@Param("listingId") Long listingId);
}
