package com.octoflow.api.repository;

import com.octoflow.api.entity.ChannelListing;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChannelListingRepository extends JpaRepository<ChannelListing, Long> {

    List<ChannelListing> findByChannelId(Long channelId);

    List<ChannelListing> findByVariantId(Long variantId);

    Optional<ChannelListing> findByChannelIdAndVariantId(Long channelId, Long variantId);
}
