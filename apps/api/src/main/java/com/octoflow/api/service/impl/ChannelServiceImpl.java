package com.octoflow.api.service.impl;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.request.VerifyChannelMappingRequest;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ChannelMapper;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.ChannelMappingRecorder;
import com.octoflow.api.service.ChannelService;
import com.octoflow.api.service.ListingLeaseService;
import com.octoflow.api.service.ReconciliationService;
import com.octoflow.api.service.SyncJobManagementService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ChannelServiceImpl implements ChannelService {

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository channelListingRepository;
    private final ProductVariantRepository variantRepository;
    private final ChannelMapper channelMapper;
    private final ChannelAdapterRouter adapterRouter;
    private final ChannelMappingRecorder mappingRecorder;
    private final ListingLeaseService listingLeaseService;
    private final ReconciliationService reconciliationService;
    private final SyncJobManagementService syncJobManagementService;

    public ChannelServiceImpl(ChannelRepository channelRepository,
                              ChannelListingRepository channelListingRepository,
                              ProductVariantRepository variantRepository,
                              ChannelMapper channelMapper,
                              ChannelAdapterRouter adapterRouter,
                              ChannelMappingRecorder mappingRecorder,
                              ListingLeaseService listingLeaseService,
                              ReconciliationService reconciliationService,
                              SyncJobManagementService syncJobManagementService) {
        this.channelRepository = channelRepository;
        this.channelListingRepository = channelListingRepository;
        this.variantRepository = variantRepository;
        this.channelMapper = channelMapper;
        this.adapterRouter = adapterRouter;
        this.mappingRecorder = mappingRecorder;
        this.listingLeaseService = listingLeaseService;
        this.reconciliationService = reconciliationService;
        this.syncJobManagementService = syncJobManagementService;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelResponse> listChannels() {
        return channelMapper.toChannelResponses(channelRepository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public ChannelResponse getChannelById(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND, "Không tìm thấy kênh #" + channelId));
        return channelMapper.toChannelResponse(channel);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelListingResponse> getChannelListings(Long channelId) {
        List<ChannelListing> listings = channelListingRepository.findByChannelId(channelId);
        return channelMapper.toListingResponses(listings);
    }

    @Override
    @Transactional
    public ChannelListingResponse registerMapping(Long channelId, RegisterChannelMappingRequest request) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
        if (request == null || request.sku() == null || request.sku().isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "SKU là bắt buộc khi đăng ký mapping.");
        }
        ProductVariant variant = variantRepository.findBySku(request.sku().trim())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                        "Không tìm thấy SKU " + request.sku()));
        String externalListingId = trimToNull(request.externalListingId());
        if (externalListingId == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "external_listing_id là bắt buộc.");
        }
        if (externalListingId.length() > 128) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "external_listing_id tối đa 128 ký tự.");
        }
        String externalSku = trimToNull(request.externalSku());
        if (externalSku == null) {
            externalSku = variant.getSku();
        }
        if (externalSku.length() > 64) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "external_sku tối đa 64 ký tự.");
        }
        String externalVariantId = trimToNull(request.externalVariantId());
        if (externalVariantId != null && externalVariantId.length() > 128) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "external_variant_id tối đa 128 ký tự.");
        }

        ChannelListing listing = channelListingRepository.findByChannelIdAndVariantId(channelId, variant.getId())
                .orElseGet(ChannelListing::new);
        boolean isNew = listing.getId() == null;
        boolean identityChanged = !externalListingId.equals(listing.getExternalListingId())
                || (externalSku != null && !externalSku.equals(listing.getExternalSku()))
                || (externalVariantId != null && !externalVariantId.equals(listing.getExternalVariantId()));

        List<ChannelListing.MappingStatus> activeStatuses = List.of(
                ChannelListing.MappingStatus.REGISTERED, ChannelListing.MappingStatus.VERIFIED);
        boolean duplicateListingId = isNew
                ? channelListingRepository.existsByChannelIdAndExternalListingIdAndMappingStatusIn(
                        channelId, externalListingId, activeStatuses)
                : channelListingRepository.existsByChannelIdAndExternalListingIdAndIdNotAndMappingStatusIn(
                        channelId, externalListingId, listing.getId(), activeStatuses);
        if (duplicateListingId) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.DATA_INTEGRITY_VIOLATION,
                    "external_listing_id đã được đăng ký cho một variant khác trên kênh này.");
        }
        boolean duplicateVariantId = externalVariantId != null && (isNew
                ? channelListingRepository.existsByChannelIdAndExternalVariantId(channelId, externalVariantId)
                : channelListingRepository.existsByChannelIdAndExternalVariantIdAndIdNot(
                        channelId, externalVariantId, listing.getId()));
        if (duplicateVariantId) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.DATA_INTEGRITY_VIOLATION,
                    "external_variant_id đã được đăng ký cho một listing khác trên kênh này.");
        }

        listing.setChannel(channel);
        listing.setVariant(variant);
        listing.setExternalListingId(externalListingId);
        listing.setExternalSku(externalSku);
        listing.setExternalVariantId(externalVariantId);
        if (isNew) {
            listing.setMappingStatus(ChannelListing.MappingStatus.REGISTERED);
            listing.setMappingVerifiedAt(null);
            listing.setActive(true);
        } else if (identityChanged) {
            listing.setMappingStatus(ChannelListing.MappingStatus.REGISTERED);
            listing.setMappingVerifiedAt(null);
        }
        ChannelListing saved = channelListingRepository.save(listing);
        return channelMapper.toListingResponse(saved);
    }

    @Override
    public ChannelListingResponse verifyMapping(Long channelId, Long listingId,
                                                VerifyChannelMappingRequest request) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
        ChannelListing listing = channelListingRepository.findByChannelIdAndId(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
        if (request != null) {
            if (request.externalSku() != null && !request.externalSku().isBlank()
                    && !request.externalSku().trim().equals(listing.getExternalSku())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "external_sku xác minh không khớp với mapping đã đăng ký.");
            }
            if (request.externalVariantId() != null && !request.externalVariantId().isBlank()
                    && !request.externalVariantId().trim().equals(listing.getExternalVariantId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "external_variant_id xác minh không khớp với mapping đã đăng ký.");
            }
        }
        if (channel.getStatus() != Channel.Status.CONNECTED) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Kênh chưa CONNECTED nên không thể xác minh mapping.");
        }

        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(channel);
        } catch (ChannelAdapterException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Chưa có connector để xác minh mapping trên kênh.");
        }

        return listingLeaseService.tryCallWithLock(listingId, () -> {
            ChannelInventoryAdapter.MappingSnapshot snapshot;
            try {
                snapshot = adapter.verifyMapping(channel, listing);
            } catch (ChannelAdapterException ex) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                        "Không thể xác minh mapping: " + ex.getMessage());
            }
            return mappingRecorder.applyVerified(channelId, listingId, adapter.name(), snapshot);
        }).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, ErrorCode.CONCURRENT_MODIFICATION,
                "Liên kết #" + listingId + " đang được đồng bộ; hãy thử lại."));
    }

    @Override
    @Transactional(readOnly = true)
    public ListingSyncStatusResponse getListingSyncStatus(Long channelId, Long listingId) {
        return syncJobManagementService.getListingStatus(channelId, listingId);
    }

    @Override
    public ChannelSyncEvidenceResponse reconcileListing(Long channelId, Long listingId) {
        return reconciliationService.reconcileListing(channelId, listingId);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
