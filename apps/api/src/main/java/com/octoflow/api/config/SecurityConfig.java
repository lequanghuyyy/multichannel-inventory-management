package com.octoflow.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfigurationSource;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final CorsConfigurationSource corsConfigurationSource;
    private final JsonSecurityErrorHandler securityErrorHandler;
    private final boolean cookieSecure;

    public SecurityConfig(CorsConfigurationSource corsConfigurationSource,
                          JsonSecurityErrorHandler securityErrorHandler,
                          @Value("${app.security.cookie-secure:true}") boolean cookieSecure) {
        this.corsConfigurationSource = corsConfigurationSource;
        this.securityErrorHandler = securityErrorHandler;
        this.cookieSecure = cookieSecure;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration) throws Exception {
        return authenticationConfiguration.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        CookieCsrfTokenRepository tokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        tokenRepository.setCookieCustomizer(cookie -> cookie.path("/").secure(cookieSecure).sameSite("Lax"));
        tokenRepository.setHeaderName("X-CSRF-Token");

        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(csrf -> csrf
                .csrfTokenRepository(tokenRepository)
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                .ignoringRequestMatchers(
                    "/api/v1/auth/login",
                    "/api/v1/auth/mobile/login",
                    "/health/**",
                    "/actuator/**"
                )
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(securityErrorHandler)
                .accessDeniedHandler(securityErrorHandler)
            )
            .authorizeHttpRequests(auth -> auth
                // Public / Health / Swagger / System
                .requestMatchers("/health/**", "/actuator/**", "/api/v1/openapi.json", "/api/v1/system", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/api/v1/auth/login", "/api/v1/auth/mobile/login").permitAll()
                // OAuth callback is public by protocol; LazadaConnectionService enforces one-time state.
                .requestMatchers(HttpMethod.GET, "/api/v1/integrations/lazada/callback").permitAll()
                // Admin-only operations
                .requestMatchers(HttpMethod.POST, "/api/v1/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/v1/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/products/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/inventory/adjust/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/inventory/allocations/*/execute").hasRole("ADMIN")
                .requestMatchers("/api/v1/channels/simulator/**", "/api/v1/dev/**").hasRole("ADMIN")

                // Staff or Admin operations
                .requestMatchers("/api/v1/**").hasAnyRole("ADMIN", "STAFF")

                .anyRequest().authenticated()
            );

        return http.build();
    }
}
