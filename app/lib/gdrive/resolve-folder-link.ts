// Google Drive folder link resolution — Phase D of the HubSpot Forms
// integration. Drive's folder-link format is stable
// (drive.google.com/drive/folders/{id}), so a regex extraction is
// reliable without an API round trip. One validation call is still made
// (with the CONFIGURING PRODUCER's own token) purely to catch typos/
// wrong-account mistakes at config time rather than at first-copy time.

const FOLDER_ID_RE = /\/folders\/([a-zA-Z0-9_-]+)/

export function extractGoogleFolderId(url: string): string | null {
  const match = url.match(FOLDER_ID_RE)
  return match ? match[1] : null
}

export async function validateGoogleFolder(folderId: string, accessToken: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return { ok: false, error: `Could not access that folder (${res.status}). Check the link and that you have access to it.` }
  const data = await res.json() as { name?: string; mimeType?: string }
  if (data.mimeType !== 'application/vnd.google-apps.folder') return { ok: false, error: 'That link points to a file, not a folder.' }
  return { ok: true, name: data.name }
}
