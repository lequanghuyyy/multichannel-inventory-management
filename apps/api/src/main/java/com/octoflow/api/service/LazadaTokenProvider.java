package com.octoflow.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.octoflow.api.adapter.LazadaApiException;
import com.octoflow.api.adapter.LazadaOpenPlatformClient;
import com.octoflow.api.config.LazadaProperties;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class LazadaTokenProvider {

    private static final Duration REFRESH_MARGIN = Duration.ofMinutes(30);
    private final LazadaConnectionRecorder recorder;
    private final LazadaTokenCipher cipher;
    private final LazadaOpenPlatformClient client;
    private final LazadaProperties properties;

    public LazadaTokenProvider(LazadaConnectionRecorder recorder, LazadaTokenCipher cipher,
                               LazadaOpenPlatformClient client, LazadaProperties properties) {
        this.recorder = recorder;
        this.cipher = cipher;
        this.client = client;
        this.properties = properties;
    }

    public String getValidAccessToken(Long channelId) {
        LazadaConnectionRecorder.ConnectionRecord record = recorder.findByChannelId(channelId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                        ErrorCode.LAZADA_CONNECTION_NOT_VERIFIED,
                        "Kênh Lazada chưa có thông tin ủy quyền."));
        Instant now = Instant.now();
        if (record.accessCiphertext() == null || record.refreshCiphertext() == null
                || record.accessExpiresAt() == null || record.refreshExpiresAt() == null) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.LAZADA_CONNECTION_NOT_VERIFIED,
                    "Kênh Lazada chưa có token khả dụng.");
        }

        Instant refreshCutoff = now.plus(REFRESH_MARGIN);
        if (record.accessExpiresAt().isAfter(refreshCutoff)) return decrypt(record.accessCiphertext());
        if (!record.refreshExpiresAt().isAfter(now)) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.LAZADA_AUTH_FAILED,
                    "Token Lazada hết hạn; cần ủy quyền lại.");
        }

        UUID leaseId = UUID.randomUUID();
        Instant leaseUntil = now.plusMillis(properties.getConnectTimeoutMs() + properties.getReadTimeoutMs() + 10_000L);
        if (!recorder.acquireRefreshLease(channelId, leaseId, now, leaseUntil, refreshCutoff)) {
            LazadaConnectionRecorder.ConnectionRecord latest = recorder.findByChannelId(channelId).orElse(record);
            if (latest.accessExpiresAt() != null && latest.accessExpiresAt().isAfter(refreshCutoff)
                    && latest.accessCiphertext() != null) {
                return decrypt(latest.accessCiphertext());
            }
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    ErrorCode.LAZADA_TOKEN_REFRESH_IN_PROGRESS,
                    "Đang làm mới token Lazada; hãy thử lại sau.");
        }

        try {
            String refreshToken = decrypt(record.refreshCiphertext());
            JsonNode response = client.refreshToken(refreshToken);
            Instant refreshedAt = Instant.now();
            LazadaConnectionRecorder.TokenSet refreshed = LazadaTokenPayloadParser.parse(
                    response, properties.getCountry(), record.sellerId(), record.country(), refreshedAt);
            boolean saved = recorder.storeRefreshedToken(channelId, leaseId, refreshed,
                    cipher.encrypt(refreshed.accessToken()), cipher.encrypt(refreshed.refreshToken()),
                    properties.getTokenKeyId(), refreshedAt);
            if (!saved) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                        ErrorCode.LAZADA_TOKEN_REFRESH_IN_PROGRESS,
                        "Token Lazada đã được thay đổi bởi yêu cầu khác; hãy thử lại.");
            }
            return refreshed.accessToken();
        } catch (LazadaApiException ex) {
            throw toApiException(ex);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_PROTOCOL_ERROR,
                    "Không thể xử lý an toàn token trả về từ Lazada.");
        } finally {
            recorder.releaseRefreshLease(channelId, leaseId, Instant.now());
        }
    }

    private String decrypt(String ciphertext) {
        try {
            return cipher.decrypt(ciphertext);
        } catch (IllegalStateException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    ErrorCode.LAZADA_CONNECTION_NOT_VERIFIED,
                    "Không thể giải mã token Lazada; cần kiểm tra cấu hình mã hóa.");
        }
    }

    private ApiException toApiException(LazadaApiException ex) {
        return switch (ex.getKind()) {
            case AUTHENTICATION -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_AUTH_FAILED,
                    "Lazada từ chối token; cần ủy quyền lại.");
            case FORBIDDEN -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_FORBIDDEN,
                    "Ứng dụng chưa có quyền làm mới token Lazada.");
            case RATE_LIMITED -> new ApiException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.LAZADA_RATE_LIMITED,
                    "Lazada đang giới hạn yêu cầu; hãy thử lại sau.");
            case TIMEOUT -> new ApiException(HttpStatus.GATEWAY_TIMEOUT, ErrorCode.LAZADA_UPSTREAM_ERROR,
                    "Lazada không phản hồi kịp thời.");
            case UPSTREAM, PROTOCOL -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_UPSTREAM_ERROR,
                    "Không thể làm mới token với Lazada.");
        };
    }
}
