import { and, count, desc, eq, ilike, lte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCentreBody,
  CreateCentreResponse,
  CreateInventoryItemBody,
  CreateInventoryItemResponse,
  CreateInventoryMovementBody,
  CreateInventoryMovementParams,
  CreateInventoryMovementResponse,
  DeleteCentreParams,
  DeleteCentreResponse,
  DeleteInventoryItemParams,
  DeleteInventoryItemResponse,
  GetCentreParams,
  GetCentreResponse,
  ListCentresQueryParams,
  ListCentresResponse,
  ListInventoryMovementsQueryParams,
  ListInventoryMovementsResponse,
  ListInventoryQueryParams,
  ListInventoryResponse,
  UpdateCentreBody,
  UpdateCentreParams,
  UpdateCentreResponse,
  UpdateInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemResponse,
} from "@workspace/api-zod";
import {
  alertsTable,
  centresTable,
  db,
  inventoryMovementsTable,
  inventoryTable,
} from "@workspace/db";
import {
  canAccessCentre,
  centreScope,
  dateOnly,
  toCentreDto,
} from "../lib/health-api";
import {
  requireRoles,
  userCanAccessCentre,
  writeAuditLog,
} from "../middlewares/auth";

const router: IRouter = Router();

router.get("/centres", async (req, res): Promise<void> => {
  const query = ListCentresQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { search, type, status, page = 1, pageSize = 20 } = query.data;
  const filters = [centreScope(user)];
  if (type) filters.push(eq(centresTable.type, type));
  if (status) filters.push(eq(centresTable.status, status));
  if (search) {
    filters.push(ilike(centresTable.name, `%${search}%`));
  }
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(centresTable)
      .where(where)
      .orderBy(centresTable.name)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(centresTable).where(where),
  ]);
  res.json(
    ListCentresResponse.parse({
      items: rows.map(toCentreDto),
      total: Number(total),
      page,
      pageSize,
    }),
  );
});

router.post(
  "/centres",
  requireRoles("district_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateCentreBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [centre] = await db
      .insert(centresTable)
      .values(parsed.data)
      .returning();
    await writeAuditLog(req.appUser!.id, "created", "centre", centre.id);
    res.status(201).json(CreateCentreResponse.parse(toCentreDto(centre)));
  },
);

router.get("/centres/:id", async (req, res): Promise<void> => {
  const parsed = GetCentreParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [centre] = await db
    .select()
    .from(centresTable)
    .where(eq(centresTable.id, parsed.data.id))
    .limit(1);
  if (!centre || !canAccessCentre(req.appUser!, centre.id)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  res.json(GetCentreResponse.parse(toCentreDto(centre)));
});

router.patch(
  "/centres/:id",
  requireRoles("district_admin", "centre_manager"),
  async (req, res): Promise<void> => {
    const params = UpdateCentreParams.safeParse(req.params);
    const body = UpdateCentreBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!canAccessCentre(req.appUser!, params.data.id)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    const [centre] = await db
      .update(centresTable)
      .set(body.data)
      .where(eq(centresTable.id, params.data.id))
      .returning();
    if (!centre) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    await writeAuditLog(req.appUser!.id, "updated", "centre", centre.id);
    res.json(UpdateCentreResponse.parse(toCentreDto(centre)));
  },
);

router.delete(
  "/centres/:id",
  requireRoles("district_admin"),
  async (req, res): Promise<void> => {
    const params = DeleteCentreParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [centre] = await db
      .delete(centresTable)
      .where(eq(centresTable.id, params.data.id))
      .returning();
    if (!centre) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    await writeAuditLog(req.appUser!.id, "deleted", "centre", centre.id);
    res.status(204).end();
    DeleteCentreResponse.parse(undefined);
  },
);

function inventoryStatus(item: {
  quantity: number;
  minimumStock: number;
  expiryDate: string;
}): "critical" | "low" | "expiring" | "healthy" {
  if (item.quantity === 0) return "critical";
  if (item.quantity <= item.minimumStock) return "low";
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + 45);
  if (item.expiryDate <= cutoff.toISOString().slice(0, 10)) return "expiring";
  return "healthy";
}

