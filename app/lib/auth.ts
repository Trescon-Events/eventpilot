export async function signOut() {
  if (typeof window === 'undefined') return
  // Clear server-side session cookie
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
  // Clear legacy client-side storage
  localStorage.removeItem('trescademy_staff_id')
  localStorage.removeItem('tai_staff_id')
  sessionStorage.removeItem('tai_admin_authed')
  sessionStorage.removeItem('tai_admin_staff_id')
  window.location.href = '/login'
}
