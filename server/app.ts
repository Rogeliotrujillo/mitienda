import "dotenv/config";
import crypto from "crypto";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const PROJECT_ROOT =
  typeof import.meta !== "undefined" && import.meta.url
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
    : process.cwd();
const scryptAsync = promisify(crypto.scrypt);

const DATA_DIR = path.resolve(PROJECT_ROOT, ".data");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_REGEX = /^[a-z0-9._@-]{3,64}$/;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString("hex");

// Precomputed dummy hash for constant-time rejection when username does not exist
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_HASH = "00".repeat(64);

interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  storeName: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  storeName: string;
}

interface StoredProduct {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  pricePerUnit: number;
}

interface StoredMovement {
  id: string;
  type: "sale" | "entry";
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  amountBalboas: number;
  timestamp: string;
  source: "manual" | "voice";
}

interface UserStoreData {
  initialized: boolean;
  products: StoredProduct[];
  movements: StoredMovement[];
}

interface TokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  auth?: {
    user: PublicUser;
    jti: string;
    exp: number;
  };
}

type SupabaseClientAny = import("@supabase/supabase-js").SupabaseClient;

let supabasePromise: Promise<SupabaseClientAny | null> | null = null;

function normalizeSupabaseUrl(rawUrl: string): string | null {
  let unquoted = rawUrl.trim().replace(/^["']|["']$/g, "").trim();
  if (!unquoted) return null;
  if (!/^https?:\/\//i.test(unquoted)) {
    unquoted = `https://${unquoted}`;
  }
  try {
    const parsed = new URL(unquoted);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host === "supabase.com" || host === "app.supabase.com") {
      return null;
    }
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host === "169.254.169.254"
    ) {
      return null;
    }
    if (
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.in") ||
      parsed.pathname.includes("/rest/v1") ||
      parsed.pathname.includes("/auth/v1") ||
      parsed.pathname.includes("/storage/v1")
    ) {
      return parsed.origin;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function detectSupabaseKeyType(
  key: string
): "service_role" | "anon" | "unknown" {
  const cleanKey = key.trim().replace(/^["']|["']$/g, "").trim();
  if (cleanKey.startsWith("sb_publishable_")) return "anon";
  if (cleanKey.startsWith("sb_secret_")) return "service_role";
  const parts = cleanKey.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      ) as { role?: unknown };
      if (payload?.role === "anon") return "anon";
      if (payload?.role === "service_role") return "service_role";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

function throwSupabaseError(
  operation: string,
  error: { code?: string; message?: string; details?: string; hint?: string }
): never {
  console.error(
    `[supabase:${operation}] code=${error.code || "none"} message=${error.message || "unknown"}`
  );
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  const keyType = detectSupabaseKeyType(serviceKey);
  const msg = (error.message || "").toLowerCase();
  const code = error.code || "";

  if (keyType === "anon") {
    throw new Error("SUPABASE_ANON_KEY_USED");
  }
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    throw new Error("SUPABASE_RLS_DENIED");
  }
  if (code === "PGRST125") {
    throw new Error("SUPABASE_INVALID_URL_PATH");
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  ) {
    throw new Error("SUPABASE_MISSING_TABLE");
  }
  if (code === "42703" || code === "PGRST204") {
    throw new Error("SUPABASE_MISSING_COLUMN");
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("network")
  ) {
    throw new Error("SUPABASE_NETWORK_ERROR");
  }
  if (
    msg.includes("invalid api key") ||
    msg.includes("jwt") ||
    code === "PGRST301"
  ) {
    throw new Error("SUPABASE_AUTH_INVALID");
  }
  throw new Error(`SUPABASE_OP_${code || "UNKNOWN"}`);
}

function getFriendlySupabaseErrorMessage(err: unknown): string | null {
  const code = err instanceof Error ? err.message : "";
  if (code === "SUPABASE_VITE_PREFIX") {
    return "En Netlify pusiste VITE_SUPABASE_URL o VITE_SUPABASE_SERVICE_ROLE_KEY. Cámbialas a SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (sin VITE_) y haz Redeploy (Clear cache and deploy site).";
  }
  if (code === "SUPABASE_NOT_CONFIGURED") {
    return "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify. Agrégalas en Site configuration > Environment variables (con scope Functions) y vuelve a hacer Deploy.";
  }
  if (code === "SUPABASE_INVALID_URL") {
    return "La variable SUPABASE_URL no es válida. Debe ser exactamente https://<tu-proyecto>.supabase.co (Project URL en Supabase > Settings > API).";
  }
  if (code === "SUPABASE_NETWORK_ERROR") {
    return "No se pudo conectar con Supabase desde el servidor. Verifica que SUPABASE_URL sea exactamente https://<tu-proyecto>.supabase.co.";
  }
  if (code === "SUPABASE_ANON_KEY_USED") {
    return "En SUPABASE_SERVICE_ROLE_KEY colocaste la llave pública (anon). Reemplázala por la llave secreta service_role.";
  }
  if (code === "SUPABASE_RLS_DENIED") {
    return "Supabase bloqueó la escritura por permisos (RLS). Verifica que en SUPABASE_SERVICE_ROLE_KEY hayas puesto la llave secreta service_role.";
  }
  if (code === "SUPABASE_INVALID_URL_PATH") {
    return "La URL de Supabase o la ruta de la API no es válida (PGRST125). Verifica que SUPABASE_URL sea https://<tu-proyecto>.supabase.co y ejecuta: NOTIFY pgrst, 'reload schema'; en Supabase.";
  }
  if (code === "SUPABASE_MISSING_TABLE") {
    return "Falta alguna tabla en tu proyecto Supabase. Ejecuta todo el código SQL en el SQL Editor de Supabase.";
  }
  if (code === "SUPABASE_MISSING_COLUMN") {
    return "Las tablas en Supabase no coinciden con las columnas esperadas. Ejecuta el SQL completo nuevamente en SQL Editor.";
  }
  if (code === "SUPABASE_AUTH_INVALID") {
    return "La llave SUPABASE_SERVICE_ROLE_KEY no es válida. Cópiala nuevamente desde Project Settings > API en Supabase.";
  }
  if (code.startsWith("SUPABASE_OP_")) {
    const pgCode = code.replace("SUPABASE_OP_", "");
    return `Error de Supabase (${pgCode}). Revisa que el SQL se haya ejecutado completo en tu proyecto.`;
  }
  return null;
}

function isRunningServerless(explicitServerless?: boolean): boolean {
  return Boolean(
    explicitServerless ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.DEPLOY_ID
  );
}

async function getSupabase(
  requireRemote = false
): Promise<SupabaseClientAny | null> {
  const rawUrl = (process.env.SUPABASE_URL || "").trim();
  const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const hasViteMistake = Boolean(
    (!rawUrl && process.env.VITE_SUPABASE_URL) ||
      (!rawKey && process.env.VITE_SUPABASE_SERVICE_ROLE_KEY)
  );

  if (hasViteMistake) {
    throw new Error("SUPABASE_VITE_PREFIX");
  }

  const url = normalizeSupabaseUrl(rawUrl);
  const serviceKey = rawKey.replace(/^["']|["']$/g, "").trim();

  if (rawUrl && !url) {
    throw new Error("SUPABASE_INVALID_URL");
  }

  if (!url || !serviceKey) {
    if (requireRemote) {
      throw new Error("SUPABASE_NOT_CONFIGURED");
    }
    return null;
  }

  if (!supabasePromise) {
    supabasePromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );
  }
  return supabasePromise;
}

let dirsInitialized = false;
let resolvedDataDir = DATA_DIR;
let resolvedUsersFile = path.join(DATA_DIR, "users.json");
let resolvedStoresDir = path.join(DATA_DIR, "stores");

function ensureLocalDataDirs(): void {
  if (dirsInitialized) return;
  try {
    fs.mkdirSync(resolvedDataDir, { recursive: true });
    fs.mkdirSync(resolvedStoresDir, { recursive: true });
  } catch {
    resolvedDataDir = path.join(os.tmpdir(), "mi-tienda-data");
    resolvedUsersFile = path.join(resolvedDataDir, "users.json");
    resolvedStoresDir = path.join(resolvedDataDir, "stores");
    fs.mkdirSync(resolvedDataDir, { recursive: true });
    fs.mkdirSync(resolvedStoresDir, { recursive: true });
  }
  dirsInitialized = true;
}

let fileOpChain: Promise<void> = Promise.resolve();
function enqueueFileOp<T>(task: () => Promise<T>): Promise<T> {
  const next = fileOpChain.then(task, task);
  fileOpChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fsp.rename(tempPath, filePath);
}

async function readUsers(): Promise<StoredUser[]> {
  ensureLocalDataDirs();
  try {
    const raw = await fsp.readFile(resolvedUsersFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

function getUserStorePath(userId: string): string {
  ensureLocalDataDirs();
  if (!UUID_REGEX.test(userId)) {
    throw new Error("INVALID_USER_ID");
  }
  const resolved = path.resolve(resolvedStoresDir, `${userId}.json`);
  if (!resolved.startsWith(resolvedStoresDir + path.sep)) {
    throw new Error("PATH_TRAVERSAL_BLOCKED");
  }
  return resolved;
}

async function readLocalUserStore(userId: string): Promise<UserStoreData> {
  const storePath = getUserStorePath(userId);
  try {
    const raw = await fsp.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserStoreData>;
    return {
      initialized: Boolean(parsed.initialized),
      products: Array.isArray(parsed.products) ? parsed.products : [],
      movements: Array.isArray(parsed.movements) ? parsed.movements : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { initialized: false, products: [], movements: [] };
    }
    throw err;
  }
}

interface SupabaseUserRow {
  id: string;
  username: string;
  display_name: string;
  store_name: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
}

function mapSupabaseUser(row: SupabaseUserRow): StoredUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    storeName: row.store_name,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

let requireRemoteDb = false;

async function dbHasUsers(): Promise<boolean> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    if (detectSupabaseKeyType(serviceKey) === "anon") {
      throw new Error("SUPABASE_ANON_KEY_USED");
    }
    const [usersRes, metaRes, prodRes, movRes] = await Promise.all([
      supabase
        .from("app_users")
        .select(
          "id, username, display_name, store_name, password_salt, password_hash, created_at",
          { count: "exact" }
        )
        .limit(1),
      supabase
        .from("user_store_meta")
        .select("user_id, initialized, updated_at")
        .limit(1),
      supabase
        .from("products")
        .select("id, user_id, name, unit, quantity, min_stock, price_per_unit")
        .limit(1),
      supabase
        .from("movements")
        .select(
          "id, user_id, type, product_id, product_name, quantity, unit, amount_balboas, timestamp, source"
        )
        .limit(1),
    ]);
    if (usersRes.error) throwSupabaseError("hasUsers:app_users", usersRes.error);
    if (metaRes.error)
      throwSupabaseError("hasUsers:user_store_meta", metaRes.error);
    if (prodRes.error) throwSupabaseError("hasUsers:products", prodRes.error);
    if (movRes.error) throwSupabaseError("hasUsers:movements", movRes.error);
    return (usersRes.count ?? 0) > 0;
  }
  const users = await readUsers();
  return users.length > 0;
}

async function dbFindUserByUsername(
  username: string
): Promise<StoredUser | null> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    if (detectSupabaseKeyType(serviceKey) === "anon") {
      throw new Error("SUPABASE_ANON_KEY_USED");
    }
    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id, username, display_name, store_name, password_salt, password_hash, created_at"
      )
      .eq("username", username)
      .maybeSingle();
    if (error) throwSupabaseError("findUserByUsername", error);
    return data ? mapSupabaseUser(data as SupabaseUserRow) : null;
  }
  const users = await readUsers();
  return users.find((u) => u.username === username) ?? null;
}

async function dbFindUserById(userId: string): Promise<StoredUser | null> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    if (detectSupabaseKeyType(serviceKey) === "anon") {
      throw new Error("SUPABASE_ANON_KEY_USED");
    }
    const { data, error } = await supabase
      .from("app_users")
      .select(
        "id, username, display_name, store_name, password_salt, password_hash, created_at"
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throwSupabaseError("findUserById", error);
    return data ? mapSupabaseUser(data as SupabaseUserRow) : null;
  }
  const users = await readUsers();
  return users.find((u) => u.id === userId) ?? null;
}

async function dbCreateUser(newUser: StoredUser): Promise<StoredUser | null> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    if (detectSupabaseKeyType(serviceKey) === "anon") {
      throw new Error("SUPABASE_ANON_KEY_USED");
    }
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        id: newUser.id,
        username: newUser.username,
        display_name: newUser.displayName,
        store_name: newUser.storeName,
        password_salt: newUser.passwordSalt,
        password_hash: newUser.passwordHash,
        created_at: newUser.createdAt,
      })
      .select(
        "id, username, display_name, store_name, password_salt, password_hash, created_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") return null;
      throwSupabaseError("createUser", error);
    }

    const { error: metaError } = await supabase
      .from("user_store_meta")
      .insert({ user_id: newUser.id, initialized: false });
    if (metaError) {
      await supabase.from("app_users").delete().eq("id", newUser.id);
      throwSupabaseError("createUserMeta", metaError);
    }

    return mapSupabaseUser(data as SupabaseUserRow);
  }

  return enqueueFileOp(async () => {
    const users = await readUsers();
    if (users.some((u) => u.username === newUser.username)) {
      return null;
    }
    users.push(newUser);
    await writeJsonAtomic(resolvedUsersFile, users);
    await writeJsonAtomic(getUserStorePath(newUser.id), {
      initialized: false,
      products: [],
      movements: [],
    });
    return newUser;
  });
}

