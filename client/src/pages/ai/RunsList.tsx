import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PromptRun, PromptCollection, Platform } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { Breadcrumbs, useClientName } from "@/components/Breadcrumbs";

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
  const clientName = useClientName(id);
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<number[]>([]);

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

  const { data: platformsData } = useQuery<{ data: Platform[] }>({
    queryKey: ["/api/platforms"],
    enabled: showRunForm,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/runs`, {
        collectionId: Number(selectedCollectionId),
        platformIds: selectedPlatformIds,
      });
      return res.json() as Promise<{ data: { runId: number; totalJobs: number } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/runs`] });
      setShowRunForm(false);
      setSelectedCollectionId("");
      setSelectedPlatformIds([]);
      toast({ title: `Run started — ${result.data.totalJobs} prompt${result.data.totalJobs !== 1 ? "s" : ""} queued` });
    },
    onError: (err) => toast({ title: "Run failed to start", description: String(err), variant: "destructive" }),
  });

  const configuredSlugs = authStatus?.config?.configuredPlatforms ?? ["perplexity"];
  const availablePlatforms = (platformsData?.data ?? []).filter(
    (p) => configuredSlugs.includes(p.slug) && p.enabled
  );

  function togglePlatform(platformId: number) {
    setSelectedPlatformIds((prev) =>
      prev.includes(platformId) ? prev.filter((id) => id !== platformId) : [...prev, platformId]
    );
  }

  const runs = data?.data ?? [];
  const collections = collectionsData?.data ?? [];
  const activeCollections = collections.filter((c) => c.status === "active" || c.status === "draft");

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading runs...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: clientName, href: `/ai/clients/${id}` },
          { label: "Runs" },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Runs</h1>
        <Button size="sm" onClick={() => setShowRunForm(!showRunForm)}>
          <Play className="h-4 w-4 mr-1.5" />Trigger Run
        </Button>
      </div>

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
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">AI Platforms</label>
            {availablePlatforms.length === 0 ? (
              <p className="text-xs text-muted-foreground">No platforms configured. Add API keys in environment variables.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selectedPlatformIds.includes(p.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            )}
            {selectedPlatformIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedPlatformIds.length} platform{selectedPlatformIds.length !== 1 ? "s" : ""} selected
                — {selectedPlatformIds.length}× prompt count jobs will be queued.
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowRunForm(false); setSelectedCollectionId(""); setSelectedPlatformIds([]); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || !selectedCollectionId || selectedPlatformIds.length === 0}
            >
              {triggerMutation.isPending ? "Starting…" : "Start Run"}
            </Button>
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-2">No runs yet.</p>
          <p className="text-sm text-muted-foreground">Click <strong>Trigger Run</strong>, select a collection and platforms, then start.</p>
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
