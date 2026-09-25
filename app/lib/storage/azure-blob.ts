import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob'
import { ClientSecretCredential } from '@azure/identity'

/* Azure Blob Storage (UAE North / Dubai) for Passport / National ID documents and licence
   copies (2026-09-26). Supabase has no Middle East region (this project is in Singapore),
   and Madhu wants these documents STORED in the UAE.

   Account `tresconeventpilotdocs`: private, zone-redundant, HTTPS-only, account keys DISABLED —
   the only way in is the app's own identity ("EventPilot Documents (Railway)"), which holds
   one role (Storage Blob Data Contributor) on each of the two containers and nothing else.

   Env (Railway + .env.local): AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (expires
   25 Sep 2027 — rotate before then), AZURE_STORAGE_ACCOUNT, AZURE_DOCS_CONTAINER,
   AZURE_LICENSE_CONTAINER. Which backend is USED is decided by DOCUMENT_STORAGE_BACKEND
   (see sensitive-storage.ts / license-storage.ts) — this file only talks to Azure. */

export type AzureContainerKey = 'docs' | 'license'

const REQUIRED = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_STORAGE_ACCOUNT', 'AZURE_DOCS_CONTAINER', 'AZURE_LICENSE_CONTAINER'] as const

export function azureConfigured(): boolean {
  return REQUIRED.every(k => !!process.env[k])
}

let service: BlobServiceClient | null = null
function getService(): BlobServiceClient {
  if (!azureConfigured()) throw new Error('Azure storage is not configured (missing AZURE_* settings)')
  if (!service) {
    const credential = new ClientSecretCredential(process.env.AZURE_TENANT_ID!, process.env.AZURE_CLIENT_ID!, process.env.AZURE_CLIENT_SECRET!)
    service = new BlobServiceClient(`https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`, credential)
  }
  return service
}

function container(key: AzureContainerKey): ContainerClient {
  return getService().getContainerClient(key === 'docs' ? process.env.AZURE_DOCS_CONTAINER! : process.env.AZURE_LICENSE_CONTAINER!)
}

const isNotFound = (e: unknown) => e instanceof RestError && e.statusCode === 404

/** Writes a new blob. Refuses to overwrite an existing one (same rule the Supabase upload had: upsert false). */
export async function azureUpload(key: AzureContainerKey, path: string, body: Uint8Array, contentType: string): Promise<void> {
  await container(key).getBlockBlobClient(path).uploadData(body, {
    blobHTTPHeaders: { blobContentType: contentType },
    conditions: { ifNoneMatch: '*' },
  })
}

/** The blob's bytes, or null if it doesn't exist. */
export async function azureDownload(key: AzureContainerKey, path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await container(key).getBlobClient(path).downloadToBuffer())
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

export async function azureDelete(key: AzureContainerKey, path: string): Promise<void> {
  await container(key).getBlobClient(path).deleteIfExists()
}

export async function azureExists(key: AzureContainerKey, path: string): Promise<boolean> {
  return container(key).getBlobClient(path).exists()
}
