import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mirrors PATCH /api/clients/:id, which is limited to these roles.
const EDIT_ROLES = ["super_admin", "agency_admin"];

type ListKey = "coreServices" | "geographies" | "exclusions";
type Lists = Record<ListKey, string[]>;

const LISTS: { key: ListKey; title: string; noun: string; hint: string; placeholder: string; empty: string }[] = [
  {
    key: "coreServices",
    title: "Core services",
    noun: "core service",
    hint: "What this client sells. Generated prompts about any other service get a warning.",
    placeholder: "e.g. auto scrap metal recycling",
    empty: "No core services yet.",
  },
  {
    key: "geographies",
    title: "Geographies",
    noun: "geography",
    hint: "Cities, regions or service areas the client covers. Prompts naming other places get a warning.",
    placeholder: "e.g. Seattle",
    empty: "No geographies yet.",
  },
  {
    key: "exclusions",
    title: "Exclusions",
    noun: "exclusion",
    hint: "Topics or services the prompt generator must never write about. Optional.",
    placeholder: "e.g. junk car removal",
    empty: "No exclusions yet. This list is optional.",
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ListCard({
  title,
  noun,
  hint,
  placeholder,
  empty,
  items,
  canEdit,
  onAdd,
  onRemove,
}: {
  title: string;
  noun: string;
  hint: string;
  placeholder: string;
  empty: string;
  items: string[];
  canEdit: boolean;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function submit(): void {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (items.some((item) => normalize(item) === normalize(value))) {
      setMessage(`That ${noun} is already in the list.`);
      return;
    }
    setMessage(null);
    setDraft("");
    onAdd(value);
  }

  return (
    <div role="group" aria-labelledby={titleId} className="border rounded-lg p-4 bg-muted/20 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">
          <span id={titleId}>{title}</span>{" "}
          <span className="font-normal text-muted-foreground">({items.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      ) : (
        <ul className="divide-y border rounded-md bg-background">
          {items.map((item) => (
            <li key={item} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span>{item}</span>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${noun} ${item}`}
                  className="h-7 text-destructive hover:text-destructive"
                  onClick={() => onRemove(item)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              aria-label={`New ${noun}`}
              value={draft}
              placeholder={placeholder}
              className="h-8 text-sm"
              onChange={(e) => {
                setDraft(e.target.value);
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button type="button" size="sm" aria-label={`Add ${noun}`} onClick={submit} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ClientTargetingSection({ client }: { client: Client }) {
  const { toast } = useToast();
  const { status } = useAuth();
  const canEdit = EDIT_ROLES.includes(status?.user?.role ?? "");

  const [values, setValues] = useState<Lists>({
    coreServices: client.coreServices ?? [],
    geographies: client.geographies ?? [],
    exclusions: client.exclusions ?? [],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ next }: { previous: Lists; next: Lists }) => {
      // PATCH /api/clients/:id replaces the whole record, so every field is
      // sent back; omitting one would null it (site key, GBP location, owner).
      await apiRequest("PATCH", `/api/clients/${client.id}`, {
        name: client.name,
        primaryDomain: client.primaryDomain,
        geographies: next.geographies,
        exclusions: next.exclusions,
        coreServices: next.coreServices,
        ownerUserId: client.ownerUserId,
        rankrocketSiteKey: client.rankrocketSiteKey,
        gbpLocationName: client.gbpLocationName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${client.id}`] });
      toast({ title: "Targeting saved" });
    },
    onError: (err, { previous }) => {
      setValues(previous);
      toast({ title: "Not saved - change undone", description: String(err), variant: "destructive" });
    },
  });

  function commit(key: ListKey, nextList: string[]): void {
    const previous = values;
    const next = { ...values, [key]: nextList };
    setValues(next);
    saveMutation.mutate({ previous, next });
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">Targeting</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {canEdit
          ? "Type a name and press Enter or click Add. Every add and remove is saved immediately."
          : "What this client sells and where. Only agency admins can change these."}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {LISTS.map((list) => (
          <ListCard
            key={list.key}
            title={list.title}
            noun={list.noun}
            hint={list.hint}
            placeholder={list.placeholder}
            empty={list.empty}
            items={values[list.key]}
            canEdit={canEdit}
            onAdd={(value) => commit(list.key, [...values[list.key], value])}
            onRemove={(value) => commit(list.key, values[list.key].filter((i) => i !== value))}
          />
        ))}
      </div>
    </section>
  );
}
