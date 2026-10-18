import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { centresTable } from "./centres";

export const alertsTable = pgTable(
  "operational_alerts",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("operational_alerts_centre_idx").on(table.centreId),
    index("operational_alerts_status_severity_idx").on(
      table.status,
      table.severity,
    ),
  ],
);

export const recommendationsTable = pgTable(
  "resource_recommendations",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    medicine: text("medicine").notNull(),
    quantity: integer("quantity").notNull(),
    sourceCentreId: text("source_centre_id")
      .notNull()
      .references(() => centresTable.id),
    targetCentreId: text("target_centre_id")
      .notNull()
      .references(() => centresTable.id),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    note: text("note"),
    expiryDate: text("expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("resource_recommendations_status_idx").on(table.status),
    index("resource_recommendations_target_idx").on(table.targetCentreId),
  ],
);

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    details: text("details").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("audit_logs_created_at_idx").on(table.createdAt)],
);

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
export const insertRecommendationSchema = createInsertSchema(
  recommendationsTable,
).omit({ id: true, createdAt: true });
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendationsTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;
