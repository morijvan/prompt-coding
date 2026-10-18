import { count } from "drizzle-orm";
import {
  alertsTable,
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

const centreSeed = [
  {
    id: "centre-rajpipla",
    name: "Rajpipla Community Health Centre",
    code: "CHC-NRM-001",
    type: "CHC",
    district: "Narmada",
    state: "Gujarat",
    address: "Station Road, Rajpipla",
    status: "Operational",
    latitude: 21.8667,
    longitude: 73.5,
    phone: "+91 2640 220 110",
  },
  {
    id: "centre-dediapada",
    name: "Dediapada Primary Health Centre",
    code: "PHC-NRM-014",
    type: "PHC",
    district: "Narmada",
    state: "Gujarat",
    address: "Community Road, Dediapada",
    status: "Needs attention",
    latitude: 21.65,
    longitude: 73.6,
    phone: "+91 2649 240 020",
  },
  {
    id: "centre-sagbara",
    name: "Sagbara Primary Health Centre",
    code: "PHC-NRM-021",
    type: "PHC",
    district: "Narmada",
    state: "Gujarat",
    address: "Market Road, Sagbara",
    status: "Needs attention",
    latitude: 21.55,
    longitude: 73.78,
    phone: "+91 2649 241 030",
  },
  {
    id: "centre-nandod",
    name: "Nandod Primary Health Centre",
    code: "PHC-NRM-009",
    type: "PHC",
    district: "Narmada",
    state: "Gujarat",
    address: "Old Highway, Nandod",
    status: "Operational",
    latitude: 21.89,
    longitude: 73.5,
    phone: "+91 2640 220 045",
  },
];

const medicines = [
  {
    key: "paracetamol",
    medicine: "Paracetamol 500mg",
    category: "Analgesic",
    unit: "tablets",
    supplier: "Gujarat Medical Services",
    minimumStock: 80,
    stock: [520, 38, 64, 310],
    dailyUse: [18, 12, 11, 13],
    expiry: 180,
  },
  {
    key: "amoxicillin",
    medicine: "Amoxicillin 250mg",
    category: "Antibiotic",
    unit: "capsules",
    supplier: "State Health Supply",
    minimumStock: 40,
    stock: [190, 15, 0, 155],
    dailyUse: [7, 6, 5, 6],
    expiry: 120,
  },
  {
    key: "ors",
    medicine: "ORS sachets",
    category: "Essential",
    unit: "sachets",
    supplier: "Gujarat Medical Services",
    minimumStock: 45,
    stock: [450, 92, 36, 260],
    dailyUse: [14, 8, 7, 9],
    expiry: 300,
  },
];

const staffSeed = [
  ["Dr. Meera Patel", "Medical Officer", "General Medicine", "Morning"],
  ["Anil Vasava", "Staff Nurse", "Emergency", "Morning"],
  ["Kavita Parmar", "Pharmacist", "Pharmacy", "Day"],
  ["Nirav Shah", "Lab Technician", "Diagnostics", "Morning"],
];

function dayString(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function dateAt(daysAgo: number, hour = 11): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, 10, 0, 0);
  return date;
}

