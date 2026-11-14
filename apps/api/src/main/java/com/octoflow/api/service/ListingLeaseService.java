package com.octoflow.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Serializes remote writes for the same channel listing across threads and application
 * instances. A session-level PostgreSQL advisory lock is held on a dedicated connection while
 * the adapter runs, so no database transaction is open during remote I/O. PostgreSQL releases
 * the lock automatically if the process dies or the connection drops.
 */
@Service
public class ListingLeaseService {

    private static final Logger log = LoggerFactory.getLogger(ListingLeaseService.class);
    private static final long ADVISORY_NAMESPACE = 0x4F43544FL;

    private final DataSource dataSource;

    public ListingLeaseService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public boolean tryWithLock(long listingId, Supplier<Boolean> work) {
        long key = (ADVISORY_NAMESPACE << 32) | (listingId & 0xFFFFFFFFL);
        try (Connection connection = dataSource.getConnection()) {
            boolean originalAutoCommit = connection.getAutoCommit();
            connection.setAutoCommit(true);
            try {
                if (!tryLock(connection, key)) {
                    return false;
                }
                try {
                    return Boolean.TRUE.equals(work.get());
                } finally {
                    unlock(connection, key);
                }
            } finally {
                connection.setAutoCommit(originalAutoCommit);
            }
        } catch (SQLException ex) {
            throw new IllegalStateException("Unable to acquire listing advisory lock for listing #" + listingId, ex);
        }
    }

    /**
     * Runs work while holding the advisory lock. Returns empty when another worker owns the
     * listing, without running the supplier.
     */
    public <T> Optional<T> tryCallWithLock(long listingId, Supplier<T> work) {
        AtomicReference<T> result = new AtomicReference<>();
        boolean acquired = tryWithLock(listingId, () -> {
            result.set(work.get());
            return true;
        });
        return acquired ? Optional.ofNullable(result.get()) : Optional.empty();
    }

    private boolean tryLock(Connection connection, long key) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_try_advisory_lock(?)")) {
            statement.setLong(1, key);
            try (ResultSet resultSet = statement.executeQuery()) {
                return resultSet.next() && resultSet.getBoolean(1);
            }
        }
    }

    private void unlock(Connection connection, long key) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_advisory_unlock(?)")) {
            statement.setLong(1, key);
            statement.execute();
        } catch (SQLException ex) {
            // Closing the connection also releases a session lock; log rather than mask the work result.
            log.warn("Failed to release listing advisory lock {}: {}", key, ex.getMessage());
        }
    }
}
