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
import com.octoflow.api.repository.ReceiptRepository;
import com.octoflow.api.service.ReceiptService;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ReceiptServiceImpl implements ReceiptService {

    private final ReceiptRepository receiptRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ReceiptMapper receiptMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;

    public ReceiptServiceImpl(ReceiptRepository receiptRepository,
                              InventoryBalanceRepository balanceRepository,
                              ReceiptMapper receiptMapper,
                              IdempotencyService idempotencyService,
                              InventoryMovementRecorder movementRecorder) {
        this.receiptRepository = receiptRepository;
        this.balanceRepository = balanceRepository;
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
        Receipt receipt = new Receipt();
        receipt.setReceiptNumber("REC-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        receipt.setSupplierName(request.supplierName());
        receipt.setStatus(Receipt.Status.DRAFT);

        List<ReceiptItem> items = new ArrayList<>();
        for (CreateReceiptRequest.ReceiptItemRequest itReq : request.items()) {
            ReceiptItem item = new ReceiptItem();
            item.setReceipt(receipt);
            item.setVariantId(itReq.variantId());
            item.setExpectedQty(itReq.expectedQty());
            item.setAcceptedQty(0);
            item.setRejectedQty(0);
            item.setUnitCost(itReq.unitCost() != null ? itReq.unitCost() : 0L);
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
        Receipt receipt = receiptRepository.findByIdForUpdate(receiptId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + receiptId));

        if (receipt.getStatus() != Receipt.Status.DRAFT && receipt.getStatus() != Receipt.Status.RECEIVING) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Phiếu nhập không ở trạng thái cho phép nhận hàng.");
        }

        Map<Long, ReceiptItem> itemMap = receipt.getItems().stream()
                .collect(Collectors.toMap(ReceiptItem::getId, it -> it));
        Set<Long> inspectedItemIds = new HashSet<>();

        List<ReceiveItemsRequest.ItemInspection> inspections = request.inspections().stream()
                .sorted(Comparator
                        .comparing((ReceiveItemsRequest.ItemInspection insp) -> {
                            ReceiptItem item = itemMap.get(insp.itemId());
                            return item == null ? Long.MAX_VALUE : item.getVariantId();
                        })
                        .thenComparing(insp -> insp.itemId() == null ? Long.MAX_VALUE : insp.itemId()))
                .toList();
        for (ReceiveItemsRequest.ItemInspection insp : inspections) {
            ReceiptItem item = itemMap.get(insp.itemId());
            if (item == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng kiểm đếm không thuộc phiếu nhập này.");
            }
            if (!inspectedItemIds.add(insp.itemId())) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Không thể kiểm đếm cùng một dòng nhiều lần trong một yêu cầu.");
            }
            int accepted = insp.acceptedQty();
            int rejected = insp.rejectedQty() != null ? insp.rejectedQty() : 0;
            if (accepted < 0 || rejected < 0 || (long) accepted + rejected > item.getExpectedQty()) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng nhận/từ chối vượt số lượng dự kiến.");
            }
            item.setAcceptedQty(accepted);
            item.setRejectedQty(rejected);

            if (accepted > 0) {
                balanceRepository.ensureBalanceExists(item.getVariantId());
                InventoryBalance balance = balanceRepository.findByVariantIdWithLock(item.getVariantId())
                        .orElseThrow(() -> new IllegalStateException("Inventory balance initialization failed"));
                InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
                try {
                    balance.setOnHand(Math.addExact(balance.getOnHand(), accepted));
                } catch (ArithmeticException ex) {
                    throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Số lượng tồn vượt giới hạn hỗ trợ.");
                }
                balanceRepository.save(balance);
                movementRecorder.record(item.getVariantId(), before, balance, "RECEIPT_ACCEPTED",
                        "Nhập kho từ " + receipt.getReceiptNumber(), receipt.getReceiptNumber());
            }
        }

        receipt.setStatus(Receipt.Status.COMPLETED);
        Receipt saved = receiptRepository.save(receipt);
        return receiptMapper.toResponse(saved);
    }
}
