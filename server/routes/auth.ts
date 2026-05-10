/*
 * Module/Script Name: auth.ts
 * Path: server/routes/auth.ts
 *
 * Description:
 * Auth-related API routes: status, first-run setup, login, logout,
 * forgot/reset password, and profile update.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Carved out of server/routes.ts for Sprint 0 route/storage split
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { storage } from "../storage";
import {
  loginSchema,
  createUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "@shared/schema";
import { requireAuth, invalidateUserSessions } from "../auth";
import { sendPasswordResetEmail } from "../email";
import { logger } from "../logger";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/status", async (req, res) => {
    const userCount = await storage.countUsers();
    res.json({
      needsSetup: userCount === 0,
      authenticated: !!req.session?.user,
      user: req.session?.user ?? null,
      // Only expose config status to authenticated users.
      ...(req.session?.user && {
        config: {
          perplexityConfigured: !!process.env.PERPLEXITY_API_KEY,
          ga4KeyConfigured: !!process.env.GA4_SERVICE_ACCOUNT_KEY_PATH,
        },
      }),
    });
  });

  // First-run setup: only allowed when no users exist.
  app.post("/api/auth/setup", authLimiter, async (req, res) => {
    const userCount = await storage.countUsers();
    if (userCount > 0) {
      return res
        .status(403)
        .json({ error: "Setup already complete. Sign in instead." });
    }
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const user = await storage.createUser(
        parsed.data.username.trim(),
        parsed.data.password,
        parsed.data.email?.trim()
      );
      req.session.user = user;
      res.status(201).json({ user });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) {
        return res.status(409).json({ error: "Username already taken" });
      }
      throw err;
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Username and password required" });
    }
    const user = await storage.verifyUser(
      parsed.data.username.trim(),
      parsed.data.password
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    req.session.regenerate((err) => {
      if (err) {
        logger.error("session.regenerate failed", { error: String(err) });
        return res.status(500).json({ error: "Login failed" });
      }
      req.session.user = user;
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error("session.save failed", { error: String(saveErr) });
          return res.status(500).json({ error: "Login failed" });
        }
        res.json({ user });
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error("session.destroy failed", { error: String(err) });
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("wfp.sid");
      res.json({ ok: true });
    });
  });

  // --- Password reset -------------------------------------------------------

  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "A valid email address is required" });
    }
    const email = parsed.data.email.trim().toLowerCase();

    // Always respond generically — never confirm whether the email exists.
    const genericOk = () =>
      res.json({
        ok: true,
        message:
          "If an account exists for this email, a reset link has been sent.",
      });

    const user = await storage.getUserByEmail(email);
    if (!user) return genericOk();

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiry = Date.now() + RESET_TOKEN_TTL_MS;

    await storage.setResetToken(user.id, tokenHash, expiry);

    const baseUrl = (process.env.BASE_URL ?? "http://localhost:5000").replace(
      /\/$/,
      ""
    );
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      logger.error("forgot-password email send failed", { error: String(err) });
      await storage.clearResetToken(user.id);
      return res
        .status(500)
        .json({ error: "Failed to send reset email. Check SMTP configuration." });
    }

    return genericOk();
  });

  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(parsed.data.token)
      .digest("hex");

    const user = await storage.getUserByValidResetToken(tokenHash, Date.now());
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset link." });
    }

    const bcryptjs = await import("bcryptjs");
    const passwordHash = await bcryptjs.hash(parsed.data.password, 12);

    await storage.updatePassword(user.id, passwordHash);
    await storage.clearResetToken(user.id);
    invalidateUserSessions(user.id);

    res.json({ ok: true, message: "Password updated. Please sign in." });
  });

  // --- Profile (auth required) ---------------------------------------------

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }
    const userId = req.session.user!.id;
    try {
      await storage.setEmail(userId, parsed.data.email.trim().toLowerCase());
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) {
        return res.status(409).json({ error: "That email is already in use" });
      }
      throw err;
    }
  });
}
