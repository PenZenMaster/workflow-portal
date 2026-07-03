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
import { Plus, X, AlertCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function ClientsList() {
  const [, navigate] = useLocation();
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [expandedReadinessId, setExpandedReadinessId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<{ data: Client[] }>({
    queryKey: ["/api/clients"],
  });

  const { data: readinessData } = useQuery<{ data: ClientReadiness[] }>({
    queryKey: ["/api/clients/readiness"],
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
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Client
          </Button>
        )}
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
                </div>
                {readiness && !readiness.ready && expanded && (
                  <ul className="mt-2 ml-1 list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                    {readiness.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
