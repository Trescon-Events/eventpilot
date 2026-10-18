import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/* Thin passthrough wrappers applying .tfield (app/globals.css) onto the native form elements. */

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`tfield ${className}`.trim()} {...rest} />
}

// Native select with our own chevron drawn 16px in from the right edge, so the arrow never touches the border (2026-10-18).
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none' stroke='%238a96a3' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E\")"

export function Select({ className = '', style, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`tfield ${className}`.trim()} style={{ appearance: 'none', WebkitAppearance: 'none', paddingRight: '40px', backgroundImage: CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', backgroundSize: '12px 8px', textOverflow: 'ellipsis', ...style }} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`tfield ${className}`.trim()} {...rest} />
}
