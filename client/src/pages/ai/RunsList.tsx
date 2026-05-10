import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PromptRun, PromptCollection } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

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
  const { toast } = useToast();
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");

  const { data, isLoading } = useQuery<{ data: PromptRun[] }>({
    queryKey: [`/api/clients/${id}/runs`],
    enabled: !!id,
    refetchInterval: (query) => {
      const runs = query.state.data?.data ?? [];
      return runs.some((r) => !TERMINAL.has(r.status)) ? 5_000 : false;
    },
  });

  const { data: collectionsData } = useQuery<{ data: PromptCollection[] }>({
    queryKey: [`/api/clients/${id}/prompt-collections`],
    enabled: showRunForm,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/runs`, {
        collectionId: Number(selectedCollectionId),
        platformIds: [1], // Perplexity
      });
      return res.json() as Promise<{ data: { runId: number; totalJobs: number } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/runs`] });
      setShowRunForm(false);
      setSelectedCollectionId("");
      toast({ title: `Run started — ${result.data.totalJobs} prompt${result.data.totalJobs !== 1 ? "s" : ""} queued` });
    },
    onError: (err) => toast({ title: "Run failed to start", description: String(err), variant: "destructive" }),
  });

  const runs = data?.data ?? [];
  const collections = collectionsData?.data ?? [];
  const activeCollections = collections.filter((c) => c.status === "active" || c.status === "draft");

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading runs...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Runs</h1>
        <Button size="sm" onClick={() => setShowRunForm(!showRunForm)}>
          <Play className="h-4 w-4 mr-1.5" />Trigger Run
        </Button>
      </div>

      {/* Trigger run form */}
      {showRunForm && (
        <div className="border rounded-lg p-5 mb-6 bg-muted/30 space-y-4">
          <p className="font-medium text-sm">Trigger a New Run</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prompt Collection</label>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a collection…</option>
              {activeCollections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status}) — {c.id}
                </option>
              ))}
            </select>
            {activeCollections.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No collections yet.{" "}
                <Link href={`/ai/clients/${id}/prompts`} className="text-primary hover:underline">
                  Create a prompt collection first.
                </Link>
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Prompts will be sent to Perplexity. Results appear in Mentions, Overview, and Sentiment once processing completes.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowRunForm(false); setSelectedCollectionId(""); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || !selectedCollectionId}
            >
              {triggerMutation.isPending ? "Starting…" : "Start Run"}
            </Button>
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-2">No runs yet.</p>
          <p className="text-sm text-muted-foreground">Click <strong>Trigger Run</strong> to send your prompt collection to Perplexity and start collecting AI visibility data.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <li key={r.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
              <Link href={`/ai/runs/${r.id}`}>
                <span className="font-medium text-primary hover:underline">Run #{r.id}</span>
              </Link>
              <span className={`ml-3 text-xs px-2 py-0.5 rounded ${STATUS_COLOURS[r.status] ?? ""}`}>{r.status}</span>
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
