/*
(1.) Cryptographic utilities for secure API key generation and hashing using Web Crypto API.
(2.) Key generation uses crypto.getRandomValues for cryptographically secure random bytes.
(3.) Base62 encoding provides URL-safe keys without special characters requiring escaping.
(4.) SHA-256 hashing via crypto.subtle ensures one-way transformation of plaintext keys.
(5.) Hint generation extracts first and last characters for user-friendly key identification.

This module implements security-critical cryptographic operations for API key management.
The generateKey function produces 32 bytes of entropy (256 bits) using the browser's
cryptographically secure random number generator, then encodes to base62 for readability
and URL safety. The hashKey function uses SHA-256 to create irreversible hashes stored
in the database, ensuring plaintext keys never persist. The hint generation provides
user-friendly key identification (e.g., "sk_l...x7q2") without exposing the full key
value. All functions are synchronous where possible for performance, with async hashing
required by the Web Crypto API specification.
*/

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generate a cryptographically secure random API key.
 * @param prefix - Key prefix (e.g., "sk_live_", "pk_test_")
 * @param bytes - Number of random bytes to generate (default: 32)
 * @returns Plaintext API key with prefix
 */
export function generateKey(prefix: string, bytes: number = 32): string {
  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  
  const encoded = base62Encode(randomBytes);
  return `${prefix}${encoded}`;
}

/**
 * Encode bytes to base62 string.
 * @param bytes - Byte array to encode
 * @returns Base62 encoded string
 */
function base62Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (let i = 0; i < bytes.length; i++) {
    num = (num << 8n) | BigInt(bytes[i]);
  }
  
  if (num === 0n) {
    return BASE62_CHARS[0];
  }
  
  let result = "";
  while (num > 0n) {
    result = BASE62_CHARS[Number(num % 62n)] + result;
    num = num / 62n;
  }
  
  return result;
}

/**
 * Hash an API key using SHA-256.
 * @param key - Plaintext API key
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Generate a hint from an API key for display purposes.
 * Shows first 4 characters after prefix and last 4 characters.
 * @param key - Plaintext API key
 * @returns Hint string (e.g., "sk_l...x7q2")
 */
export function generateHint(key: string): string {
  if (key.length < 12) {
    return key;
  }
  
  const prefixEnd = key.indexOf("_") + 1;
  if (prefixEnd === 0) {
    const start = key.slice(0, 4);
    const end = key.slice(-4);
    return `${start}...${end}`;
  }
  
  const prefix = key.slice(0, prefixEnd);
  const remaining = key.slice(prefixEnd);
  
  if (remaining.length < 8) {
    return key;
  }
  
  const start = remaining.slice(0, 4);
  const end = remaining.slice(-4);
  return `${prefix}${start}...${end}`;
}

/**
 * Extract prefix from an API key.
 * @param key - Plaintext API key
 * @returns Prefix string (e.g., "sk_live_")
 */
export function extractPrefix(key: string): string {
  const underscoreIndex = key.indexOf("_");
  if (underscoreIndex === -1) {
    return "";
  }
  return key.slice(0, underscoreIndex + 1);
}
