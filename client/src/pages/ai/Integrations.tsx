import { useState, useEffect } from "react";
import { useParams, Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Integration } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Trash2, TestTube, ExternalLink } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failing: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  disabled: "bg-muted text-muted-foreground",
};

export default function Integrations() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const justConnected = params.get("connected") === "1";
  const oauthError = params.get("oauthError");

  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(null);
  const [propertyIdValue, setPropertyIdValue] = useState("");
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ data: Integration[] }>({
    queryKey: [`/api/clients/${id}/integrations`],
    enabled: !!id,
  });

  useEffect(() => {
    if (justConnected) toast({ title: "Google Analytics connected successfully" });
    if (oauthError)
      toast({
        title: "Google connection failed",
        description: decodeURIComponent(oauthError),
        variant: "destructive",
      });
  }, []); // fire once on mount — params are read from URL, no re-fetch needed

  const deleteMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      await apiRequest("DELETE", `/api/clients/${id}/integrations/${integrationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      toast({ title: "Integration removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const savePropertyMutation = useMutation({
    mutationFn: async ({ integrationId, propertyId }: { integrationId: number; propertyId: string }) => {
      await apiRequest("PATCH", `/api/integrations/${integrationId}/property`, { propertyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      setEditingPropertyId(null);
      toast({ title: "Property ID saved" });
    },
    onError: (err) => toast({ title: "Failed to save", description: String(err), variant: "destructive" }),
  });

  async function handleTest(integrationId: number) {
    setTestingId(integrationId);
    try {
      const res = await apiRequest("POST", `/api/clients/${id}/integrations/${integrationId}/test`);
      const result = (await res.json()) as { data: { ok: boolean; error: string | null } };
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/integrations`] });
      result.data.ok
        ? toast({ title: "Connection test passed" })
        : toast({ title: "Test failed", description: result.data.error ?? "", variant: "destructive" });
    } catch (err) {
      toast({ title: "Test error", description: String(err), variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  }

  const list = data?.data ?? [];
  const ga4Integration = list.find((i) => i.kind === "ga4");
  const perplexityOk = authStatus?.config?.perplexityConfigured ?? false;
  const googleOAuthOk = authStatus?.config?.googleOAuthConfigured ?? false;
  const ga4Config = ga4Integration?.config as { propertyId?: string; connectedEmail?: string } | undefined;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Integrations &amp; API Keys</h1>

      {/* ── Perplexity API Key ────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Perplexity API Key</h2>
        <div className={`border rounded-lg p-4 flex items-start gap-3 ${perplexityOk ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" : "border-orange-500/30 bg-orange-50/50 dark:bg-orange-950/20"}`}>
          {perplexityOk
            ? <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            : <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />}
          <div className="text-sm">
            <p className="font-medium mb-1">{perplexityOk ? "API key configured" : "API key not configured"}</p>
            {!perplexityOk && (
              <div className="text-muted-foreground space-y-2">
                <p>Add to <code className="bg-muted px-1 rounded">.env</code> and restart:</p>
                <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">PERPLEXITY_API_KEY=pplx-...</code>
                <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">PERPLEXITY_DAILY_USD_LIMIT=10</code>
                <p className="text-xs">On cPanel: Setup Node.js App → Environment Variables → Restart.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Google Analytics 4 ───────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Google Analytics 4</h2>

        {!googleOAuthOk && (
          <div className="border border-orange-500/30 rounded-lg p-4 mb-4 flex items-start gap-3 bg-orange-50/50 dark:bg-orange-950/20 text-sm">
            <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">OAuth credentials not configured</p>
              <p>Add these to your .env and restart:</p>
              <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">GOOGLE_CLIENT_ID=...apps.googleusercontent.com</code>
              <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">GOOGLE_CLIENT_SECRET=GOCSPX-...</code>
              <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">GOOGLE_REDIRECT_URI=https://yourportal.com/api/oauth/google/callback</code>
            </div>
          </div>
        )}

        {ga4Integration ? (
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-sm">Google Analytics connected</p>
                  {ga4Config?.connectedEmail && (
                    <p className="text-xs text-muted-foreground">{ga4Config.connectedEmail}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[ga4Integration.status]}`}>
                  {ga4Integration.status}
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleTest(ga4Integration.id)} disabled={testingId === ga4Integration.id}>
                  <TestTube className="h-4 w-4 mr-1" />{testingId === ga4Integration.id ? "Testing…" : "Test"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(ga4Integration.id)} disabled={deleteMutation.isPending} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Property ID */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium block mb-1.5">GA4 Property ID</Label>
              {editingPropertyId === ga4Integration.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); savePropertyMutation.mutate({ integrationId: ga4Integration.id, propertyId: propertyIdValue }); }}
                  className="space-y-1.5"
                >
                  <div className="flex gap-2">
                    <Input
                      value={propertyIdValue}
                      onChange={(e) => setPropertyIdValue(e.target.value)}
                      placeholder="123456789"
                      className="max-w-xs"
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={savePropertyMutation.isPending}>
                      {savePropertyMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPropertyId(null)}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Numbers only. Found in GA4 → Admin → Property Settings → Property ID (not the G-... Measurement ID).
                  </p>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  {ga4Config?.propertyId
                    ? <code className="text-sm bg-muted px-2 py-0.5 rounded">{ga4Config.propertyId}</code>
                    : <span className="text-sm text-orange-600">Not set — required to fetch traffic data</span>}
                  <Button variant="ghost" size="sm" onClick={() => { setEditingPropertyId(ga4Integration.id); setPropertyIdValue(ga4Config?.propertyId ?? ""); }}>
                    {ga4Config?.propertyId ? "Change" : "Set property ID"}
                  </Button>
                </div>
              )}
            </div>

            {ga4Integration.lastError && (
              <p className="text-xs text-red-600 border-t pt-3">{ga4Integration.lastError}</p>
            )}

            {googleOAuthOk && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">Need to switch to a different Google account?</p>
                <a href={`/api/clients/${id}/integrations/ga4/auth`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  Re-connect Google account <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed rounded-lg p-8 text-center space-y-3">
            <p className="font-medium">Connect Google Analytics</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Sign in with the Google account that has Viewer access to this client's GA4 property.
            </p>
            {googleOAuthOk ? (
              <a href={`/api/clients/${id}/integrations/ga4/auth`}>
                <Button className="mt-2">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Google Analytics
                </Button>
              </a>
            ) : (
              <Button disabled className="mt-2">Connect Google Analytics</Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
