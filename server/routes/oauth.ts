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

function popupPage(data: Record<string, unknown>): string {
  const payload = JSON.stringify(data);
  return `<!DOCTYPE html><html><head><title>Connecting…</title></head><body><script>
if(window.opener){window.opener.postMessage(${payload},window.location.origin);}
window.close();
</script></body></html>`;
}

export function registerOAuthRoutes(app: Express): void {
  /**
   * GET /api/oauth/google/callback
   * Google redirects here after the user grants (or denies) consent.
   * Returns a self-closing HTML page that sends postMessage to the opener
   * popup and closes itself — the main window never navigates.
   */
  app.get("/api/oauth/google/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error || !code || !state) {
      logger.warn("google-oauth: denied or missing params", { error });
      return res.send(popupPage({ type: "ga4_oauth_error", error: "denied" }));
    }

    const parsed = parseOAuthState(state);
    if (!parsed) {
      logger.warn("google-oauth: invalid state parameter");
      return res.send(popupPage({ type: "ga4_oauth_error", error: "invalid_state" }));
    }

    const { clientId } = parsed;

    try {
      const tokens = await exchangeCode(code);

      const existing = (await integrationStore.listByClient(clientId)).find(
        (i) => i.kind === "ga4"
      );

      if (existing) {
        await integrationStore.updateStatus(existing.id, "active", {
          lastSyncedAt: Date.now(),
          lastError: null,
        });
        await integrationStore.updateConfig(existing.id, {
          ...(existing.config as Record<string, unknown>),
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          tokenExpiry: tokens.tokenExpiry,
          connectedEmail: tokens.connectedEmail,
        });
      } else {
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

      logger.info("google-oauth: connected", { clientId, email: tokens.connectedEmail });
      return res.send(popupPage({ type: "ga4_oauth_success", clientId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("google-oauth: token exchange failed", { clientId, error: msg });
      return res.send(popupPage({ type: "ga4_oauth_error", error: msg }));
    }
  });
}
