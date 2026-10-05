/*
 * Module/Script Name: csv.ts
 * Path: server/services/csv.ts
 *
 * Description:
 * Zero-dependency CSV generator. generateCsvLines() returns an array
 * of raw CSV lines (header + data rows) so callers can either join
 * them for in-memory use or stream them line-by-line to a file.
 * Field values containing commas or quotes are properly escaped.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 * - v1.01 generateOverviewCsvLines: all-clients Overview metrics export
 * - v1.02 escapeField prefixes formula-trigger text cells (CSV injection)
 */

import type { ReportExport } from "@shared/schema";

type ExportKind = ReportExport["kind"];

// Text cells that start with these characters are run as formulas by Excel
// and Sheets (CSV injection); a leading apostrophe keeps them literal.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeField(value: unknown): string {
  let str = value == null ? "" : String(value);
  if (typeof value === "string" && FORMULA_TRIGGER.test(str)) str = `'${str}`;
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(fields: unknown[]): string {
  return fields.map(escapeField).join(",");
}

// ---------------------------------------------------------------------------
// Data shapes expected by each kind

export interface ExecutiveSnapshot {
  dateIso: string;
  mentionCount: number;
  citationCount: number;
  allBrandMentions: number;
  promptResponseCount: number;
  visibilityScoreSum: number;
}

export interface MentionRow {
  id: number;
  responseId: number;
  brandId: number;
  matchedText: string;
  section: string;
  recommendationRank: number | null;
  evidenceExcerpt: string | null;
  sentimentLabel: string;
  sentimentScore: number;
}

export type CsvPayload =
  | { snapshots: ExecutiveSnapshot[] }
  | { mentions: MentionRow[] };

// ---------------------------------------------------------------------------

const EXECUTIVE_HEADERS = [
  "date", "mentionCount", "citationCount", "allBrandMentions",
  "promptResponseCount", "avgVisibilityScore",
];

const MENTIONS_HEADERS = [
  "id", "responseId", "brandId", "matchedText", "section",
  "recommendationRank", "evidenceExcerpt", "sentimentLabel", "sentimentScore",
];

export function generateCsvLines(kind: ExportKind, payload: CsvPayload): string[] {
  if (kind === "csv-executive") {
    const { snapshots } = payload as { snapshots: ExecutiveSnapshot[] };
    const lines: string[] = [row(EXECUTIVE_HEADERS)];
    for (const s of snapshots) {
      const avg =
        s.promptResponseCount > 0
          ? (s.visibilityScoreSum / s.promptResponseCount).toFixed(2)
          : "0";
      lines.push(
        row([s.dateIso, s.mentionCount, s.citationCount, s.allBrandMentions, s.promptResponseCount, avg])
      );
    }
    return lines;
  }

  // csv-analyst and csv-mentions share the mentions format
  const { mentions } = payload as { mentions: MentionRow[] };
  const lines: string[] = [row(MENTIONS_HEADERS)];
  for (const m of mentions) {
    lines.push(
      row([
        m.id, m.responseId, m.brandId, m.matchedText, m.section,
        m.recommendationRank ?? "", m.evidenceExcerpt ?? "",
        m.sentimentLabel, m.sentimentScore,
      ])
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// All-clients Overview export (one row per client)

export interface OverviewExportRow {
  clientId: number;
  clientName: string;
  primaryDomain: string;
  periodFrom: string;
  periodTo: string;
  totalResponses: number;
  citationFrequency: number;
  mentionRate: number;
  aiSoV: number;
  avgVisibilityScore: number;
}

const OVERVIEW_HEADERS = [
  "client_id", "client_name", "primary_domain", "period_from", "period_to",
  "total_responses", "citation_frequency_pct", "mention_rate_pct",
  "ai_share_of_voice_pct", "avg_visibility_score",
];

export function generateOverviewCsvLines(rows: OverviewExportRow[]): string[] {
  const lines: string[] = [row(OVERVIEW_HEADERS)];
  for (const r of rows) {
    lines.push(
      row([
        r.clientId, r.clientName, r.primaryDomain, r.periodFrom, r.periodTo,
        r.totalResponses, r.citationFrequency.toFixed(2), r.mentionRate.toFixed(2),
        r.aiSoV.toFixed(2), r.avgVisibilityScore.toFixed(2),
      ])
    );
  }
  return lines;
}
