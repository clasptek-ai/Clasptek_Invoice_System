import { NextResponse } from 'next/server';
import { getAuthoritativeSession } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customers
 * Returns customer list for corporate sponsor / billing customer linking.
 * Tenant isolated, authenticated session verified.
 */
export async function GET() {
  try {
    const session = await getAuthoritativeSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, phone, address, total_invoiced, total_paid, outstanding_balance')
      .eq('tenant_id', session.tenantId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[GET /api/customers error]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        totalInvoiced: Number(c.total_invoiced || 0),
        totalPaid: Number(c.total_paid || 0),
        outstandingBalance: Number(c.outstanding_balance || 0),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
