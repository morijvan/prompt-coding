import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { alias } from "drizzle-orm/pg-core";
import {
  AskAssistantBody,
  AskAssistantResponse,
  DecideRecommendationBody,
  DecideRecommendationParams,
  DecideRecommendationResponse,
  DownloadSummaryReportResponse,
  GetCurrentUserResponse,
  GetDashboardQueryParams,
  GetDashboardResponse,
  GetDemandForecastsQueryParams,
  GetDemandForecastsResponse,
  ListAlertsQueryParams,
  ListAlertsResponse,
  ListAuditLogsQueryParams,
  ListAuditLogsResponse,
  ListRecommendationsQueryParams,
  ListRecommendationsResponse,
  ListUsersResponse,
  UpdateAlertBody,
  UpdateAlertParams,
  UpdateAlertResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import {
  alertsTable,
  appUsersTable,
  auditLogsTable,
  attendanceTable,
  bedsTable,
  centresTable,
  db,
  inventoryMovementsTable,
  inventoryTable,
  recommendationsTable,
  staffTable,
  testsTable,
  visitAggregatesTable,
} from "@workspace/db";
import { canAccessCentre, centreScope } from "../lib/health-api";
import {
  recordUserRoleChange,
  requireRoles,
  userCanAccessCentre,
  writeAuditLog,
} from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", (req, res): void => {
  const user = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      centreId: user.centreId,
    }),
  );
});

router.get(
  "/users",
  requireRoles("district_admin"),
  async (req, res): Promise<void> => {
    const users = await db
      .select()
      .from(appUsersTable)
      .orderBy(appUsersTable.name);
    res.json(ListUsersResponse.parse({ items: users }));
  },
);

router.patch(
  "/users/:id",
  requireRoles("district_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateUserRoleParams.safeParse(req.params);
    const body = UpdateUserRoleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (params.data.id === req.appUser!.id) {
      res.status(409).json({
        error: "You cannot change your own role from this screen.",
      });
      return;
    }
    if (body.data.centreId) {
      const [centre] = await db
        .select({ id: centresTable.id })
        .from(centresTable)
        .where(eq(centresTable.id, body.data.centreId))
        .limit(1);
      if (!centre) {
        res.status(400).json({ error: "Select an existing health centre." });
        return;
      }
    }
    const [user] = await recordUserRoleChange(
      params.data.id,
      body.data.role,
      body.data.centreId,
    );
    if (!user) {
      res.status(404).json({ error: "Application user not found." });
      return;
    }
    await writeAuditLog(
      req.appUser!.id,
      "role-changed",
      "user",
      user.id,
      `${user.role} · ${user.centreId ?? "all centres"}`,
    );
    res.json(UpdateUserRoleResponse.parse(user));
  },
);

router.get(
  "/audit-logs",
  requireRoles("district_admin"),
  async (req, res): Promise<void> => {
    const query = ListAuditLogsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const logs = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(query.data.limit ?? 50);
    res.json(
      ListAuditLogsResponse.parse({
        items: logs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
      }),
    );
  },
);

