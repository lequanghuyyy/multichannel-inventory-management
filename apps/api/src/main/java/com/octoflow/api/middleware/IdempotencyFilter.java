package com.octoflow.api.middleware;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.regex.Pattern;

/**
 * Filter that captures and validates Idempotency-Key headers on state-mutating requests (POST, PUT, PATCH).
 */
@Component
public class IdempotencyFilter extends OncePerRequestFilter {

    public static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    public static final String IDEMPOTENCY_KEY_ATTR = "idempotencyKey";
    private static final Pattern VALID_KEY = Pattern.compile("[A-Za-z0-9._:-]{1,128}");

    private final ObjectMapper objectMapper;

    public IdempotencyFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String method = request.getMethod();
        if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method) || "PATCH".equalsIgnoreCase(method)) {
            String idempotencyKey = request.getHeader(IDEMPOTENCY_KEY_HEADER);
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                Enumeration<String> values = request.getHeaders(IDEMPOTENCY_KEY_HEADER);
                if (Collections.list(values).size() != 1 || !VALID_KEY.matcher(idempotencyKey.trim()).matches()) {
                    response.setStatus(HttpStatus.BAD_REQUEST.value());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.setCharacterEncoding("UTF-8");
                    objectMapper.writeValue(response.getOutputStream(), ErrorResponse.of(
                            ErrorCode.IDEMPOTENCY_KEY_INVALID.getCode(),
                            "Idempotency-Key phải là một giá trị duy nhất gồm 1 đến 128 chữ cái, số, dấu chấm, gạch ngang, gạch dưới hoặc hai chấm.",
                            (String) request.getAttribute(RequestIdFilter.REQUEST_ID_ATTR)));
                    return;
                }
                request.setAttribute(IDEMPOTENCY_KEY_ATTR, idempotencyKey.trim());
            }
        }
        filterChain.doFilter(request, response);
    }
}
