import {
  Product,
  TrafficLightStatus,
  formatBalboas,
  formatQuantity,
  getStockStatus,
} from "../types";
import { rankCatalogMatches, stripAccents } from "./catalogMatcher";

export type InventoryQueryKind =
  | "available_count"
  | "low_stock"
  | "out_of_stock"
  | "product_match"
  | "not_found";

export interface InventoryQueryResult {
  kind: InventoryQueryKind;
  transcript: string;
  headline: string;
  detail: string;
  matchedProducts: Product[];
  suggestedFilter: "all" | TrafficLightStatus;
  unmatchedTerm?: string;
}

const QUERY_FILLER_WORDS = new Set([
  "hola",
  "dime",
  "decime",
  "cuanto",
  "cuanta",
  "cuantos",
  "cuantas",
  "cual",
  "cuales",
  "que",
  "donde",
  "como",
  "libra",
  "libras",
  "kilo",
  "kilos",
  "kilogramo",
  "kilogramos",
  "unidad",
  "unidades",
  "saco",
  "sacos",
  "mazo",
  "mazos",
  "docena",
  "docenas",
  "carton",
  "cartones",
  "caja",
  "cajas",
  "bolsa",
  "bolsas",
  "racimo",
  "racimos",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "me",
  "te",
  "se",
  "nos",
  "queda",
  "quedan",
  "tengo",
  "tienes",
  "tenemos",
  "hay",
  "esta",
  "estan",
  "disponible",
  "disponibles",
  "stock",
  "inventario",
  "tienda",
  "puesto",
  "producto",
  "productos",
  "buscar",
  "busca",
  "muestra",
  "muestrame",
  "ver",
  "por",
  "favor",
  "todavia",
  "aun",
  "en",
  "con",
]);

export function findMatchingCatalogProducts(
  queryText: string,
  catalog: Product[]
): Product[] {
  const normQuery = stripAccents(queryText).trim();
  if (!normQuery) return catalog;

  const queryTokens = normQuery
    .split(/[\s,?.!¡¿]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !QUERY_FILLER_WORDS.has(t));

  if (queryTokens.length === 0) return [];

  return rankCatalogMatches(queryTokens, catalog).map((entry) => entry.product);
}

