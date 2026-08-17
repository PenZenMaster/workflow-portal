import { useState, useEffect } from "react";
import type { Workflow, RankrocketQuestionOption } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, ClipboardCheck, FileUp, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  fillPrompt,
  getLaunchPlan,
  isHtmlFile,
  appendTemplateFile,
  MAX_TEMPLATE_FILE_BYTES,
  type LaunchMode,
  type LaunchPlan,
} from "@/lib/launchUtils";

type Props = {
  workflow: Workflow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // "launch" (default) opens the workflow's launch URL with the filled
  // prompt; "ai-run" only collects the input values and hands them to onRun
  // (used by the Run with AI CSV flow - B-21).
  mode?: "launch" | "ai-run";
  onRun?: (values: string[]) => void;
};

type LaunchedState = {
  mode: Exclude<LaunchMode, "auto-submit">;
  copied: boolean;
};

export function LaunchInputsDialog({
  workflow,
  open,
  onOpenChange,
  mode = "launch",
  onRun,
}: Props) {
  const [values, setValues] = useState<string[]>([]);
  const [optionalValues, setOptionalValues] = useState<string[]>([]);
  const [launched, setLaunched] = useState<LaunchedState | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [rankrocketSites, setRankrocketSites] = useState<string[]>([]);
  const [rankrocketQuestionOptions, setRankrocketQuestionOptions] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setValues(workflow.inputs.map(() => ""));
      setOptionalValues(workflow.optionalInputs.map(() => ""));
      setLaunched(null);
      setTemplateFile(null);
    }
  }, [open, workflow.inputs, workflow.optionalInputs]);

  // Prefill from the shared last-used values (B-23). Only fills fields the
  // user has not already typed into, so a slow response never clobbers input.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/workflows/${workflow.id}/input-values`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: Record<string, string> } | null) => {
        if (cancelled || !json?.data) return;
        const saved = json.data;
        setValues((prev) =>
          workflow.inputs.map((label, i) => prev[i] || saved[label] || "")
        );
        setOptionalValues((prev) =>
          workflow.optionalInputs.map((label, i) => prev[i] || saved[label] || "")
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, workflow.id, workflow.inputs, workflow.optionalInputs]);

  // RankRocket Site Insights card only (rankrocketMcpEnabled) - repopulates
  // the site-key dropdown from the server's boot-time cache each time the
  // dialog opens, rather than typing a site key by hand.
  useEffect(() => {
    if (!open || !workflow.rankrocketMcpEnabled) return;
    let cancelled = false;
    fetch("/api/rankrocket-mcp/sites", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: string[] } | null) => {
        if (cancelled) return;
        setRankrocketSites(Array.isArray(json?.data) ? json.data : []);
      })
      .catch(() => {
        if (!cancelled) setRankrocketSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workflow.rankrocketMcpEnabled]);

  // RankRocket Site Insights admin CRUD, Part C: the question dropdown's
  // options are now portal-CRUD-able (rankrocket_question_options table)
  // instead of a hardcoded RANKROCKET_QUESTION_OPTIONS const array -
  // refetched each time the dialog opens, same pattern as the site-key
  // dropdown above.
  useEffect(() => {
    if (!open || !workflow.rankrocketMcpEnabled) return;
    let cancelled = false;
    fetch("/api/rankrocket-question-options", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: RankrocketQuestionOption[] } | null) => {
        if (cancelled) return;
        setRankrocketQuestionOptions(
          Array.isArray(json?.data) ? json.data.map((o) => o.label) : []
        );
      })
      .catch(() => {
        if (!cancelled) setRankrocketQuestionOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workflow.rankrocketMcpEnabled]);

  // Remember non-blank values for the next launch (fire-and-forget).
  const persistValues = () => {
    const map: Record<string, string> = {};
    workflow.inputs.forEach((label, i) => {
      if ((values[i] ?? "").trim()) map[label] = values[i];
    });
    workflow.optionalInputs.forEach((label, i) => {
      if ((optionalValues[i] ?? "").trim()) map[label] = optionalValues[i];
    });
    if (Object.keys(map).length === 0) return;
    fetch(`/api/workflows/${workflow.id}/input-values`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: map }),
      credentials: "include",
    }).catch(() => {});
  };

  const setValue = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const setOptionalValue = (index: number, value: string) => {
    setOptionalValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  // Required values fill the prompt's <PASTE> tokens first, then optional
  // values; a blank optional value fills its token as empty text.
  const allValues = [...values, ...optionalValues];

  const handleTemplateFileChange = (file: File | undefined) => {
    if (!file) return;
    if (!isHtmlFile(file)) {
      toast({
        title: "Not an HTML file",
        description: "Only .html/.htm files can be attached as a template.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_TEMPLATE_FILE_BYTES) {
      toast({
        title: "File too large",
        description: "Attached templates are limited to 5MB.",
        variant: "destructive",
      });
      return;
    }
    setTemplateFile(file);
  };

  // Builds the final prompt, folding in the attached template file's
  // content (if any). Never sent to the server or persisted anywhere -
  // the file is only read for the duration of this call.
  const buildFinalPrompt = async (): Promise<string | null> => {
    const filled = fillPrompt(workflow.prompt, allValues);
    if (!templateFile) return filled;
    try {
      const content = await templateFile.text();
      return appendTemplateFile(filled, templateFile.name, content);
    } catch {
      toast({
        title: "Couldn't read attached file",
        description: "Remove it and try again, or launch without it.",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleRunConfirm = () => {
    persistValues();
    onRun?.(allValues);
    onOpenChange(false);
  };

  const handleLaunch = async () => {
    persistValues();
    const filled = await buildFinalPrompt();
    if (filled === null) return;
    // An attached template file is folded into the prompt as free text -
    // always force clipboard mode rather than risk it being auto-submitted
    // via a Perplexity URL, regardless of the encoded-length fallback.
    const plan: LaunchPlan = templateFile
      ? { mode: "clipboard", url: workflow.launchUrl }
      : getLaunchPlan(workflow.launchUrl, filled, [
          ...workflow.inputs,
          ...workflow.optionalInputs,
        ]);

    // Copy in every mode as a safety net; clipboard mode depends on it.
    let copied = false;
    try {
      await navigator.clipboard.writeText(filled);
      copied = true;
    } catch {
      copied = false;
    }

    window.open(plan.url, "_blank", "noopener,noreferrer");

    if (plan.mode === "auto-submit") {
      toast({
        title: "Launched in Perplexity",
        description: "Your prompt was submitted in a new tab.",
      });
      onOpenChange(false);
      return;
    }

    // Prefill and clipboard launches need a manual step in the new tab, so
    // keep the dialog open with persistent instructions instead of relying
    // on a transient toast.
    setLaunched({ mode: plan.mode, copied });
  };

  const handleCopyOnly = async () => {
    const filled = await buildFinalPrompt();
    if (filled === null) return;
    try {
      await navigator.clipboard.writeText(filled);
      setLaunched((prev) => (prev ? { ...prev, copied: true } : prev));
      toast({
        title: "Prompt copied",
        description: "Paste it into your AI tool to start.",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Clipboard access was blocked by your browser.",
        variant: "destructive",
      });
    }
  };

  const instructions =
    launched?.mode === "prefill"
      ? "Your prompt is prefilled in the new tab. Switch to it and press Enter to start."
      : launched?.copied
        ? "Your prompt was copied to the clipboard. In the new tab, click the input box, press Ctrl+V, then press Enter to start."
        : "Clipboard access was blocked, so the prompt could not be copied automatically. Use the Copy prompt button below, then paste it in the new tab (Ctrl+V) and press Enter.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workflow.name}</DialogTitle>
          <DialogDescription>
            {mode === "ai-run"
              ? workflow.acceptsFileUpload
                ? "Fill in the inputs, then run the workflow against your CSV file."
                : "Fill in the inputs, then run the workflow."
              : launched
                ? "One more step to start the session."
                : "Fill in the required inputs. The completed prompt will be copied to your clipboard when you launch."}
          </DialogDescription>
        </DialogHeader>

        {launched ? (
          <div
            className="flex items-start gap-3 rounded-md border border-card-border bg-muted/40 p-4 my-2"
            data-testid="launch-instructions"
          >
            <ClipboardCheck className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed">{instructions}</p>
          </div>
        ) : (
        <div className="space-y-4 py-2">
          {workflow.inputs.map((label, i) => (
            <div key={i} className="space-y-1.5">
              <Label htmlFor={`launch-input-${i}`}>{label}</Label>
              {workflow.rankrocketMcpEnabled && i === 0 ? (
                <Select value={values[i] ?? ""} onValueChange={(v) => setValue(i, v)}>
                  <SelectTrigger
                    id={`launch-input-${i}`}
                    data-testid={`launch-input-${i}`}
                    disabled={rankrocketSites.length === 0}
                  >
                    <SelectValue
                      placeholder={
                        rankrocketSites.length === 0
                          ? "No sites available - check RankRocket MCP configuration"
                          : `Select ${label.toLowerCase()}`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {rankrocketSites.map((site) => (
                      <SelectItem key={site} value={site}>
                        {site}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : workflow.rankrocketMcpEnabled && i === 1 ? (
                <Select value={values[i] ?? ""} onValueChange={(v) => setValue(i, v)}>
                  <SelectTrigger id={`launch-input-${i}`} data-testid={`launch-input-${i}`}>
                    <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {rankrocketQuestionOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`launch-input-${i}`}
                  value={values[i] ?? ""}
                  onChange={(e) => setValue(i, e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  data-testid={`launch-input-${i}`}
                />
              )}
            </div>
          ))}
          {workflow.optionalInputs.map((label, i) => (
            <div key={`opt-${i}`} className="space-y-1.5">
              <Label htmlFor={`launch-optional-input-${i}`}>
                {label}{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id={`launch-optional-input-${i}`}
                value={optionalValues[i] ?? ""}
                onChange={(e) => setOptionalValue(i, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()} (optional)`}
                data-testid={`launch-optional-input-${i}`}
              />
            </div>
          ))}
          {mode === "launch" && (
            <div className="space-y-1.5">
              <Label htmlFor="launch-template-file-input">
                Attach an HTML template{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              {templateFile ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate">{templateFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setTemplateFile(null)}
                    title="Remove attached file"
                    data-testid="launch-template-file-remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Input
                  id="launch-template-file-input"
                  type="file"
                  accept=".html,.htm,text/html"
                  className="h-9 text-xs"
                  onChange={(e) =>
                    handleTemplateFileChange(e.target.files?.[0])
                  }
                  data-testid="launch-template-file-input"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Not stored - only folded into the prompt you copy/launch.
              </p>
            </div>
          )}
        </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === "ai-run" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleRunConfirm} data-testid="button-run-confirm">
                <FileUp className="h-4 w-4 mr-1.5" />
                Run with AI
              </Button>
            </>
          ) : launched ? (
            <>
              <Button
                variant="outline"
                onClick={handleCopyOnly}
                data-testid="button-launch-copy"
              >
                Copy prompt
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                data-testid="button-launch-done"
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyOnly}
                data-testid="button-launch-copy"
              >
                Copy prompt
              </Button>
              <Button onClick={handleLaunch} data-testid="button-launch-confirm">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {workflow.launchLabel || "Launch"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
