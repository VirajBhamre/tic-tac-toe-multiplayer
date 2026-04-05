import { Client } from "@heroiclabs/nakama-js";
import { getNakamaConfig } from "./env";

let cached: Client | null = null;

export function getNakamaClient(): Client {
  if (cached) return cached;
  const { serverKey, host, port, useSSL } = getNakamaConfig();
  cached = new Client(serverKey, host, port, useSSL);
  return cached;
}
