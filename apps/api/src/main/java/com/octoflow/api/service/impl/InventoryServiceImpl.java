package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.response.InventorySnapshotResponse;
import com.octoflow.api.dto.response.LedgerEntryResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.InventoryLedger;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.InventoryMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.InventoryService;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class InventoryServiceImpl implements InventoryService {

    private final InventoryBalanceRepository balanceRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryLedgerRepository ledgerRepository;
    private final InventoryMapper inventoryMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;

    public InventoryServiceImpl(InventoryBalanceRepository balanceRepository,
                                ProductVariantRepository variantRepository,
                                InventoryLedgerRepository ledgerRepository,
                                InventoryMapper inventoryMapper,
                                IdempotencyService idempotencyService,
                                InventoryMovementRecorder movementRecorder) {
        this.balanceRepository = balanceRepository;
        this.variantRepository = variantRepository;
        this.ledgerRepository = ledgerRepository;
        this.inventoryMapper = inventoryMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
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
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/inventory/adjust", request,
                InventorySnapshotResponse.class, () -> applyAdjustment(request, idempotencyKey));
    }

    private InventorySnapshotResponse applyAdjustment(InventoryAdjustRequest request, String idempotencyKey) {
        ProductVariant variant = variantRepository.findBySku(request.sku())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + request.sku()));

        // Insert-if-absent followed by FOR UPDATE serializes the first adjustment as well.
        balanceRepository.ensureBalanceExists(variant.getId());
        InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                .orElseThrow(() -> new IllegalStateException("Inventory balance initialization failed"));
        InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);

        if (request.expectedVersion() != null && !request.expectedVersion().equals(balance.getVersion())) {
            throw new BusinessRuleException(ErrorCode.STALE_VERSION, "Số liệu tồn kho đã thay đổi từ lần xem trước. Hãy tải lại.");
        }

        if (request.delta() == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng thay đổi (delta) không được để trống.");
        }
        if (request.reason() == null || request.reason().isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Lý do điều chỉnh bắt buộc phải có.");
        }
        int newOnHand;
        try {
            newOnHand = Math.addExact(balance.getOnHand(), request.delta());
        } catch (ArithmeticException ex) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Số lượng tồn vượt giới hạn hỗ trợ.");
        }
        if (newOnHand < 0) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Tồn vật lý không thể âm sau khi điều chỉnh.");
        }
        int newSafetyBuffer = request.safetyBuffer() != null
                ? request.safetyBuffer()
                : balance.getSafetyBuffer();
        if (newSafetyBuffer < 0) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE, "Tồn đệm không được âm.");
        }
        if (newOnHand < balance.getReserved() + newSafetyBuffer) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Tồn vật lý sau điều chỉnh không đủ đáp ứng số đang giữ và đệm an toàn.");
        }
        if (newOnHand == balance.getOnHand() && newSafetyBuffer == balance.getSafetyBuffer()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Điều chỉnh tồn phải thay đổi số lượng vật lý hoặc tồn đệm.");
        }

        balance.setOnHand(newOnHand);
        balance.setSafetyBuffer(newSafetyBuffer);
        balanceRepository.save(balance);
        movementRecorder.record(variant.getId(), before, balance, "ADJUSTMENT", request.reason(), idempotencyKey);

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
