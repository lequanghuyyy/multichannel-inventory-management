package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CancelReceiptRequest;
import com.octoflow.api.dto.request.CloseShortRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.UpdateReceiptRequest;
import com.octoflow.api.dto.response.ReceiptPreviewResponse;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.Receipt;
import com.octoflow.api.entity.ReceiptEvent;
import com.octoflow.api.entity.ReceiptEventItem;
import com.octoflow.api.entity.ReceiptItem;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ReceiptMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReceiptRepository;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.ReceiptService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ReceiptServiceImpl implements ReceiptService {

    private static final int MAX_RECEIPT_LINES = 200;
    private static final int MAX_QUANTITY = 1_000_000;
    private static final int MAX_REASON_LENGTH = 500;

    private final ReceiptRepository receiptRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final ReceiptMapper receiptMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;
    private final ObjectMapper objectMapper;

    public ReceiptServiceImpl(ReceiptRepository receiptRepository,
                              InventoryBalanceRepository balanceRepository,
                              ProductVariantRepository variantRepository,
                              ReceiptMapper receiptMapper,
                              IdempotencyService idempotencyService,
                              InventoryMovementRecorder movementRecorder,
                              ObjectMapper objectMapper) {
        this.receiptRepository = receiptRepository;
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.receiptMapper = receiptMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceiptResponse> listReceipts() {
        return receiptMapper.toResponses(receiptRepository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public ReceiptResponse getReceiptById(Long id) {
        Receipt receipt = receiptRepository.findById(id)
                .orElseThrow(() -> receiptNotFound(id));
        return receiptMapper.toResponse(receipt);
    }

    @Override
    @Transactional
    public ReceiptResponse createReceipt(CreateReceiptRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/receipts", request,
                ReceiptResponse.class, () -> createReceiptInternal(request));
    }

    private ReceiptResponse createReceiptInternal(CreateReceiptRequest request) {
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu tạo phiếu nhập không hợp lệ.");
        }
        String supplierName = requireText(request.supplierName(), 255, "Tên nhà cung cấp");
        String note = optionalText(request.note(), 2000, "Ghi chú phiếu nhập");

        Receipt receipt = new Receipt();
        receipt.setReceiptNumber("REC-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        receipt.setSupplierName(supplierName);
        receipt.setNote(note);
        receipt.setStatus(Receipt.Status.DRAFT);
        receipt.setItems(buildItems(receipt, request.items()));
        appendEvent(receipt, ReceiptEvent.Type.CREATED, nextVersion(receipt), null);

        Receipt saved = receiptRepository.save(receipt);
        return receiptMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public ReceiptResponse updateReceipt(Long id, UpdateReceiptRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "PATCH:/api/v1/receipts/" + id, request,
                ReceiptResponse.class, () -> updateReceiptInternal(id, request));
    }

    private ReceiptResponse updateReceiptInternal(Long id, UpdateReceiptRequest request) {
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu cập nhật phiếu nhập không hợp lệ.");
        }
        Receipt receipt = lockReceipt(id);
        requireDraft(receipt, "chỉnh sửa");
        requireExpectedVersion(receipt, request.expectedVersion());

        long versionBefore = receipt.getVersion() == null ? 0L : receipt.getVersion();
        long versionAfter = nextVersion(receipt);
        String supplierBefore = receipt.getSupplierName();
        String noteBefore = receipt.getNote();

        record ItemSnapshot(Long variantId, String sku, String variantTitle, int expectedQty, long unitCost) {}

        List<ItemSnapshot> itemsBefore = receipt.getItems().stream()
                .map(item -> new ItemSnapshot(item.getVariantId(), item.getSku(), item.getVariantTitle(),
                        item.getExpectedQty(), item.getUnitCost()))
                .toList();

        String supplierName = requireText(request.supplierName(), 255, "Tên nhà cung cấp");
        String note = optionalText(request.note(), 2000, "Ghi chú phiếu nhập");
        List<ReceiptItem> desiredItems = buildItems(receipt, request.items());

        List<ItemSnapshot> itemsAfter = desiredItems.stream()
                .map(item -> new ItemSnapshot(item.getVariantId(), item.getSku(), item.getVariantTitle(),
                        item.getExpectedQty(), item.getUnitCost()))
                .toList();

        Map<Long, ItemSnapshot> beforeMap = itemsBefore.stream()
                .collect(Collectors.toMap(ItemSnapshot::variantId, Function.identity()));
        Map<Long, ItemSnapshot> afterMap = itemsAfter.stream()
                .collect(Collectors.toMap(ItemSnapshot::variantId, Function.identity()));

        List<ItemSnapshot> addedItems = itemsAfter.stream()
                .filter(item -> !beforeMap.containsKey(item.variantId()))
                .toList();

        List<ItemSnapshot> removedItems = itemsBefore.stream()
                .filter(item -> !afterMap.containsKey(item.variantId()))
                .toList();

        record ItemDiff(Long variantId, String sku, String variantTitle,
                        int fromExpectedQty, int toExpectedQty,
                        long fromUnitCost, long toUnitCost) {}

        List<ItemDiff> updatedItems = new ArrayList<>();
        for (ItemSnapshot after : itemsAfter) {
            ItemSnapshot before = beforeMap.get(after.variantId());
            if (before != null && (before.expectedQty() != after.expectedQty() || before.unitCost() != after.unitCost())) {
                updatedItems.add(new ItemDiff(after.variantId(), after.sku(), after.variantTitle(),
                        before.expectedQty(), after.expectedQty(), before.unitCost(), after.unitCost()));
            }
        }

        receipt.setSupplierName(supplierName);
        receipt.setNote(note);
        mergeItems(receipt, desiredItems);

        Map<String, Object> diffPayload = new LinkedHashMap<>();
        diffPayload.put("actor", currentActor());
        diffPayload.put("timestamp", Instant.now().toString());
        diffPayload.put("version_before", versionBefore);
        diffPayload.put("version_after", versionAfter);
        diffPayload.put("supplier_name_before", supplierBefore);
        diffPayload.put("supplier_name_after", supplierName);
        diffPayload.put("note_before", noteBefore);
        diffPayload.put("note_after", note);
        diffPayload.put("items_before", itemsBefore);
        diffPayload.put("items_after", itemsAfter);
        diffPayload.put("added_items", addedItems);
        diffPayload.put("updated_items", updatedItems);
        diffPayload.put("removed_items", removedItems);

        String payloadJson = serializePayload(diffPayload);
        appendEvent(receipt, ReceiptEvent.Type.UPDATED, versionAfter,
                "Cập nhật phiếu nháp (v" + versionBefore + " -> v" + versionAfter + ")", payloadJson);

        Receipt saved = receiptRepository.saveAndFlush(receipt);
        return receiptMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public ReceiptResponse cancelReceipt(Long id, CancelReceiptRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/receipts/" + id + "/cancel", request,
                ReceiptResponse.class, () -> cancelReceiptInternal(id, request));
    }

    private ReceiptResponse cancelReceiptInternal(Long id, CancelReceiptRequest request) {
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu hủy phiếu nhập không hợp lệ.");
        }
        Receipt receipt = lockReceipt(id);
        requireDraft(receipt, "hủy");
        requireExpectedVersion(receipt, request.expectedVersion());

        String reason = requireText(request.reason(), MAX_REASON_LENGTH, "Lý do hủy phiếu nhập");
        receipt.setStatus(Receipt.Status.CANCELLED);
        receipt.setCancelReason(reason);
        receipt.setCancelledAt(Instant.now());
        appendEvent(receipt, ReceiptEvent.Type.CANCELLED, nextVersion(receipt), reason);

        Receipt saved = receiptRepository.saveAndFlush(receipt);
        return receiptMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public ReceiptResponse closeShort(Long id, CloseShortRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/receipts/" + id + "/close-short", request,
                ReceiptResponse.class, () -> closeShortInternal(id, request));
    }

    private ReceiptResponse closeShortInternal(Long id, CloseShortRequest request) {
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu đóng phiếu thiếu không hợp lệ.");
        }
        Receipt receipt = lockReceipt(id);
        if (receipt.getStatus() != Receipt.Status.PARTIALLY_RECEIVED) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Chỉ có thể đóng thiếu phiếu đang ở trạng thái PARTIALLY_RECEIVED; phiếu chưa nhận hàng phải được hủy.");
        }
        requireExpectedVersion(receipt, request.expectedVersion());

        int missing = receipt.getItems().stream().mapToInt(ReceiptItem::getRemainingQty).sum();
        if (missing <= 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Phiếu nhập đã xử lý đủ số lượng dự kiến và không thể đóng thiếu.");
        }

        String reason = requireText(request.reason(), MAX_REASON_LENGTH, "Lý do đóng phiếu thiếu");
        receipt.setStatus(Receipt.Status.CLOSED_SHORT);
        receipt.setCloseShortReason(reason);
        receipt.setClosedShortAt(Instant.now());

        Map<String, Object> closePayload = new LinkedHashMap<>();
        closePayload.put("actor", currentActor());
        closePayload.put("closed_short_at", receipt.getClosedShortAt().toString());
        closePayload.put("missing_quantity", missing);
        closePayload.put("reason", reason);

        String payloadJson = serializePayload(closePayload);
        appendEvent(receipt, ReceiptEvent.Type.CLOSED_SHORT, nextVersion(receipt), reason, payloadJson);

        Receipt saved = receiptRepository.saveAndFlush(receipt);
        return receiptMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public ReceiptPreviewResponse previewReceive(Long id, ReceiveItemsRequest request) {
        Receipt receipt = receiptRepository.findById(id)
                .orElseThrow(() -> receiptNotFound(id));

        List<String> responseErrors = new ArrayList<>();
        List<ReceiptPreviewResponse.LinePreview> lines = new ArrayList<>();
        if (!receipt.getStatus().isOpenForReceiving()) {
            responseErrors.add("Phiếu nhập không ở trạng thái cho phép nhận hàng.");
        }
        if (request == null || request.inspections() == null || request.inspections().isEmpty()) {
            responseErrors.add("Danh sách kiểm đếm không được để trống.");
            return previewResponse(receipt, lines, responseErrors);
        }

        Map<Long, ReceiptItem> itemMap = itemsById(receipt);
        Set<Long> seenItems = new HashSet<>();
        for (ReceiveItemsRequest.ItemInspection inspection : request.inspections()) {
            if (inspection == null || inspection.itemId() == null) {
                responseErrors.add("Dòng kiểm đếm không hợp lệ.");
                continue;
            }
            if (!seenItems.add(inspection.itemId())) {
                responseErrors.add("Không thể kiểm đếm cùng một dòng nhiều lần trong một yêu cầu.");
                continue;
            }

            ReceiptItem item = itemMap.get(inspection.itemId());
            if (item == null) {
                responseErrors.add("Dòng kiểm đếm #" + inspection.itemId() + " không thuộc phiếu nhập này.");
                lines.add(emptyPreviewLine(inspection.itemId(), "Dòng kiểm đếm không thuộc phiếu nhập này."));
                continue;
            }

            List<String> lineErrors = new ArrayList<>();
            int accepted = inspection.acceptedQty() == null ? 0 : inspection.acceptedQty();
            int rejected = inspection.rejectedQty() == null ? 0 : inspection.rejectedQty();
            String reason = optionalText(inspection.rejectionReason(), MAX_REASON_LENGTH, "Lý do từ chối");

            if (inspection.acceptedQty() == null) {
                lineErrors.add("Số lượng đạt chuẩn không được để trống.");
            }
            if (accepted < 0 || rejected < 0) {
                lineErrors.add("Số lượng nhận/từ chối không được âm.");
            } else if (accepted > MAX_QUANTITY || rejected > MAX_QUANTITY) {
                lineErrors.add("Số lượng nhận/từ chối vượt giới hạn hỗ trợ.");
            } else if ((long) accepted + rejected <= 0) {
                lineErrors.add("Mỗi dòng kiểm đếm phải có ít nhất một sản phẩm đạt hoặc lỗi.");
            } else if ((long) accepted + rejected > item.getRemainingQty()) {
                lineErrors.add("Số lượng nhận/từ chối vượt số lượng còn lại của dòng phiếu nhập.");
            }
            if (rejected > 0 && reason == null) {
                lineErrors.add("Phải ghi lý do khi có hàng bị từ chối.");
            }

            InventoryBalance balance = balanceRepository.findByVariantId(item.getVariantId()).orElse(null);
            int onHand = balance != null ? balance.getOnHand() : 0;
            int projectedOnHand;
            try {
                projectedOnHand = Math.addExact(onHand, accepted);
            } catch (ArithmeticException ex) {
                lineErrors.add("Tồn sau khi nhận vượt giới hạn hỗ trợ.");
                projectedOnHand = onHand;
            }

            int remainingAfter = item.getRemainingQty() - accepted - rejected;
            lines.add(new ReceiptPreviewResponse.LinePreview(
                    item.getId(),
                    item.getVariantId(),
                    item.getSku(),
                    item.getVariantTitle(),
                    item.getExpectedQty(),
                    item.getAcceptedQty(),
                    item.getRejectedQty(),
                    accepted,
                    rejected,
                    item.getRemainingQty(),
                    remainingAfter,
                    onHand,
                    projectedOnHand,
                    balance != null ? balance.getVersion() : 0L,
                    reason,
                    lineErrors.isEmpty(),
                    List.copyOf(lineErrors)
            ));
        }

        return previewResponse(receipt, lines, responseErrors);
    }

    private ReceiptPreviewResponse previewResponse(Receipt receipt,
                                                   List<ReceiptPreviewResponse.LinePreview> lines,
                                                   List<String> responseErrors) {
        int acceptedTotal = lines.stream().mapToInt(ReceiptPreviewResponse.LinePreview::acceptedQty).sum();
        int rejectedTotal = lines.stream().mapToInt(ReceiptPreviewResponse.LinePreview::rejectedQty).sum();
        // Receipt-wide remaining after this proposed batch: untouched lines keep their current value.
        int remainingTotal = 0;
        for (ReceiptItem item : receipt.getItems()) {
            ReceiptPreviewResponse.LinePreview preview = lines.stream()
                    .filter(line -> item.getId().equals(line.itemId()))
                    .findFirst()
                    .orElse(null);
            remainingTotal += preview == null ? item.getRemainingQty() : preview.remainingAfterQty();
        }
        boolean valid = responseErrors.isEmpty() && lines.stream().allMatch(ReceiptPreviewResponse.LinePreview::valid);
        return new ReceiptPreviewResponse(
                receipt.getId(),
                receipt.getStatus().name(),
                valid,
                lines,
                acceptedTotal,
                rejectedTotal,
                remainingTotal,
                List.copyOf(responseErrors)
        );
    }

    private ReceiptPreviewResponse.LinePreview emptyPreviewLine(Long itemId, String error) {
        return new ReceiptPreviewResponse.LinePreview(itemId, null, null, null,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0L, null, false, List.of(error));
    }

    @Override
    @Transactional
    public ReceiptResponse receiveStock(Long receiptId, ReceiveItemsRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/receipts/" + receiptId + "/receive",
                request, ReceiptResponse.class, () -> receiveStockInternal(receiptId, request));
    }

    private ReceiptResponse receiveStockInternal(Long receiptId, ReceiveItemsRequest request) {
        if (request == null || request.inspections() == null || request.inspections().isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Danh sách kiểm đếm không được để trống.");
        }
        if (request.inspections().size() > MAX_RECEIPT_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một lần nhận không được vượt quá " + MAX_RECEIPT_LINES + " dòng.");
        }

        // Canonical lock order: the receipt row first (serializes batches on one receipt), then
        // every affected balance in ascending variant id order (serializes stock across receipts).
        Receipt receipt = lockReceipt(receiptId);
        requireOpenForReceiving(receipt, "nhận hàng");
        requireExpectedVersion(receipt, request.expectedReceiptVersion());

        Map<Long, ReceiptItem> itemMap = itemsById(receipt);
        List<BatchLine> batchLines = validateBatchLines(request, itemMap);

        List<Long> variantIds = batchLines.stream()
                .map(line -> line.item().getVariantId())
                .distinct()
                .sorted()
                .toList();
        for (Long variantId : variantIds) {
            balanceRepository.ensureBalanceExists(variantId);
            balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new IllegalStateException("Inventory balance initialization failed"));
        }

        ReceiptEvent event = appendEvent(receipt, ReceiptEvent.Type.RECEIVED, nextVersion(receipt), null);
        for (BatchLine line : batchLines) {
            ReceiptItem item = line.item();
            item.setAcceptedQty(Math.addExact(item.getAcceptedQty(), line.accepted()));
            item.setRejectedQty(Math.addExact(item.getRejectedQty(), line.rejected()));
            if (line.rejectionReason() != null) {
                item.setRejectionReason(line.rejectionReason());
            }

            ReceiptEventItem eventItem = new ReceiptEventItem();
            eventItem.setEvent(event);
            eventItem.setReceiptItemId(item.getId());
            eventItem.setVariantId(item.getVariantId());
            eventItem.setSku(item.getSku());
            eventItem.setAcceptedQty(line.accepted());
            eventItem.setRejectedQty(line.rejected());
            eventItem.setRejectionReason(line.rejectionReason());
            event.getItems().add(eventItem);
        }

        boolean complete = receipt.getItems().stream().allMatch(item -> item.getRemainingQty() == 0);
        receipt.setStatus(complete ? Receipt.Status.RECEIVED : Receipt.Status.PARTIALLY_RECEIVED);

        // Flush the receipt and its immutable batch event before stock is moved. The event id is
        // then a stable reference for the ledger and outbox rows of this exact batch.
        Receipt saved = receiptRepository.saveAndFlush(receipt);

        for (BatchLine line : batchLines) {
            if (line.accepted() <= 0) {
                continue;
            }
            Long variantId = line.item().getVariantId();
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new IllegalStateException("Inventory balance disappeared during receipt"));
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            try {
                balance.setOnHand(Math.addExact(balance.getOnHand(), line.accepted()));
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng tồn vượt giới hạn hỗ trợ.");
            }
            balanceRepository.save(balance);
            movementRecorder.record(variantId, before, balance, "RECEIPT_ACCEPTED",
                    "Nhập kho từ " + saved.getReceiptNumber(), saved.getReceiptNumber() + "#" + event.getId());
        }

        return receiptMapper.toResponse(saved);
    }

    private List<BatchLine> validateBatchLines(ReceiveItemsRequest request, Map<Long, ReceiptItem> itemMap) {
        Set<Long> seenItems = new HashSet<>();
        List<BatchLine> lines = new ArrayList<>(request.inspections().size());
        for (ReceiveItemsRequest.ItemInspection inspection : request.inspections()) {
            if (inspection == null || inspection.itemId() == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng kiểm đếm không hợp lệ.");
            }
            if (!seenItems.add(inspection.itemId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Không thể kiểm đếm cùng một dòng nhiều lần trong một yêu cầu.");
            }
            ReceiptItem item = itemMap.get(inspection.itemId());
            if (item == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Dòng kiểm đếm không thuộc phiếu nhập này.");
            }
            if (inspection.acceptedQty() == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Số lượng đạt chuẩn không được để trống.");
            }

            int accepted = inspection.acceptedQty();
            int rejected = inspection.rejectedQty() == null ? 0 : inspection.rejectedQty();
            if (accepted < 0 || rejected < 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng nhận/từ chối không được âm.");
            }
            if (accepted > MAX_QUANTITY || rejected > MAX_QUANTITY) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Số lượng nhận/từ chối vượt giới hạn hỗ trợ.");
            }
            if ((long) accepted + rejected <= 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Mỗi dòng kiểm đếm phải có ít nhất một sản phẩm đạt hoặc lỗi.");
            }
            if ((long) accepted + rejected > item.getRemainingQty()) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Số lượng nhận/từ chối vượt số lượng còn lại của dòng phiếu nhập.");
            }

            String reason = optionalText(inspection.rejectionReason(), MAX_REASON_LENGTH, "Lý do từ chối");
            if (rejected > 0 && reason == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Phải ghi lý do khi có hàng bị từ chối.");
            }
            lines.add(new BatchLine(item, accepted, rejected, reason));
        }
        return lines;
    }

    private List<ReceiptItem> buildItems(Receipt receipt,
                                         List<CreateReceiptRequest.ReceiptItemRequest> itemRequests) {
        if (itemRequests == null || itemRequests.isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Phiếu nhập phải có ít nhất một sản phẩm.");
        }
        if (itemRequests.size() > MAX_RECEIPT_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một phiếu nhập không được vượt quá " + MAX_RECEIPT_LINES + " dòng.");
        }

        Set<Long> seenVariantIds = new HashSet<>();
        List<ReceiptItem> items = new ArrayList<>(itemRequests.size());
        for (CreateReceiptRequest.ReceiptItemRequest itemRequest : itemRequests) {
            if (itemRequest == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng phiếu nhập không hợp lệ.");
            }
            ProductVariant variant;
            if (itemRequest.variantId() != null) {
                variant = variantRepository.findById(itemRequest.variantId())
                        .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.VARIANT_NOT_FOUND,
                                "Không tìm thấy biến thể #" + itemRequest.variantId()));
            } else if (itemRequest.sku() != null && !itemRequest.sku().isBlank()) {
                String sku = itemRequest.sku().trim();
                variant = variantRepository.findBySku(sku)
                        .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                                "Không tìm thấy SKU " + sku));
            } else {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng phiếu nhập không hợp lệ.");
            }
            if (!seenVariantIds.add(variant.getId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Mỗi biến thể chỉ được xuất hiện một lần trong phiếu nhập.");
            }
            int expectedQty = requireQuantity(itemRequest.expectedQty(), "Số lượng dự kiến", 1);
            long unitCost = itemRequest.unitCost() == null ? 0L : itemRequest.unitCost();
            if (unitCost < 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Đơn giá nhập không được âm.");
            }

            ReceiptItem item = new ReceiptItem();
            item.setReceipt(receipt);
            item.setVariantId(variant.getId());
            item.setSku(variant.getSku());
            item.setVariantTitle(variant.getTitle());
            item.setExpectedQty(expectedQty);
            item.setAcceptedQty(0);
            item.setRejectedQty(0);
            item.setUnitCost(unitCost);
            items.add(item);
        }
        return items;
    }

    /**
     * Applies a draft replacement without deleting and re-inserting retained lines. The receipt
     * item id is stable across edits and the unique (receipt_id, variant_id) constraint can never
     * see a transient duplicate.
     */
    private void mergeItems(Receipt receipt, List<ReceiptItem> desiredItems) {
        Map<Long, ReceiptItem> existingByVariant = new HashMap<>();
        for (ReceiptItem item : receipt.getItems()) {
            existingByVariant.put(item.getVariantId(), item);
        }
        Set<Long> desiredVariants = desiredItems.stream()
                .map(ReceiptItem::getVariantId)
                .collect(Collectors.toSet());
        receipt.getItems().removeIf(item -> !desiredVariants.contains(item.getVariantId()));

        for (ReceiptItem desired : desiredItems) {
            ReceiptItem current = existingByVariant.get(desired.getVariantId());
            if (current == null) {
                receipt.getItems().add(desired);
            } else {
                current.setSku(desired.getSku());
                current.setVariantTitle(desired.getVariantTitle());
                current.setExpectedQty(desired.getExpectedQty());
                current.setUnitCost(desired.getUnitCost());
            }
        }
    }

    private Receipt lockReceipt(Long id) {
        return receiptRepository.findByIdForUpdate(id)
                .orElseThrow(() -> receiptNotFound(id));
    }

    private ResourceNotFoundException receiptNotFound(Long id) {
        return new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + id);
    }

    private void requireDraft(Receipt receipt, String action) {
        if (receipt.getStatus() != Receipt.Status.DRAFT) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Chỉ có thể " + action + " phiếu nhập ở trạng thái DRAFT.");
        }
    }

    private void requireOpenForReceiving(Receipt receipt, String action) {
        if (!receipt.getStatus().isOpenForReceiving()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Phiếu nhập không ở trạng thái cho phép " + action + ".");
        }
    }

    private void requireExpectedVersion(Receipt receipt, Long expectedVersion) {
        if (expectedVersion != null && !expectedVersion.equals(receipt.getVersion())) {
            throw new BusinessRuleException(ErrorCode.STALE_VERSION,
                    "Phiếu nhập đã thay đổi từ lần xem trước. Hãy tải lại rồi thử lại.");
        }
    }

    private long nextVersion(Receipt receipt) {
        if (receipt.getId() == null) {
            return 0L;
        }
        return receipt.getVersion() == null ? 0L : receipt.getVersion() + 1L;
    }

    private ReceiptEvent appendEvent(Receipt receipt, ReceiptEvent.Type type, long receiptVersion, String note) {
        return appendEvent(receipt, type, receiptVersion, note, null);
    }

    private ReceiptEvent appendEvent(Receipt receipt, ReceiptEvent.Type type, long receiptVersion, String note, String payload) {
        receipt.setVersion(receiptVersion);
        ReceiptEvent event = new ReceiptEvent();
        event.setReceipt(receipt);
        event.setEventType(type.name());
        event.setReceiptVersion(receiptVersion);
        event.setActor(currentActor());
        event.setNote(note);
        event.setPayload(payload);
        receipt.getEvents().add(event);
        return event;
    }

    private String serializePayload(Object payload) {
        if (payload == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new BusinessRuleException(ErrorCode.INTERNAL_ERROR, "Không thể mã hóa dữ liệu audit.");
        }
    }

    private Map<Long, ReceiptItem> itemsById(Receipt receipt) {
        Map<Long, ReceiptItem> result = new HashMap<>();
        for (ReceiptItem item : receipt.getItems()) {
            result.put(item.getId(), item);
        }
        return result;
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

    private String requireText(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, field + " không được để trống.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " không được vượt quá " + maxLength + " ký tự.");
        }
        return normalized;
    }

    private String optionalText(String value, int maxLength, String field) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " không được vượt quá " + maxLength + " ký tự.");
        }
        return normalized.isEmpty() ? null : normalized;
    }

    private int requireQuantity(Integer value, String field, int minimum) {
        if (value == null || value < minimum || value > MAX_QUANTITY) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " phải từ " + minimum + " đến " + MAX_QUANTITY + ".");
        }
        return value;
    }

    private record BatchLine(ReceiptItem item, int accepted, int rejected, String rejectionReason) {}
}
