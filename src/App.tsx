import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { HomeScreen } from "./components/HomeScreen";
import { MetricsScreen } from "./components/MetricsScreen";
import { ReportsScreen } from "./components/ReportsScreen";
import { StockScreen } from "./components/StockScreen";
import { VoiceScreen } from "./components/VoiceScreen";
import { NewProductInput } from "./components/AddProductModal";
import { INITIAL_PRODUCTS, createInitialMovements } from "./data/initialData";
import {
  Movement,
  Product,
  ScreenId,
  VoiceParsedItem,
  formatQuantity,
} from "./types";

const PRODUCTS_STORAGE_KEY = "mi_tienda_penonome_products_v1";
const MOVEMENTS_STORAGE_KEY = "mi_tienda_penonome_movements_v1";

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return INITIAL_PRODUCTS;
    const parsed = JSON.parse(raw) as Product[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_PRODUCTS;
  } catch {
    return INITIAL_PRODUCTS;
  }
}

function loadMovements(): Movement[] {
  try {
    const raw = localStorage.getItem(MOVEMENTS_STORAGE_KEY);
    if (!raw) return createInitialMovements();
    const parsed = JSON.parse(raw) as Movement[];
    return Array.isArray(parsed) ? parsed : createInitialMovements();
  } catch {
    return createInitialMovements();
  }
}

