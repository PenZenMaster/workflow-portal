import { describe, it, expect } from "vitest";
import { AppError } from "../../server/errors";

describe("AppError", () => {
  it("sets statusCode and message", () => {
    const err = new AppError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
  });

  it("sets optional code when provided", () => {
    const err = new AppError(404, "Not found", "WORKFLOW_NOT_FOUND");
    expect(err.code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("code is undefined when not provided", () => {
    const err = new AppError(500, "Server error");
    expect(err.code).toBeUndefined();
  });

  it("name is AppError", () => {
    const err = new AppError(400, "Bad request");
    expect(err.name).toBe("AppError");
  });

  it("is an instance of Error", () => {
    const err = new AppError(400, "Bad request");
    expect(err).toBeInstanceOf(Error);
  });
});
