/**
 * types/settings.ts
 * Re-exports Settings & Payment Accounts contracts and constants from types/finance.ts
 * Safe for use in both Server Components and Client Components.
 */

export type { FinanceSettingsData, PaymentAccountData } from './finance';
export { DEFAULT_FINANCE_SETTINGS, DEFAULT_PAYMENT_ACCOUNT } from './finance';
