import { and, eq, gte, ilike } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateDiagnosticTestBody,
  CreateDiagnosticTestResponse,
  CreatePatientVisitAggregateBody,
  CreatePatientVisitAggregateResponse,
  CreateStaffBody,
  CreateStaffResponse,
  ListAttendanceQueryParams,
  ListAttendanceResponse,
  ListBedsQueryParams,
  ListBedsResponse,
  ListPatientVisitsQueryParams,
  ListPatientVisitsResponse,
  ListStaffQueryParams,
  ListStaffResponse,
  ListDiagnosticTestsQueryParams,
  ListDiagnosticTestsResponse,
  RecordAttendanceBody,
  RecordAttendanceResponse,
  UpdateBedBody,
  UpdateBedParams,
  UpdateBedResponse,
  UpdateDiagnosticTestBody,
  UpdateDiagnosticTestParams,
  UpdateDiagnosticTestResponse,
} from "@workspace/api-zod";
import {
  attendanceTable,
  bedsTable,
  centresTable,
  db,
  staffTable,
  testsTable,
  visitAggregatesTable,
} from "@workspace/db";
import { dateOnly } from "../lib/health-api";
import { userCanAccessCentre, writeAuditLog } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/patients/visits", async (req, res): Promise<void> => {
  const query = ListPatientVisitsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { centreId, period = "month" } = query.data;
  const user = req.appUser!;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days + 1);
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(
          visitAggregatesTable.centreId,
          user.centreId ?? "__no_centre_assigned__",
        ),
    gte(visitAggregatesTable.date, since.toISOString().slice(0, 10)),
  ];
  if (centreId) filters.push(eq(visitAggregatesTable.centreId, centreId));
  const items = await db
    .select()
    .from(visitAggregatesTable)
    .where(and(...filters))
    .orderBy(visitAggregatesTable.date);
  res.json(
    ListPatientVisitsResponse.parse({
      items,
      totalVisits: items.reduce((sum, item) => sum + item.visits, 0),
    }),
  );
});

router.post(
  "/patients/visits",
  async (req, res): Promise<void> => {
    const parsed = CreatePatientVisitAggregateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!userCanAccessCentre(req.appUser!, parsed.data.centreId)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    const [visit] = await db
      .insert(visitAggregatesTable)
      .values({
        ...parsed.data,
        date: dateOnly(parsed.data.date),
      })
      .returning();
    await writeAuditLog(req.appUser!.id, "recorded", "patient-visits", visit.id);
    res
      .status(201)
      .json(CreatePatientVisitAggregateResponse.parse(visit));
  },
);

router.get("/beds", async (req, res): Promise<void> => {
  const query = ListBedsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { centreId } = query.data;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(bedsTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) filters.push(eq(bedsTable.centreId, centreId));
  const items = await db
    .select({ bed: bedsTable, centreName: centresTable.name })
    .from(bedsTable)
    .innerJoin(centresTable, eq(bedsTable.centreId, centresTable.id))
    .where(and(...filters))
    .orderBy(centresTable.name, bedsTable.type);
  res.json(
    ListBedsResponse.parse({
      items: items.map(({ bed, centreName }) => ({ ...bed, centreName })),
    }),
  );
});

router.patch(
  "/beds/:id",
  async (req, res): Promise<void> => {
    const params = UpdateBedParams.safeParse(req.params);
    const body = UpdateBedBody.safeParse(req.body);
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
      .from(bedsTable)
      .where(eq(bedsTable.id, params.data.id))
      .limit(1);
    if (!existing || !userCanAccessCentre(req.appUser!, existing.centreId)) {
      res.status(404).json({ error: "Bed record not found." });
      return;
    }
    const next = { ...existing, ...body.data };
    if (next.occupied + next.outOfService > next.total) {
      res.status(409).json({
        error: "Occupied and out-of-service beds cannot exceed total capacity.",
      });
      return;
    }
    const [bed] = await db
      .update(bedsTable)
      .set(body.data)
      .where(eq(bedsTable.id, params.data.id))
      .returning();
    await writeAuditLog(req.appUser!.id, "updated", "beds", bed.id);
    const [centre] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, bed.centreId))
      .limit(1);
    res.json(UpdateBedResponse.parse({ ...bed, centreName: centre?.name ?? "" }));
  },
);

router.get("/staff", async (req, res): Promise<void> => {
  const query = ListStaffQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { centreId, search } = query.data;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(staffTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) filters.push(eq(staffTable.centreId, centreId));
  if (search) filters.push(ilike(staffTable.name, `%${search}%`));
  const items = await db
    .select()
    .from(staffTable)
    .where(and(...filters))
    .orderBy(staffTable.name);
  res.json(ListStaffResponse.parse({ items }));
});

router.post(
  "/staff",
  async (req, res): Promise<void> => {
    const parsed = CreateStaffBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!userCanAccessCentre(req.appUser!, parsed.data.centreId)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    if (
      !["district_admin", "centre_manager"].includes(req.appUser!.role)
    ) {
      res.status(403).json({ error: "Only managers can add staff profiles." });
      return;
    }
    const [staff] = await db
      .insert(staffTable)
      .values(parsed.data)
      .returning();
    await writeAuditLog(req.appUser!.id, "created", "staff", staff.id);
    res.status(201).json(CreateStaffResponse.parse(staff));
  },
);

