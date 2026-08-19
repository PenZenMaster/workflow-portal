import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface Recommendation {
  kind: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  suggestedAction: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-muted text-muted-foreground",
};

const COMPACT_LIMIT = 3;

export function RecommendationsSection({ clientId }: { clientId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<{ data: Recommendation[] }>({
    queryKey: [`/api/clients/${clientId}/recommendations`],
  });

  const recs = data?.data ?? [];
  const visibleRecs = expanded ? recs : recs.slice(0, COMPACT_LIMIT);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Recommendations</h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : recs.length === 0 ? (
        <p className="text-muted-foreground">No gaps detected. Keep running audits to track trends.</p>
      ) : (
        <>
        <ul className="space-y-4">
          {visibleRecs.map((r, i) => (
            <li key={i} className="border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded ${SEVERITY_STYLE[r.severity]}`}>
                  {r.severity}
                </span>
                <span className="font-medium">{r.kind.replace(/-/g, " ")}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{r.evidence}</p>
              <div className="bg-muted/50 rounded p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested action</p>
                <p className="text-sm">{r.suggestedAction}</p>
              </div>
            </li>
          ))}
        </ul>

        {recs.length > COMPACT_LIMIT && (
          <div className="mt-4">
            {expanded ? (
              <Button variant="outline" size="sm" onClick={() => setExpanded(false)}>
                Show less
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
                Show all {recs.length}
              </Button>
            )}
          </div>
        )}
        </>
      )}
    </section>
  );
}
