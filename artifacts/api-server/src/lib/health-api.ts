import { eq, type SQL } from "drizzle-orm";
import type { Response } from "express";
import type { AppUserRecord, Centre } from "@workspace/db";
import { centresTable } from "@workspace/db";

export function requireCurrentUser(
  user: AppUserRecord | undefined,
  res: Response,
): user is AppUserRecord {
  if (!user) {
    res.status(401).json({ error: "Sign in to access this service." });
    return false;
  }
  return true;
}

export function canAccessCentre(user: AppUserRecord, centreId: string): boolean {
  return user.role === "district_admin" || user.centreId === centreId;
}

export function centreScope(user: AppUserRecord): SQL | undefined {
  return user.role === "district_admin"
    ? undefined
    : eq(centresTable.id, user.centreId ?? "__no_centre_assigned__");
}

export function toCentreDto(centre: Centre) {
  return {
    ...centre,
    createdAt: centre.createdAt.toISOString(),
  };
}

export function parseId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
