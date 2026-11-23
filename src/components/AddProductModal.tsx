import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { Product } from "../types";

export interface NewProductInput {
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  pricePerUnit: number;
}

interface AddProductModalProps {
  open: boolean;
  editingProduct?: Product | null;
  initialName?: string;
  onClose: () => void;
  onCreate: (data: NewProductInput) => void;
  onUpdate?: (product: Product) => void;
  onDelete?: (productId: string) => void;
}

const QUICK_UNITS = [
  "unidades",
  "libras",
  "kilos",
  "sacos",
  "mazos",
  "docenas",
  "cartones",
  "cajas",
];

const QUICK_QUANTITIES = [1, 5, 10, 20];

const SINGULAR_UNIT_MAP: Record<string, string> = {
  unidades: "unidad",
  libras: "libra",
  kilos: "kilo",
  sacos: "saco",
  mazos: "mazo",
  docenas: "docena",
  cartones: "cartón",
  cajas: "caja",
  bolsas: "bolsa",
  racimos: "racimo",
  litros: "litro",
  botellas: "botella",
  paquetes: "paquete",
  quintales: "quintal",
  pares: "par",
  latas: "lata",
};

export function getSingularUnit(unit: string): string {
  const clean = unit.trim().toLowerCase();
  if (!clean) return "unidad";
  if (clean in SINGULAR_UNIT_MAP) return SINGULAR_UNIT_MAP[clean];
  if (clean.endsWith("es") && clean.length > 4) return clean.slice(0, -2);
  if (clean.endsWith("s") && clean.length > 3) return clean.slice(0, -1);
  return clean;
}

export function AddProductModal({
  open,
  editingProduct = null,
  initialName = "",
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: AddProductModalProps) {
  const isEditing = Boolean(editingProduct);

  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("unidades");
  const [quantityStr, setQuantityStr] = useState("10");
  const [priceStr, setPriceStr] = useState("1.00");
  const [minStockStr, setMinStockStr] = useState("5");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (editingProduct) {
      setName(editingProduct.name);
      setUnit(editingProduct.unit);
      setQuantityStr(String(editingProduct.quantity));
      setPriceStr(editingProduct.pricePerUnit.toFixed(2));
      setMinStockStr(String(editingProduct.minStock));
    } else {
      setName(initialName);
      setUnit("unidades");
      setQuantityStr("10");
      setPriceStr("1.00");
      setMinStockStr("5");
    }
  }, [open, editingProduct, initialName]);

  if (!open) return null;

  const qty = Math.max(0, Number(quantityStr) || 0);
  const price = Math.max(0, Number(priceStr) || 0);
  const minStock = Math.max(1, Number(minStockStr) || 5);
  const canSave = name.trim().length > 0;
  const singularUnit = getSingularUnit(unit);

  const handleQuickAddQty = (delta: number) => {
    const next = Math.round((qty + delta) * 100) / 100;
    setQuantityStr(String(next));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const cleanUnit = unit.trim() || "unidades";
    const roundedQty = Math.round(qty * 100) / 100;
    const roundedPrice = Math.round(price * 100) / 100;

    if (editingProduct && onUpdate) {
      onUpdate({
        ...editingProduct,
        name: name.trim(),
        unit: cleanUnit,
        quantity: roundedQty,
        minStock,
        pricePerUnit: roundedPrice,
      });
    } else {
      onCreate({
        name: name.trim(),
        unit: cleanUnit,
        quantity: roundedQty,
        minStock,
        pricePerUnit: roundedPrice,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#CBD5E1] sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#64748B]">Mi stock</p>
            <h2
              id="add-product-modal-title"
              className="font-display text-2xl font-bold text-[#0F172A]"
            >
              {isEditing ? "Editar producto" : "Nuevo producto"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#F1F5F9]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="new-prod-name"
              className="mb-1.5 block text-sm font-medium text-[#475569]"
            >
              Nombre del producto
            </label>
            <input
              id="new-prod-name"
              type="text"
              autoFocus={!isEditing}
              required
              placeholder="Ej: Sombreros pintados"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-base font-semibold text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="new-prod-unit"
              className="mb-1.5 block text-sm font-medium text-[#475569]"
            >
              Unidad de venta
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                    unit === u
                      ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <input
              id="new-prod-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-sm font-semibold text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-prod-price"
                className="mb-1.5 block text-sm font-medium text-[#475569]"
              >
                Valor por {singularUnit} (B/.)
              </label>
              <input
                id="new-prod-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.05"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 font-display text-lg font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="new-prod-min"
                className="mb-1.5 block text-sm font-medium text-[#475569]"
              >
                Aviso queda poco
              </label>
              <input
                id="new-prod-min"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={minStockStr}
                onChange={(e) => setMinStockStr(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 font-display text-lg font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="new-prod-qty"
                className="text-sm font-medium text-[#475569]"
              >
                {isEditing ? `Cantidad actual (${unit || "unidades"})` : "Cantidad inicial"}
              </label>
              <button
                type="button"
                onClick={() => setQuantityStr("0")}
                className="text-xs font-semibold text-[#1D4ED8] hover:underline"
              >
                Poner en 0
              </button>
            </div>
            {!isEditing && (
              <div className="mb-2 grid grid-cols-4 gap-2">
                {QUICK_QUANTITIES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleQuickAddQty(n)}
                    className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] font-display text-base font-bold text-[#0F172A] tabular-nums hover:border-[#1D4ED8] hover:bg-[#EFF6FF]"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            )}
            <input
              id="new-prod-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-center font-display text-2xl font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
            />
          </div>

          {isEditing && editingProduct && onDelete && (
            <div className="border-t border-[#E2E8F0] pt-3">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Eliminar producto del inventario</span>
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-[#B91C1C] sm:text-sm">
                    ¿Seguro que deseas eliminarlo?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[34px] rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-xs font-semibold text-[#0F172A]"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(editingProduct.id)}
                      className="min-h-[34px] rounded-lg bg-[#DC2626] px-3 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                    >
                      Sí, eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
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
              disabled={!canSave}
              className="order-1 flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 font-display text-base font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:bg-[#94A3B8] sm:order-2"
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              <span>{isEditing ? "Guardar cambios" : "Guardar producto"}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
