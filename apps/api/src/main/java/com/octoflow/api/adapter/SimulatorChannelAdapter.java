package com.octoflow.api.adapter;

import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.SimulatorFault;
import org.springframework.stereotype.Component;

/**
 * Stateful simulator adapter. It models a real remote channel closely enough that callers must
 * use the same write-then-read-back protocol as a production connector.
 */
@Component
public class SimulatorChannelAdapter implements ChannelInventoryAdapter {

    private final SimulatorStateService stateService;

    public SimulatorChannelAdapter(SimulatorStateService stateService) {
        this.stateService = stateService;
    }

    @Override
    public String name() {
        return "simulator";
    }

    @Override
    public RemoteStock readStock(Channel channel, ChannelListing listing) {
        SimulatorStateService.Snapshot snapshot = stateService.readStock(listing.getId());
        return new RemoteStock(snapshot.quantity(), snapshot.version(),
                "sim-read-" + listing.getId() + "-" + snapshot.version());
    }

    @Override
    public DeliveryReceipt writeStock(Channel channel, ChannelListing listing,
                                      int targetQuantity, String idempotencyReference) {
        SimulatorStateService.WritePreparation preparation = stateService.prepareWrite(listing.getId());
        SimulatorFault.FaultType fault = preparation.faultType();

        if (fault == SimulatorFault.FaultType.REFUSE) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    "Simulated channel refused the stock update.");
        }
        if (fault == SimulatorFault.FaultType.TIMEOUT) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    "Simulated channel timed out before acknowledging the stock update.");
        }
        if (fault == SimulatorFault.FaultType.DELAY) {
            sleep(preparation.delayMs());
        }

        boolean duplicate = fault == SimulatorFault.FaultType.DUPLICATE;
        SimulatorStateService.Snapshot applied = stateService.applyWrite(listing.getId(), targetQuantity, duplicate);

        if (fault == SimulatorFault.FaultType.TIMEOUT_AFTER_WRITE) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    "Simulated channel timed out after applying the stock update; read-back required.");
        }
        return new DeliveryReceipt(targetQuantity, targetQuantity,
                idempotencyReference == null ? "sim-write-" + applied.version() : idempotencyReference);
    }

    @Override
    public MappingSnapshot verifyMapping(Channel channel, ChannelListing listing) {
        SimulatorStateService.Snapshot snapshot = stateService.readStock(listing.getId());
        return new MappingSnapshot(listing.getExternalSku(), listing.getExternalVariantId(),
                snapshot.quantity(), snapshot.version());
    }

    private void sleep(int delayMs) {
        if (delayMs <= 0) {
            return;
        }
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    "Simulator delay was interrupted; the remote result is uncertain.", ex);
        }
    }
}
