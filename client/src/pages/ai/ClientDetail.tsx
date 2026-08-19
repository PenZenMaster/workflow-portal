import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Client, Brand, BrandAlias, ClientReadiness } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ChevronDown, ChevronRight, X, AlertCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InfoTooltip } from "@/components/InfoTooltip";
import { MeasurementHealthSection } from "./sections/MeasurementHealthSection";
import { OverviewSection } from "./sections/OverviewSection";
import { PlatformBreakdownSection } from "./sections/PlatformBreakdownSection";
import { MentionsSection } from "./sections/MentionsSection";
import { SoVSection } from "./sections/SoVSection";
import { SentimentSection } from "./sections/SentimentSection";
import { SourcesSection } from "./sections/SourcesSection";
import { RecommendationsSection } from "./sections/RecommendationsSection";
import { TrafficSection } from "./sections/TrafficSection";
import { TokenUsageSection } from "./sections/TokenUsageSection";

// ---------------------------------------------------------------------------
// Brand row — handles its own aliases and expand/collapse state

function BrandRow({ brand, clientId }: { brand: Brand; clientId: string }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [aliasText, setAliasText] = useState("");
  const [showAliasForm, setShowAliasForm] = useState(false);

  const { data: aliasData } = useQuery<{ data: BrandAlias[] }>({
    queryKey: [`/api/brands/${brand.id}/aliases`],
    enabled: expanded,
  });
  const aliases = aliasData?.data ?? [];

  const addAliasMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", `/api/brands/${brand.id}/aliases`, {
        aliasText: text,
        matchType: "exact",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brands/${brand.id}/aliases`] });
      setAliasText("");
      setShowAliasForm(false);
      toast({ title: "Alias added" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteAliasMutation = useMutation({
    mutationFn: async (aliasId: number) => {
      await apiRequest("DELETE", `/api/brand-aliases/${aliasId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brands/${brand.id}/aliases`] });
      toast({ title: "Alias removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteBrandMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/brands/${brand.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/brands`] });
      toast({ title: "Brand removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  return (
    <li className="border rounded-lg">
      {/* Brand header row */}
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
          title={expanded ? "Collapse" : "Expand to manage aliases"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="font-medium flex-1">{brand.canonicalName}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${brand.kind === "client" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" : "bg-muted text-muted-foreground"}`}>
          {brand.kind}
        </span>
        {brand.primaryDomain && (
          <span className="text-sm text-muted-foreground">{brand.primaryDomain}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => deleteBrandMutation.mutate()}
          disabled={deleteBrandMutation.isPending}
          className="text-destructive hover:text-destructive ml-auto"
          title="Remove brand"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Aliases section (expanded) */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Aliases — names the AI response parser will detect
              </p>
              <InfoTooltip
                label="About aliases"
                text="The brand's canonical name already matches automatically. Add aliases for the alternate forms AI answers actually use: abbreviations, short forms, misspellings, or domain names."
              />
            </div>
            {!showAliasForm && (
              <Button size="sm" variant="ghost" onClick={() => setShowAliasForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add alias
              </Button>
            )}
          </div>

          {showAliasForm && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (aliasText.trim()) addAliasMutation.mutate(aliasText.trim()); }}
              className="flex gap-2"
            >
              <Input
                value={aliasText}
                onChange={(e) => setAliasText(e.target.value)}
                placeholder='e.g. "Acme Corp." or "AcmeSEO"'
                className="h-8 text-sm"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={addAliasMutation.isPending || !aliasText.trim()}>
                {addAliasMutation.isPending ? "…" : "Add"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAliasForm(false); setAliasText(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </form>
          )}

          {aliases.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No aliases yet. Add alternate names, abbreviations, or common misspellings.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {aliases.map((a) => (
                <li key={a.id} className="flex items-center gap-1 bg-background border rounded px-2 py-0.5 text-sm">
                  <span>{a.aliasText}</span>
                  <span className="text-xs text-muted-foreground">({a.matchType})</span>
                  <button
                    type="button"
                    onClick={() => deleteAliasMutation.mutate(a.id)}
                    disabled={deleteAliasMutation.isPending}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main page

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandKind, setBrandKind] = useState<"client" | "competitor">("client");
  const [brandDomain, setBrandDomain] = useState("");

  const { data: clientData, isLoading } = useQuery<{ data: Client }>({
    queryKey: [`/api/clients/${id}`],
    enabled: !!id,
  });

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: [`/api/clients/${id}/brands`],
    enabled: !!id,
  });

  const { data: readinessData } = useQuery<{ data: ClientReadiness }>({
    queryKey: [`/api/clients/${id}/readiness`],
    enabled: !!id,
  });

  const addBrandMutation = useMutation({
    mutationFn: async (body: { canonicalName: string; kind: string; primaryDomain?: string }) => {
      await apiRequest("POST", `/api/clients/${id}/brands`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/brands`] });
      setBrandName(""); setBrandDomain(""); setBrandKind("client"); setShowBrandForm(false);
      toast({ title: "Brand added" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!clientData) return <div className="p-8 text-destructive">Client not found.</div>;

  const client = clientData.data;
  const brands = brandsData?.data ?? [];
  const readiness = readinessData?.data;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: client.name },
        ]}
      />

      <h1 className="text-2xl font-bold mb-1">{client.name}</h1>
      <p className="text-muted-foreground mb-6">{client.primaryDomain}</p>

      {client.geographies.length > 0 && (
        <div className="mb-4">
          <span className="text-sm font-medium">Geographies: </span>
          <span className="text-sm text-muted-foreground">{client.geographies.join(", ")}</span>
        </div>
      )}

      {readiness && !readiness.ready && (
        <div className="mb-6 border border-orange-500/30 rounded-lg p-4 bg-orange-50/50 dark:bg-orange-950/20 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">Setup incomplete</p>
            <p className="text-muted-foreground mb-2">
              The following items need attention before AI Visibility data for this
              client will be meaningful:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {readiness.actionableIssues.map((issue) => (
                <li key={issue.message}>
                  <Link href={issue.href} className="hover:underline hover:text-foreground">
                    {issue.message}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap gap-3 mb-8">
        {[
          ["Reports", `/ai/clients/${id}/reports`],
          ["Prompt Collections", `/ai/clients/${id}/prompts`],
          ["Runs", `/ai/clients/${id}/runs`],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
          >
            {label}
          </Link>
        ))}
        <Link
          href={`/ai/clients/${id}/settings/integrations`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors bg-primary/5"
        >
          ⚙ Integrations
        </Link>
      </div>

      {/* Compact summary — the 5 charts an operator checks first */}
      <div className="space-y-12 mb-16">
        <OverviewSection clientId={id!} />
        <SentimentSection clientId={id!} />
        <SoVSection clientId={id!} />
        <TrafficSection clientId={id!} />
        <RecommendationsSection clientId={id!} />
      </div>

      {/* Brands section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Brands</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The parser uses these names and aliases to detect your client in AI responses.
            </p>
          </div>
          {!showBrandForm && (
            <Button size="sm" variant="outline" onClick={() => setShowBrandForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Add brand
            </Button>
          )}
        </div>

        {/* Add brand form */}
        {showBrandForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (brandName.trim())
                addBrandMutation.mutate({
                  canonicalName: brandName.trim(),
                  kind: brandKind,
                  primaryDomain: brandDomain.trim() || undefined,
                });
            }}
            className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">New Brand</p>
              <button type="button" onClick={() => setShowBrandForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1 space-y-1">
                <Label htmlFor="brand-name" className="text-xs">Canonical name *</Label>
                <Input
                  id="brand-name"
                  placeholder="Acme SEO"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  required
                  autoFocus
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="brand-kind" className="text-xs">Kind</Label>
                  <InfoTooltip
                    label="About brand Kind"
                    text="AI Share of Voice is the client brand's mentions divided by total mentions across all brands. Add exactly one Client brand (your agency's own client) and at least one Competitor brand, or the ratio will read as a meaningless 0% or 100%."
                  />
                </div>
                <select
                  id="brand-kind"
                  value={brandKind}
                  onChange={(e) => setBrandKind(e.target.value as "client" | "competitor")}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="client">Client (your brand)</option>
                  <option value="competitor">Competitor</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="brand-domain" className="text-xs">Primary domain (optional)</Label>
                <Input
                  id="brand-domain"
                  placeholder="acme-seo.com"
                  value={brandDomain}
                  onChange={(e) => setBrandDomain(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              After adding the brand, expand it to add aliases (common misspellings, abbreviations, shortened names).
            </p>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowBrandForm(false); setBrandName(""); setBrandDomain(""); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={addBrandMutation.isPending || !brandName.trim()}>
                {addBrandMutation.isPending ? "Adding…" : "Add brand"}
              </Button>
            </div>
          </form>
        )}

        {/* Brand list */}
        {brands.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center">
            <p className="text-muted-foreground text-sm mb-1">No brands configured.</p>
            <p className="text-xs text-muted-foreground">
              Add your client brand first, then any competitors you want to track. The canonical name and aliases are what the AI response parser looks for.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {brands.map((b) => (
              <BrandRow key={b.id} brand={b} clientId={id!} />
            ))}
          </ul>
        )}
      </section>

      {/* AI Visibility reports — all on one page */}
      <div className="mt-12">
        <MeasurementHealthSection clientId={id!} />
      </div>

      {/* Detailed data — reachable via "View ..." links above, or by scrolling */}
      <div className="mt-16 pt-8 border-t space-y-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Detailed Data
        </h2>
        <div id="platform-breakdown-section">
          <PlatformBreakdownSection clientId={id!} />
        </div>
        <div id="mentions-section">
          <MentionsSection clientId={id!} />
        </div>
        <SourcesSection clientId={id!} />
        <TokenUsageSection clientId={id!} />
      </div>
    </div>
  );
}
