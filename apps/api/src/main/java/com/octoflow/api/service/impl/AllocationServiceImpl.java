package com.octoflow.api.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.dto.request.AllocationPreviewRequest;
import com.octoflow.api.dto.response.AllocationPlanResponse;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.VariantAllocationState;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.AllocationPlanRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.VariantAllocationStateRepository;
import com.octoflow.api.service.AllocationService;
import com.octoflow.api.service.ChannelDeliveryEligibility;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.SyncEventBroadcaster;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AllocationServiceImpl implements AllocationService {

    private static final int MAX_QUANTITY = 1_000_000;

    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final VariantAllocationStateRepository stateRepository;
    private final AllocationPlanRepository planRepository;
    private final AllocationPlanItemRepository itemRepository;
    private final ChannelListingRepository listingRepository;
    private final ChannelRepository channelRepository;
    private final OutboxEventRepository outboxRepository;
    private final ChannelDeliveryEligibility eligibility;
    private final IdempotencyService idempotencyService;
    private final SyncEventBroadcaster broadcaster;
    private final ObjectMapper objectMapper;

    public AllocationServiceImpl(ProductVariantRepository variantRepository,
                                 InventoryBalanceRepository balanceRepository,
                                 VariantAllocationStateRepository stateRepository,
                                 AllocationPlanRepository planRepository,
                                 AllocationPlanItemRepository itemRepository,
                                 ChannelListingRepository listingRepository,
                                 ChannelRepository channelRepository,
                                 OutboxEventRepository outboxRepository,
                                 ChannelDeliveryEligibility eligibility,
                                 IdempotencyService idempotencyService,
                                 SyncEventBroadcaster broadcaster,
                                 ObjectMapper objectMapper) {
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.stateRepository = stateRepository;
        this.planRepository = planRepository;
        this.itemRepository = itemRepository;
        this.listingRepository = listingRepository;
        this.channelRepository = channelRepository;
        this.outboxRepository = outboxRepository;
        this.eligibility = eligibility;
        this.idempotencyService = idempotencyService;
        this.broadcaster = broadcaster;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public AllocationPlanResponse preview(AllocationPreviewRequest request) {
        if (request == null || request.sku() == null || request.sku().isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "SKU là bắt buộc để tạo phân bổ.");
        }
        ProductVariant variant = variantRepository.findBySku(request.sku().trim())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                        "Không tìm thấy SKU " + request.sku()));

        InventoryBalance balance = balanceRepository.findByVariantId(variant.getId()).orElse(null);
        int availableToSell = balance != null ? balance.getAvailableToSell() : 0;
        long coreVersion = balance != null && balance.getVersion() != null ? balance.getVersion() : 0L;

        List<ChannelListing> allListings = listingRepository.findByVariantId(variant.getId());
        Map<Long, ChannelListing> listingsById = new HashMap<>();
        for (ChannelListing listing : allListings) {
            listingsById.put(listing.getId(), listing);
        }

        List<AllocationPreviewRequest.AllocationTargetRequest> requestedItems =
                request.items() == null ? List.of() : request.items();
        Map<Long, Integer> proposedByListing = new LinkedHashMap<>();
        for (AllocationPreviewRequest.AllocationTargetRequest target : requestedItems) {
            if (target == null || target.listingId() == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Mỗi dòng phân bổ phải có listing_id.");
            }
            if (target.quantity() == null || target.quantity() < 0 || target.quantity() > MAX_QUANTITY) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Số lượng phân bổ phải nằm trong khoảng 0.." + MAX_QUANTITY + ".");
            }
            if (proposedByListing.containsKey(target.listingId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Listing #" + target.listingId() + " xuất hiện nhiều lần trong một preview.");
            }
            if (!listingsById.containsKey(target.listingId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Listing #" + target.listingId() + " không thuộc SKU " + variant.getSku() + ".");
            }
            proposedByListing.put(target.listingId(), target.quantity());
        }

        List<String> planIssues = new ArrayList<>();
        for (ChannelListing listing : allListings) {
            if (listing.getAllocatedQuota() > 0 && !proposedByListing.containsKey(listing.getId())) {
                planIssues.add("Listing #" + listing.getId() + " đang giữ quota "
                        + listing.getAllocatedQuota() + " và phải có mặt tường minh (gửi 0 để gỡ).");
            }
        }

        int totalTarget;
        try {
            totalTarget = proposedByListing.values().stream().mapToInt(Integer::intValue).reduce(0, Math::addExact);
        } catch (ArithmeticException ex) {
            throw new BusinessRuleException(ErrorCode.QUOTA_EXCEEDS_ATS, "Tổng quota vượt giới hạn số nguyên.");
        }
        if (totalTarget > availableToSell) {
            throw new BusinessRuleException(ErrorCode.QUOTA_EXCEEDS_ATS,
                    "Tổng quota " + totalTarget + " vượt tồn khả dụng " + availableToSell
                            + ". Không trừ lặp tồn đệm.");
        }

        stateRepository.ensureExists(variant.getId());
        VariantAllocationState state = stateRepository.findByVariantIdWithLock(variant.getId())
                .orElseThrow(() -> new IllegalStateException("Allocation state initialization failed"));
        long baseRevision = state.getCurrentRevision();
        long allocationRevision = state.getNextRevision();
        state.setNextRevision(Math.addExact(allocationRevision, 1));
        stateRepository.save(state);

        AllocationPlan plan = new AllocationPlan();
        plan.setVariantId(variant.getId());
        plan.setStatus(AllocationPlan.Status.PROJECTED);
        plan.setCoreVersion(coreVersion);
        plan.setBaseAllocationRevision(baseRevision);
        plan.setAllocationRevision(allocationRevision);
        plan.setOnHand(balance != null ? balance.getOnHand() : 0);
        plan.setReserved(balance != null ? balance.getReserved() : 0);
        plan.setSafetyBuffer(balance != null ? balance.getSafetyBuffer() : 0);
        plan.setAvailableToSell(availableToSell);
        plan.setTotalTarget(totalTarget);
        plan.setPolicy("MANUAL");
        plan.setIssues(writeJson(planIssues));
        plan.setCreatedBy(currentActor());

        boolean anyItemIssue = false;
        List<AllocationPlanItem> items = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : proposedByListing.entrySet()) {
            ChannelListing listing = listingsById.get(entry.getKey());
            int proposed = entry.getValue();
            int current = listing.getAllocatedQuota();
            AllocationPlanItem.Direction direction = proposed > current
                    ? AllocationPlanItem.Direction.INCREASE
                    : proposed < current ? AllocationPlanItem.Direction.DECREASE
                    : AllocationPlanItem.Direction.NONE;

            List<String> itemIssues = new ArrayList<>();
            if (direction != AllocationPlanItem.Direction.NONE) {
                itemIssues.addAll(validateListingForDelivery(listing));
            }
            if (!itemIssues.isEmpty()) {
                anyItemIssue = true;
            }

            AllocationPlanItem item = new AllocationPlanItem();
            item.setPlanId(null);
            item.setListingId(listing.getId());
            item.setChannelId(listing.getChannel().getId());
            item.setVariantId(variant.getId());
            item.setExternalSku(listing.getExternalSku());
            item.setCurrentQuota(current);
            item.setProposedQuota(proposed);
            item.setDirection(direction);
            item.setStatus(AllocationPlanItem.Status.PENDING);
            item.setIssues(writeJson(itemIssues));
            items.add(item);
        }

        plan.setCanExecute(planIssues.isEmpty() && !anyItemIssue);
        AllocationPlan savedPlan = planRepository.save(plan);
        for (AllocationPlanItem item : items) {
            item.setPlanId(savedPlan.getId());
        }
        itemRepository.saveAll(items);
        planRepository.supersedeProjectedPlans(variant.getId(), savedPlan.getId(),
                "Đã có preview mới hơn cho cùng SKU.");
        return toResponse(savedPlan);
    }

    @Override
    @Transactional
    public AllocationPlanResponse confirm(Long planId, String idempotencyKey) {
        return idempotencyService.execute(
                idempotencyKey,
                "POST:/api/v1/inventory/allocations/" + planId + "/execute",
                Map.of("plan_id", planId),
                AllocationPlanResponse.class,
                () -> applyConfirm(planId));
    }

    private AllocationPlanResponse applyConfirm(Long planId) {
        AllocationPlan plan = planRepository.findByIdForUpdate(planId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ALLOCATION_PLAN_NOT_FOUND,
                        "Không tìm thấy kế hoạch phân bổ #" + planId));

        if (plan.getStatus() == AllocationPlan.Status.APPLYING || plan.getStatus() == AllocationPlan.Status.COMPLETED) {
            return toResponse(plan);
        }
        if (plan.getStatus() != AllocationPlan.Status.PROJECTED) {
            throw new BusinessRuleException(ErrorCode.ALLOCATION_PLAN_BLOCKED,
                    "Kế hoạch phân bổ không còn ở trạng thái có thể xác nhận (hiện tại: " + plan.getStatus() + ").");
        }
        if (!plan.isCanExecute()) {
            throw new BusinessRuleException(ErrorCode.ALLOCATION_PLAN_BLOCKED,
                    "Preview có lỗi cần xử lý trước khi xác nhận: " + String.join(" ", readJson(plan.getIssues())));
        }

        balanceRepository.ensureBalanceExists(plan.getVariantId());
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(plan.getVariantId())
                .orElseThrow(() -> new IllegalStateException("Inventory balance initialization failed"));

        if (planRepository.existsByVariantIdAndStatus(plan.getVariantId(), AllocationPlan.Status.APPLYING)) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ALLOCATION_PLAN_BLOCKED,
                    "SKU này đang có một kế hoạch phân bổ đang thực thi. Hãy đợi kế hoạch đó kết thúc.");
        }

        if (plan.getCoreVersion() == null || !plan.getCoreVersion().equals(balance.getVersion())) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ALLOCATION_PLAN_STALE,
                    "Tồn kho đã thay đổi kể từ lúc preview. Hãy tạo preview mới.");
        }
        int currentAvailableToSell = balance.getAvailableToSell();
        if (plan.getTotalTarget() > currentAvailableToSell) {
            throw new BusinessRuleException(ErrorCode.QUOTA_EXCEEDS_ATS,
                    "Tổng quota " + plan.getTotalTarget() + " vượt tồn khả dụng hiện tại "
                            + currentAvailableToSell + ".");
        }

        stateRepository.ensureExists(plan.getVariantId());
        VariantAllocationState state = stateRepository.findByVariantIdWithLock(plan.getVariantId())
                .orElseThrow(() -> new IllegalStateException("Allocation state initialization failed"));
        if (state.getCurrentRevision() != plan.getBaseAllocationRevision()) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ALLOCATION_PLAN_STALE,
                    "Phân bổ đã được xác nhận bởi kế hoạch khác. Hãy tạo preview mới.");
        }

        List<AllocationPlanItem> items = itemRepository.findByPlanIdOrderByChannelIdAscIdAsc(planId);
        items.sort(Comparator.comparing(AllocationPlanItem::getListingId));
        for (AllocationPlanItem item : items) {
            ChannelListing listing = listingRepository.findByIdForUpdate(item.getListingId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.ALLOCATION_PLAN_BLOCKED,
                            "Listing #" + item.getListingId() + " không còn tồn tại."));
            if (!listing.getVariant().getId().equals(plan.getVariantId())) {
                throw new BusinessRuleException(ErrorCode.ALLOCATION_PLAN_BLOCKED,
                        "Listing #" + listing.getId() + " không còn thuộc SKU của kế hoạch.");
            }
            if (item.getDirection() != AllocationPlanItem.Direction.NONE) {
                List<String> issues = validateListingForDelivery(listing);
                if (!issues.isEmpty()) {
                    throw new BusinessRuleException(ErrorCode.ALLOCATION_PLAN_BLOCKED,
                            "Listing #" + listing.getId() + " không thể giao: " + String.join(" ", issues));
                }
            }
            listing.setTargetAllocationRevision(plan.getAllocationRevision());
            listingRepository.save(listing);
            if (item.getDirection() == AllocationPlanItem.Direction.NONE) {
                item.setStatus(AllocationPlanItem.Status.VERIFIED);
                item.setVerifiedAt(Instant.now());
                itemRepository.save(item);
            }
        }

        Instant now = Instant.now();
        boolean requiresDelivery = items.stream()
                .anyMatch(item -> item.getDirection() != AllocationPlanItem.Direction.NONE);
        plan.setStatus(requiresDelivery ? AllocationPlan.Status.APPLYING : AllocationPlan.Status.COMPLETED);
        if (plan.getStatus() == AllocationPlan.Status.COMPLETED) {
            plan.setCompletedAt(now);
        }
        plan.setConfirmedAt(now);
        plan.setConfirmedBy(currentActor());
        plan.setLastError(null);
        planRepository.save(plan);

        state.setCurrentRevision(plan.getAllocationRevision());
        stateRepository.save(state);
        planRepository.supersedeProjectedPlans(plan.getVariantId(), plan.getId(),
                "Đã có kế hoạch khác được xác nhận.");

        recordAllocationOutbox(plan, items);
        broadcaster.broadcastAfterCommit("ALLOCATION_CONFIRMED", Map.of(
                "plan_id", plan.getId(),
                "variant_id", plan.getVariantId(),
                "status", plan.getStatus().name(),
                "refresh_required", true));
        return toResponse(plan);
    }

    @Override
    @Transactional(readOnly = true)
    public AllocationPlanResponse get(Long planId) {
        AllocationPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ALLOCATION_PLAN_NOT_FOUND,
                        "Không tìm thấy kế hoạch phân bổ #" + planId));
        return toResponse(plan);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AllocationPlanResponse> listBySku(String sku) {
        if (sku == null || sku.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Cần truyền sku để liệt kê phân bổ.");
        }
        ProductVariant variant = variantRepository.findBySku(sku.trim())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                        "Không tìm thấy SKU " + sku));
        return planRepository.findByVariantIdOrderByCreatedAtDescIdDesc(variant.getId())
                .stream()
                .limit(20)
                .map(this::toResponse)
                .toList();
    }

    private List<String> validateListingForDelivery(ChannelListing listing) {
        return eligibility.issues(listing);
    }

    private int currentAllocatedTotal(Long variantId) {
        return listingRepository.findByVariantId(variantId).stream()
                .mapToInt(ChannelListing::getAllocatedQuota)
                .sum();
    }

    private void recordAllocationOutbox(AllocationPlan plan, List<AllocationPlanItem> items) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("plan_id", plan.getId());
        payload.put("variant_id", plan.getVariantId());
        payload.put("allocation_revision", plan.getAllocationRevision());
        payload.put("total_target", plan.getTotalTarget());
        payload.put("items", items.stream().map(item -> Map.of(
                "listing_id", item.getListingId(),
                "current_quota", item.getCurrentQuota(),
                "proposed_quota", item.getProposedQuota(),
                "direction", item.getDirection().name())).toList());

        OutboxEvent event = new OutboxEvent();
        event.setEventId(UUID.randomUUID());
        event.setAggregateType("ALLOCATION");
        event.setAggregateId(plan.getId().toString());
        event.setAggregateVersion(plan.getCoreVersion());
        event.setEventType("ALLOCATION_CONFIRMED");
        event.setPayload(writeJson(payload));
        event.setStatus(OutboxEvent.Status.PENDING);
        event.setRetryCount(0);
        event.setNextAttemptAt(Instant.now());
        outboxRepository.save(event);
    }

    private AllocationPlanResponse toResponse(AllocationPlan plan) {
        ProductVariant variant = variantRepository.findById(plan.getVariantId()).orElse(null);
        List<AllocationPlanItem> items = itemRepository.findByPlanIdOrderByChannelIdAscIdAsc(plan.getId());
        Map<Long, ChannelListing> listings = new HashMap<>();
        Map<Long, String> channelCodes = new HashMap<>();
        for (AllocationPlanItem item : items) {
            ChannelListing listing = listings.computeIfAbsent(item.getListingId(),
                    id -> listingRepository.findById(id).orElse(null));
            if (listing != null && listing.getChannel() != null) {
                channelCodes.putIfAbsent(listing.getChannel().getId(),
                        listing.getChannel().getCode());
            }
        }

        List<AllocationPlanResponse.Item> itemResponses = items.stream().map(item -> {
            ChannelListing listing = listings.get(item.getListingId());
            List<String> itemIssues = readJson(item.getIssues());
            boolean canDeliver = listing != null && validateListingForDelivery(listing).isEmpty();
            return new AllocationPlanResponse.Item(
                    item.getId(),
                    item.getListingId(),
                    item.getChannelId(),
                    channelCodes.get(item.getChannelId()),
                    item.getExternalSku(),
                    item.getCurrentQuota(),
                    item.getProposedQuota(),
                    item.getDirection().name(),
                    item.getStatus().name(),
                    listing != null && listing.getMappingStatus() != null
                            ? listing.getMappingStatus().name() : "UNVERIFIED",
                    canDeliver,
                    itemIssues,
                    item.getAttempts(),
                    item.getNextAttemptAt(),
                    item.getSentQuantity(),
                    item.getAcknowledgedQuantity(),
                    item.getVerifiedQuantity(),
                    item.getRemoteBefore(),
                    item.getRemoteAfter(),
                    item.getVerifiedAt(),
                    item.getLastError());
        }).toList();

        InventoryBalance currentBalance = balanceRepository.findByVariantId(plan.getVariantId()).orElse(null);
        int currentAts = currentBalance != null ? currentBalance.getAvailableToSell() : 0;
        int allocatedTotal = currentAllocatedTotal(plan.getVariantId());
        List<String> warnings = new ArrayList<>();
        if (allocatedTotal > currentAts) {
            warnings.add("Tổng quota hiện tại lớn hơn tồn khả dụng; hãy giảm quota trước khi bán tiếp.");
        }
        if (plan.getTotalTarget() == currentAts && currentAts > 0) {
            warnings.add("Kế hoạch dùng toàn bộ tồn khả dụng, không còn phần dự phòng cho kênh khác.");
        }
        if (items.stream().anyMatch(item -> item.getDirection() == AllocationPlanItem.Direction.DECREASE)) {
            warnings.add("Các kênh giảm quota phải được xác minh xong trước khi tăng kênh khác.");
        }

        return new AllocationPlanResponse(
                plan.getId(),
                plan.getVariantId(),
                variant != null ? variant.getSku() : null,
                plan.getStatus().name(),
                plan.getCoreVersion() == null ? 0L : plan.getCoreVersion(),
                plan.getBaseAllocationRevision(),
                plan.getAllocationRevision(),
                plan.getOnHand(),
                plan.getReserved(),
                plan.getSafetyBuffer(),
                plan.getAvailableToSell(),
                plan.getTotalTarget(),
                plan.getPolicy(),
                plan.isCanExecute(),
                readJson(plan.getIssues()),
                currentAts,
                allocatedTotal,
                warnings,
                plan.getCreatedAt(),
                plan.getConfirmedAt(),
                plan.getCompletedAt(),
                plan.getLastError(),
                itemResponses);
    }

    private String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return "system";
        }
        String name = authentication.getName();
        return name.length() <= 64 ? name : name.substring(0, 64);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize allocation payload", ex);
        }
    }

    private List<String> readJson(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException ex) {
            return List.of(value);
        }
    }
}
