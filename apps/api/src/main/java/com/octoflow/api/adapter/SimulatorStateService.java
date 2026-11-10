package com.octoflow.api.adapter;

import com.octoflow.api.entity.SimulatorFault;
import com.octoflow.api.entity.SimulatorListingState;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.SimulatorFaultRepository;
import com.octoflow.api.repository.SimulatorListingStateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Durable state and fault injection for the simulated channel. The simulator persists its last
 * acknowledged quantity so a process restart never silently resets a channel to zero.
 */
@Service
public class SimulatorStateService {

    public record Snapshot(int quantity, long version) {}

    public record WritePreparation(SimulatorFault.FaultType faultType, int delayMs) {}

    private final SimulatorListingStateRepository stateRepository;
    private final SimulatorFaultRepository faultRepository;

    public SimulatorStateService(SimulatorListingStateRepository stateRepository,
                                 SimulatorFaultRepository faultRepository) {
        this.stateRepository = stateRepository;
        this.faultRepository = faultRepository;
    }

    @Transactional
    public void ensureState(Long listingId) {
        stateRepository.ensureExists(listingId);
    }

    @Transactional
    public Snapshot readStock(Long listingId) {
        stateRepository.ensureExists(listingId);
        SimulatorListingState state = lockState(listingId);
        SimulatorFault fault = faultRepository.findByListingIdForUpdate(listingId).orElse(null);
        if (fault != null && fault.getFaultType() == SimulatorFault.FaultType.WRONG_READ) {
            consume(fault);
            return new Snapshot(state.getQuantity() + 1, state.getVersion());
        }
        return new Snapshot(state.getQuantity(), state.getVersion());
    }

    /**
     * Consumes one injected write fault, if present. Faults that affect only reads are left for
     * the next read so a wrong-read injection cannot be lost by an unrelated write attempt.
     */
    @Transactional
    public WritePreparation prepareWrite(Long listingId) {
        stateRepository.ensureExists(listingId);
        SimulatorFault fault = faultRepository.findByListingIdForUpdate(listingId).orElse(null);
        if (fault == null || fault.getFaultType() == SimulatorFault.FaultType.WRONG_READ) {
            return new WritePreparation(null, 0);
        }
        SimulatorFault.FaultType type = fault.getFaultType();
        int delayMs = fault.getDelayMs();
        consume(fault);
        return new WritePreparation(type, delayMs);
    }

    @Transactional
    public Snapshot applyWrite(Long listingId, int quantity, boolean duplicate) {
        stateRepository.ensureExists(listingId);
        SimulatorListingState state = lockState(listingId);
        state.setQuantity(quantity);
        state.setVersion(state.getVersion() + 1);
        stateRepository.save(state);
        if (duplicate) {
            state.setVersion(state.getVersion() + 1);
            stateRepository.save(state);
        }
        return new Snapshot(state.getQuantity(), state.getVersion());
    }

    @Transactional
    public Snapshot setExternalStock(Long listingId, int quantity) {
        stateRepository.ensureExists(listingId);
        SimulatorListingState state = lockState(listingId);
        state.setQuantity(quantity);
        state.setVersion(state.getVersion() + 1);
        stateRepository.save(state);
        return new Snapshot(state.getQuantity(), state.getVersion());
    }

    @Transactional
    public Snapshot getState(Long listingId) {
        stateRepository.ensureExists(listingId);
        SimulatorListingState state = stateRepository.findById(listingId)
                .orElseThrow(() -> new BusinessRuleException(ErrorCode.NOT_FOUND,
                        "Simulator state does not exist for listing #" + listingId));
        return new Snapshot(state.getQuantity(), state.getVersion());
    }

    @Transactional
    public void injectFault(Long listingId, SimulatorFault.FaultType type, int times, int delayMs) {
        if (type == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Simulator fault type is required.");
        }
        if (times < 1 || times > 1000) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Fault times must be between 1 and 1000.");
        }
        if (delayMs < 0 || delayMs > 60_000) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Fault delay must be between 0 and 60000 ms.");
        }
        stateRepository.ensureExists(listingId);
        SimulatorFault fault = faultRepository.findById(listingId).orElseGet(SimulatorFault::new);
        fault.setListingId(listingId);
        fault.setFaultType(type);
        fault.setRemainingCount(times);
        fault.setDelayMs(delayMs);
        faultRepository.save(fault);
    }

    @Transactional
    public void clearFault(Long listingId) {
        faultRepository.deleteById(listingId);
    }

    private SimulatorListingState lockState(Long listingId) {
        return stateRepository.findByListingIdForUpdate(listingId)
                .orElseThrow(() -> new IllegalStateException("Simulator state initialization failed"));
    }

    private void consume(SimulatorFault fault) {
        if (fault.getRemainingCount() > 1) {
            fault.setRemainingCount(fault.getRemainingCount() - 1);
            faultRepository.save(fault);
        } else {
            faultRepository.delete(fault);
        }
    }
}
