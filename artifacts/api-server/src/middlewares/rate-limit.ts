import type { RequestHandler } from "express";

type WindowEntry = { startedAt: number; count: number };
const windows = new Map<string, WindowEntry>();
const intervalMs = 60_000;
const maximumRequests = 120;
let lastCleanup = Date.now();

export const rateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  if (now - lastCleanup > intervalMs * 5) {
    for (const [key, window] of windows) {
      if (now - window.startedAt > intervalMs * 5) windows.delete(key);
    }
    lastCleanup = now;
  }
  const key = req.appUser?.id ?? req.ip ?? "unknown";
  const current = windows.get(key);
  if (!current || now - current.startedAt >= intervalMs) {
    windows.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  current.count += 1;
  if (current.count > maximumRequests) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Too many requests. Try again shortly." });
    return;
  }
  next();
};
