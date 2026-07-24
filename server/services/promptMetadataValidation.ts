/*
 * Module/Script Name: promptMetadataValidation.ts
 * Path: server/services/promptMetadataValidation.ts
 *
 * Description:
 * Deterministic geo/service metadata checks for generated prompt
 * candidates (issue #4 Phase 2 item 6). The LLM is asked to only
 * reference approved geographies and core services, but nothing
 * verified that server-side - this flags mismatches as warnings so an
 * analyst can catch them before saving. Pure functions, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #4 Phase 2 item 6 initial implementation
 */

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function checkApprovedGeo(geo: string | null, approvedGeographies: string[]): string | null {
  if (!geo || !geo.trim()) return null;
  const normalized = normalize(geo);
  const approved = approvedGeographies.some((g) => normalize(g) === normalized);
  return approved ? null : `Geography "${geo}" is not one of the client's configured geographies`;
}

export function checkCoreService(service: string | null, coreServices: string[]): string | null {
  if (!service || !service.trim()) return null;
  const normalized = normalize(service);
  const approved = coreServices.some((s) => normalize(s) === normalized);
  return approved ? null : `Service "${service}" is not one of the client's configured core services`;
}

export function validatePromptMetadata(
  candidate: { geo: string | null; service: string | null },
  client: { geographies: string[]; coreServices: string[] }
): string[] {
  const warnings: string[] = [];
  const geoWarning = checkApprovedGeo(candidate.geo, client.geographies);
  if (geoWarning) warnings.push(geoWarning);
  const serviceWarning = checkCoreService(candidate.service, client.coreServices);
  if (serviceWarning) warnings.push(serviceWarning);
  return warnings;
}
