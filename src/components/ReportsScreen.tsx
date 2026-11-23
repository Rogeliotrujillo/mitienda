import { useState } from "react";
import { Check, FileSpreadsheet, FileText } from "lucide-react";
import { Movement, Product, formatBalboas } from "../types";
import {
  ReportPeriod,
  downloadCSV,
  downloadPDF,
  filterMovementsByPeriod,
  getPeriodLabel,
} from "../utils/reports";

interface ReportsScreenProps {
  products: Product[];
  movements: Movement[];
}

const REPORT_OPTIONS: Array<{
  period: ReportPeriod;
  subtitle: string;
}> = [
  {
    period: "day",
    subtitle: "Ventas y movimientos de hoy",
  },
  {
    period: "week",
    subtitle: "Últimos 7 días de tu puesto",
  },
  {
    period: "month",
    subtitle: "Últimos 30 días completos",
  },
];

export function ReportsScreen({ products, movements }: ReportsScreenProps) {
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null);

  const handleDownload = (period: ReportPeriod, format: "pdf" | "csv") => {
    if (format === "pdf") {
      downloadPDF(period, products, movements);
    } else {
      downloadCSV(period, products, movements);
    }
    setLastDownloaded(`${getPeriodLabel(period)} (${format.toUpperCase()})`);
    window.setTimeout(() => {
      setLastDownloaded(null);
    }, 3500);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 space-y-1">
        <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
          Elige el reporte que necesitas
        </h2>
        <p className="text-base text-[#64748B]">
          Incluye tus ventas, entradas de mercancía y estado actual del stock.
        </p>
      </div>

      {lastDownloaded && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[#1E40AF]"
        >
          <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="font-display text-base font-semibold">
            Descargado: {lastDownloaded}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {REPORT_OPTIONS.map(({ period, subtitle }) => {
          const periodMovements = filterMovementsByPeriod(movements, period);
          const sales = periodMovements.filter((m) => m.type === "sale");
          const totalSold = sales.reduce((sum, m) => sum + m.amountBalboas, 0);

          return (
            <section
              key={period}
              className="flex flex-col justify-between rounded-2xl border border-[#CBD5E1] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div>
                <h3 className="font-display text-xl font-bold text-[#0F172A]">
                  {getPeriodLabel(period)}
                </h3>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  {subtitle}
                </p>

                <div className="mt-4 flex items-baseline justify-between border-t border-[#E2E8F0] pt-4">
                  <span className="text-sm font-medium text-[#64748B]">
                    Total vendido
                  </span>
                  <span className="font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                    {formatBalboas(totalSold)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-[#64748B] tabular-nums">
                  {sales.length} ventas · {periodMovements.length} movimientos
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownload(period, "pdf")}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-3 py-2.5 font-display text-base font-semibold text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98]"
                >
                  <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownload(period, "csv")}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 font-display text-base font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] active:scale-[0.98]"
                >
                  <FileSpreadsheet
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>CSV</span>
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
