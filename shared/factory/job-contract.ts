/*
 * Module/Script Name: job-contract.ts
 * Path: shared/factory/job-contract.ts
 *
 * Description:
 * Factory Job Contract v1 for the Lights-Out SEO Factory. Defines the zod
 * schema every factory production job must satisfy before the orchestrator
 * accepts it. The portal database is the source of truth for client
 * configuration; jobs reference clients by their portal row id.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-07
 * Last Modified Date: 2026-07-07
 * Comments:
 * - v1.00 Zod contract schema replaces the initial hand-rolled validator
 */

import { z } from "zod";

export const FACTORY_JOB_CONTRACT_VERSION = "1.0";

export const FACTORY_JOB_PRIORITIES = ["low", "normal", "high"] as const;
export type FactoryJobPriority = (typeof FACTORY_JOB_PRIORITIES)[number];

// Dot-namespaced lowercase job type, e.g. "reporting.monthly-pipeline".
// At least two segments so every job type carries a production-cell namespace.
const JOB_TYPE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export const factoryJobSchema = z.object({
  contractVersion: z.literal(FACTORY_JOB_CONTRACT_VERSION),
  jobId: z.string().min(1, "jobId is required"),
  clientId: z.number().int().positive("clientId must be a portal client row id"),
  jobType: z
    .string()
    .regex(JOB_TYPE_PATTERN, "jobType must be dot-namespaced lowercase"),
  priority: z.enum(FACTORY_JOB_PRIORITIES),
  createdAt: z.string().datetime({ message: "createdAt must be ISO-8601" }),
  input: z.record(z.unknown()),
  execution: z.object({
    dryRun: z.boolean(),
    approvalRequired: z.boolean(),
  }),
});

export type FactoryJob = z.infer<typeof factoryJobSchema>;

export function validateFactoryJob(value: unknown): value is FactoryJob {
  return factoryJobSchema.safeParse(value).success;
}
