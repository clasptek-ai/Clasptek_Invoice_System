/**
 * lib/settings/queries.ts
 * Authoritative Server Queries for Finance Settings & Payment Accounts
 * Phase 9B: Administration & Governance Module Migration
 */

import { createServerClient } from '@/lib/supabase/server';
import { recordFinanceAuditLog } from '@/lib/finance/queries';

export interface FinanceSettingsData {
  companyName: string;
  tradingName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  registrationNumber: string;
  invoiceFooter: string;
  defaultTerms: string;
  defaultInstructions?: string;
}

export interface PaymentAccountData {
  id: string;
  tenantId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  instructions?: string | null;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettingsData = {
  companyName: 'CLASPTEK COACHING LIMITED',
  tradingName: 'Clasptek Coaching Limited',
  address: '1, Baptist Close Off Access Ibiyemi Avenue, Access International School Bus-stop, Magboro, Ogun 110115 NG',
  phone: '+2347041316925',
  email: 'info@clasptek.org',
  website: 'https://clasptek.org',
  taxId: 'TIN-9842104-001',
  registrationNumber: 'RC-1849201',
  invoiceFooter: 'Thank you for choosing Clasptek Coaching Limited! Learn | Lead | Impact — clasptek.org',
  defaultTerms: 'Payment is due according to the schedule specified above. Certificates and course completion verification are issued upon full settlement of tuition fees.',
  defaultInstructions: 'Please use invoice number as your payment reference.',
};

/**
 * Fetch company finance settings for tenant
 */
export async function getFinanceSettings(tenantId: string): Promise<FinanceSettingsData> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('finance_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_FINANCE_SETTINGS;
  }

  return {
    companyName: data.company_name || DEFAULT_FINANCE_SETTINGS.companyName,
    tradingName: data.trading_name || DEFAULT_FINANCE_SETTINGS.tradingName,
    address: data.address || DEFAULT_FINANCE_SETTINGS.address,
    phone: data.phone || DEFAULT_FINANCE_SETTINGS.phone,
    email: data.email || DEFAULT_FINANCE_SETTINGS.email,
    website: data.website || DEFAULT_FINANCE_SETTINGS.website,
    taxId: data.tax_id || DEFAULT_FINANCE_SETTINGS.taxId,
    registrationNumber: data.registration_number || DEFAULT_FINANCE_SETTINGS.registrationNumber,
    invoiceFooter: data.invoice_footer || DEFAULT_FINANCE_SETTINGS.invoiceFooter,
    defaultTerms: data.default_terms || DEFAULT_FINANCE_SETTINGS.defaultTerms,
  };
}

/**
 * Update company finance settings
 */
export async function updateFinanceSettings(
  tenantId: string,
  actor: { id: string; role: string },
  settings: Partial<FinanceSettingsData>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient();
  const settingsId = `set_${tenantId.slice(0, 8)}`;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('finance_settings')
    .upsert({
      id: settingsId,
      tenant_id: tenantId,
      company_name: settings.companyName,
      trading_name: settings.tradingName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      tax_id: settings.taxId,
      registration_number: settings.registrationNumber,
      invoice_footer: settings.invoiceFooter,
      default_terms: settings.defaultTerms,
      updated_at: now,
    }, { onConflict: 'tenant_id' });

  if (error) {
    return { success: false, error: error.message };
  }

  await recordFinanceAuditLog({
    tenantId,
    action: 'UPDATE_SETTINGS',
    entityType: 'finance_settings',
    entityId: settingsId,
    actorId: actor.id,
    actorRole: actor.role,
    reason: 'Updated company legal and invoice configuration',
    source: 'settings',
    newState: settings,
  });

  return { success: true };
}

/**
 * Fetch payment accounts
 */
export async function getPaymentAccounts(tenantId: string): Promise<PaymentAccountData[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('payment_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false });

  if (error) {
    console.error('Error fetching payment accounts:', error.message);
    return [];
  }

  return (data || []).map((a) => ({
    id: a.id,
    tenantId: a.tenant_id,
    bankName: a.bank_name,
    accountName: a.account_name,
    accountNumber: a.account_number,
    accountType: a.account_type || 'Corporate Current',
    currency: a.currency || 'NGN',
    isDefault: Boolean(a.is_default),
    isActive: Boolean(a.is_active !== false),
    instructions: a.instructions,
  }));
}
