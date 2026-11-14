package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.SimulatorStateService;
import com.octoflow.api.dto.request.SimulatorFaultRequest;
import com.octoflow.api.dto.response.SimulatorStateResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.SimulatorFault;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.SimulatorFaultRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;

/**
 * Admin-only controls for the durable simulator. The simulator is deliberately unusable for
 * every channel that is not explicitly configured as simulated, so these endpoints cannot be
 * used to fabricate delivery evidence for a real marketplace channel.
 */
@Service
public class SimulatorAdminService {

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository listingRepository;
    private final SimulatorFaultRepository faultRepository;
    private final SimulatorStateService stateService;
    private final ChannelAdapterRouter adapterRouter;

    public SimulatorAdminService(ChannelRepository channelRepository,
                                 ChannelListingRepository listingRepository,
                                 SimulatorFaultRepository faultRepository,
                                 SimulatorStateService stateService,
                                 ChannelAdapterRouter adapterRouter) {
        this.channelRepository = channelRepository;
        this.listingRepository = listingRepository;
        this.faultRepository = faultRepository;
        this.stateService = stateService;
        this.adapterRouter = adapterRouter;
    }

    public SimulatorStateResponse getState(Long channelId, Long listingId) {
        ChannelListing listing = requireSimulatorListing(channelId, listingId);
        SimulatorStateService.Snapshot snapshot = stateService.getState(listing.getId());
        SimulatorFault fault = faultRepository.findById(listing.getId()).orElse(null);
        return toResponse(channelId, listing, snapshot, fault);
    }

    public SimulatorStateResponse setStock(Long channelId, Long listingId, Integer quantity) {
        ChannelListing listing = requireSimulatorListing(channelId, listingId);
        if (quantity == null || quantity < 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Simulator stock quantity must be zero or greater.");
        }
        SimulatorStateService.Snapshot snapshot = stateService.setExternalStock(listing.getId(), quantity);
        SimulatorFault fault = faultRepository.findById(listing.getId()).orElse(null);
        return toResponse(channelId, listing, snapshot, fault);
    }

    public SimulatorStateResponse injectFault(Long channelId, Long listingId, SimulatorFaultRequest request) {
        ChannelListing listing = requireSimulatorListing(channelId, listingId);
        SimulatorFault.FaultType type = parseFaultType(request == null ? null : request.type());
        int times = request == null || request.times() == null ? 1 : request.times();
        int delayMs = request == null || request.delayMs() == null ? 0 : request.delayMs();
        stateService.injectFault(listing.getId(), type, times, delayMs);
        SimulatorStateService.Snapshot snapshot = stateService.getState(listing.getId());
        SimulatorFault fault = faultRepository.findById(listing.getId()).orElse(null);
        return toResponse(channelId, listing, snapshot, fault);
    }

    public SimulatorStateResponse clearFault(Long channelId, Long listingId) {
        ChannelListing listing = requireSimulatorListing(channelId, listingId);
        stateService.clearFault(listing.getId());
        SimulatorStateService.Snapshot snapshot = stateService.getState(listing.getId());
        return toResponse(channelId, listing, snapshot, null);
    }

    private ChannelListing requireSimulatorListing(Long channelId, Long listingId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
        if (!adapterRouter.simulatorEnabled() || !adapterRouter.isSimulatorChannel(channel)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SIMULATOR_NOT_AVAILABLE,
                    "Simulator chỉ khả dụng cho kênh môi trường 'simulated' khi được bật cấu hình.");
        }
        return listingRepository.findByChannelIdAndId(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
    }

    private SimulatorFault.FaultType parseFaultType(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Simulator fault type is required.");
        }
        try {
            return SimulatorFault.FaultType.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Unsupported simulator fault type '" + value + "'.");
        }
    }

    private SimulatorStateResponse toResponse(Long channelId,
                                              ChannelListing listing,
                                              SimulatorStateService.Snapshot snapshot,
                                              SimulatorFault fault) {
        return new SimulatorStateResponse(
                listing.getId(),
                channelId,
                snapshot.quantity(),
                snapshot.version(),
                fault != null ? fault.getFaultType().name() : null,
                fault != null ? fault.getRemainingCount() : null,
                fault != null ? fault.getDelayMs() : null,
                Instant.now());
    }
}
