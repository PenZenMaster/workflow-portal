import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ResponseMention } from "@shared/schema";

const PAGE_SIZE = 20;

const SECTION_BADGE: Record<string, string> = {
  summary: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  list: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  body: "bg-muted text-muted-foreground",
};

export function MentionsSection({ clientId }: { clientId: string }) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading } = useQuery<{ data: { mentions: ResponseMention[]; total: number } }>({
    queryKey: [`/api/clients/${clientId}/mentions?limit=${limit}`],
  });

  const mentions = data?.data?.mentions ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Mentions</h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : mentions.length === 0 ? (
        <p className="text-muted-foreground">No mentions detected yet.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {mentions.map((m) => (
              <li key={m.id} className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${SECTION_BADGE[m.section] ?? ""}`}>
                    {m.section}
                  </span>
                  <span className="font-medium text-sm">{m.matchedText}</span>
                  {m.recommendationRank && (
                    <span className="text-xs text-muted-foreground">#{m.recommendationRank}</span>
                  )}
                </div>
                {m.evidenceExcerpt && (
                  <p className="text-sm text-muted-foreground italic">"{m.evidenceExcerpt}"</p>
                )}
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-sm text-muted-foreground">
                Showing {mentions.length} of {total}
              </span>
              {mentions.length < total && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                >
                  Show more
                </Button>
              )}
              {limit > PAGE_SIZE && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLimit(PAGE_SIZE)}
                >
                  Show less
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
