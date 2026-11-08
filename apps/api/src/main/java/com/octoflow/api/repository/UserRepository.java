package com.octoflow.api.repository;

import com.octoflow.api.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    default Optional<User> findByUsernameOrEmail(String identifier) {
        Optional<User> byUser = findByUsername(identifier);
        return byUser.isPresent() ? byUser : findByEmail(identifier);
    }

    boolean existsByUsername(String username);
}
