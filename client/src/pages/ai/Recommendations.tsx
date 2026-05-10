import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

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

export default function Recommendations() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: Recommendation[] }>({
    queryKey: [`/api/clients/${id}/recommendations`],
    enabled: !!id,
  });

  const recs = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Recommendations</h1>

      {recs.length === 0 ? (
        <p className="text-muted-foreground">No gaps detected. Keep running audits to track trends.</p>
      ) : (
        <ul className="space-y-4">
          {recs.map((r, i) => (
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
      )}
    </div>
  );
}
