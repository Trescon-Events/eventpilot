'use client'

import { use } from 'react'
import FiguresReviewView from '@/app/components/post-event/FiguresReviewView'

/* A client approver's personal review link for public figures. No sign-in: the link itself identifies the approver. See FiguresReviewView. */
export default function FiguresReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  return <FiguresReviewView url={`/api/public/figures-review/${encodeURIComponent(token)}`} />
}
