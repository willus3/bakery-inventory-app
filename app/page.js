// Client Component — uses useState, useEffect, and Recharts (all client-side).
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  getIngredients,
  getFinishedGoods,
  getWorkOrders,
  getDemandPlans,
  getSalesRecords,
  getProductionRecords,
  getPurchaseOrders,
} from "@/lib/firestore";

const BAKERY_NAME = "The Bakery";

// ─────────────────────────────────────────────────────────────────────────────
// DATE UTILITIES
// We use local-time methods everywhere — toISOString() gives UTC and can roll
// back a day in negative-offset timezones, breaking "is this today?" checks.
// ─────────────────────────────────────────────────────────────────────────────

// Returns today's date as "YYYY-MM-DD" using local time.
const getTodayStr = () => {
  const d    = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Converts a Firestore Timestamp to "YYYY-MM-DD" in local time.
// Returns null for missing or unresolved timestamps.
const timestampToDateStr = (ts) => {
  if (!ts || typeof ts.toDate !== "function") return null;
  const d    = ts.toDate();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Returns true if a Firestore Timestamp falls on today's date.
const isTimestampToday = (ts) => timestampToDateStr(ts) === getTodayStr();

// Returns a Date set to Monday of the current week at local midnight.
const getWeekStart = () => {
  const d   = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
};

// Converts a Date object to "YYYY-MM-DD" using local time.
const dateToStr = (date) => {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const dd   = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Returns "Good morning / afternoon / evening" based on the current hour.
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// Formats today as "Wednesday, February 26" for the dashboard sub-header.
const formatTodayLabel = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });

// ─────────────────────────────────────────────────────────────────────────────
// STATUS COLORS
// Each card shows a 4 px top accent bar communicating urgency:
//   rose    = needs immediate attention
//   amber   = needs attention soon
//   green   = all good
//   neutral = informational only
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BAR = {
  rose:    "bg-rose-400",
  amber:   "bg-amber-400",
  green:   "bg-emerald-400",
  neutral: "bg-stone-200",
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CARD WRAPPER
// Adds the colored top accent bar and consistent padding around any content.
// ─────────────────────────────────────────────────────────────────────────────

function StatusCard({ status = "neutral", children }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <div className={`h-1 ${STATUS_BAR[status]}`} />
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// Small error notice rendered inside a card when its data fetch failed.
function LoadError({ label }) {
  return (
    <p className="text-xs text-rose-500 italic">
      Couldn&apos;t load {label}. Try refreshing.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDER DONUT CHART
// Shows the breakdown of ALL work orders by status across the full history.
// ─────────────────────────────────────────────────────────────────────────────

const WO_COLORS = {
  planned:    "#f59e0b", // amber
  inProgress: "#3b82f6", // blue
  overdue:    "#f43f5e", // rose
};

// Receives only the active backlog (planned + inProgress + overdue).
function WorkOrderDonut({ workOrders }) {
  const now = new Date();
  const data = [
    { name: "Planned",     value: workOrders.filter(w => w.status === "planned" && !(w.scheduledStart && new Date(w.scheduledStart) < now)).length, fill: WO_COLORS.planned     },
    { name: "In Progress", value: workOrders.filter(w => w.status === "inProgress").length,                                                         fill: WO_COLORS.inProgress  },
    { name: "Overdue",     value: workOrders.filter(w => w.status !== "complete" && w.status !== "cancelled" && w.scheduledStart && new Date(w.scheduledStart) < now && w.status !== "inProgress").length, fill: WO_COLORS.overdue },
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-stone-400">
        No active work orders
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={100}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={28}
          outerRadius={44}
          dataKey="value"
          strokeWidth={2}
          stroke="#fff"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, name) => [v, name]}
          contentStyle={{ fontSize: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES BAR CHART
// Revenue by day for the current Mon–Sun week. Today's bar is amber.
// ─────────────────────────────────────────────────────────────────────────────

function SalesBarChart({ salesByDay }) {
  const hasAnyRevenue = salesByDay.some(d => d.revenue > 0);

  if (!hasAnyRevenue) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-stone-400">
        No sales this week
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={salesByDay} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "#78716c" }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="revenue" radius={[2, 2, 0, 0]}>
          {salesByDay.map((entry, i) => (
            <Cell key={i} fill={entry.isToday ? "#f59e0b" : "#d6d3d1"} />
          ))}
        </Bar>
        <Tooltip
          formatter={(v) => [`$${Number(v).toFixed(2)}`, "Revenue"]}
          contentStyle={{ fontSize: "12px" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY BAR
// A labeled horizontal progress bar showing healthy / total items.
// ─────────────────────────────────────────────────────────────────────────────

function InventoryBar({ label, healthy, total, urgency }) {
  const pct      = total > 0 ? Math.round((healthy / total) * 100) : 100;
  const barColor =
    urgency === "rose"  ? "bg-rose-400"  :
    urgency === "amber" ? "bg-amber-400" :
    "bg-emerald-400";

  return (
    <div>
      <div className="flex justify-between text-xs text-stone-500 mb-1">
        <span>{label}</span>
        <span>{healthy} of {total} healthy</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {

  // ─── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState({
    ingredients:       [],
    finishedGoods:     [],
    workOrders:        [],
    demandPlans:       [],
    salesRecords:      [],
    productionRecords: [],
    purchaseOrders:    [],
  });
  const [loadErrors, setLoadErrors] = useState(new Set());
  const [loading, setLoading]       = useState(true);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  // Promise.allSettled() vs Promise.all():
  //   Promise.all() rejects immediately when ANY promise fails — one bad
  //   Firestore collection takes down the entire dashboard.
  //   Promise.allSettled() waits for every promise and returns each result
  //   individually with a `status` field ("fulfilled" or "rejected"). Each card
  //   can independently show real data or a targeted fallback. One failed
  //   collection never blanks the rest of the page.
  useEffect(() => {
    const fetchAll = async () => {
      const KEYS = [
        "ingredients", "finishedGoods", "workOrders",
        "demandPlans", "salesRecords", "productionRecords", "purchaseOrders",
      ];

      const results = await Promise.allSettled([
        getIngredients(),
        getFinishedGoods(),
        getWorkOrders(),
        getDemandPlans(),
        getSalesRecords(),
        getProductionRecords(),
        getPurchaseOrders(),
      ]);

      const newData = {};
      const errors  = new Set();

      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          newData[KEYS[i]] = res.value;
        } else {
          console.error(`Dashboard: failed to load ${KEYS[i]}:`, res.reason);
          newData[KEYS[i]] = []; // graceful empty fallback
          errors.add(KEYS[i]);
        }
      });

      setData(newData);
      setLoadErrors(errors);
      setLoading(false);
    };

    fetchAll();
  }, []);

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  // ─── Unpack state ──────────────────────────────────────────────────────────
  const {
    ingredients, finishedGoods, workOrders, demandPlans,
    salesRecords, productionRecords, purchaseOrders,
  } = data;

  const todayStr = getTodayStr();
  const now      = new Date();
  const monday   = getWeekStart(); // reused for both sales chart and weekly plan

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Work Orders
  // ─────────────────────────────────────────────────────────────────────────

  // Today's workload = any order with scheduledStart on today's date.
  // Tiles use pure status buckets so Planned + In Progress + Complete = Scheduled Today.
  const todayWOs           = workOrders.filter(wo => wo.scheduledStart && wo.scheduledStart.slice(0, 10) === todayStr && wo.status !== "cancelled");
  const plannedTodayWOs    = todayWOs.filter(wo => wo.status === "planned");
  const inProgressTodayWOs = todayWOs.filter(wo => wo.status === "inProgress");
  const completedTodayWOs  = todayWOs.filter(wo => wo.status === "complete");

  // Overdue = planned/in-progress orders whose scheduledStart has passed (for urgency coloring only).
  const overduePlannedCount    = plannedTodayWOs.filter(wo => new Date(wo.scheduledStart) < now).length;
  const overdueInProgressCount = inProgressTodayWOs.filter(wo => new Date(wo.scheduledStart) < now).length;

  // Active backlog = all non-finished, non-cancelled orders (fed to the donut).
  const activeBacklogWOs = workOrders.filter(
    wo => wo.status !== "complete" && wo.status !== "cancelled"
  );

  // How many of today's scheduled orders are done (for production progress bar).
  const todayWOsCompleteCount = todayWOs.filter(wo => wo.status === "complete").length;

  const woStatus =
    (overduePlannedCount + overdueInProgressCount) > 0               ? "rose"  :
    now.getHours() >= 9 && plannedTodayWOs.length > 0                ? "amber" :
    "green";

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Special Orders
  // ─────────────────────────────────────────────────────────────────────────

  const openOrders = demandPlans.filter(p => p.status === "open");

  // Pickup within the next 24 hours.
  const in24h           = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const within24hOrders = openOrders.filter(p => {
    if (!p.pickupDateTime) return false;
    const pickup = new Date(p.pickupDateTime);
    return pickup >= now && pickup <= in24h;
  });

  // Pickups falling anywhere in the current Mon–Sun week.
  const weekEnd        = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisWeekOrders = openOrders.filter(p => {
    if (!p.pickupDateTime) return false;
    const pickup = new Date(p.pickupDateTime);
    return pickup >= monday && pickup < weekEnd;
  });

  const specialOrderStatus =
    within24hOrders.length > 0 ? "rose"  :
    openOrders.length > 0      ? "amber" :
    "green";

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Inventory
  // ─────────────────────────────────────────────────────────────────────────

  const ingBelowThr  = ingredients.filter(i => i.currentStock < i.lowStockThreshold);
  const fgBelowThr   = finishedGoods.filter(i => i.currentStock < i.lowStockThreshold);
  const ingAtZero    = ingredients.filter(i => i.currentStock === 0);
  const fgAtZero     = finishedGoods.filter(i => i.currentStock === 0);
  const totalAtZero  = ingAtZero.length + fgAtZero.length;
  const totalBelowThr = ingBelowThr.length + fgBelowThr.length;
  const healthyIng   = ingredients.length - ingBelowThr.length;
  const healthyFg    = finishedGoods.length - fgBelowThr.length;

  const inventoryStatus =
    totalAtZero > 0   ? "rose"  :
    totalBelowThr > 0 ? "amber" :
    "green";

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Purchasing
  // ─────────────────────────────────────────────────────────────────────────

  const draftPOs    = purchaseOrders.filter(po => po.status === "draft");
  const awaitingPOs = purchaseOrders.filter(po => po.status === "sent" || po.status === "partial");
  // purchaseOrders is already sorted newest-first by getPurchaseOrders().
  const latestPO    = purchaseOrders[0] ?? null;

  const purchasingStatus = awaitingPOs.length > 0 ? "amber" : "green";

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Production Today
  // ─────────────────────────────────────────────────────────────────────────

  const prodToday          = productionRecords.filter(r => isTimestampToday(r.createdAt));
  const unitsMadeToday     = prodToday.reduce((sum, r) => sum + (r.totalYield || 0), 0);
  const distinctProdsToday = new Set(prodToday.map(r => r.finishedGoodName)).size;

  const productionStatus =
    todayWOs.length === 0                           ? "neutral" :
    todayWOsCompleteCount >= todayWOs.length        ? "green"   :
    "amber";

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Sales
  // ─────────────────────────────────────────────────────────────────────────

  const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build the 7 date strings for Mon–Sun of the current week.
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return dateToStr(d);
  });

  // Revenue per day, used by the bar chart. Today's bar is flagged for amber highlight.
  const salesByDay = weekDates.map((dateStr, i) => ({
    day:     DAY_SHORT[i],
    revenue: salesRecords
      .filter(r => timestampToDateStr(r.createdAt) === dateStr)
      .reduce((sum, r) => sum + (r.totalRevenue || 0), 0),
    isToday: dateStr === todayStr,
  }));

  const todaySales   = salesRecords.filter(r => isTimestampToday(r.createdAt));
  const todayRevenue = todaySales.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
  const weekRevenue  = salesRecords
    .filter(r => weekDates.includes(timestampToDateStr(r.createdAt)))
    .reduce((sum, r) => sum + (r.totalRevenue || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED: Weekly Plan Status
  // ─────────────────────────────────────────────────────────────────────────

  // Per-day color:
  //   green  = all orders complete
  //   amber  = some in progress
  //   rose   = past day with incomplete orders (overdue)
  //   gray   = no orders, or not yet started
  const DAY_BAR_COLOR = {
    green: "bg-emerald-400",
    amber: "bg-amber-400",
    rose:  "bg-rose-400",
    gray:  "bg-stone-200",
  };

  const weeklyPlanDays = weekDates.map((dateStr, i) => {
    const dayWOs   = workOrders.filter(wo => wo.scheduledStart?.slice(0, 10) === dateStr);
    const total    = dayWOs.length;
    const complete = dayWOs.filter(wo => wo.status === "complete").length;
    const inProg   = dayWOs.filter(wo => wo.status === "inProgress").length;
    const pct      = total > 0 ? Math.round((complete / total) * 100) : 0;
    const isPast   = dateStr < todayStr;

    let color;
    if (total === 0)             color = "gray";
    else if (complete === total) color = "green";
    else if (isPast)             color = "rose";  // missed — past day, not done
    else if (inProg > 0)         color = "amber"; // in progress today
    else                         color = "gray";  // planned, not yet started

    return {
      label:       DAY_SHORT[i],
      dateDisplay: dateStr.slice(5).replace("-", "/"), // "02/24"
      total,
      complete,
      pct,
      color,
    };
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-800">{BAKERY_NAME}</h1>
        <p className="text-sm text-stone-500 mt-1">
          {getGreeting()}, here&apos;s your overview for {formatTodayLabel()}
        </p>
        {loadErrors.size > 0 && (
          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
            Some sections couldn&apos;t load — data may be incomplete.
          </p>
        )}
      </div>

      {/* ── Cards grid: 2-column desktop, 1-column mobile ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ══════════════════════════════════════════════════════════════════
            CARD 1 — WORK ORDERS
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status={woStatus}>

          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Work Orders</p>
            <Link href="/work-orders" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
              View all →
            </Link>
          </div>

          {loadErrors.has("workOrders") ? <LoadError label="work order data" /> : (
            <>
              {/* Today — Planned + In Progress + Complete = Scheduled Today */}
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Today</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-md bg-stone-50 px-2 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{todayWOs.length}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Scheduled</p>
                </div>
                <div className={`rounded-md px-2 py-2 text-center ${overduePlannedCount > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${overduePlannedCount > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {plannedTodayWOs.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Planned</p>
                  {overduePlannedCount > 0 && (
                    <p className="text-xs text-rose-500 mt-0.5">{overduePlannedCount} overdue</p>
                  )}
                </div>
                <div className={`rounded-md px-2 py-2 text-center ${overdueInProgressCount > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${overdueInProgressCount > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {inProgressTodayWOs.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">In Progress</p>
                </div>
                <div className="rounded-md bg-stone-50 px-2 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{completedTodayWOs.length}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Complete</p>
                </div>
              </div>

              {/* Active Backlog donut */}
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Active Backlog</p>
              <WorkOrderDonut workOrders={activeBacklogWOs} />

              {/* Legend */}
              {activeBacklogWOs.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {[
                    { label: "Planned",     color: "bg-amber-400" },
                    { label: "In Progress", color: "bg-blue-400"  },
                    { label: "Overdue",     color: "bg-rose-400"  },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
                      <span className="text-xs text-stone-500">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 2 — SPECIAL ORDERS
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status={specialOrderStatus}>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Special Orders</p>
              <p className="text-2xl font-semibold text-stone-800 mt-0.5">{openOrders.length}</p>
              <p className="text-xs text-stone-400">open orders</p>
            </div>
            <Link href="/demand" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
              View all →
            </Link>
          </div>

          {loadErrors.has("demandPlans") ? <LoadError label="special order data" /> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-md px-3 py-2 text-center ${within24hOrders.length > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${within24hOrders.length > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {within24hOrders.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Pickup within 24 h</p>
                </div>
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{thisWeekOrders.length}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Pickups this week</p>
                </div>
              </div>

              {/* Urgent pickup list */}
              {within24hOrders.length > 0 && (
                <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-rose-700">Upcoming pickups</p>
                  {within24hOrders.map(p => (
                    <p key={p.id} className="text-xs text-rose-600">
                      {p.customerName} — {p.finishedGoodName}
                      <span className="ml-1 text-rose-400">
                        ({new Date(p.pickupDateTime).toLocaleTimeString("en-US", {
                          hour: "numeric", minute: "2-digit",
                        })})
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {openOrders.length === 0 && (
                <p className="text-xs text-stone-400">No open special orders.</p>
              )}
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 3 — INVENTORY ALERTS
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status={inventoryStatus}>

          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Inventory Alerts</p>
            <div className="flex gap-3 shrink-0">
              <Link href="/ingredients"    className="text-xs text-amber-700 hover:text-amber-900 font-medium">Ingredients →</Link>
              <Link href="/finished-goods" className="text-xs text-amber-700 hover:text-amber-900 font-medium">Goods →</Link>
            </div>
          </div>

          {(loadErrors.has("ingredients") || loadErrors.has("finishedGoods")) ? (
            <LoadError label="inventory data" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-md px-3 py-2 text-center ${ingBelowThr.length > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${ingBelowThr.length > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {ingBelowThr.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Ingredients low</p>
                </div>
                <div className={`rounded-md px-3 py-2 text-center ${fgBelowThr.length > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${fgBelowThr.length > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {fgBelowThr.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Goods low</p>
                </div>
                <div className={`rounded-md px-3 py-2 text-center ${totalAtZero > 0 ? "bg-rose-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${totalAtZero > 0 ? "text-rose-600" : "text-stone-700"}`}>
                    {totalAtZero}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">At zero</p>
                </div>
              </div>

              {/* Stock health bars */}
              {ingredients.length > 0 && (
                <InventoryBar
                  label="Ingredients"
                  healthy={healthyIng}
                  total={ingredients.length}
                  urgency={ingAtZero.length > 0 ? "rose" : ingBelowThr.length > 0 ? "amber" : "green"}
                />
              )}
              {finishedGoods.length > 0 && (
                <InventoryBar
                  label="Finished Goods"
                  healthy={healthyFg}
                  total={finishedGoods.length}
                  urgency={fgAtZero.length > 0 ? "rose" : fgBelowThr.length > 0 ? "amber" : "green"}
                />
              )}
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 4 — PURCHASING
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status={purchasingStatus}>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Purchasing</p>
              <p className="text-2xl font-semibold text-stone-800 mt-0.5">
                {draftPOs.length + awaitingPOs.length}
              </p>
              <p className="text-xs text-stone-400">POs open</p>
            </div>
            <Link href="/purchasing" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
              View all →
            </Link>
          </div>

          {loadErrors.has("purchaseOrders") ? <LoadError label="purchasing data" /> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{draftPOs.length}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Draft — not sent</p>
                </div>
                <div className={`rounded-md px-3 py-2 text-center ${awaitingPOs.length > 0 ? "bg-amber-50" : "bg-stone-50"}`}>
                  <p className={`text-xl font-semibold ${awaitingPOs.length > 0 ? "text-amber-700" : "text-stone-700"}`}>
                    {awaitingPOs.length}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Awaiting receipt</p>
                </div>
              </div>

              {latestPO ? (
                <p className="text-xs text-stone-400">
                  Most recent PO:{" "}
                  {latestPO.createdAt
                    ? latestPO.createdAt.toDate().toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })
                    : "—"}
                </p>
              ) : (
                <p className="text-xs text-stone-400">No purchase orders yet.</p>
              )}
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 5 — TODAY'S PRODUCTION
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status={productionStatus}>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Today&apos;s Production</p>
              <p className="text-2xl font-semibold text-stone-800 mt-0.5">{unitsMadeToday}</p>
              <p className="text-xs text-stone-400">units produced</p>
            </div>
            <Link href="/work-orders" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
              View orders →
            </Link>
          </div>

          {(loadErrors.has("workOrders") || loadErrors.has("productionRecords")) ? (
            <LoadError label="production data" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{todayWOsCompleteCount}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Orders complete</p>
                </div>
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{distinctProdsToday}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Products made</p>
                </div>
              </div>

              {/* Progress bar — how many of today's orders are done */}
              {todayWOs.length > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-stone-500 mb-1">
                    <span>Today&apos;s orders</span>
                    <span>{todayWOsCompleteCount} / {todayWOs.length} complete</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${productionStatus === "green" ? "bg-emerald-400" : "bg-amber-400"}`}
                      style={{ width: `${Math.round((todayWOsCompleteCount / todayWOs.length) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {todayWOs.length === 0 && prodToday.length === 0 && (
                <p className="text-xs text-stone-400">No production scheduled today.</p>
              )}
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            CARD 6 — SALES SUMMARY
        ══════════════════════════════════════════════════════════════════ */}
        <StatusCard status="neutral">

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Sales</p>
              <p className="text-2xl font-semibold text-stone-800 mt-0.5">
                ${todayRevenue.toFixed(2)}
              </p>
              <p className="text-xs text-stone-400">today&apos;s revenue</p>
            </div>
            <Link href="/sales" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
              View all →
            </Link>
          </div>

          {loadErrors.has("salesRecords") ? <LoadError label="sales data" /> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">{todaySales.length}</p>
                  <p className="text-xs text-stone-400 mt-0.5">Transactions today</p>
                </div>
                <div className="rounded-md bg-stone-50 px-3 py-2 text-center">
                  <p className="text-xl font-semibold text-stone-700">${weekRevenue.toFixed(2)}</p>
                  <p className="text-xs text-stone-400 mt-0.5">This week</p>
                </div>
              </div>

              {/* Bar chart — daily revenue Mon–Sun, today highlighted amber */}
              <SalesBarChart salesByDay={salesByDay} />
            </>
          )}
        </StatusCard>

        {/* ══════════════════════════════════════════════════════════════════
            WEEKLY PLAN STATUS — full-width spanning both columns
        ══════════════════════════════════════════════════════════════════ */}
        <div className="col-span-1 md:col-span-2">
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            <div className="h-1 bg-stone-200" />
            <div className="p-5">

              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Weekly Plan</p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    Work order progress by day — current week
                  </p>
                </div>
                <Link href="/weekly-plan" className="text-xs text-amber-700 hover:text-amber-900 font-medium shrink-0">
                  Edit plan →
                </Link>
              </div>

              {loadErrors.has("workOrders") ? (
                <LoadError label="weekly plan data" />
              ) : (
                <>
                  {/* Horizontally scrollable on narrow screens */}
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-7 gap-3 min-w-[480px]">
                      {weeklyPlanDays.map((day) => (
                        <div key={day.label}>
                          {/* Day label + date */}
                          <div className="text-center mb-2">
                            <p className="text-xs font-semibold text-stone-700">{day.label}</p>
                            <p className="text-xs text-stone-400">{day.dateDisplay}</p>
                          </div>
                          {/* Vertical bar fills from bottom, text overlay in center */}
                          <div className="relative h-20 bg-stone-100 rounded overflow-hidden">
                            <div
                              className={`absolute bottom-0 left-0 right-0 transition-all ${DAY_BAR_COLOR[day.color]}`}
                              style={{ height: `${day.pct}%` }}
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {day.total > 0 ? (
                                <>
                                  <p className="text-sm font-semibold text-stone-700">{day.pct}%</p>
                                  <p className="text-xs text-stone-500">{day.complete}/{day.total}</p>
                                </>
                              ) : (
                                <p className="text-xs text-stone-400">—</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4">
                    {[
                      { color: "bg-emerald-400", label: "All complete" },
                      { color: "bg-amber-400",   label: "In progress"  },
                      { color: "bg-rose-400",     label: "Overdue"      },
                      { color: "bg-stone-200",    label: "Not started"  },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
                        <span className="text-xs text-stone-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
