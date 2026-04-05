/**
 * Nakama connection settings from Vite env (prefix VITE_).
 * Host/port defaults are non-secret; server key and HTTP key must be set in `public/.env`.
 */
function requiredEnv(name: `VITE_${string}`): string {
  const v = import.meta.env[name];
  if (v == null || String(v).trim() === "") {
    throw new Error(
      `Missing ${name}. Add it to public/.env (see public/.env.example).`
    );
  }
  return String(v);
}

export function getNakamaConfig() {
  const host = import.meta.env.VITE_NAKAMA_HOST || "127.0.0.1";
  const port = import.meta.env.VITE_NAKAMA_PORT || "7350";
  const serverKey = requiredEnv("VITE_NAKAMA_SERVER_KEY");
  const httpKey = requiredEnv("VITE_NAKAMA_HTTP_KEY");
  const useSSL =
    String(import.meta.env.VITE_NAKAMA_USE_SSL || "false").toLowerCase() ===
    "true";

  return { host, port, serverKey, httpKey, useSSL };
}
