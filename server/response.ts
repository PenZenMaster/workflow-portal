import type { Response } from "express";

export const ok = <T>(res: Response, data: T, status = 200): Response =>
  res.status(status).json({ data });

export const created = <T>(res: Response, data: T): Response =>
  res.status(201).json({ data });

export const noContent = (res: Response): Response =>
  res.status(204).send();
