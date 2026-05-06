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
import { ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fillPrompt, buildPerplexityLaunchUrl } from "@/lib/launchUtils";

type Props = {
  workflow: Workflow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LaunchInputsDialog({ workflow, open, onOpenChange }: Props) {
  const [values, setValues] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setValues(workflow.inputs.map(() => ""));
    }
  }, [open, workflow.inputs]);

  const setValue = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleLaunch = async () => {
    const filled = fillPrompt(workflow.prompt, values);

    // Try the Perplexity prefilled-search URL first — it auto-submits.
    const directUrl = buildPerplexityLaunchUrl(workflow.launchUrl, filled);

    if (directUrl) {
      // Best path: open Perplexity with prompt prefilled and submitted.
      // Still copy to clipboard as a safety net.
      try {
        await navigator.clipboard.writeText(filled);
      } catch {
        // non-fatal
      }
      window.open(directUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "Launched in Perplexity",
        description: "Your prompt was prefilled in a new tab.",
      });
      onOpenChange(false);
      return;
    }

    // Fallback: copy to clipboard, open the launch URL, instruct paste.
    let copied = false;
    try {
      await navigator.clipboard.writeText(filled);
      copied = true;
    } catch {
      copied = false;
    }
    window.open(workflow.launchUrl, "_blank", "noopener,noreferrer");

    if (copied) {
      toast({
        title: "Prompt copied to clipboard",
        description: `Switch to the new tab and press Ctrl+V, then Enter to start the ${
          workflow.launchLabel || "AI"
        } session.`,
      });
    } else {
      toast({
        title: "Couldn't copy automatically",
        description:
          "Tab opened, but clipboard access was blocked. Reopen this dialog and use the Copy button below.",
        variant: "destructive",
      });
    }
    onOpenChange(false);
  };

  const handleCopyOnly = async () => {
    const filled = fillPrompt(workflow.prompt, values);
    try {
      await navigator.clipboard.writeText(filled);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workflow.name}</DialogTitle>
          <DialogDescription>
            Fill in the required inputs. The completed prompt will be copied to
            your clipboard when you launch.
          </DialogDescription>
        </DialogHeader>

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
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
