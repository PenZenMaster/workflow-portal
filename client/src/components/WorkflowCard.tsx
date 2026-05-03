import { useState } from "react";
import type { Workflow } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onTogglePin(workflow)}
              data-testid={`button-pin-${workflow.id}`}
              title={workflow.pinned ? "Unpin" : "Pin"}
            >
              {workflow.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(workflow)}
              data-testid={`button-edit-${workflow.id}`}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(workflow)}
              data-testid={`button-delete-${workflow.id}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
