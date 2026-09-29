/**
 * common.ts — Shared API & UI Types
 * Phase 2: Next.js Foundation
 */

import type React from 'react';

// ─── Generic API Response ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  error: string | null;
}

// ─── Loading States ───────────────────────────────────────────────────────────

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T = unknown> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ─── UI Status Variants ───────────────────────────────────────────────────────

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type SizeVariant = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

// ─── Financial Types (matching legacy schema) ─────────────────────────────────

/** Currency amount stored as a number (₦) */
export type CurrencyAmount = number;

/** ISO date string yyyy-MM-dd */
export type ISODate = string;

/** ISO datetime string */
export type ISODateTime = string;

/** Database UUID */
export type UUID = string;

// ─── KPI Metric Card ──────────────────────────────────────────────────────────

export interface KPIMetric {
  id: string;
  label: string;
  value: string | number;
  formatted_value?: string;
  change?: number;
  change_direction?: 'up' | 'down' | 'neutral';
  change_period?: string;
  icon?: string;
  variant?: StatusVariant;
}

// ─── Select Option ────────────────────────────────────────────────────────────

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

// ─── Table Column ─────────────────────────────────────────────────────────────

export interface TableColumn<T = Record<string, unknown>> {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

// ─── Filter / Sort ────────────────────────────────────────────────────────────

export interface FilterState {
  search: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}
