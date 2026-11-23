import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CatalogItemInput {
  id: string;
  name: string;
  unit: string;
  pricePerUnit: number;
}

interface VoiceParseRequestBody {
  audioBase64?: string;
  mimeType?: string;
  mode?: "sale" | "entry";
  catalog?: CatalogItemInput[];
}

interface ParsedVoiceItem {
  matchedProductId: string;
  productName: string;
  quantity: number;
  unit: string;
  amountBalboas: number;
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_GEMINI_API_KEY");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function normalizeMimeType(rawMime?: string): string {
  if (!rawMime || typeof rawMime !== "string") {
    return "audio/webm";
  }
  const base = rawMime.split(";")[0].trim().toLowerCase();
  if (
    base === "audio/webm" ||
    base === "audio/mp4" ||
    base === "audio/mpeg" ||
    base === "audio/mp3" ||
    base === "audio/wav" ||
    base === "audio/ogg" ||
    base === "audio/aac"
  ) {
    return base;
  }
  return "audio/webm";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("DEADLINE_EXCEEDED") ||
    msg.includes("ECONNRESET")
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        await sleep(attempt * 500);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

const VOICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description:
        "Transcripción literal en español de lo escuchado en el audio, o cadena vacía si no hay voz clara.",
    },
    items: {
      type: Type.ARRAY,
      description: "Lista de productos extraídos del dictado de voz.",
      items: {
        type: Type.OBJECT,
        properties: {
          matchedProductId: {
            type: Type.STRING,
            description:
              "ID del producto del catálogo si coincide, o cadena vacía '' si es nuevo.",
          },
          productName: {
            type: Type.STRING,
            description: "Nombre claro del producto en español.",
          },
          quantity: {
            type: Type.NUMBER,
            description: "Cantidad numérica mayor que 0.",
          },
          unit: {
            type: Type.STRING,
            description:
              "Unidad de medida: libras, unidades, racimos, sacos, docenas, mazos, cartones, etc.",
          },
          amountBalboas: {
            type: Type.NUMBER,
            description:
              "Monto total en balboas (B/.) para este renglón, 0 si no aplica.",
          },
        },
        required: [
          "matchedProductId",
          "productName",
          "quantity",
          "unit",
          "amountBalboas",
        ],
      },
    },
  },
  required: ["transcript", "items"],
};

const ITEMS_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: VOICE_RESPONSE_SCHEMA.properties.items,
  },
  required: ["items"],
};

