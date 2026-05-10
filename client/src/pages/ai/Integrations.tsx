import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Integration } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertCircle, CheckCircle2, Trash2, TestTube } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failing: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  disabled: "bg-muted text-muted-foreground",
};

export default function Integrations() {
  const { id } = useParams<{ id: string }>();
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ data: Integration[] }>({
    queryKey: [`/api/clients/${id}/integrations`],
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { kind: string; config: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/clients/${id}/integrations`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      setPropertyId("");
      setShowForm(false);
      toast({ title: "GA4 integration added" });
    },
    onError: (err) => {
      toast({ title: "Failed to add integration", description: String(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      await apiRequest("DELETE", `/api/clients/${id}/integrations/${integrationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      toast({ title: "Integration removed" });
    },
    onError: (err) => {
      toast({ title: "Failed to remove", description: String(err), variant: "destructive" });
    },
  });

  async function handleTest(integrationId: number) {
    setTestingId(integrationId);
    try {
      const res = await apiRequest(
        "POST",
        `/api/clients/${id}/integrations/${integrationId}/test`
      );
      const result = (await res.json()) as { data: { ok: boolean; error: string | null } };
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      if (result.data.ok) {
        toast({ title: "Connection test passed" });
      } else {
        toast({
          title: "Connection test failed",
          description: result.data.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Test error", description: String(err), variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId.trim()) return;
    createMutation.mutate({ kind: "ga4", config: { propertyId: propertyId.trim() } });
  }

  const list = data?.data ?? [];
  const perplexityOk = authStatus?.config?.perplexityConfigured ?? false;
  const ga4KeyOk = authStatus?.config?.ga4KeyConfigured ?? false;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/ai/clients/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Integrations &amp; API Keys</h1>

      {/* ── Perplexity API Key ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Perplexity API Key</h2>
        <div
          className={`border rounded-lg p-4 flex items-start gap-3 ${
            perplexityOk
              ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
              : "border-orange-500/30 bg-orange-50/50 dark:bg-orange-950/20"
          }`}
        >
          {perplexityOk ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
          )}
          <div className="text-sm">
            <p className="font-medium mb-1">
              {perplexityOk ? "API key is configured" : "API key is not configured"}
            </p>
            {!perplexityOk && (
              <div className="text-muted-foreground space-y-2">
                <p>Without this key, prompt runs will fail. To configure:</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>
                    Get a key at{" "}
                    <span className="font-mono text-xs bg-muted px-1 rounded">
                      perplexity.ai/settings/api
                    </span>
                  </li>
                  <li>
                    Add to{" "}
                    <span className="font-mono text-xs bg-muted px-1 rounded">.env</span>:
                    <br />
                    <span className="font-mono text-xs bg-muted px-1 rounded">
                      PERPLEXITY_API_KEY=pplx-...
                    </span>
                  </li>
                  <li>
                    Optionally cap daily spend:
                    <br />
                    <span className="font-mono text-xs bg-muted px-1 rounded">
                      PERPLEXITY_DAILY_USD_LIMIT=10
                    </span>
                  </li>
                  <li>Restart the server</li>
                </ol>
                <p className="text-xs pt-1">
                  On cPanel: add these in Setup Node.js App → Environment Variables, then
                  restart.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Google Analytics 4 ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Google Analytics 4</h2>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add GA4
            </Button>
          )}
        </div>

        {/* Service account key status */}
        <div
          className={`border rounded-lg p-3 mb-4 flex items-start gap-2 text-sm ${
            ga4KeyOk
              ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
              : "border-muted"
          }`}
        >
          {ga4KeyOk ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          )}
          <span className="text-muted-foreground">
            {ga4KeyOk ? (
              "Service account JSON is configured."
            ) : (
              <>
                Service account not configured — set{" "}
                <span className="font-mono text-xs bg-muted px-1 rounded">
                  GA4_SERVICE_ACCOUNT_KEY_PATH
                </span>{" "}
                to the path of your service account JSON file, then restart.
              </>
            )}
          </span>
        </div>

        {/* Creation form */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="border rounded-lg p-5 mb-4 bg-muted/30 space-y-4"
          >
            <p className="font-medium text-sm">Add GA4 Integration</p>
            <div className="space-y-1.5">
              <Label htmlFor="ga4-property">GA4 Property ID *</Label>
              <Input
                id="ga4-property"
                placeholder="G-XXXXXXXXXX or numeric property ID"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Find this in GA4 → Admin → Property Settings → Property ID.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setPropertyId("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || !propertyId.trim()}
              >
                {createMutation.isPending ? "Adding…" : "Add integration"}
              </Button>
            </div>
          </form>
        )}

        {/* Integration list */}
        {list.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">
            No GA4 integrations yet. Add one above to track AI-sourced traffic.
          </p>
        ) : (
          <ul className="space-y-3">
            {list.map((i) => (
              <li key={i.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm uppercase">{i.kind}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[i.status]}`}
                    >
                      {i.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(i.id)}
                      disabled={testingId === i.id}
                      title="Test connection"
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      {testingId === i.id ? "Testing…" : "Test"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(i.id)}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {i.kind === "ga4" &&
                  (i.config as { propertyId?: string }).propertyId && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Property:{" "}
                      <span className="font-mono text-xs">
                        {(i.config as { propertyId: string }).propertyId}
                      </span>
                    </p>
                  )}
                {i.lastSyncedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last synced: {new Date(i.lastSyncedAt).toLocaleString()}
                  </p>
                )}
                {i.lastError && (
                  <p className="text-xs text-red-600 mt-1">{i.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