async function dbReadUserStore(userId: string): Promise<UserStoreData> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    const [metaRes, prodRes, movRes] = await Promise.all([
      supabase
        .from("user_store_meta")
        .select("initialized")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("products")
        .select("id, name, unit, quantity, min_stock, price_per_unit")
        .eq("user_id", userId),
      supabase
        .from("movements")
        .select(
          "id, type, product_id, product_name, quantity, unit, amount_balboas, timestamp, source"
        )
        .eq("user_id", userId)
        .order("timestamp", { ascending: false }),
    ]);

    if (metaRes.error || prodRes.error || movRes.error) {
      throw new Error("SUPABASE_STORE_READ_FAILED");
    }

    const products: StoredProduct[] = (prodRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      unit: String(row.unit),
      quantity: Number(row.quantity) || 0,
      minStock: Number(row.min_stock) || 0,
      pricePerUnit: Number(row.price_per_unit) || 0,
    }));

    const movements: StoredMovement[] = (movRes.data ?? []).map((row) => ({
      id: String(row.id),
      type: row.type === "entry" ? "entry" : "sale",
      productId: String(row.product_id),
      productName: String(row.product_name),
      quantity: Number(row.quantity) || 0,
      unit: String(row.unit),
      amountBalboas: Number(row.amount_balboas) || 0,
      timestamp: new Date(String(row.timestamp)).toISOString(),
      source: row.source === "voice" ? "voice" : "manual",
    }));

    return {
      initialized: Boolean(metaRes.data?.initialized),
      products,
      movements,
    };
  }
  return readLocalUserStore(userId);
}