router.get("/dashboard", async (req, res): Promise<void> => {
  const query = GetDashboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  if (query.data.centreId && !userCanAccessCentre(user, query.data.centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const centreFilter = centreScope(user);
  const visitScope = [
    user.role === "district_admin"
      ? undefined
      : eq(
          visitAggregatesTable.centreId,
          user.centreId ?? "__no_centre_assigned__",
        ),
  ];
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  visitScope.push(
    gte(visitAggregatesTable.date, fromDate.toISOString().slice(0, 10)),
  );
  if (query.data.centreId) {
    visitScope.push(eq(visitAggregatesTable.centreId, query.data.centreId));
  }
  const [
    centres,
    inventory,
    bedRows,
    staffRows,
    attendanceRows,
    visits,
    alertRows,
    activityRows,
  ] = await Promise.all([
    db
      .select()
      .from(centresTable)
      .where(
        and(
          centreFilter,
          query.data.centreId
            ? eq(centresTable.id, query.data.centreId)
            : undefined,
          query.data.facilityType
            ? eq(centresTable.type, query.data.facilityType)
            : undefined,
        ),
      )
      .orderBy(centresTable.name),
    db
      .select()
      .from(inventoryTable)
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                inventoryTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          query.data.centreId
            ? eq(inventoryTable.centreId, query.data.centreId)
            : undefined,
        ),
      ),
    db
      .select({ bed: bedsTable, centreName: centresTable.name })
      .from(bedsTable)
      .innerJoin(centresTable, eq(bedsTable.centreId, centresTable.id))
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                bedsTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          query.data.centreId
            ? eq(bedsTable.centreId, query.data.centreId)
            : undefined,
        ),
      ),
    db
      .select()
      .from(staffTable)
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                staffTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          query.data.centreId
            ? eq(staffTable.centreId, query.data.centreId)
            : undefined,
        ),
      ),
    db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.date, new Date().toISOString().slice(0, 10)),
          user.role === "district_admin"
            ? undefined
            : eq(
                attendanceTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          query.data.centreId
            ? eq(attendanceTable.centreId, query.data.centreId)
            : undefined,
        ),
      ),
    db.select().from(visitAggregatesTable).where(and(...visitScope)),
    db
      .select({ alert: alertsTable, centreName: centresTable.name })
      .from(alertsTable)
      .innerJoin(centresTable, eq(alertsTable.centreId, centresTable.id))
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                alertsTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          query.data.centreId
            ? eq(alertsTable.centreId, query.data.centreId)
            : undefined,
        ),
      )
      .orderBy(desc(alertsTable.createdAt))
      .limit(6),
    user.role === "district_admin"
      ? db
          .select()
          .from(auditLogsTable)
          .orderBy(desc(auditLogsTable.createdAt))
          .limit(8)
      : Promise.resolve([]),
  ]);
  const centreById = new Map(centres.map((centre) => [centre.id, centre]));
  const visitByCentre = new Map<string, number>();
  const visitByDate = new Map<string, number>();
  let visitsToday = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const visit of visits) {
    visitByCentre.set(
      visit.centreId,
      (visitByCentre.get(visit.centreId) ?? 0) + visit.visits,
    );
    visitByDate.set(
      visit.date,
      (visitByDate.get(visit.date) ?? 0) + visit.visits,
    );
    if (visit.date === today) visitsToday += visit.visits;
  }
  const bedAvailableByCentre = new Map<string, number>();
  for (const { bed } of bedRows) {
    bedAvailableByCentre.set(
      bed.centreId,
      (bedAvailableByCentre.get(bed.centreId) ?? 0) +
        Math.max(0, bed.total - bed.occupied - bed.outOfService),
    );
  }
  const doctorStaffIds = new Set(
    staffRows
      .filter(
        (staff) =>
          staff.scheduled &&
          /doctor|medical officer/i.test(staff.role),
      )
      .map((staff) => staff.id),
  );
  const doctorAttendance = attendanceRows.filter((record) =>
    doctorStaffIds.has(record.staffId),
  );
  const doctorPresent = doctorAttendance.filter(
    (record) => record.status === "present",
  ).length;
  const explicitDoctorRecords = doctorAttendance.filter(
    (record) => record.status !== "scheduled",
  ).length;
  const doctorRate = explicitDoctorRecords
    ? Math.round((doctorPresent / explicitDoctorRecords) * 100)
    : 0;
  const categoryCounts = new Map<
    string,
    { healthy: number; low: number; critical: number }
  >();
  let stockOuts = 0;
  for (const item of inventory) {
    const tally = categoryCounts.get(item.category) ?? {
      healthy: 0,
      low: 0,
      critical: 0,
    };
    if (item.quantity === 0) {
      tally.critical += 1;
      stockOuts += 1;
    } else if (item.quantity <= item.minimumStock) {
      tally.low += 1;
    } else {
      tally.healthy += 1;
    }
    categoryCounts.set(item.category, tally);
  }
  const centreStatus = centres.map((centre) => {
    const centreStaffIds = new Set(
      staffRows
        .filter(
          (staff) =>
            staff.centreId === centre.id &&
            /doctor|medical officer/i.test(staff.role),
        )
        .map((staff) => staff.id),
    );
    const recorded = attendanceRows.filter(
      (record) =>
        record.centreId === centre.id &&
        centreStaffIds.has(record.staffId) &&
        record.status !== "scheduled",
    );
    const present = recorded.filter((record) => record.status === "present");
    const lowStock = inventory.some(
      (item) =>
        item.centreId === centre.id && item.quantity <= item.minimumStock,
    );
    return {
      centreId: centre.id,
      name: centre.name,
      type: centre.type,
      visits: visitByCentre.get(centre.id) ?? 0,
      bedsAvailable: bedAvailableByCentre.get(centre.id) ?? 0,
      attendance: recorded.length
        ? Math.round((present.length / recorded.length) * 100)
        : null,
      stockStatus: lowStock ? "Attention" : "Normal",
    };
  });
  const allAvailableBeds = bedRows.reduce(
    (sum, { bed }) =>
      sum + Math.max(0, bed.total - bed.occupied - bed.outOfService),
    0,
  );
  const mappedAlerts = alertRows.map(({ alert, centreName }) => ({
    ...alert,
    centreName,
    createdAt: alert.createdAt.toISOString(),
  }));
  const result = {
    totals: {
      centres: centres.length,
      visitsToday,
      availableBeds: allAvailableBeds,
      stockOuts,
      doctorAttendance: explicitDoctorRecords ? doctorRate : null,
    },
    visitTrend: Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const dateLabel = date.toISOString().slice(0, 10);
      return { date: dateLabel, visits: visitByDate.get(dateLabel) ?? 0 };
    }),
    centreStatus,
    inventoryStatus: [...categoryCounts.entries()].map(([name, counts]) => ({
      name,
      ...counts,
    })),
    recentAlerts: mappedAlerts,
    recentActivity: activityRows.map((activity) => ({
      id: activity.id,
      text: `${activity.actorId} ${activity.action} ${activity.entity}`,
      time: activity.createdAt.toISOString(),
      kind: activity.entity,
    })),
    mapCentres: centres.map((centre) => ({
      ...centre,
      createdAt: centre.createdAt.toISOString(),
    })),
  };
  res.json(GetDashboardResponse.parse(result));
});

