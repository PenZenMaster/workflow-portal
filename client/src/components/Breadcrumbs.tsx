/*
 * Module/Script Name: Breadcrumbs.tsx
 * Path: client/src/components/Breadcrumbs.tsx
 *
 * Description:
 * Shared breadcrumb navigation for AI-module and admin pages. Renders a
 * clickable trail of ancestor pages with the current page as plain text,
 * replacing the previous ad-hoc "Back to X" links. useClientName resolves
 * a client id to its display name (cached via react-query) so client-scoped
 * pages always show which client is being worked on.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial implementation (breadcrumb navigation, closes B-17)
 */

import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Client } from "@shared/schema";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-medium text-foreground" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Resolve a client id to its name for breadcrumb display. Returns an
 * ellipsis placeholder while loading; react-query caches the lookup so
 * pages that already fetch the client share the same cache entry.
 */
export function useClientName(clientId: string | number | undefined): string {
  const enabled =
    clientId !== undefined && clientId !== null && `${clientId}`.length > 0;
  const { data } = useQuery<{ data: Client | null }>({
    queryKey: [`/api/clients/${clientId}`],
    enabled,
  });
  return data?.data?.name ?? "...";
}
