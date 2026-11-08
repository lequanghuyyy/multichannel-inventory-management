package com.octoflow.api.middleware;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Filter that captures and validates Idempotency-Key headers on state-mutating requests (POST, PUT, PATCH).
 */
@Component
public class IdempotencyFilter extends OncePerRequestFilter {

    public static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    public static final String IDEMPOTENCY_KEY_ATTR = "idempotencyKey";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String method = request.getMethod();
        if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method) || "PATCH".equalsIgnoreCase(method)) {
            String idempotencyKey = request.getHeader(IDEMPOTENCY_KEY_HEADER);
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                request.setAttribute(IDEMPOTENCY_KEY_ATTR, idempotencyKey.trim());
            }
        }
        filterChain.doFilter(request, response);
    }
}
