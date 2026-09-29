/**
 * cn.ts — ClassNames Utility
 * Phase 2: Next.js Foundation
 * Merges class strings using clsx
 */
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
