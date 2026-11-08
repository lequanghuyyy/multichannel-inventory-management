package com.octoflow.api.controller;

import com.octoflow.api.dto.request.LoginRequest;
import com.octoflow.api.dto.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "User session and credentials lifecycle")
public class AuthController {

    private final AuthenticationManager authenticationManager;

    public AuthController(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/login")
    @Operation(summary = "Web session login with CSRF token issuance")
    public ResponseEntity<Map<String, Object>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        String principal = request.getPrincipal();
        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(principal, request.password())
        );

        HttpSession session = httpRequest.getSession(true);
        // Authentication is performed manually, so explicitly rotate the pre-authentication ID.
        httpRequest.changeSessionId();

        SecurityContext sc = SecurityContextHolder.createEmptyContext();
        sc.setAuthentication(auth);
        SecurityContextHolder.setContext(sc);

        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, sc);

        String role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse("ROLE_STAFF")
                .replace("ROLE_", "");

        org.springframework.security.web.csrf.CsrfToken csrfToken =
                (org.springframework.security.web.csrf.CsrfToken) httpRequest.getAttribute(org.springframework.security.web.csrf.CsrfToken.class.getName());
        String tokenVal = csrfToken != null ? csrfToken.getToken() : "";

        return ResponseEntity.ok(Map.of(
                "success", true,
                "csrf_token", tokenVal,
                "user", Map.of(
                        "username", auth.getName(),
                        "email", auth.getName(),
                        "role", role
                )
        ));
    }

    @PostMapping("/mobile/login")
    @Operation(summary = "Mobile WebView session login")
    public ResponseEntity<Map<String, Object>> mobileLogin(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        return login(request, httpRequest);
    }

    @GetMapping("/session")
    @Operation(summary = "Get current authenticated session info")
    public ResponseEntity<Map<String, Object>> getSession(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(401).body(Map.of("authenticated", false));
        }

        String role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse("ROLE_STAFF")
                .replace("ROLE_", "");

        return ResponseEntity.ok(Map.of(
                "authenticated", true,
                "username", auth.getName(),
                "role", role
        ));
    }

    @PostMapping("/logout")
    @Operation(summary = "Invalidate active session")
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.ok(ApiResponse.ok("Đăng xuất thành công", null));
    }
}
