import { clerkClient, getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { appUsersTable, auditLogsTable, db } from "@workspace/db";

const roles = [
  "district_admin",
  "centre_manager",
  "healthcare_staff",
  "inventory_manager",
] as const;

export type AppRole = (typeof roles)[number];

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.SMART_HEALTH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function loadAppUser(userId: string) {
  const [known] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, userId))
    .limit(1);
  if (known) return known;

  const identity = await clerkClient.users.getUser(userId);
  const email =
    identity.primaryEmailAddress?.emailAddress ??
    identity.emailAddresses[0]?.emailAddress ??
    `${identity.id}@users.invalid`;
  const normalizedEmail = email.toLowerCase();
  const name =
    identity.fullName ||
    [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
    email;
  const isBootstrapAdmin = configuredAdminEmails().has(normalizedEmail);
  const values = {
    id: identity.id,
    name,
    email,
    role: isBootstrapAdmin ? "district_admin" : "healthcare_staff",
    status: "active",
  };

  const [created] = await db
    .insert(appUsersTable)
    .values(values)
    .onConflictDoNothing({ target: appUsersTable.id })
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, userId))
    .limit(1);
  if (!raced) throw new Error("Could not load the authenticated app user.");
  return raced;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access this service." });
    return;
  }

  try {
    const user = await loadAppUser(userId);
    if (user.status !== "active") {
      res.status(403).json({ error: "Your application account is inactive." });
      return;
    }
    req.appUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRoles(...allowed: AppRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.appUser || !allowed.includes(req.appUser.role as AppRole)) {
      res.status(403).json({ error: "You do not have permission for this action." });
      return;
    }
    next();
  };
}

export function userCanAccessCentre(
  user: NonNullable<Express.Request["appUser"]>,
  centreId: string,
): boolean {
  if (user.role === "district_admin") return true;
  return user.centreId === centreId;
}

export async function writeAuditLog(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  details = "",
): Promise<void> {
  await db.insert(auditLogsTable).values({
    actorId,
    action,
    entity,
    entityId,
    details,
  });
}

export async function recordUserRoleChange(
  targetId: string,
  role: AppRole,
  centreId: string | null,
) {
  return db
    .update(appUsersTable)
    .set({ role, centreId })
    .where(and(eq(appUsersTable.id, targetId), eq(appUsersTable.status, "active")))
    .returning();
}