const SCREEN_TITLES: Record<ScreenId, string> = {
  home: "Mi tienda",
  stock: "Mi stock",
  metrics: "Mis números",
  reports: "Descargar reporte",
  "voice-sale": "Dictar ventas",
  "voice-entry": "Dictar entrada",
};

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("home");
  const [voiceReturnScreen, setVoiceReturnScreen] = useState<"home" | "stock">(
    "home"
  );
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [movements, setMovements] = useState<Movement[]>(loadMovements);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
    } catch {
      // Ignore storage quota issues
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(MOVEMENTS_STORAGE_KEY, JSON.stringify(movements));
    } catch {
      // Ignore storage quota issues
    }
  }, [movements]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 3200);
  };

  const handleManualAdjustStock = (
    product: Product,
    mode: "add" | "remove",
    amount: number,
    recordAsSale: boolean
  ) => {
    const actualDelta =
      mode === "add" ? amount : Math.min(amount, product.quantity);

    if (actualDelta <= 0) return;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== product.id) return p;
        const nextQty =
          mode === "add"
            ? Math.round((p.quantity + actualDelta) * 100) / 100
            : Math.max(0, Math.round((p.quantity - actualDelta) * 100) / 100);
        return { ...p, quantity: nextQty };
      })
    );

    if (mode === "add" || recordAsSale) {
      const movement: Movement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: mode === "add" ? "entry" : "sale",
        productId: product.id,
        productName: product.name,
        quantity: actualDelta,
        unit: product.unit,
        amountBalboas:
          mode === "remove"
            ? Math.round(actualDelta * product.pricePerUnit * 100) / 100
            : 0,
        timestamp: new Date().toISOString(),
        source: "manual",
      };
      setMovements((prev) => [movement, ...prev]);
    }

    showToast(
      mode === "add"
        ? `Agregaste ${formatQuantity(actualDelta)} ${product.unit} de ${product.name}`
        : `Quitaste ${formatQuantity(actualDelta)} ${product.unit} de ${product.name}`
    );
  };

  const handleAddProduct = (data: NewProductInput) => {
    const cleanName = data.name.trim();
    if (!cleanName) return;

    const existing = products.find(
      (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      const nextQty =
        Math.round((existing.quantity + data.quantity) * 100) / 100;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                quantity: nextQty,
                pricePerUnit:
                  data.pricePerUnit > 0 ? data.pricePerUnit : p.pricePerUnit,
              }
            : p
        )
      );
      if (data.quantity > 0) {
        const movement: Movement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "entry",
          productId: existing.id,
          productName: existing.name,
          quantity: data.quantity,
          unit: existing.unit,
          amountBalboas:
            Math.round(data.quantity * data.pricePerUnit * 100) / 100,
          timestamp: new Date().toISOString(),
          source: "manual",
        };
        setMovements((prev) => [movement, ...prev]);
      }
      showToast(
        `Actualizaste ${existing.name} (+${formatQuantity(data.quantity)} ${existing.unit})`
      );
      return;
    }

    const newProduct: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      unit: data.unit,
      quantity: data.quantity,
      minStock: data.minStock,
      pricePerUnit: data.pricePerUnit,
    };

    setProducts((prev) => [newProduct, ...prev]);

    if (data.quantity > 0) {
      const movement: Movement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "entry",
        productId: newProduct.id,
        productName: newProduct.name,
        quantity: data.quantity,
        unit: newProduct.unit,
        amountBalboas:
          Math.round(data.quantity * data.pricePerUnit * 100) / 100,
        timestamp: new Date().toISOString(),
        source: "manual",
      };
      setMovements((prev) => [movement, ...prev]);
    }

    showToast(
      `Agregaste ${newProduct.name} (${formatQuantity(newProduct.quantity)} ${newProduct.unit})`
    );
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    showToast(`Actualizaste ${updated.name}`);
  };

  const handleDeleteProduct = (productId: string) => {
    const target = products.find((p) => p.id === productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    if (target) {
      showToast(`Eliminaste ${target.name} del inventario`);
    }
  };

  const handleSaveVoiceItems = (
    mode: "sale" | "entry",
    items: VoiceParsedItem[]
  ) => {
    if (items.length === 0) return;

    const nowIso = new Date().toISOString();
    const updatedProducts = [...products];
    const newMovements: Movement[] = [];
    let newProductsCount = 0;

    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty <= 0) continue;

      let targetIndex = item.matchedProductId
        ? updatedProducts.findIndex((p) => p.id === item.matchedProductId)
        : -1;

      if (targetIndex === -1) {
        const nameLower = item.productName.trim().toLowerCase();
        targetIndex = updatedProducts.findIndex(
          (p) => p.name.trim().toLowerCase() === nameLower
        );
      }

      let resolvedProductId = "";
      let resolvedName = item.productName.trim() || "Producto";
      let resolvedUnit = item.unit.trim() || "unidades";

      if (targetIndex >= 0) {
        const existing = updatedProducts[targetIndex];
        resolvedProductId = existing.id;
        resolvedName = existing.name;
        resolvedUnit = existing.unit;

        const nextQty =
          mode === "entry"
            ? Math.round((existing.quantity + qty) * 100) / 100
            : Math.max(0, Math.round((existing.quantity - qty) * 100) / 100);

        updatedProducts[targetIndex] = {
          ...existing,
          quantity: nextQty,
        };
      } else {
        const newId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        resolvedProductId = newId;
        newProductsCount += 1;
        const unitPrice =
          qty > 0 && item.amountBalboas > 0
            ? Math.round((item.amountBalboas / qty) * 100) / 100
            : 1.0;

        updatedProducts.unshift({
          id: newId,
          name: resolvedName,
          unit: resolvedUnit,
          quantity: mode === "entry" ? qty : 0,
          minStock: 5,
          pricePerUnit: unitPrice,
        });
      }

      newMovements.push({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: mode,
        productId: resolvedProductId,
        productName: resolvedName,
        quantity: qty,
        unit: resolvedUnit,
        amountBalboas: Math.max(0, Number(item.amountBalboas) || 0),
        timestamp: nowIso,
        source: "voice",
      });
    }

    setProducts(updatedProducts);
    setMovements((prev) => [...newMovements, ...prev]);
    setScreen(voiceReturnScreen);
    setVoiceReturnScreen("home");
    const newNote =
      newProductsCount > 0
        ? `, ${newProductsCount} ${newProductsCount === 1 ? "nuevo" : "nuevos"} en stock`
        : "";
    showToast(
      mode === "sale"
        ? `Venta guardada (${newMovements.length} ${newMovements.length === 1 ? "producto" : "productos"}${newNote})`
        : `Entrada guardada (${newMovements.length} ${newMovements.length === 1 ? "producto" : "productos"}${newNote})`
    );
  };

  return (
    <div className="min-h-dvh bg-[#F4F5F7] text-[#0F172A]">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#E2E8F0] bg-white px-4 sm:px-6">
        {screen === "home" ? (
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <span className="font-display text-xl font-bold tracking-tight text-[#0F172A] whitespace-nowrap sm:text-2xl">
              Mi tienda
            </span>
            <span className="text-sm font-medium text-[#64748B] whitespace-nowrap">
              Mercado Público de Penonomé
            </span>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setScreen("home")}
              className="flex min-h-[42px] items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3.5 font-display text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] active:scale-[0.98] whitespace-nowrap shrink-0 sm:text-base"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              <span>Inicio</span>
            </button>

            <h1 className="font-display truncate text-lg font-bold text-[#0F172A] sm:text-xl">
              {SCREEN_TITLES[screen]}
            </h1>

            <div className="w-[84px] shrink-0" aria-hidden="true" />
          </div>
        )}
      </header>

      <main>
        {screen === "home" && (
          <HomeScreen
            products={products}
            onNavigate={(nextScreen) => {
              if (nextScreen === "voice-sale" || nextScreen === "voice-entry") {
                setVoiceReturnScreen("home");
              }
              setScreen(nextScreen);
            }}
          />
        )}

        {screen === "stock" && (
          <StockScreen
            products={products}
            onAdjustStock={handleManualAdjustStock}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenVoiceEntry={() => {
              setVoiceReturnScreen("stock");
              setScreen("voice-entry");
            }}
          />
        )}

        {screen === "metrics" && (
          <MetricsScreen products={products} movements={movements} />
        )}

        {screen === "reports" && (
          <ReportsScreen products={products} movements={movements} />
        )}

        {(screen === "voice-sale" || screen === "voice-entry") && (
          <VoiceScreen
            mode={screen === "voice-sale" ? "sale" : "entry"}
            products={products}
            onSaveItems={handleSaveVoiceItems}
            onCancel={() => {
              setScreen(voiceReturnScreen);
              setVoiceReturnScreen("home");
            }}
          />
        )}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3.5 text-white shadow-xl"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2563EB]">
              <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium sm:text-base">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
