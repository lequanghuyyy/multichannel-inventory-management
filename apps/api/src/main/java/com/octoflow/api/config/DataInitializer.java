package com.octoflow.api.config;

import com.octoflow.api.entity.*;
import com.octoflow.api.repository.*;
import com.octoflow.api.service.InventoryMovementRecorder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

@Configuration
@Profile("dev")
public class DataInitializer {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    @Bean
    public CommandLineRunner initDatabase(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            ProductRepository productRepository,
            ProductVariantRepository variantRepository,
            InventoryBalanceRepository balanceRepository,
            ChannelRepository channelRepository,
            InventoryMovementRecorder movementRecorder,
            TransactionTemplate transactionTemplate,
            @Value("${app.dev-seed.admin-password}") String adminPassword,
            @Value("${app.dev-seed.staff-password}") String staffPassword) {
        return args -> transactionTemplate.executeWithoutResult(status -> {
            if (userRepository.count() == 0) {
                log.info("Khởi tạo tài khoản quản trị development...");

                User admin = new User();
                admin.setUsername("admin");
                admin.setEmail("admin@octoflow.dev");
                admin.setPasswordHash(passwordEncoder.encode(adminPassword));
                admin.setRole(User.Role.ADMIN);
                admin.setActive(true);
                userRepository.save(admin);

                User staff = new User();
                staff.setUsername("staff");
                staff.setEmail("staff@octoflow.dev");
                staff.setPasswordHash(passwordEncoder.encode(staffPassword));
                staff.setRole(User.Role.STAFF);
                staff.setActive(true);
                userRepository.save(staff);

                log.info("Đã tạo tài khoản admin và staff cho development profile.");
            }

            if (channelRepository.count() == 0) {
                log.info("Khởi tạo cấu hình kênh bán hàng mặc định...");

                Channel shopify = new Channel();
                shopify.setCode("shopify");
                shopify.setName("Shopify Store");
                shopify.setEnvironment("sandbox");
                shopify.setStatus(Channel.Status.DISCONNECTED);

                Channel woo = new Channel();
                woo.setCode("woocommerce");
                woo.setName("WooCommerce Main");
                woo.setEnvironment("sandbox");
                woo.setStatus(Channel.Status.DISCONNECTED);

                Channel ebay = new Channel();
                ebay.setCode("ebay");
                ebay.setName("eBay Sandbox");
                ebay.setEnvironment("sandbox");
                ebay.setStatus(Channel.Status.DISCONNECTED);

                channelRepository.saveAll(List.of(shopify, woo, ebay));
            }

            if (productRepository.count() == 0) {
                log.info("Khởi tạo danh mục sản phẩm mẫu và số dư kho ban đầu...");

                Product p1 = new Product();
                p1.setName("Giày Chạy Bộ OctoFlow Pro");
                p1.setDescription("Giày chạy bộ chuyên nghiệp, siêu nhẹ và êm ái");
                p1.setCategory("FOOTWEAR");
                p1.setStatus(Product.Status.PUBLISHED);
                Product savedP1 = productRepository.save(p1);

                ProductVariant v1 = new ProductVariant();
                v1.setProduct(savedP1);
                v1.setSku("SHOE-001-BLK-42");
                v1.setTitle("Màu Đen - Size 42");
                v1.setPrice(1_250_000L);
                v1.setCurrency("VND");
                ProductVariant savedV1 = variantRepository.save(v1);

                InventoryBalance b1 = new InventoryBalance();
                b1.setVariantId(savedV1.getId());
                b1.setOnHand(50);
                b1.setReserved(0);
                b1.setSafetyBuffer(5);
                balanceRepository.save(b1);
                movementRecorder.record(savedV1.getId(), new InventoryMovementRecorder.Snapshot(
                                0, 0, 0, 0, 0L), b1, "OPENING_BALANCE",
                        "Development sample opening stock", "dev-seed:" + savedV1.getSku());

                ProductVariant v2 = new ProductVariant();
                v2.setProduct(savedP1);
                v2.setSku("SHOE-001-WHT-41");
                v2.setTitle("Màu Trắng - Size 41");
                v2.setPrice(1_250_000L);
                v2.setCurrency("VND");
                ProductVariant savedV2 = variantRepository.save(v2);

                InventoryBalance b2 = new InventoryBalance();
                b2.setVariantId(savedV2.getId());
                b2.setOnHand(30);
                b2.setReserved(0);
                b2.setSafetyBuffer(3);
                balanceRepository.save(b2);
                movementRecorder.record(savedV2.getId(), new InventoryMovementRecorder.Snapshot(
                                0, 0, 0, 0, 0L), b2, "OPENING_BALANCE",
                        "Development sample opening stock", "dev-seed:" + savedV2.getSku());

                log.info("Đã tạo sản phẩm và số dư tồn kho ban đầu thành công!");
            }
        });
    }
}
