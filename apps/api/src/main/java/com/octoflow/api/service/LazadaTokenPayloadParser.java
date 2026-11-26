package com.octoflow.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.octoflow.api.service.LazadaConnectionRecorder.TokenSet;

import java.time.Instant;
import java.util.Iterator;
import java.util.Locale;

final class LazadaTokenPayloadParser {

    private LazadaTokenPayloadParser() {}

    static TokenSet parse(JsonNode response, String requiredCountry, String existingSellerId,
                          String existingCountry, Instant now) {
        if (response == null || !"0".equals(response.path("code").asText())) {
            throw new IllegalArgumentException("Lazada token response is invalid.");
        }

        String accessToken = text(response, "access_token");
        String refreshToken = text(response, "refresh_token");
        long accessSeconds = seconds(response.path("expires_in"), false);
        long refreshSeconds = seconds(response.path("refresh_expires_in"), true);
        if (accessToken == null || refreshToken == null || accessSeconds <= 0 || refreshSeconds < 0) {
            throw new IllegalArgumentException("Lazada token response is incomplete.");
        }

        SellerCountry sellerCountry = sellerCountry(response, requiredCountry);
        String country = sellerCountry.country();
        String sellerId = sellerCountry.sellerId();
        if (existingCountry != null) {
            if (country != null && !existingCountry.equalsIgnoreCase(country)) {
                throw new IllegalArgumentException("Lazada token country changed.");
            }
            country = existingCountry;
        }
        if (country == null && text(response, "country") != null) {
            country = text(response, "country").toUpperCase(Locale.ROOT);
        }
        if (sellerId == null) sellerId = text(response, "seller_id");
        if (sellerId == null) sellerId = existingSellerId;
        if (country == null || sellerId == null || !requiredCountry.equalsIgnoreCase(country)) {
            throw new IllegalArgumentException("Lazada token seller identity is incomplete.");
        }

        return new TokenSet(accessToken, refreshToken, sellerId, country.toUpperCase(Locale.ROOT),
                now.plusSeconds(accessSeconds), now.plusSeconds(refreshSeconds));
    }

    private static SellerCountry sellerCountry(JsonNode response, String requiredCountry) {
        JsonNode values = response.path("country_user_info");
        if (values.isMissingNode() || values.isNull()) values = response.path("country_user_info_list");
        if (values.isArray()) {
            Iterator<JsonNode> iterator = values.elements();
            while (iterator.hasNext()) {
                JsonNode item = iterator.next();
                String country = text(item, "country");
                if (country != null && requiredCountry.equalsIgnoreCase(country)) {
                    return new SellerCountry(country.toUpperCase(Locale.ROOT), text(item, "seller_id"));
                }
            }
        } else if (values.isObject()) {
            String country = text(values, "country");
            if (country != null && requiredCountry.equalsIgnoreCase(country)) {
                return new SellerCountry(country.toUpperCase(Locale.ROOT), text(values, "seller_id"));
            }
        }
        String rootCountry = text(response, "country");
        if (rootCountry != null && requiredCountry.equalsIgnoreCase(rootCountry)) {
            return new SellerCountry(rootCountry.toUpperCase(Locale.ROOT), text(response, "seller_id"));
        }
        return new SellerCountry(null, null);
    }

    private static long seconds(JsonNode node, boolean allowZero) {
        if (node == null || node.isMissingNode() || node.isNull()) return -1;
        try {
            long value = Long.parseLong(node.asText());
            return value >= (allowZero ? 0 : 1) && value <= 315_360_000L ? value : -1;
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    private static String text(JsonNode object, String field) {
        JsonNode value = object.path(field);
        if (value.isMissingNode() || value.isNull()) return null;
        String text = value.asText();
        return text == null || text.isBlank() ? null : text;
    }

    private record SellerCountry(String country, String sellerId) {}
}
