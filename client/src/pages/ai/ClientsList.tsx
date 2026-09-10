import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Client, ClientReadiness } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X, AlertCircle, Archive, RotateCcw, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function ClientsList() {
  const [, navigate] = useLocation();
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [expandedReadinessId, setExpandedReadinessId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const { data, isLoading, isError } = useQuery<{ data: Client[] }>({
    queryKey: ["/api/clients"],
  });

  const { data: readinessData } = useQuery<{ data: ClientReadiness[] }>({
    queryKey: ["/api/clients/readiness"],
  });

  const { data: archivedData, isLoading: isArchivedLoading } = useQuery<{ data: Client[] }>({
    queryKey: ["/api/clients/archived"],
    enabled: showArchived,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/archived"] });
      toast({ title: "Client archived" });
    },
    onError: (err) => {
      toast({ title: "Failed to archive client", description: String(err), variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/clients/${id}/restore`);
      return res.json() as Promise<{ data: Client }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients/archived"] });
      toast({ title: `Client "${result.data.name}" restored` });
    },
    onError: (err) => {
      toast({ title: "Failed to restore client", description: String(err), variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ id, confirmName: name }: { id: number; confirmName: string }) => {
      await apiRequest("DELETE", `/api/clients/${id}/permanent`, { confirmName: name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients/archived"] });
      toast({ title: "Client permanently deleted" });
      setDeleteTarget(null);
      setConfirmName("");
    },
    onError: (err) => {
      toast({
        title: "Failed to permanently delete client",
        description: String(err),
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; primaryDomain: string }) => {
      const res = await apiRequest("POST", "/api/clients", body);
      return res.json() as Promise<{ data: Client }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setName("");
      setDomain("");
      setShowForm(false);
      toast({ title: `Client "${result.data.name}" created` });
      navigate(`/ai/clients/${result.data.id}`);
    },
    onError: (err) => {
      toast({
        title: "Failed to create client",
        description: String(err),
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    createMutation.mutate({ name: name.trim(), primaryDomain: domain.trim() });
  }

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading clients...</div>;
  if (isError) return <div className="p-8 text-destructive">Failed to load clients.</div>;

  const clients = data?.data ?? [];
  const readinessByClientId = new Map(
    (readinessData?.data ?? []).map((r) => [r.clientId, r]),
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[{ label: "Workflows", href: "/" }, { label: "Clients" }]}
      />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived clients" : "View archived clients"}
          </Button>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Client
            </Button>
          )}
        </div>
      </div>

      {/* New Client Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded-lg p-5 mb-6 bg-muted/30 space-y-4"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium">New Client</p>
            <button
              type="button"
              onClick={() => { setShowForm(false); setName(""); setDomain(""); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Client name *</Label>
              <Input
                id="client-name"
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-domain">Primary domain *</Label>
              <Input
                id="client-domain"
                placeholder="acme.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setShowForm(false); setName(""); setDomain(""); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !name.trim() || !domain.trim()}
            >
              {createMutation.isPending ? "Creating…" : "Create client"}
            </Button>
          </div>
        </form>
      )}

      {/* Perplexity key warning — shown until key is configured */}
      {authStatus?.config && !authStatus.config.perplexityConfigured && (
        <div className="mb-6 border border-orange-500/30 rounded-lg p-4 bg-orange-50/50 dark:bg-orange-950/20 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">Perplexity API key not configured</p>
            <p className="text-muted-foreground mb-2">
              Prompt runs will fail until you add your API key. Open any client's{" "}
              <strong>⚙ Integrations</strong> page for setup instructions, or add it
              directly to your <code className="bg-muted px-1 rounded">.env</code>:
            </p>
            <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">
              PERPLEXITY_API_KEY=pplx-...
            </code>
            <p className="text-xs text-muted-foreground mt-2">
              On cPanel: Setup Node.js App → Environment Variables → restart.
            </p>
          </div>
        </div>
      )}

      {/* Archived clients */}
      {showArchived && (
        <div className="mb-6 border rounded-lg p-4">
          <h2 className="font-medium mb-3">Archived clients</h2>
          {isArchivedLoading ? (
            <p className="text-muted-foreground text-sm">Loading archived clients...</p>
          ) : (archivedData?.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No archived clients.</p>
          ) : (
            <ul className="space-y-2">
              {(archivedData?.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center border rounded-lg p-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-sm ml-3">{c.primaryDomain}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restoreMutation.mutate(c.id)}
                    disabled={restoreMutation.isPending}
                    className="ml-auto"
                    aria-label={`Restore ${c.name}`}
                    title="Restore client"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDeleteTarget(c); setConfirmName(""); }}
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete ${c.name} permanently`}
                    title="Delete permanently"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Client list */}
      {clients.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-3">No clients yet.</p>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create your first client
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {clients.map((c) => {
            const readiness = readinessByClientId.get(c.id);
            const expanded = expandedReadinessId === c.id;
            return (
              <li
                key={c.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center">
                  <Link href={`/ai/clients/${c.id}`}>
                    <span className="font-medium text-primary hover:underline">{c.name}</span>
                  </Link>
                  <span className="text-muted-foreground text-sm ml-3">{c.primaryDomain}</span>
                  {readiness && (
                    readiness.ready ? (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Ready
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedReadinessId(expanded ? null : c.id)}
                        className="ml-auto text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                      >
                        Setup incomplete ({readiness.issues.length})
                      </button>
                    )
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => archiveMutation.mutate(c.id)}
                    disabled={archiveMutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Archive ${c.name}`}
                    title="Archive client"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
                {readiness && !readiness.ready && expanded && (
                  <ul className="mt-2 ml-1 list-disc list-inside text-xs space-y-0.5">
                    {readiness.actionableIssues.map((issue) => (
                      <li key={issue.message}>
                        <Link href={issue.href}>
                          <span className="text-muted-foreground hover:text-primary hover:underline">
                            {issue.message}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Permanent delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmName(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This deletes the client and every prompt, run, response, metric, and report
              tied to it. This cannot be undone. Type the client's name to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete-name">
              Type the client name to confirm: <strong>{deleteTarget?.name}</strong>
            </Label>
            <Input
              id="confirm-delete-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setDeleteTarget(null); setConfirmName(""); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteTarget ||
                confirmName !== deleteTarget.name ||
                permanentDeleteMutation.isPending
              }
              onClick={() =>
                deleteTarget &&
                permanentDeleteMutation.mutate({ id: deleteTarget.id, confirmName })
              }
            >
              {permanentDeleteMutation.isPending ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
