import { AuthUser, Movement, Product } from "../types";

export interface AuthStatusResponse {
  hasUsers: boolean;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
}

export interface UserStoreResponse {
  initialized: boolean;
  products: Product[];
  movements: Movement[];
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const rawText = await res.text();
  let parsed: (T & { error?: string }) | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T & { error?: string };
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    if (rawText.trim().startsWith("<")) {
      throw new Error(
        "El servidor /api no respondió JSON. Si subiste solo la carpeta dist a Netlify, despliega el proyecto completo desde GitHub o Netlify CLI para activar netlify/functions."
      );
    }
    throw new Error(
      `Ocurrió un error al conectar con el servidor (${res.status}).`
    );
  }

  if (!res.ok) {
    throw new Error(
      parsed.error || "Ocurrió un error al conectar con el servidor."
    );
  }
  return parsed;
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const res = await fetch("/api/auth/status", {
    method: "GET",
    cache: "no-store",
  });
  return parseJsonResponse<AuthStatusResponse>(res);
}

export async function registerUser(input: {
  displayName: string;
  storeName: string;
  username: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<AuthSessionResponse>(res);
}

export async function loginUser(input: {
  username: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<AuthSessionResponse>(res);
}

export async function logoutUser(token: string): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {
    // Ignore network failure during logout cleanup
  });
}

export async function fetchUserStore(token: string): Promise<UserStoreResponse> {
  const res = await fetch("/api/store", {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return parseJsonResponse<UserStoreResponse>(res);
}

export async function saveUserStore(
  token: string,
  payload: { products: Product[]; movements: Movement[] }
): Promise<void> {
  const res = await fetch("/api/store", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  await parseJsonResponse<{ ok: boolean }>(res);
}
