/**
 * app/api/admin/payment-accounts/route.ts
 * Authoritative Server Endpoint for Settlement Bank Accounts
 * Phase 9B: Administration & Governance Module Migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getPaymentAccounts } from '@/lib/settings/queries';
import { createServerClient } from '@/lib/supabase/server';
import { recordFinanceAuditLog } from '@/lib/finance/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin', 'Finance Manager'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  const accounts = await getPaymentAccounts(auth.session.tenantId);
  return NextResponse.json({ success: true, data: accounts });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const { bankName, accountName, accountNumber, accountType, currency, instructions, isDefault } = body;

    if (!bankName || !accountName || !accountNumber) {
      return NextResponse.json(
        { success: false, error: 'Bank name, account name, and account number are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const accountId = body.id || `acc_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

    if (isDefault) {
      // Clear previous default
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('tenant_id', auth.session.tenantId);
    }

    const newAccount = {
      id: accountId,
      tenant_id: auth.session.tenantId,
      bank_name: bankName.trim(),
      account_name: accountName.trim(),
      account_number: accountNumber.trim(),
      account_type: accountType || 'Corporate Current',
      currency: currency || 'NGN',
      is_default: Boolean(isDefault),
      is_active: true,
      instructions: instructions?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('payment_accounts').upsert(newAccount);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await recordFinanceAuditLog({
      tenantId: auth.session.tenantId,
      action: body.id ? 'UPDATE_PAYMENT_ACCOUNT' : 'CREATE_PAYMENT_ACCOUNT',
      entityType: 'payment_account',
      entityId: accountId,
      entityName: bankName,
      actorId: auth.session.user.id,
      actorRole: auth.session.role,
      reason: `Configured payment settlement account ${accountNumber} (${bankName})`,
      source: 'settings',
      newState: newAccount,
    });

    return NextResponse.json({ success: true, data: newAccount }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, {
    allowedRoles: ['Super Admin'],
  });
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Account ID is required' }, { status: 400 });
    }

    const supabase = await createServerClient();

    if (action === 'set-default') {
      // Unset all defaults in tenant
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('tenant_id', auth.session.tenantId);

      // Set this account as default
      await supabase
        .from('payment_accounts')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', auth.session.tenantId);

      await recordFinanceAuditLog({
        tenantId: auth.session.tenantId,
        action: 'SET_DEFAULT_ACCOUNT',
        entityType: 'payment_account',
        entityId: id,
        actorId: auth.session.user.id,
        actorRole: auth.session.role,
        reason: 'Set as Default Payment Account',
        source: 'settings',
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'toggle-active') {
      const { data: curr } = await supabase
        .from('payment_accounts')
        .select('is_active')
        .eq('id', id)
        .eq('tenant_id', auth.session.tenantId)
        .single();

      const nextActive = curr ? !curr.is_active : false;

      await supabase
        .from('payment_accounts')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', auth.session.tenantId);

      await recordFinanceAuditLog({
        tenantId: auth.session.tenantId,
        action: 'TOGGLE_ACCOUNT_STATUS',
        entityType: 'payment_account',
        entityId: id,
        actorId: auth.session.user.id,
        actorRole: auth.session.role,
        reason: `Set payment account active state to ${nextActive}`,
        source: 'settings',
      });

      return NextResponse.json({ success: true, isActive: nextActive });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
