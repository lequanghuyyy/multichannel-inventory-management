package com.octoflow.api.service;

import com.octoflow.api.dto.request.CancelReceiptRequest;
import com.octoflow.api.dto.request.CloseShortRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.UpdateReceiptRequest;
import com.octoflow.api.dto.response.ReceiptPreviewResponse;
import com.octoflow.api.dto.response.ReceiptResponse;

import java.util.List;

public interface ReceiptService {

    List<ReceiptResponse> listReceipts();

    ReceiptResponse getReceiptById(Long id);

    ReceiptResponse createReceipt(CreateReceiptRequest request, String idempotencyKey);

    ReceiptResponse updateReceipt(Long id, UpdateReceiptRequest request, String idempotencyKey);

    ReceiptResponse cancelReceipt(Long id, CancelReceiptRequest request, String idempotencyKey);

    ReceiptResponse closeShort(Long id, CloseShortRequest request, String idempotencyKey);

    ReceiptPreviewResponse previewReceive(Long id, ReceiveItemsRequest request);

    ReceiptResponse receiveStock(Long receiptId, ReceiveItemsRequest request, String idempotencyKey);
}
