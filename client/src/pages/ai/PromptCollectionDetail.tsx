import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Prompt, PromptCollection, Platform, GeneratedPromptCandidate, GenerationResult, PromptGenerationRun, RunSchedule, PromptPanelType, PromptIntentType, BrandContext, CollectionDiagnostics } from "@shared/schema";
import { PROMPT_INTENT_TYPES, FUNNEL_STAGES, INTENT_TO_LEGACY_CATEGORY } from "@shared/schema";

// issue #4 Phase 3 item H: canonical intent is now the primary editable
// classification in both the review panel and existing-prompt edit form;
// legacy category is derived from it (INTENT_TO_LEGACY_CATEGORY) and shown
// as a secondary "Legacy: X" label, no longer independently editable.
const INTENT_LABELS: Record<PromptIntentType, string> = {
  provider_recommendation: "Provider recommendation",
  service_specific: "Service specific",
  geographic_discovery: "Geographic discovery",
  problem_solution: "Problem solution",
  comparison: "Comparison",
  trust_validation: "Trust validation",
  brand_validation: "Brand validation",
  alternative: "Alternative",
  educational: "Educational",
};

const BRAND_CONTEXT_LABELS: Record<BrandContext, string> = {
  unbranded: "Non-branded",
  client_branded: "Client-branded",
  competitor_branded: "Competitor-branded",
  client_and_competitor: "Client + competitor",
};

// issue #4 Phase 3 item 9 - kept editable only from the Prompt Collections
// list page; this page shows it read-only so analysts know which
// distribution Generate with AI is targeting.
const PANEL_TYPE_LABELS: Record<PromptPanelType, string> = {
  balanced_baseline: "Balanced baseline",
  discovery: "Discovery (unbranded only)",
  entity_audit: "Entity audit (client-branded only)",
  competitive: "Competitive (competitor-branded only)",
  topic_authority: "Topic authority",
  local_commercial: "Local commercial",
};
import { utcToLocalWeekly, localToUtcWeekly, utcHourToLocalHour, localHourToUtcHour } from "@/lib/scheduleTiming";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Zap, Play, X, Sparkles, Pencil } from "lucide-react";
import { Breadcrumbs, useClientName } from "@/components/Breadcrumbs";

// originalText tracks the as-generated text (issue #4 Phase 2 item 8) so
// the review panel can warn when an edit may have invalidated the
// intent/service/geo classification shown alongside it. brandContext
// itself is safe regardless - the server always recomputes it from the
// actual saved text.
type Candidate = GeneratedPromptCandidate & { selected: boolean; originalText: string };

// Payload for the bulk-import endpoint: rationale, warnings, and
// originalText are display-only provenance, and null service/geo must be
// omitted (the insert schema takes optional strings, not nulls).
type CandidatePayload = Omit<GeneratedPromptCandidate, "rationale" | "warnings" | "service" | "geo"> & {
  service?: string;
  geo?: string;
};

function toPayload(c: Candidate): CandidatePayload {
  const { selected: _selected, rationale: _rationale, warnings: _warnings, originalText: _originalText, service, geo, ...rest } = c;
  return {
    ...rest,
    ...(service != null ? { service } : {}),
    ...(geo != null ? { geo } : {}),
  };
}

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatCadence(schedule: RunSchedule): string {
  if (schedule.cadence === "weekly") {
    const { dayOfWeek, hour } = utcToLocalWeekly(schedule.dayOfWeek ?? 0, schedule.hourUtc);
    return `Weekly on ${DAY_NAMES[dayOfWeek]} at ${String(hour).padStart(2, "0")}:00`;
  }
  const hour = utcHourToLocalHour(schedule.hourUtc);
  return `Monthly on day ${schedule.dayOfMonth ?? 1} (UTC date) at ${String(hour).padStart(2, "0")}:00`;
}

