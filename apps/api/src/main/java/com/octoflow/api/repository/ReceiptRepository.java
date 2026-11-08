package com.octoflow.api.repository;

import com.octoflow.api.entity.Receipt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReceiptRepository extends JpaRepository<Receipt, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Receipt r WHERE r.id = :id")
    Optional<Receipt> findByIdForUpdate(@Param("id") Long id);

    Optional<Receipt> findByReceiptNumber(String receiptNumber);
}
