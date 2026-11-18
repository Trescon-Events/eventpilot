'use client'

/* Google Drive file picker button. Loads the Google Identity Services and Picker APIs from the CDN on first click (no eager loading).
   Requires NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY in the environment.
   The user grants drive.readonly on the OAuth popup; the returned access token is forwarded to the server for the drive_import job. */

import { useRef, useState } from 'react'
import { Button } from '@/app/components/ui'

export type DriveFile = {
  id: string
  name: string
  sizeBytes: number
  mimeType: string
  accessToken: string
}

interface Props {
  onPick: (f: DriveFile) => void
  disabled?: boolean
}

type PickerDoc = { id: string; name: string; sizeBytes: number; mimeType: string }
type PickerData = { action: string; docs?: PickerDoc[] }

interface PickerBuilderChain {
  addView: (v: unknown) => PickerBuilderChain
  setOAuthToken: (t: string) => PickerBuilderChain
  setDeveloperKey: (k: string) => PickerBuilderChain
  setCallback: (cb: (d: PickerData) => void) => PickerBuilderChain
  build: () => { setVisible: (v: boolean) => void }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }) => { requestAccessToken: () => void }
        }
      }
      picker?: {
        Action: { PICKED: string }
        DocsView: new (viewId: string) => unknown
        PickerBuilder: new () => PickerBuilderChain
        ViewId: { DOCS_VIDEOS: string }
      }
    }
    gapi?: { load: (lib: string, cb: () => void) => void }
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script'); s.src = src; s.async = true
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export default function DrivePickerButton({ onPick, disabled }: Props) {
  const [loading, setLoading] = useState(false)
  const tokenRef = useRef<string | null>(null)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY

  if (!clientId || !apiKey) return null   // env vars not set: button is hidden

  async function openPicker(cid: string, akey: string) {
    setLoading(true)
    try {
      await Promise.all([
        loadScript('https://accounts.google.com/gsi/client'),
        loadScript('https://apis.google.com/js/api.js'),
      ])
      await new Promise<void>(r => window.gapi!.load('picker', r))

      await new Promise<void>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: cid,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: res => {
            if (res.error || !res.access_token) { reject(new Error(res.error ?? 'No access token')); return }
            tokenRef.current = res.access_token
            resolve()
          },
        })
        client.requestAccessToken()
      })

      const token = tokenRef.current!
      const p = window.google!.picker!

      new p.PickerBuilder()
        .addView(new p.DocsView(p.ViewId.DOCS_VIDEOS))
        .setOAuthToken(token)
        .setDeveloperKey(akey)
        .setCallback((data: PickerData) => {
          if (data.action !== p.Action.PICKED) return
          const doc = data.docs?.[0]; if (!doc) return
          onPick({ id: doc.id, name: doc.name, sizeBytes: doc.sizeBytes, mimeType: doc.mimeType, accessToken: token })
        })
        .build()
        .setVisible(true)
    } catch (e) {
      console.error('[DrivePickerButton]', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="ghost" disabled={disabled || loading} onClick={() => void openPicker(clientId, apiKey)}>
      {loading ? 'Opening Drive…' : 'Browse Google Drive'}
    </Button>
  )
}
