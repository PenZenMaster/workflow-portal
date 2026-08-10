/*
 * Module/Script Name: Jobs.tsx
 * Path: client/src/pages/admin/Jobs.tsx
 *
 * Description:
 * Super-admin job queue monitoring page. Shows runner health (stalled
 * detection), per-status counts, and a table of recent jobs with manual
 * requeue/cancel actions plus a "rescue hung jobs" button.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-11
 * Last Modified Date: 2026-06-11
 * Comments:
 * - v1.00 Job runner monitoring feature initial implementation
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Job, JobStatus } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, RotateCcw, XCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// FR-002: the jobs table can hold tens of thousands of rows; the page was
// unresponsive because the list query had no limit at all. This bounds
// what's fetched/rendered at once regardless of filter.
const JOBS_PAGE_SIZE = 200;

interface JobsResponse {
  jobs: Job[];
  counts: Record<JobStatus, number>;
}

interface HealthResponse {
  lastTickAt: number | null;
  secondsSinceTick: number | null;
  intervalMs: number | null;
  running: boolean;
  isStalled: boolean;
  counts: Record<JobStatus, number>;
  hungCount: number;
}

const STATUS_STYLE: Record<JobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(["done", "failed", "cancelled"]);

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

export default function Jobs() {
  const { toast } = useToast();
  // FR-001: clicking a status pill filters the list below to that status;
  // clicking the active pill again clears the filter.
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);

  const jobsQueryParams = new URLSearchParams({ limit: String(JOBS_PAGE_SIZE) });
  if (statusFilter) jobsQueryParams.set("status", statusFilter);

  const { data: jobsData, isLoading } = useQuery<{ data: JobsResponse }>({
    queryKey: [`/api/jobs?${jobsQueryParams.toString()}`],
    refetchInterval: 5_000,
  });

  const { data: healthData } = useQuery<{ data: HealthResponse }>({
    queryKey: ["/api/jobs/health"],
    refetchInterval: 5_000,
  });

  const requeueMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/jobs/${id}/requeue`);
      return res.json() as Promise<{ data: Job }>;
    },
    onSuccess: () => {
      // The list query's key now carries the current filter/limit as a
      // query string (e.g. "/api/jobs?limit=200&status=failed"), so a
      // static key match would silently stop invalidating it - match by
      // prefix instead. "/api/jobs?" (not "/api/jobs") so this never
      // also matches the separate /api/jobs/health query.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/jobs?"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/health"] });
      toast({ title: "Job requeued" });
    },
    onError: (err) =>
      toast({ title: "Failed to requeue job", description: String(err), variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/jobs/${id}/cancel`);
      return res.json() as Promise<{ data: Job }>;
    },
    onSuccess: () => {
      // The list query's key now carries the current filter/limit as a
      // query string (e.g. "/api/jobs?limit=200&status=failed"), so a
      // static key match would silently stop invalidating it - match by
      // prefix instead. "/api/jobs?" (not "/api/jobs") so this never
      // also matches the separate /api/jobs/health query.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/jobs?"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/health"] });
      toast({ title: "Job cancelled" });
    },
    onError: (err) =>
      toast({ title: "Failed to cancel job", description: String(err), variant: "destructive" }),
  });

  const rescueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/rescue");
      return res.json() as Promise<{ data: { rescued: number } }>;
    },
    onSuccess: (result) => {
      // The list query's key now carries the current filter/limit as a
      // query string (e.g. "/api/jobs?limit=200&status=failed"), so a
      // static key match would silently stop invalidating it - match by
      // prefix instead. "/api/jobs?" (not "/api/jobs") so this never
      // also matches the separate /api/jobs/health query.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/jobs?"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/health"] });
      toast({ title: `Rescued ${result.data.rescued} hung job${result.data.rescued === 1 ? "" : "s"}` });
    },
    onError: (err) =>
      toast({ title: "Failed to rescue jobs", description: String(err), variant: "destructive" }),
  });

  const jobs = jobsData?.data.jobs ?? [];
  const counts = jobsData?.data.counts;
  const health = healthData?.data;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Breadcrumbs
        items={[{ label: "Workflows", href: "/" }, { label: "Job Queue" }]}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Job Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Background job runner health, queue status, and manual recovery.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => rescueMutation.mutate()}
          disabled={rescueMutation.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Rescue hung jobs
        </Button>
      </div>

      {/* Health banner */}
      {health && (
        <div
          className={`border rounded-lg px-4 py-3 mb-6 flex items-center gap-3 ${
            health.isStalled
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border bg-muted/30"
          }`}
        >
          {health.isStalled ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <Activity className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          )}
          <div className="text-sm">
            {health.isStalled ? (
              <span className="font-semibold">Job runner appears STALLED</span>
            ) : (
              <span className="font-semibold">Job runner is running</span>
            )}
            {health.secondsSinceTick !== null && (
              <span className="ml-2">
                last tick {formatAge(health.secondsSinceTick * 1000)} ago
              </span>
            )}
            {health.intervalMs !== null && (
              <span className="ml-2 text-muted-foreground">
                (interval {Math.round(health.intervalMs / 1000)}s)
              </span>
            )}
            {health.hungCount > 0 && (
              <span className="ml-2">- {health.hungCount} hung job{health.hungCount === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
      )}

      {/* Status counts — click a pill to filter the list below, click again to clear */}
      {counts && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(counts) as JobStatus[]).map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(active ? null : status)}
                aria-pressed={active}
                title={active ? `Clear ${status} filter` : `Filter to ${status} jobs`}
                className={`text-xs px-2 py-1 rounded transition-colors ${STATUS_STYLE[status]} ${
                  active ? "ring-2 ring-offset-1 ring-primary" : "hover-elevate"
                }`}
              >
                {status}: {counts[status]}
              </button>
            );
          })}
        </div>
      )}

      {/* Jobs table */}
      {jobs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No jobs found.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const now = Date.now();
            const isHung =
              job.status === "running" && job.lockedUntil !== null && job.lockedUntil < now;
            return (
              <li key={job.id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">#{job.id}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{job.kind}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[job.status]}`}>
                        {job.status}
                      </span>
                      {isHung && (
                        <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                          hung
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      attempts {job.attempts}/{job.maxAttempts} - updated {formatAge(now - job.updatedAt)} ago
                      {job.lastError && (
                        <span className="ml-2 text-destructive">{job.lastError.slice(0, 120)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(job.status === "failed" || job.status === "cancelled" || isHung) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => requeueMutation.mutate(job.id)}
                      disabled={requeueMutation.isPending}
                      title="Requeue job"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {!TERMINAL.has(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelMutation.mutate(job.id)}
                      disabled={cancelMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      title="Cancel job"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
