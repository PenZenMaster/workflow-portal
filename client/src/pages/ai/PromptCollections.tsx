import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PromptCollection } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Zap } from "lucide-react";

const STATUS_COLOURS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted/50 text-muted-foreground/60",
};

export default function PromptCollections() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<{ data: PromptCollection[] }>({
    queryKey: [`/api/clients/${id}/prompt-collections`],
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/clients/${id}/prompt-collections`, body);
      return res.json() as Promise<{ data: PromptCollection }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/prompt-collections`] });
      setName(""); setNotes(""); setShowForm(false);
      toast({ title: "Collection created" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (collectionId: number) => {
      await apiRequest("POST", `/api/prompt-collections/${collectionId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/prompt-collections`] });
      toast({ title: "Collection activated" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const collections = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Prompt Collections</h1>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New collection
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate({ name: name.trim(), notes: notes.trim() || undefined }); }}
          className="border rounded-lg p-5 mb-6 bg-muted/30 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium">New Collection</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-name">Name *</Label>
            <Input id="col-name" placeholder="e.g. Q2 Local SEO Audit" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-notes">Notes (optional)</Label>
            <Input id="col-notes" placeholder="Description or context" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setName(""); setNotes(""); }}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      )}

      {collections.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-3">No prompt collections yet.</p>
          <p className="text-sm text-muted-foreground">Create a collection, add prompts, then trigger a run to start tracking AI visibility.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {collections.map((c) => (
            <li key={c.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <Link href={`/ai/clients/${id}/prompts/${c.id}`}>
                  <span className="font-medium hover:underline text-primary">{c.name}</span>
                </Link>
                <span className={`ml-3 text-xs px-2 py-0.5 rounded ${STATUS_COLOURS[c.status]}`}>{c.status}</span>
                <span className="ml-2 text-xs text-muted-foreground">v{c.version}</span>
                {c.notes && <p className="text-sm text-muted-foreground mt-0.5">{c.notes}</p>}
              </div>
              {c.status === "draft" && (
                <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(c.id)} disabled={activateMutation.isPending}>
                  <Zap className="h-3.5 w-3.5 mr-1" />Activate
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