router.get("/alerts", async (req, res): Promise<void> => {
  const query = ListAlertsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { severity, status = "open", page = 1, pageSize = 20 } = query.data;
  const scope =
    user.role === "district_admin"
      ? undefined
      : eq(
          alertsTable.centreId,
          user.centreId ?? "__no_centre_assigned__",
        );
  const pageFilters = [
    scope,
    status === "all" ? undefined : eq(alertsTable.status, status),
    severity ? eq(alertsTable.severity, severity) : undefined,
  ];
  const allFilters = [scope];
  const wherePage = and(...pageFilters);
  const whereAll = and(...allFilters);
  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select({ alert: alertsTable, centreName: centresTable.name })
      .from(alertsTable)
      .innerJoin(centresTable, eq(alertsTable.centreId, centresTable.id))
      .where(wherePage)
      .orderBy(desc(alertsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(alertsTable).where(wherePage),
    db.select().from(alertsTable).where(whereAll),
  ]);
  const items = rows.map(({ alert, centreName }) => ({
    ...alert,
    centreName,
    createdAt: alert.createdAt.toISOString(),
  }));
  res.json(
    ListAlertsResponse.parse({
      items,
      total: Number(total),
      counts: {
        critical: counts.filter((alert) => alert.severity === "critical").length,
        warning: counts.filter((alert) => alert.severity === "warning").length,
        info: counts.filter((alert) => alert.severity === "info").length,
      },
    }),
  );
});

