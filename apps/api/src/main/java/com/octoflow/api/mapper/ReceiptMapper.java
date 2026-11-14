package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.entity.Receipt;
import com.octoflow.api.entity.ReceiptEvent;
import com.octoflow.api.entity.ReceiptEventItem;
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
                item.getSku(),
                item.getVariantTitle(),
                item.getExpectedQty(),
                item.getAcceptedQty(),
                item.getRejectedQty(),
                item.getProcessedQty(),
                item.getRemainingQty(),
                item.getUnitCost(),
                item.getRejectionReason()
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

    public ReceiptResponse.ReceiptBatchItemResponse toBatchItemResponse(ReceiptEventItem item) {
        if (item == null) {
            return null;
        }
        return new ReceiptResponse.ReceiptBatchItemResponse(
                item.getReceiptItemId(),
                item.getVariantId(),
                item.getSku(),
                item.getAcceptedQty(),
                item.getRejectedQty(),
                item.getRejectionReason()
        );
    }

    public ReceiptResponse.ReceiptBatchResponse toBatchResponse(ReceiptEvent event) {
        if (event == null) {
            return null;
        }
        List<ReceiptResponse.ReceiptBatchItemResponse> items = event.getItems() == null
                ? Collections.emptyList()
                : event.getItems().stream().map(this::toBatchItemResponse).collect(Collectors.toList());
        return new ReceiptResponse.ReceiptBatchResponse(
                event.getId(),
                event.getEventType(),
                event.getReceiptVersion(),
                event.getActor(),
                event.getNote(),
                event.getPayload(),
                event.getCreatedAt(),
                items
        );
    }

    public ReceiptResponse.ReceiptEventResponse toEventResponse(ReceiptEvent event) {
        if (event == null) {
            return null;
        }
        return new ReceiptResponse.ReceiptEventResponse(
                event.getId(),
                event.getEventType(),
                event.getReceiptVersion(),
                event.getActor(),
                event.getNote(),
                event.getPayload(),
                event.getCreatedAt()
        );
    }

    public ReceiptResponse toResponse(Receipt receipt) {
        if (receipt == null) {
            return null;
        }

        List<ReceiptItem> receiptItems = receipt.getItems() == null ? Collections.emptyList() : receipt.getItems();
        int acceptedTotal = receiptItems.stream().mapToInt(ReceiptItem::getAcceptedQty).sum();
        int rejectedTotal = receiptItems.stream().mapToInt(ReceiptItem::getRejectedQty).sum();
        int remainingTotal = receiptItems.stream().mapToInt(ReceiptItem::getRemainingQty).sum();

        List<ReceiptResponse.ReceiptBatchResponse> batches = receipt.getEvents() == null
                ? Collections.emptyList()
                : receipt.getEvents().stream()
                        .filter(event -> ReceiptEvent.Type.RECEIVED.name().equals(event.getEventType()))
                        .map(this::toBatchResponse)
                        .collect(Collectors.toList());

        List<ReceiptResponse.ReceiptEventResponse> events = receipt.getEvents() == null
                ? Collections.emptyList()
                : receipt.getEvents().stream()
                        .map(this::toEventResponse)
                        .collect(Collectors.toList());

        return new ReceiptResponse(
                receipt.getId(),
                receipt.getReceiptNumber(),
                receipt.getSupplierName(),
                receipt.getNote(),
                receipt.getStatus() != null ? receipt.getStatus().name() : Receipt.Status.DRAFT.name(),
                receipt.getVersion(),
                toItemResponses(receiptItems),
                batches,
                events,
                acceptedTotal,
                rejectedTotal,
                remainingTotal,
                receipt.getCancelReason(),
                receipt.getCancelledAt(),
                receipt.getCloseShortReason(),
                receipt.getClosedShortAt(),
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
