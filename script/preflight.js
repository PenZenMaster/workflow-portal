import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

let tagExists = false;
try {
  const out = execSync(`git tag --list v${version}`, { cwd: root }).toString().trim();
  tagExists = out.length > 0;
} catch {
  // git unavailable — skip tag check
}

if (tagExists) {
  console.error(`\nPREFLIGHT FAIL: git tag v${version} already exists.`);
  console.error(`Bump the version in package.json before packaging.\n`);
  process.exit(1);
}

console.log(`Preflight OK: v${version} is untagged.`);
