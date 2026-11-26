package com.octoflow.api.adapter;

public class LazadaApiException extends RuntimeException {

    public enum Kind { AUTHENTICATION, FORBIDDEN, RATE_LIMITED, TIMEOUT, UPSTREAM, PROTOCOL }

    private final Kind kind;

    public LazadaApiException(Kind kind) {
        super("Lazada API request failed.");
        this.kind = kind;
    }

    public LazadaApiException(Kind kind, Throwable cause) {
        super("Lazada API request failed.", cause);
        this.kind = kind;
    }

    public Kind getKind() {
        return kind;
    }
}
