export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

export interface SpeechRecognitionLike extends EventTarget {
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

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export const SPEECH_LANG_FALLBACKS = ["es-PA", "es-419", "es-ES", "es"] as const;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const touchPoints =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  return Boolean(coarse || touchPoints);
}

/**
 * Combines Web Speech API results while preventing Android Chrome's common
 * cumulative duplicate-segment bug when multiple result entries overlap.
 */
export function extractSpeechTranscript(
  results: SpeechRecognitionEventLike["results"]
): { finalText: string; interimText: string; combinedText: string } {
  const finalSegments: string[] = [];
  let interimText = "";

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const raw = (res?.[0]?.transcript ?? "").replace(/\s+/g, " ").trim();
    if (!raw) continue;

    if (res.isFinal) {
      const last = finalSegments[finalSegments.length - 1];
      if (!last) {
        finalSegments.push(raw);
      } else {
        const rawLower = raw.toLowerCase();
        const lastLower = last.toLowerCase();
        if (rawLower === lastLower) {
          continue;
        }
        // Android Chrome sometimes emits an expanded final segment containing the previous one
        if (rawLower.startsWith(lastLower)) {
          finalSegments[finalSegments.length - 1] = raw;
        } else if (lastLower.endsWith(rawLower)) {
          continue;
        } else {
          finalSegments.push(raw);
        }
      }
    } else {
      interimText = `${interimText} ${raw}`.replace(/\s+/g, " ").trim();
    }
  }

  const finalText = finalSegments.join(" ").replace(/\s+/g, " ").trim();
  const combinedText = `${finalText} ${interimText}`.replace(/\s+/g, " ").trim();

  return { finalText, interimText, combinedText };
}

export function mapSpeechErrorMessage(errorCode: string): {
  message: string;
  shouldOfferTextFallback: boolean;
} {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        message:
          "No hay permiso para usar el micrófono. Actívalo en el navegador o escribe abajo.",
        shouldOfferTextFallback: true,
      };
    case "audio-capture":
      return {
        message:
          "No se detectó un micrófono disponible en este dispositivo. Puedes escribirlo abajo.",
        shouldOfferTextFallback: true,
      };
    case "no-speech":
      return {
        message:
          "No se escuchó voz clara. Acércate al micrófono y habla un poco más fuerte.",
        shouldOfferTextFallback: false,
      };
    case "network":
      return {
        message:
          "El reconocimiento de voz necesita conexión a internet en este navegador. También puedes escribirlo abajo.",
        shouldOfferTextFallback: true,
      };
    case "language-not-supported":
      return {
        message:
          "El idioma de dictado por voz no está disponible en este dispositivo. Puedes escribirlo abajo.",
        shouldOfferTextFallback: true,
      };
    default:
      return {
        message:
          "El dictado por voz del navegador no respondió. Puedes escribirlo abajo sin problema.",
        shouldOfferTextFallback: true,
      };
  }
}
