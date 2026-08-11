// Microsoft OneDrive/SharePoint sharing-link resolution — Phase D of the
// HubSpot Forms integration. Unlike Google Drive, OneDrive sharing links
// (my.sharepoint.com browse URLs, 1drv.ms short links) don't expose a
// stable item ID in the visible URL — regex extraction isn't reliable.
// Uses Graph's "resolve a sharing URL" mechanism instead:
// https://learn.microsoft.com/en-us/graph/api/shares-get
// GET /v1.0/shares/{encoded}/driveItem, where encoded is the sharing URL
// base64url-encoded and prefixed with "u!".

export function encodeShareUrl(shareUrl: string): string {
  const base64 = Buffer.from(shareUrl, 'utf-8').toString('base64')
    .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  return `u!${base64}`
}

export async function resolveOneDriveFolder(shareUrl: string, accessToken: string): Promise<{ ok: boolean; folderId?: string; driveId?: string; name?: string; error?: string }> {
  const encoded = encodeShareUrl(shareUrl)
  const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,name,folder,parentReference`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return { ok: false, error: `Could not access that folder (${res.status}). Check the link and that you have access to it.` }
  const data = await res.json() as { id?: string; name?: string; folder?: unknown; parentReference?: { driveId?: string } }
  if (!data.folder) return { ok: false, error: 'That link points to a file, not a folder.' }
  if (!data.id || !data.parentReference?.driveId) return { ok: false, error: 'Could not resolve that folder — unexpected response from Microsoft.' }
  return { ok: true, folderId: data.id, driveId: data.parentReference.driveId, name: data.name }
}
