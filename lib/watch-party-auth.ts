import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { partyCapabilities } from "./watch-party.ts";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_TTL = 12 * 60 * 60_000;
const TOKEN_TTL = 60 * 60_000;

type PartyRole = "host" | "guest";

export type SessionClaims = {
  uid: number;
  name: string;
  roomCode: string;
  role: PartyRole;
  clientId: string;
  exp: number;
};

export function createAblyTokenRequest(
  clientId: string,
  roomCode: string,
  role: PartyRole,
  key: string,
) {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) {
    throw new Error("ABLY_API_KEY inválida.");
  }

  const keyName = key.slice(0, separator);
  const keySecret = key.slice(separator + 1);
  const ttl = TOKEN_TTL;
  const capability = JSON.stringify(partyCapabilities(roomCode, role));
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const signText = `${keyName}\n${ttl}\n${capability}\n${clientId}\n${timestamp}\n${nonce}\n`;
  const mac = createHmac("sha256", keySecret).update(signText, "utf8").digest("base64");

  return { keyName, ttl, capability, clientId, timestamp, nonce, mac };
}

function normalizeRoomCode(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function makeRoomCode() {
  const bytes = randomBytes(6);
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ROOM_ALPHABET[bytes[index] % ROOM_ALPHABET.length];
  }
  return code;
}

export function signSession(claims: SessionClaims, secret: string) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(value: unknown, secret: string): SessionClaims | null {
  const [payload, signature, extra] = String(value || "").split(".");
  if (!payload || !signature || extra || !secret) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (
      !Number.isInteger(claims.uid) ||
      typeof claims.name !== "string" ||
      normalizeRoomCode(claims.roomCode).length !== 6 ||
      (claims.role !== "host" && claims.role !== "guest") ||
      typeof claims.clientId !== "string" || !claims.clientId.startsWith(`${claims.role}:${claims.uid}:`) ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now()
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

export function newSession(uid: number, name: string, role: PartyRole, requestedCode: unknown): SessionClaims | null {
  const roomCode = role === "host" ? makeRoomCode() : normalizeRoomCode(requestedCode);
  if (roomCode.length !== 6) return null;
  return {
    uid,
    name: name.slice(0, 80),
    roomCode,
    role,
    clientId: `${role}:${uid}:${randomBytes(8).toString("hex")}`,
    exp: Date.now() + SESSION_TTL,
  };
}

