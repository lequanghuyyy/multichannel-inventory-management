package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.response.InventorySnapshotResponse;
import com.octoflow.api.dto.response.LedgerEntryResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.InventoryLedger;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.InventoryMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.InventoryService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class InventoryServiceImpl implements InventoryService {

    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final InventoryLedgerRepository ledgerRepository;
    private final InventoryMapper inventoryMapper;

    public InventoryServiceImpl(InventoryBalanceRepository balanceRepository,
                                ProductVariantRepository variantRepository,
                                OutboxEventRepository outboxEventRepository,
                                InventoryLedgerRepository ledgerRepository,
                                InventoryMapper inventoryMapper) {
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.ledgerRepository = ledgerRepository;
        this.inventoryMapper = inventoryMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<InventorySnapshotResponse> listInventory() {
        return variantRepository.findAll().stream().map(variant -> {
            InventoryBalance balance = balanceRepository.findByVariantId(variant.getId()).orElse(null);
            return inventoryMapper.toSnapshotResponse(variant, balance);
        }).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public InventorySnapshotResponse getInventoryBySku(String sku) {
        ProductVariant variant = variantRepository.findBySku(sku)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + sku));

        InventoryBalance balance = balanceRepository.findByVariantId(variant.getId()).orElse(null);
        return inventoryMapper.toSnapshotResponse(variant, balance);
    }

    @Override
    @Transactional
    public InventorySnapshotResponse adjustInventory(InventoryAdjustRequest request, String idempotencyKey) {
        ProductVariant variant = variantRepository.findBySku(request.sku())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + request.sku()));

        // Pessimistic lock row to avoid concurrent adjustment overwrite
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                .orElseGet(() -> {
                    InventoryBalance init = new InventoryBalance();
                    init.setVariantId(variant.getId());
                    init.setOnHand(0);
                    init.setReserved(0);
                    init.setSafetyBuffer(0);
                    return init;
                });

        if (request.expectedVersion() != null && !request.expectedVersion().equals(balance.getVersion())) {
            throw new BusinessRuleException(ErrorCode.STALE_VERSION, "Số liệu tồn kho đã thay đổi từ lần xem trước. Hãy tải lại.");
        }

        int newOnHand = balance.getOnHand() + request.delta();
        if (newOnHand < 0) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Tồn vật lý không thể âm sau khi điều chỉnh.");
        }
        if (newOnHand < balance.getReserved() + balance.getSafetyBuffer()) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Tồn vật lý sau điều chỉnh không đủ đáp ứng số đang giữ và đệm an toàn.");
        }

        balance.setOnHand(newOnHand);
        balanceRepository.save(balance);

        // Record audit ledger entry
        InventoryLedger ledger = new InventoryLedger();
        ledger.setVariantId(variant.getId());
        ledger.setDelta(request.delta());
        ledger.setReason(request.reason());
        ledger.setOnHandAfter(balance.getOnHand());
        ledger.setReservedAfter(balance.getReserved());
        ledger.setReferenceId(idempotencyKey);
        ledgerRepository.save(ledger);

        // Record outbox event for asynchronous channel reconciliation
        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("INVENTORY");
        event.setAggregateId(variant.getId().toString());
        event.setEventType("INVENTORY_ADJUSTED");
        event.setPayload(String.format("{\"sku\":\"%s\",\"delta\":%d,\"reason\":\"%s\"}", variant.getSku(), request.delta(), request.reason()));
        outboxEventRepository.save(event);

        return inventoryMapper.toSnapshotResponse(variant, balance);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LedgerEntryResponse> getLedgerBySku(String sku, int limit) {
        ProductVariant variant = variantRepository.findBySku(sku)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + sku));

        int fetchLimit = limit > 0 ? limit : 50;
        List<InventoryLedger> ledgers = ledgerRepository.findByVariantIdOrderByCreatedAtDesc(
                variant.getId(),
                PageRequest.of(0, fetchLimit)
        );
        return inventoryMapper.toLedgerEntryResponses(ledgers);
    }
}
