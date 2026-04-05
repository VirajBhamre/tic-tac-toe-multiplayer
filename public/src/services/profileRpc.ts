import type { Client } from "@heroiclabs/nakama-js";
import type { Session } from "@heroiclabs/nakama-js";
import { getNakamaConfig } from "./env";

export type SignInWithIdentifierResult =
  | { ok: true; token: string; exp: number; created: boolean }
  | { ok: false; message: string };

/**
 * Username-only sign-in via server RPC.
 * Nakama 3.37+ RpcFuncHttp does not pass GET ?payload= into the runtime (body is empty),
 * so we POST with unwrap= per server/api_rpc.go.
 */
export async function rpcSignInWithIdentifier(
  _client: Client,
  identifier: string,
  password: string
): Promise<SignInWithIdentifierResult> {
  const { host, port, httpKey, useSSL } = getNakamaConfig();
  const proto = useSSL ? "https" : "http";
  const bodyObj = {
    identifier: identifier.trim(),
    password,
  };
  const tryIds = ["signinwithidentifier", "signInWithIdentifier"];
  for (const rpcId of tryIds) {
    try {
      const url = `${proto}://${host}:${port}/v2/rpc/${encodeURIComponent(
        rpcId
      )}?http_key=${encodeURIComponent(httpKey)}&unwrap=`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyObj),
      });
      if (!res.ok) {
        continue;
      }
      const p = (await res.json()) as SignInWithIdentifierResult | undefined;
      if (p && typeof p === "object" && "ok" in p) {
        return p;
      }
    } catch {
      /* try next id */
    }
  }
  return { ok: false, message: "Sign-in failed." };
}

export async function rpcGetProfileStatus(
  client: Client,
  session: Session
): Promise<{ needsUsernameSetup: boolean }> {
  const tryIds = ["getprofilestatus", "getProfileStatus"];
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, {});
      const p = res.payload as { needsUsernameSetup?: boolean } | undefined;
      if (p && typeof p.needsUsernameSetup === "boolean") {
        return { needsUsernameSetup: p.needsUsernameSetup };
      }
    } catch {
      /* continue */
    }
  }
  return { needsUsernameSetup: true };
}

export async function rpcCheckUsernameAvailable(
  client: Client,
  session: Session,
  username: string
): Promise<{ available: boolean; reason?: string }> {
  const tryIds = ["checkusernameavailable", "checkUsernameAvailable"];
  for (const id of tryIds) {
    try {
      const res = await client.rpc(session, id, { username });
      const p = res.payload as
        | { available?: boolean; reason?: string }
        | undefined;
      if (p && typeof p.available === "boolean") {
        return { available: p.available, reason: p.reason };
      }
    } catch {
      /* continue */
    }
  }
  return { available: false, reason: "rpc_error" };
}

export async function rpcChangePassword(
  client: Client,
  session: Session,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const body = { oldPassword, newPassword };
  const tryIds = ["changepassword", "changePassword"];
  let lastErr: unknown;
  for (const id of tryIds) {
    try {
      await client.rpc(session, id, body);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Could not change password.");
}

export async function rpcSetUsernameAndOnboard(
  client: Client,
  session: Session,
  username: string
): Promise<void> {
  const tryIds = ["setusernameandonboard", "setUsernameAndOnboard"];
  let lastErr: unknown;
  for (const id of tryIds) {
    try {
      await client.rpc(session, id, { username });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Onboarding failed");
}
