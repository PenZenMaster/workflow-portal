import type { Express } from "express";
import type { Server } from "node:http";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { storage } from "./storage";
import { seedIfEmpty } from "./seed";
import {
  insertWorkflowSchema,
  loginSchema,
  createUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "@shared/schema";
import { requireAuth, invalidateUserSessions } from "./auth";
import { sendPasswordResetEmail } from "./email";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed the catalog with the user's known workflows on first run.
  seedIfEmpty();

  // --- Auth status / setup / login / logout --------------------------------

  app.get("/api/auth/status", async (req, res) => {
    const userCount = await storage.countUsers();
    res.json({
      needsSetup: userCount === 0,
      authenticated: !!req.session?.user,
      user: req.session?.user ?? null,
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
        console.error("session regenerate failed", err);
        return res.status(500).json({ error: "Login failed" });
      }
      req.session.user = user;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("session save failed", saveErr);
          return res.status(500).json({ error: "Login failed" });
        }
        res.json({ user });
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("session destroy failed", err);
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
      return res.status(400).json({ error: "A valid email address is required" });
    }
    const email = parsed.data.email.trim().toLowerCase();

    // Always respond generically — never confirm whether the email exists.
    const genericOk = () =>
      res.json({ ok: true, message: "If an account exists for this email, a reset link has been sent." });

    const user = await storage.getUserByEmail(email);
    if (!user) return genericOk();

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiry = Date.now() + RESET_TOKEN_TTL_MS;

    await storage.setResetToken(user.id, tokenHash, expiry);

    const baseUrl = (process.env.BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      console.error("[forgot-password] email send failed:", err);
      // Clear the token so a stale hash does not linger.
      await storage.clearResetToken(user.id);
      return res.status(500).json({ error: "Failed to send reset email. Check SMTP configuration." });
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

  // --- Profile (auth required) --------------------------------------------

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

  // --- Workflow CRUD (auth required) --------------------------------------

  app.get("/api/workflows", requireAuth, async (_req, res) => {
    const items = await storage.listWorkflows();
    res.json(items);
  });

  app.get("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const item = await storage.getWorkflow(id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  app.post("/api/workflows", requireAuth, async (req, res) => {
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const created = await storage.createWorkflow(parsed.data);
    res.status(201).json(created);
  });

  app.put("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const updated = await storage.updateWorkflow(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const ok = await storage.deleteWorkflow(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  return httpServer;
}
