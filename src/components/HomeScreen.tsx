import {
  ArrowDownToLine,
  BarChart3,
  FileDown,
  Mic,
  Package,
} from "lucide-react";
import { Product, ScreenId, getStockStatus } from "../types";

interface HomeScreenProps {
  products: Product[];
  onNavigate: (screen: ScreenId) => void;
}

export function HomeScreen({ products, onNavigate }: HomeScreenProps) {
  const redCount = products.filter((p) => getStockStatus(p) === "red").length;
  const yellowCount = products.filter(
    (p) => getStockStatus(p) === "yellow"
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-10">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#64748B]">
          Panel de gestión
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
          ¿Qué deseas hacer hoy?
        </h1>
      </div>

      {/* Tres botones grandes y claros en la parte superior */}
      <section
        aria-label="Acciones principales"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <button
          type="button"
          onClick={() => onNavigate("stock")}
          className="group flex min-h-[104px] w-full items-center justify-between gap-4 rounded-2xl bg-[#0F172A] p-5 text-left text-white shadow-sm transition-all duration-150 hover:bg-[#1E293B] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] md:min-h-[156px] md:flex-col md:items-start md:justify-between md:p-6"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Package className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <div className="flex-1 md:flex-initial">
            <span className="font-display block text-xl font-bold leading-tight sm:text-2xl">
              Ver mi stock
            </span>
            <span className="mt-1 block text-sm font-medium text-[#CBD5E1]">
              {products.length} productos
              {redCount > 0 ? ` · ${redCount} agotados` : ""}
              {redCount === 0 && yellowCount > 0
                ? ` · ${yellowCount} quedan poco`
                : ""}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("metrics")}
          className="group flex min-h-[104px] w-full items-center justify-between gap-4 rounded-2xl border border-[#CBD5E1] bg-white p-5 text-left text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-[#1D4ED8] hover:bg-[#F8FAFC] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] md:min-h-[156px] md:flex-col md:items-start md:justify-between md:p-6"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#0F172A] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#1D4ED8]">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1 md:flex-initial">
            <span className="font-display block text-xl font-bold leading-tight sm:text-2xl">
              Ver mis números
            </span>
            <span className="mt-1 block text-sm font-medium text-[#64748B]">
              Ventas y más vendidos
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("reports")}
          className="group flex min-h-[104px] w-full items-center justify-between gap-4 rounded-2xl border border-[#CBD5E1] bg-white p-5 text-left text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-[#1D4ED8] hover:bg-[#F8FAFC] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] md:min-h-[156px] md:flex-col md:items-start md:justify-between md:p-6"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#0F172A] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#1D4ED8]">
            <FileDown className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1 md:flex-initial">
            <span className="font-display block text-xl font-bold leading-tight sm:text-2xl">
              Descargar reporte
            </span>
            <span className="mt-1 block text-sm font-medium text-[#64748B]">
              Documentos PDF y CSV
            </span>
          </div>
        </button>
      </section>

      {/* Línea divisoria con el texto exacto solicitado */}
      <div className="relative flex items-center py-1" role="separator">
        <div className="flex-grow border-t border-[#CBD5E1]" />
        <span className="mx-4 shrink-0 text-sm font-semibold text-[#64748B] sm:text-base">
          o si prefieres, usa la voz
        </span>
        <div className="flex-grow border-t border-[#CBD5E1]" />
      </div>

      {/* Dos botones secundarios profesionales de voz */}
      <section
        aria-label="Acciones por voz"
        className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3.5 sm:gap-4"
      >
        <button
          type="button"
          onClick={() => onNavigate("voice-sale")}
          className="group flex min-h-[76px] items-center justify-center gap-3.5 rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-[#1D4ED8] hover:bg-[#F8FAFC] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1D4ED8] text-white shadow-xs transition-transform duration-150 group-hover:scale-105">
            <Mic className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="text-left">
            <span className="font-display block text-base font-bold leading-tight sm:text-lg">
              Dictar ventas
            </span>
            <span className="hidden text-xs font-medium text-[#64748B] sm:block">
              Registrar por voz
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("voice-entry")}
          className="group flex min-h-[76px] items-center justify-center gap-3.5 rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-[#0F172A] hover:bg-[#F8FAFC] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F172A]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-white shadow-xs transition-transform duration-150 group-hover:scale-105">
            <ArrowDownToLine className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="text-left">
            <span className="font-display block text-base font-bold leading-tight sm:text-lg">
              Dictar entrada
            </span>
            <span className="hidden text-xs font-medium text-[#64748B] sm:block">
              Ingreso por voz
            </span>
          </div>
        </button>
      </section>
    </div>
  );
}
