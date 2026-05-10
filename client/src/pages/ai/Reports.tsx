import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ReportExport } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Plus, X } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const KIND_LABELS: Record<string, string> = {
  "csv-executive": "Executive Summary (CSV)",
  "csv-analyst": "Analyst Detail (CSV)",
  "csv-mentions": "Mentions Export (CSV)",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"csv-executive" | "csv-analyst" | "csv-mentions">("csv-executive");
  const [periodStart, setPeriodStart] = useState(thirtyDaysAgoIso);
  const [periodEnd, setPeriodEnd] = useState(todayIso);

  const { data, isLoading } = useQuery<{ data: ReportExport[] }>({
    queryKey: [`/api/clients/${id}/exports`],
    enabled: !!id,
    refetchInterval: (query) => {
      const list = query.state.data?.data ?? [];
      return list.some((e) => e.status === "queued") ? 5_000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/exports`, {
        kind,
        periodStart,
        periodEnd,
      });
      return res.json() as Promise<{ data: { exportId: number } }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/exports`] });
      setShowForm(false);
      toast({ title: "Export queued — generating CSV…" });
    },
    onError: (err) => toast({ title: "Failed to queue export", description: String(err), variant: "destructive" }),
  });

  const exports = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports &amp; Exports</h1>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New export
          </Button>
        )}
      </div>

      {/* Create export form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="border rounded-lg p-5 mb-6 bg-muted/30 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium">New Export</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="export-kind">Report type</Label>
            <select
              id="export-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="csv-executive">Executive Summary — headline KPIs by date</option>
              <option value="csv-analyst">Analyst Detail — mentions with sentiment scores</option>
              <option value="csv-mentions">Mentions Export — all detected brand mentions</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="period-start">Period start</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-end">Period end</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Queuing…" : "Generate export"}
            </Button>
          </div>
        </form>
      )}

      {/* Export list */}
      {exports.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-2">No exports yet.</p>
          <p className="text-sm text-muted-foreground">Click <strong>New export</strong> to generate a CSV report for any date range.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {exports.map((e) => (
            <li key={e.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className={`text-xs px-2 py-0.5 rounded mr-2 ${STATUS_STYLE[e.status]}`}>
                  {e.status}
                </span>
                <span className="text-sm font-medium">{KIND_LABELS[e.kind] ?? e.kind}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {e.periodStart} — {e.periodEnd}
                </span>
              </div>
              {e.status === "ready" ? (
                <a
                  href={`/api/exports/${e.id}/download`}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  download
                >
                  <Download className="h-3.5 w-3.5" />Download
                </a>
              ) : e.status === "queued" ? (
                <span className="text-xs text-muted-foreground animate-pulse">Processing…</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
