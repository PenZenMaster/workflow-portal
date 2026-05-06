import { describe, it, expect } from "vitest";
import {
  insertWorkflowSchema,
  loginSchema,
  createUserSchema,
} from "./schema";

describe("insertWorkflowSchema", () => {
  const VALID = {
    name: "SEO Audit",
    category: "Audit",
    description: "Full audit workflow",
    inputs: ["URL", "GBP link"],
    tags: ["seo", "audit"],
    prompt: "Run audit on <PASTE>",
    launchUrl: "https://www.perplexity.ai/",
    launchLabel: "Launch in Perplexity",
    pinned: false,
  };

  it("accepts a fully populated valid workflow", () => {
    expect(insertWorkflowSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a minimal workflow (only required fields)", () => {
    const result = insertWorkflowSchema.safeParse({
      name: "Minimal",
      category: "Other",
      description: "Desc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const { name: _, ...rest } = VALID;
    expect(insertWorkflowSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(
      insertWorkflowSchema.safeParse({ ...VALID, name: "" }).success
    ).toBe(false);
  });

  it("rejects a missing category", () => {
    const { category: _, ...rest } = VALID;
    expect(insertWorkflowSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing description", () => {
    const { description: _, ...rest } = VALID;
    expect(insertWorkflowSchema.safeParse(rest).success).toBe(false);
  });

  it("defaults inputs to an empty array", () => {
    const result = insertWorkflowSchema.safeParse({
      name: "X",
      category: "Other",
      description: "D",
    });
    expect(result.success && result.data.inputs).toEqual([]);
  });

  it("defaults tags to an empty array", () => {
    const result = insertWorkflowSchema.safeParse({
      name: "X",
      category: "Other",
      description: "D",
    });
    expect(result.success && result.data.tags).toEqual([]);
  });

  it("defaults pinned to false", () => {
    const result = insertWorkflowSchema.safeParse({
      name: "X",
      category: "Other",
      description: "D",
    });
    expect(result.success && result.data.pinned).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({ username: "alice", password: "pass" }).success
    ).toBe(true);
  });

  it("rejects empty username", () => {
    expect(
      loginSchema.safeParse({ username: "", password: "pass" }).success
    ).toBe(false);
  });

  it("rejects empty password", () => {
    expect(
      loginSchema.safeParse({ username: "alice", password: "" }).success
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("accepts a valid username and password", () => {
    expect(
      createUserSchema.safeParse({
        username: "alice",
        password: "strongpassword1",
      }).success
    ).toBe(true);
  });

  it("rejects username shorter than 3 characters", () => {
    expect(
      createUserSchema.safeParse({ username: "ab", password: "strongpassword1" })
        .success
    ).toBe(false);
  });

  it("rejects username longer than 40 characters", () => {
    expect(
      createUserSchema.safeParse({
        username: "a".repeat(41),
        password: "strongpassword1",
      }).success
    ).toBe(false);
  });

  it("rejects username with invalid characters", () => {
    expect(
      createUserSchema.safeParse({
        username: "bad user!",
        password: "strongpassword1",
      }).success
    ).toBe(false);
  });

  it("rejects password shorter than 10 characters", () => {
    expect(
      createUserSchema.safeParse({ username: "alice", password: "short" })
        .success
    ).toBe(false);
  });
});