export default function PromptCollectionDetail() {
  const { id, collectionId } = useParams<{ id: string; collectionId: string }>();
  const clientName = useClientName(id);
  const [, navigate] = useLocation();
  const { status: authStatus } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<number[]>([]);
  const [promptText, setPromptText] = useState("");
  const [intentType, setIntentType] = useState<PromptIntentType>("provider_recommendation");
  const [service, setService] = useState("");
  const [geo, setGeo] = useState("");
  const [funnelStage, setFunnelStage] = useState<typeof FUNNEL_STAGES[number]>("awareness");
  const [priorityWeight, setPriorityWeight] = useState(1);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [genDiagnostics, setGenDiagnostics] = useState<{ rejectedCount: number; warnings: string[] } | null>(null);
  const [generationRunId, setGenerationRunId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editIntentType, setEditIntentType] = useState<PromptIntentType>("provider_recommendation");
  const [editService, setEditService] = useState("");
  const [editGeo, setEditGeo] = useState("");
  const [editFunnelStage, setEditFunnelStage] = useState<typeof FUNNEL_STAGES[number]>("awareness");
  const [editPriorityWeight, setEditPriorityWeight] = useState(1);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState<"weekly" | "monthly">("weekly");
  const [scheduleDayOfWeekLocal, setScheduleDayOfWeekLocal] = useState(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleHourLocal, setScheduleHourLocal] = useState(0);
  const [schedulePlatformIds, setSchedulePlatformIds] = useState<number[]>([]);

  const { data: collectionData } = useQuery<{ data: PromptCollection }>({
    queryKey: [`/api/prompt-collections/${collectionId}`],
    enabled: !!collectionId,
  });

  const { data: promptsData, isLoading } = useQuery<{ data: Prompt[] }>({
    queryKey: [`/api/prompt-collections/${collectionId}/prompts`],
    enabled: !!collectionId,
  });

  // issue #4 Phase 3 item J: pre-activation methodology summary.
  const { data: diagnosticsData } = useQuery<{ data: CollectionDiagnostics }>({
    queryKey: [`/api/prompt-collections/${collectionId}/diagnostics`],
    enabled: !!collectionId,
  });

  const { data: platformsData } = useQuery<{ data: Platform[] }>({
    queryKey: ["/api/platforms"],
    enabled: showRunForm || showScheduleForm,
  });

  const { data: schedulesData } = useQuery<{ data: RunSchedule[] }>({
    queryKey: [`/api/clients/${id}/schedules`],
    enabled: !!id,
  });

  const addPromptMutation = useMutation({
    mutationFn: async (body: {
      text: string;
      intentType: PromptIntentType;
      service?: string;
      geo?: string;
      funnelStage: typeof FUNNEL_STAGES[number];
      priorityWeight: number;
    }) => {
      const res = await apiRequest("POST", `/api/prompt-collections/${collectionId}/prompts`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/diagnostics`] });
      setPromptText(""); setService(""); setGeo(""); setFunnelStage("awareness"); setPriorityWeight(1); setShowForm(false);
      toast({ title: "Prompt added" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/prompt-collections/${collectionId}/generate-prompts`, {});
      return res.json() as Promise<{ data: GenerationResult & { generationRunId?: number } }>;
    },
    onSuccess: (result) => {
      setCandidates(result.data.candidates.map((c) => ({ ...c, selected: true, originalText: c.text })));
      setGenDiagnostics({ rejectedCount: result.data.invalid.length, warnings: result.data.warnings });
      setGenerationRunId(result.data.generationRunId ?? null);
    },
    onError: (err) => toast({ title: "Generation failed", description: String(err), variant: "destructive" }),
  });

  const saveBulkMutation = useMutation({
    mutationFn: async (prompts: CandidatePayload[]) => {
      const res = await apiRequest("POST", `/api/prompt-collections/${collectionId}/prompts/bulk`, {
        prompts,
        ...(generationRunId != null ? { generationRunId } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/diagnostics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/generation-runs`] });
      setCandidates(null);
      setGenDiagnostics(null);
      setGenerationRunId(null);
      toast({ title: "Prompts saved" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deletePromptMutation = useMutation({
    mutationFn: async (promptId: number) => {
      await apiRequest("DELETE", `/api/prompts/${promptId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/diagnostics`] });
      toast({ title: "Prompt removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const editPromptMutation = useMutation({
    mutationFn: async (prompt: Prompt) => {
      const res = await apiRequest("PATCH", `/api/prompts/${prompt.id}`, {
        text: prompt.text,
        // issue #4 Phase 3 item H: intentType is the primary editable
        // classification; legacy category is derived from it, never
        // independently edited.
        intentType: prompt.intentType ?? undefined,
        category: prompt.intentType ? INTENT_TO_LEGACY_CATEGORY[prompt.intentType] : prompt.category,
        funnelStage: prompt.funnelStage,
        geo: prompt.geo ?? undefined,
        service: prompt.service ?? undefined,
        deviceContext: prompt.deviceContext ?? undefined,
        priorityWeight: prompt.priorityWeight,
        status: prompt.status,
        targetPlatforms: prompt.targetPlatforms,
        position: prompt.position,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/prompts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-collections/${collectionId}/diagnostics`] });
      setEditingId(null);
      toast({ title: "Prompt updated" });
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

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      let hourUtc: number;
      let dayOfWeek: number | undefined;
      if (scheduleCadence === "weekly") {
        const converted = localToUtcWeekly(scheduleDayOfWeekLocal, scheduleHourLocal);
        hourUtc = converted.hourUtc;
        dayOfWeek = converted.dayOfWeek;
      } else {
        hourUtc = localHourToUtcHour(scheduleHourLocal);
      }
      const res = await apiRequest("POST", `/api/clients/${id}/schedules`, {
        collectionId: Number(collectionId),
        platformIds: schedulePlatformIds,
        cadence: scheduleCadence,
        hourUtc,
        ...(scheduleCadence === "weekly"
          ? { dayOfWeek }
          : { dayOfMonth: scheduleDayOfMonth }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/schedules`] });
      setShowScheduleForm(false);
      setSchedulePlatformIds([]);
      toast({ title: "Schedule created" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async (schedule: RunSchedule) => {
      const res = await apiRequest("PATCH", `/api/schedules/${schedule.id}`, { enabled: !schedule.enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/schedules`] });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      await apiRequest("DELETE", `/api/schedules/${scheduleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}/schedules`] });
      toast({ title: "Schedule removed" });
    },
    onError: (err) => toast({ title: "Failed", description: String(err), variant: "destructive" }),
  });

  const collection = collectionData?.data;
  const prompts = promptsData?.data ?? [];

  // E2c: provenance details for the AI-generated badge tooltips. Only
  // fetched when at least one prompt was AI generated.
  const hasGeneratedPrompts = prompts.some((p) => p.generationRunId != null);
  const { data: generationRunsData } = useQuery<{ data: PromptGenerationRun[] }>({
    queryKey: [`/api/prompt-collections/${collectionId}/generation-runs`],
    enabled: !!collectionId && hasGeneratedPrompts,
  });
  const generationRunById = new Map((generationRunsData?.data ?? []).map((r) => [r.id, r]));

  function generationBadgeTitle(runId: number): string {
    const run = generationRunById.get(runId);
    if (!run) return `AI generated (run #${runId})`;
    const model = run.modelVariant ? ` (${run.modelVariant})` : "";
    return `Generated by ${run.adapterSlug}${model} — methodology ${run.methodologyVersion} — ${new Date(run.createdAt).toLocaleDateString()}`;
  }
  const isActive = collection?.status === "active";
  // issue #4 Phase 3 item J: only a non-empty quotaShortfall blocks
  // activation (locked with the user 2026-07-29) - every other diagnostic
  // is informational only.
  const diagnostics = diagnosticsData?.data;
  const quotaShortfallEntries = Object.entries(diagnostics?.quotaShortfall ?? {}) as [PromptIntentType, number][];
  const hasQuotaShortfall = quotaShortfallEntries.length > 0;
  const configuredSlugs = authStatus?.config?.configuredPlatforms ?? ["perplexity"];
  const availablePlatforms = (platformsData?.data ?? []).filter(
    (p) => configuredSlugs.includes(p.slug) && p.enabled
  );
  const schedules = (schedulesData?.data ?? []).filter((s) => s.collectionId === Number(collectionId));
  const isAdmin = !!authStatus?.user && (ADMIN_ROLES as readonly string[]).includes(authStatus.user.role);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: clientName, href: `/ai/clients/${id}` },
          { label: "Prompt Collections", href: `/ai/clients/${id}/prompts` },
          { label: collection?.name ?? "Collection" },
        ]}
      />

      {collection && (
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">v{collection.version}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-muted text-muted-foreground"}`}>
                {collection.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground" title="Panel type - change from the Prompt Collections list page">
                {PANEL_TYPE_LABELS[collection.panelType]}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending || prompts.length === 0 || hasQuotaShortfall}
                title={hasQuotaShortfall ? "Collection does not satisfy its panel type's required intent quotas" : undefined}
              >
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

      {/* issue #4 Phase 3 item J: pre-activation methodology summary. Only
          quotaShortfall blocks activation; everything else here is
          informational (locked with the user 2026-07-29). */}
      {collection && diagnostics && (
        <div className="border rounded-lg p-4 mb-6 bg-muted/30 space-y-2">
          <p className="text-sm font-medium">Methodology summary</p>
          <p className="text-xs text-muted-foreground">{diagnostics.promptCount} prompt{diagnostics.promptCount !== 1 ? "s" : ""}</p>
          {hasQuotaShortfall ? (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              Missing quota cells (blocks activation) - {quotaShortfallEntries.map(([intent, n]) => `${intent}: ${n} more needed`).join(", ")}
            </p>
          ) : (
            <p className="text-xs text-green-700 dark:text-green-400">Quotas satisfied</p>
          )}
          <p className="text-xs text-muted-foreground">
            Intent: {Object.entries(diagnostics.intentDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
          </p>
          <p className="text-xs text-muted-foreground">
            Brand context: {Object.entries(diagnostics.brandContextDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
          </p>
          <p className="text-xs text-muted-foreground">
            Funnel stage: {Object.entries(diagnostics.funnelStageDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
            {" - "}Geo coverage: {diagnostics.geoCoverage.length}
            {" - "}Service coverage: {diagnostics.serviceCoverage.length}
          </p>
          <p className="text-xs text-muted-foreground">
            Phrasing: {Object.entries(diagnostics.phrasingDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}
          </p>
          {(diagnostics.duplicateGroups.length > 0 || diagnostics.nearDuplicatePairs.length > 0) && (
            <p className="text-xs text-amber-700 dark:text-amber-500">
              {diagnostics.duplicateGroups.length} duplicate group(s), {diagnostics.nearDuplicatePairs.length} near-duplicate pair(s) - informational, does not block activation
            </p>
          )}
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            {generateMutation.isPending ? "Generating…" : "Generate with AI"}
          </Button>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Add prompt
            </Button>
          )}
        </div>
      </div>

      {/* AI-generated prompt review panel */}
      {candidates && (
        <div className="border rounded-lg p-5 mb-5 bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">
              Review generated prompts ({candidates.filter((c) => c.selected).length} selected, {candidates.length} valid
              {genDiagnostics && genDiagnostics.rejectedCount > 0 ? `, ${genDiagnostics.rejectedCount} rejected` : ""})
            </p>
            <button type="button" onClick={() => { setCandidates(null); setGenDiagnostics(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          {genDiagnostics && genDiagnostics.warnings.length > 0 && (
            <ul className="rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/30 px-3 py-2 space-y-1">
              {genDiagnostics.warnings.map((w, i) => (
                <li key={i} className="text-xs text-orange-700 dark:text-orange-300">{w}</li>
              ))}
            </ul>
          )}
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prompts were generated.</p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c, idx) => (
                <li key={idx} className="flex items-start gap-3 border rounded-lg p-3 bg-background">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={c.selected}
                    onChange={(e) => setCandidates((prev) =>
                      prev!.map((item, i) => i === idx ? { ...item, selected: e.target.checked } : item)
                    )}
                    aria-label={`Include "${c.text}"`}
                  />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={c.text}
                      onChange={(e) => setCandidates((prev) =>
                        prev!.map((item, i) => i === idx ? { ...item, text: e.target.value } : item)
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={c.intentType}
                        onChange={(e) => {
                          const intentType = e.target.value as PromptIntentType;
                          setCandidates((prev) =>
                            prev!.map((item, i) => i === idx ? { ...item, intentType, category: INTENT_TO_LEGACY_CATEGORY[intentType] } : item)
                          );
                        }}
                        className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Intent type"
                      >
                        {PROMPT_INTENT_TYPES.map((it) => (
                          <option key={it} value={it}>{INTENT_LABELS[it]}</option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">Legacy: {INTENT_TO_LEGACY_CATEGORY[c.intentType]}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${c.brandContext === "unbranded" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"}`}>
                        {BRAND_CONTEXT_LABELS[c.brandContext]}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        value={c.service ?? ""}
                        onChange={(e) => setCandidates((prev) =>
                          prev!.map((item, i) => i === idx ? { ...item, service: e.target.value || null } : item)
                        )}
                        placeholder="Service"
                        aria-label="Service"
                        className="h-9 text-xs"
                      />
                      <Input
                        value={c.geo ?? ""}
                        onChange={(e) => setCandidates((prev) =>
                          prev!.map((item, i) => i === idx ? { ...item, geo: e.target.value || null } : item)
                        )}
                        placeholder="Geography"
                        aria-label="Geography"
                        className="h-9 text-xs"
                      />
                      <select
                        value={c.funnelStage}
                        onChange={(e) => setCandidates((prev) =>
                          prev!.map((item, i) => i === idx ? { ...item, funnelStage: e.target.value as typeof FUNNEL_STAGES[number] } : item)
                        )}
                        className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Funnel stage"
                      >
                        {FUNNEL_STAGES.map((fs) => (
                          <option key={fs} value={fs}>{fs}</option>
                        ))}
                      </select>
                    </div>
                    {c.rationale && <p className="text-xs text-muted-foreground italic">{c.rationale}</p>}
                    {c.warnings?.map((w) => (
                      <p key={w} className="text-xs text-amber-700 dark:text-amber-500">{w}</p>
                    ))}
                    {c.text !== c.originalText && (
                      <p className="text-xs text-amber-700 dark:text-amber-500">
                        Text edited — intent/service/geo classification may no longer match; recheck before saving.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setCandidates(null); setGenDiagnostics(null); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => saveBulkMutation.mutate(candidates.filter((c) => c.selected).map(toPayload))}
              disabled={saveBulkMutation.isPending || candidates.filter((c) => c.selected).length === 0}
            >
              {saveBulkMutation.isPending ? "Saving…" : "Save selected"}
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (promptText.trim())
              addPromptMutation.mutate({
                text: promptText.trim(),
                intentType,
                service: service.trim() || undefined,
                geo: geo.trim() || undefined,
                funnelStage,
                priorityWeight,
              });
          }}
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
            <p className="text-xs text-muted-foreground">
              Tokens: {"{{brand}}"}, {"{{competitor}}"} (fans out per competitor), {"{{city}}"} / {"{{geo}}"}
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="prompt-intent-type" className="mb-0">Intent type</Label>
              <span className="text-xs text-muted-foreground">Legacy: {INTENT_TO_LEGACY_CATEGORY[intentType]}</span>
            </div>
            <select
              id="prompt-intent-type"
              value={intentType}
              onChange={(e) => setIntentType(e.target.value as PromptIntentType)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PROMPT_INTENT_TYPES.map((it) => (
                <option key={it} value={it}>{INTENT_LABELS[it]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-service">Service (optional)</Label>
              <Input id="prompt-service" placeholder='e.g. "drain cleaning"' value={service} onChange={(e) => setService(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-geo">Geography (optional)</Label>
              <Input id="prompt-geo" placeholder='e.g. "Seattle, WA"' value={geo} onChange={(e) => setGeo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-funnel-stage">Funnel stage</Label>
              <select
                id="prompt-funnel-stage"
                value={funnelStage}
                onChange={(e) => setFunnelStage(e.target.value as typeof FUNNEL_STAGES[number])}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {FUNNEL_STAGES.map((fs) => (
                  <option key={fs} value={fs}>{fs}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-priority">Priority (0-10)</Label>
              <Input
                id="prompt-priority"
                type="number"
                min={0}
                max={10}
                value={priorityWeight}
                onChange={(e) => setPriorityWeight(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setShowForm(false); setPromptText(""); setService(""); setGeo(""); setFunnelStage("awareness"); setPriorityWeight(1); }}
            >
              Cancel
            </Button>
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
              {editingId === p.id ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    aria-label="Prompt text"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={editIntentType}
                      onChange={(e) => setEditIntentType(e.target.value as PromptIntentType)}
                      className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="Intent type"
                    >
                      {PROMPT_INTENT_TYPES.map((it) => (
                        <option key={it} value={it}>{INTENT_LABELS[it]}</option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">Legacy: {INTENT_TO_LEGACY_CATEGORY[editIntentType]}</span>
                    {p.brandContext && (
                      <span className="text-xs text-muted-foreground" title="Brand context is derived from the prompt text and always recomputed on save">
                        {BRAND_CONTEXT_LABELS[p.brandContext]}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editService} onChange={(e) => setEditService(e.target.value)} placeholder="Service" aria-label="Service" />
                    <Input value={editGeo} onChange={(e) => setEditGeo(e.target.value)} placeholder="Geography" aria-label="Geography" />
                    <select
                      value={editFunnelStage}
                      onChange={(e) => setEditFunnelStage(e.target.value as typeof FUNNEL_STAGES[number])}
                      className="h-9 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="Funnel stage"
                    >
                      {FUNNEL_STAGES.map((fs) => (
                        <option key={fs} value={fs}>{fs}</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={editPriorityWeight}
                      onChange={(e) => setEditPriorityWeight(Number(e.target.value))}
                      aria-label="Priority"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => editPromptMutation.mutate({
                        ...p,
                        text: editText.trim(),
                        intentType: editIntentType,
                        service: editService.trim() || null,
                        geo: editGeo.trim() || null,
                        funnelStage: editFunnelStage,
                        priorityWeight: editPriorityWeight,
                      })}
                      disabled={editPromptMutation.isPending || !editText.trim()}
                    >
                      {editPromptMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm">{p.text}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{p.intentType ?? "unclassified"}</span>
                      <span className="text-xs text-muted-foreground">Legacy: {p.category}</span>
                      {p.brandContext && <span className="text-xs text-muted-foreground">{BRAND_CONTEXT_LABELS[p.brandContext]}</span>}
                      <span className="text-xs text-muted-foreground">{p.funnelStage}</span>
                      {p.geo && <span className="text-xs text-muted-foreground">{p.geo}</span>}
                      {p.generationRunId != null && (
                        <span
                          className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 rounded"
                          title={generationBadgeTitle(p.generationRunId)}
                        >
                          AI generated
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditText(p.text);
                        setEditIntentType(p.intentType ?? "provider_recommendation");
                        setEditService(p.service ?? "");
                        setEditGeo(p.geo ?? "");
                        setEditFunnelStage(p.funnelStage);
                        setEditPriorityWeight(p.priorityWeight);
                      }}
                      aria-label={`Edit "${p.text}"`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePromptMutation.mutate(p.id)}
                      disabled={deletePromptMutation.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Recurring run schedules */}
      <div className="flex items-center justify-between mt-10 mb-4">
        <h2 className="text-lg font-semibold">
          Schedules <span className="text-muted-foreground font-normal text-sm">({schedules.length})</span>
        </h2>
        {isAdmin && !showScheduleForm && (
          <Button size="sm" variant="outline" onClick={() => setShowScheduleForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Add schedule
          </Button>
        )}
      </div>

      {showScheduleForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createScheduleMutation.mutate(); }}
          className="border rounded-lg p-5 mb-5 bg-muted/30 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">New Schedule</p>
            <button type="button" onClick={() => setShowScheduleForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-cadence">Cadence</Label>
              <select
                id="schedule-cadence"
                value={scheduleCadence}
                onChange={(e) => setScheduleCadence(e.target.value as "weekly" | "monthly")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-hour">Hour (local time)</Label>
              <Input
                id="schedule-hour"
                type="number"
                min={0}
                max={23}
                value={scheduleHourLocal}
                onChange={(e) => setScheduleHourLocal(Number(e.target.value))}
              />
            </div>
          </div>
          {scheduleCadence === "weekly" ? (
            <div className="space-y-1.5">
              <Label htmlFor="schedule-day-of-week">Day of week</Label>
              <select
                id="schedule-day-of-week"
                value={scheduleDayOfWeekLocal}
                onChange={(e) => setScheduleDayOfWeekLocal(Number(e.target.value))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {DAY_NAMES.map((day, idx) => (
                  <option key={day} value={idx}>{day}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="schedule-day-of-month">Day of month (UTC date)</Label>
              <Input
                id="schedule-day-of-month"
                type="number"
                min={1}
                max={28}
                value={scheduleDayOfMonth}
                onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Platforms</Label>
            {availablePlatforms.length === 0 ? (
              <p className="text-xs text-muted-foreground">No platforms configured — add API keys in environment variables.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {availablePlatforms.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      aria-label={p.displayName}
                      checked={schedulePlatformIds.includes(p.id)}
                      onChange={(e) => setSchedulePlatformIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                      )}
                    />
                    {p.displayName}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowScheduleForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createScheduleMutation.isPending || schedulePlatformIds.length === 0}>
              {createScheduleMutation.isPending ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </form>
      )}

      {schedules.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center">
          <p className="text-muted-foreground text-sm">No recurring schedules yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm">{formatCadence(schedule)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Next run: {new Date(schedule.nextFireAt).toLocaleString()}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      aria-label="Enabled"
                      checked={schedule.enabled}
                      onChange={() => toggleScheduleMutation.mutate(schedule)}
                    />
                    Enabled
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                    disabled={deleteScheduleMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
