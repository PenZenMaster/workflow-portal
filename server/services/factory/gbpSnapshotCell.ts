/*
 * Module/Script Name: gbpSnapshotCell.ts
 * Path: server/services/factory/gbpSnapshotCell.ts
 *
 * Description:
 * Lights-Out SEO Factory production cell for planning.gbp-snapshot. Resolves
 * a client's mapped GBP location (clients.gbpLocationName) and fetches its
 * current Business Information API snapshot (server/services/gbp.ts) via a
 * single shared OAuth credential - no per-client OAuth connection, no
 * per-run pasted GBP share link. Output shape matches
 * docs/aeo_geo_google_data_architecture.md's gbp_location_snapshot table.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Pilot second planning cell (alongside planning.ranking-growth-plan)
 */

import type { FactoryCell } from "../../jobs/factory";
import { getLocationSnapshot, isGbpConfigured } from "../gbp";

export interface GbpSnapshotCellDeps {
  clientStore: {
    get(
      id: number
    ): Promise<{ id: number; gbpLocationName: string | null } | undefined>;
  };
}

export function createGbpSnapshotCell(deps: GbpSnapshotCellDeps): FactoryCell {
  return {
    jobType: "planning.gbp-snapshot",
    async run(job) {
      const client = await deps.clientStore.get(job.clientId);
      if (!client?.gbpLocationName) {
        throw new Error(
          `No GBP location configured for client ${job.clientId}`
        );
      }

      if (job.dryRun) {
        return {
          dryRun: true,
          checks: {
            gbpLocationName: "ok",
            gbpConfig: isGbpConfigured() ? "ok" : "missing",
          },
        };
      }

      const snapshot = await getLocationSnapshot(client.gbpLocationName);
      return { ...snapshot };
    },
  };
}