router.get("/attendance", async (req, res): Promise<void> => {
  const query = ListAttendanceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const date = query.data.date
    ? dateOnly(query.data.date)
    : new Date().toISOString().slice(0, 10);
  const centreId = query.data.centreId;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const staffFilters = [
    eq(staffTable.scheduled, true),
    user.role === "district_admin"
      ? undefined
      : eq(staffTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) staffFilters.push(eq(staffTable.centreId, centreId));
  const staff = await db
    .select()
    .from(staffTable)
    .where(and(...staffFilters))
    .orderBy(staffTable.name);
  const records = await db
    .select()
    .from(attendanceTable)
    .where(eq(attendanceTable.date, date));
  const byStaffId = new Map(records.map((record) => [record.staffId, record]));
  const items = staff.map((member) => {
    const record = byStaffId.get(member.id);
    return record
      ? { ...record, staffName: member.name }
      : {
          id: `pending-${member.id}-${date}`,
          staffId: member.id,
          centreId: member.centreId,
          staffName: member.name,
          date,
          status: "scheduled",
          checkIn: null,
          checkOut: null,
        };
  });
  res.json(
    ListAttendanceResponse.parse({
      items,
      present: items.filter((record) => record.status === "present").length,
      scheduled: staff.length,
    }),
  );
});

router.post(
  "/attendance",
  async (req, res): Promise<void> => {
    const parsed = RecordAttendanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [staff] = await db
      .select()
      .from(staffTable)
      .where(eq(staffTable.id, parsed.data.staffId))
      .limit(1);
    if (!staff || !userCanAccessCentre(req.appUser!, staff.centreId)) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }
    if (
      !["district_admin", "centre_manager", "healthcare_staff"].includes(
        req.appUser!.role,
      )
    ) {
      res.status(403).json({ error: "You cannot record staff attendance." });
      return;
    }
    const [existing] = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.staffId, staff.id),
          eq(attendanceTable.date, dateOnly(parsed.data.date)),
        ),
      )
      .limit(1);
    const [record] = existing
      ? await db
          .update(attendanceTable)
          .set({
            status: parsed.data.status,
            checkIn: parsed.data.checkIn
              ? new Date(parsed.data.checkIn)
              : null,
            checkOut: parsed.data.checkOut
              ? new Date(parsed.data.checkOut)
              : null,
          })
          .where(eq(attendanceTable.id, existing.id))
          .returning()
      : await db
          .insert(attendanceTable)
          .values({
            staffId: staff.id,
            centreId: staff.centreId,
            date: dateOnly(parsed.data.date),
            status: parsed.data.status,
            checkIn: parsed.data.checkIn
              ? new Date(parsed.data.checkIn)
              : null,
            checkOut: parsed.data.checkOut
              ? new Date(parsed.data.checkOut)
              : null,
          })
          .returning();
    await writeAuditLog(req.appUser!.id, "recorded", "attendance", record.id);
    res
      .status(201)
      .json(RecordAttendanceResponse.parse({ ...record, staffName: staff.name }));
  },
);

router.get("/tests", async (req, res): Promise<void> => {
  const query = ListDiagnosticTestsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { centreId, status, search } = query.data;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(testsTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) filters.push(eq(testsTable.centreId, centreId));
  if (status) filters.push(eq(testsTable.status, status));
  if (search) filters.push(ilike(testsTable.name, `%${search}%`));
  const rows = await db
    .select({ test: testsTable, centreName: centresTable.name })
    .from(testsTable)
    .innerJoin(centresTable, eq(testsTable.centreId, centresTable.id))
    .where(and(...filters))
    .orderBy(centresTable.name, testsTable.name);
  res.json(
    ListDiagnosticTestsResponse.parse({
      items: rows.map(({ test, centreName }) => ({ ...test, centreName })),
    }),
  );
});

router.post(
  "/tests",
  async (req, res): Promise<void> => {
    const parsed = CreateDiagnosticTestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!userCanAccessCentre(req.appUser!, parsed.data.centreId)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    if (!["district_admin", "centre_manager"].includes(req.appUser!.role)) {
      res.status(403).json({ error: "Only managers can add diagnostic services." });
      return;
    }
    const [test] = await db.insert(testsTable).values(parsed.data).returning();
    await writeAuditLog(req.appUser!.id, "created", "diagnostic-test", test.id);
    const [centre] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, test.centreId))
      .limit(1);
    res.status(201).json(
      CreateDiagnosticTestResponse.parse({
        ...test,
        centreName: centre?.name ?? "",
      }),
    );
  },
);

router.patch(
  "/tests/:id",
  async (req, res): Promise<void> => {
    const params = UpdateDiagnosticTestParams.safeParse(req.params);
    const body = UpdateDiagnosticTestBody.safeParse(req.body);
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
      .from(testsTable)
      .where(eq(testsTable.id, params.data.id))
      .limit(1);
    if (!existing || !userCanAccessCentre(req.appUser!, existing.centreId)) {
      res.status(404).json({ error: "Diagnostic service not found." });
      return;
    }
    if (!["district_admin", "centre_manager"].includes(req.appUser!.role)) {
      res.status(403).json({ error: "Only managers can update diagnostic services." });
      return;
    }
    const [test] = await db
      .update(testsTable)
      .set(body.data)
      .where(eq(testsTable.id, params.data.id))
      .returning();
    await writeAuditLog(req.appUser!.id, "updated", "diagnostic-test", test.id);
    const [centre] = await db
      .select({ name: centresTable.name })
      .from(centresTable)
      .where(eq(centresTable.id, test.centreId))
      .limit(1);
    res.json(
      UpdateDiagnosticTestResponse.parse({
        ...test,
        centreName: centre?.name ?? "",
      }),
    );
  },
);

export default router;
