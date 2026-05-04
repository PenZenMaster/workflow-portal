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

type Props = {
  workflow: Workflow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fillPrompt(template: string, values: string[]): string {
  let i = 0;
  return template.replace(/<PASTE>/g, () => values[i++] ?? "");
}

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
    try {
      await navigator.clipboard.writeText(filled);
    } catch {
      // non-fatal — tab still opens
    }
    window.open(workflow.launchUrl, "_blank", "noopener,noreferrer");
    toast({
      title: "Prompt copied to clipboard",
      description: `Paste it into ${workflow.launchLabel || "the AI tool"} to start the session.`,
    });
    onOpenChange(false);
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
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
