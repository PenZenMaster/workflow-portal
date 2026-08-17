/*
 * Module/Script Name: seedDiff.ts
 * Path: script/seedDiff.ts
 *
 * Description:
 * TD-12 CLI: reports (and optionally generates an apply artifact for)
 * drift between server/seed.ts's SEED array and the live workflows
 * table. Connects via server/storage.ts's db singleton, so it targets
 * whatever DATA_DB_PATH points at - the local dev data.db by default, or
 * a downloaded copy of prod's data.db when DATA_DB_PATH is overridden.
 * Never connects to prod directly and never writes to any db itself -
 * every apply mode produces a file for a human to review first, same as
 * every prior direct-SQL prod fix in this repo's history.
 *
 * Usage:
 *   npx tsx script/seedDiff.ts                    report only
 *   npx tsx script/seedDiff.ts --apply=seed-to-db  also write seed-sync.sql
 *   npx tsx script/seedDiff.ts --apply=db-to-seed  also print a SEED[] literal to paste into server/seed.ts
 *
 * Exit code: 1 if any difference was found, 0 if seed.ts and the db already match.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 TD-12
 */

import { writeFileSync } from "node:fs";
import { db } from "../server/storage";
import { WorkflowStore } from "../server/storage/workflowStore";
import { SEED } from "../server/seed";
import { diffSeedAgainstDb, generateSyncSql, generateSeedArrayLiteral } from "../server/services/seedDiff";

async function main() {
  const applyArg = process.argv.find((a) => a.startsWith("--apply="));
  const applyMode = applyArg?.split("=")[1];

  const dbRows = await new WorkflowStore(db).list();
  const diff = diffSeedAgainstDb(SEED, dbRows);

  const hasDiff = diff.onlyInSeed.length > 0 || diff.onlyInDb.length > 0 || diff.differing.length > 0;

  if (!hasDiff) {
    console.info("seed.ts and the connected workflows table already match.");
    process.exit(0);
  }

  if (diff.onlyInSeed.length > 0) {
    console.info(`\nOnly in seed.ts (missing from the db):`);
    for (const name of diff.onlyInSeed) console.info(`  - ${name}`);
  }
  if (diff.onlyInDb.length > 0) {
    console.info(`\nOnly in the db (missing from seed.ts):`);
    for (const name of diff.onlyInDb) console.info(`  - ${name}`);
  }
  if (diff.differing.length > 0) {
    console.info(`\nDiffering fields on matched cards:`);
    for (const entry of diff.differing) {
      console.info(`  - ${entry.name}:`);
      for (const f of entry.fields) console.info(`      ${f.field}: seed=${JSON.stringify(f.seedValue)} db=${JSON.stringify(f.dbValue)}`);
    }
  }

  if (applyMode === "seed-to-db") {
    const sql = generateSyncSql(diff, SEED);
    writeFileSync("seed-sync.sql", sql + "\n");
    console.info(`\nWrote seed-sync.sql (${diff.onlyInSeed.length} insert(s), ${diff.differing.length} update(s)). Review before running against a target db.`);
  } else if (applyMode === "db-to-seed") {
    const literal = generateSeedArrayLiteral(dbRows);
    console.info(`\n--- Paste over the SEED array in server/seed.ts, then review via git diff ---\n`);
    console.info(literal);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
