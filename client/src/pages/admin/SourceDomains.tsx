/*
 * Module/Script Name: SourceDomains.tsx
 * Path: client/src/pages/admin/SourceDomains.tsx
 *
 * Description:
 * B-27: admin UI for the source-domain registry (YLG visibility spec
 * section 6.3), previously API-only since v1.34.0. Two sections: the
 * unreviewed-domains queue (newly observed citation domains, sorted by
 * citation count) that powers the spec's monthly review, and the full
 * registry filterable by class. Classifying an unreviewed domain and
 * reclassifying an existing registry entry both PUT the same upsert
 * endpoint - the backend distinguishes them by whether the domain
 * already exists, not by a different route.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 B-27
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { SourceDomain, RegistrySourceClass } from "@shared/schema";
import { REGISTRY_SOURCE_CLASSES } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe2, Pencil } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

interface UnreviewedDomain {
  rootDomain: string;
  citationCount: number;
}

const CLASS_LABELS: Record<RegistrySourceClass, string> = {
  industry_authority: "Industry Authority",
  local_authority: "Local Authority",
  review_platform: "Review Platform",
  publisher_editorial: "Publisher / Editorial",
  general_directory: "General Directory",
  unknown_or_low_trust: "Unknown / Low Trust",
};

function ClassSelect({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Select a class
        </option>
        {REGISTRY_SOURCE_CLASSES.map((cls) => (
          <option key={cls} value={cls}>
            {CLASS_LABELS[cls]}
          </option>
        ))}
      </select>
    </div>
  );
}

function UnreviewedRow({ domain }: { domain: UnreviewedDomain }) {
  const { toast } = useToast();
  const [sourceClass, setSourceClass] = useState("");
  const [rationale, setRationale] = useState("");

  const classifyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/source-domains/${domain.rootDomain}`, { sourceClass, rationale });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/source-domains/unreviewed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/source-domains"] });
      toast({ title: `${domain.rootDomain} classified` });
    },
    onError: (err) =>
      toast({ title: "Failed to classify domain", description: String(err), variant: "destructive" }),
  });

  const canSave = sourceClass.length > 0 && rationale.trim().length > 0;

  return (
    <li className="border rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{domain.rootDomain}</span>
        <span className="text-xs text-muted-foreground">{domain.citationCount}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ClassSelect
          id={`classify-${domain.rootDomain}`}
          value={sourceClass}
          onChange={setSourceClass}
          label={`Classify ${domain.rootDomain}`}
        />
        <div>
          <Label htmlFor={`rationale-${domain.rootDomain}`}>{`Rationale for ${domain.rootDomain}`}</Label>
          <Input
            id={`rationale-${domain.rootDomain}`}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why this class?"
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => classifyMutation.mutate()}
        disabled={!canSave || classifyMutation.isPending}
        aria-label={`Save ${domain.rootDomain}`}
      >
        {`Save ${domain.rootDomain}`}
      </Button>
    </li>
  );
}

function RegistryRow({ domain }: { domain: SourceDomain }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editClass, setEditClass] = useState<string>(domain.sourceClass);
  const [editRationale, setEditRationale] = useState(domain.rationale ?? "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/source-domains/${domain.rootDomain}`, {
        sourceClass: editClass,
        rationale: editRationale,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/source-domains"] });
      setEditing(false);
      toast({ title: `${domain.rootDomain} updated` });
    },
    onError: (err) =>
      toast({ title: "Failed to update domain", description: String(err), variant: "destructive" }),
  });

  const canSave = editClass.length > 0 && editRationale.trim().length > 0;

  if (editing) {
    return (
      <li className="border rounded-lg px-4 py-3 space-y-2">
        <div className="text-sm font-medium">{domain.rootDomain}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ClassSelect
            id={`edit-class-${domain.rootDomain}`}
            value={editClass}
            onChange={setEditClass}
            label="Class"
          />
          <div>
            <Label htmlFor={`edit-rationale-${domain.rootDomain}`}>Rationale</Label>
            <Input
              id={`edit-rationale-${domain.rootDomain}`}
              value={editRationale}
              onChange={(e) => setEditRationale(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => updateMutation.mutate()} disabled={!canSave || updateMutation.isPending}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-sm">
        <div className="font-medium">{domain.rootDomain}</div>
        <div className="text-muted-foreground">{CLASS_LABELS[domain.sourceClass]}</div>
        {domain.rationale && <div className="text-muted-foreground">{domain.rationale}</div>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${domain.rootDomain}`}
        title="Edit"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </li>
  );
}

export default function SourceDomains() {
  const [classFilter, setClassFilter] = useState("");

  const { data: unreviewedData, isLoading: unreviewedLoading } = useQuery<{ data: UnreviewedDomain[] }>({
    queryKey: ["/api/source-domains/unreviewed"],
  });

  const registryUrl = classFilter ? `/api/source-domains?class=${classFilter}` : "/api/source-domains";
  const { data: registryData, isLoading: registryLoading } = useQuery<{ data: SourceDomain[] }>({
    queryKey: [registryUrl],
  });

  const unreviewed = unreviewedData?.data ?? [];
  const registry = registryData?.data ?? [];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs items={[{ label: "Workflows", href: "/" }, { label: "Source Domains" }]} />

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Globe2 className="h-6 w-6 text-primary" />
        Source Domain Registry
      </h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Unreviewed Domains</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Newly observed citation domains, sorted by citation count. Classify each to remove it from
          this queue and add it to the registry.
        </p>
        {unreviewedLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : unreviewed.length === 0 ? (
          <p className="text-muted-foreground text-sm">No unreviewed domains.</p>
        ) : (
          <ul className="space-y-2">
            {unreviewed.map((d) => (
              <UnreviewedRow key={d.rootDomain} domain={d} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Registry</h2>
          <div className="w-56">
            <Label htmlFor="registry-class-filter">Filter by class</Label>
            <select
              id="registry-class-filter"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All classes</option>
              {REGISTRY_SOURCE_CLASSES.map((cls) => (
                <option key={cls} value={cls}>
                  {CLASS_LABELS[cls]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {registryLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : registry.length === 0 ? (
          <p className="text-muted-foreground text-sm">No domains in the registry yet.</p>
        ) : (
          <ul className="space-y-2">
            {registry.map((d) => (
              <RegistryRow key={d.id} domain={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