router.patch(
  "/alerts/:id",
  async (req, res): Promise<void> => {
    const params = UpdateAlertParams.safeParse(req.params);
    const body = UpdateAlertBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.id, params.data.id))
      .limit(1);
    if (!existing || !userCanAccessCentre(req.appUser!, existing.centreId)) {
      res.status(404).json({ error: "Alert not found." });
      return;
    }
    if (
      body.data.status === "resolved" &&
      !["district_admin", "centre_manager"].includes(req.appUser!.role)
    ) {
      res.status(403).json({ error: "Only managers can resolve alerts." });
      return;
    }
    const [alert] = await db
      .update(alertsTable)
      .set({ status: body.data.status })
      .where(eq(alertsTable.id, params.data.id))
      .returning();
    await writeAuditLog(
      req.appUser!.id,
      body.data.status,
      "alert",
      alert.id,
    );
    const [centre] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, alert.centreId))
      .limit(1);
    res.json(
      UpdateAlertResponse.parse({
        ...alert,
        centreName: centre?.name ?? "",
        createdAt: alert.createdAt.toISOString(),
      }),
    );
  },
);

router.get("/recommendations", async (req, res): Promise<void> => {
  const query = ListRecommendationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const sourceCentre = alias(centresTable, "source");
  const targetCentre = alias(centresTable, "target");
  const rows = await db
    .select({
      recommendation: recommendationsTable,
      sourceCentreName: sourceCentre.name,
      targetCentreName: targetCentre.name,
    })
    .from(recommendationsTable)
    .innerJoin(
      sourceCentre,
      eq(sourceCentre.id, recommendationsTable.sourceCentreId),
    )
    .innerJoin(
      targetCentre,
      eq(targetCentre.id, recommendationsTable.targetCentreId),
    )
    .where(
      and(
        query.data.status && query.data.status !== "all"
          ? eq(recommendationsTable.status, query.data.status)
          : undefined,
        user.role === "district_admin"
          ? undefined
          : sql`(${recommendationsTable.sourceCentreId} = ${user.centreId ?? "__no_centre_assigned__"} OR ${recommendationsTable.targetCentreId} = ${user.centreId ?? "__no_centre_assigned__"})`,
      ),
    )
    .orderBy(desc(recommendationsTable.createdAt));
  res.json(
    ListRecommendationsResponse.parse({
      items: rows.map(({ recommendation, sourceCentreName, targetCentreName }) => ({
        ...recommendation,
        sourceCentreName,
        targetCentreName,
        createdAt: recommendation.createdAt.toISOString(),
      })),
    }),
  );
});

router.patch(
  "/recommendations/:id",
  async (req, res): Promise<void> => {
    const params = DecideRecommendationParams.safeParse(req.params);
    const body = DecideRecommendationBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!["district_admin", "centre_manager"].includes(req.appUser!.role)) {
      res.status(403).json({
        error: "A manager must approve or reject a redistribution suggestion.",
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(recommendationsTable)
      .where(eq(recommendationsTable.id, params.data.id))
      .limit(1);
    if (
      !existing ||
      !canAccessCentre(req.appUser!, existing.sourceCentreId) ||
      !canAccessCentre(req.appUser!, existing.targetCentreId)
    ) {
      res.status(404).json({ error: "Recommendation not found." });
      return;
    }
    if (existing.status !== "pending") {
      res.status(409).json({
        error: "This recommendation already has a recorded decision.",
      });
      return;
    }
    const [recommendation] = await db
      .update(recommendationsTable)
      .set({ status: body.data.status, note: body.data.note ?? null })
      .where(eq(recommendationsTable.id, params.data.id))
      .returning();
    await writeAuditLog(
      req.appUser!.id,
      body.data.status,
      "resource-recommendation",
      recommendation.id,
      body.data.note ?? "",
    );
    const [source] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, recommendation.sourceCentreId))
      .limit(1);
    const [target] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, recommendation.targetCentreId))
      .limit(1);
    res.json(
      DecideRecommendationResponse.parse({
        ...recommendation,
        sourceCentreName: source?.name ?? "",
        targetCentreName: target?.name ?? "",
        createdAt: recommendation.createdAt.toISOString(),
      }),
    );
  },
);

