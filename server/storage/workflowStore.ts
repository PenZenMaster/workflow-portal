/*
 * Module/Script Name: workflowStore.ts
 * Path: server/storage/workflowStore.ts
 *
 * Description:
 * Isolated data-access layer for the workflows table. Exposes a short
 * method-name API (list/get/create/update/delete) consumed directly by
 * new domain code; DatabaseStorage in storage.ts provides shims so
 * existing call sites keep working unchanged.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Carved out of server/storage.ts for Sprint 0 route/storage split
 */

import { workflows } from "@shared/schema";
import type { InsertWorkflow, Workflow } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof workflows.$inferSelect;

function hydrate(row: Row): Workflow {
  let inputs: string[] = [];
  let optionalInputs: string[] = [];
  let tags: string[] = [];
  try {
    inputs = JSON.parse(row.inputs || "[]");
  } catch {
    inputs = [];
  }
  try {
    optionalInputs = JSON.parse(row.optionalInputs || "[]");
  } catch {
    optionalInputs = [];
  }
  try {
    tags = JSON.parse(row.tags || "[]");
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    inputs,
    optionalInputs,
    tags,
    prompt: row.prompt,
    launchUrl: row.launchUrl,
    launchLabel: row.launchLabel,
    pinned: !!row.pinned,
    acceptsFileUpload: !!row.acceptsFileUpload,
    aiAdapterSlug: row.aiAdapterSlug ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IWorkflowStore {
  list(): Promise<Workflow[]>;
  get(id: number): Promise<Workflow | undefined>;
  create(data: InsertWorkflow): Promise<Workflow>;
  update(id: number, data: InsertWorkflow): Promise<Workflow | undefined>;
  delete(id: number): Promise<boolean>;
}

export class WorkflowStore implements IWorkflowStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(): Promise<Workflow[]> {
    const rows = this._db.select().from(workflows).all();
    return rows
      .map(hydrate)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async get(id: number): Promise<Workflow | undefined> {
    const row = this._db.select().from(workflows).where(eq(workflows.id, id)).get();
    return row ? hydrate(row) : undefined;
  }

  async create(data: InsertWorkflow): Promise<Workflow> {
    const now = Date.now();
    const row = this._db
      .insert(workflows)
      .values({
        name: data.name,
        category: data.category,
        description: data.description,
        inputs: JSON.stringify(data.inputs ?? []),
        optionalInputs: JSON.stringify(data.optionalInputs ?? []),
        tags: JSON.stringify(data.tags ?? []),
        prompt: data.prompt ?? "",
        launchUrl: data.launchUrl ?? "",
        launchLabel: data.launchLabel ?? "",
        pinned: data.pinned ? 1 : 0,
        acceptsFileUpload: data.acceptsFileUpload ? 1 : 0,
        aiAdapterSlug: data.aiAdapterSlug ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(id: number, data: InsertWorkflow): Promise<Workflow | undefined> {
    const existing = this._db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .get();
    if (!existing) return undefined;
    const now = Date.now();
    const row = this._db
      .update(workflows)
      .set({
        name: data.name,
        category: data.category,
        description: data.description,
        inputs: JSON.stringify(data.inputs ?? []),
        optionalInputs: JSON.stringify(data.optionalInputs ?? []),
        tags: JSON.stringify(data.tags ?? []),
        prompt: data.prompt ?? "",
        launchUrl: data.launchUrl ?? "",
        launchLabel: data.launchLabel ?? "",
        pinned: data.pinned ? 1 : 0,
        acceptsFileUpload: data.acceptsFileUpload ? 1 : 0,
        aiAdapterSlug: data.aiAdapterSlug ?? null,
        updatedAt: now,
      })
      .where(eq(workflows.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db.delete(workflows).where(eq(workflows.id, id)).run();
    return result.changes > 0;
  }
}
