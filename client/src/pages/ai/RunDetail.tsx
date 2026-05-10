import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { PromptRun, ResponseRaw } from "@shared/schema";

const TERMINAL = new Set(["complete", "partial", "failed"]);

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();

  const { data, isLoading } = useQuery<{
    data: { run: PromptRun; responses: ResponseRaw[] };
  }>({
    queryKey: [`/api/runs/${runId}`],
    enabled: !!runId,
    refetchInterval: (query) => {
      const run = query.state.data?.data?.run;
      return run && !TERMINAL.has(run.status) ? 5_000 : false;
    },
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-8 text-destructive">Run not found.</div>;

  const { run, responses } = data.data;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/ai/clients/${run.clientId}/runs`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Runs
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">Run #{run.id}</h1>
      <div className="flex gap-4 text-sm text-muted-foreground mb-6">
        <span>Status: <strong className="text-foreground">{run.status}</strong></span>
        <span>{run.completedPrompts}/{run.totalPrompts} complete</span>
        {run.failedPrompts > 0 && <span className="text-red-600">{run.failedPrompts} failed</span>}
      </div>

      <h2 className="text-lg font-semibold mb-3">Responses</h2>
      {responses.length === 0 ? (
        <p className="text-muted-foreground text-sm">No responses captured yet.</p>
      ) : (
        <ul className="space-y-3">
          {responses.map((r) => (
            <li key={r.id} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs bg-muted px-2 py-0.5 rounded">{r.status}</span>
                <span className="text-sm font-medium truncate">{r.queryText}</span>
              </div>
              {r.responseText && (
                <p className="text-sm text-muted-foreground line-clamp-3">{r.responseText}</p>
              )}
              {r.errorMessage && (
                <p className="text-sm text-red-600">{r.errorMessage}</p>
              )}
              {r.latencyMs && (
                <p className="text-xs text-muted-foreground mt-1">{r.latencyMs}ms</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
