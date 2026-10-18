import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { centresTable } from "./centres";

export const visitAggregatesTable = pgTable(
  "patient_visit_aggregates",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    date: date("visit_date", { mode: "string" }).notNull(),
    department: text("department").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  (table) => [
    index("patient_visit_aggregates_centre_date_idx").on(
      table.centreId,
      table.date,
    ),
  ],
);

export const bedsTable = pgTable(
  "bed_capacity",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    total: integer("total").notNull().default(0),
    occupied: integer("occupied").notNull().default(0),
    outOfService: integer("out_of_service").notNull().default(0),
  },
  (table) => [index("bed_capacity_centre_idx").on(table.centreId)],
);

export const staffTable = pgTable(
  "staff_members",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    department: text("department").notNull(),
    shift: text("shift").notNull(),
    scheduled: boolean("scheduled").notNull().default(true),
    phone: text("phone"),
  },
  (table) => [index("staff_members_centre_idx").on(table.centreId)],
);

export const attendanceTable = pgTable(
  "attendance_records",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffTable.id, { onDelete: "cascade" }),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    date: date("attendance_date", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    checkIn: timestamp("check_in", { withTimezone: true }),
    checkOut: timestamp("check_out", { withTimezone: true }),
  },
  (table) => [
    index("attendance_records_centre_date_idx").on(
      table.centreId,
      table.date,
    ),
    index("attendance_records_staff_date_idx").on(table.staffId, table.date),
  ],
);

export const testsTable = pgTable(
  "diagnostic_tests",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("Available"),
    capacityPerDay: integer("capacity_per_day").notNull().default(0),
    completedToday: integer("completed_today").notNull().default(0),
    equipment: text("equipment").notNull(),
    consumables: text("consumables").notNull(),
    interruptionNote: text("interruption_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("diagnostic_tests_centre_idx").on(table.centreId),
    index("diagnostic_tests_status_idx").on(table.status),
  ],
);

export const insertVisitAggregateSchema = createInsertSchema(
  visitAggregatesTable,
).omit({ id: true });
export type InsertVisitAggregate = z.infer<typeof insertVisitAggregateSchema>;
export type VisitAggregate = typeof visitAggregatesTable.$inferSelect;
export const insertBedSchema = createInsertSchema(bedsTable).omit({ id: true });
export type InsertBed = z.infer<typeof insertBedSchema>;
export type Bed = typeof bedsTable.$inferSelect;
export const insertStaffSchema = createInsertSchema(staffTable).omit({
  id: true,
});
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffMember = typeof staffTable.$inferSelect;
export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({
  id: true,
});
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceTable.$inferSelect;
export const insertDiagnosticTestSchema = createInsertSchema(testsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertDiagnosticTest = z.infer<typeof insertDiagnosticTestSchema>;
export type DiagnosticTest = typeof testsTable.$inferSelect;
