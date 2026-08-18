/*
 * Module/Script Name: RankRocketSiteInsights.tsx
 * Path: client/src/pages/admin/RankRocketSiteInsights.tsx
 *
 * Description:
 * Admin page for the "RankRocket Site Insights" workflow card's
 * configuration. Part C: CRUD for the "What do you want to know about
 * this site?" question options, previously a hardcoded
 * RANKROCKET_QUESTION_OPTIONS const array. Part D (this slice): a Sites
 * section - CRUD for the site-key dropdown's real WordPress credentials
 * (baseUrl/authUser/appPassword), via server/routes/rankrocketAdmin.ts's
 * Part B routes, which pass through to rankrocket-mcp's own registry
 * (server/mcp/sitesAdmin.ts). This page never receives appPassword back
 * from the server once written - the "Edit" form always opens with the
 * password field blank and requires it to be re-entered to save,
 * mirroring the write-only-secret-field convention most credential UIs
 * use, since the value can never be redisplayed for editing.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 * - v1.01 Part D: Sites section
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { RankrocketQuestionOption } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpCircle, Globe, Pencil, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

interface RankrocketSiteDetail {
  key: string;
  baseUrl: string;
  authUser: string;
}

function SitesSection() {
  const { toast } = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editAuthUser, setEditAuthUser] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newAuthUser, setNewAuthUser] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery<{ data: RankrocketSiteDetail[] }>({
    queryKey: ["/api/rankrocket-mcp/sites/admin"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/rankrocket-mcp/sites/admin"] });

  const updateMutation = useMutation({
    mutationFn: async (vars: { key: string; baseUrl: string; authUser: string; appPassword: string }) => {
      await apiRequest("PATCH", `/api/rankrocket-mcp/sites/${vars.key}`, {
        baseUrl: vars.baseUrl,
        authUser: vars.authUser,
        appPassword: vars.appPassword,
      });
    },
    onSuccess: () => {
      invalidate();
      setEditingKey(null);
      toast({ title: "Site updated" });
    },
    onError: (err) =>
      toast({ title: "Failed to update site", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await apiRequest("DELETE", `/api/rankrocket-mcp/sites/${key}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Site removed" });
    },
    onError: (err) =>
      toast({ title: "Failed to delete site", description: String(err), variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/rankrocket-mcp/sites", {
        key: newKey,
        baseUrl: newBaseUrl,
        authUser: newAuthUser,
        appPassword: newPassword,
      });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Site added" });
      setNewKey("");
      setNewBaseUrl("");
      setNewAuthUser("");
      setNewPassword("");
    },
    onError: (err) =>
      toast({ title: "Failed to add site", description: String(err), variant: "destructive" }),
  });

  const sites = data?.data ?? [];
  const canSubmitNew =
    newKey.trim().length > 0 &&
    newBaseUrl.trim().length > 0 &&
    newAuthUser.trim().length > 0 &&
    newPassword.trim().length > 0;
  const canSubmitEdit =
    editBaseUrl.trim().length > 0 && editAuthUser.trim().length > 0 && editPassword.trim().length > 0;

  const startEdit = (site: RankrocketSiteDetail) => {
    setEditingKey(site.key);
    setEditBaseUrl(site.baseUrl);
    setEditAuthUser(site.authUser);
    setEditPassword("");
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading sites...</p>;

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
        <Globe className="h-5 w-5 text-primary" />
        Sites
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        RankRocket MCP site registry (WordPress credentials). Never displayed once saved - editing
        requires re-entering the Application Password.
      </p>

      {sites.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sites configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {sites.map((site) => (
            <li key={site.key} className="border rounded-lg px-4 py-3">
              {editingKey === site.key ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{site.key}</div>
                  <div>
                    <Label htmlFor={`edit-base-url-${site.key}`}>Base URL</Label>
                    <Input
                      id={`edit-base-url-${site.key}`}
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-auth-user-${site.key}`}>WP username</Label>
                    <Input
                      id={`edit-auth-user-${site.key}`}
                      value={editAuthUser}
                      onChange={(e) => setEditAuthUser(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-app-password-${site.key}`}>New WP Application Password</Label>
                    <Input
                      id={`edit-app-password-${site.key}`}
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Required to save"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({
                          key: site.key,
                          baseUrl: editBaseUrl,
                          authUser: editAuthUser,
                          appPassword: editPassword,
                        })
                      }
                      disabled={!canSubmitEdit || updateMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{site.key}</div>
                    <div className="text-muted-foreground">{site.baseUrl}</div>
                    <div className="text-muted-foreground">{site.authUser}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(site)}
                      aria-label={`Edit ${site.key}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(site.key)}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${site.key}`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 border rounded-lg p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmitNew) createMutation.mutate();
        }}
      >
        <h3 className="text-sm font-semibold">Add site</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="new-site-key">Site key</Label>
            <Input id="new-site-key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="tristate-hvac" />
          </div>
          <div>
            <Label htmlFor="new-site-base-url">Base URL</Label>
            <Input
              id="new-site-base-url"
              value={newBaseUrl}
              onChange={(e) => setNewBaseUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div>
            <Label htmlFor="new-site-auth-user">WP username</Label>
            <Input id="new-site-auth-user" value={newAuthUser} onChange={(e) => setNewAuthUser(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-site-app-password">WP Application Password</Label>
            <Input
              id="new-site-app-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={!canSubmitNew || createMutation.isPending}>
          Add site
        </Button>
        {createMutation.isError && (
          <p className="text-sm text-destructive">{String(createMutation.error)}</p>
        )}
      </form>
    </section>
  );
}

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

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <HelpCircle className="h-6 w-6 text-primary" />
        RankRocket Site Insights
      </h1>

      <SitesSection />

      <h2 className="text-lg font-semibold mb-1">Question Options</h2>
      <p className="text-sm text-muted-foreground mb-4">
        The "What do you want to know about this site?" question options offered on the
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
