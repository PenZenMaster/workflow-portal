import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Prompt, PromptCollection, Platform } from "@shared/schema";
import { PROMPT_CATEGORIES } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Zap, Play, X } from "lucide-react";

export default function PromptCollectionDetail() {
  const { id, collectionId } = useParams<{ id: string; collectionId: string }>();
  const [, navigate] = useLocation();
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<number[]>([]);
  const [promptText, setPromptText] = useState("");
  const [category, setCategory] = useState<typeof PROMPT_CATEGORIES[number]>("category");
  const [geo, setGeo] = useState("");

  const { data: collectionData } = useQuery<{ data: PromptCollection }>({
    queryKey: [`/api/prompt-collections/${collectionId}`],
    enabled: !!collectionId,
  });

  const { data: promptsData, isLoading } = useQuery<{ data: Prompt[] }>({
    queryKey: [`/api/prompt-collections/${collectionId}/prompts`],
    enabled: !!collectionId,
  });

  const { data: platformsData } = useQuery<{ data: Platform[] }>({
    queryKey: ["/api/platforms"],
    enabled: showRunForm,
  });

  const addPromptMutation = useMutation({
    mutationFn: async (body: { text: string; category: string; geo?: string }) => {
      const res = await apiRequest("POST", `/api/prompt-collections/${collectionId}/prompts`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      setPromptText(""); setGeo(""); setShowForm(false);
      toast({ title: "Prompt added" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deletePromptMutation = useMutation({
    mutationFn: async (promptId: number) => {
      await apiRequest("DELETE", `/api/prompts/${promptId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      toast({ title: "Prompt removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prompt-collections/${collectionId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/prompt-collections`] });
      toast({ title: "Collection activated — ready to run" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/runs`, {
        collectionId: Number(collectionId),
        platformIds: selectedPlatformIds.length > 0 ? selectedPlatformIds : [1],
      });
      return res.json() as Promise<{ data: { runId: number; totalJobs: number } }>;
    },
    onSuccess: (result) => {
      toast({ title: `Run started — ${result.data.totalJobs} jobs queued` });
      navigate(`/ai/clients/${id}/runs`);
    },
    onError: (err) => toast({ title: "Run failed", description: String(err), variant: "destructive" }),
  });

  const collection = collectionData?.data;
  const prompts = promptsData?.data ?? [];
  const isActive = collection?.status === "active";
  const configuredSlugs = authStatus?.config?.configuredPlatforms ?? ["perplexity"];
  const availablePlatforms = (platformsData?.data ?? []).filter(
    (p) => configuredSlugs.includes(p.slug) && p.enabled
  );

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}/prompts`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Collections
        </Link>
      </div>

      {collection && (
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">v{collection.version}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-muted text-muted-foreground"}`}>
                {collection.status}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isActive && (
              <Button size="sm" variant="outline" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending || prompts.length === 0}>
                <Zap className="h-4 w-4 mr-1.5" />{activateMutation.isPending ? "Activating…" : "Activate"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setShowRunForm(!showRunForm)}
              disabled={prompts.length === 0}
              title={prompts.length === 0 ? "Add prompts first" : "Select platforms and run"}
            >
              <Play className="h-4 w-4 mr-1.5" />
              Run Now
            </Button>
          </div>
        </div>
      )}

      {/* Platform selection for run */}
      {showRunForm && collection && (
        <div className="border rounded-lg p-4 mb-6 bg-muted/30 space-y-3">
          <p className="text-sm font-medium">Select platforms to query</p>
          {availablePlatforms.length === 0 ? (
            <p className="text-xs text-muted-foreground">No platforms configured — add API keys in environment variables.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlatformIds((prev) =>
                    prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                  )}
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
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowRunForm(false); setSelectedPlatformIds([]); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => { setShowRunForm(false); runMutation.mutate(); }}
              disabled={runMutation.isPending || selectedPlatformIds.length === 0}
            >
              {runMutation.isPending ? "Starting…" : `Start Run (${selectedPlatformIds.length} platform${selectedPlatformIds.length !== 1 ? "s" : ""})`}
            </Button>
          </div>
        </div>
      )}

      {/* Add prompt form */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Prompts <span className="text-muted-foreground font-normal text-sm">({prompts.length})</span>
        </h2>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Add prompt
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (promptText.trim()) addPromptMutation.mutate({ text: promptText.trim(), category, geo: geo.trim() || undefined }); }}
          className="border rounded-lg p-5 mb-5 bg-muted/30 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">New Prompt</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prompt-text">Prompt text *</Label>
            <Input
              id="prompt-text"
              placeholder='e.g. "Best SEO agency in Seattle"'
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-category">Category</Label>
              <select
                id="prompt-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof PROMPT_CATEGORIES[number])}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {PROMPT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-geo">Geography (optional)</Label>
              <Input id="prompt-geo" placeholder='e.g. "Seattle, WA"' value={geo} onChange={(e) => setGeo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setPromptText(""); setGeo(""); }}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addPromptMutation.isPending || !promptText.trim()}>
              {addPromptMutation.isPending ? "Adding…" : "Add prompt"}
            </Button>
          </div>
        </form>
      )}

      {prompts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm mb-2">No prompts yet.</p>
          <p className="text-xs text-muted-foreground">Add the search queries you want to track — e.g. "best SEO agency in Seattle", "top local SEO company near me".</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={p.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm">{p.text}</p>
                <div className="flex gap-2 mt-1.5">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.category}</span>
                  <span className="text-xs text-muted-foreground">{p.funnelStage}</span>
                  {p.geo && <span className="text-xs text-muted-foreground">{p.geo}</span>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deletePromptMutation.mutate(p.id)}
                disabled={deletePromptMutation.isPending}
                className="text-destructive hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
