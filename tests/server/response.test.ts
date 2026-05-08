import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { ok, created, noContent } from "../../server/response";

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe("ok", () => {
  it("sends 200 with data envelope by default", () => {
    const res = mockRes();
    ok(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 1 } });
  });

  it("accepts a custom status code", () => {
    const res = mockRes();
    ok(res, { id: 1 }, 202);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 1 } });
  });
});

describe("created", () => {
  it("sends 201 with data envelope", () => {
    const res = mockRes();
    created(res, { id: 5 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 5 } });
  });
});

describe("noContent", () => {
  it("sends 204 with no body", () => {
    const res = mockRes();
    noContent(res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
