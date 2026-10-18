import { index, integer, pgTable, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { centresTable } from "./centres";

export const inventoryTable = pgTable(
  "medicine_inventory",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    medicine: text("medicine").notNull(),
    category: text("category").notNull(),
    batch: text("batch").notNull(),
    quantity: integer("quantity").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    unit: text("unit").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    supplier: text("supplier").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("medicine_inventory_centre_idx").on(table.centreId),
    index("medicine_inventory_expiry_idx").on(table.expiryDate),
    index("medicine_inventory_name_idx").on(table.medicine),
  ],
);

export const inventoryMovementsTable = pgTable(
  "inventory_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
    inventoryId: text("inventory_id")
      .notNull()
      .references(() => inventoryTable.id, { onDelete: "cascade" }),
    centreId: text("centre_id")
      .notNull()
      .references(() => centresTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_movements_inventory_idx").on(table.inventoryId),
    index("inventory_movements_centre_date_idx").on(
      table.centreId,
      table.createdAt,
    ),
  ],
);

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;
export const insertInventoryMovementSchema = createInsertSchema(
  inventoryMovementsTable,
).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<
  typeof insertInventoryMovementSchema
>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
