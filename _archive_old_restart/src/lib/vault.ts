import type { VaultEntry, VaultEntryType, VaultSyncStatus } from "@/types/thought-map";

const VAULT_PBKDF2_ITERATIONS = 100_000;
const VAULT_KEY_LENGTH = 256;
const VAULT_SALT_BYTES = 16;
const VAULT_IV_BYTES = 12;
const VAULT_VERSION = 1;

export interface VaultContentPayload {
  entryType: VaultEntryType;
  title: string;
  description: string;
  sourceMapId: string | null;
  sourceClaimId: string | null;
  sourceSessionId: string | null;
  capturedAt: string;
  content: unknown;
}

interface VaultEnvelope {
  version: number;
  algorithm: "AES-256-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Vault crypto is not available in this environment.");
  }

  return globalThis.crypto;
}

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function decodeText(value: ArrayBuffer) {
  return new TextDecoder().decode(value);
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary);
}

function base64ToBytes(value: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toJson(value: unknown) {
  return JSON.stringify(value);
}

async function digestSha256(value: string) {
  const crypto = getCrypto();
  const digest = await crypto.subtle.digest("SHA-256", encodeText(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveVaultKey(passphrase: string, salt: Uint8Array) {
  const crypto = getCrypto();
  const importedKey = await crypto.subtle.importKey("raw", encodeText(passphrase), "PBKDF2", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: VAULT_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    importedKey,
    {
      name: "AES-GCM",
      length: VAULT_KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createVaultEntry(params: {
  entryType: VaultEntryType;
  payload: VaultContentPayload;
  passphrase: string;
  keyHint: string | null;
}): Promise<VaultEntry> {
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(VAULT_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(VAULT_IV_BYTES));
  const key = await deriveVaultKey(params.passphrase, salt);
  const plaintext = toJson(params.payload);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encodeText(plaintext),
  );

  const envelope: VaultEnvelope = {
    version: VAULT_VERSION,
    algorithm: "AES-256-GCM",
    iterations: VAULT_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  const contentHash = await digestSha256(plaintext);

  return {
    id: getCrypto().randomUUID(),
    entryType: params.entryType,
    encryptedContent: JSON.stringify(envelope),
    contentHash,
    keyHint: params.keyHint,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    syncStatus: "local_only" satisfies VaultSyncStatus,
  };
}

export async function decryptVaultEntry<T = unknown>(entry: VaultEntry, passphrase: string): Promise<T> {
  const crypto = getCrypto();
  const parsed = JSON.parse(entry.encryptedContent) as Partial<VaultEnvelope> | null;

  if (!parsed || parsed.version !== VAULT_VERSION || parsed.algorithm !== "AES-256-GCM" || typeof parsed.salt !== "string" || typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string") {
    throw new Error("Invalid vault entry payload.");
  }

  const key = await deriveVaultKey(passphrase, base64ToBytes(parsed.salt));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(parsed.iv),
    },
    key,
    base64ToBytes(parsed.ciphertext),
  );
  const decoded = decodeText(plaintext);
  const integrityHash = await digestSha256(decoded);

  if (integrityHash !== entry.contentHash) {
    throw new Error("Vault entry integrity check failed.");
  }

  return JSON.parse(decoded) as T;
}

export function summarizeVaultPayload(payload: VaultContentPayload) {
  return {
    title: payload.title,
    description: payload.description,
    entryType: payload.entryType,
    sourceMapId: payload.sourceMapId,
    sourceClaimId: payload.sourceClaimId,
    sourceSessionId: payload.sourceSessionId,
    capturedAt: payload.capturedAt,
  };
}
