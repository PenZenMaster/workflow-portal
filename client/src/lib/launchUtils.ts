// Browsers and servers commonly cap full URLs at ~2000 chars.
const PPLX_URL_PROMPT_MAX = 1800;

// Input labels that indicate credentials. Prompts built from these must
// never travel in a URL query string (URLs are logged by servers/proxies).
const SENSITIVE_LABEL = /password|passphrase|secret|token|api[\s_-]?key|credential/i;

export function fillPrompt(template: string, values: string[]): string {
  let i = 0;
  return template.replace(/<PASTE>/g, () => values[i++] ?? "");
}

export function isPerplexityHost(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)perplexity\.ai$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function hasSensitiveInputLabel(labels: string[]): boolean {
  return labels.some((label) => SENSITIVE_LABEL.test(label));
}

// Build a Perplexity launch URL that prefills the prompt via the q param.
// Only the /search path auto-submits; other paths (e.g. /computer) prefill
// the input box and wait for the user to press Enter.
// Returns null if the URL is not a Perplexity host or the encoded prompt
// exceeds PPLX_URL_PROMPT_MAX — caller should fall back to clipboard.
export function buildPerplexityLaunchUrl(
  launchUrl: string,
  prompt: string
): string | null {
  if (!isPerplexityHost(launchUrl)) return null;
  const encoded = encodeURIComponent(prompt);
  if (encoded.length > PPLX_URL_PROMPT_MAX) return null;
  try {
    const u = new URL(launchUrl);
    if (u.pathname === "/" || u.pathname === "") {
      u.pathname = "/search";
    }
    u.searchParams.set("q", prompt);
    return u.toString();
  } catch {
    return null;
  }
}

export type LaunchMode = "auto-submit" | "prefill" | "clipboard";

export type LaunchPlan = {
  mode: LaunchMode;
  url: string;
};

// Decide how a workflow launch should behave:
// - "auto-submit": Perplexity /search URL with q param — submits on load.
// - "prefill": other Perplexity paths (e.g. /computer) with q param — the
//   prompt lands in the input box but the user must press Enter.
// - "clipboard": open the raw launch URL; the prompt travels via clipboard.
//   Used for non-Perplexity hosts, over-long prompts, and any workflow whose
//   input labels look like credentials.
export function getLaunchPlan(
  launchUrl: string,
  prompt: string,
  inputLabels: string[]
): LaunchPlan {
  if (!hasSensitiveInputLabel(inputLabels)) {
    const directUrl = buildPerplexityLaunchUrl(launchUrl, prompt);
    if (directUrl) {
      const mode =
        new URL(directUrl).pathname === "/search" ? "auto-submit" : "prefill";
      return { mode, url: directUrl };
    }
  }
  return { mode: "clipboard", url: launchUrl };
}

// Client-side cap for an attached reference file, mirrors the server's
// MAX_CSV_BYTES precedent (server/services/workflowFileRun.ts) even though
// this file is never sent to the server.
export const MAX_TEMPLATE_FILE_BYTES = 5 * 1024 * 1024;

export function isHtmlFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm");
}

// Folds an attached reference file's content into the already-filled
// prompt. Never persisted anywhere — the caller reads the File client-side
// and passes its text straight through.
export function appendTemplateFile(
  prompt: string,
  filename: string,
  content: string
): string {
  return `${prompt}\n\nTemplate reference (uploaded file: ${filename}):\n\`\`\`html\n${content}\n\`\`\``;
}
