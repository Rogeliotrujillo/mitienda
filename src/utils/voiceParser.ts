import { Product, VoiceParsedItem } from "../types";
import { matchBestCatalogProduct, stripAccents } from "./catalogMatcher";

const SPANISH_NUMBERS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  media: 0.5,
  medio: 0.5,
  cuarto: 0.25,
};

const TENS_WORDS = new Set([
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
]);

const ONES_WORDS = new Set([
  "un",
  "uno",
  "una",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
]);

const UNIT_ALIASES: Record<string, string> = {
  libra: "libras",
  libras: "libras",
  lb: "libras",
  lbs: "libras",
  kilo: "kilos",
  kilos: "kilos",
  kilogramo: "kilos",
  kilogramos: "kilos",
  kg: "kilos",
  unidad: "unidades",
  unidades: "unidades",
  pieza: "unidades",
  piezas: "unidades",
  docena: "docenas",
  docenas: "docenas",
  saco: "sacos",
  sacos: "sacos",
  bulto: "sacos",
  bultos: "sacos",
  racimo: "racimos",
  racimos: "racimos",
  mazo: "mazos",
  mazos: "mazos",
  atado: "mazos",
  atados: "mazos",
  carton: "cartones",
  cartones: "cartones",
  caja: "cajas",
  cajas: "cajas",
  bolsa: "bolsas",
  bolsas: "bolsas",
  litro: "litros",
  litros: "litros",
  botella: "botellas",
  botellas: "botellas",
  paquete: "paquetes",
  paquetes: "paquetes",
  quintal: "quintales",
  quintales: "quintales",
  lata: "latas",
  latas: "latas",
  par: "pares",
  pares: "pares",
  mano: "manos",
  manos: "manos",
  cabeza: "cabezas",
  cabezas: "cabezas",
  bandeja: "bandejas",
  bandejas: "bandejas",
  canasta: "canastas",
  canastas: "canastas",
  galon: "galones",
  galones: "galones",
  vaso: "vasos",
  vasos: "vasos",
  plato: "platos",
  platos: "platos",
  porcion: "porciones",
  porciones: "porciones",
  tira: "tiras",
  tiras: "tiras",
  rollo: "rollos",
  rollos: "rollos",
};

const STOPWORDS = new Set([
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
  "al",
  "con",
  "en",
  "y",
  "e",
  "o",
  "a",
  "por",
  "para",
  "que",
]);

const NON_PRODUCT_WORDS = new Set([
  "cada",
  "uno",
  "una",
  "tiene",
  "tienen",
  "valor",
  "precio",
  "cuesta",
  "cuestan",
  "vale",
  "valen",
  "total",
  "son",
  "es",
  "razon",
  "usd",
  "dolar",
  "dolares",
  "balboa",
  "balboas",
  "peso",
  "pesos",
  "centavo",
  "centavos",
  "producto",
  "productos",
  "articulo",
  "articulos",
  "anade",
  "anadir",
  "agrega",
  "agregar",
  "anota",
  "anotar",
  "registra",
  "registrar",
  "ingresa",
  "ingresar",
  "mete",
  "meter",
  "pon",
  "poner",
  "quita",
  "quitar",
  "vendi",
  "vendimos",
  "entraron",
  "entro",
  "llegaron",
  "llego",
  "stock",
  "inventario",
]);

const ACTION_PREFIXES = [
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "quiero anadir",
  "quiero agregar",
  "quiero registrar",
  "quiero ingresar",
  "quiero meter",
  "necesito anadir",
  "necesito agregar",
  "se vendieron",
  "se vendio",
  "me compraron",
  "hoy vendi",
  "entrada de",
  "de entrada",
  "nueva entrada",
  "venta de",
  "ventas de",
  "anadimos",
  "anadieron",
  "anademe",
  "anadir",
  "anade",
  "anada",
  "agregamos",
  "agregaron",
  "agregame",
  "agregar",
  "agrega",
  "agregue",
  "anotamos",
  "anotaron",
  "anotame",
  "anotar",
  "anota",
  "anote",
  "registramos",
  "registraron",
  "registrame",
  "registrar",
  "registra",
  "registre",
  "ingresamos",
  "ingresaron",
  "ingresame",
  "ingresar",
  "ingresa",
  "ingrese",
  "ingreso",
  "metimos",
  "metieron",
  "meteme",
  "meter",
  "mete",
  "meta",
  "pusimos",
  "ponme",
  "poner",
  "ponga",
  "pon",
  "quitamos",
  "quitame",
  "quitar",
  "quita",
  "vendimos",
  "vendieron",
  "vendi",
  "vendio",
  "entraron",
  "entro",
  "llegaron",
  "llego",
  "recibimos",
  "recibieron",
  "recibi",
  "recibio",
  "compramos",
  "compraron",
  "compre",
  "compro",
  "trajimos",
  "trajeron",
  "traje",
  "trajo",
  "tenemos",
  "tengo",
  "hola",
  "hay",
].sort((a, b) => b.length - a.length);