function inventoryDateFilters() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + 45);
  return cutoff.toISOString().slice(0, 10);
}

router.get("/inventory", async (req, res): Promise<void> => {
  const query = ListInventoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { search, centreId, status, page = 1, pageSize = 20 } = query.data;
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(inventoryTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) {
    if (!userCanAccessCentre(user, centreId)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    filters.push(eq(inventoryTable.centreId, centreId));
  }
  if (search) filters.push(ilike(inventoryTable.medicine, `%${search}%`));
  if (status === "low")
    filters.push(lte(inventoryTable.quantity, inventoryTable.minimumStock));
  if (status === "healthy")
    filters.push(sql`${inventoryTable.quantity} > ${inventoryTable.minimumStock}`);
  if (status === "expiring")
    filters.push(lte(inventoryTable.expiryDate, inventoryDateFilters()));
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(inventoryTable)
      .where(where)
      .orderBy(inventoryTable.medicine)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(inventoryTable).where(where),
  ]);
  const items = rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }));
  res.json(
    ListInventoryResponse.parse({ items, total: Number(total), page, pageSize }),
  );
});

router.post(
  "/inventory",
  requireRoles("district_admin", "centre_manager", "inventory_manager"),
  async (req, res): Promise<void> => {
    const parsed = CreateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!userCanAccessCentre(req.appUser!, parsed.data.centreId)) {
      res.status(404).json({ error: "Centre not found." });
      return;
    }
    const [item] = await db
      .insert(inventoryTable)
      .values({
        ...parsed.data,
        expiryDate: dateOnly(parsed.data.expiryDate),
      })
      .returning();
    await writeAuditLog(req.appUser!.id, "created", "inventory", item.id);
    res.status(201).json(
      CreateInventoryItemResponse.parse({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }),
    );
  },
);

router.patch(
  "/inventory/:id",
  requireRoles("district_admin", "centre_manager", "inventory_manager"),
  async (req, res): Promise<void> => {
    const params = UpdateInventoryItemParams.safeParse(req.params);
    const body = UpdateInventoryItemBody.safeParse(req.body);
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
      .from(inventoryTable)
      .where(eq(inventoryTable.id, params.data.id))
      .limit(1);
    if (!existing || !userCanAccessCentre(req.appUser!, existing.centreId)) {
      res.status(404).json({ error: "Medicine record not found." });
      return;
    }
    const { expiryDate, ...updates } = body.data;
    const [item] = await db
      .update(inventoryTable)
      .set({
        ...updates,
        ...(expiryDate !== undefined
          ? { expiryDate: dateOnly(expiryDate) }
          : {}),
      })
      .where(eq(inventoryTable.id, params.data.id))
      .returning();
    await writeAuditLog(req.appUser!.id, "updated", "inventory", item.id);
    res.json(
      UpdateInventoryItemResponse.parse({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }),
    );
  },
);

router.delete(
  "/inventory/:id",
  requireRoles("district_admin", "centre_manager", "inventory_manager"),
  async (req, res): Promise<void> => {
    const params = DeleteInventoryItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.id, params.data.id))
      .limit(1);
    if (!existing || !userCanAccessCentre(req.appUser!, existing.centreId)) {
      res.status(404).json({ error: "Medicine record not found." });
      return;
    }
    await db
      .delete(inventoryTable)
      .where(eq(inventoryTable.id, params.data.id));
    await writeAuditLog(req.appUser!.id, "deleted", "inventory", existing.id);
    res.status(204).end();
    DeleteInventoryItemResponse.parse(undefined);
  },
);

