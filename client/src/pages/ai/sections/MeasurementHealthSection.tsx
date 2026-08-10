import { Fragment, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type MeasurementHealthStatus = "healthy" | "healthy_with_warnings" | "degraded" | "invalid_for_reporting";

interface MeasurementHealthOverride {
  id: number;
  runId: number;
  status: MeasurementHealthStatus;
  reason: string;
  overriddenByUserId: number;
  createdAt: number;
  updatedAt: number;
}

interface RunHealthSummary {
  runId: number;
  status: MeasurementHealthStatus;
  reasons: string[];
  override: MeasurementHealthOverride | null;
}

interface MeasurementHealthRollup {
  totalRuns: number;
  healthy: number;
  healthyWithWarnings: number;
  degraded: number;
  invalidForReporting: number;
}

interface MeasurementHealthPeriod {
  period: string;
  runs: RunHealthSummary[];
  rollup: MeasurementHealthRollup;
}

const STATUS_LABEL: Record<MeasurementHealthStatus, string> = {
  healthy: "Healthy",
  healthy_with_warnings: "Healthy (warnings)",
  degraded: "Degraded",
  invalid_for_reporting: "Invalid for reporting",
};

const OVERRIDABLE_ROLES = new Set(["super_admin", "agency_admin"]);

// issue #30 slice 5: period-level rollup - "N of M runs healthy" so
// analysts and clients can tell at a glance whether the numbers on the
// rest of this page can be trusted, without opening every run.
export function MeasurementHealthSection({ clientId }: { clientId: string }) {
  const { status: authStatus } = useAuth();
  const canOverride = !!authStatus?.user && OVERRIDABLE_ROLES.has(authStatus.user.role);

  // issue #30 slice 5b: admin override - which run's inline edit form is
  // open, and its pending status/reason selection.
  const [editingRunId, setEditingRunId] = useState<number | null>(null);
  const [formStatus, setFormStatus] = useState<MeasurementHealthStatus>("healthy");
  const [formReason, setFormReason] = useState("");

  const queryKey = [`/api/clients/${clientId}/measurement-health`];
  const { data, isLoading, isError } = useQuery<{ data: MeasurementHealthPeriod }>({
    queryKey,
    retry: false,
  });

  function closeForm() {
    setEditingRunId(null);
    setFormReason("");
  }

  const overrideMutation = useMutation({
    mutationFn: async (runId: number) =>
      apiRequest("PATCH", `/api/runs/${runId}/measurement-health/override`, {
        status: formStatus,
        reason: formReason.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      closeForm();
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (runId: number) => apiRequest("DELETE", `/api/runs/${runId}/measurement-health/override`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  if (isLoading || isError) return null;
  const health = data?.data;
  if (!health || health.rollup.totalRuns === 0) return null;

  const { rollup } = health;
  const trustworthy = rollup.healthy + rollup.healthyWithWarnings;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Measurement Health</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Last {health.period}: {trustworthy} of {rollup.totalRuns} run
        {rollup.totalRuns === 1 ? "" : "s"} healthy
        {rollup.degraded > 0 && `, ${rollup.degraded} degraded`}
        {rollup.invalidForReporting > 0 && `, ${rollup.invalidForReporting} invalid for reporting`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              {canOverride && <th className="py-2 font-medium">Admin override</th>}
            </tr>
          </thead>
          <tbody>
            {health.runs.map((run) => (
              <Fragment key={run.runId}>
                <tr className="border-b last:border-0">
                  <td className="py-2 pr-4">#{run.runId}</td>
                  <td className="py-2 pr-4">
                    {STATUS_LABEL[run.status]}
                    {run.override && (
                      <span className="ml-1.5 text-xs text-muted-foreground" title={run.override.reason}>
                        (overridden)
                      </span>
                    )}
                  </td>
                  {canOverride && (
                    <td className="py-2">
                      {run.override ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearMutation.mutate(run.runId)}
                          disabled={clearMutation.isPending}
                        >
                          Clear override
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRunId(run.runId);
                            setFormStatus(run.status);
                            setFormReason("");
                          }}
                        >
                          Override
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                {canOverride && editingRunId === run.runId && (
                  <tr className="border-b last:border-0 bg-muted/30">
                    <td colSpan={3} className="py-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`override-status-${run.runId}`} className="text-xs text-muted-foreground">
                            Status
                          </label>
                          <select
                            id={`override-status-${run.runId}`}
                            className="text-sm border rounded px-2 py-1 bg-background"
                            value={formStatus}
                            onChange={(e) => setFormStatus(e.target.value as MeasurementHealthStatus)}
                          >
                            {Object.entries(STATUS_LABEL).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                          <label htmlFor={`override-reason-${run.runId}`} className="text-xs text-muted-foreground">
                            Reason (required)
                          </label>
                          <input
                            id={`override-reason-${run.runId}`}
                            type="text"
                            className="text-sm border rounded px-2 py-1 bg-background"
                            value={formReason}
                            onChange={(e) => setFormReason(e.target.value)}
                            placeholder="Why override this run's computed status?"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => overrideMutation.mutate(run.runId)}
                          disabled={!formReason.trim() || overrideMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={closeForm}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
