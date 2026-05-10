/*
 * Module/Script Name: users.ts
 * Path: server/routes/users.ts
 *
 * Description:
 * User management routes. Only super_admin can list, create, and remove
 * portal accounts. Prevents self-deletion and creation of duplicate usernames.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Initial user management implementation
 */

import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { USER_ROLES } from "@shared/schema";
import { requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";

const adminCreateUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be 40 characters or fewer")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, underscore, dot, dash only"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password too long"),
  email: z.string().email("Invalid email").optional(),
  role: z.enum(USER_ROLES as unknown as [string, ...string[]]).default("analyst"),
});

export function registerUserRoutes(app: Express): void {
  // List all portal users
  app.get("/api/users", requireRole("super_admin"), async (_req, res) => {
    const users = await storage.listUsers();
    ok(res, users);
  });

  // Create a new portal account
  app.post("/api/users", requireRole("super_admin"), async (req, res) => {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

    try {
      const user = await storage.createUser(
        parsed.data.username.trim(),
        parsed.data.password,
        parsed.data.email?.trim(),
        parsed.data.role as import("@shared/schema").UserRole
      );
      created(res, user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) {
        throw new AppError(409, "Username already taken", "DUPLICATE_USERNAME");
      }
      throw err;
    }
  });

  // Delete a portal account (cannot delete self)
  app.delete("/api/users/:id", requireRole("super_admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    if (id === req.session.user!.id) {
      throw new AppError(400, "Cannot delete your own account", "SELF_DELETE");
    }

    const deleted = await storage.deleteUser(id);
    if (!deleted) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    noContent(res);
  });
}
