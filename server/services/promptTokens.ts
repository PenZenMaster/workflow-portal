/*
 * Module/Script Name: promptTokens.ts
 * Path: server/services/promptTokens.ts
 *
 * Description:
 * Prompt template tokens for Prompt Collections (B-20). Expands a stored
 * prompt's text into one or more run-time query strings by substituting
 * {{brand}}, {{city}}/{{geo}}, and {{competitor}} with the client's
 * brand/geography/competitor data. {{competitor}} fans the prompt out into
 * one variant per configured competitor.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-15
 * Last Modified Date: 2026-06-15
 * Comments:
 * - v1.00 Initial implementation (B-20)
 */

export interface ClientBrandContext {
  brand: string;
  competitors: string[];
  geographies: string[];
}

export interface PromptTokenContext {
  brand: string;
  competitors: string[];
  geo: string | null;
}

export function buildPromptTokenContext(
  client: ClientBrandContext,
  promptGeo: string | null
): PromptTokenContext {
  return {
    brand: client.brand,
    competitors: client.competitors,
    geo: promptGeo ?? client.geographies[0] ?? null,
  };
}

export function expandPromptText(text: string, ctx: PromptTokenContext): string[] {
  let result = text.replaceAll("{{brand}}", ctx.brand);
  const geoValue = ctx.geo ?? "";
  result = result.replaceAll("{{city}}", geoValue).replaceAll("{{geo}}", geoValue);

  if (!result.includes("{{competitor}}")) return [result];

  if (ctx.competitors.length === 0) {
    return [result.replaceAll("{{competitor}}", "")];
  }
  return ctx.competitors.map((name) => result.replaceAll("{{competitor}}", name));
}