let hydrogenCooldownUntil = 0;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  app.post("/api/voice/parse", async (req, res) => {
    try {
      const body = req.body as VoiceParseRequestBody;
      const audioBase64 = body?.audioBase64?.trim();
      const mode = body?.mode === "entry" ? "entry" : "sale";
      const catalog = Array.isArray(body?.catalog) ? body.catalog : [];
      const cleanMimeType = normalizeMimeType(body?.mimeType);

      if (!audioBase64) {
        res.status(400).json({
          error: "No se recibió el audio. Intenta grabar de nuevo.",
        });
        return;
      }

      const ai = getGenAIClient();

      const catalogSummary = catalog
        .map(
          (item) =>
            `- id: "${item.id}", nombre: "${item.name}", unidad: "${item.unit}", precioUnitario: ${item.pricePerUnit}`
        )
        .join("\n");

      const actionLabel =
        mode === "sale"
          ? "una VENTA (productos que vendió)"
          : "una ENTRADA de mercancía (productos que llegaron al puesto)";

      const audioInstructions = `Eres un asistente de transcripción literal para un vendedor del Mercado Público de Penonomé en Panamá.
Escucha el audio adjunto y transcribe SOLO las palabras reales pronunciadas por una persona en el audio. El vendedor está dictando ${actionLabel}.

Catálogo actual de la tienda:
${catalogSummary || "(Catálogo vacío)"}

Reglas estrictas:
1. Si NO escuchas voz humana clara (solo silencio, respiración, golpes o ruido ambiente), responde OBLIGATORIAMENTE con "transcript": "" y "items": []. NUNCA inventes ni supongas productos que no se dijeron en el audio.
2. Si escuchas palabras claras, escribe la transcripción literal en "transcript".
3. Extrae cada producto realmente mencionado en "items" con su cantidad numérica, unidad y monto total en balboas (B/. o dólares).
4. Si el producto coincide con uno del catálogo (singular/plural, sin tildes o nombre parecido), usa el "id" exacto en matchedProductId, el nombre oficial del catálogo en productName, y su unidad si el vendedor no dijo otra.
5. Si no está en el catálogo, deja matchedProductId como "" y escribe el productName limpio con inicial mayúscula.
6. Si dijo un monto total para ese producto, ponlo en amountBalboas. Si es venta y NO dijo monto, calcula cantidad * precioUnitario del catálogo si existe; si es entrada y no dijo monto, pon 0.
7. Convierte números hablados ("cinco", "media libra" = 0.5, "un par" = 2, "dos docenas" = 2) a números mayores que 0.`;

      const audioPart = {
        inlineData: {
          mimeType: cleanMimeType,
          data: audioBase64,
        },
      };

      let transcript = "";
      let rawItems: ParsedVoiceItem[] = [];

      // Primary path: try gemini-4-hydrogen if not in quota cooldown
      let succeeded = false;
      if (Date.now() >= hydrogenCooldownUntil) {
        try {
          const resHydrogen = await ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents: [
              {
                role: "user",
                parts: [audioPart, { text: audioInstructions }],
              },
            ],
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: "application/json",
              responseSchema: VOICE_RESPONSE_SCHEMA,
            },
          });

          const parsed = JSON.parse(
            (resHydrogen.text ?? '{"transcript":"","items":[]}').trim()
          ) as { transcript?: string; items?: ParsedVoiceItem[] };

          transcript =
            typeof parsed.transcript === "string"
              ? parsed.transcript.trim()
              : "";
          rawItems = Array.isArray(parsed.items) ? parsed.items : [];
          succeeded = true;
        } catch (primaryErr) {
          const msg =
            primaryErr instanceof Error
              ? primaryErr.message
              : String(primaryErr);
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
            hydrogenCooldownUntil = Date.now() + 60 * 60 * 1000;
          }
        }
      }

      // Fallback: gemini-3.1-flash-lite direct audio + structured output with retry on transient 503
      if (!succeeded) {
        const liteAudioRes = await withRetry(
          () =>
            ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: [
                {
                  role: "user",
                  parts: [audioPart, { text: audioInstructions }],
                },
              ],
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                responseMimeType: "application/json",
                responseSchema: VOICE_RESPONSE_SCHEMA,
              },
            }),
          3
        );
        const parsed = JSON.parse(
          (liteAudioRes.text ?? '{"transcript":"","items":[]}').trim()
        ) as { transcript?: string; items?: ParsedVoiceItem[] };
        transcript =
          typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
        rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        succeeded = true;
      }

      const safeItems = rawItems
        .filter(
          (item) =>
            item &&
            typeof item.productName === "string" &&
            item.productName.trim().length > 0
        )
        .map((item) => ({
          matchedProductId:
            typeof item.matchedProductId === "string"
              ? item.matchedProductId.trim()
              : "",
          productName: item.productName.trim(),
          quantity:
            typeof item.quantity === "number" && item.quantity > 0
              ? Math.round(item.quantity * 100) / 100
              : 1,
          unit:
            typeof item.unit === "string" && item.unit.trim().length > 0
              ? item.unit.trim()
              : "unidades",
          amountBalboas:
            typeof item.amountBalboas === "number" && item.amountBalboas >= 0
              ? Math.round(item.amountBalboas * 100) / 100
              : 0,
        }));

      if (!transcript && safeItems.length === 0) {
        res.status(422).json({
          error:
            "No logré escuchar palabras claras. Mantén presionado el botón y habla cerca del micrófono.",
        });
        return;
      }

      res.json({
        transcript,
        items: safeItems,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.error("Voice parse error:", message);

      if (message === "MISSING_GEMINI_API_KEY") {
        res.status(500).json({
          error:
            "Falta configurar la clave de Gemini en Settings > Secrets para usar el dictado por voz.",
        });
        return;
      }

      if (
        message.includes("PERMISSION_DENIED") ||
        message.includes("API_KEY_INVALID") ||
        message.includes("403")
      ) {
        res.status(403).json({
          error:
            "La clave de Gemini no es válida o no tiene permisos. Revisa Settings > Secrets.",
        });
        return;
      }

      if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
        res.status(429).json({
          error:
            "Se alcanzó el límite de uso gratuito de voz por hoy. Puedes seleccionar una clave con facturación en Settings > Secrets o agregar los productos manualmente.",
        });
        return;
      }

      if (isTransientError(error)) {
        res.status(503).json({
          error:
            "El servicio de voz está muy ocupado ahorita. Espera unos segundos e intenta otra vez.",
        });
        return;
      }

      res.status(500).json({
        error:
          "No se pudo procesar el audio en este momento. Intenta hablar más claro o agrégalo manualmente.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mi tienda server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