router.get("/forecasts", async (req, res): Promise<void> => {
  const query = GetDemandForecastsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { centreId, days = 7 } = query.data;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const centreFilter =
    user.role === "district_admin"
      ? undefined
      : eq(
          inventoryTable.centreId,
          user.centreId ?? "__no_centre_assigned__",
        );
  const inventoryFilters = [
    centreFilter,
    centreId ? eq(inventoryTable.centreId, centreId) : undefined,
  ];
  const items = await db
    .select({
      inventory: inventoryTable,
      centreName: centresTable.name,
    })
    .from(inventoryTable)
    .innerJoin(centresTable, eq(inventoryTable.centreId, centresTable.id))
    .where(and(...inventoryFilters))
    .orderBy(centresTable.name, inventoryTable.medicine);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const movementRows = await db
    .select({
      inventoryId: inventoryMovementsTable.inventoryId,
      quantity: inventoryMovementsTable.quantity,
    })
    .from(inventoryMovementsTable)
    .where(
      and(
        eq(inventoryMovementsTable.type, "consumption"),
        gte(
          inventoryMovementsTable.createdAt,
          new Date(since.toISOString().slice(0, 10)),
        ),
        user.role === "district_admin"
          ? undefined
          : eq(
              inventoryMovementsTable.centreId,
              user.centreId ?? "__no_centre_assigned__",
            ),
        centreId
          ? eq(inventoryMovementsTable.centreId, centreId)
          : undefined,
      ),
    );
  const usageByInventory = new Map<string, number>();
  const recordCount = new Map<string, number>();
  for (const movement of movementRows) {
    usageByInventory.set(
      movement.inventoryId,
      (usageByInventory.get(movement.inventoryId) ?? 0) + movement.quantity,
    );
    recordCount.set(
      movement.inventoryId,
      (recordCount.get(movement.inventoryId) ?? 0) + 1,
    );
  }
  const forecasts = items.map(({ inventory, centreName }) => {
    const totalUsage = usageByInventory.get(inventory.id) ?? 0;
    const averageDailyUse = Number((totalUsage / 30).toFixed(1));
    const predictedDemand = Math.round(averageDailyUse * days);
    const daysUntilStockout =
      inventory.quantity === 0
        ? 0
        : averageDailyUse === 0
          ? 999
          : Math.ceil(inventory.quantity / averageDailyUse);
    const recommendedReorder = Math.max(
      0,
      Math.ceil(predictedDemand + inventory.minimumStock - inventory.quantity),
    );
    const records = recordCount.get(inventory.id) ?? 0;
    return {
      id: inventory.id,
      centreId: inventory.centreId,
      centreName,
      medicine: inventory.medicine,
      currentStock: inventory.quantity,
      averageDailyUse,
      predictedDemand,
      daysUntilStockout,
      recommendedReorder,
      confidence: records >= 3 ? "medium" : records > 0 ? "low" : "low",
      horizonDays: days,
      limitation:
        records >= 3
          ? "Simple 30-day average of recorded consumption. Verify demand, reserve levels, supplier lead time, and expiry before acting."
          : "Limited or missing consumption history. This estimate is low confidence and should not be treated as a guaranteed outcome.",
    };
  });
  res.json(
    GetDemandForecastsResponse.parse({
      items: forecasts,
      horizonDays: days,
      methodology:
        "Transparent moving average of recorded consumption over the last 30 days; no autonomous order or transfer is placed.",
    }),
  );
});

