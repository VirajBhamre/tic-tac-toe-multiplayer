import { getNakamaConfig } from "./env";

const INTERVAL_MS = 5 * 60 * 1000;

/**
 * POSTs to the ping RPC on an interval while the SPA is open (optional wake traffic for idle hosts).
 */
export function startHostingKeepalive(): void {
  const ping = async (): Promise<void> => {
    try {
      const { host, port, httpKey, useSSL } = getNakamaConfig();
      const proto = useSSL ? "https" : "http";
      const url = `${proto}://${host}:${port}/v2/rpc/ping?http_key=${encodeURIComponent(
        httpKey
      )}&unwrap=`;
      await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch {
      /* ignore */
    }
  };

  void ping();
  setInterval(() => void ping(), INTERVAL_MS);
}
