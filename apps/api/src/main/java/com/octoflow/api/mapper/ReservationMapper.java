package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.ReservationResponse;
import com.octoflow.api.entity.Reservation;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class ReservationMapper {

    public ReservationResponse toResponse(Reservation hold, String sku) {
        if (hold == null) {
            return null;
        }
        return new ReservationResponse(
                hold.getId(),
                hold.getVariantId(),
                sku != null ? sku : "UNKNOWN",
                hold.getQuantity(),
                hold.getStatus() != null ? hold.getStatus().name() : Reservation.Status.ACTIVE.name(),
                hold.getOrderId(),
                hold.getExpiresAt(),
                hold.getCreatedAt()
        );
    }

    public List<ReservationResponse> toResponseList(List<Reservation> holds, Function<Long, String> skuLookup) {
        if (holds == null || holds.isEmpty()) {
            return Collections.emptyList();
        }
        return holds.stream()
                .map(hold -> {
                    String sku = skuLookup != null ? skuLookup.apply(hold.getVariantId()) : "UNKNOWN";
                    return toResponse(hold, sku);
                })
                .collect(Collectors.toList());
    }
}
