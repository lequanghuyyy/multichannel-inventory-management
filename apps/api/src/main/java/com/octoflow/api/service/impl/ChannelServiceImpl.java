package com.octoflow.api.service.impl;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.adapter.WooCommerceReason;
import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.request.VerifyChannelMappingRequest;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ChannelMapper;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.SyncJobRepository;
import com.octoflow.api.service.ChannelMappingRecorder;
import com.octoflow.api.service.ChannelService;
import com.octoflow.api.service.ListingLeaseService;
import com.octoflow.api.service.ReconciliationService;
import com.octoflow.api.service.SyncJobManagementService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
public class ChannelServiceImpl implements ChannelService {

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository channelListingRepository;
    private final ProductVariantRepository variantRepository;
    private final AllocationPlanItemRepository allocationPlanItemRepository;
    private final SyncJobRepository syncJobRepository;
    private final ChannelMapper channelMapper;
    private final ChannelAdapterRouter adapterRouter;
    private final ChannelMappingRecorder mappingRecorder;
    private final ListingLeaseService listingLeaseService;
    private final ReconciliationService reconciliationService;
    private final SyncJobManagementService syncJobManagementService;

    public ChannelServiceImpl(ChannelRepository channelRepository,
                              ChannelListingRepository channelListingRepository,
                              ProductVariantRepository variantRepository,
                              AllocationPlanItemRepository allocationPlanItemRepository,
                              SyncJobRepository syncJobRepository,
                              ChannelMapper channelMapper,
                              ChannelAdapterRouter adapterRouter,
                              ChannelMappingRecorder mappingRecorder,
                              ListingLeaseService listingLeaseService,
                              ReconciliationService reconciliationService,
                              SyncJobManagementService syncJobManagementService) {
        this.channelRepository = channelRepository;
        this.channelListingRepository = channelListingRepository;
        this.variantRepository = variantRepository;
        this.allocationPlanItemRepository = allocationPlanItemRepository;
        this.syncJobRepository = syncJobRepository;
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
        boolean explicitExternalSku = externalSku != null;
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
        if ("woocommerce".equalsIgnoreCase(channel.getCode())) {
            requireWooCommerceIdentity(externalListingId, externalVariantId, externalSku, explicitExternalSku);
        }

        ChannelListing listing = channelListingRepository.findByChannelIdAndVariantIdForUpdate(channelId, variant.getId())
                .orElseGet(ChannelListing::new);
        boolean isNew = listing.getId() == null;
        boolean identityChanged = !externalListingId.equals(listing.getExternalListingId())
                || !Objects.equals(externalSku, listing.getExternalSku())
                || !Objects.equals(externalVariantId, listing.getExternalVariantId());

        if (!isNew && identityChanged) {
            blockUnsafeRemap(listing);
        }

        List<ChannelListing.MappingStatus> activeStatuses = List.of(
                ChannelListing.MappingStatus.REGISTERED, ChannelListing.MappingStatus.VERIFIED);
        // A product may own several variants. Product-level uniqueness only applies when the
        // mapping does not identify a variant; variant-level uniqueness is checked separately.
        boolean duplicateListingId = externalVariantId == null && (isNew
                ? channelListingRepository.existsByChannelIdAndExternalListingIdAndMappingStatusIn(
                        channelId, externalListingId, activeStatuses)
                : channelListingRepository.existsByChannelIdAndExternalListingIdAndIdNotAndMappingStatusIn(
                        channelId, externalListingId, listing.getId(), activeStatuses));
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
            listing.setMappingVersion(1L);
        } else if (identityChanged) {
            listing.setMappingStatus(ChannelListing.MappingStatus.REGISTERED);
            listing.setMappingVerifiedAt(null);
            listing.setMappingVersion(listing.getMappingVersion() + 1L);
        }
        ChannelListing saved = channelListingRepository.save(listing);
        return channelMapper.toListingResponse(saved);
    }

    /**
     * WooCommerce mappings use numeric REST identifiers. The SKU must be entered explicitly so a
     * defaulted Core SKU can never be mistaken for proof that the remote item carries that SKU;
     * the adapter still compares it with the live store during verification.
     */
    private void requireWooCommerceIdentity(String externalListingId, String externalVariantId,
                                            String externalSku, boolean explicitExternalSku) {
        if (!externalListingId.matches("\\d{1,20}")) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "external_listing_id của WooCommerce phải là ID sản phẩm dạng số.");
        }
        if (externalVariantId != null && !externalVariantId.matches("\\d{1,20}")) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "external_variant_id của WooCommerce phải là ID biến thể dạng số.");
        }
        if (!explicitExternalSku || externalSku == null || externalSku.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Cần nhập external_sku chính xác của WooCommerce khi đăng ký mapping.");
        }
    }

    private void blockUnsafeRemap(ChannelListing listing) {
        if (listing.getAllocatedQuota() > 0) {
            throw new BusinessRuleException(ErrorCode.MAPPING_REMAP_BLOCKED,
                    "Không thể đổi mapping khi listing còn quota đang công bố. Hãy đưa quota về 0 trước.");
        }
        if (listing.getSyncStatus() == ChannelListing.SyncStatus.OUT_OF_SYNC
                || listing.getSyncStatus() == ChannelListing.SyncStatus.ERROR) {
            throw new BusinessRuleException(ErrorCode.MAPPING_REMAP_BLOCKED,
                    "Trạng thái tồn trên kênh chưa chắc chắn; hãy đối soát trước khi đổi mapping.");
        }
        boolean unresolvedJob = syncJobRepository.existsByListingIdAndStatusIn(listing.getId(),
                List.of(SyncJob.Status.PENDING, SyncJob.Status.PROCESSING, SyncJob.Status.RETRY_PENDING,
                        SyncJob.Status.UNCONFIRMED, SyncJob.Status.DRIFT));
        if (unresolvedJob) {
            throw new BusinessRuleException(ErrorCode.MAPPING_REMAP_BLOCKED,
                    "Listing đang có sync job chưa kết thúc; hãy xử lý job trước khi đổi mapping.");
        }
        boolean allocationActive = allocationPlanItemRepository.existsActiveForListing(listing.getId(),
                AllocationPlan.Status.APPLYING,
                List.of(AllocationPlanItem.Status.PENDING, AllocationPlanItem.Status.RETRY_PENDING));
        if (allocationActive) {
            throw new BusinessRuleException(ErrorCode.MAPPING_REMAP_BLOCKED,
                    "Listing đang nằm trong một kế hoạch phân bổ đang thực thi; hãy đợi kế hoạch kết thúc.");
        }
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
        requireVerifiableChannel(channel);

        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.requireRead(channel);
        } catch (ChannelAdapterException ex) {
            throw adapterUnavailable(ex, "Chưa có connector để xác minh mapping trên kênh.");
        }

        return listingLeaseService.tryCallWithLock(listingId, () -> {
            ChannelListing current = channelListingRepository.findDetailedByChannelIdAndId(channelId, listingId)
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                            "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
            requireVerifiableChannel(current.getChannel());
            ChannelInventoryAdapter.MappingSnapshot snapshot;
            try {
                snapshot = adapter.verifyMapping(channel, current);
            } catch (ChannelAdapterException ex) {
                throw mappingVerificationFailure(ex);
            }
            return mappingRecorder.applyVerified(channelId, listingId, adapter.name(),
                    current.getMappingVersion(),
                    current.getExternalListingId(),
                    current.getExternalVariantId(),
                    current.getExternalSku(),
                    snapshot);
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

    private void requireVerifiableChannel(Channel channel) {
        if (channel == null || channel.getStatus() != Channel.Status.CONNECTED) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Kênh chưa CONNECTED nên không thể xác minh mapping.");
        }
        if ("woocommerce".equalsIgnoreCase(channel.getCode())
                && channel.getConnectionVerifiedAt() == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Kết nối WooCommerce chưa được xác minh qua API ("
                            + WooCommerceReason.CONNECTION_NOT_VERIFIED + ").");
        }
    }

    private ApiException adapterUnavailable(ChannelAdapterException ex, String fallback) {
        if (WooCommerceReason.ENVIRONMENT_BLOCKED.equals(ex.reasonCodeOrKind())) {
            return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED,
                    "Phase 06 chỉ cho phép kênh WooCommerce ở môi trường development/test.");
        }
        String message = ex.getMessage() == null || ex.getMessage().isBlank()
                ? fallback
                : fallback + " (" + ex.reasonCodeOrKind() + "): " + ex.getMessage();
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE, message);
    }

    private ApiException mappingVerificationFailure(ChannelAdapterException ex) {
        HttpStatus status = switch (ex.getKind()) {
            case UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
            default -> HttpStatus.UNPROCESSABLE_ENTITY;
        };
        ErrorCode code = status == HttpStatus.SERVICE_UNAVAILABLE
                ? ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE
                : status == HttpStatus.GATEWAY_TIMEOUT
                ? ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE
                : ErrorCode.MAPPING_VERIFICATION_FAILED;
        String message = "Không thể xác minh mapping (" + ex.reasonCodeOrKind() + "): " + ex.getMessage();
        return new ApiException(status, code, message);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
