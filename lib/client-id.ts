type ClientCrypto = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">>;

/** Client tracking IDs only; authentication and room credentials are generated on the server. */
export function createClientId(provider: ClientCrypto | null = globalThis.crypto ?? null): string {
  if (typeof provider?.randomUUID === "function") return provider.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof provider?.getRandomValues === "function") {
    provider.getRandomValues(bytes);
  } else {
    // Very old clients without Web Crypto still need non-security session identifiers.
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
