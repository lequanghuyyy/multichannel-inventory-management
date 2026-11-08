package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.InventoryLedger;
import com.octoflow.api.entity.Receipt;
import com.octoflow.api.entity.ReceiptItem;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.ReceiptRepository;
import com.octoflow.api.service.ReceiptService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReceiptServiceImpl implements ReceiptService {

    private final ReceiptRepository receiptRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryLedgerRepository ledgerRepository;

    public ReceiptServiceImpl(ReceiptRepository receiptRepository,
                              InventoryBalanceRepository balanceRepository,
                              InventoryLedgerRepository ledgerRepository) {
        this.receiptRepository = receiptRepository;
        this.balanceRepository = balanceRepository;
        this.ledgerRepository = ledgerRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceiptResponse> listReceipts() {
        return receiptRepository.findAll().stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ReceiptResponse getReceiptById(Long id) {
        Receipt receipt = receiptRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + id));
        return mapToResponse(receipt);
    }

    @Override
    @Transactional
    public ReceiptResponse createReceipt(CreateReceiptRequest request) {
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
        return mapToResponse(saved);
    }

    @Override
    @Transactional
    public ReceiptResponse receiveStock(Long receiptId, ReceiveItemsRequest request) {
        Receipt receipt = receiptRepository.findById(receiptId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy phiếu nhập #" + receiptId));

        if (receipt.getStatus() == Receipt.Status.COMPLETED) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Phiếu nhập đã hoàn thành, không thể kiểm đếm lại");
        }

        Map<Long, ReceiptItem> itemMap = receipt.getItems().stream()
                .collect(Collectors.toMap(ReceiptItem::getId, it -> it));

        for (ReceiveItemsRequest.ItemInspection insp : request.inspections()) {
            ReceiptItem item = itemMap.get(insp.itemId());
            if (item != null) {
                int accepted = insp.acceptedQty();
                int rejected = insp.rejectedQty() != null ? insp.rejectedQty() : 0;
                item.setAcceptedQty(accepted);
                item.setRejectedQty(rejected);

                // Increment physical stock on-hand
                if (accepted > 0) {
                    InventoryBalance balance = balanceRepository.findByVariantIdWithLock(item.getVariantId())
                            .orElseGet(() -> {
                                InventoryBalance init = new InventoryBalance();
                                init.setVariantId(item.getVariantId());
                                init.setOnHand(0);
                                init.setReserved(0);
                                init.setSafetyBuffer(0);
                                init.setVersion(0L);
                                return init;
                            });

                    balance.setOnHand(balance.getOnHand() + accepted);
                    balanceRepository.save(balance);

                    // Record ledger entry
                    InventoryLedger ledger = new InventoryLedger();
                    ledger.setVariantId(item.getVariantId());
                    ledger.setDelta(accepted);
                    ledger.setReason("Nhập kho từ " + receipt.getReceiptNumber());
                    ledger.setOnHandAfter(balance.getOnHand());
                    ledger.setReservedAfter(balance.getReserved());
                    ledger.setReferenceId(receipt.getReceiptNumber());
                    ledgerRepository.save(ledger);
                }
            }
        }

        receipt.setStatus(Receipt.Status.COMPLETED);
        Receipt saved = receiptRepository.save(receipt);
        return mapToResponse(saved);
    }

    private ReceiptResponse mapToResponse(Receipt receipt) {
        List<ReceiptResponse.ReceiptItemResponse> items = receipt.getItems().stream().map(it ->
                new ReceiptResponse.ReceiptItemResponse(
                        it.getId(),
                        it.getVariantId(),
                        it.getExpectedQty(),
                        it.getAcceptedQty(),
                        it.getRejectedQty(),
                        it.getUnitCost()
                )
        ).collect(Collectors.toList());

        return new ReceiptResponse(
                receipt.getId(),
                receipt.getReceiptNumber(),
                receipt.getSupplierName(),
                receipt.getStatus().name(),
                items,
                receipt.getCreatedAt(),
                receipt.getUpdatedAt()
        );
    }
}
