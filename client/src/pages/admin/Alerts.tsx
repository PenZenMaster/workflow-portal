/*
 * Module/Script Name: Alerts.tsx
 * Path: client/src/pages/admin/Alerts.tsx
 *
 * Description:
 * Client-experience sequence plan item 4: super-admin page showing the
 * aggregated failure-state list from GET /api/admin/alerts (failing
 * integrations, failed jobs/factory jobs/exports, failed or partial
 * prompt runs). On-load fetch with a manual refresh button, no polling
 * and no dismiss/acknowledge concept - matches the /admin/jobs precedent
 * of being a live reflection of current state.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-19
 * Last Modified Date: 2026-08-19
 * Comments:
 * - v1.00 initial implementation
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BellRing, RefreshCw } from "lucide-react";

interface AdminAlert {
  id: string;
  kind: string;
  clientId: number | null;
  clientName: string | null;
  message: string;
  detailHref: string;
  occurredAt: number;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const KIND_LABEL: Record<string, string> = {
  integration_failing: "Integration",
  job_failed: "Job",
  factory_job_failed: "Factory Job",
  export_failed: "Export",
  run_failed_partial: "Prompt Run",
};

export default function Alerts() {
  const { data, isLoading, isFetching, refetch } = useQuery<{ data: { alerts: AdminAlert[] } }>({
    queryKey: ["/api/admin/alerts"],
  });

  const alerts = data?.data.alerts ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Breadcrumbs items={[{ label: "Workflows", href: "/" }, { label: "Admin Alerts" }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6 text-primary" />
            Admin Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Failing integrations, failed jobs, and failed or partial prompt runs across every client.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
            void refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No active alerts.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                    {KIND_LABEL[alert.kind] ?? alert.kind}
                  </span>
                  {alert.clientId !== null && (
                    <Link href={alert.detailHref} className="text-sm font-medium text-primary hover:underline">
                      {alert.clientName ?? `Client #${alert.clientId}`}
                    </Link>
                  )}
                </div>
                <div className="text-sm mt-0.5">{alert.message}</div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {formatAge(Date.now() - alert.occurredAt)} ago
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
