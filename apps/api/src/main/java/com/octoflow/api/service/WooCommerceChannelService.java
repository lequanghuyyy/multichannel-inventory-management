package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.WooCommerceApiClient;
import com.octoflow.api.adapter.WooCommerceReason;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Channel-scoped WooCommerce connection operations.
 *
 * A channel becomes CONNECTED only after a live API check proves the backend can read products.
 * That check does not imply inventory write permission: writes stay unavailable unless the
 * dedicated inventory write flag is on.
 */
@Service
public class WooCommerceChannelService {

    private final ChannelRepository channelRepository;
    private final WooCommerceProperties properties;
    private final WooCommerceApiClient client;
    private final WooCommerceConnectionRecorder recorder;

    public WooCommerceChannelService(ChannelRepository channelRepository,
                                     WooCommerceProperties properties,
                                     WooCommerceApiClient client,
                                     WooCommerceConnectionRecorder recorder) {
        this.channelRepository = channelRepository;
        this.properties = properties;
        this.client = client;
        this.recorder = recorder;
    }

    @Transactional(readOnly = true)
    public WooCommerceChannelStatusResponse status(Long channelId) {
        requireWooChannel(channelId);
        return recorder.status(channelId);
    }

    /**
     * No transaction is open here: the remote check happens between two short repository calls.
     */
    public WooCommerceChannelStatusResponse verify(Long channelId) {
        Channel channel = requireWooChannel(channelId);
        if (!properties.isEnabled()) {
            recorder.applyFailure(channelId, WooCommerceReason.DISABLED,
                    "WooCommerce connector is disabled.");
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "WooCommerce connector đang tắt ở backend.");
        }
        if (!properties.credentialsConfigured()) {
            recorder.applyFailure(channelId, WooCommerceReason.NOT_CONFIGURED,
                    "WooCommerce credentials are not configured.");
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Chưa cấu hình thông tin xác thực WooCommerce ở backend.");
        }
        String urlIssue = properties.urlIssue();
        if (urlIssue != null) {
            recorder.applyFailure(channelId, urlIssue, "WooCommerce base URL is not allowed.");
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    WooCommerceReason.HTTP_TRUSTED_HOST_REQUIRED.equals(urlIssue)
                            ? "WooCommerce chỉ được dùng HTTP cho host phát triển đã được tin cậy."
                            : "WooCommerce base URL không hợp lệ.");
        }
        if (!properties.environmentAllowed(channel)) {
            recorder.applyFailure(channelId, WooCommerceReason.ENVIRONMENT_BLOCKED,
                    "WooCommerce verification is limited to development/test channels.");
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED,
                    "Phase 06 chỉ cho phép kênh WooCommerce ở môi trường development/test.");
        }

        try {
            WooCommerceApiClient.ConnectionSnapshot snapshot = client.inspectConnection();
            return recorder.applyVerified(channelId, snapshot);
        } catch (ChannelAdapterException ex) {
            recorder.applyFailure(channelId, ex.reasonCodeOrKind(), ex.getMessage());
            throw toApiException(ex, "Không thể xác minh kết nối WooCommerce");
        }
    }

    public WooCommerceChannelStatusResponse disconnect(Long channelId) {
        requireWooChannel(channelId);
        return recorder.disconnect(channelId);
    }

    private Channel requireWooChannel(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
        if (!"woocommerce".equalsIgnoreCase(channel.getCode())) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Kênh #" + channelId + " không phải là WooCommerce.");
        }
        return channel;
    }

    private ApiException toApiException(ChannelAdapterException ex, String prefix) {
        HttpStatus status = switch (ex.getKind()) {
            case TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
            case UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_GATEWAY;
        };
        String message = prefix + " (" + ex.reasonCodeOrKind() + "): " + ex.getMessage();
        return new ApiException(status, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE, message);
    }
}