router.post("/assistant", async (req, res): Promise<void> => {
  const parsed = AskAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.appUser!;
  const question = parsed.data.question.toLowerCase();
  const isHindi =
    parsed.data.language === "hi" ||
    /केंद्र|दवा|बिस्तर|उपस्थिति|मरीज|चिकित्सक/.test(question);
  const centreFilter =
    user.role === "district_admin"
      ? undefined
      : eq(inventoryTable.centreId, user.centreId ?? "__no_centre_assigned__");
  let answerEn =
    "I can summarize this account's authorized operational data. Ask about medicine stock, bed availability, attendance, patient visits, diagnostics, or pending transfers.";
  let answerHi =
    "मैं इस खाते के अधिकृत संचालन डेटा का सार दे सकता हूँ। दवा भंडार, बिस्तर, उपस्थिति, मरीजों की संख्या, जांच या लंबित स्थानांतरण के बारे में पूछें।";
  const sources: string[] = [];

  if (/bed|beds|availability|बिस्तर|खाली जगह/.test(question)) {
    const rows = await db
      .select({ bed: bedsTable, centreName: centresTable.name })
      .from(bedsTable)
      .innerJoin(centresTable, eq(bedsTable.centreId, centresTable.id))
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                bedsTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
        ),
      );
    const available = rows
      .map(({ bed, centreName }) => ({
        name: centreName,
        type: bed.type,
        available: Math.max(0, bed.total - bed.occupied - bed.outOfService),
      }))
      .filter((row) => row.available > 0)
      .slice(0, 6);
    answerEn = available.length
      ? `Centres with available beds: ${available.map((row) => `${row.name} (${row.available} ${row.type.toLowerCase()})`).join("; ")}.`
      : "No available beds are recorded in the centres you can access.";
    answerHi = available.length
      ? `उपलब्ध बिस्तरों वाले केंद्र: ${available.map((row) => `${row.name} (${row.available} ${row.type} बिस्तर)`).join("; ")}।`
      : "आपके अधिकृत केंद्रों में कोई उपलब्ध बिस्तर दर्ज नहीं है।";
    sources.push("Current facility bed-capacity records");
  } else if (/attendance|doctor|staff|उपस्थिति|चिकित्सक|डॉक्टर/.test(question)) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select({
        staff: staffTable,
        attendance: attendanceTable,
        centreName: centresTable.name,
      })
      .from(staffTable)
      .innerJoin(centresTable, eq(staffTable.centreId, centresTable.id))
      .leftJoin(
        attendanceTable,
        and(
          eq(attendanceTable.staffId, staffTable.id),
          eq(attendanceTable.date, today),
        ),
      )
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                staffTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
          sql`lower(${staffTable.role}) LIKE '%doctor%' OR lower(${staffTable.role}) LIKE '%medical officer%'`,
        ),
      );
    const explicit = rows.filter(({ attendance }) => attendance !== null);
    const present = explicit.filter(
      ({ attendance }) => attendance?.status === "present",
    );
    const missing = rows.filter(({ attendance }) => attendance === null);
    answerEn = `Today's recorded doctor attendance: ${present.length} present from ${explicit.length} explicit attendance records. ${missing.length} scheduled staff have no record yet; that is not evidence of absence.`;
    answerHi = `आज दर्ज चिकित्सक उपस्थिति: ${explicit.length} स्पष्ट उपस्थिति रिकॉर्ड में से ${present.length} उपस्थित हैं। ${missing.length} निर्धारित कर्मचारियों का रिकॉर्ड अभी दर्ज नहीं है; इसे अनुपस्थिति नहीं माना गया है।`;
    sources.push(`Today's attendance records (${today})`, "Staff schedules");
  } else if (/patient|footfall|visit|मरीज|रोगी|मरीज़/.test(question)) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 6);
    const rows = await db
      .select({
        visit: visitAggregatesTable,
        centreName: centresTable.name,
      })
      .from(visitAggregatesTable)
      .innerJoin(
        centresTable,
        eq(visitAggregatesTable.centreId, centresTable.id),
      )
      .where(
        and(
          gte(
            visitAggregatesTable.date,
            since.toISOString().slice(0, 10),
          ),
          user.role === "district_admin"
            ? undefined
            : eq(
                visitAggregatesTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
        ),
      );
    const byCentre = new Map<string, { total: number; name: string }>();
    for (const { visit, centreName } of rows) {
      const current = byCentre.get(visit.centreId) ?? {
        total: 0,
        name: centreName,
      };
      current.total += visit.visits;
      byCentre.set(visit.centreId, current);
    }
    const busiest = [...byCentre.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    answerEn = busiest.length
      ? `Over the last seven recorded days, visits total ${busiest.reduce((sum, row) => sum + row.total, 0).toLocaleString()}. Highest centre totals: ${busiest.map((row) => `${row.name} (${row.total})`).join(", ")}.`
      : "There are no visit aggregates for the last seven days in your accessible centres.";
    answerHi = busiest.length
      ? `पिछले सात दर्ज दिनों में कुल ${busiest.reduce((sum, row) => sum + row.total, 0).toLocaleString()} मरीज आए। सबसे अधिक केंद्र: ${busiest.map((row) => `${row.name} (${row.total})`).join(", ")}।`
      : "आपके अधिकृत केंद्रों में पिछले सात दिनों के मरीजों का कोई समेकित रिकॉर्ड नहीं है।";
    sources.push("Aggregated centre visit records (last seven days)");
  } else if (/diagnostic|test|जांच|परीक्षण/.test(question)) {
    const rows = await db
      .select({ test: testsTable, centreName: centresTable.name })
      .from(testsTable)
      .innerJoin(centresTable, eq(testsTable.centreId, centresTable.id))
      .where(
        and(
          user.role === "district_admin"
            ? undefined
            : eq(
                testsTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
        ),
      );
    const unavailable = rows
      .filter(({ test }) => test.status !== "Available")
      .map(({ test, centreName }) => `${test.name} at ${centreName} (${test.status})`);
    answerEn = unavailable.length
      ? `Services requiring attention: ${unavailable.join("; ")}.`
      : "All recorded diagnostic services are currently marked available at your centres.";
    answerHi = unavailable.length
      ? `ध्यान देने योग्य सेवाएँ: ${unavailable.join("; ")}।`
      : "आपके केंद्रों में सभी दर्ज जांच सेवाएँ अभी उपलब्ध चिह्नित हैं।";
    sources.push("Current diagnostic-service records");
  } else if (/transfer|redistribut|surplus|स्थानांतरण|वितरण/.test(question)) {
    const rows = await db
      .select()
      .from(recommendationsTable)
      .where(
        and(
          eq(recommendationsTable.status, "pending"),
          user.role === "district_admin"
            ? undefined
            : sql`(${recommendationsTable.sourceCentreId} = ${user.centreId ?? "__no_centre_assigned__"} OR ${recommendationsTable.targetCentreId} = ${user.centreId ?? "__no_centre_assigned__"})`,
        ),
      )
      .orderBy(desc(recommendationsTable.createdAt))
      .limit(5);
    answerEn = rows.length
      ? `There are ${rows.length} pending resource suggestions. They are not transfers. Review each reserve level, batch expiry, compatibility, and transport time before an authorized manager decides.`
      : "There are no pending resource suggestions for your accessible centres.";
    answerHi = rows.length
      ? `${rows.length} संसाधन सुझाव लंबित हैं। ये स्थानांतरण नहीं हैं। अधिकृत प्रबंधक निर्णय लेने से पहले न्यूनतम भंडार, बैच समाप्ति, अनुकूलता और परिवहन समय की समीक्षा करें।`
      : "आपके अधिकृत केंद्रों के लिए कोई लंबित संसाधन सुझाव नहीं है।";
    sources.push("Pending resource recommendations");
  } else if (/medicine|stock|shortage|medicine|दवा|भंडार|कमी/.test(question)) {
    const rows = await db
      .select({
        item: inventoryTable,
        centreName: centresTable.name,
      })
      .from(inventoryTable)
      .innerJoin(centresTable, eq(inventoryTable.centreId, centresTable.id))
      .where(
        and(
          centreFilter,
          sql`${inventoryTable.quantity} <= ${inventoryTable.minimumStock}`,
        ),
      )
      .orderBy(inventoryTable.quantity)
      .limit(8);
    answerEn = rows.length
      ? `Low or out-of-stock medicines: ${rows.map(({ item, centreName }) => `${item.medicine} at ${centreName} (${item.quantity} ${item.unit} left, minimum ${item.minimumStock})`).join("; ")}.`
      : "No medicine records are currently at or below their minimum stock levels.";
    answerHi = rows.length
      ? `कम या समाप्त दवाएँ: ${rows.map(({ item, centreName }) => `${item.medicine} — ${centreName} (${item.quantity} ${item.unit} शेष, न्यूनतम ${item.minimumStock})`).join("; ")}।`
      : "अभी किसी दवा का भंडार न्यूनतम स्तर से नीचे नहीं है।";
    sources.push("Current medicine inventory and minimum stock levels");
  }
  const answer = isHindi ? answerHi : answerEn;
  res.json(
    AskAssistantResponse.parse({
      answer,
      language: isHindi ? "hi" : "en",
      sources,
      asOf: new Date().toISOString(),
      uncertainty:
        "Answers summarize the latest available operational records. They may be incomplete if a centre has not entered data; forecasts and transfer suggestions are not guaranteed and require human review.",
    }),
  );
});

