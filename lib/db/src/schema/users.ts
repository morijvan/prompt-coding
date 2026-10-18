import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appUsersTable = pgTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("healthcare_staff"),
    status: text("status").notNull().default("active"),
    centreId: text("centre_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("app_users_role_idx").on(table.role)],
);

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  createdAt: true,
});
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUserRecord = typeof appUsersTable.$inferSelect;
