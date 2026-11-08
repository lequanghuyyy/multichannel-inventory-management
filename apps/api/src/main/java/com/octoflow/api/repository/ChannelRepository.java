package com.octoflow.api.repository;

import com.octoflow.api.entity.Channel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ChannelRepository extends JpaRepository<Channel, Long> {

    Optional<Channel> findByCode(String code);

    boolean existsByCode(String code);
}
