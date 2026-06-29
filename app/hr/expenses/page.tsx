'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
export default function RedirectToFinance() {
  const router = useRouter()
  useEffect(() => { router.replace('/finance/expenses') }, [router])
  return null
}