function normalizeSpokenNumbers(text: string): string {
  const tokens = text.split(/\s+/);
  const converted: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    const next = tokens[i + 1];
    const next2 = tokens[i + 2];

    // Keep "cada uno" / "cada una" intact instead of turning "uno"/"una" into "1"
    if (curr === "cada" && (next === "uno" || next === "una")) {
      converted.push("cada", next);
      i += 1;
      continue;
    }

    // Keep "un valor" / "un par de" handled properly: "un valor" shouldn't turn "un" into quantity "1"
    if (curr === "un" && (next === "valor" || next === "precio")) {
      converted.push("un", next);
      i += 1;
      continue;
    }

    // e.g. "treinta y cinco"
    if (TENS_WORDS.has(curr) && next === "y" && next2 && ONES_WORDS.has(next2)) {
      const total = SPANISH_NUMBERS[curr] + SPANISH_NUMBERS[next2];
      converted.push(String(total));
      i += 2;
      continue;
    }

    // e.g. "dos y medio" or "2 y media" -> "2.5"
    const currNum =
      curr in SPANISH_NUMBERS
        ? SPANISH_NUMBERS[curr]
        : /^\d+(?:[.,]\d+)?$/.test(curr)
          ? Number(curr.replace(",", "."))
          : null;

    if (
      currNum !== null &&
      next === "y" &&
      (next2 === "medio" || next2 === "media")
    ) {
      converted.push(String(currNum + 0.5));
      i += 2;
      continue;
    }

    // e.g. "dos con cincuenta" or "3 con 50" -> "2.50" / "3.50"
    // If followed by "centavos" (e.g. "1 con 50 centavos"), emit "1.50 dolares"
    if (currNum !== null && next === "con" && next2) {
      const centsNum =
        next2 in SPANISH_NUMBERS
          ? SPANISH_NUMBERS[next2]
          : /^\d+$/.test(next2)
            ? Number(next2)
            : null;
      if (centsNum !== null && centsNum >= 0 && centsNum < 100) {
        const dec = centsNum < 10 && next2.length === 1 ? centsNum * 10 : centsNum;
        const next3 = tokens[i + 3];
        if (next3 && next3.startsWith("centavo")) {
          converted.push(`${currNum}.${String(dec).padStart(2, "0")}`, "dolares");
          i += 3;
          continue;
        }
        converted.push(`${currNum}.${String(dec).padStart(2, "0")}`);
        i += 2;
        continue;
      }
    }

    if (curr in SPANISH_NUMBERS) {
      converted.push(String(SPANISH_NUMBERS[curr]));
    } else {
      converted.push(curr);
    }
  }

  return converted.join(" ");
}

