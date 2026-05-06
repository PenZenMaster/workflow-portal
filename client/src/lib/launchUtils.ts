// Browsers and servers commonly cap full URLs at ~2000 chars.
const PPLX_URL_PROMPT_MAX = 1800;

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

// Build a Perplexity launch URL that prefills + auto-submits the prompt.
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
