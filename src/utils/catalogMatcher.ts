import { Product } from "../types";

export const MATCHER_STOPWORDS = new Set([
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

const CONTRAST_MODIFIERS = new Set([
  "verde",
  "maduro",
  "madura",
  "amarillo",
  "amarilla",
  "blanco",
  "blanca",
  "rojo",
  "roja",
  "negro",
  "negra",
  "morado",
  "morada",
  "dulce",
  "picante",
]);

const GENERIC_FRESH_WORDS = new Set([
  "nuevo",
  "nueva",
  "fresco",
  "fresca",
  "grande",
  "pequeno",
  "pequena",
  "chico",
  "chica",
  "bueno",
  "buena",
]);

export function stripAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function singularizeSpanish(word: string): string {
  if (word.endsWith("ces") && word.length > 4) {
    return word.slice(0, -3) + "z";
  }
  if (word.endsWith("es") && word.length > 4) {
    const base = word.slice(0, -2);
    if (
      base.endsWith("n") ||
      base.endsWith("r") ||
      base.endsWith("l") ||
      base.endsWith("s") ||
      base.endsWith("d") ||
      base.endsWith("j")
    ) {
      return base;
    }
    if (word.endsWith("ies")) {
      return word.slice(0, -2);
    }
  }
  if (word.endsWith("s") && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function areTokensEquivalent(a: string, b: string): "exact" | "fuzzy" | "none" {
  if (a === b) return "exact";

  // Masculine/feminine ending equivalence for >= 4 char words (e.g. pintado/pintada)
  if (
    a.length === b.length &&
    a.length >= 4 &&
    a.slice(0, -1) === b.slice(0, -1) &&
    ((a.endsWith("o") && b.endsWith("a")) ||
      (a.endsWith("a") && b.endsWith("o")))
  ) {
    return "exact";
  }

  // Strict length guard prevents short words ("pan", "sal", "uva") from fuzzy matching longer words ("empanada", "salsa")
  const lenDiff = Math.abs(a.length - b.length);
  if (a.length >= 5 && b.length >= 5 && lenDiff <= 1) {
    if (levenshteinDistance(a, b) <= 1) return "fuzzy";
  }
  if (a.length >= 7 && b.length >= 7 && lenDiff <= 1) {
    if (levenshteinDistance(a, b) <= 2) return "fuzzy";
  }

  return "none";
}

function getSynonymTargets(stem: string): string[] {
  if (stem === "cilantro") return ["culantro"];
  if (stem === "blanquillo") return ["huevo"];
  if (stem === "mazorca" || stem === "choclo") return ["maiz"];
  if (stem === "guineo") return ["banano"];
  return [];
}

export function rankCatalogMatches(
  spokenTokens: string[],
  catalog: Product[]
): Array<{ product: Product; score: number }> {
  if (spokenTokens.length === 0 || catalog.length === 0) return [];

  const cleanSpoken = spokenTokens
    .map((t) => stripAccents(t).trim())
    .filter((t) => t.length >= 2 && !MATCHER_STOPWORDS.has(t));

  if (cleanSpoken.length === 0) return [];

  const spokenPhrase = cleanSpoken.join(" ");
  const spokenStems = cleanSpoken.map(singularizeSpanish);

  const results: Array<{ product: Product; score: number }> = [];

  for (const product of catalog) {
    const normName = stripAccents(product.name);
    const catalogTokens = normName
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !MATCHER_STOPWORDS.has(t));
    if (catalogTokens.length === 0) continue;

    const catalogStems = catalogTokens.map(singularizeSpanish);
    const primaryCatalogStem = catalogStems[0];

    let score = 0;
    let primaryMatched = false;

    // 1. Exact full name or word-boundary full name match (NEVER mid-word substring!)
    if (normName === spokenPhrase) {
      score += 120;
      primaryMatched = true;
    } else {
      const catBoundary = new RegExp(
        `(?:^|\\s)${escapeRegex(normName)}(?:$|\\s)`
      );
      const spokenBoundary = new RegExp(
        `(?:^|\\s)${escapeRegex(spokenPhrase)}(?:$|\\s)`
      );
      if (catBoundary.test(spokenPhrase) || spokenBoundary.test(normName)) {
        score += 80;
        primaryMatched = true;
      }
    }

    // 2. Token-by-token matching
    for (const sStem of spokenStems) {
      const synonyms = getSynonymTargets(sStem);
      const isSpokenFresh = GENERIC_FRESH_WORDS.has(sStem);
      const isSpokenContrast = CONTRAST_MODIFIERS.has(sStem);

      for (let ci = 0; ci < catalogStems.length; ci++) {
        const cStem = catalogStems[ci];
        const isCatFresh = ci > 0 && GENERIC_FRESH_WORDS.has(cStem);
        const isCatContrast = ci > 0 && CONTRAST_MODIFIERS.has(cStem);

        if (synonyms.includes(cStem)) {
          score += ci === 0 ? 55 : 35;
          if (ci === 0) primaryMatched = true;
          continue;
        }

        const eq = areTokensEquivalent(sStem, cStem);
        if (eq === "exact") {
          if (ci === 0) {
            score += 55;
            primaryMatched = true;
          } else if (isSpokenFresh || isCatFresh) {
            score += 4;
          } else if (isSpokenContrast || isCatContrast) {
            score += 18;
          } else {
            score += 35;
          }
        } else if (eq === "fuzzy" && !isSpokenFresh && !isCatFresh) {
          if (ci === 0) {
            score += 34;
            primaryMatched = true;
          } else {
            score += 22;
          }
        }
      }
    }

    // 3. If user explicitly stated a contrasting modifier (e.g., "cebolla morada" vs "Cebolla amarilla" or "plátano maduro" vs "Plátano verde")
    const spokenContrasts = spokenStems.filter((s) => CONTRAST_MODIFIERS.has(s));
    const catalogContrasts = catalogStems
      .slice(1)
      .filter((c) => CONTRAST_MODIFIERS.has(c));

    if (spokenContrasts.length > 0 && catalogContrasts.length > 0) {
      const hasConflictingContrast = spokenContrasts.some(
        (sc) => !catalogContrasts.some((cc) => areTokensEquivalent(sc, cc) !== "none")
      );
      if (hasConflictingContrast) {
        score -= 30;
      }
    }

    // 4. If user spoke multiple meaningful words (e.g. "empanadas de queso", "salsa de tomate"),
    // the primary spoken noun must match something in the catalog item unless the entire catalog phrase matched.
    const primarySpokenStem =
      spokenStems.find(
        (s) => !GENERIC_FRESH_WORDS.has(s) && !CONTRAST_MODIFIERS.has(s)
      ) ?? spokenStems[0];
    const primarySpokenSynonyms = getSynonymTargets(primarySpokenStem);
    const primarySpokenMatchesCatalog = catalogStems.some(
      (cStem) =>
        areTokensEquivalent(primarySpokenStem, cStem) !== "none" ||
        primarySpokenSynonyms.includes(cStem)
    );

    if (spokenStems.length >= 2 && !primarySpokenMatchesCatalog) {
      continue;
    }

    // 5. Require primary catalog noun match OR strong match (score >= 45)
    // Never let a trailing adjective alone match a catalog item
    if (
      score >= 45 ||
      (primaryMatched && score >= 34 && primaryCatalogStem.length >= 2)
    ) {
      results.push({ product, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function matchBestCatalogProduct(
  spokenTokens: string[],
  catalog: Product[]
): Product | null {
  const ranked = rankCatalogMatches(spokenTokens, catalog);
  return ranked.length > 0 ? ranked[0].product : null;
}

export function filterCatalogByLiveTyping(
  rawQuery: string,
  catalog: Product[]
): Product[] {
  const normQuery = stripAccents(rawQuery).trim();
  if (!normQuery) return catalog;

  const queryTokens = normQuery
    .split(/\s+/)
    .filter((t) => t.length >= 1 && !MATCHER_STOPWORDS.has(t));

  if (queryTokens.length === 0) return catalog;

  return catalog.filter((product) => {
    const normName = stripAccents(product.name);
    const nameTokens = normName.split(/\s+/);
    // Every typed token must match the START of at least one word in the product name (or synonym)
    return queryTokens.every((qt) => {
      const synonyms = getSynonymTargets(singularizeSpanish(qt));
      return (
        nameTokens.some((nt) => nt.startsWith(qt)) ||
        synonyms.some((syn) => nameTokens.some((nt) => nt.startsWith(syn)))
      );
    });
  });
}
