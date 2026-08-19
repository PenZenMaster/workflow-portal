/*
 * Module/Script Name: adminAlerts.ts
 * Path: server/services/adminAlerts.ts
 *
 * Description:
 * Client-experience sequence plan item 4 (Admin Alerts): unions the
 * actionable failure states already tracked across the codebase into a
 * single flat list for the /admin/alerts page - no new tracking, just a
 * read/aggregation layer over five existing sources: failing
 * integrations, failed generic jobs, failed factory jobs, failed report
 * exports, and failed/partial prompt runs.
 *
 * v1 deliberately omits the measurement-health rollup (degraded /
 * invalid_for_reporting clients) - that signal's assembly
 * (server/routes/runs.ts assembleRunHealth) pulls in manifest,
 * comparability, collection diagnostics, and client readiness per run
 * and isn't yet factored into a reusable service. Scoped as a
 * fast-follow rather than folded in here.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-19
 * Last Modified Date: 2026-08-19
 * Comments:
 * - v1.00 initial implementation (4 of 5 planned signals)
 */

import { integrationStore, jobStore, factoryJobStore, exportStore, runStore, clientStore } from "../storage";

const PER_SOURCE_LIMIT = 50;

export type AdminAlertKind =
  | "integration_failing"
  | "job_failed"
  | "factory_job_failed"
  | "export_failed"
  | "run_failed_partial";

export interface AdminAlert {
  id: string;
  kind: AdminAlertKind;
  clientId: number | null;
  clientName: string | null;
  message: string;
  detailHref: string;
  occurredAt: number;
}

export async function collectAdminAlerts(): Promise<AdminAlert[]> {
  const [integrationsFailing, jobsFailed, factoryJobsFailed, exportsFailed, runsFailedPartial, clients] =
    await Promise.all([
      integrationStore.listByStatus("failing"),
      jobStore.list({ status: "failed", limit: PER_SOURCE_LIMIT }),
      factoryJobStore.list({ status: "failed", limit: PER_SOURCE_LIMIT }),
      exportStore.listByStatus("failed", PER_SOURCE_LIMIT),
      runStore.listByStatus(["failed", "partial"], PER_SOURCE_LIMIT),
      clientStore.list(),
    ]);

  const clientName = (clientId: number): string | null =>
    clients.find((c) => c.id === clientId)?.name ?? null;

  const alerts: AdminAlert[] = [
    ...integrationsFailing.map((i): AdminAlert => ({
      id: `integration-${i.id}`,
      kind: "integration_failing",
      clientId: i.clientId,
      clientName: clientName(i.clientId),
      message: `${i.kind} integration failing${i.lastError ? `: ${i.lastError}` : ""}`,
      detailHref: `/ai/clients/${i.clientId}/settings/integrations`,
      occurredAt: i.updatedAt,
    })),
    ...jobsFailed.map((j): AdminAlert => ({
      id: `job-${j.id}`,
      kind: "job_failed",
      clientId: null,
      clientName: null,
      message: `Job "${j.kind}" failed${j.lastError ? `: ${j.lastError}` : ""}`,
      detailHref: "/admin/jobs",
      occurredAt: j.updatedAt,
    })),
    ...factoryJobsFailed.map((f): AdminAlert => ({
      id: `factory-job-${f.id}`,
      kind: "factory_job_failed",
      clientId: f.clientId,
      clientName: clientName(f.clientId),
      message: `Factory job "${f.jobType}" failed${f.lastError ? `: ${f.lastError}` : ""}`,
      detailHref: `/ai/clients/${f.clientId}`,
      occurredAt: f.updatedAt,
    })),
    ...exportsFailed.map((e): AdminAlert => ({
      id: `export-${e.id}`,
      kind: "export_failed",
      clientId: e.clientId,
      clientName: clientName(e.clientId),
      message: `${e.kind} export failed${e.lastError ? `: ${e.lastError}` : ""}`,
      detailHref: `/ai/clients/${e.clientId}/reports`,
      occurredAt: e.updatedAt,
    })),
    ...runsFailedPartial.map((r): AdminAlert => ({
      id: `run-${r.id}`,
      kind: "run_failed_partial",
      clientId: r.clientId,
      clientName: clientName(r.clientId),
      message: `Prompt run ${r.status} (${r.failedPrompts}/${r.totalPrompts} prompts failed)`,
      detailHref: `/ai/runs/${r.id}`,
      occurredAt: r.updatedAt,
    })),
  ];

  return alerts.sort((a, b) => b.occurredAt - a.occurredAt);
}
