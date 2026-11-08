package com.octoflow.api.repository;

import com.octoflow.api.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNumber(String orderNumber);

    Optional<Order> findBySourceAndExternalOrderId(Order.Source source, String externalOrderId);
}
