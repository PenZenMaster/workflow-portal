/*
 * Module/Script Name: oauth.ts
 * Path: server/routes/oauth.ts
 *
 * Description:
 * Handles Google OAuth 2.0 callback. Exchanges the authorization code for
 * tokens, upserts the GA4 integration record for the initiating client,
 * then redirects back to the integrations settings page in the SPA.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 GA4 OAuth flow
 */

import type { Express } from "express";
import { integrationStore } from "../storage";
import { exchangeCode, parseOAuthState } from "../services/ga4";
import { logger } from "../logger";

export function registerOAuthRoutes(app: Express): void {
  /**
   * GET /api/oauth/google/callback
   * Google redirects here after the user grants (or denies) consent.
   * This is a server-side route — NOT a SPA route.
   */
  app.get("/api/oauth/google/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    const baseRedirect = "/#/ai/clients";

    if (error || !code || !state) {
      logger.warn("google-oauth: denied or missing params", { error });
      return res.redirect(`${baseRedirect}?oauthError=denied`);
    }

    const parsed = parseOAuthState(state);
    if (!parsed) {
      logger.warn("google-oauth: invalid state parameter");
      return res.redirect(`${baseRedirect}?oauthError=invalid_state`);
    }

    const { clientId } = parsed;

    try {
      const tokens = await exchangeCode(code);

      // Find existing GA4 integration for this client, or create one.
      const existing = (await integrationStore.listByClient(clientId)).find(
        (i) => i.kind === "ga4"
      );

      if (existing) {
        // Update existing integration with new tokens (preserve propertyId).
        await integrationStore.updateStatus(existing.id, "active", {
          lastSyncedAt: Date.now(),
          lastError: null,
        });
        // Persist token fields into config via a direct update.
        const updatedConfig = {
          ...(existing.config as Record<string, unknown>),
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          tokenExpiry: tokens.tokenExpiry,
          connectedEmail: tokens.connectedEmail,
        };
        await integrationStore.updateConfig(existing.id, updatedConfig);
      } else {
        // Create a new integration with tokens; propertyId set later by the user.
        await integrationStore.create(clientId, {
          kind: "ga4",
          config: {
            propertyId: "",
            refreshToken: tokens.refreshToken,
            accessToken: tokens.accessToken,
            tokenExpiry: tokens.tokenExpiry,
            connectedEmail: tokens.connectedEmail,
          },
        });
      }

      logger.info("google-oauth: connected", {
        clientId,
        email: tokens.connectedEmail,
      });

      return res.redirect(
        `/#/ai/clients/${clientId}/settings/integrations?connected=1`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("google-oauth: token exchange failed", { clientId, error: msg });
      return res.redirect(
        `/#/ai/clients/${clientId}/settings/integrations?oauthError=${encodeURIComponent(msg)}`
      );
    }
  });
}
