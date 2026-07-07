/*
 * Module/Script Name: reportingCell.ts
 * Path: server/services/factory/reportingCell.ts
 *
 * Description:
 * Reporting production cell for the Lights-Out SEO Factory. Handles the
 * reporting.monthly-pipeline job type: validates the contract's reporting
 * period, locates the client's GA4 integration, and extracts the AI-search
 * traffic summary for the period. A dry run validates configuration and
 * data-source availability without extracting.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-07
 * Last Modified Date: 2026-07-07
 * Comments:
 * - v1.00 Slice 1: GA4 extraction only; GSC/Bing sources arrive in slice 2
 */

import { z } from "zod";
import type { FactoryCell } from "../../jobs/factory";
import type { Ga4TrafficData } from "../ga4";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const reportingPipelineInputSchema = z.object({
  periodStart: z.string().regex(ISO_DATE_PATTERN, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(ISO_DATE_PATTERN, "periodEnd must be YYYY-MM-DD"),
});

export interface ReportingCellDeps {
  integrationStore: {
    listByClient(
      clientId: number
    ): Promise<Array<{ id: number; kind: string; config: unknown }>>;
    updateConfig(id: number, config: Record<string, unknown>): Promise<void>;
  };
  ga4: {
    getAiTraffic(
      config: Record<string, unknown>,
      fromDate: string,
      toDate: string,
      onTokenRefreshed: (updated: Record<string, unknown>) => Promise<void>
    ): Promise<Ga4TrafficData>;
  };
}

export function createReportingMonthlyPipelineCell(
  deps: ReportingCellDeps
): FactoryCell {
  return {
    jobType: "reporting.monthly-pipeline",
    async run(job) {
      const parsed = reportingPipelineInputSchema.safeParse(job.input);
      if (!parsed.success) {
        throw new Error(
          "Invalid reporting pipeline input: periodStart and periodEnd (YYYY-MM-DD) are required"
        );
      }
      const { periodStart, periodEnd } = parsed.data;

      const integrations = await deps.integrationStore.listByClient(job.clientId);
      const ga4Integration = integrations.find((i) => i.kind === "ga4");
      if (!ga4Integration) {
        throw new Error(
          `No GA4 integration configured for client ${job.clientId}`
        );
      }
      const config = ga4Integration.config as Record<string, unknown>;

      if (job.dryRun) {
        return {
          dryRun: true,
          period: { start: periodStart, end: periodEnd },
          checks: {
            ga4Integration: "ok",
            ga4PropertyId: config.propertyId ? "ok" : "missing",
          },
        };
      }

      const traffic = await deps.ga4.getAiTraffic(
        config,
        periodStart,
        periodEnd,
        async (updated) => {
          await deps.integrationStore.updateConfig(ga4Integration.id, updated);
        }
      );

      return {
        period: { start: periodStart, end: periodEnd },
        aiTraffic: {
          sessions: traffic.sessions,
          engagementRate: traffic.engagementRate,
          pagesPerSession: traffic.pagesPerSession,
          conversionRate: traffic.conversionRate,
          referrers: traffic.referrers,
        },
        sources: { ga4: "ok" },
      };
    },
  };
}
