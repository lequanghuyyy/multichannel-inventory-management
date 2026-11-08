package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.Receipt;
import com.octoflow.api.entity.ReceiptItem;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class ReceiptMapper {

    public ReceiptResponse.ReceiptItemResponse toItemResponse(ReceiptItem item) {
        if (item == null) {
            return null;
        }
        return new ReceiptResponse.ReceiptItemResponse(
                item.getId(),
                item.getVariantId(),
                item.getExpectedQty(),
                item.getAcceptedQty(),
                item.getRejectedQty(),
                item.getUnitCost()
        );
    }

    public List<ReceiptResponse.ReceiptItemResponse> toItemResponses(List<ReceiptItem> items) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        return items.stream()
                .map(this::toItemResponse)
                .collect(Collectors.toList());
    }

    public ReceiptResponse toResponse(Receipt receipt) {
        if (receipt == null) {
            return null;
        }
        return new ReceiptResponse(
                receipt.getId(),
                receipt.getReceiptNumber(),
                receipt.getSupplierName(),
                receipt.getStatus() != null ? receipt.getStatus().name() : Receipt.Status.DRAFT.name(),
                toItemResponses(receipt.getItems()),
                receipt.getCreatedAt(),
                receipt.getUpdatedAt()
        );
    }

    public List<ReceiptResponse> toResponses(List<Receipt> receipts) {
        if (receipts == null || receipts.isEmpty()) {
            return Collections.emptyList();
        }
        return receipts.stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }
}
