import crypto from 'crypto'

/* AES-256-GCM encrypt/decrypt for OAuth tokens at rest — the first
   reversible-encryption pattern in this codebase (staff_members.password_hash
   is one-way bcrypt; the existing canva_tokens table stores tokens in
   plaintext). Deliberate uplift here: staff_oauth_connections grants broad
   Drive/OneDrive WRITE access and sits directly upstream of passport/
   national-ID document handling (Phase D of the HubSpot Forms integration).

   Key: OAUTH_TOKEN_ENCRYPTION_KEY, 64 hex chars (32 bytes) — generate with
   `openssl rand -hex 32`. Encoded output is base64(iv(12) + authTag(16) + ciphertext). */

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.OAUTH_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY not configured')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return key
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export function decryptToken(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