router.get("/inventory/movements", async (req, res): Promise<void> => {
  const query = ListInventoryMovementsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = req.appUser!;
  const { centreId, page = 1, pageSize = 20 } = query.data;
  if (centreId && !userCanAccessCentre(user, centreId)) {
    res.status(404).json({ error: "Centre not found." });
    return;
  }
  const filters = [
    user.role === "district_admin"
      ? undefined
      : eq(inventoryMovementsTable.centreId, user.centreId ?? "__no_centre_assigned__"),
  ];
  if (centreId) filters.push(eq(inventoryMovementsTable.centreId, centreId));
  const where = and(...filters);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        movement: inventoryMovementsTable,
        medicine: inventoryTable.medicine,
        centreName: centresTable.name,
      })
      .from(inventoryMovementsTable)
      .innerJoin(
        inventoryTable,
        eq(inventoryMovementsTable.inventoryId, inventoryTable.id),
      )
      .innerJoin(
        centresTable,
        eq(inventoryMovementsTable.centreId, centresTable.id),
      )
      .where(where)
      .orderBy(desc(inventoryMovementsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(inventoryMovementsTable)
      .where(where),
  ]);
  const items = rows.map(({ movement, medicine, centreName }) => ({
    ...movement,
    createdAt: movement.createdAt.toISOString(),
    medicine,
    centreName,
  }));
  res.json(
    ListInventoryMovementsResponse.parse({
      items,
      total: Number(total),
      page,
      pageSize,
    }),
  );
});

router.post(
  "/inventory/:id/movements",
  requireRoles("district_admin", "centre_manager", "inventory_manager"),
  async (req, res): Promise<void> => {
    const params = CreateInventoryMovementParams.safeParse(req.params);
    const body = CreateInventoryMovementBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(inventoryTable)
        .where(eq(inventoryTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!item || !userCanAccessCentre(req.appUser!, item.centreId)) {
        return {
          error: "Medicine record not found.",
          statusCode: 404 as const,
        };
      }
      const delta =
        body.data.type === "consumption" ? -body.data.quantity : body.data.quantity;
      const nextQuantity = item.quantity + delta;
      if (nextQuantity < 0) {
        return {
          error: "The recorded consumption exceeds current stock.",
          statusCode: 409 as const,
        };
      }
      const [updated] = await tx
        .update(inventoryTable)
        .set({ quantity: nextQuantity })
        .where(eq(inventoryTable.id, item.id))
        .returning();
      const [movement] = await tx
        .insert(inventoryMovementsTable)
        .values({
          inventoryId: item.id,
          centreId: item.centreId,
          type: body.data.type,
          quantity: body.data.quantity,
          note: body.data.note,
        })
        .returning();
      return { item: updated, movement };
    });
    if ("error" in result) {
      res.status(result.statusCode ?? 500).json({ error: result.error });
      return;
    }
    await writeAuditLog(
      req.appUser!.id,
      body.data.type,
      "inventory",
      result.item.id,
      `${body.data.quantity} ${result.item.unit}: ${body.data.note}`,
    );
    if (result.item.quantity <= result.item.minimumStock) {
      const title =
        result.item.quantity === 0
          ? `${result.item.medicine} stock-out`
          : `${result.item.medicine} below minimum stock`;
      const [existingAlert] = await db
        .select()
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.centreId, result.item.centreId),
            eq(alertsTable.title, title),
            eq(alertsTable.status, "open"),
          ),
        )
        .limit(1);
      if (!existingAlert) {
        await db.insert(alertsTable).values({
          centreId: result.item.centreId,
          title,
          detail: `Current stock is ${result.item.quantity} ${result.item.unit}; minimum level is ${result.item.minimumStock}.`,
          severity: result.item.quantity === 0 ? "critical" : "warning",
          status: "open",
        });
      }
    }
    res.status(201).json(
      CreateInventoryMovementResponse.parse({
        ...result.movement,
        createdAt: result.movement.createdAt.toISOString(),
        medicine: result.item.medicine,
      }),
    );
  },
);

export default router;
