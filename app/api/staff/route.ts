import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nqwgxkdpwpgqkezaqsrx.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fxLPfAbQ8EL8HM5-NS_lqQ_0AMzCWCY';

async function getAuthenticatedClient(shopId: string, phoneHint?: string) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let phone = (phoneHint || '').replace(/\D/g, '').slice(-10);
  if (!phone || phone.length !== 10) {
    const { data: shop } = await client.from('shops').select('phone').eq('id', shopId).maybeSingle();
    if (shop?.phone) {
      phone = (shop.phone || '').replace(/\D/g, '').slice(-10);
    }
  }

  if (phone && phone.length === 10) {
    const email = `user_${phone}@stylefleet.salon`;
    const password = `StyleFleet_${phone}_SecureAuth!`;
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) {
      // Try sign up if not exists
      await client.auth.signUp({ email, password, options: { data: { phone } } });
    }
  }

  return client;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shopId, member, phoneHint } = body || {};

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }
    if (!member?.name || !member?.name.trim()) {
      return NextResponse.json({ success: false, error: 'Stylist name is required' }, { status: 400 });
    }

    const cleanPhone = (member.phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return NextResponse.json({ success: false, error: 'Valid 10-digit mobile number is required' }, { status: 400 });
    }

    const client = await getAuthenticatedClient(shopId, phoneHint);

    const insertPayload = {
      ...(member.id ? { id: member.id } : {}),
      shop_id: shopId,
      name: member.name.trim(),
      phone: cleanPhone,
      role: member.role || 'Stylist',
      is_active: true,
      target_amount_minor: 500000,
      invitation_status: 'not_invited',
      rating: '5.0',
      permissions: {
        customers: true,
        sales: true,
        appointments: true,
        expenses: false,
        reports: false,
        team: false,
        reminders: true,
        profile: false,
        expensesHistory: false,
        shareBills: false,
      },
    };

    const { data, error } = await client
      .from('staff')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      console.error('[API /api/staff POST error]:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id || member.id });
  } catch (error: any) {
    console.error('[API /api/staff POST exception]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { shopId, staffId, updates, phoneHint } = body || {};

    if (!shopId || !staffId) {
      return NextResponse.json({ success: false, error: 'shopId and staffId are required' }, { status: 400 });
    }

    const client = await getAuthenticatedClient(shopId, phoneHint);

    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.phone !== undefined) payload.phone = (updates.phone || '').replace(/\D/g, '').slice(-10);
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.is_active !== undefined) payload.is_active = !!updates.is_active;
    if (updates.status !== undefined) payload.is_active = updates.status === 'active';
    if (updates.rating !== undefined) payload.rating = updates.rating;
    if (updates.permissions !== undefined) {
      const permsArray = updates.permissions || [];
      payload.permissions = {
        customers: permsArray.includes('customers'),
        sales: permsArray.includes('sales'),
        appointments: permsArray.includes('appointments'),
        reminders: permsArray.includes('reminders'),
        expenses: permsArray.includes('expenses'),
        reports: permsArray.includes('reports'),
        team: permsArray.includes('team'),
        profile: permsArray.includes('profile'),
        past_expenses: permsArray.includes('past_expenses'),
        expensesHistory: permsArray.includes('past_expenses'),
        full_reports: permsArray.includes('full_reports'),
        reportsHistory: permsArray.includes('full_reports'),
        share_bills: permsArray.includes('share_bills'),
        shareBills: permsArray.includes('share_bills'),
        clear_dues: permsArray.includes('clear_dues'),
        clearDues: permsArray.includes('clear_dues'),
      };
    }
    payload.updated_at = new Date().toISOString();

    const { error } = await client
      .from('staff')
      .update(payload)
      .eq('id', staffId)
      .eq('shop_id', shopId);

    if (error) {
      console.error('[API /api/staff PATCH error]:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/staff PATCH exception]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');
    const staffId = url.searchParams.get('staffId');
    const phoneHint = url.searchParams.get('phoneHint') || undefined;

    if (!shopId || !staffId) {
      return NextResponse.json({ success: false, error: 'shopId and staffId are required' }, { status: 400 });
    }

    const client = await getAuthenticatedClient(shopId, phoneHint);

    const { error } = await client
      .from('staff')
      .delete()
      .eq('shop_id', shopId)
      .eq('id', staffId);

    if (error) {
      console.error('[API /api/staff DELETE error]:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /api/staff DELETE exception]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}
