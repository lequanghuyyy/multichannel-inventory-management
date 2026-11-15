package com.octoflow.api.controller;

import com.octoflow.api.dto.request.LoginRequest;
import com.octoflow.api.dto.response.ApiResponse;
import com.octoflow.api.dto.response.AuthUserResponse;
import com.octoflow.api.dto.response.LoginResponse;
import com.octoflow.api.dto.response.SessionResponse;
import com.octoflow.api.entity.User;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "User session and credentials lifecycle")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;

    public AuthController(AuthenticationManager authenticationManager, UserRepository userRepository) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    @Operation(summary = "Web session login with CSRF token issuance")
    public ResponseEntity<LoginResponse> login(
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

        CsrfToken csrfToken = (CsrfToken) httpRequest.getAttribute(CsrfToken.class.getName());
        String tokenVal = csrfToken != null ? csrfToken.getToken() : "";

        User user = userRepository.findByUsernameOrEmail(auth.getName()).orElse(null);
        String userId = user != null ? String.valueOf(user.getId()) : "0";
        String email = user != null && user.getEmail() != null ? user.getEmail() : auth.getName();
        AuthUserResponse userResponse = new AuthUserResponse(userId, auth.getName(), email, role);

        return ResponseEntity.ok(new LoginResponse(true, tokenVal, userResponse));
    }

    @PostMapping("/mobile/login")
    @Operation(summary = "Mobile bearer session login (unsupported)")
    public ResponseEntity<Void> mobileLogin(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        throw new ApiException(HttpStatus.NOT_IMPLEMENTED, ErrorCode.UNAUTHORIZED,
                "Xác thực di động (bearer token) chưa được hỗ trợ. Vui lòng sử dụng web session.");
    }

    @GetMapping("/session")
    @Operation(summary = "Get current authenticated session info")
    public ResponseEntity<SessionResponse> getSession(Authentication auth, HttpServletRequest httpRequest) {
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED,
                    "Yêu cầu đăng nhập để thực hiện.");
        }

        String role = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse("ROLE_STAFF")
                .replace("ROLE_", "");

        CsrfToken csrfToken = (CsrfToken) httpRequest.getAttribute(CsrfToken.class.getName());
        String tokenVal = csrfToken != null ? csrfToken.getToken() : "";

        User user = userRepository.findByUsernameOrEmail(auth.getName()).orElse(null);
        String userId = user != null ? String.valueOf(user.getId()) : "0";
        String email = user != null && user.getEmail() != null ? user.getEmail() : auth.getName();
        AuthUserResponse userResponse = new AuthUserResponse(userId, auth.getName(), email, role);

        return ResponseEntity.ok(new SessionResponse(true, tokenVal, userResponse));
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