router.get("/reports/summary.csv", async (req, res): Promise<void> => {
  const user = req.appUser!;
  const visitStart = new Date();
  visitStart.setUTCDate(visitStart.getUTCDate() - 29);
  const visitStartDate = visitStart.toISOString().slice(0, 10);
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(
          inventoryTable.centreId,
          user.centreId ?? "__no_centre_assigned__",
        ),
  ];
  const [centres, items, beds, staff, alerts, visits] = await Promise.all([
    db
      .select()
      .from(centresTable)
      .where(centreScope(user))
      .orderBy(centresTable.name),
    db.select().from(inventoryTable).where(and(...filters)),
    db.select().from(bedsTable).where(
      user.role === "district_admin"
        ? undefined
        : eq(bedsTable.centreId, user.centreId ?? "__no_centre_assigned__"),
    ),
    db.select().from(staffTable).where(
      user.role === "district_admin"
        ? undefined
        : eq(staffTable.centreId, user.centreId ?? "__no_centre_assigned__"),
    ),
    db.select().from(alertsTable).where(
      user.role === "district_admin"
        ? undefined
        : eq(alertsTable.centreId, user.centreId ?? "__no_centre_assigned__"),
    ),
    db
      .select()
      .from(visitAggregatesTable)
      .where(
        and(
          gte(visitAggregatesTable.date, visitStartDate),
          user.role === "district_admin"
            ? undefined
            : eq(
                visitAggregatesTable.centreId,
                user.centreId ?? "__no_centre_assigned__",
              ),
        ),
      ),
  ]);
  const csvEscape = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  const lines = [
    ["Centre", "Type", "District", "Medicine", "Stock", "Minimum", "Expiry", "Beds available", "Scheduled staff", "Open alerts", "Visits (30 days)"].map(csvEscape).join(","),
    ...centres.flatMap((centre) => {
      const centreInventory = items.filter((item) => item.centreId === centre.id);
      const visitsInPeriod = visits
        .filter((visit) => visit.centreId === centre.id)
        .reduce((sum, visit) => sum + visit.visits, 0);
      const availableBeds = beds
        .filter((bed) => bed.centreId === centre.id)
        .reduce(
          (sum, bed) =>
            sum + Math.max(0, bed.total - bed.occupied - bed.outOfService),
          0,
        );
      const scheduled = staff.filter(
        (member) => member.centreId === centre.id && member.scheduled,
      ).length;
      const openAlerts = alerts.filter(
        (alert) => alert.centreId === centre.id && alert.status === "open",
      ).length;
      return centreInventory.length
        ? centreInventory.map((item) =>
            [
              centre.name,
              centre.type,
              centre.district,
              item.medicine,
              item.quantity,
              item.minimumStock,
              item.expiryDate,
              availableBeds,
              scheduled,
              openAlerts,
              visitsInPeriod,
            ]
              .map(csvEscape)
              .join(","),
          )
        : [
            [
              centre.name,
              centre.type,
              centre.district,
              "No inventory records",
              0,
              0,
              "",
              availableBeds,
              scheduled,
              openAlerts,
              visitsInPeriod,
            ]
              .map(csvEscape)
              .join(","),
          ];
    }),
  ];
  const csv = lines.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="smart-health-summary.csv"',
  );
  res.status(200).send(DownloadSummaryReportResponse.parse(csv));
});

export default router;
