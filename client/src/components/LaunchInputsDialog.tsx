import { useState, useEffect } from "react";
import type { Workflow } from "@shared/schema";
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
import { ExternalLink, ClipboardCheck, FileUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fillPrompt, getLaunchPlan, type LaunchMode } from "@/lib/launchUtils";

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
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setValues(workflow.inputs.map(() => ""));
      setOptionalValues(workflow.optionalInputs.map(() => ""));
      setLaunched(null);
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

  const handleRunConfirm = () => {
    persistValues();
    onRun?.(allValues);
    onOpenChange(false);
  };

  const handleLaunch = async () => {
    persistValues();
    const filled = fillPrompt(workflow.prompt, allValues);
    const plan = getLaunchPlan(workflow.launchUrl, filled, [
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
    const filled = fillPrompt(workflow.prompt, allValues);
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
              ? "Fill in the inputs, then run the workflow against your CSV file."
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
              <Input
                id={`launch-input-${i}`}
                value={values[i] ?? ""}
                onChange={(e) => setValue(i, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                data-testid={`launch-input-${i}`}
              />
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
