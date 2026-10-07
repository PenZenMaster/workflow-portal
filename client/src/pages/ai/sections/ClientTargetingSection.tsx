import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";

// Mirrors PATCH /api/clients/:id, which is limited to these roles.
const EDIT_ROLES = ["super_admin", "agency_admin"];

type ListKey = "coreServices" | "geographies" | "exclusions";

const LISTS: { key: ListKey; title: string; noun: string; hint: string; placeholder: string }[] = [
  {
    key: "coreServices",
    title: "Core services",
    noun: "core service",
    hint: "Services this client sells. AI-generated prompts that mention any other service are flagged with a warning.",
    placeholder: "e.g. auto scrap metal recycling",
  },
  {
    key: "geographies",
    title: "Geographies",
    noun: "geography",
    hint: "Cities, regions or service areas this client serves. Prompts naming a location outside this list are flagged.",
    placeholder: "e.g. Seattle",
  },
  {
    key: "exclusions",
    title: "Exclusions",
    noun: "exclusion",
    hint: "Topics the prompt generator should stay away from.",
    placeholder: "e.g. jobs",
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ListEditor({
  title,
  noun,
  hint,
  placeholder,
  items,
  canEdit,
  onChange,
}: {
  title: string;
  noun: string;
  hint: string;
  placeholder: string;
  items: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = `targeting-${noun.replace(/\s+/g, "-")}`;

  function add(): void {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (items.some((item) => normalize(item) === normalize(value))) {
      setDraft("");
      return;
    }
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={canEdit ? inputId : undefined} className="text-sm font-medium">
          {title}
        </Label>
        <InfoTooltip label={`About ${title.toLowerCase()}`} text={hint} />
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None configured.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-1 bg-background border rounded px-2 py-0.5 text-sm">
              <span>{item}</span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(items.filter((i) => i !== item))}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <Input
            id={inputId}
            aria-label={`Add ${noun}`}
            value={draft}
            placeholder={placeholder}
            className="h-8 text-sm"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" aria-label={`Add ${noun} to list`} onClick={add}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ClientTargetingSection({ client }: { client: Client }) {
  const { toast } = useToast();
  const { status } = useAuth();
  const canEdit = EDIT_ROLES.includes(status?.user?.role ?? "");

  const [values, setValues] = useState<Record<ListKey, string[]>>({
    coreServices: client.coreServices ?? [],
    geographies: client.geographies ?? [],
    exclusions: client.exclusions ?? [],
  });
  const [saved, setSaved] = useState<Record<ListKey, string[]>>(values);

  const dirty = LISTS.some(({ key }) => JSON.stringify(values[key]) !== JSON.stringify(saved[key]));

  const saveMutation = useMutation({
    mutationFn: async () => {
      // PATCH /api/clients/:id replaces the whole record, so every field is
      // sent back; omitting one would null it (site key, GBP location, owner).
      await apiRequest("PATCH", `/api/clients/${client.id}`, {
        name: client.name,
        primaryDomain: client.primaryDomain,
        geographies: values.geographies,
        exclusions: values.exclusions,
        coreServices: values.coreServices,
        ownerUserId: client.ownerUserId,
        rankrocketSiteKey: client.rankrocketSiteKey,
        gbpLocationName: client.gbpLocationName,
      });
    },
    onSuccess: () => {
      setSaved(values);
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${client.id}`] });
      toast({ title: "Targeting saved" });
    },
    onError: (err) => toast({ title: "Failed to save targeting", description: String(err), variant: "destructive" }),
  });

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">Targeting</h2>
      <p className="text-xs text-muted-foreground mb-3">
        What this client sells and where. Used to check generated prompts and guide the prompt generator.
      </p>
      <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
        {LISTS.map((list) => (
          <ListEditor
            key={list.key}
            title={list.title}
            noun={list.noun}
            hint={list.hint}
            placeholder={list.placeholder}
            items={values[list.key]}
            canEdit={canEdit}
            onChange={(next) => setValues((prev) => ({ ...prev, [list.key]: next }))}
          />
        ))}
        {canEdit && (
          <div className="flex justify-end">
            <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save targeting"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
