package com.octoflow.api.repository;

import com.octoflow.api.entity.OutboxEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    @Query("SELECT e FROM OutboxEvent e WHERE e.status = 'PENDING' AND e.nextAttemptAt <= CURRENT_TIMESTAMP ORDER BY e.nextAttemptAt ASC, e.createdAt ASC")
    List<OutboxEvent> findPendingEvents(Pageable pageable);
}
