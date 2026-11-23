import { useEffect, useRef, useState } from "react";
import {
  Check,
  Mic,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Product,
  VoiceParsedItem,
  formatBalboas,
  formatQuantity,
} from "../types";
import { parseVoiceTranscript } from "../utils/voiceParser";

interface VoiceScreenProps {
  mode: "sale" | "entry";
  products: Product[];
  onSaveItems: (mode: "sale" | "entry", items: VoiceParsedItem[]) => void;
  onCancel: () => void;
}

type VoiceStage = "ready" | "recording" | "confirm";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function createTempId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function VoiceScreen({
  mode,
  products,
  onSaveItems,
  onCancel,
}: VoiceScreenProps) {
  const [stage, setStage] = useState<VoiceStage>("ready");
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [speechDetected, setSpeechDetected] = useState<boolean>(false);
  const [liveText, setLiveText] = useState<string>("");
  const [manualText, setManualText] = useState<string>("");
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [items, setItems] = useState<VoiceParsedItem[]>([]);
  const [editingItem, setEditingItem] = useState<VoiceParsedItem | null>(null);
  const [batchKey, setBatchKey] = useState<number>(0);

  const isHoldingRef = useRef<boolean>(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const finalizeTimeoutRef = useRef<number | null>(null);

  const isSale = mode === "sale";
  const title = isSale ? "Dictar ventas" : "Dictar entrada";
  const exampleText = isSale
    ? 'Di por ejemplo: "Vendí 5 libras de tomate a 6 balboas y 10 plátanos"'
    : 'Di por ejemplo: "Entraron 20 libras de yuca y 4 sacos de papa"';

  const speechSupported = getSpeechRecognitionCtor() !== null;

  const micIdleClass = isSale
    ? "bg-[#1D4ED8] hover:bg-[#1E40AF] shadow-[0_10px_28px_rgba(29,78,216,0.28)]"
    : "bg-[#0F172A] hover:bg-[#1E293B] shadow-[0_10px_28px_rgba(15,23,42,0.24)]";
  const micRingClass = isSale ? "bg-[#1D4ED8]/10" : "bg-[#0F172A]/10";

  const clearTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (finalizeTimeoutRef.current !== null) {
      window.clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimers();
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const processTranscriptText = (rawText: string) => {
    const clean = rawText.trim();
    if (!clean) {
      setErrorMsg(
        "No se escuchó texto claro. Mantén presionado el botón mientras hablas."
      );
      setStage(items.length > 0 ? "confirm" : "ready");
      return;
    }

    const parsed = parseVoiceTranscript(clean, mode, products);
    setTranscript(clean);

    if (parsed.length === 0) {
      setErrorMsg(
        `Escuché "${clean}", pero no reconocí productos o cantidades. Intenta mencionar cantidad y producto (ej. "5 libras de tomate").`
      );
      setStage(items.length > 0 ? "confirm" : "ready");
      return;
    }

    setErrorMsg(null);
    setItems(parsed);
    setBatchKey((k) => k + 1);
    setStage("confirm");
  };

  const finishRecording = () => {
    clearTimers();
    const durationMs = Date.now() - startTimeRef.current;
    const combined = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`
      .replace(/\s+/g, " ")
      .trim();

    setSpeechDetected(false);

    if (durationMs < 350 && !combined) {
      setErrorMsg(
        "Mantén el botón presionado mientras hablas y suéltalo al terminar."
      );
      setStage(items.length > 0 ? "confirm" : "ready");
      return;
    }

    processTranscriptText(combined);
  };

  const startRecording = (
    pointerId?: number,
    target?: HTMLButtonElement
  ) => {
    if (isHoldingRef.current) return;

    if (pointerId !== undefined && target) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Ignore if unavailable
      }
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor) {
      setShowTextInput(true);
      setErrorMsg(
        "Este navegador no incluye dictado directo por micrófono. Escribe abajo lo que vendiste o recibiste."
      );
      return;
    }

    clearTimers();
    try {
      recognitionRef.current?.abort();
    } catch {
      // Ignore
    }

    isHoldingRef.current = true;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setLiveText("");
    setErrorMsg(null);
    setElapsedSec(0);
    setSpeechDetected(false);

    const recognition = new SpeechCtor();
    recognition.lang = "es-PA";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let ended = false;

    recognition.onspeechstart = () => {
      setSpeechDetected(true);
    };

    recognition.onresult = (event) => {
      let finals = "";
      let interims = "";
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finals += txt + " ";
        } else {
          interims += txt + " ";
        }
      }
      finalTranscriptRef.current = finals.trim();
      interimTranscriptRef.current = interims.trim();
      const preview = `${finals} ${interims}`.replace(/\s+/g, " ").trim();
      setLiveText(preview);
      if (preview) {
        setSpeechDetected(true);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || !isHoldingRef.current) return;
      isHoldingRef.current = false;
      clearTimers();
      setSpeechDetected(false);

      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setShowTextInput(true);
        setErrorMsg(
          "No hay permiso para usar el micrófono. Actívalo en el navegador o escríbelo abajo."
        );
      } else if (event.error === "no-speech") {
        setErrorMsg(
          "No se detectó voz. Acércate al micrófono y mantén presionado mientras hablas."
        );
      } else {
        setShowTextInput(true);
        setErrorMsg(
          "El dictado por voz del navegador no respondió. Puedes escribirlo abajo sin límites."
        );
      }
      setStage(items.length > 0 ? "confirm" : "ready");
    };

    recognition.onend = () => {
      if (ended) return;
      ended = true;
      if (!isHoldingRef.current) {
        finishRecording();
      }
    };

    try {
      startTimeRef.current = Date.now();
      recognition.start();
      setStage("recording");
      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(sec);
      }, 200);
    } catch {
      isHoldingRef.current = false;
      setShowTextInput(true);
      setErrorMsg(
        "No se pudo iniciar el micrófono. Escribe abajo los productos para procesarlos."
      );
      setStage(items.length > 0 ? "confirm" : "ready");
    }
  };

  const stopHolding = () => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;

    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        finishRecording();
        return;
      }
      // Safety timeout in case browser doesn't fire onend promptly
      finalizeTimeoutRef.current = window.setTimeout(() => {
        finishRecording();
      }, 500);
    } else {
      finishRecording();
    }
  };

  const handleManualTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    processTranscriptText(manualText);
  };

  const handleOpenNewItem = () => {
    const first = products[0];
    setEditingItem({
      tempId: createTempId(),
      matchedProductId: first ? first.id : "",
      productName: first ? first.name : "Producto nuevo",
      quantity: 1,
      unit: first ? first.unit : "libras",
      amountBalboas: first && isSale ? first.pricePerUnit : 0,
    });
  };

  const handleSaveEditedItem = (updated: VoiceParsedItem) => {
    setItems((prev) => {
      const exists = prev.some((row) => row.tempId === updated.tempId);
      if (exists) {
        return prev.map((row) =>
          row.tempId === updated.tempId ? updated : row
        );
      }
      return [...prev, updated];
    });
    setEditingItem(null);
    if (stage !== "confirm") {
      setBatchKey((k) => k + 1);
      setStage("confirm");
    }
  };

  const handleDeleteEditedItem = (tempId: string) => {
    setItems((prev) => {
      const next = prev.filter((row) => row.tempId !== tempId);
      if (next.length === 0) {
        setStage("ready");
      }
      return next;
    });
    setEditingItem(null);
  };

  const totalBalboas = items.reduce(
    (sum, item) => sum + (Number(item.amountBalboas) || 0),
    0
  );

  const formattedElapsed = `0:${String(elapsedSec).padStart(2, "0")}`;
  const isConfirming = stage === "confirm";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Zona del micrófono */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className={`flex flex-col items-center rounded-2xl border border-[#CBD5E1] bg-white text-center shadow-[0_1px_3px_rgba(15,23,42,0.05)] ${
          isConfirming ? "p-4 sm:p-5" : "p-6 sm:p-10"
        }`}
      >
        {!isConfirming && (
          <>
            <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
              {title}
            </h2>
            <p className="mt-1.5 max-w-md text-sm font-medium text-[#64748B] sm:text-base">
              {exampleText}
            </p>
          </>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 w-full max-w-lg rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-left text-sm font-medium text-[#B91C1C] sm:text-base"
          >
            {errorMsg}
          </div>
        )}

        {/* Botón de micrófono */}
        <div
          className={`flex flex-col items-center ${
            isConfirming ? "my-1 w-full flex-row gap-4 sm:gap-5" : "my-8"
          }`}
        >
          <div className="relative flex items-center justify-center">
            {stage === "recording" && (
              <>
                <motion.div
                  aria-hidden="true"
                  animate={{
                    scale: speechDetected ? [1, 1.24, 1] : [1, 1.12, 1],
                    opacity: [0.35, 0.12, 0.35],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: speechDetected ? 0.85 : 1.4,
                    ease: "easeInOut",
                  }}
                  className="pointer-events-none absolute -inset-4 rounded-full bg-[#DC2626]/20"
                />
              </>
            )}

            {stage === "ready" && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-3 rounded-full ${micRingClass}`}
              />
            )}

            <motion.button
              type="button"
              layout
              whileTap={{ scale: 0.96 }}
              onPointerDown={(e) => {
                e.preventDefault();
                startRecording(e.pointerId, e.currentTarget);
              }}
              onPointerUp={stopHolding}
              onPointerCancel={stopHolding}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  startRecording();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  stopHolding();
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative flex select-none touch-none flex-col items-center justify-center rounded-full text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1D4ED8] ${
                isConfirming
                  ? `h-14 w-14 shrink-0 ${micIdleClass}`
                  : stage === "recording"
                    ? "h-40 w-40 bg-[#DC2626] shadow-[0_12px_30px_rgba(220,38,38,0.3)] sm:h-44 sm:w-44"
                    : `h-40 w-40 ${micIdleClass} sm:h-44 sm:w-44`
              }`}
              aria-label={
                stage === "recording"
                  ? "Grabando voz, suelta para terminar"
                  : "Mantén presionado para dictar"
              }
            >
              <Mic
                className={isConfirming ? "h-6 w-6" : "h-12 w-12"}
                aria-hidden="true"
              />
              {!isConfirming && (
                <span className="font-display mt-2 text-base font-bold tabular-nums">
                  {stage === "recording" ? formattedElapsed : "Mantén pulsado"}
                </span>
              )}
            </motion.button>
          </div>

          {isConfirming ? (
            <div className="min-w-0 flex-1 text-left">
              <p className="font-display text-base font-bold text-[#0F172A] sm:text-lg">
                {items.length}{" "}
                {items.length === 1
                  ? "producto detectado"
                  : "productos detectados"}
              </p>
              {transcript ? (
                <p className="truncate text-sm text-[#64748B]">
                  “{transcript}”
                </p>
              ) : (
                <p className="text-sm text-[#64748B]">
                  Mantén el micrófono para dictar de nuevo
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              <p className="font-display text-base font-semibold text-[#0F172A] sm:text-lg">
                {stage === "recording"
                  ? speechDetected
                    ? "Escuchando... suelta al terminar"
                    : "Habla ahora cerca del micrófono..."
                  : "Mantén presionado el botón mientras hablas"}
              </p>
              {stage === "recording" && liveText && (
                <p className="mx-auto max-w-md rounded-xl bg-[#F8FAFC] px-3.5 py-2 text-sm font-medium text-[#334155]">
                  “{liveText}”
                </p>
              )}
            </div>
          )}
        </div>

        {!isConfirming && (
          <div className="mt-2 flex flex-col items-center gap-3 w-full max-w-lg">
            {(showTextInput || !speechSupported) && (
              <form
                onSubmit={handleManualTextSubmit}
                className="flex w-full gap-2 pt-2"
              >
                <input
                  type="text"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder={
                    isSale
                      ? "Ej: 5 libras de tomate a 6 balboas"
                      : "Ej: 20 libras de yuca y 4 sacos de papa"
                  }
                  className="min-h-[48px] flex-1 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-base font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[48px] rounded-xl bg-[#0F172A] px-4 font-display text-sm font-semibold text-white hover:bg-[#1E293B]"
                >
                  Procesar
                </button>
              </form>
            )}

            <div className="flex flex-wrap items-center justify-center gap-4">
              {speechSupported && !showTextInput && (
                <button
                  type="button"
                  onClick={() => setShowTextInput(true)}
                  className="min-h-[44px] px-2 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
                >
                  Escribir frase
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenNewItem}
                className="min-h-[44px] px-2 text-sm font-semibold text-[#1D4ED8] hover:underline"
              >
                Agregar producto directo
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Cuadrícula animada desde el botón de micrófono */}
      <AnimatePresence mode="wait">
        {isConfirming && (
          <motion.div
            key={`grid-batch-${batchKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-5 space-y-5"
          >
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-[#475569] sm:text-base">
                Toca cualquier tarjeta para editar sus datos
              </p>
              <button
                type="button"
                onClick={() => {
                  setStage("ready");
                  setItems([]);
                  setTranscript("");
                  setErrorMsg(null);
                }}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Reiniciar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, idx) => (
                <motion.button
                  key={item.tempId}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.25, y: -110 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{
                    type: "spring",
                    stiffness: 290,
                    damping: 23,
                    delay: idx * 0.085,
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setEditingItem(item)}
                  className="group flex flex-col justify-between rounded-2xl border border-[#CBD5E1] bg-white p-5 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-colors hover:border-[#1D4ED8] hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display truncate text-lg font-bold text-[#0F172A] sm:text-xl">
                        {item.productName}
                      </h3>
                      {!item.matchedProductId && (
                        <p className="mt-0.5 text-xs font-semibold text-[#1D4ED8]">
                          Producto nuevo · se agregará al stock
                        </p>
                      )}
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#475569] transition-colors group-hover:bg-[#EFF6FF] group-hover:text-[#1D4ED8]">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-[#E2E8F0] pt-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-3xl font-extrabold text-[#0F172A] tabular-nums">
                        {formatQuantity(item.quantity)}
                      </span>
                      <span className="text-sm font-medium text-[#64748B]">
                        {item.unit}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-display block text-lg font-bold text-[#0F172A] tabular-nums">
                        {item.amountBalboas > 0
                          ? formatBalboas(item.amountBalboas)
                          : "—"}
                      </span>
                      {item.amountBalboas > 0 && item.quantity > 1 && (
                        <span className="block text-xs font-medium text-[#64748B] tabular-nums">
                          {formatBalboas(item.amountBalboas / item.quantity)} c/u
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}

              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: items.length * 0.085 + 0.05 }}
                onClick={handleOpenNewItem}
                className="flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#94A3B8] bg-white/70 p-5 text-[#0F172A] transition-colors hover:border-[#1D4ED8] hover:bg-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F1F5F9]">
                  <Plus className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
                </div>
                <span className="font-display text-sm font-semibold sm:text-base">
                  Agregar otro
                </span>
              </motion.button>
            </div>

            {/* Confirmación final */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.4, items.length * 0.085 + 0.1) }}
              className="rounded-2xl border border-[#CBD5E1] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
            >
              {isSale && (
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-base font-medium text-[#475569]">
                    Total de esta venta:
                  </span>
                  <span className="font-display text-2xl font-extrabold text-[#0F172A] tabular-nums sm:text-3xl">
                    {formatBalboas(totalBalboas)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="order-2 flex min-h-[50px] items-center justify-center rounded-xl border border-[#CBD5E1] bg-white font-display text-base font-semibold text-[#0F172A] hover:bg-[#F8FAFC] sm:order-1"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => onSaveItems(mode, items)}
                  className="order-1 flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#0F172A] font-display text-base font-semibold text-white transition-colors hover:bg-[#1E293B] disabled:bg-[#94A3B8] sm:order-2"
                >
                  <Check className="h-5 w-5" aria-hidden="true" />
                  <span>Guardar todo</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal limpio para editar un producto a la vez */}
      <AnimatePresence>
        {editingItem && (
          <VoiceItemEditorModal
            item={editingItem}
            products={products}
            isSale={isSale}
            isExisting={items.some((i) => i.tempId === editingItem.tempId)}
            onClose={() => setEditingItem(null)}
            onSave={handleSaveEditedItem}
            onDelete={handleDeleteEditedItem}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface VoiceItemEditorModalProps {
  item: VoiceParsedItem;
  products: Product[];
  isSale: boolean;
  isExisting: boolean;
  onClose: () => void;
  onSave: (item: VoiceParsedItem) => void;
  onDelete: (tempId: string) => void;
}

function VoiceItemEditorModal({
  item,
  products,
  isSale,
  isExisting,
  onClose,
  onSave,
  onDelete,
}: VoiceItemEditorModalProps) {
  const [draft, setDraft] = useState<VoiceParsedItem>(item);

  const handleSelectProduct = (productId: string) => {
    if (!productId) {
      setDraft((prev) => ({ ...prev, matchedProductId: "" }));
      return;
    }
    const found = products.find((p) => p.id === productId);
    if (!found) return;
    setDraft((prev) => ({
      ...prev,
      matchedProductId: found.id,
      productName: found.name,
      unit: found.unit,
      amountBalboas:
        isSale && prev.amountBalboas === 0
          ? Math.round(prev.quantity * found.pricePerUnit * 100) / 100
          : prev.amountBalboas,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.productName.trim() || draft.quantity <= 0) return;
    onSave({
      ...draft,
      productName: draft.productName.trim(),
      unit: draft.unit.trim() || "unidades",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-edit-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#CBD5E1] sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#64748B]">
              {isExisting ? "Editar producto" : "Nuevo producto"}
            </p>
            <h3
              id="voice-edit-title"
              className="font-display text-2xl font-bold text-[#0F172A]"
            >
              {draft.productName || "Producto"}
            </h3>
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
              htmlFor="edit-prod-select"
              className="mb-1.5 block text-sm font-medium text-[#475569]"
            >
              Producto
            </label>
            <select
              id="edit-prod-select"
              value={draft.matchedProductId}
              onChange={(e) => handleSelectProduct(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-base font-semibold text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
            >
              <option value="">Otro producto (nuevo)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
          </div>

          {!draft.matchedProductId && (
            <div>
              <label
                htmlFor="edit-prod-name"
                className="mb-1.5 block text-sm font-medium text-[#475569]"
              >
                Nombre del producto
              </label>
              <input
                id="edit-prod-name"
                type="text"
                value={draft.productName}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, productName: e.target.value }))
                }
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-base font-semibold text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="edit-prod-qty"
              className="mb-1.5 block text-sm font-medium text-[#475569]"
            >
              Cantidad
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    quantity: Math.max(
                      0.5,
                      Math.round((prev.quantity - 1) * 100) / 100
                    ),
                  }))
                }
                aria-label="Restar 1"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                <Minus className="h-5 w-5" />
              </button>
              <input
                id="edit-prod-qty"
                type="number"
                inputMode="decimal"
                min="0.1"
                step="any"
                value={draft.quantity}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    quantity: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-center font-display text-2xl font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    quantity: Math.round((prev.quantity + 1) * 100) / 100,
                  }))
                }
                aria-label="Sumar 1"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-prod-unit"
                className="mb-1.5 block text-sm font-medium text-[#475569]"
              >
                Unidad
              </label>
              <input
                id="edit-prod-unit"
                type="text"
                value={draft.unit}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, unit: e.target.value }))
                }
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 text-base font-semibold text-[#0F172A] focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-prod-amount"
                className="mb-1.5 block text-sm font-medium text-[#475569]"
              >
                Monto (B/.)
              </label>
              <input
                id="edit-prod-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.05"
                value={draft.amountBalboas}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    amountBalboas: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 font-display text-lg font-bold text-[#0F172A] tabular-nums focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            {isExisting && (
              <button
                type="button"
                onClick={() => onDelete(draft.tempId)}
                aria-label="Quitar producto"
                className="flex min-h-[50px] items-center justify-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 font-display text-base font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Quitar</span>
              </button>
            )}
            <button
              type="submit"
              className="flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 font-display text-base font-semibold text-white hover:bg-[#1E40AF]"
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              <span>Listo</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