export async function seedDemoData(): Promise<void> {
  const [existing] = await db.select({ total: count() }).from(centresTable);
  if (Number(existing?.total ?? 0) > 0) return;

  await db.insert(centresTable).values(centreSeed);

  const inventoryRecords = centreSeed.flatMap((centre, centreIndex) =>
    medicines.map((medicine, medicineIndex) => ({
      id: `${centre.id}-${medicine.key}`,
      centreId: centre.id,
      medicine: medicine.medicine,
      category: medicine.category,
      batch: `GJ${centreIndex + 24}${medicineIndex + 1}0${centreIndex + 1}`,
      quantity: medicine.stock[centreIndex] ?? 0,
      minimumStock: medicine.minimumStock,
      unit: medicine.unit,
      expiryDate: dayString(-medicine.expiry),
      supplier: medicine.supplier,
    })),
  );
  await db.insert(inventoryTable).values(inventoryRecords);

  const movements = inventoryRecords.flatMap((inventory, inventoryIndex) => {
    const medicine = medicines[inventoryIndex % medicines.length]!;
    const centreIndex = Math.floor(inventoryIndex / medicines.length);
    return [3, 10, 19].map((daysAgo, moveIndex) => ({
      id: `movement-${inventory.id}-${moveIndex}`,
      inventoryId: inventory.id,
      centreId: inventory.centreId,
      type: moveIndex === 2 ? "receipt" : "consumption",
      quantity:
        moveIndex === 2
          ? medicine.dailyUse[centreIndex]! * 10
          : medicine.dailyUse[centreIndex]! * (moveIndex === 0 ? 2 : 3),
      note:
        moveIndex === 2
          ? "Routine replenishment"
          : "Recorded daily medicine use",
      createdAt: dateAt(daysAgo),
    }));
  });
  await db.insert(inventoryMovementsTable).values(movements);

  const visitRows = centreSeed.flatMap((centre, centreIndex) =>
    Array.from({ length: 14 }, (_, offset) => {
      const daysAgo = 13 - offset;
      const baseline = [118, 55, 49, 72][centreIndex]!;
      return {
        id: `visit-${centre.id}-${dayString(daysAgo)}`,
        centreId: centre.id,
        date: dayString(daysAgo),
        department: "Outpatient",
        visits: baseline + ((offset * 13 + centreIndex * 7) % 31) - 12,
      };
    }),
  );
  await db.insert(visitAggregatesTable).values(visitRows);

  await db.insert(bedsTable).values(
    centreSeed.flatMap((centre, index) => [
      {
        id: `beds-${centre.id}-general`,
        centreId: centre.id,
        type: "General",
        total: index === 0 ? 40 : 12,
        occupied: [31, 8, 10, 5][index]!,
        outOfService: index === 2 ? 1 : 0,
      },
      {
        id: `beds-${centre.id}-maternity`,
        centreId: centre.id,
        type: "Maternity",
        total: index === 0 ? 10 : 4,
        occupied: [6, 2, 3, 1][index]!,
        outOfService: 0,
      },
      {
        id: `beds-${centre.id}-observation`,
        centreId: centre.id,
        type: "Observation",
        total: index === 0 ? 8 : 3,
        occupied: [3, 1, 2, 1][index]!,
        outOfService: 0,
      },
    ]),
  );

  const staffRows = centreSeed.flatMap((centre, centreIndex) =>
    staffSeed.map(([name, role, department, shift], staffIndex) => ({
      id: `staff-${centre.id}-${staffIndex + 1}`,
      centreId: centre.id,
      name,
      role,
      department,
      shift,
      scheduled: true,
      phone: null,
    })),
  );
  await db.insert(staffTable).values(staffRows);

  const todayAttendance = staffRows.flatMap((staff, index) => {
    if (index % 4 === 3 || index % 7 === 6) return [];
    const status = index % 9 === 2 ? "leave" : index % 8 === 4 ? "absent" : "present";
    return [
      {
        id: `attendance-${staff.id}-${dayString(0)}`,
        staffId: staff.id,
        centreId: staff.centreId,
        date: dayString(0),
        status,
        checkIn: status === "present" ? dateAt(0, 8 + (index % 2)) : null,
        checkOut: status === "present" ? dateAt(0, 15 + (index % 3)) : null,
      },
    ];
  });
  await db.insert(attendanceTable).values(todayAttendance);

  const testSeed = centreSeed.flatMap((centre, index) => [
    {
      id: `test-${centre.id}-blood`,
      centreId: centre.id,
      name: "Complete blood count",
      category: "Laboratory",
      status: index === 2 ? "Limited" : "Available",
      capacityPerDay: index === 0 ? 60 : 20,
      completedToday: 9 + index * 3,
      equipment: "Hematology analyzer",
      consumables: "CBC reagent, EDTA tubes",
      interruptionNote: index === 2 ? "Reagent supply low" : null,
    },
    {
      id: `test-${centre.id}-malaria`,
      centreId: centre.id,
      name: "Malaria rapid diagnostic test",
      category: "Point of care",
      status: index === 1 ? "Unavailable" : "Available",
      capacityPerDay: index === 0 ? 45 : 15,
      completedToday: 4 + index,
      equipment: "Rapid test kit",
      consumables: "Malaria RDT kits",
      interruptionNote: index === 1 ? "Awaiting kit replenishment" : null,
    },
  ]);
  await db.insert(testsTable).values(testSeed);

  const alertSeed = [
    {
      id: "alert-sagbara-amoxicillin",
      centreId: "centre-sagbara",
      title: "Amoxicillin stock-out",
      detail: "Current batch is depleted. Replenishment should be reviewed.",
      severity: "critical",
      status: "open",
    },
    {
      id: "alert-dediapada-paracetamol",
      centreId: "centre-dediapada",
      title: "Paracetamol below minimum",
      detail: "38 tablets remain against a minimum stock level of 80.",
      severity: "warning",
      status: "open",
    },
    {
      id: "alert-sagbara-tests",
      centreId: "centre-sagbara",
      title: "CBC reagent supply limited",
      detail: "Diagnostic capacity may be reduced until the reagent is replenished.",
      severity: "warning",
      status: "acknowledged",
    },
    {
      id: "alert-dediapada-attendance",
      centreId: "centre-dediapada",
      title: "Attendance record pending",
      detail: "Some scheduled staff have no attendance record yet; this is not an absence determination.",
      severity: "info",
      status: "open",
    },
    {
      id: "alert-nandod-capacity",
      centreId: "centre-nandod",
      title: "High patient volume",
      detail: "Visit totals are above the recent two-week average.",
      severity: "info",
      status: "open",
    },
  ];
  await db.insert(alertsTable).values(alertSeed);

  await db.insert(recommendationsTable).values([
    {
      id: "recommendation-amoxicillin-sagbara",
      medicine: "Amoxicillin 250mg",
      quantity: 50,
      sourceCentreId: "centre-rajpipla",
      targetCentreId: "centre-sagbara",
      reason:
        "Rajpipla retains stock above its minimum reserve; Sagbara has none and historical consumption indicates a near-term gap.",
      status: "pending",
      expiryDate: dayString(-120),
    },
    {
      id: "recommendation-paracetamol-dediapada",
      medicine: "Paracetamol 500mg",
      quantity: 40,
      sourceCentreId: "centre-nandod",
      targetCentreId: "centre-dediapada",
      reason:
        "Nandod has surplus above reserve and Dediapada is below its minimum level.",
      status: "pending",
      expiryDate: dayString(-180),
    },
    {
      id: "recommendation-ors-sagbara",
      medicine: "ORS sachets",
      quantity: 20,
      sourceCentreId: "centre-nandod",
      targetCentreId: "centre-sagbara",
      reason:
        "Potential redistribution could maintain reserve levels at both centres; confirm transport and expiry before approval.",
      status: "pending",
      expiryDate: dayString(-300),
    },
  ]);
}
