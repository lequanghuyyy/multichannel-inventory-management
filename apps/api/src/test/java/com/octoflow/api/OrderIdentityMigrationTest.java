package com.octoflow.api;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises V4 against a database that already contains V3-era rows. A fresh-schema migration
 * cannot prove that legacy order identities are handled safely, so this test upgrades two
 * separate schemas and checks both the successful and the aborting path.
 */
@Testcontainers
class OrderIdentityMigrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Test
    void v4PreservesLegacyRowsAndAbortsOnDuplicateLegacyIdentity() throws Exception {
        createSchema("legacy_ok");
        createSchema("legacy_duplicate");

        migrateToV3("legacy_ok");
        execute("legacy_ok", """
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, external_order_id)
                VALUES
                    ('LEGACY-POS', 'POS', 'PLACED', 'PENDING', 0, 'VND', 'forged-pos-id'),
                    ('LEGACY-SHOPIFY', 'SHOPIFY', 'PLACED', 'PENDING', 0, 'vnd', '  shopify-1  ')
                """);

        migrateLatest("legacy_ok");

        assertNull(queryString("legacy_ok",
                "SELECT external_order_id FROM orders WHERE order_number = 'LEGACY-POS'"));
        assertEquals("shopify-1", queryString("legacy_ok",
                "SELECT external_order_id FROM orders WHERE order_number = 'LEGACY-SHOPIFY'"));
        assertEquals("VND", queryString("legacy_ok",
                "SELECT currency FROM orders WHERE order_number = 'LEGACY-SHOPIFY'"));
        assertEquals(1, queryInt("legacy_ok", """
                SELECT COUNT(*) FROM pg_indexes
                WHERE schemaname = 'legacy_ok' AND indexname = 'uq_orders_channel_external_order'
                """));
        assertEquals(1, queryInt("legacy_ok", """
                SELECT COUNT(*) FROM pg_indexes
                WHERE schemaname = 'legacy_ok' AND indexname = 'uq_orders_legacy_external_order'
                """));

        migrateToV3("legacy_duplicate");
        execute("legacy_duplicate", """
                INSERT INTO orders
                    (order_number, source, status, payment_status, total_amount, currency, external_order_id)
                VALUES
                    ('DUP-1', 'SHOPIFY', 'PLACED', 'PENDING', 0, 'VND', 'same-external-id'),
                    ('DUP-2', 'SHOPIFY', 'PLACED', 'PENDING', 0, 'VND', 'same-external-id')
                """);

        FlywayException failure = assertThrows(FlywayException.class,
                () -> migrateLatest("legacy_duplicate"));
        assertTrue(exceptionChain(failure).contains("duplicate legacy"),
                () -> "Expected duplicate legacy identity failure, got: " + exceptionChain(failure));
    }

    private void createSchema(String schema) throws Exception {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
        }
    }

    private void migrateToV3(String schema) {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("3"))
                .load()
                .migrate();
    }

    private void migrateLatest(String schema) {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema)
                .defaultSchema(schema)
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    private void execute(String schema, String sql) throws Exception {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute("SET search_path TO " + schema);
            statement.execute(sql);
        }
    }

    private String queryString(String schema, String sql) throws Exception {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute("SET search_path TO " + schema);
            try (ResultSet resultSet = statement.executeQuery(sql)) {
                assertTrue(resultSet.next(), "Expected a row for query: " + sql);
                return resultSet.getString(1);
            }
        }
    }

    private int queryInt(String schema, String sql) throws Exception {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute("SET search_path TO " + schema);
            try (ResultSet resultSet = statement.executeQuery(sql)) {
                assertTrue(resultSet.next(), "Expected a row for query: " + sql);
                return resultSet.getInt(1);
            }
        }
    }

    private Connection connect() throws Exception {
        return DriverManager.getConnection(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }

    private String exceptionChain(Throwable throwable) {
        StringBuilder message = new StringBuilder();
        Throwable current = throwable;
        while (current != null) {
            if (current.getMessage() != null) {
                message.append(current.getMessage()).append(' ');
            }
            current = current.getCause();
        }
        return message.toString();
    }
}
