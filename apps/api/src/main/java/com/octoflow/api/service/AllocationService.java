package com.octoflow.api.service;

import com.octoflow.api.dto.request.AllocationPreviewRequest;
import com.octoflow.api.dto.response.AllocationPlanResponse;

import java.util.List;

public interface AllocationService {

    AllocationPlanResponse preview(AllocationPreviewRequest request);

    AllocationPlanResponse confirm(Long planId, String idempotencyKey);

    AllocationPlanResponse get(Long planId);

    List<AllocationPlanResponse> listBySku(String sku);
}
