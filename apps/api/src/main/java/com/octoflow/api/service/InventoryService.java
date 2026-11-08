package com.octoflow.api.service;

import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.response.InventorySnapshotResponse;
import com.octoflow.api.dto.response.LedgerEntryResponse;

import java.util.List;

public interface InventoryService {

    List<InventorySnapshotResponse> listInventory();

    InventorySnapshotResponse getInventoryBySku(String sku);

    InventorySnapshotResponse adjustInventory(InventoryAdjustRequest request, String idempotencyKey);

    List<LedgerEntryResponse> getLedgerBySku(String sku, int limit);
}
