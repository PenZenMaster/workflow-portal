import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { PromptRun } from "@shared/schema";

const STATUS_COLOURS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  complete: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TERMINAL = new Set(["complete", "partial", "failed"]);

export default function RunsList() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: PromptRun[] }>({
    queryKey: [`/api/clients/${id}/runs`],
    enabled: !!id,
    refetchInterval: (query) => {
      const runs = query.state.data?.data ?? [];
      const anyActive = runs.some((r) => !TERMINAL.has(r.status));
      return anyActive ? 5_000 : false;
    },
  });

  const runs = data?.data ?? [];

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading runs...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Runs</h1>

      {runs.length === 0 ? (
        <p className="text-muted-foreground">No runs yet. Trigger one from the prompt collection.</p>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <li key={r.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
              <Link href={`/ai/runs/${r.id}`}>
                <span className="font-medium text-primary hover:underline">
                  Run #{r.id}
                </span>
              </Link>
              <span className={`ml-3 text-xs px-2 py-0.5 rounded ${STATUS_COLOURS[r.status] ?? ""}`}>
                {r.status}
              </span>
              <span className="ml-3 text-sm text-muted-foreground">
                {r.completedPrompts}/{r.totalPrompts} complete
                {r.failedPrompts > 0 && ` · ${r.failedPrompts} failed`}
              </span>
              <span className="ml-3 text-xs text-muted-foreground">{r.triggeredBy}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
