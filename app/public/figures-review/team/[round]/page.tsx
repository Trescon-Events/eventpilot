'use client'

import { use, useCallback } from 'react'
import FiguresReviewView from '@/app/components/post-event/FiguresReviewView'

/* A colleague's review of public figures. They must be signed in and be one of the people the producer sent the round to (the API checks both). Lives under /public only so the
   page itself loads for the sign-in redirect; nothing is shown until the API accepts the signed-in person. */
export default function FiguresTeamReviewPage({ params }: { params: Promise<{ round: string }> }) {
  const { round } = use(params)
  const toLogin = useCallback(() => { window.location.href = `/login?next=${encodeURIComponent(`/public/figures-review/team/${round}`)}` }, [round])
  return <FiguresReviewView url={`/api/events/public-figures/review?round=${encodeURIComponent(round)}`} onUnauthed={toLogin} />
}
