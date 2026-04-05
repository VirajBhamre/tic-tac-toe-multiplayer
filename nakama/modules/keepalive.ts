/// <reference types="nakama-runtime" />

/**
 * If KEEPALIVE_ORIGIN + KEEPALIVE_HTTP_KEY are set in Nakama runtime env (see docker-compose),
 * periodically POSTs to this server's ping RPC so the host sees inbound traffic (e.g. Render).
 * Requires setInterval in the JS runtime; if missing, log and rely on an external pinger to /v2/rpc/ping.
 */
export function installHostingKeepalive(
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  env: { [key: string]: string }
): void {
  const origin = (env["KEEPALIVE_ORIGIN"] || "").trim().replace(/\/$/, "");
  const httpKey = (env["KEEPALIVE_HTTP_KEY"] || "").trim();
  const intervalSec = Math.max(
    60,
    parseInt(env["KEEPALIVE_INTERVAL_SEC"] || "300", 10) || 300
  );

  if (!origin || !httpKey) {
    return;
  }

  const url = `${origin}/v2/rpc/ping?http_key=${encodeURIComponent(
    httpKey
  )}&unwrap=`;

  const run = (): void => {
    try {
      const res = nk.httpRequest(
        url,
        "post",
        {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        "{}",
        15000,
        false
      );
      logger.debug("keepalive ping http %d", res.code);
    } catch (e) {
      logger.warn("keepalive ping failed: %s", String(e));
    }
  };

  const g = globalThis as unknown as {
    setInterval?: (fn: () => void, ms: number) => unknown;
    setTimeout?: (fn: () => void, ms: number) => unknown;
  };

  if (typeof g.setInterval !== "function") {
    logger.info(
      "KEEPALIVE_* set but setInterval is unavailable; use an external cron hitting POST %s/v2/rpc/ping",
      origin
    );
    return;
  }

  if (typeof g.setTimeout === "function") {
    g.setTimeout(run, 15_000);
  }
  g.setInterval(run, intervalSec * 1000);
  logger.info("hosting keepalive: ping every %ds", intervalSec);
}
