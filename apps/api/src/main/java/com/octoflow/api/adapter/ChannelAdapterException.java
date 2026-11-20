package com.octoflow.api.adapter;

/**
 * A channel adapter failure with a stable category. Only {@link Kind#TIMEOUT} is uncertain:
 * the remote channel may or may not have applied the write, so callers must read back before
 * claiming success and must not advance an allocation to its increase phase.
 */
public class ChannelAdapterException extends RuntimeException {

    public enum Kind {
        /** No configured connector can deliver to this channel. Fail closed. */
        UNAVAILABLE,
        /** The channel explicitly refused the update. */
        REFUSED,
        /** The call timed out; the remote result is uncertain. */
        TIMEOUT,
        /** The channel answered, but the observed state is inconsistent. */
        PROTOCOL
    }

    private final Kind kind;
    private final String reasonCode;

    public ChannelAdapterException(Kind kind, String message) {
        this(kind, null, message, null);
    }

    public ChannelAdapterException(Kind kind, String message, Throwable cause) {
        this(kind, null, message, cause);
    }

    public ChannelAdapterException(Kind kind, String reasonCode, String message) {
        this(kind, reasonCode, message, null);
    }

    public ChannelAdapterException(Kind kind, String reasonCode, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
        this.reasonCode = reasonCode;
    }

    public Kind getKind() {
        return kind;
    }

    /**
     * A stable classifier such as {@code WOO_AUTH_FAILED}. Null for adapters that only use the
     * coarse {@link Kind}; callers then fall back to the kind name.
     */
    public String getReasonCode() {
        return reasonCode;
    }

    public String reasonCodeOrKind() {
        return reasonCode == null ? kind.name() : reasonCode;
    }

    public boolean isUncertain() {
        return kind == Kind.TIMEOUT;
    }
}
