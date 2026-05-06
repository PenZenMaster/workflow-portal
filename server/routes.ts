import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { seedIfEmpty } from "./seed";
import {
  insertWorkflowSchema,
  loginSchema,
  createUserSchema,
} from "@shared/schema";
import { requireAuth } from "./auth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

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
        parsed.data.password
      );
      req.session.user = user;
      res.status(201).json({ user });
    } catch (err: any) {
      if (String(err?.message || "").includes("UNIQUE")) {
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
