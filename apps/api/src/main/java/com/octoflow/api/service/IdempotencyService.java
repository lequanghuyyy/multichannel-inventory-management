package com.octoflow.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.octoflow.api.entity.IdempotencyRecord;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.IdempotencyRecordRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.regex.Pattern;
import java.util.function.Supplier;

@Service
public class IdempotencyService {

    private static final Pattern VALID_KEY = Pattern.compile("[A-Za-z0-9._:-]{1,128}");

    private final IdempotencyRecordRepository repository;
    private final ObjectMapper objectMapper;
    private final ObjectMapper canonicalMapper;
    private final Duration ttl;

    public IdempotencyService(IdempotencyRecordRepository repository,
                              ObjectMapper objectMapper,
                              @Value("${app.idempotency.ttl:PT24H}") Duration ttl) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.canonicalMapper = objectMapper.copy()
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        this.ttl = ttl;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public <T> T execute(String key, String operation, Object request, Class<T> responseType, Supplier<T> command) {
        String normalizedKey = key == null ? "" : key.trim();
        if (!VALID_KEY.matcher(normalizedKey).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
                    "Cần gửi Idempotency-Key từ 1 đến 128 ký tự hợp lệ.");
        }

        String principal = currentPrincipal();
        String scope = fingerprint(principal) + ":" + operation;
        String requestHash = fingerprint(request);
        Instant claimExpiry = Instant.now().plus(ttl);
        int claimed = repository.claim(scope, normalizedKey, requestHash, claimExpiry);
        IdempotencyRecord record = repository.findForUpdate(scope, normalizedKey)
                .orElseThrow(() -> new IllegalStateException("Idempotency claim disappeared inside its transaction"));

        if (claimed == 0) {
            if (!MessageDigest.isEqual(record.getRequestHash().getBytes(), requestHash.getBytes())) {
                throw new ApiException(HttpStatus.CONFLICT, ErrorCode.IDEMPOTENCY_CONFLICT,
                        "Idempotency-Key đã được dùng với nội dung yêu cầu khác.");
            }
            if (record.getStatus() == IdempotencyRecord.Status.PROCESSING) {
                throw new ApiException(HttpStatus.CONFLICT, ErrorCode.IDEMPOTENCY_IN_PROGRESS,
                        "Yêu cầu cùng Idempotency-Key đang được xử lý; hãy thử lại bằng cùng khóa.");
            }
            if (record.getResponseBody() == null) {
                throw new IllegalStateException("Completed idempotency record has no response body");
            }
            return deserialize(record.getResponseBody(), responseType);
        }

        T result = command.get();
        try {
            record.setResponseBody(objectMapper.writeValueAsString(result));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize idempotent command response", ex);
        }
        record.setResponseStatus(HttpStatus.OK.value());
        record.setStatus(IdempotencyRecord.Status.COMPLETED);
        record.setExpiresAt(Instant.now().plus(ttl));
        repository.save(record);
        return result;
    }

    private String currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            return "system";
        }
        return authentication.getName();
    }

    private String fingerprint(Object request) {
        try {
            byte[] canonical = canonicalMapper.writeValueAsBytes(request);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical));
        } catch (JsonProcessingException | NoSuchAlgorithmException ex) {
            throw new IllegalStateException("Unable to fingerprint idempotent command", ex);
        }
    }

    private <T> T deserialize(String body, Class<T> responseType) {
        try {
            return objectMapper.readValue(body, responseType);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to replay stored idempotent response", ex);
        }
    }
}
