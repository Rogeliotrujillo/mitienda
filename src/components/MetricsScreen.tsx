import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import {
  Movement,
  Product,
  formatBalboas,
  formatQuantity,
  getStockStatus,
} from "../types";
import { isSameDay, isWithinLastDays } from "../utils/reports";

interface MetricsScreenProps {
  products: Product[];
  movements: Movement[];
}

type ChartMetric = "sales" | "entries";
type HistoryFilter = "all" | "sale" | "entry";

interface DailyPoint {
  key: string;
  shortLabel: string;
  fullLabel: string;
  salesBalboas: number;
  salesCount: number;
  entriesQty: number;
  entriesCount: number;
}

function formatDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortWeekday(date: Date, isToday: boolean): string {
  if (isToday) return "Hoy";
  const raw = date.toLocaleDateString("es-PA", { weekday: "short" });
  const clean = raw.replace(".", "").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1, 3);
}

function formatMovementTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const timeText = date.toLocaleTimeString("es-PA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isSameDay(date, now)) {
    return `Hoy · ${timeText}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Ayer · ${timeText}`;
  }
  const dayText = date.toLocaleDateString("es-PA", {
    day: "numeric",
    month: "short",
  });
  return `${dayText} · ${timeText}`;
}

export function MetricsScreen({ products, movements }: MetricsScreenProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("sales");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(6);

  const now = new Date();

  const redCount = products.filter((p) => getStockStatus(p) === "red").length;
  const yellowCount = products.filter(
    (p) => getStockStatus(p) === "yellow"
  ).length;
  const greenCount = products.filter(
    (p) => getStockStatus(p) === "green"
  ).length;

  const inventoryValue = products.reduce(
    (sum, p) => sum + Math.max(0, p.quantity) * Math.max(0, p.pricePerUnit),
    0
  );

  const sales = useMemo(
    () => movements.filter((m) => m.type === "sale"),
    [movements]
  );

  const salesToday = sales.filter((m) => isSameDay(new Date(m.timestamp), now));
  const soldToday = salesToday.reduce((sum, m) => sum + m.amountBalboas, 0);
  const soldThisWeek = sales
    .filter((m) => isWithinLastDays(new Date(m.timestamp), 7, now))
    .reduce((sum, m) => sum + m.amountBalboas, 0);

  const dailySeries = useMemo<DailyPoint[]>(() => {
    const points: DailyPoint[] = [];
    const map = new Map<string, DailyPoint>();

    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      const key = formatDayKey(d);
      const point: DailyPoint = {
        key,
        shortLabel: formatShortWeekday(d, offset === 0),
        fullLabel:
          offset === 0
            ? "Hoy"
            : d.toLocaleDateString("es-PA", {
                weekday: "long",
                day: "numeric",
                month: "short",
              }),
        salesBalboas: 0,
        salesCount: 0,
        entriesQty: 0,
        entriesCount: 0,
      };
      points.push(point);
      map.set(key, point);
    }

    for (const m of movements) {
      const d = new Date(m.timestamp);
      if (Number.isNaN(d.getTime())) continue;
      const point = map.get(formatDayKey(d));
      if (!point) continue;
      if (m.type === "sale") {
        point.salesBalboas += m.amountBalboas;
        point.salesCount += 1;
      } else {
        point.entriesQty += m.quantity;
        point.entriesCount += 1;
      }
    }

    return points;
  }, [movements, now]);

  const maxChartValue = useMemo(() => {
    const vals = dailySeries.map((d) =>
      chartMetric === "sales" ? d.salesBalboas : d.entriesQty
    );
    return Math.max(1, ...vals);
  }, [dailySeries, chartMetric]);

  const activeDay = dailySeries[selectedDayIndex] ?? dailySeries[6];

  const sortedHistory = useMemo(() => {
    const list =
      historyFilter === "all"
        ? movements
        : movements.filter((m) => m.type === historyFilter);
    return [...list].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [movements, historyFilter]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      {/* 1. Resumen principal claro y directo */}
      <section aria-label="Resumen de ventas e inventario">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#0F172A] p-4 text-white shadow-sm sm:p-5">
            <p className="text-sm font-medium text-[#CBD5E1]">Vendido hoy</p>
            <p className="font-display mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">
              {formatBalboas(soldToday)}
            </p>
            <p className="mt-2 text-xs text-[#CBD5E1] tabular-nums sm:text-sm">
              {salesToday.length}{" "}
              {salesToday.length === 1 ? "venta hoy" : "ventas hoy"}
            </p>
          </div>

          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
            <p className="text-sm font-medium text-[#64748B]">
              Vendido esta semana
            </p>
            <p className="font-display mt-1 text-3xl font-extrabold text-[#0F172A] tabular-nums sm:text-4xl">
              {formatBalboas(soldThisWeek)}
            </p>
            <p className="mt-2 text-xs font-medium text-[#64748B] tabular-nums sm:text-sm">
              Valor total en stock: {formatBalboas(inventoryValue)}
            </p>
          </div>
        </div>

        {/* Estado del stock en una sola fila limpia */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-[#E2E8F0] rounded-2xl border border-[#CBD5E1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col items-center justify-center px-2 py-3 text-center sm:flex-row sm:justify-between sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#DC2626]"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-[#B91C1C] sm:text-sm">
                Agotado
              </span>
            </div>
            <span className="font-display mt-0.5 text-xl font-extrabold text-[#0F172A] tabular-nums sm:mt-0 sm:text-2xl">
              {redCount}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-2 py-3 text-center sm:flex-row sm:justify-between sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D97706]"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-[#B45309] sm:text-sm">
                Queda poco
              </span>
            </div>
            <span className="font-display mt-0.5 text-xl font-extrabold text-[#0F172A] tabular-nums sm:mt-0 sm:text-2xl">
              {yellowCount}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-2 py-3 text-center sm:flex-row sm:justify-between sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#16A34A]"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-[#15803D] sm:text-sm">
                Suficiente
              </span>
            </div>
            <span className="font-display mt-0.5 text-xl font-extrabold text-[#0F172A] tabular-nums sm:mt-0 sm:text-2xl">
              {greenCount}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Gráfica en tiempo real + Historial actual de ventas y entradas */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <section
          aria-label="Gráfica de los últimos 7 días"
          className="rounded-2xl border border-[#CBD5E1] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5 lg:col-span-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F172A]">
                Últimos 7 días
              </h2>
              <p className="text-xs font-medium capitalize text-[#64748B] tabular-nums">
                {activeDay.fullLabel}:{" "}
                <span className="font-bold text-[#0F172A]">
                  {chartMetric === "sales"
                    ? formatBalboas(activeDay.salesBalboas)
                    : `+${formatQuantity(activeDay.entriesQty)} uds`}
                </span>
              </p>
            </div>

            <div
              className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1"
              role="tablist"
              aria-label="Métrica de gráfica"
            >
              <button
                type="button"
                role="tab"
                aria-selected={chartMetric === "sales"}
                onClick={() => setChartMetric("sales")}
                className={`min-h-[34px] rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartMetric === "sales"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Ventas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartMetric === "entries"}
                onClick={() => setChartMetric("entries")}
                className={`min-h-[34px] rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartMetric === "entries"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Entradas
              </button>
            </div>
          </div>

          <div className="mt-4 grid h-44 grid-cols-7 items-end gap-1 pt-2 sm:gap-2">
            {dailySeries.map((day, idx) => {
              const rawVal =
                chartMetric === "sales" ? day.salesBalboas : day.entriesQty;
              const ratio =
                rawVal > 0 ? Math.max(0.08, rawVal / maxChartValue) : 0.03;
              const isSelected = idx === selectedDayIndex;
              const isToday = idx === 6;

              const barColor =
                chartMetric === "sales"
                  ? isSelected || isToday
                    ? "bg-[#1D4ED8]"
                    : "bg-[#93C5FD]"
                  : isSelected || isToday
                    ? "bg-[#16A34A]"
                    : "bg-[#86EFAC]";

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDayIndex(idx)}
                  aria-label={`${day.fullLabel}: ${
                    chartMetric === "sales"
                      ? formatBalboas(day.salesBalboas)
                      : `${formatQuantity(day.entriesQty)} entradas`
                  }`}
                  className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5 focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
                >
                  <span className="max-w-full truncate text-[10px] font-semibold text-[#475569] tabular-nums sm:text-[11px]">
                    {rawVal > 0
                      ? chartMetric === "sales"
                        ? rawVal.toFixed(0)
                        : formatQuantity(rawVal)
                      : "0"}
                  </span>
                  <div className="flex h-28 w-full items-end justify-center rounded-t-md bg-[#F8FAFC] px-0.5 sm:px-1">
                    <motion.div
                      initial={false}
                      animate={{ scaleY: ratio }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: "100%", originY: 1 }}
                      className={`w-full max-w-[30px] rounded-t-md transition-colors ${barColor}`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold sm:text-xs ${
                      isSelected
                        ? "text-[#0F172A] underline decoration-[#1D4ED8] decoration-2 underline-offset-4"
                        : "text-[#64748B]"
                    }`}
                  >
                    {day.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Historial de ventas y entradas"
          className="rounded-2xl border border-[#CBD5E1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-4 sm:px-5">
            <h2 className="font-display text-lg font-bold text-[#0F172A]">
              Historial de ventas y entradas
            </h2>

            <div
              className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1"
              role="tablist"
              aria-label="Filtrar historial"
            >
              <button
                type="button"
                role="tab"
                aria-selected={historyFilter === "all"}
                onClick={() => setHistoryFilter("all")}
                className={`min-h-[34px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  historyFilter === "all"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={historyFilter === "sale"}
                onClick={() => setHistoryFilter("sale")}
                className={`min-h-[34px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  historyFilter === "sale"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Ventas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={historyFilter === "entry"}
                onClick={() => setHistoryFilter("entry")}
                className={`min-h-[34px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  historyFilter === "entry"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Entradas
              </button>
            </div>
          </div>

          <div className="max-h-[420px] divide-y divide-[#E2E8F0] overflow-y-auto">
            {sortedHistory.length === 0 ? (
              <div className="p-8 text-center text-sm font-medium text-[#64748B]">
                Aún no hay movimientos registrados.
              </div>
            ) : (
              sortedHistory.map((mov) => {
                const isSale = mov.type === "sale";
                return (
                  <div
                    key={mov.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F8FAFC] sm:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isSale
                            ? "bg-[#EFF6FF] text-[#1D4ED8]"
                            : "bg-[#F0FDF4] text-[#15803D]"
                        }`}
                        aria-hidden="true"
                      >
                        {isSale ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownLeft className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-[#0F172A]">
                          {mov.productName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#64748B]">
                          <span
                            className={
                              isSale
                                ? "font-semibold text-[#1D4ED8]"
                                : "font-semibold text-[#15803D]"
                            }
                          >
                            {isSale ? "Venta" : "Entrada"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatMovementTime(mov.timestamp, now)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-display text-base font-bold text-[#0F172A]">
                        {mov.amountBalboas > 0
                          ? formatBalboas(mov.amountBalboas)
                          : "—"}
                      </p>
                      <p className="text-xs font-medium text-[#64748B]">
                        {isSale ? "-" : "+"}
                        {formatQuantity(mov.quantity)} {mov.unit}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
