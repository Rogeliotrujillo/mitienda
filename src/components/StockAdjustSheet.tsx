import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { Product, formatBalboas, formatQuantity } from "../types";

interface StockAdjustSheetProps {
  product: Product | null;
  mode: "add" | "remove" | null;
  onClose: () => void;
  onConfirm: (
    product: Product,
    mode: "add" | "remove",
    amount: number,
    recordAsSale: boolean
  ) => void;
}

const QUICK_AMOUNTS = [1, 5, 10, 20];

export function StockAdjustSheet({
  product,
  mode,
  onClose,
  onConfirm,
}: StockAdjustSheetProps) {
  const [rawValue, setRawValue] = useState<string>("1");
  const [recordAsSale, setRecordAsSale] = useState<boolean>(true);

  useEffect(() => {
    if (product && mode) {
      setRawValue("1");
      setRecordAsSale(mode === "remove");
    }
  }, [product, mode]);

  if (!product || !mode) {
    return null;
  }

  const parsedAmount = Math.max(0, Number(rawValue) || 0);
  const isRemove = mode === "remove";
  const maxRemovable = product.quantity;
  const effectiveRemove = isRemove
    ? Math.min(parsedAmount, maxRemovable)
    : parsedAmount;

  const estimatedSaleAmount =
    Math.round(effectiveRemove * product.pricePerUnit * 100) / 100;

  const handleQuickAdd = (delta: number) => {
    const next = Math.round((parsedAmount + delta) * 100) / 100;
    setRawValue(String(next));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) return;
    if (isRemove && product.quantity <= 0) return;
    onConfirm(product, mode, parsedAmount, isRemove && recordAsSale);
  };

  const canConfirm =
    parsedAmount > 0 && (!isRemove || product.quantity > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-sheet-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#CBD5E1] sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#64748B]">
              {isRemove ? "Quitar del stock" : "Agregar al stock"}
            </p>
            <h2
              id="adjust-sheet-title"
              className="font-display text-2xl font-bold text-[#0F172A]"
            >
              {product.name}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#64748B] tabular-nums">
              Disponible: {formatQuantity(product.quantity)} {product.unit}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-[#475569]">
              Sumar rápido:
            </p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleQuickAdd(n)}
                  className="flex min-h-[52px] items-center justify-center rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] font-display text-lg font-bold text-[#0F172A] tabular-nums transition-colors hover:border-[#1D4ED8] hover:bg-[#EFF6FF] active:scale-[0.97]"
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="stock-amount-input"
                className="text-sm font-medium text-[#475569]"
              >
                Cantidad ({product.unit}):
              </label>
              <button
                type="button"
                onClick={() => setRawValue("0")}
                className="min-h-[36px] px-2 text-sm font-semibold text-[#1D4ED8] hover:underline"
              >
                Poner en 0
              </button>
            </div>
            <input
              id="stock-amount-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              className="w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-center font-display text-4xl font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
            />
          </div>

          {isRemove && product.quantity > 0 && (
            <button
              type="button"
              onClick={() => setRecordAsSale((v) => !v)}
              className={`flex min-h-[50px] w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors ${
                recordAsSale
                  ? "border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#0F172A]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
              }`}
            >
              <span className="text-sm font-semibold sm:text-base">
                {recordAsSale
                  ? "Contar como venta de hoy"
                  : "Solo ajuste de inventario"}
              </span>
              {recordAsSale && (
                <span className="font-display text-base font-bold text-[#1D4ED8] tabular-nums sm:text-lg">
                  {formatBalboas(estimatedSaleAmount)}
                </span>
              )}
            </button>
          )}

          {isRemove && product.quantity <= 0 && (
            <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]">
              Este producto está agotado en 0.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="order-2 flex min-h-[50px] items-center justify-center rounded-xl border border-[#CBD5E1] bg-white px-5 font-display text-base font-semibold text-[#0F172A] hover:bg-[#F8FAFC] sm:order-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className={`order-1 flex min-h-[50px] items-center justify-center rounded-xl px-5 font-display text-base font-semibold text-white transition-colors sm:order-2 ${
                !canConfirm
                  ? "cursor-not-allowed bg-[#94A3B8]"
                  : "bg-[#1D4ED8] hover:bg-[#1E40AF]"
              }`}
            >
              {isRemove ? "Confirmar salida" : "Confirmar entrada"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