async function dbWriteUserStore(
  userId: string,
  products: StoredProduct[],
  movements: StoredMovement[]
): Promise<void> {
  const supabase = await getSupabase(requireRemoteDb);
  if (supabase) {
    if (products.length > 0) {
      const productRows = products.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        unit: p.unit,
        quantity: p.quantity,
        min_stock: p.minStock,
        price_per_unit: p.pricePerUnit,
      }));
      const { error } = await supabase
        .from("products")
        .upsert(productRows, { onConflict: "user_id,id" });
      if (error) throw new Error("SUPABASE_PRODUCTS_UPSERT_FAILED");
    }

    const { data: existingProdIds, error: prodListErr } = await supabase
      .from("products")
      .select("id")
      .eq("user_id", userId);
    if (prodListErr) throw new Error("SUPABASE_PRODUCTS_LIST_FAILED");

    const keepProdIds = new Set(products.map((p) => p.id));
    const removedProdIds = (existingProdIds ?? [])
      .map((r) => String(r.id))
      .filter((id) => !keepProdIds.has(id));
    if (removedProdIds.length > 0) {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("user_id", userId)
        .in("id", removedProdIds);
      if (error) throw new Error("SUPABASE_PRODUCTS_DELETE_FAILED");
    }

    if (movements.length > 0) {
      const movementRows = movements.map((m) => ({
        id: m.id,
        user_id: userId,
        type: m.type,
        product_id: m.productId,
        product_name: m.productName,
        quantity: m.quantity,
        unit: m.unit,
        amount_balboas: m.amountBalboas,
        timestamp: m.timestamp,
        source: m.source,
      }));
      const { error } = await supabase
        .from("movements")
        .upsert(movementRows, { onConflict: "user_id,id" });
      if (error) throw new Error("SUPABASE_MOVEMENTS_UPSERT_FAILED");
    }

    const { data: existingMovIds, error: movListErr } = await supabase
      .from("movements")
      .select("id")
      .eq("user_id", userId);
    if (movListErr) throw new Error("SUPABASE_MOVEMENTS_LIST_FAILED");

    const keepMovIds = new Set(movements.map((m) => m.id));
    const removedMovIds = (existingMovIds ?? [])
      .map((r) => String(r.id))
      .filter((id) => !keepMovIds.has(id));
    if (removedMovIds.length > 0) {
      const { error } = await supabase
        .from("movements")
        .delete()
        .eq("user_id", userId)
        .in("id", removedMovIds);
      if (error) throw new Error("SUPABASE_MOVEMENTS_DELETE_FAILED");
    }

    const { error: metaErr } = await supabase.from("user_store_meta").upsert(
      {
        user_id: userId,
        initialized: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (metaErr) throw new Error("SUPABASE_META_UPSERT_FAILED");
    return;
  }

  await enqueueFileOp(async () => {
    await writeJsonAtomic(getUserStorePath(userId), {
      initialized: true,
      products,
      movements,
    });
  });
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    storeName: user.storeName,
  };
}

