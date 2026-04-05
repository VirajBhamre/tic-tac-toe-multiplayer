import { Session } from "@heroiclabs/nakama-js";

const STORAGE_KEY = "ttt_nakama_session";

export function readStoredSession(): {
  token: string;
  refresh_token: string;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { token?: string; refresh_token?: string };
    if (typeof o.token === "string" && o.token) {
      return {
        token: o.token,
        refresh_token:
          typeof o.refresh_token === "string" ? o.refresh_token : "",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function persistSession(sess: Session): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: sess.token,
        refresh_token: sess.refresh_token,
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
