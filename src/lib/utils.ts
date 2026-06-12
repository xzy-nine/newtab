import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.origin
  } catch {
    return url
  }
}

export function formatSearchQuery(query: string): string {
  return encodeURIComponent(query.trim())
}
