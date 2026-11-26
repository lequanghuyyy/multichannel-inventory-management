package com.octoflow.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.octoflow.api.adapter.LazadaApiException;
import com.octoflow.api.adapter.LazadaOpenPlatformClient;
import com.octoflow.api.config.LazadaProperties;
import com.octoflow.api.dto.response.LazadaAuthorizationResponse;
import com.octoflow.api.dto.response.LazadaStatusResponse;
import com.octoflow.api.dto.response.LazadaVerifyResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.User;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class LazadaConnectionService {

    private static final Duration OAUTH_STATE_TTL = Duration.ofMinutes(10);
    private final LazadaProperties properties;
    private final LazadaOAuthStateRecorder stateRecorder;
    private final LazadaConnectionRecorder connectionRecorder;
    private final LazadaOpenPlatformClient client;
    private final LazadaTokenCipher cipher;
    private final LazadaTokenProvider tokenProvider;
    private final ChannelRepository channelRepository;
    private final UserRepository userRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public LazadaConnectionService(LazadaProperties properties,
                                   LazadaOAuthStateRecorder stateRecorder,
                                   LazadaConnectionRecorder connectionRecorder,
                                   LazadaOpenPlatformClient client,
                                   LazadaTokenCipher cipher,
                                   LazadaTokenProvider tokenProvider,
                                   ChannelRepository channelRepository,
                                   UserRepository userRepository) {
        this.properties = properties;
        this.stateRecorder = stateRecorder;
        this.connectionRecorder = connectionRecorder;
        this.client = client;
        this.cipher = cipher;
        this.tokenProvider = tokenProvider;
        this.channelRepository = channelRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public LazadaStatusResponse status() {
        return connectionRecorder.status();
    }

    public LazadaAuthorizationResponse connect(String username) {
        requireConfigured();
        User user = userRepository.findByUsernameOrEmail(username)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED,
                        "Yêu cầu đăng nhập để kết nối Lazada."));

        byte[] randomState = new byte[32];
        secureRandom.nextBytes(randomState);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(randomState);
        String stateHash = sha256(state);
        Instant createdAt = Instant.now();
        stateRecorder.create(stateHash, user.getId(), properties.getRedirectUri(),
                createdAt, createdAt.plus(OAUTH_STATE_TTL));

        String authorizationUrl = "https://auth.lazada.com/oauth/authorize"
                + "?response_type=code&force_auth=true"
                + "&redirect_uri=" + encode(properties.getRedirectUri())
                + "&client_id=" + encode(properties.getAppKey())
                + "&state=" + encode(state);
        return new LazadaAuthorizationResponse(authorizationUrl);
    }

    public URI callback(String code, String state, String oauthError) {
        if (state == null || state.isBlank() || state.length() > 256) throw invalidState();
        LazadaOAuthStateRecorder.OAuthState oauthState = stateRecorder.consume(sha256(state), Instant.now());
        if (oauthState == null) throw invalidState();

        if (!constantTimeEquals(oauthState.redirectUri(), properties.getRedirectUri())) {
            return frontendRedirect("error", "LAZADA_NOT_CONFIGURED", null);
        }
        if (oauthError != null && !oauthError.isBlank()) {
            return frontendRedirect("error", "LAZADA_OAUTH_DENIED", null);
        }
        if (!properties.isEnabled() || !properties.isConfigured()) {
            return frontendRedirect("error", "LAZADA_NOT_CONFIGURED", null);
        }
        if (code == null || code.isBlank() || code.length() > 4_096) {
            return frontendRedirect("error", "LAZADA_TOKEN_EXCHANGE_FAILED", null);
        }

        try {
            JsonNode response = client.exchangeCode(code);
            Instant now = Instant.now();
            LazadaConnectionRecorder.TokenSet tokenSet = LazadaTokenPayloadParser.parse(
                    response, properties.getCountry(), null, null, now);
            Long channelId = connectionRecorder.saveAuthorization(
                    tokenSet,
                    cipher.encrypt(tokenSet.accessToken()),
                    cipher.encrypt(tokenSet.refreshToken()),
                    properties.getTokenKeyId(),
                    properties.getEnvironment(),
                    now);
            return frontendRedirect("success", null, channelId);
        } catch (LazadaApiException | IllegalArgumentException | IllegalStateException ex) {
            return frontendRedirect("error", "LAZADA_TOKEN_EXCHANGE_FAILED", null);
        }
    }

    public LazadaVerifyResponse verify(Long channelId) {
        Channel channel = requireLazadaChannel(channelId);
        requireConfigured();
        if (!properties.environmentAllowed(channel.getEnvironment())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED,
                    "Môi trường của kênh Lazada chưa được cho phép trong cấu hình.");
        }

        String accessToken;
        try {
            accessToken = tokenProvider.getValidAccessToken(channelId);
        } catch (ApiException ex) {
            if (ErrorCode.LAZADA_TOKEN_REFRESH_IN_PROGRESS.equals(ex.getErrorCode())) throw ex;
            recordFailure(channelId, ex.getErrorCode().getCode());
            throw ex;
        }

        try {
            JsonNode products = client.readProducts(accessToken);
            requireReadPayload(products);
        } catch (LazadaApiException ex) {
            ApiException apiException = toApiException(ex);
            recordFailure(channelId, apiException.getErrorCode().getCode());
            throw apiException;
        } catch (IllegalArgumentException ex) {
            ApiException apiException = new ApiException(HttpStatus.BAD_GATEWAY,
                    ErrorCode.LAZADA_PROTOCOL_ERROR, "Lazada trả dữ liệu xác minh không hợp lệ.");
            recordFailure(channelId, apiException.getErrorCode().getCode());
            throw apiException;
        }

        boolean ordersRead = false;
        String ordersReadError = null;
        try {
            JsonNode orders = client.readRecentOrders(accessToken, Instant.now());
            requireReadPayload(orders);
            ordersRead = true;
        } catch (LazadaApiException ex) {
            if (ex.getKind() == LazadaApiException.Kind.AUTHENTICATION) {
                ApiException apiException = toApiException(ex);
                recordFailure(channelId, apiException.getErrorCode().getCode());
                throw apiException;
            }
            ordersReadError = ErrorCode.LAZADA_ORDERS_READ_UNAVAILABLE.getCode();
        } catch (IllegalArgumentException ignored) {
            // Product access proves the connection. Missing Order API access remains an explicit false capability.
            ordersReadError = ErrorCode.LAZADA_ORDERS_READ_UNAVAILABLE.getCode();
        }

        connectionRecorder.markVerified(channelId, ordersRead, ordersReadError, Instant.now());
        return new LazadaVerifyResponse("connected",
                ordersRead ? null : ErrorCode.LAZADA_ORDERS_READ_UNAVAILABLE.getCode());
    }

    public LazadaVerifyResponse disconnect(Long channelId) {
        requireLazadaChannel(channelId);
        connectionRecorder.disconnect(channelId, Instant.now());
        return new LazadaVerifyResponse("disconnected", null);
    }

    private void requireConfigured() {
        if (!properties.isEnabled() || !properties.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.LAZADA_NOT_CONFIGURED,
                    "Lazada connector đang tắt hoặc chưa được cấu hình đầy đủ.");
        }
    }

    private Channel requireLazadaChannel(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
        if (!"lazada".equalsIgnoreCase(channel.getCode())) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Kênh #" + channelId + " không phải là Lazada.");
        }
        return channel;
    }

    private void requireReadPayload(JsonNode response) {
        if (response == null || !"0".equals(response.path("code").asText())
                || !response.has("data") || response.path("data").isNull()) {
            throw new IllegalArgumentException("Lazada read response is incomplete.");
        }
    }

    private void recordFailure(Long channelId, String errorCode) {
        boolean reauthorizationRequired = ErrorCode.LAZADA_AUTH_FAILED.getCode().equals(errorCode)
                || ErrorCode.LAZADA_FORBIDDEN.getCode().equals(errorCode);
        String status = reauthorizationRequired ? "reauthorization_required" : "error";
        String safeMessage = reauthorizationRequired
                ? "Lazada requires seller reauthorization."
                : "Lazada connection verification failed.";
        connectionRecorder.markFailure(channelId, status, errorCode, safeMessage, Instant.now());
    }

    private ApiException toApiException(LazadaApiException ex) {
        return switch (ex.getKind()) {
            case AUTHENTICATION -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_AUTH_FAILED,
                    "Lazada từ chối quyền truy cập; cần ủy quyền lại.");
            case FORBIDDEN -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_FORBIDDEN,
                    "Ứng dụng chưa được cấp quyền đọc dữ liệu Lazada.");
            case RATE_LIMITED -> new ApiException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.LAZADA_RATE_LIMITED,
                    "Lazada đang giới hạn yêu cầu; hãy thử lại sau.");
            case TIMEOUT -> new ApiException(HttpStatus.GATEWAY_TIMEOUT, ErrorCode.LAZADA_UPSTREAM_ERROR,
                    "Lazada không phản hồi kịp thời.");
            case UPSTREAM -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_UPSTREAM_ERROR,
                    "Lazada không thể xác minh kết nối.");
            case PROTOCOL -> new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.LAZADA_PROTOCOL_ERROR,
                    "Lazada trả dữ liệu xác minh không hợp lệ.");
        };
    }

    private ApiException invalidState() {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.LAZADA_OAUTH_STATE_INVALID,
                "Trạng thái ủy quyền Lazada không hợp lệ hoặc đã hết hạn.");
    }

    private URI frontendRedirect(String result, String reason, Long channelId) {
        String path = properties.getFrontendChannelsPath();
        if (path == null || !path.startsWith("/") || path.startsWith("//")
                || path.contains("?") || path.contains("#") || path.contains("..")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.LAZADA_NOT_CONFIGURED,
                    "Địa chỉ callback frontend chưa được cấu hình an toàn.");
        }
        StringBuilder target = new StringBuilder(properties.getFrontendBaseUrl().replaceAll("/+$", ""))
                .append(path).append("?lazada_oauth=").append(encode(result));
        if (channelId != null) target.append("&channel_id=").append(channelId);
        if (reason != null) target.append("&reason=").append(encode(reason));
        try {
            return URI.create(target.toString());
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.LAZADA_NOT_CONFIGURED,
                    "Địa chỉ callback frontend chưa được cấu hình hợp lệ.");
        }
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable.", ex);
        }
    }

    private boolean constantTimeEquals(String left, String right) {
        if (left == null || right == null) return false;
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
