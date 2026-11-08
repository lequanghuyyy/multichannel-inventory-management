package com.octoflow.api.service;

import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.response.ReceiptResponse;

import java.util.List;

public interface ReceiptService {

    List<ReceiptResponse> listReceipts();

    ReceiptResponse getReceiptById(Long id);

    ReceiptResponse createReceipt(CreateReceiptRequest request);

    ReceiptResponse receiveStock(Long receiptId, ReceiveItemsRequest request);
}
