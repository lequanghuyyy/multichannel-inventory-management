package com.octoflow.api.scheduler;

import com.octoflow.api.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Background worker that releases stock held by abandoned unpaid POS orders.
 */
@Component
public class OrderExpirationWorker {

    private static final Logger log = LoggerFactory.getLogger(OrderExpirationWorker.class);
    private final OrderService orderService;

    public OrderExpirationWorker(OrderService orderService) {
        this.orderService = orderService;
    }

    @Scheduled(fixedDelay = 60000) // Every 1 minute
    public void sweepExpiredOrders() {
        try {
            var result = orderService.expireAbandonedOrders();
            if (result.failed() > 0) {
                log.warn("POS order expiry sweep finished with {} failure(s); valid orders were still committed",
                        result.failed());
            }
        } catch (Exception ex) {
            log.error("Error during POS order expiration sweep: {}", ex.getMessage(), ex);
        }
    }
}
