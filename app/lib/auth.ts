export function signOut() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('trescademy_staff_id')
  localStorage.removeItem('tai_staff_id')
  sessionStorage.removeItem('tai_admin_authed')
  sessionStorage.removeItem('tai_admin_staff_id')
  window.location.href = '/login'
}
