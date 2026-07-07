import { describe, expect, it } from "vitest";
import {
  factoryJobSchema,
  validateFactoryJob,
  FACTORY_JOB_PRIORITIES,
} from "../../../shared/factory/job-contract";

function validJob(): Record<string, unknown> {
  return {
    contractVersion: "1.0",
    jobId: "job_01JXYZ",
    clientId: 4,
    jobType: "reporting.monthly-pipeline",
    priority: "normal",
    createdAt: "2026-07-07T15:00:00Z",
    input: {
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    },
    execution: {
      dryRun: false,
      approvalRequired: false,
    },
  };
}

describe("Factory Job Contract v1", () => {
  it("accepts a valid factory job", () => {
    const result = factoryJobSchema.safeParse(validJob());
    expect(result.success).toBe(true);
  });

  it("exposes the allowed priorities", () => {
    expect(FACTORY_JOB_PRIORITIES).toEqual(["low", "normal", "high"]);
  });

  it("rejects a job without a job id", () => {
    const job = validJob();
    delete job.jobId;
    expect(factoryJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects an empty job id", () => {
    const job = { ...validJob(), jobId: "" };
    expect(factoryJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects an unknown contract version", () => {
    const job = { ...validJob(), contractVersion: "2.0" };
    expect(factoryJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects a non-integer client id", () => {
    const jobWithSlug = { ...validJob(), clientId: "salvo-metal-works" };
    expect(factoryJobSchema.safeParse(jobWithSlug).success).toBe(false);

    const jobWithZero = { ...validJob(), clientId: 0 };
    expect(factoryJobSchema.safeParse(jobWithZero).success).toBe(false);
  });

  it("rejects a job type that is not dot-namespaced lowercase", () => {
    for (const jobType of ["Reporting.Monthly", "reporting", "a..b", ""]) {
      const job = { ...validJob(), jobType };
      expect(factoryJobSchema.safeParse(job).success).toBe(false);
    }
  });

  it("rejects an unknown priority", () => {
    const job = { ...validJob(), priority: "urgent" };
    expect(factoryJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects a createdAt that is not an ISO-8601 datetime", () => {
    for (const createdAt of ["2026-07-07", "yesterday", 1751900400000]) {
      const job = { ...validJob(), createdAt };
      expect(factoryJobSchema.safeParse(job).success).toBe(false);
    }
  });

  it("rejects missing execution flags", () => {
    const job = { ...validJob(), execution: { dryRun: false } };
    expect(factoryJobSchema.safeParse(job).success).toBe(false);
  });

  it("validateFactoryJob narrows unknown values to FactoryJob", () => {
    const value: unknown = validJob();
    expect(validateFactoryJob(value)).toBe(true);
    if (validateFactoryJob(value)) {
      expect(value.jobId).toBe("job_01JXYZ");
      expect(value.execution.approvalRequired).toBe(false);
    }
    expect(validateFactoryJob(null)).toBe(false);
    expect(validateFactoryJob({})).toBe(false);
  });
});
