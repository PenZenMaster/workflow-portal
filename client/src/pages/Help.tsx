/*
 * Module/Script Name: Help.tsx
 * Path: client/src/pages/Help.tsx
 *
 * Description:
 * B-25: in-app Help page. Fetches docs/system-documentation.md's raw
 * content and renders it with react-markdown + remark-gfm (the doc uses
 * GFM tables extensively), with a left-side section nav built from the
 * doc's own ## / ### headings rather than a separately maintained list.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 B-25
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { BookOpen } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { scrollToSection } from "@/lib/scrollToSection";

interface NavEntry {
  level: 2 | 3;
  text: string;
  slug: string;
}

// Matches GitHub's own heading-anchor convention closely enough for an
// internal doc: lowercase, strip anything that isn't alnum/space/hyphen,
// collapse whitespace to hyphens. Applied identically when building the
// nav list and when assigning heading ids, so the two always agree.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractNavEntries(markdown: string): NavEntry[] {
  const entries: NavEntry[] = [];
  const seenSlugs = new Map<string, number>();
  for (const line of markdown.split("\n")) {
    const match = /^(##|###)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length === 2 ? 2 : 3;
    const text = match[2].trim();
    let slug = slugify(text);
    // Disambiguate duplicate heading text (e.g. two "Previous Sprints"
    // sections) the same way most markdown renderers do - append -2, -3...
    const count = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;
    entries.push({ level, text, slug });
  }
  return entries;
}

export default function Help() {
  const { data, isLoading } = useQuery<{ data: { content: string } }>({
    queryKey: ["/api/help/system-documentation"],
  });

  const content = data?.data.content ?? "";
  const navEntries = useMemo(() => extractNavEntries(content), [content]);

  // Assigns the same slug to h2/h3 elements as extractNavEntries computed,
  // by consuming headings from navEntries in document order as react-
  // markdown renders them - guarantees the nav's hrefs and the rendered
  // heading ids always match, even with duplicate heading text.
  const components = useMemo((): Components => {
    let cursor = 0;
    const nextSlug = (): string | undefined => navEntries[cursor++]?.slug;
    return {
      h2: ({ children, ...props }) => (
        <h2 id={nextSlug()} {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 id={nextSlug()} {...props}>
          {children}
        </h3>
      ),
    };
  }, [navEntries]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Breadcrumbs items={[{ label: "Workflows", href: "/" }, { label: "Help" }]} />

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
        <BookOpen className="h-6 w-6 text-primary" />
        Help
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Setup and troubleshooting reference, straight from this app's own system documentation.
      </p>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex gap-8 items-start">
          <nav aria-label="Help sections" className="hidden lg:block w-64 shrink-0 sticky top-8">
            <ul className="space-y-1 text-sm">
              {navEntries.map((entry) => (
                <li key={entry.slug} className={entry.level === 3 ? "pl-4" : ""}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(entry.slug)}
                    className="text-muted-foreground hover:text-foreground transition-colors block py-0.5 text-left w-full"
                  >
                    {entry.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <article className="prose prose-sm dark:prose-invert max-w-none min-w-0 flex-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {content}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}
