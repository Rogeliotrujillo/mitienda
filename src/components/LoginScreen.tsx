import { FormEvent, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Store,
  User,
  UserPlus,
} from "lucide-react";
import { AuthUser } from "../types";
import { fetchAuthStatus, loginUser, registerUser } from "../utils/authApi";

interface LoginScreenProps {
  onAuthenticated: (
    token: string,
    user: AuthUser,
    options?: { includeStarterCatalog?: boolean }
  ) => Promise<void> | void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("Mercado Público de Penonomé");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [includeStarterCatalog, setIncludeStarterCatalog] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAuthStatus()
      .then((status) => {
        if (!active) return;
        setHasUsers(status.hasUsers);
        if (!status.hasUsers) {
          setMode("register");
        }
      })
      .catch((err) => {
        if (!active) return;
        setHasUsers(false);
        setMode("register");
        if (err instanceof Error && err.message) {
          setErrorMsg(err.message);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setErrorMsg(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      setErrorMsg("Escribe un usuario o correo de al menos 3 caracteres.");
      return;
    }

    if (!/^[a-z0-9._@-]{3,64}$/.test(cleanUsername)) {
      setErrorMsg(
        "El usuario solo puede tener letras, números, punto, guion o @."
      );
      return;
    }

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (mode === "register") {
      if (displayName.trim().length < 2) {
        setErrorMsg("Escribe tu nombre o el nombre del vendedor.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("Las contraseñas no coinciden.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === "register") {
        const session = await registerUser({
          displayName: displayName.trim(),
          storeName: storeName.trim() || "Mercado Público de Penonomé",
          username: cleanUsername,
          password,
        });
        await onAuthenticated(session.token, session.user, {
          includeStarterCatalog,
        });
      } else {
        const session = await loginUser({
          username: cleanUsername,
          password,
        });
        await onAuthenticated(session.token, session.user);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar sesión. Intenta otra vez."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#F4F5F7] text-[#0F172A]">
      <header className="flex min-h-16 items-center border-b border-[#E2E8F0] bg-white px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <span className="font-display shrink-0 text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap sm:text-2xl">
            Mi tienda
          </span>
          <span className="min-w-0 truncate text-xs font-medium text-[#64748B] sm:text-sm">
            Mercado Público de Penonomé
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-12">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              <Store className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
                {mode === "login" ? "Entrar a tu tienda" : "Crear tu cuenta"}
              </h1>
              <p className="text-sm font-medium text-[#64748B]">
                {mode === "login"
                  ? "Ingresa con tu usuario para ver tu puesto"
                  : hasUsers === false
                    ? "Crea la primera cuenta para comenzar"
                    : "Registra tu puesto y guarda tu inventario"}
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Opciones de acceso"
            className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl bg-[#F1F5F9] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className={`min-h-[42px] rounded-lg px-3 font-display text-sm font-semibold transition-colors ${
                mode === "login"
                  ? "bg-white text-[#0F172A] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => switchMode("register")}
              className={`min-h-[42px] rounded-lg px-3 font-display text-sm font-semibold transition-colors ${
                mode === "register"
                  ? "bg-white text-[#0F172A] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === "register" && (
              <>
                <div>
                  <label
                    htmlFor="auth-display-name"
                    className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                  >
                    Tu nombre
                  </label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#64748B]"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-display-name"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ej. María González"
                      maxLength={60}
                      className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white pr-4 pl-11 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-store-name"
                    className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                  >
                    Nombre del puesto
                  </label>
                  <div className="relative">
                    <Store
                      className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#64748B]"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-store-name"
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Ej. Puesto #12 - Verduras"
                      maxLength={80}
                      className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white pr-4 pl-11 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="auth-username"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Usuario o correo
              </label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#64748B]"
                  aria-hidden="true"
                />
                <input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej. maria.puesto o maria@correo.com"
                  maxLength={64}
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white pr-4 pl-11 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#64748B]"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  maxLength={128}
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white pr-12 pl-11 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                  >
                    Repetir contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#64748B]"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Vuelve a escribir tu contraseña"
                      maxLength={128}
                      className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white pr-4 pl-11 text-base text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-sm text-[#334155]">
                  <input
                    type="checkbox"
                    checked={includeStarterCatalog}
                    onChange={(e) => setIncludeStarterCatalog(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#CBD5E1] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                  />
                  <span>
                    Incluir productos de ejemplo del mercado (plátano, yuca,
                    tomate, queso y más) para empezar rápido.
                  </span>
                </label>
              </>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#0F172A] px-5 font-display text-base font-bold text-white shadow-xs transition-all hover:bg-[#1E293B] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === "login" ? (
                <>
                  <LogIn className="h-5 w-5" aria-hidden="true" />
                  <span>{isSubmitting ? "Entrando..." : "Entrar a mi tienda"}</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5" aria-hidden="true" />
                  <span>
                    {isSubmitting ? "Creando cuenta..." : "Crear cuenta y entrar"}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
