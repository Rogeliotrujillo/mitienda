import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Minus, Pencil, Plus, Search, X } from "lucide-react";
import {
  Product,
  TrafficLightStatus,
  formatBalboas,
  formatQuantity,
  getStockStatus,
} from "../types";
import { filterCatalogByLiveTyping } from "../utils/catalogMatcher";
import {
  InventoryQueryResult,
  analyzeInventoryQuery,
} from "../utils/inventoryQuery";
import {
  SPEECH_LANG_FALLBACKS,
  SpeechRecognitionLike,
  extractSpeechTranscript,
  getSpeechRecognitionCtor,
  mapSpeechErrorMessage,
} from "../utils/speechRecognition";
import {
  AddProductModal,
  NewProductInput,
  getSingularUnit,
} from "./AddProductModal";
import { StockAdjustSheet } from "./StockAdjustSheet";

interface StockScreenProps {
  products: Product[];
  onAdjustStock: (
    product: Product,
    mode: "add" | "remove",
    amount: number,
    recordAsSale: boolean
  ) => void;
  onAddProduct: (data: NewProductInput) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onOpenVoiceEntry: () => void;
}

type FilterKey = "all" | TrafficLightStatus;

const STATUS_META: Record<
  TrafficLightStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  red: {
    label: "Agotado",
    dotClass: "bg-[#DC2626]",
    textClass: "text-[#B91C1C]",
  },
  yellow: {
    label: "Queda poco",
    dotClass: "bg-[#D97706]",
    textClass: "text-[#B45309]",
  },
  green: {
    label: "Suficiente",
    dotClass: "bg-[#16A34A]",
    textClass: "text-[#15803D]",
  },
};

