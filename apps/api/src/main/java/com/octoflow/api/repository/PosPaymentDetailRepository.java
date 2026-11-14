package com.octoflow.api.repository;

import com.octoflow.api.entity.PosPaymentDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PosPaymentDetailRepository extends JpaRepository<PosPaymentDetail, Long> {
}
