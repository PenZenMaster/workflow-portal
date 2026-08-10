declare module "better-sqlite3-session-store";

// TD-22: psl ships its own types (node_modules/psl/types/index.d.ts) but
// its package.json "exports" map has no "types" condition, so TypeScript's
// "bundler" moduleResolution can't find them despite them existing. Only
// the surface this codebase actually uses is declared here.
declare module "psl" {
  export function get(domain: string): string | null;
}
