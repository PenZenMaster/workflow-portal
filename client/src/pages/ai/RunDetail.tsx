import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PromptRun, ResponseRaw, RecommendationStatus, ResponseRecommendation } from "@shared/schema";
import { RECOMMENDATION_STATUSES } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { isReparseComplete, reparseProgressLabel, type ReparseStatus } from "./reparseStatus";
import { Breadcrumbs, useClientName } from "@/components/Breadcrumbs";

const TERMINAL = new Set(["complete", "partial", "failed"]);

type RecommendationRow = ResponseRecommendation & { brandName: string };

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function ResponseRecommendations({ responseId }: { responseId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<{ data: RecommendationRow[] }>({
    queryKey: [`/api/responses/${responseId}/recommendations`],
    enabled: open,
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: RecommendationStatus }) => {
      const res = await apiRequest("PATCH", `/api/response-recommendations/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/responses/${responseId}/recommendations`] });
      toast({ title: "Override saved", description: "Metrics use the corrected status from the next aggregate." });
    },
    onError: (err) => toast({ title: "Override failed", description: String(err), variant: "destructive" }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Recommendations
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No brand classifications for this response.</p>
          ) : (
            rows.map((r) => {
              const effective = r.humanStatus ?? r.status;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                  <span className="font-medium">{r.brandName}</span>
                  <span className="text-muted-foreground">
                    machine: {formatStatus(r.status)}
                    {r.rank != null && ` (rank ${r.rank})`}
                  </span>
                  {r.humanStatus && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      overridden
                    </span>
                  )}
                  <label className="ml-auto flex items-center gap-1">
                    <span className="sr-only">{`Override status for ${r.brandName}`}</span>
                    <select
                      aria-label={`Override status for ${r.brandName}`}
                      className="rounded border bg-background px-1 py-0.5"
                      value={effective}
                      disabled={overrideMutation.isPending}
                      onChange={(e) =>
                        overrideMutation.mutate({ id: r.id, status: e.target.value as RecommendationStatus })
                      }
                    >
                      {RECOMMENDATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {formatStatus(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {r.evidenceExcerpt && (
                    <p className="w-full text-muted-foreground italic truncate">"{r.evidenceExcerpt}"</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const { toast } = useToast();
  const [reparseSince, setReparseSince] = useState<number | null>(null);

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

  const reparseStatusQuery = useQuery<{ data: ReparseStatus }>({
    queryKey: [`/api/runs/${runId}/reparse-status?since=${reparseSince}`],
    enabled: !!runId && reparseSince !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.data;
      return status && isReparseComplete(status) ? false : 3_000;
    },
  });

  const reparseStatus = reparseStatusQuery.data?.data;
  const reparseDone = !!reparseStatus && isReparseComplete(reparseStatus);
  const reparseRefreshedRef = useRef<number | null>(null);
  const clientId = data?.data.run.clientId;
  const clientName = useClientName(clientId);

  useEffect(() => {
    if (!reparseDone || reparseSince === null) return;
    if (reparseRefreshedRef.current === reparseSince) return;
    reparseRefreshedRef.current = reparseSince;

    queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}`] });
    if (clientId !== undefined) {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith(`/api/clients/${clientId}`),
      });
    }
  }, [reparseDone, reparseSince, runId, clientId]);

  const reparseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/runs/${runId}/reparse`);
      return res.json() as Promise<{ data: { reparsedCount: number } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}`] });
      setReparseSince(Date.now());
      toast({
        title: `Re-parsing ${result.data.reparsedCount} responses`,
        description: "Mentions and metrics will update in 1–2 minutes.",
      });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/runs/${runId}/retry-failed`);
      return res.json() as Promise<{ data: { retriedCount: number } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/runs/${runId}`] });
      toast({ title: `Retrying ${result.data.retriedCount} failed response(s)` });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!data) return <div className="p-8 text-destructive">Run not found.</div>;

  const { run, responses } = data.data;
  const completedCount = responses.filter((r) => r.status === "complete").length;
  const tokenTotals = responses.reduce(
    (acc, r) => {
      if (r.inputTokens != null || r.outputTokens != null) {
        acc.any = true;
        acc.input += r.inputTokens ?? 0;
        acc.output += r.outputTokens ?? 0;
      }
      return acc;
    },
    { input: 0, output: 0, any: false }
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: clientName, href: `/ai/clients/${run.clientId}` },
          { label: "Runs", href: `/ai/clients/${run.clientId}/runs` },
          { label: `Run #${run.id}` },
        ]}
      />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Run #{run.id}</h1>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Status: <strong className="text-foreground">{run.status}</strong></span>
            <span>{run.completedPrompts}/{run.totalPrompts} complete</span>
            {run.failedPrompts > 0 && <span className="text-red-600">{run.failedPrompts} failed</span>}
            {tokenTotals.any && (
              <span title="Total LLM tokens billed for this run (input / output)">
                Tokens: {tokenTotals.input.toLocaleString()} in / {tokenTotals.output.toLocaleString()} out
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {TERMINAL.has(run.status) && run.failedPrompts > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => retryFailedMutation.mutate()}
              disabled={retryFailedMutation.isPending}
              title="Requeue failed responses for another attempt — useful after a transient API error or rate limit"
            >
              <RotateCcw className={`h-4 w-4 mr-1.5 ${retryFailedMutation.isPending ? "animate-spin" : ""}`} />
              {retryFailedMutation.isPending ? "Retrying…" : "Retry failed"}
            </Button>
          )}
          {TERMINAL.has(run.status) && completedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => reparseMutation.mutate()}
              disabled={reparseMutation.isPending}
              title="Re-run the mention/citation/metric extraction — useful if you added brands after the run completed"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${reparseMutation.isPending ? "animate-spin" : ""}`} />
              {reparseMutation.isPending ? "Re-parsing…" : "Re-parse responses"}
            </Button>
          )}
        </div>
      </div>

      {reparseStatus && reparseStatus.total > 0 && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            reparseDone
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-muted bg-muted/50 text-muted-foreground"
          }`}
        >
          {reparseDone ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin" />
          )}
          {reparseDone ? "Re-parse complete" : reparseProgressLabel(reparseStatus)}
          {reparseStatus.failed > 0 && (
            <span className="text-red-600">({reparseStatus.failed} failed)</span>
          )}
        </div>
      )}

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
              {r.status === "complete" && <ResponseRecommendations responseId={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
