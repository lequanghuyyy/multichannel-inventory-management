package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Receipt;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReceiptServiceImpl implements ReceiptService {

    private static final int MAX_RECEIPT_LINES = 200;
    private static final int MAX_QUANTITY = 1_000_000;

    private final ReceiptRepository receiptRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final ReceiptMapper receiptMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;

    public ReceiptServiceImpl(ReceiptRepository receiptRepository,
                              InventoryBalanceRepository balanceRepository,
                              ProductVariantRepository variantRepository,
                              ReceiptMapper receiptMapper,
                              IdempotencyService idempotencyService,
                              InventoryMovementRecorder movementRecorder) {
        this.receiptRepository = receiptRepository;
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.receiptMapper = receiptMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
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
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + id));
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
        if (request.items() == null || request.items().isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Phiếu nhập phải có ít nhất một sản phẩm.");
        }
        if (request.items().size() > MAX_RECEIPT_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một phiếu nhập không được vượt quá " + MAX_RECEIPT_LINES + " dòng.");
        }

        Receipt receipt = new Receipt();
        receipt.setReceiptNumber("REC-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        receipt.setSupplierName(supplierName);
        receipt.setStatus(Receipt.Status.DRAFT);

        Set<Long> seenVariantIds = new HashSet<>();
        List<ReceiptItem> items = new ArrayList<>(request.items().size());
        for (CreateReceiptRequest.ReceiptItemRequest itReq : request.items()) {
            if (itReq == null || itReq.variantId() == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng phiếu nhập không hợp lệ.");
            }
            if (!seenVariantIds.add(itReq.variantId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Mỗi biến thể chỉ được xuất hiện một lần trong phiếu nhập.");
            }
            if (!variantRepository.existsById(itReq.variantId())) {
                throw new ResourceNotFoundException(ErrorCode.VARIANT_NOT_FOUND,
                        "Không tìm thấy biến thể #" + itReq.variantId());
            }
            int expectedQty = requireQuantity(itReq.expectedQty(), "Số lượng dự kiến", 1);
            long unitCost = itReq.unitCost() == null ? 0L : itReq.unitCost();
            if (unitCost < 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Đơn giá nhập không được âm.");
            }

            ReceiptItem item = new ReceiptItem();
            item.setReceipt(receipt);
            item.setVariantId(itReq.variantId());
            item.setExpectedQty(expectedQty);
            item.setAcceptedQty(0);
            item.setRejectedQty(0);
            item.setUnitCost(unitCost);
            items.add(item);
        }

        receipt.setItems(items);
        Receipt saved = receiptRepository.save(receipt);
        return receiptMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public ReceiptResponse receiveStock(Long receiptId, ReceiveItemsRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/receipts/" + receiptId + "/receive",
                Map.of("receiptId", receiptId, "request", request), ReceiptResponse.class,
                () -> receiveStockInternal(receiptId, request));
    }

    private ReceiptResponse receiveStockInternal(Long receiptId, ReceiveItemsRequest request) {
        if (request == null || request.inspections() == null || request.inspections().isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Danh sách kiểm đếm không được để trống.");
        }
        if (request.inspections().size() > MAX_RECEIPT_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một lần nhận không được vượt quá " + MAX_RECEIPT_LINES + " dòng.");
        }

        // Read the candidate lines without a lock only to discover which balance rows must be
        // locked, and to fail obvious invalid requests before taking any lock.
        Receipt snapshot = receiptRepository.findById(receiptId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + receiptId));
        requireOpenReceipt(snapshot);
        Map<Long, ReceiptItem> snapshotItems = itemsById(snapshot);
        Set<Long> inspectedIds = validateInspections(request, snapshotItems);

        List<Long> variantIds = inspectedIds.stream()
                .map(id -> snapshotItems.get(id).getVariantId())
                .distinct()
                .sorted()
                .toList();
        for (Long variantId : variantIds) {
            balanceRepository.ensureBalanceExists(variantId);
            balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new IllegalStateException("Inventory balance initialization failed"));
        }

        // Canonical lock order is balance(s) first, then the receipt row. Reading the receipt
        // again under its lock gives the authoritative previously accepted/rejected quantities.
        Receipt receipt = receiptRepository.findByIdForUpdate(receiptId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + receiptId));
        requireOpenReceipt(receipt);
        Map<Long, ReceiptItem> itemMap = itemsById(receipt);

        Map<Long, Integer> deltaByVariant = new TreeMap<>();
        for (ReceiveItemsRequest.ItemInspection inspection : request.inspections()) {
            ReceiptItem item = itemMap.get(inspection.itemId());
            if (item == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng kiểm đếm không thuộc phiếu nhập này.");
            }
            InspectionValues values = validateInspection(item, inspection);
            int acceptedDelta = values.accepted() - item.getAcceptedQty();
            if (acceptedDelta > 0) {
                try {
                    deltaByVariant.merge(item.getVariantId(), acceptedDelta, Math::addExact);
                } catch (ArithmeticException ex) {
                    throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                            "Tổng số lượng nhận cho biến thể #" + item.getVariantId() + " vượt giới hạn hỗ trợ.");
                }
            }
            item.setAcceptedQty(values.accepted());
            item.setRejectedQty(values.rejected());
        }

        for (Map.Entry<Long, Integer> entry : deltaByVariant.entrySet()) {
            int delta = entry.getValue();
            if (delta <= 0) {
                continue;
            }
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(entry.getKey())
                    .orElseThrow(() -> new IllegalStateException("Inventory balance disappeared during receipt"));
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            try {
                balance.setOnHand(Math.addExact(balance.getOnHand(), delta));
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng tồn vượt giới hạn hỗ trợ.");
            }
            balanceRepository.save(balance);
            movementRecorder.record(entry.getKey(), before, balance, "RECEIPT_ACCEPTED",
                    "Nhập kho từ " + receipt.getReceiptNumber(), receipt.getReceiptNumber());
        }

        boolean complete = receipt.getItems().stream()
                .allMatch(item -> item.getAcceptedQty() + item.getRejectedQty() == item.getExpectedQty());
        receipt.setStatus(complete ? Receipt.Status.COMPLETED : Receipt.Status.RECEIVING);
        Receipt saved = receiptRepository.save(receipt);
        return receiptMapper.toResponse(saved);
    }

    private void requireOpenReceipt(Receipt receipt) {
        if (receipt.getStatus() != Receipt.Status.DRAFT && receipt.getStatus() != Receipt.Status.RECEIVING) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Phiếu nhập không ở trạng thái cho phép nhận hàng.");
        }
    }

    private Map<Long, ReceiptItem> itemsById(Receipt receipt) {
        return receipt.getItems().stream()
                .collect(Collectors.toMap(ReceiptItem::getId, item -> item));
    }

    /**
     * Validates membership and duplicate line ids without mutating anything. The returned ids
     * tell the caller which balances must be locked before the receipt row.
     */
    private Set<Long> validateInspections(ReceiveItemsRequest request, Map<Long, ReceiptItem> itemMap) {
        Set<Long> inspectedIds = new HashSet<>();
        for (ReceiveItemsRequest.ItemInspection inspection : request.inspections()) {
            if (inspection == null || inspection.itemId() == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng kiểm đếm không hợp lệ.");
            }
            ReceiptItem item = itemMap.get(inspection.itemId());
            if (item == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng kiểm đếm không thuộc phiếu nhập này.");
            }
            if (!inspectedIds.add(inspection.itemId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Không thể kiểm đếm cùng một dòng nhiều lần trong một yêu cầu.");
            }
            validateInspection(item, inspection);
        }
        return inspectedIds;
    }

    private InspectionValues validateInspection(ReceiptItem item, ReceiveItemsRequest.ItemInspection inspection) {
        Integer acceptedValue = inspection.acceptedQty();
        if (acceptedValue == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng đạt chuẩn không được để trống.");
        }
        int accepted = acceptedValue;
        int rejected = inspection.rejectedQty() == null ? 0 : inspection.rejectedQty();
        if (accepted < 0 || rejected < 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng nhận/từ chối không được âm.");
        }
        if (accepted > MAX_QUANTITY || rejected > MAX_QUANTITY
                || (long) accepted + rejected > item.getExpectedQty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Số lượng nhận/từ chối vượt số lượng dự kiến.");
        }
        if (accepted < item.getAcceptedQty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Không thể giảm số lượng đã nhận của một dòng phiếu nhập.");
        }
        if (rejected < item.getRejectedQty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Không thể giảm số lượng đã từ chối của một dòng phiếu nhập.");
        }
        return new InspectionValues(accepted, rejected);
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

    private int requireQuantity(Integer value, String field, int minimum) {
        if (value == null || value < minimum || value > MAX_QUANTITY) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " phải từ " + minimum + " đến " + MAX_QUANTITY + ".");
        }
        return value;
    }

    private record InspectionValues(int accepted, int rejected) {}
}