async function hashPassword(
  password: string
): Promise<{ salt: string; hash: string }> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

async function verifyPassword(
  password: string,
  salt: string,
  expectedHashHex: string
): Promise<boolean> {
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHashHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

const revokedTokens = new Map<string, number>();

function pruneRevokedTokens(): void {
  const now = Date.now();
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp <= now) {
      revokedTokens.delete(jti);
    }
  }
}

function createSessionToken(userId: string): string {
  const now = Date.now();
  const payload: TokenPayload = {
    sub: userId,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sigB64 = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sigB64}`;
}

function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(sigB64, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as Partial<TokenPayload>;
    if (
      typeof parsed.sub !== "string" ||
      !UUID_REGEX.test(parsed.sub) ||
      typeof parsed.jti !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    pruneRevokedTokens();
    if (revokedTokens.has(parsed.jti)) {
      return null;
    }
    return parsed as TokenPayload;
  } catch {
    return null;
  }
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

function isRateLimited(key: string, limit: number, _windowMs: number): boolean {
  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return false;
  }
  return bucket.count >= limit;
}

function recordRateAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

function clearRateBucket(key: string): void {
  rateBuckets.delete(key);
}

function validateStoreProducts(raw: unknown): StoredProduct[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const result: StoredProduct[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    if (
      typeof p.id !== "string" ||
      p.id.trim().length === 0 ||
      p.id.length > 100 ||
      typeof p.name !== "string" ||
      p.name.trim().length === 0 ||
      p.name.length > 120 ||
      typeof p.unit !== "string" ||
      p.unit.trim().length === 0 ||
      p.unit.length > 40 ||
      typeof p.quantity !== "number" ||
      !Number.isFinite(p.quantity) ||
      p.quantity < 0 ||
      p.quantity > 1_000_000 ||
      typeof p.minStock !== "number" ||
      !Number.isFinite(p.minStock) ||
      p.minStock < 0 ||
      p.minStock > 1_000_000 ||
      typeof p.pricePerUnit !== "number" ||
      !Number.isFinite(p.pricePerUnit) ||
      p.pricePerUnit < 0 ||
      p.pricePerUnit > 1_000_000
    ) {
      return null;
    }
    result.push({
      id: p.id.trim(),
      name: p.name.trim(),
      unit: p.unit.trim(),
      quantity: Math.round(p.quantity * 100) / 100,
      minStock: Math.round(p.minStock * 100) / 100,
      pricePerUnit: Math.round(p.pricePerUnit * 100) / 100,
    });
  }
  return result;
}

function validateStoreMovements(raw: unknown): StoredMovement[] | null {
  if (!Array.isArray(raw) || raw.length > 5000) return null;
  const result: StoredMovement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const m = item as Record<string, unknown>;
    if (
      typeof m.id !== "string" ||
      m.id.trim().length === 0 ||
      m.id.length > 100 ||
      (m.type !== "sale" && m.type !== "entry") ||
      typeof m.productId !== "string" ||
      m.productId.trim().length === 0 ||
      m.productId.length > 100 ||
      typeof m.productName !== "string" ||
      m.productName.trim().length === 0 ||
      m.productName.length > 120 ||
      typeof m.quantity !== "number" ||
      !Number.isFinite(m.quantity) ||
      m.quantity <= 0 ||
      m.quantity > 1_000_000 ||
      typeof m.unit !== "string" ||
      m.unit.trim().length === 0 ||
      m.unit.length > 40 ||
      typeof m.amountBalboas !== "number" ||
      !Number.isFinite(m.amountBalboas) ||
      m.amountBalboas < 0 ||
      m.amountBalboas > 10_000_000 ||
      typeof m.timestamp !== "string" ||
      m.timestamp.length === 0 ||
      m.timestamp.length > 60 ||
      Number.isNaN(Date.parse(m.timestamp)) ||
      (m.source !== "manual" && m.source !== "voice")
    ) {
      return null;
    }
    result.push({
      id: m.id.trim(),
      type: m.type,
      productId: m.productId.trim(),
      productName: m.productName.trim(),
      quantity: Math.round(m.quantity * 100) / 100,
      unit: m.unit.trim(),
      amountBalboas: Math.round(m.amountBalboas * 100) / 100,
      timestamp: m.timestamp,
      source: m.source,
    });
  }
  return result;
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Debes iniciar sesión para continuar." });
      return;
    }
    const token = header.slice(7).trim();
    const payload = verifySessionToken(token);
    if (!payload) {
      res
        .status(401)
        .json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
      return;
    }
    const found = await dbFindUserById(payload.sub);
    if (!found) {
      res.status(401).json({ error: "Sesión no válida. Inicia sesión." });
      return;
    }
    req.auth = {
      user: toPublicUser(found),
      jti: payload.jti,
      exp: payload.exp,
    };
    next();
  } catch {
    res.status(500).json({ error: "Error verificando la sesión." });
  }
}

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

let hydrogenCooldownUntil = 0;

function createApiRouter() {
  const router = express.Router();

  router.get("/health", async (_req, res) => {
    try {
      const supabase = await getSupabase(false);
      res.json({
        ok: true,
        storage: supabase ? "supabase" : "local",
        serverless: requireRemoteDb,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          getFriendlySupabaseErrorMessage(err) ||
          "Error en la configuración del servidor.",
      });
    }
  });

  router.get("/auth/status", async (_req, res) => {
    try {
      const hasUsers = await dbHasUsers();
      res.json({ hasUsers });
    } catch (err) {
      console.error(
        "[auth/status] failed:",
        err instanceof Error ? err.message : err
      );
      const friendly = getFriendlySupabaseErrorMessage(err);
      res.status(500).json({
        error: friendly || "No se pudo consultar el estado.",
      });
    }
  });

  router.post("/auth/register", async (req, res) => {
    try {
      const clientIp = req.ip || "unknown";
      const rateKey = `register:${clientIp}`;
      if (isRateLimited(rateKey, 15, 60 * 60 * 1000)) {
        res.status(429).json({
          error: "Demasiados registros recientes. Intenta más tarde.",
        });
        return;
      }
      recordRateAttempt(rateKey, 60 * 60 * 1000);

      const body = req.body as Record<string, unknown>;
      const rawUsername =
        typeof body?.username === "string"
          ? body.username.trim().toLowerCase()
          : "";
      const rawDisplayName =
        typeof body?.displayName === "string" ? body.displayName.trim() : "";
      const rawStoreName =
        typeof body?.storeName === "string" ? body.storeName.trim() : "";
      const rawPassword =
        typeof body?.password === "string" ? body.password : "";

      if (!USERNAME_REGEX.test(rawUsername)) {
        res.status(400).json({
          error:
            "El usuario debe tener entre 3 y 64 caracteres (letras, números, punto, guion o @).",
        });
        return;
      }
      if (rawDisplayName.length < 2 || rawDisplayName.length > 60) {
        res.status(400).json({
          error: "El nombre debe tener entre 2 y 60 caracteres.",
        });
        return;
      }
      if (rawStoreName.length > 80) {
        res.status(400).json({
          error: "El nombre del puesto no puede superar 80 caracteres.",
        });
        return;
      }
      if (rawPassword.length < 6 || rawPassword.length > 128) {
        res.status(400).json({
          error: "La contraseña debe tener entre 6 y 128 caracteres.",
        });
        return;
      }

      const { salt, hash } = await hashPassword(rawPassword);
      const newUser: StoredUser = {
        id: crypto.randomUUID(),
        username: rawUsername,
        displayName: rawDisplayName,
        storeName: rawStoreName || "Mercado Público de Penonomé",
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      };

      const created = await dbCreateUser(newUser);

      if (!created) {
        res.status(409).json({
          error: "Ese usuario ya está registrado. Inicia sesión o usa otro.",
        });
        return;
      }

      const token = createSessionToken(created.id);
      res.status(201).json({
        token,
        user: toPublicUser(created),
      });
    } catch (err) {
      console.error(
        "[auth/register] failed:",
        err instanceof Error ? err.message : err
      );
      const friendly = getFriendlySupabaseErrorMessage(err);
      res.status(500).json({
        error: friendly || "No se pudo crear la cuenta en este momento.",
      });
    }
  });

  router.post("/auth/login", async (req, res) => {
    try {
      const clientIp = req.ip || "unknown";
      const body = req.body as Record<string, unknown>;
      const rawUsername =
        typeof body?.username === "string"
          ? body.username.trim().toLowerCase()
          : "";
      const rawPassword =
        typeof body?.password === "string" ? body.password : "";

      const rateKey = `login:${clientIp}:${rawUsername}`;
      if (isRateLimited(rateKey, 10, 5 * 60 * 1000)) {
        res.status(429).json({
          error:
            "Demasiados intentos fallidos. Espera 5 minutos e intenta otra vez.",
        });
        return;
      }

      if (!rawUsername || !rawPassword || rawPassword.length > 128) {
        recordRateAttempt(rateKey, 5 * 60 * 1000);
        res.status(401).json({ error: "Usuario o contraseña incorrectos." });
        return;
      }

      const found = await dbFindUserByUsername(rawUsername);

      const passwordOk = found
        ? await verifyPassword(
            rawPassword,
            found.passwordSalt,
            found.passwordHash
          )
        : await verifyPassword(rawPassword, DUMMY_SALT, DUMMY_HASH);

      if (!found || !passwordOk) {
        recordRateAttempt(rateKey, 5 * 60 * 1000);
        res.status(401).json({ error: "Usuario o contraseña incorrectos." });
        return;
      }

      clearRateBucket(rateKey);
      const token = createSessionToken(found.id);
      res.json({
        token,
        user: toPublicUser(found),
      });
    } catch (err) {
      console.error(
        "[auth/login] failed:",
        err instanceof Error ? err.message : err
      );
      const friendly = getFriendlySupabaseErrorMessage(err);
      res.status(500).json({
        error: friendly || "No se pudo iniciar sesión en este momento.",
      });
    }
  });

  router.post("/auth/logout", requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.auth) {
      revokedTokens.set(req.auth.jti, req.auth.exp);
    }
    res.json({ ok: true });
  });

  router.get("/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.auth?.user });
  });

  router.get("/store", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.auth!.user.id;
      const store = await dbReadUserStore(userId);
      res.json(store);
    } catch {
      res.status(500).json({ error: "No se pudo cargar el inventario." });
    }
  });

  router.put("/store", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.auth!.user.id;
      const body = req.body as Record<string, unknown>;
      const validProducts = validateStoreProducts(body?.products);
      const validMovements = validateStoreMovements(body?.movements);

      if (!validProducts || !validMovements) {
        res.status(400).json({
          error: "Los datos del inventario tienen un formato inválido.",
        });
        return;
      }

      await dbWriteUserStore(userId, validProducts, validMovements);

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "No se pudo guardar el inventario." });
    }
  });

  router.post(
    "/voice/parse",
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("MISSING_GEMINI_API_KEY");
        }

        const { GoogleGenAI, ThinkingLevel, Type } = await import(
          "@google/genai"
        );
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const voiceResponseSchema = {
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
                responseSchema: voiceResponseSchema,
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
                  responseSchema: voiceResponseSchema,
                },
              }),
            3
          );
          const parsed = JSON.parse(
            (liteAudioRes.text ?? '{"transcript":"","items":[]}').trim()
          ) as { transcript?: string; items?: ParsedVoiceItem[] };
          transcript =
            typeof parsed.transcript === "string"
              ? parsed.transcript.trim()
              : "";
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
              "No logré escuchar palabras claras. Habla cerca del micrófono.",
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
              "Falta configurar la clave de Gemini en el servidor para usar este servicio.",
          });
          return;
        }

        if (
          message.includes("PERMISSION_DENIED") ||
          message.includes("API_KEY_INVALID") ||
          message.includes("403")
        ) {
          res.status(403).json({
            error: "La clave de Gemini no es válida o no tiene permisos.",
          });
          return;
        }

        if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
          res.status(429).json({
            error:
              "Se alcanzó el límite de uso gratuito por hoy. Puedes agregar los productos manualmente.",
          });
          return;
        }

        if (isTransientError(error)) {
          res.status(503).json({
            error:
              "El servicio está muy ocupado ahorita. Espera unos segundos e intenta otra vez.",
          });
          return;
        }

        res.status(500).json({
          error:
            "No se pudo procesar el audio en este momento. Intenta hablar más claro o agrégalo manualmente.",
        });
      }
    }
  );

  return router;
}

export function createApiApp(options?: { isServerless?: boolean }): Express {
  requireRemoteDb = isRunningServerless(options?.isServerless);
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "15mb" }));

  const apiRouter = createApiRouter();
  app.use("/api", apiRouter);
  app.use("/.netlify/functions/api", apiRouter);

  if (options?.isServerless) {
    app.use("/", apiRouter);
  }

  return app;
}