function stripLeadingActionVerbs(clause: string): string {
  let clean = clause.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ACTION_PREFIXES) {
      if (clean === prefix) {
        clean = "";
        changed = true;
        break;
      }
      if (clean.startsWith(prefix + " ")) {
        clean = clean.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return clean;
}

function matchProductFromCatalog(
  productWords: string[],
  catalog: Product[]
): Product | null {
  return matchBestCatalogProduct(productWords, catalog);
}

function toTitleCase(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function createTempId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const PER_UNIT_REGEX =
  /\b(?:cada\s+(?:uno|una|unidad|libra|kilo|saco|caja|bolsa|mazo|docena|racimo|carton|paquete|botella|litro|lata|quintal)|por\s+unidad)\b/i;

const PRICE_INTRO_PREFIX =
  "(?:(?:que\\s+)?(?:tienen?|cuestan?|valen?|salen?|son|es)\\s+)?(?:un\\s+)?(?:valor\\s+de|precio\\s+de|a\\s+razon\\s+de|a|por|en|de|total)";

interface ExtractedPriceInfo {
  remainingClause: string;
  explicitAmount: number | null;
  isPerUnit: boolean;
}

function extractPriceFromClause(clause: string): ExtractedPriceInfo {
  let working = clause;
  let explicitAmount: number | null = null;
  let isPerUnit = false;

  const hasExplicitTotal = /\b(?:en\s+total|por\s+todo|total)\b/i.test(working);

  if (PER_UNIT_REGEX.test(working)) {
    isPerUnit = true;
    working = working.replace(new RegExp(PER_UNIT_REGEX.source, "gi"), " ");
  }

  const dollarsAndCentsRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX}\\s+)?(\\d+)\\s*(?:balboas?|dolares?|pesos?)\\s*(?:con|y)\\s*(\\d+)\\s*centavos?\\b`,
    "i"
  );
  const centsOnlyRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX}\\s+)?(\\d+)\\s*centavos?\\b`,
    "i"
  );
  const currencyTwoPartRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX}\\s+)?(\\d+)\\s+([1-9]0|[1-9]5)\\s*(?:balboas?|dolares?|pesos?)\\b`,
    "i"
  );
  const currencyRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX}\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(?:balboas?|dolares?|pesos?)\\b`,
    "i"
  );
  const introTwoPartRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX})\\s+(\\d+)\\s+([1-9]0|[1-9]5)\\b`,
    "i"
  );
  const introSingleRegex = new RegExp(
    `\\b(?:${PRICE_INTRO_PREFIX})\\s+(\\d+(?:[.,]\\d+)?)\\b`,
    "i"
  );

  const dAndC = working.match(dollarsAndCentsRegex);
  const centsOnly = working.match(centsOnlyRegex);
  const curTwo = working.match(currencyTwoPartRegex);
  const curSingle = working.match(currencyRegex);
  const introTwo = working.match(introTwoPartRegex);
  const introSingle = working.match(introSingleRegex);

  let matchedSnippet = "";

  if (dAndC && dAndC[1] && dAndC[2]) {
    explicitAmount = Number(dAndC[1]) + Number(dAndC[2]) / 100;
    matchedSnippet = dAndC[0];
    working = working.replace(dAndC[0], " ");
  } else if (centsOnly && centsOnly[1]) {
    explicitAmount = Number(centsOnly[1]) / 100;
    matchedSnippet = centsOnly[0];
    working = working.replace(centsOnly[0], " ");
    // "a 50 centavos" (not "por 50 centavos" / "en 50 centavos" / "total") implies unit price when < 1
    if (!hasExplicitTotal && /^\s*a\s+\d+\s*centavos?/i.test(matchedSnippet)) {
      isPerUnit = true;
    }
  } else if (curTwo && curTwo[1] && curTwo[2]) {
    explicitAmount = Number(`${curTwo[1]}.${curTwo[2]}`);
    matchedSnippet = curTwo[0];
    working = working.replace(curTwo[0], " ");
  } else if (curSingle && curSingle[1]) {
    explicitAmount = Number(curSingle[1].replace(",", "."));
    matchedSnippet = curSingle[0];
    working = working.replace(curSingle[0], " ");
  } else if (introTwo && introTwo[1] && introTwo[2]) {
    const idx = introTwo.index ?? 0;
    if (idx > 0 || isPerUnit) {
      explicitAmount = Number(`${introTwo[1]}.${introTwo[2]}`);
      matchedSnippet = introTwo[0];
      working = working.replace(introTwo[0], " ");
    }
  } else if (introSingle && introSingle[1]) {
    const idx = introSingle.index ?? 0;
    const hasExplicitPriceVerb =
      /\b(?:valor|precio|cuestan?|valen?|total)\b/i.test(introSingle[0]);
    if (idx > 2 || isPerUnit || hasExplicitPriceVerb) {
      explicitAmount = Number(introSingle[1].replace(",", "."));
      matchedSnippet = introSingle[0];
      working = working.replace(introSingle[0], " ");
    }
  }

  // Plural verbs ("tienen un valor de", "valen", "cuestan") without "total" indicate per-unit pricing
  if (
    !hasExplicitTotal &&
    matchedSnippet &&
    /\b(?:tienen|cuestan|valen)\b/i.test(matchedSnippet)
  ) {
    isPerUnit = true;
  }

  return {
    remainingClause: working.replace(/\s+/g, " ").trim(),
    explicitAmount,
    isPerUnit,
  };
}

export function parseVoiceTranscript(
  rawTranscript: string,
  mode: "sale" | "entry",
  catalog: Product[]
): VoiceParsedItem[] {
  const cleanedDisplay = rawTranscript
    .replace(/\$/g, " dolares ")
    .replace(/b\/\./gi, " balboas ")
    .replace(/\busd\b/gi, " dolares ")
    .replace(/\bc\/u\b/gi, " cada uno ")
    .replace(/(\d)[.,](\d)/g, "$1__DEC__$2")
    .replace(/[.;!?]+/g, " , ")
    .replace(/__DEC__/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedRaw = stripAccents(cleanedDisplay);

  if (!cleanedRaw) return [];

  const withDigits = normalizeSpokenNumbers(cleanedRaw);

  // Split into clauses by commas or conjunctions (" y ", " tambien ", " ademas ", " luego ")
  const rawClauses = withDigits
    .split(/\s*(?:,|\by\b|\btambien\b|\bademas\b|\bluego\b)\s*/i)
    .map(stripLeadingActionVerbs)
    .filter((c) => c.length > 0);

  // Keep an accent-preserved token map so new products retain "ñ" and tildes (e.g. "Piñas")
  const displayWordByNormalized = new Map<string, string>();
  for (const rawWord of cleanedDisplay.split(/[\s,]+/)) {
    const cleanWord = rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!cleanWord) continue;
    const norm = stripAccents(cleanWord);
    if (norm && !displayWordByNormalized.has(norm)) {
      displayWordByNormalized.set(norm, cleanWord.toLowerCase());
    }
  }

  const parsedItems: VoiceParsedItem[] = [];

  for (const clause of rawClauses) {
    const { remainingClause, explicitAmount, isPerUnit } =
      extractPriceFromClause(clause);

    // 2. Extract quantity, unit, and product tokens from remaining text
    const tokens = remainingClause.split(/\s+/).filter(Boolean);

    let quantity = 1;
    let quantityFound = false;
    let spokenUnit: string | null = null;
    const productTokens: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!quantityFound && /^\d+(?:[.,]\d+)?$/.test(tok)) {
        const val = Number(tok.replace(",", "."));
        if (val > 0) {
          quantity = Math.round(val * 100) / 100;
          quantityFound = true;
          continue;
        }
      }

      if (!spokenUnit && tok in UNIT_ALIASES) {
        spokenUnit = UNIT_ALIASES[tok];
        continue;
      }

      if (STOPWORDS.has(tok) || NON_PRODUCT_WORDS.has(tok)) {
        continue;
      }

      if (!productTokens.includes(tok)) {
        productTokens.push(tok);
      }
    }

    // If this clause had a price/quantity/unit but NO product tokens, it modifies the previous item
    // e.g. "Añade 3 sombreros pintados, cada uno tiene un valor de 40 USD."
    // or "Sombreros pintados, 3 unidades, 40 dólares cada uno"
    if (productTokens.length === 0) {
      if (parsedItems.length > 0) {
        const prevItem = parsedItems[parsedItems.length - 1];
        if (quantityFound) {
          prevItem.quantity = quantity;
        }
        if (spokenUnit) {
          prevItem.unit = spokenUnit;
        }
        if (explicitAmount !== null) {
          const computed = isPerUnit
            ? explicitAmount * prevItem.quantity
            : explicitAmount;
          prevItem.amountBalboas = Math.round(computed * 100) / 100;
        }
      }
      continue;
    }

    // 3. Match keywords against existing stock catalog
    const matched = matchProductFromCatalog(productTokens, catalog);

    if (matched) {
      const resolvedUnit = spokenUnit ?? matched.unit;
      const resolvedAmount =
        explicitAmount !== null
          ? Math.round(
              (isPerUnit ? explicitAmount * quantity : explicitAmount) * 100
            ) / 100
          : mode === "sale"
            ? Math.round(quantity * matched.pricePerUnit * 100) / 100
            : 0;

      parsedItems.push({
        tempId: createTempId(),
        matchedProductId: matched.id,
        productName: matched.name,
        quantity,
        unit: resolvedUnit,
        amountBalboas: resolvedAmount,
      });
    } else {
      // New product not found in stock -> restore accents/ñ and add as new product
      const displayTokens = productTokens.map(
        (t) => displayWordByNormalized.get(t) ?? t
      );
      const newName = toTitleCase(displayTokens.join(" "));
      const resolvedAmount =
        explicitAmount !== null
          ? Math.round(
              (isPerUnit ? explicitAmount * quantity : explicitAmount) * 100
            ) / 100
          : 0;

      parsedItems.push({
        tempId: createTempId(),
        matchedProductId: "",
        productName: newName,
        quantity,
        unit: spokenUnit ?? "unidades",
        amountBalboas: resolvedAmount,
      });
    }
  }

  return parsedItems;
}
