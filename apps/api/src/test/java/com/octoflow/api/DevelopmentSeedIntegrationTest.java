package com.octoflow.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "app.sync.workers-enabled=false")
@ActiveProfiles("dev")
@Testcontainers
class DevelopmentSeedIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.baseline-on-migrate", () -> false);
    }

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void developmentProfileSeedsUsersAndRecordsOpeningStockWithinItsTransaction() {
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM products", Integer.class));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM inventory_balances WHERE on_hand > 0", Integer.class));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE operation = 'OPENING_BALANCE'", Integer.class));
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE event_type = 'INVENTORY_CHANGED'", Integer.class));
    }
}
