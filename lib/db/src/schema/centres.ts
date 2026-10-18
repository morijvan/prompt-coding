import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";

export const centresTable = pgTable(
  "health_centres",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    type: text("type").notNull(),
    district: text("district").notNull(),
    state: text("state").notNull(),
    address: text("address").notNull(),
    status: text("status").notNull().default("Operational"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("health_centres_district_idx").on(table.district),
    index("health_centres_type_idx").on(table.type),
  ],
);

export const insertCentreSchema = createInsertSchema(centresTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCentre = z.infer<typeof insertCentreSchema>;
export type Centre = typeof centresTable.$inferSelect;