function extractSearchPhrase(rawTranscript: string): string {
  const words = rawTranscript
    .replace(/[¿?¡!.,;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => {
    const norm = stripAccents(w);
    return norm.length >= 2 && !QUERY_FILLER_WORDS.has(norm);
  });

  return meaningful.join(" ");
}

function toTitleCase(text: string): string {
  const clean = text.trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function analyzeInventoryQuery(
  rawTranscript: string,
  products: Product[]
): InventoryQueryResult {
  const cleanTranscript = rawTranscript.trim();
  const norm = stripAccents(cleanTranscript);

  // 1. Check "se están agotando" / low stock BEFORE "agotaron"
  const asksLowStock =
    /\b(?:estan\s+agotando|esta\s+agotando|por\s+agotarse|queda\s+poco|quedan\s+pocos|poco\s+stock|bajo\s+stock|en\s+amarillo)\b/.test(
      norm
    );

  if (asksLowStock) {
    const lowProducts = products.filter((p) => getStockStatus(p) === "yellow");
    return {
      kind: "low_stock",
      transcript: cleanTranscript,
      headline:
        lowProducts.length === 0
          ? "Ningún producto se está agotando ahora"
          : `${lowProducts.length} ${lowProducts.length === 1 ? "producto se está agotando" : "productos se están agotando"}`,
      detail:
        lowProducts.length === 0
          ? "No tienes productos en amarillo en este momento."
          : lowProducts
              .map(
                (p) => `${p.name} (${formatQuantity(p.quantity)} ${p.unit})`
              )
              .join(" · "),
      matchedProducts: lowProducts,
      suggestedFilter: "yellow",
    };
  }

  // 2. Check out of stock: "cuáles productos se agotaron" / "cuántos agotados"
  const asksOutOfStock =
    /\b(?:se\s+agotaron|se\s+agoto|agotado|agotados|se\s+acabo|se\s+acabaron|sin\s+stock|en\s+rojo|cero\s+stock)\b/.test(
      norm
    );

  if (asksOutOfStock) {
    const redProducts = products.filter((p) => getStockStatus(p) === "red");
    return {
      kind: "out_of_stock",
      transcript: cleanTranscript,
      headline:
        redProducts.length === 0
          ? "No tienes productos agotados"
          : `${redProducts.length} ${redProducts.length === 1 ? "producto agotado" : "productos agotados"}`,
      detail:
        redProducts.length === 0
          ? "Todos tus productos tienen al menos 1 unidad en stock."
          : redProducts.map((p) => p.name).join(" · "),
      matchedProducts: redProducts,
      suggestedFilter: "red",
    };
  }

  // Extract remaining meaningful product words
  const searchPhrase = extractSearchPhrase(cleanTranscript);

  // 3. Check general availability query when no specific product term was requested
  const asksAvailableCount =
    /\b(?:cuantos\s+productos|productos\s+disponibles|tengo\s+disponible|productos\s+tengo|que\s+tengo\s+disponible|cuantos\s+tengo|productos\s+hay)\b/.test(
      norm
    );

  if (asksAvailableCount && searchPhrase.length === 0) {
    const availableProducts = products.filter((p) => p.quantity > 0);
    const greenCount = availableProducts.filter(
      (p) => getStockStatus(p) === "green"
    ).length;
    const yellowCount = availableProducts.filter(
      (p) => getStockStatus(p) === "yellow"
    ).length;

    return {
      kind: "available_count",
      transcript: cleanTranscript,
      headline: `Tienes ${availableProducts.length} ${availableProducts.length === 1 ? "producto disponible" : "productos disponibles"}`,
      detail: `${greenCount} con stock suficiente y ${yellowCount} con poco stock (de ${products.length} registrados).`,
      matchedProducts: availableProducts,
      suggestedFilter: "all",
    };
  }

  // 4. Product-specific lookup ("cuántas libras de yuca me quedan", "tomate", etc.)
  const matches = findMatchingCatalogProducts(searchPhrase || norm, products);

  if (matches.length === 1) {
    const item = matches[0];
    const status = getStockStatus(item);
    const statusText =
      status === "red"
        ? "Agotado"
        : status === "yellow"
          ? "Queda poco"
          : "Suficiente";

    return {
      kind: "product_match",
      transcript: cleanTranscript,
      headline:
        item.quantity <= 0
          ? `${item.name}: agotado (0 ${item.unit})`
          : `${item.name}: te quedan ${formatQuantity(item.quantity)} ${item.unit}`,
      detail: `Estado: ${statusText} · Precio: ${formatBalboas(item.pricePerUnit)} / ${item.unit}`,
      matchedProducts: matches,
      suggestedFilter: "all",
    };
  }

  if (matches.length > 1) {
    return {
      kind: "product_match",
      transcript: cleanTranscript,
      headline: `Encontré ${matches.length} productos relacionados`,
      detail: matches
        .slice(0, 4)
        .map((p) => `${p.name}: ${formatQuantity(p.quantity)} ${p.unit}`)
        .join(" · "),
      matchedProducts: matches,
      suggestedFilter: "all",
    };
  }

  const fallbackTerm = searchPhrase || cleanTranscript;
  return {
    kind: "not_found",
    transcript: cleanTranscript,
    headline: `No encontré "${toTitleCase(fallbackTerm)}" en tu stock`,
    detail:
      "Puedes agregarlo manualmente o con el micrófono usando los botones de arriba.",
    matchedProducts: [],
    suggestedFilter: "all",
    unmatchedTerm: toTitleCase(fallbackTerm),
  };
}
