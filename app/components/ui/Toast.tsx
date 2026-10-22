'use client'

import { useEffect, useRef } from 'react'
import { notify } from '@/app/lib/ui/notify'

/* Shared success/error toast. Since 2026-10-23 it no longer draws anything itself: it hands the message to the app-wide stack
   (app/components/ToastViewport.tsx, top-right, stacked, with a × on each) and clears the caller's own state straight away,
   so the same message can fire again. Callers keep passing `message` / `type` / `onClose` exactly as before. */

export type ToastType = 'success' | 'error'

type Props = {
  message: string | null
  type?: ToastType
  onClose: () => void
  durationMs?: number
}

export default function Toast({ message, type = 'success', onClose }: Props) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!message) return
    notify(message, type)
    closeRef.current()
  }, [message, type])
  return null
}
