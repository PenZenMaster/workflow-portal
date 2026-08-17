/*
 * Module/Script Name: RankRocketSiteInsights.tsx
 * Path: client/src/pages/admin/RankRocketSiteInsights.tsx
 *
 * Description:
 * Admin page for the "RankRocket Site Insights" workflow card's
 * configuration. Part C (this slice): CRUD for the "What do you want to
 * know about this site?" question options, previously a hardcoded
 * RANKROCKET_QUESTION_OPTIONS const array. Part B (site credentials)
 * adds a Sites section to this same page in a later slice.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { RankrocketQuestionOption } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpCircle, Pencil, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function RankRocketSiteInsights() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const { data, isLoading } = useQuery<{ data: RankrocketQuestionOption[] }>({
    queryKey: ["/api/rankrocket-question-options"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/rankrocket-question-options"] });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: number; label: string }) => {
      await apiRequest("PATCH", `/api/rankrocket-question-options/${vars.id}`, { label: vars.label });
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast({ title: "Question option updated" });
    },
    onError: (err) =>
      toast({ title: "Failed to update option", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/rankrocket-question-options/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Question option removed" });
    },
    onError: (err) =>
      toast({ title: "Failed to delete option", description: String(err), variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/rankrocket-question-options", { label: newLabel });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Question option added" });
      setNewLabel("");
    },
    onError: (err) =>
      toast({ title: "Failed to add option", description: String(err), variant: "destructive" }),
  });

  const options = data?.data ?? [];
  const canSubmit = newLabel.trim().length > 0;

  const startEdit = (option: RankrocketQuestionOption) => {
    setEditingId(option.id);
    setEditLabel(option.label);
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[{ label: "Workflows", href: "/" }, { label: "RankRocket Site Insights" }]}
      />

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <HelpCircle className="h-6 w-6 text-primary" />
        RankRocket Site Insights
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Manage the "What do you want to know about this site?" question options offered on the
        RankRocket Site Insights workflow card.
      </p>

      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">No question options configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((option) => (
            <li key={option.id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              {editingId === option.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: option.id, label: editLabel })}
                      disabled={editLabel.trim().length === 0 || updateMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm">{option.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(option)}
                      aria-label={`Edit ${option.label}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(option.id)}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${option.label}`}
                      title="Delete"
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

      <form
        className="mt-8 border rounded-lg p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Add question option</h2>
        <div>
          <Label htmlFor="new-question-option">New question option</Label>
          <Input
            id="new-question-option"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Current schema markup coverage"
          />
        </div>
        <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
          Add question option
        </Button>
        {createMutation.isError && (
          <p className="text-sm text-destructive">{String(createMutation.error)}</p>
        )}
      </form>
    </div>
  );
}
