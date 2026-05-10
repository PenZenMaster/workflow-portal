import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Client } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

export default function ClientsList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  const { data, isLoading, isError } = useQuery<{ data: Client[] }>({
    queryKey: ["/api/clients"],
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

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Workflows
          </Link>
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
          {clients.map((c) => (
            <li
              key={c.id}
              className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <Link href={`/ai/clients/${c.id}`}>
                <span className="font-medium text-primary hover:underline">{c.name}</span>
              </Link>
              <span className="text-muted-foreground text-sm ml-3">{c.primaryDomain}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
