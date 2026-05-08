import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const archive = `workflow-portal-v${version}.tar.gz`;
// Use a relative path — Windows tar cannot handle absolute drive-letter paths.
const relOut = `../${archive}`;

// Only include what the production server actually needs to run.
// Everything else (source, tests, docs, git history, dev config) stays local.
const include = ["dist/", "migrations/", "package.json", "package-lock.json"];

console.log(`Packaging ${archive} ...`);
console.log(`  Including: ${include.join(", ")}`);

execSync(
  ["tar", "-czf", relOut, ...include].join(" "),
  { cwd: root, stdio: "inherit", shell: true }
);

console.log(`Created: ../${archive}`);
