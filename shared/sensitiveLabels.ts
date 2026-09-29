/*
 * Module/Script Name: sensitiveLabels.ts
 * Path: shared/sensitiveLabels.ts
 *
 * Description:
 * Single definition of which workflow input labels hold credentials.
 * Shared by the client (launch-mode choice, never persisting/prefilling
 * these inputs) and the server (never storing or returning them from
 * /api/workflows/:id/input-values).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-28
 * Last Modified Date: 2026-09-28
 * Comments:
 * - v1.00 Moved from client/src/lib/launchUtils.ts (v1.109.3 security fix:
 *   launch inputs are shared across users, so credentials must never be
 *   remembered)
 */

export const SENSITIVE_LABEL = /password|passphrase|secret|token|api[\s_-]?key|credential/i;

export function isSensitiveLabel(label: string): boolean {
  return SENSITIVE_LABEL.test(label);
}

export function withoutSensitiveValues(values: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [label, value] of Object.entries(values)) {
    if (!isSensitiveLabel(label)) safe[label] = value;
  }
  return safe;
}