export function StockScreen({
  products,
  onAdjustStock,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onOpenVoiceEntry,
}: StockScreenProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [isListeningVoiceSearch, setIsListeningVoiceSearch] =
    useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<InventoryQueryResult | null>(
    null
  );

  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prefillNewName, setPrefillNewName] = useState<string>("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustMode, setAdjustMode] = useState<"add" | "remove" | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const latestTranscriptRef = useRef<string>("");

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const redCount = products.filter((p) => getStockStatus(p) === "red").length;
  const yellowCount = products.filter(
    (p) => getStockStatus(p) === "yellow"
  ).length;
  const greenCount = products.filter(
    (p) => getStockStatus(p) === "green"
  ).length;
  const availableCount = products.filter((p) => p.quantity > 0).length;

  const runVoiceQueryText = (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    const analysis = analyzeInventoryQuery(clean, products);
    setVoiceResult(analysis);
    setVoiceError(null);
    setSelectedOptionId("");
    setSearchText(clean);

    if (
      analysis.kind === "low_stock" ||
      analysis.kind === "out_of_stock" ||
      analysis.kind === "available_count"
    ) {
      setFilter(analysis.suggestedFilter);
    } else {
      setFilter("all");
    }
  };

  const stopVoiceSearch = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    setIsListeningVoiceSearch(false);
  };

  const launchVoiceSearchAttempt = (
    SpeechCtor: NonNullable<ReturnType<typeof getSpeechRecognitionCtor>>,
    langIndex: number
  ) => {
    const recognition = new SpeechCtor();
    recognition.lang = SPEECH_LANG_FALLBACKS[langIndex] ?? "es";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let ended = false;

    recognition.onresult = (event) => {
      const { combinedText } = extractSpeechTranscript(event.results);
      latestTranscriptRef.current = combinedText;
      if (combinedText) {
        setSearchText(combinedText);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        setIsListeningVoiceSearch(false);
        return;
      }

      if (
        event.error === "language-not-supported" &&
        !latestTranscriptRef.current.trim() &&
        langIndex + 1 < SPEECH_LANG_FALLBACKS.length
      ) {
        ended = true;
        launchVoiceSearchAttempt(SpeechCtor, langIndex + 1);
        return;
      }

      setIsListeningVoiceSearch(false);
      const mapped = mapSpeechErrorMessage(event.error);
      setVoiceError(mapped.message);
    };

    recognition.onend = () => {
      if (ended) return;
      ended = true;
      setIsListeningVoiceSearch(false);
      const spoken = latestTranscriptRef.current.trim();
      if (spoken) {
        runVoiceQueryText(spoken);
      }
    };

    try {
      recognition.start();
      setIsListeningVoiceSearch(true);
    } catch {
      setIsListeningVoiceSearch(false);
      setVoiceError("No se pudo activar el micrófono.");
    }
  };

  const handleToggleVoiceSearch = () => {
    if (isListeningVoiceSearch) {
      stopVoiceSearch();
      return;
    }

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setVoiceError(
        "El micrófono requiere conexión segura (HTTPS). Escribe tu pregunta o producto en el buscador."
      );
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor) {
      setVoiceError(
        "Tu navegador no permite micrófono aquí. Escribe tu pregunta o producto en el buscador."
      );
      return;
    }

    setVoiceError(null);
    latestTranscriptRef.current = "";

    try {
      recognitionRef.current?.abort();
    } catch {
      // Ignore
    }

    launchVoiceSearchAttempt(SpeechCtor, 0);
  };

  const clearSearchAndVoice = () => {
    setSearchText("");
    setSelectedOptionId("");
    setVoiceResult(null);
    setVoiceError(null);
    setFilter("all");
  };

  const handleSelectOption = (productId: string) => {
    setSelectedOptionId(productId);
    setVoiceResult(null);
    setVoiceError(null);
    if (!productId) {
      setSearchText("");
      return;
    }
    const found = products.find((p) => p.id === productId);
    if (found) {
      setSearchText(found.name);
      setFilter("all");
    }
  };

  const filteredProducts = useMemo(() => {
    let base = products;

    if (selectedOptionId) {
      base = base.filter((p) => p.id === selectedOptionId);
    } else if (voiceResult) {
      if (voiceResult.kind === "available_count") {
        base = base.filter((p) => p.quantity > 0);
      } else if (
        voiceResult.kind === "low_stock" ||
        voiceResult.kind === "out_of_stock"
      ) {
        base =
          filter === "all"
            ? voiceResult.matchedProducts
            : products.filter((p) => getStockStatus(p) === filter);
      } else if (voiceResult.kind === "product_match") {
        const ids = new Set(voiceResult.matchedProducts.map((p) => p.id));
        base = base.filter((p) => ids.has(p.id));
      } else if (voiceResult.kind === "not_found") {
        base = [];
      }
    } else if (searchText.trim().length > 0) {
      const q = searchText.trim();
      const questionStyle =
        /\b(?:cuanto|cuanta|cuantos|cuantas|cual|cuales|agotando|agotaron|agotado|disponible|quedan|queda)\b/i.test(
          q
        );
      if (questionStyle) {
        const quickAnalysis = analyzeInventoryQuery(q, products);
        if (quickAnalysis.kind === "available_count") {
          base = base.filter((p) => p.quantity > 0);
        } else if (
          quickAnalysis.kind === "low_stock" ||
          quickAnalysis.kind === "out_of_stock" ||
          quickAnalysis.kind === "product_match"
        ) {
          const ids = new Set(quickAnalysis.matchedProducts.map((p) => p.id));
          base = base.filter((p) => ids.has(p.id));
        } else {
          base = [];
        }
      } else {
        base = filterCatalogByLiveTyping(q, products);
      }
    }

    if (filter !== "all") {
      base = base.filter((p) => getStockStatus(p) === filter);
    }

    return base;
  }, [products, selectedOptionId, voiceResult, searchText, filter]);

  const openAdjust = (product: Product, mode: "add" | "remove") => {
    setSelectedProduct(product);
    setAdjustMode(mode);
  };

  const closeAdjust = () => {
    setSelectedProduct(null);
    setAdjustMode(null);
  };

  const openAddManualModal = (initialName = "") => {
    setEditingProduct(null);
    setPrefillNewName(initialName);
    setShowProductModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setPrefillNewName("");
    setShowProductModal(true);
  };

  const hasActiveFilter =
    Boolean(searchText.trim()) ||
    Boolean(selectedOptionId) ||
    Boolean(voiceResult) ||
    filter !== "all";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      {/* Encabezado limpio con acciones de agregar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-[#475569] tabular-nums">
          {products.length} productos · {availableCount} disponibles
        </p>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => openAddManualModal("")}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#1D4ED8] px-3 font-display text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF] active:scale-[0.98] whitespace-nowrap sm:px-4 sm:text-base"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Agregar producto</span>
          </button>

          <button
            type="button"
            onClick={onOpenVoiceEntry}
            aria-label="Dictar entrada con micrófono"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 font-display text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] active:scale-[0.98] whitespace-nowrap sm:px-3.5 sm:text-base"
          >
            <Mic className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <span>Dictar</span>
          </button>
        </div>
      </div>

      {/* Buscador unificado: escribir, preguntar por voz o elegir de la lista */}
      <section aria-label="Buscador de inventario" className="mb-4 space-y-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
          <div className="relative sm:col-span-7">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#64748B]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setSelectedOptionId("");
                setVoiceResult(null);
                setVoiceError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchText.trim()) {
                  e.preventDefault();
                  runVoiceQueryText(searchText);
                }
              }}
              placeholder="Buscar producto o preguntar por voz..."
              aria-label="Buscar producto o preguntar por stock"
              className={`min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white pl-10 text-base font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:border-[#1D4ED8] focus:outline-none ${
                searchText ? "pr-24" : "pr-14"
              }`}
            />

            <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
              {searchText && (
                <button
                  type="button"
                  onClick={clearSearchAndVoice}
                  aria-label="Limpiar búsqueda"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleVoiceSearch}
                aria-label={
                  isListeningVoiceSearch
                    ? "Detener búsqueda por voz"
                    : "Buscar o preguntar por voz"
                }
                title="Preguntar o buscar por voz"
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isListeningVoiceSearch
                    ? "bg-[#DC2626] text-white"
                    : "bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]"
                }`}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="sm:col-span-5">
            <select
              aria-label="Elegir producto de la lista"
              value={selectedOptionId}
              onChange={(e) => handleSelectOption(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-base font-semibold text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:border-[#1D4ED8] focus:outline-none"
            >
              <option value="">Elegir de la lista ({products.length})</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatQuantity(p.quantity)} {p.unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isListeningVoiceSearch && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-sm font-semibold text-[#1E40AF]"
          >
            <span>Escuchando... di un producto o pregunta por tu stock.</span>
            <button
              type="button"
              onClick={stopVoiceSearch}
              className="min-h-[34px] shrink-0 rounded-lg bg-[#1D4ED8] px-3 text-xs font-semibold text-white hover:bg-[#1E40AF]"
            >
              Detener
            </button>
          </div>
        )}

        {voiceError && (
          <div
            role="alert"
            className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-sm font-medium text-[#B91C1C]"
          >
            {voiceError}
          </div>
        )}

        {voiceResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-[#0F172A] sm:text-lg">
                {voiceResult.headline}
              </p>
              <p className="mt-0.5 text-xs font-medium text-[#64748B] sm:text-sm">
                {voiceResult.detail}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {voiceResult.kind === "not_found" && voiceResult.unmatchedTerm && (
                <button
                  type="button"
                  onClick={() =>
                    openAddManualModal(voiceResult.unmatchedTerm ?? "")
                  }
                  className="min-h-[38px] rounded-xl bg-[#1D4ED8] px-3 font-display text-xs font-semibold text-white hover:bg-[#1E40AF] sm:text-sm"
                >
                  + Agregar “{voiceResult.unmatchedTerm}”
                </button>
              )}
              <button
                type="button"
                onClick={clearSearchAndVoice}
                className="min-h-[38px] rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] sm:text-sm"
              >
                Limpiar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Segmented control por estado */}
      <div
        className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-[#E2E8F0] p-1 sm:grid-cols-4"
        role="tablist"
        aria-label="Filtrar productos por estado"
      >
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          onClick={() => setFilter("all")}
          className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:px-3 sm:text-sm ${
            filter === "all"
              ? "bg-white text-[#0F172A] shadow-xs"
              : "text-[#475569] hover:text-[#0F172A]"
          }`}
        >
          Todos ({products.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === "red"}
          onClick={() => setFilter("red")}
          className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:gap-2 sm:px-3 sm:text-sm ${
            filter === "red"
              ? "bg-white text-[#0F172A] shadow-xs"
              : "text-[#475569] hover:text-[#0F172A]"
          }`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#DC2626]"
            aria-hidden="true"
          />
          Agotado ({redCount})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === "yellow"}
          onClick={() => setFilter("yellow")}
          className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:gap-2 sm:px-3 sm:text-sm ${
            filter === "yellow"
              ? "bg-white text-[#0F172A] shadow-xs"
              : "text-[#475569] hover:text-[#0F172A]"
          }`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D97706]"
            aria-hidden="true"
          />
          Queda poco ({yellowCount})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === "green"}
          onClick={() => setFilter("green")}
          className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:gap-2 sm:px-3 sm:text-sm ${
            filter === "green"
              ? "bg-white text-[#0F172A] shadow-xs"
              : "text-[#475569] hover:text-[#0F172A]"
          }`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#16A34A]"
            aria-hidden="true"
          />
          Suficiente ({greenCount})
        </button>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="font-display text-lg font-bold text-[#0F172A]">
            {hasActiveFilter
              ? "No hay productos que coincidan con esta búsqueda"
              : "Aún no tienes productos en tu inventario"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearSearchAndVoice}
                className="min-h-[46px] rounded-xl bg-[#0F172A] px-5 font-display text-sm font-semibold text-white"
              >
                Ver todos los productos
              </button>
            )}
            <button
              type="button"
              onClick={() => openAddManualModal(searchText.trim())}
              className="min-h-[46px] rounded-xl bg-[#1D4ED8] px-5 font-display text-sm font-semibold text-white"
            >
              + Agregar producto
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => {
            const status = getStockStatus(product);
            const meta = STATUS_META[status];
            const singular = getSingularUnit(product.unit);

            return (
              <article
                key={product.id}
                className="flex flex-col justify-between rounded-2xl border border-[#CBD5E1] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display min-w-0 break-words text-xl font-bold leading-snug text-[#0F172A]">
                      {product.name}
                    </h2>

                    <button
                      type="button"
                      onClick={() => openEditModal(product)}
                      aria-label={`Editar ${product.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] transition-colors hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClass}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-xs font-semibold whitespace-nowrap sm:text-sm ${meta.textClass}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-[#94A3B8]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs font-medium text-[#64748B] tabular-nums sm:text-sm">
                      {formatBalboas(product.pricePerUnit)} / {singular}
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-extrabold text-[#0F172A] tabular-nums">
                      {formatQuantity(product.quantity)}
                    </span>
                    <span className="text-base font-medium text-[#64748B]">
                      {product.unit}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => openAdjust(product, "add")}
                    className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-3 py-2.5 font-display text-base font-semibold text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Agregar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openAdjust(product, "remove")}
                    className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 font-display text-base font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] active:scale-[0.98]"
                  >
                    <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Quitar</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <StockAdjustSheet
        product={selectedProduct}
        mode={adjustMode}
        onClose={closeAdjust}
        onConfirm={(prod, mode, amount, recordAsSale) => {
          onAdjustStock(prod, mode, amount, recordAsSale);
          closeAdjust();
        }}
      />

      <AddProductModal
        open={showProductModal}
        editingProduct={editingProduct}
        initialName={prefillNewName}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
        }}
        onCreate={(data) => {
          onAddProduct(data);
          setShowProductModal(false);
          clearSearchAndVoice();
        }}
        onUpdate={(updated) => {
          onUpdateProduct(updated);
          setShowProductModal(false);
          setEditingProduct(null);
        }}
        onDelete={(productId) => {
          onDeleteProduct(productId);
          setShowProductModal(false);
          setEditingProduct(null);
        }}
      />
    </div>
  );
}
