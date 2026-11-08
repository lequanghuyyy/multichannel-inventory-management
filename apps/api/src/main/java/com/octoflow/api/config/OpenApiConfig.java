package com.octoflow.api.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI octoflowOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("OctoFlow API")
                        .description("Central Multi-channel Inventory, Catalog, Order & Sync Engine")
                        .version("1.0.0")
                        .contact(new Contact().name("OctoFlow Team"))
                        .license(new License().name("Proprietary")))
                .servers(List.of(
                        new Server().url("/").description("Default Server")
                ));
    }
}
