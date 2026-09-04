import { useState } from "react";
import type { Workflow } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  ListChecks,
  FileUp,
  Loader2,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LaunchInputsDialog } from "@/components/LaunchInputsDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  workflow: Workflow;
  onEdit: (w: Workflow) => void;
  onDelete: (w: Workflow) => void;
  onTogglePin: (w: Workflow) => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  Audit: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Schema: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Reporting: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Verification: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Automation: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  Content: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Local SEO": "bg-lime-500/15 text-lime-300 border-lime-500/30",
  Other: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function WorkflowCard({ workflow, onEdit, onDelete, onTogglePin }: Props) {
  const [copied, setCopied] = useState(false);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const { toast } = useToast();

  // Workflows with launch inputs collect them in the dialog first so their
  // values can fill the prompt's <PASTE> tokens server-side (B-21).
  const handleRunWithFile = () => {
    if (!csvFile) return;
    if (
      workflow.inputs.length + workflow.optionalInputs.length > 0 ||
      workflow.growthPlanEnabled
    ) {
      setRunDialogOpen(true);
      return;
    }
    void executeRun();
  };

  const executeRun = async (inputValues?: string[], clientId?: number) => {
    if (!csvFile) return;
    setAiRunning(true);
    try {
      const text = await csvFile.text();
      const url =
        `/api/workflows/${workflow.id}/run-with-file` +
        `?filename=${encodeURIComponent(csvFile.name)}`;
      const res = await fetch(
        url,
        inputValues || clientId !== undefined
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                csv: text,
                inputValues: inputValues ?? [],
                ...(clientId !== undefined && { clientId }),
              }),
              credentials: "include",
            }
          : {
              method: "POST",
              headers: { "Content-Type": "text/csv" },
              body: text,
              credentials: "include",
            }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as { data: { response: string } };
      setAiResponse(json.data.response);
    } catch (e) {
      toast({
        title: "AI run failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setAiRunning(false);
    }
  };

  // RankRocket MCP in-app run (Phase 3, read-only slice) - same collect-
  // inputs-first pattern as handleRunWithFile/executeRun, but no CSV.
  const handleRunPrompt = () => {
    if (workflow.inputs.length + workflow.optionalInputs.length > 0) {
      setRunDialogOpen(true);
      return;
    }
    void executePromptRun();
  };

  const executePromptRun = async (inputValues?: string[]) => {
    setAiRunning(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputValues: inputValues ?? [] }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as { data: { response: string } };
      setAiResponse(json.data.response);
    } catch (e) {
      toast({
        title: "AI run failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setAiRunning(false);
    }
  };

  const handleCopy = async () => {
    if (!workflow.prompt) {
      toast({ title: "No prompt to copy", description: "Edit this workflow to add a prompt." });
      return;
    }
    try {
      await navigator.clipboard.writeText(workflow.prompt);
      setCopied(true);
      toast({ title: "Prompt copied", description: workflow.name });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available." });
    }
  };

  const categoryClass =
    CATEGORY_COLORS[workflow.category] ?? CATEGORY_COLORS.Other;

  const hasLaunchInputs =
    workflow.inputs.length + workflow.optionalInputs.length > 0;

  return (
    <Card
      className="flex flex-col h-full border-card-border bg-card/60 backdrop-blur-sm transition-shadow hover:shadow-lg"
      data-testid={`card-workflow-${workflow.id}`}
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`border ${categoryClass} font-medium`}
              data-testid={`badge-category-${workflow.id}`}
            >
              {workflow.category}
            </Badge>
            {workflow.pinned && (
              <Badge variant="outline" className="border-primary/40 text-primary">
                Pinned
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onTogglePin(workflow)}
                  data-testid={`button-pin-${workflow.id}`}
                >
                  {workflow.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {workflow.pinned
                  ? "Unpin this workflow (removes it from the top of the list)"
                  : "Pin this workflow to the top of the list"}
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(workflow)}
                  data-testid={`button-edit-${workflow.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Edit this workflow&apos;s details, inputs, and prompt template
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(workflow)}
                  data-testid={`button-delete-${workflow.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Permanently delete this workflow</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <CardTitle
          className="text-lg leading-snug"
          data-testid={`text-name-${workflow.id}`}
        >
          {workflow.name}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-4">
        <p
          className="text-sm text-muted-foreground leading-relaxed"
          data-testid={`text-description-${workflow.id}`}
        >
          {workflow.description}
        </p>

        {workflow.inputs.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              <ListChecks className="h-3.5 w-3.5" />
              Required inputs
            </div>
            <ul className="space-y-1">
              {workflow.inputs.map((input, i) => (
                <li
                  key={i}
                  className="text-sm text-foreground/85 flex gap-2"
                  data-testid={`text-input-${workflow.id}-${i}`}
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span>{input}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {workflow.optionalInputs.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              <ListChecks className="h-3.5 w-3.5" />
              Optional inputs
            </div>
            <ul className="space-y-1">
              {workflow.optionalInputs.map((input, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex gap-2"
                  data-testid={`text-optional-input-${workflow.id}-${i}`}
                >
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span>{input}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {workflow.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {workflow.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
                data-testid={`tag-${workflow.id}-${tag}`}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {workflow.acceptsFileUpload && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <FileUp className="h-3.5 w-3.5" />
              Run with a CSV file
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="h-9 max-w-56 text-xs"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                data-testid={`input-file-${workflow.id}`}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!csvFile || aiRunning}
                onClick={handleRunWithFile}
                data-testid={`button-run-file-${workflow.id}`}
              >
                {aiRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4 mr-1.5" />
                    Run with AI
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {workflow.rankrocketMcpEnabled && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={aiRunning}
              onClick={handleRunPrompt}
              data-testid={`button-run-prompt-${workflow.id}`}
            >
              {aiRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Running...
                </>
              ) : (
                "Run"
              )}
            </Button>
          </div>
        )}

        {aiResponse !== null && (
          <div
            className="relative rounded-md border border-card-border bg-muted/40 p-3"
            data-testid={`panel-ai-response-${workflow.id}`}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => setAiResponse(null)}
              title="Dismiss"
              data-testid={`button-dismiss-response-${workflow.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <p className="text-sm whitespace-pre-wrap pr-6">{aiResponse}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-auto pt-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleCopy}
            disabled={!workflow.prompt}
            data-testid={`button-copy-${workflow.id}`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" />
                Copy prompt
              </>
            )}
          </Button>
          {workflow.launchUrl && (
            hasLaunchInputs ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLaunchDialogOpen(true)}
                data-testid={`button-launch-${workflow.id}`}
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {workflow.launchLabel || "Launch"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid={`button-launch-${workflow.id}`}
              >
                <a href={workflow.launchUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  {workflow.launchLabel || "Launch"}
                </a>
              </Button>
            )
          )}
        </div>
      </CardContent>

      {workflow.launchUrl && hasLaunchInputs && (
        <LaunchInputsDialog
          workflow={workflow}
          open={launchDialogOpen}
          onOpenChange={setLaunchDialogOpen}
        />
      )}

      {workflow.acceptsFileUpload && (hasLaunchInputs || workflow.growthPlanEnabled) && (
        <LaunchInputsDialog
          workflow={workflow}
          open={runDialogOpen}
          onOpenChange={setRunDialogOpen}
          mode="ai-run"
          onRun={(values, clientId) => void executeRun(values, clientId)}
        />
      )}

      {workflow.rankrocketMcpEnabled && hasLaunchInputs && (
        <LaunchInputsDialog
          workflow={workflow}
          open={runDialogOpen}
          onOpenChange={setRunDialogOpen}
          mode="ai-run"
          onRun={(values) => void executePromptRun(values)}
        />
      )}
    </Card>
  );
}
