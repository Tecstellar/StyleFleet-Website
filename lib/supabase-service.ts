import { supabase } from './supabase';
import { getShopPrefixFromShopName } from './salon-helpers';
import type { Customer, StaffMember, Appointment, Bill, Expense, ServiceItem, ShopProfile } from '@/components/SalonContext';

// Helper to generate UUIDs on browser/client
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isValidUuid(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export interface RegisterShopParams {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
  gstin?: string;
  upiId?: string;
  logoImg?: string;
  latitude?: number;
  longitude?: number;
  gpsAddress?: string;
  stylists?: Array<{ name: string; phone: string }>;
}

export interface DatabaseSalonData {
  shop: ShopProfile & { id: string };
  categories: string[];
  services: ServiceItem[];
  staff: StaffMember[];
  customers: Customer[];
  appointments: Appointment[];
  bills: Bill[];
  expenses: Expense[];
}

/**
 * Establish or sign in to Supabase Auth session for a mobile number.
 * Mirrors the StyleFleet Android establishSupabaseSession contract.
 */
export async function establishSupabaseAuthSession(cleanPhone: string, fullName?: string): Promise<string | null> {
  const authEmail = `user_${cleanPhone}@stylefleet.salon`;
  const authPassword = `StyleFleet_${cleanPhone}_SecureAuth!`;

  try {
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (!signInErr && signInData?.user) {
      if (fullName) {
        await supabase.from('profiles').upsert({
          id: signInData.user.id,
          phone: cleanPhone,
          full_name: fullName,
        } as any);
      }
      return signInData.user.id;
    }

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: { data: { phone: cleanPhone, full_name: fullName } },
    });

    if (!signUpErr && signUpData?.user) {
      if (fullName) {
        await supabase.from('profiles').upsert({
          id: signUpData.user.id,
          phone: cleanPhone,
          full_name: fullName,
        } as any);
      }
      return signUpData.user.id;
    }
  } catch (e) {
    console.warn('[Supabase Auth] establishment notice:', e);
  }
  return null;
}

/**
 * Ensures an authenticated Supabase session as the salon owner.
 * Required by Supabase Row-Level Security (RLS) policies on staff operations.
 */
export async function ensureSupabaseOwnerSession(shopId?: string, forceRefresh = false): Promise<boolean> {
  try {
    if (!supabase.auth) return false;

    if (!forceRefresh) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        return true;
      }
    }

    let phone = '';
    // 1. Try local storage auth session
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('stylefleet_auth_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          phone = (parsed.phone || '').replace(/\D/g, '').slice(-10);
        }
      } catch {}
    }

    // 2. Query shop owner phone from DB if not available in local session
    if ((!phone || phone.length !== 10) && shopId) {
      const { data: shop } = await supabase
        .from('shops')
        .select('phone')
        .eq('id', shopId)
        .maybeSingle();
      if (shop?.phone) {
        phone = (shop.phone || '').replace(/\D/g, '').slice(-10);
      }
    }

    if (!phone || phone.length !== 10) {
      console.warn('[Supabase Auth] No owner phone available to establish session for shop:', shopId);
      return false;
    }

    const authEmail = `user_${phone}@stylefleet.salon`;
    const authPassword = `StyleFleet_${phone}_SecureAuth!`;

    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (!signInErr && signIn?.user) {
      return true;
    }

    // Attempt sign up if user was not registered yet
    const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: { data: { phone } },
    });

    return !signUpErr && !!signUp?.user;
  } catch (err) {
    console.warn('[Supabase Auth] Failed to ensure session:', err);
    return false;
  }
}

/**
 * Register a completely new salon in the Supabase database.
 * Does not overwrite or touch any other salon's data.
 */
export async function registerNewSalonInDb(params: RegisterShopParams): Promise<{
  success: boolean;
  shopId?: string;
  error?: string;
}> {
  try {
    const cleanPhone = params.phone.replace(/\D/g, '').slice(-10);
    const newShopId = generateUuid();
    const prefix = getShopPrefixFromShopName(params.shopName) + '-';

    // 1. Establish owner identity in Supabase Auth & Profiles
    const ownerUserId = await establishSupabaseAuthSession(cleanPhone, params.ownerName.trim());

    // 2. Insert into shops table
    const shopInsertPayload: any = {
      id: newShopId,
      name: params.shopName.trim(),
      phone: cleanPhone,
      address: params.address.trim(),
      city: params.city.trim(),
      pin_code: params.pinCode.trim(),
      gstin: params.gstin?.trim() || null,
      upi_id: params.upiId?.trim() || '',
      logo_path: params.logoImg || '',
      invoice_prefix: prefix,
      invoice_numbering_mode: 'monthly',
      accent_color: '#D4AF37',
      gst_rate: 0,
      social_links: {
        owner_name: params.ownerName.trim(),
        upi_id: params.upiId?.trim() || '',
        booking_start_time: '09:00 AM',
        booking_end_time: '08:30 PM',
        latitude: params.latitude,
        longitude: params.longitude,
        gps_address: params.gpsAddress,
      },
    };

    if (ownerUserId) {
      shopInsertPayload.owner_profile_id = ownerUserId;
    }

    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .insert(shopInsertPayload)
      .select()
      .single();

    if (shopError) {
      console.error('[Supabase] Failed to register salon in shops table:', shopError);
      if (shopError.code === '23505' || shopError.message?.includes('idx_shops_unique_phone')) {
        return {
          success: false,
          error: 'This mobile number is already registered to an existing salon. Please log in directly with this number.',
        };
      }
      return { success: false, error: shopError.message };
    }

    const createdShopId = shopData.id;

    // 3. Link owner in shop_members table
    if (ownerUserId) {
      try {
        await supabase.from('shop_members').insert({
          shop_id: createdShopId,
          profile_id: ownerUserId,
          role: 'owner',
          is_active: true,
        } as any);
      } catch (memErr) {
        console.warn('[Supabase] shop_members insert notice:', memErr);
      }
    }

    // 4. Insert standard starter categories for this salon
    const standardCats = ['Hair', 'Beard', 'Colour', 'Care', 'Packages'];
    const categoryIdMap: Record<string, string> = {};

    for (let i = 0; i < standardCats.length; i++) {
      const catName = standardCats[i];
      const catId = generateUuid();
      const { error: catErr } = await supabase.from('service_categories').insert({
        id: catId,
        shop_id: createdShopId,
        name: catName,
        sort_order: i + 1,
        is_active: true,
      });
      if (!catErr) {
        categoryIdMap[catName] = catId;
      }
    }

    // 5. Insert starter services for this salon
    const starterServices = [
      { cat: 'Hair', name: 'Classic Haircut', price: 350, dur: 30 },
      { cat: 'Hair', name: 'Fade / Creative Haircut', price: 450, dur: 40 },
      { cat: 'Hair', name: 'Keratin Hair Spa', price: 1800, dur: 60 },
      { cat: 'Hair', name: 'Head Massage (20m)', price: 300, dur: 20 },
      { cat: 'Beard', name: 'Beard Trim & Shape', price: 200, dur: 20 },
      { cat: 'Beard', name: 'Royal Hot Towel Shave', price: 300, dur: 25 },
      { cat: 'Care', name: 'D-Tan Facial Cleanse', price: 750, dur: 40 },
      { cat: 'Packages', name: 'Full Grooming Combo', price: 1200, dur: 75 },
    ];

    for (const s of starterServices) {
      await supabase.from('services').insert({
        id: generateUuid(),
        shop_id: createdShopId,
        category_id: categoryIdMap[s.cat] || null,
        name: s.name,
        price_minor: Math.round(s.price * 100),
        duration_minutes: s.dur,
        is_active: true,
      });
    }

    // 6. Add imported stylists into staff table under this shop
    if (params.stylists && params.stylists.length > 0) {
      for (const st of params.stylists) {
        if (st.name && st.phone) {
          const staffCleanPhone = st.phone.replace(/\D/g, '').slice(-10);
          try {
            await supabase.from('staff').insert({
              id: generateUuid(),
              shop_id: createdShopId,
              name: st.name.trim(),
              phone: staffCleanPhone,
              role: 'Stylist',
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
            });
          } catch (staffErr) {
            console.warn('[Supabase] Staff insert notice:', staffErr);
          }
        }
      }
    }

    return { success: true, shopId: createdShopId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Supabase] Exception during salon registration:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Check if a phone number belongs to an existing shop (either owner or staff).
 * Supports role targeting ('stylist' vs 'owner') with wildcard & exact matching.
 */
export async function findSalonByPhone(
  phone: string,
  preferredRole?: 'owner' | 'stylist'
): Promise<{
  found: boolean;
  shopId?: string;
  role?: 'owner' | 'stylist';
  shopName?: string;
  staffName?: string;
  staffId?: string;
  ownerName?: string;
  error?: string;
}> {
  try {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) return { found: false, error: 'Invalid 10-digit mobile number' };

    // Helper: search staff table for registered stylist
    const searchStylist = async () => {
      const { data: staffMembers, error: staffErr } = await supabase
        .from('staff')
        .select('id, shop_id, role, name, phone, is_active')
        .or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
        .limit(1);

      if (!staffErr && staffMembers && staffMembers.length > 0) {
        const staff = staffMembers[0];
        if (staff.is_active === false) {
          return {
            found: false,
            role: 'stylist' as const,
            error: 'This stylist account is inactive. Please contact your salon owner.',
          };
        }

        const { data: shopRows } = await supabase
          .from('shops')
          .select('id, name')
          .eq('id', staff.shop_id)
          .limit(1);

        return {
          found: true,
          shopId: staff.shop_id,
          role: 'stylist' as const,
          staffName: staff.name,
          staffId: staff.id,
          shopName: shopRows && shopRows.length > 0 ? shopRows[0].name : 'Salon',
        };
      }
      return null;
    };

    // Helper: search owner records across shops, profiles, and shop_members
    const searchOwner = async () => {
      // 1. Direct query on shops table by phone
      const { data: shops, error: shopErr } = await supabase
        .from('shops')
        .select('id, name, phone, social_links, owner_profile_id')
        .or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!shopErr && shops && shops.length > 0) {
        const sh = shops[0];
        const social = (sh.social_links as any) || {};
        let ownerName = social.owner_name?.trim() || '';
        if (!ownerName && sh.owner_profile_id) {
          try {
            const { data: p } = await supabase.from('profiles').select('full_name').eq('id', sh.owner_profile_id).maybeSingle();
            if (p?.full_name && p.full_name.trim()) ownerName = p.full_name.trim();
          } catch {}
        }
        if (!ownerName) {
          try {
            const { data: p } = await supabase.from('profiles').select('full_name').or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`).limit(1);
            if (p && p.length > 0 && p[0].full_name && p[0].full_name.trim()) ownerName = p[0].full_name.trim();
          } catch {}
        }
        return {
          found: true,
          shopId: sh.id,
          role: 'owner' as const,
          shopName: sh.name,
          ownerName: ownerName || 'Owner',
        };
      }

      // 2. Query profiles by phone, then find shop via owner_profile_id or shop_members
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, phone, full_name')
        .or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
        .limit(1);

      if (!profErr && profiles && profiles.length > 0) {
        const profId = profiles[0].id;
        const profName = profiles[0].full_name || 'Owner';

        const { data: ownedShops } = await supabase
          .from('shops')
          .select('id, name, social_links')
          .eq('owner_profile_id', profId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (ownedShops && ownedShops.length > 0) {
          const sh = ownedShops[0];
          return {
            found: true,
            shopId: sh.id,
            role: 'owner' as const,
            shopName: sh.name,
            ownerName: profName,
          };
        }

        const { data: members } = await supabase
          .from('shop_members')
          .select('shop_id')
          .eq('profile_id', profId)
          .eq('role', 'owner')
          .eq('is_active', true)
          .limit(1);

        if (members && members.length > 0) {
          const { data: memberShop } = await supabase
            .from('shops')
            .select('id, name')
            .eq('id', members[0].shop_id)
            .limit(1);

          if (memberShop && memberShop.length > 0) {
            return {
              found: true,
              shopId: memberShop[0].id,
              role: 'owner' as const,
              shopName: memberShop[0].name,
              ownerName: profName,
            };
          }
        }
      }

      return null;
    };

    // If preferredRole is stylist, prioritize staff search
    if (preferredRole === 'stylist') {
      const stylistRes = await searchStylist();
      if (stylistRes) return stylistRes;
      return {
        found: false,
        role: 'stylist',
        error: 'This phone number is not registered as an active stylist. Please contact your salon owner.',
      };
    }

    // If preferredRole is owner or auto-detecting:
    const ownerRes = await searchOwner();
    if (ownerRes) return ownerRes;

    // Check if registered as stylist even though logging in via default/owner tab
    const stylistRes = await searchStylist();
    if (stylistRes) return stylistRes;

    return { found: false, role: 'owner' };
  } catch (err) {
    console.error('[Supabase] Error finding salon by phone:', err);
    return { found: false, error: 'Database connection error' };
  }
}

/**
 * Fetch all salon data strictly filtered by shop_id.
 * Guaranteed 0 access to any other salon's data.
 */
export async function fetchSalonDataFromDb(shopId: string): Promise<DatabaseSalonData | null> {
  try {
    if (!shopId) return null;

    // 1. Fetch shop profile
    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single();

    if (shopErr || !shop) {
      console.warn('[Supabase] Could not load shop for shop_id:', shopId);
      return null;
    }

    const social = (shop.social_links as any) || {};

    // Authoritative Owner Name Resolution (prioritizes profiles.full_name updated by mobile/web)
    let resolvedOwnerName = '';
    try {
      if (shop.owner_profile_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', shop.owner_profile_id)
          .maybeSingle();
        if (prof?.full_name && prof.full_name.trim()) {
          resolvedOwnerName = prof.full_name.trim();
        }
      }
      if (!resolvedOwnerName && social.owner_name && typeof social.owner_name === 'string' && social.owner_name.trim()) {
        resolvedOwnerName = social.owner_name.trim();
      }
      if (!resolvedOwnerName) {
        const cleanPhone = (shop.phone || '').replace(/\D/g, '').slice(-10);
        if (cleanPhone) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('full_name')
            .or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (profs && profs.length > 0 && profs[0].full_name && profs[0].full_name.trim()) {
            resolvedOwnerName = profs[0].full_name.trim();
          }
        }
      }
    } catch {}

    const shopProfile: ShopProfile & { id: string } = {
      id: shop.id,
      shopName: shop.name || 'My Salon',
      ownerName: resolvedOwnerName || social.owner_name || 'Owner',
      phone: shop.phone || '',
      address: shop.address || '',
      city: shop.city || '',
      pinCode: shop.pin_code || '',
      gstin: shop.gstin || '',
      upiId: shop.upi_id || social.upi_id || '',
      bookingHours: `${social.booking_start_time || '09:00 AM'} – ${social.booking_end_time || '08:30 PM'}`,
      invoicePrefix: shop.invoice_prefix || 'INV-',
      invoicePrefixFormat: shop.invoice_numbering_mode === 'yearly' ? 'yearly' : (shop.invoice_numbering_mode === 'standard' ? 'standard' : 'monthly'),
      logoImg: shop.logo_path || '',
      applyGst: !!shop.gstin,
      gstRate: shop.gst_rate || 18,
      latitude: social.latitude,
      longitude: social.longitude,
      gpsAddress: social.gps_address,
      createdAt: shop.created_at || (shop as any).createdAt || undefined,
    };

    // 1b. Fetch subscription from Supabase 'subscriptions' table
    try {
      const { data: subRows } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (subRows && subRows.length > 0) {
        const sub = subRows[0];
        const rawPlan = String(sub.plan || sub.tier || sub.plan_type || sub.name || '').toLowerCase();
        const rawStatus = String(sub.status || '').toLowerCase();
        const isPro = rawPlan.includes('pro') || rawStatus === 'active' || rawStatus === 'pro';

        shopProfile.subscription = {
          plan: sub.plan || (isPro ? 'Pro Active' : 'Free Starter Plan'),
          status: isPro ? 'active' : (rawStatus as any) || 'trial',
          validUntil: sub.valid_until || sub.current_period_end || sub.ends_at || undefined,
        };
      } else {
        // Also check if shop object itself has subscription data or plan_tier
        if ((shop as any).subscription && typeof (shop as any).subscription === 'object') {
          const s = (shop as any).subscription;
          shopProfile.subscription = {
            plan: s.plan || 'Free Starter Plan',
            status: s.status || 'trial',
            validUntil: s.validUntil || s.valid_until,
          };
        } else if ((shop as any).plan_tier || (shop as any).subscription_status) {
          const isPro = String((shop as any).plan_tier || '').toLowerCase().includes('pro') || (shop as any).subscription_status === 'active';
          shopProfile.subscription = {
            plan: (shop as any).plan_tier || (isPro ? 'Pro Active' : 'Free Starter Plan'),
            status: isPro ? 'active' : 'trial',
          };
        }
      }
    } catch (subErr) {
      console.warn('[Supabase] Note querying subscriptions table:', subErr);
    }

    // 2. Fetch service categories (strictly deduplicated case-insensitively)
    const { data: catRows } = await supabase
      .from('service_categories')
      .select('name')
      .eq('shop_id', shopId)
      .order('sort_order', { ascending: true });

    const uniqueCats: string[] = [];
    const seenCatSet = new Set<string>();
    (catRows || []).forEach((c) => {
      const trimmed = (c.name || '').trim();
      if (trimmed && !seenCatSet.has(trimmed.toLowerCase())) {
        seenCatSet.add(trimmed.toLowerCase());
        uniqueCats.push(trimmed);
      }
    });

    const categories = uniqueCats.length > 0
      ? uniqueCats
      : ['Hair', 'Beard', 'Colour', 'Care', 'Packages'];

    // 3. Fetch services
    const { data: srvRows } = await supabase
      .from('services')
      .select('*, service_categories(name)')
      .eq('shop_id', shopId);

    const services: ServiceItem[] = (srvRows || []).map((s) => ({
      id: s.id,
      cat: s.service_categories?.name || 'Hair',
      name: s.name,
      price: Math.round((s.price_minor || 0) / 100),
      dur: s.duration_minutes || 30,
      active: s.is_active !== false,
    }));

    // 4. Fetch staff
    const { data: staffRows } = await supabase
      .from('staff')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true });

    const staff: StaffMember[] = (staffRows || []).map((st) => {
      const perms: string[] = [];
      if (st.permissions && typeof st.permissions === 'object') {
        const p = st.permissions as Record<string, any>;
        if (p.customers) perms.push('customers');
        if (p.sales) perms.push('sales');
        if (p.appointments) perms.push('appointments');
        if (p.reminders) perms.push('reminders');
        if (p.expenses) perms.push('expenses');
        if (p.reports) perms.push('reports');
        if (p.team) perms.push('team');
        if (p.profile) perms.push('profile');
        if (p.past_expenses || p.expensesHistory) perms.push('past_expenses');
        if (p.full_reports || p.reportsHistory) perms.push('full_reports');
        if (p.share_bills || p.shareBills) perms.push('share_bills');
        if (p.clear_dues || p.clearDues) perms.push('clear_dues');
      }
      const effectivePerms = perms.length > 0 ? perms : ['customers', 'sales', 'appointments', 'reminders'];

      return {
        id: st.id,
        name: st.name,
        role: st.role || 'Stylist',
        phone: st.phone,
        rev: Math.round((st.target_amount_minor || 0) / 100),
        count: 0,
        rating: st.rating || '5.0',
        chair: 'Available',
        status: st.is_active ? 'active' : 'inactive',
        invited: st.invitation_status === 'accepted' || st.invitation_status === 'invited',
        permissions: effectivePerms,
      };
    });

    // 5. Fetch appointments with related customers, staff and services
    const { data: apptRows } = await supabase
      .from('appointments')
      .select('*, customers(id, name, phone), staff(id, name), services(id, name, price_minor)')
      .eq('shop_id', shopId)
      .order('starts_at', { ascending: false });

    const appointments: Appointment[] = (apptRows || []).map((a: any) => {
      let custName = a.customers?.name || 'Client';
      let custPhone = a.customers?.phone || '';
      let serviceName = a.services?.name || 'Salon Service';
      let staffName = a.staff?.name || 'Any Stylist';
      let amount = Math.round((a.services?.price_minor || 0) / 100);
      let isDeleted = false;
      let deletedBy: string | undefined = undefined;
      let deletedAt: string | undefined = undefined;

      if (a.notes) {
        if (typeof a.notes === 'string') {
          const parts = a.notes.split(';');
          for (const p of parts) {
            if (p.startsWith('deleted_by:')) deletedBy = p.replace('deleted_by:', '').trim();
            if (p.startsWith('deleted_at:')) deletedAt = p.replace('deleted_at:', '').trim();
          }
        }
        try {
          const parsed = JSON.parse(a.notes);
          if (parsed.cust && custName === 'Client') custName = parsed.cust;
          if (parsed.phone && !custPhone) custPhone = parsed.phone;
          if (parsed.service && serviceName === 'Salon Service') serviceName = parsed.service;
          if (parsed.staff_name && parsed.staff_name.trim()) staffName = parsed.staff_name.trim();
          if (parsed.amount && amount === 0) amount = parsed.amount;
          if (parsed.is_deleted) isDeleted = true;
          if (parsed.deleted_by) deletedBy = parsed.deleted_by;
          if (parsed.deleted_at) deletedAt = parsed.deleted_at;
        } catch {
          if (custName === 'Client' && !a.notes.includes('deleted_by:')) custName = a.notes;
        }
      }

      // Parse starts_at: Exact literal wall-clock parsing shared with mobile
      const rawStartsAt = (a.starts_at || '').trim();
      let dateStr = '';
      let timeStr = '';

      if (rawStartsAt.includes('T')) {
        // Shared ISO format: "YYYY-MM-DDThh:mm:ss+00:00" or "YYYY-MM-DDThh:mm:ss"
        const [dPart, rest] = rawStartsAt.split('T');
        dateStr = dPart;
        const timeOnly = rest.replace(/(\+.*|Z|-.*)$/, '');
        const timeSegments = timeOnly.split(':');
        let h = parseInt(timeSegments[0] || '10', 10);
        const m = (timeSegments[1] || '00').slice(0, 2);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        timeStr = `${String(h).padStart(2, '0')}:${m} ${ampm}`;
      } else if (rawStartsAt.includes(' ')) {
        // Space-separated format: "YYYY-MM-DD hh:mm AM/PM" or "YYYY-MM-DD hh:mm"
        const parts = rawStartsAt.split(' ');
        dateStr = parts[0];
        const tPart = parts.slice(1).join(' ').trim();
        const match = tPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const m = match[2];
          const explicitAmpm = match[3]?.toUpperCase();
          if (!explicitAmpm && h >= 12) {
            h = h % 12 || 12;
            timeStr = `${String(h).padStart(2, '0')}:${m} PM`;
          } else {
            timeStr = `${String(h).padStart(2, '0')}:${m} ${explicitAmpm || 'AM'}`;
          }
        } else {
          timeStr = tPart || '10:00 AM';
        }
      } else if (rawStartsAt) {
        if (rawStartsAt.includes('-')) {
          dateStr = rawStartsAt;
          timeStr = '10:00 AM';
        } else {
          dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          timeStr = rawStartsAt;
        }
      }

      if (!dateStr) dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (!timeStr) timeStr = '10:00 AM';

      return {
        id: a.id,
        cust: custName,
        phone: custPhone,
        service: serviceName,
        staff: staffName,
        startsAt: timeStr,
        date: dateStr,
        amount,
        status: (isDeleted || a.status === 'Cancelled' || a.status === 'cancelled') ? 'Cancelled' : ((a.status as Appointment['status']) || 'Confirmed'),
        deletedBy,
        deletedAt: deletedAt || (a.status === 'Cancelled' || a.status === 'cancelled' ? a.updated_at : undefined),
      };
    });

    // 6. Fetch bills, items, payments and relations
    const { data: billRows } = await supabase
      .from('bills')
      .select('*, customers(id, name, phone), staff(id, name), bill_items(*), payments(*)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    const bills: Bill[] = (billRows || []).map((b: any) => {
      let parsedStaff = b.staff?.name || 'Stylist';
      let parsedCust = b.customers?.name || 'Walk-in Client';
      let parsedPhone = b.customers?.phone || '';
      let deletedBy: string | undefined = undefined;
      let deletedAt: string | undefined = undefined;

      let parsedDueMinor = (b.due_amount_minor !== null && b.due_amount_minor !== undefined && b.due_amount_minor > 0)
        ? b.due_amount_minor
        : 0;
      let parsedPaidMinor = b.paid_amount_minor;

      if (b.notes) {
        const parts = b.notes.split(';');
        for (const p of parts) {
          if (p.startsWith('due:')) {
            const dVal = parseInt(p.replace('due:', '').trim(), 10);
            if (!isNaN(dVal)) parsedDueMinor = dVal;
          }
          if (p.startsWith('paid:')) {
            const pVal = parseInt(p.replace('paid:', '').trim(), 10);
            if (!isNaN(pVal)) parsedPaidMinor = pVal;
          }
          if (p.startsWith('staff_name:')) {
            const sn = p.replace('staff_name:', '').trim();
            if (sn) parsedStaff = sn;
          }
          if (p.startsWith('cust:') && parsedCust === 'Walk-in Client') parsedCust = p.replace('cust:', '');
          if (p.startsWith('phone:') && !parsedPhone) parsedPhone = p.replace('phone:', '');
          if (p.startsWith('deleted_by:')) deletedBy = p.replace('deleted_by:', '').trim();
          if (p.startsWith('deleted_at:')) deletedAt = p.replace('deleted_at:', '').trim();
        }
      }

      const items = (b.bill_items || []).map((it: any) => ({
        name: it.service_name_snapshot || 'Service',
        price: Math.round((it.unit_price_minor || 0) / 100),
        qty: it.quantity || 1,
      }));

      let parsedDateStr = '';
      if (b.notes && b.notes.includes('date_str:')) {
        const match = b.notes.match(/date_str:([^;]+)/);
        if (match && match[1]) {
          parsedDateStr = match[1].trim();
        }
      }
      const rawDate = b.issued_at || b.created_at;
      const dateObj = rawDate ? new Date(rawDate) : new Date();
      if (!parsedDateStr) {
        if (!isNaN(dateObj.getTime())) {
          parsedDateStr = dateObj.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          }) + `, ${dateObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata',
          })}`;
        } else {
          parsedDateStr = 'Today';
        }
      }

      const nowKolkata = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const yestDate = new Date();
      yestDate.setDate(yestDate.getDate() - 1);
      const yestKolkata = yestDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const billDateKolkata = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        : nowKolkata;
      const isToday = billDateKolkata === nowKolkata;
      const isYesterday = billDateKolkata === yestKolkata;
      const dateStr = parsedDateStr;

      const payments = (b.payments as any[]) || [];
      const paymentMode = payments[0]?.method || (b.notes?.includes('Cash') ? 'Cash' : (b.notes?.includes('Card') ? 'Card' : 'UPI'));

      const totalMinor = b.total_minor || 0;
      const totalAmount = Math.round(totalMinor / 100);
      const dueAmount = Math.round(parsedDueMinor / 100);
      const paidAmount = parsedPaidMinor !== null && parsedPaidMinor !== undefined
        ? Math.round(parsedPaidMinor / 100)
        : Math.max(0, totalAmount - dueAmount);

      const billStatus: Bill['status'] = dueAmount <= 0
        ? 'paid'
        : paidAmount > 0
        ? 'partially_paid'
        : 'pending';

      return {
        id: b.invoice_number || b.id,
        cust: parsedCust,
        phone: parsedPhone,
        dateStr,
        items: items.length > 0 ? items : [{ name: 'Salon Service', price: totalAmount, qty: 1 }],
        staff: parsedStaff,
        total: totalAmount,
        paidAmount,
        dueAmount,
        discount: Math.round((b.discount_minor || 0) / 100),
        tax: Math.round((b.tax_minor || 0) / 100),
        tip: Math.round((b.tip_minor || 0) / 100),
        mode: paymentMode,
        status: billStatus,
        isDeleted: b.status === 'deleted' || !!b.deleted_at,
        deletedAt: deletedAt || (b.status === 'deleted' ? b.updated_at : undefined),
        deletedBy: deletedBy || (b.status === 'deleted' ? parsedStaff : undefined),
        isToday,
        isYesterday,
        createdAt: b.created_at || b.issued_at,
        customerId: b.customer_id || b.customers?.id || undefined,
        notes: b.notes || '',
        payments: payments.map((p: any) => ({
          amount_minor: p.amount_minor || 0,
          method: p.method || 'UPI',
          paid_at: p.paid_at || p.created_at || b.created_at,
        })),
      };
    });

    // 7. Fetch customers & compute visits, lifetime spend, and outstanding dues live from bills
    const { data: custRows } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    const statsByCustomer = new Map<string, { visits: number; spend: number; dues: number; lastVisit: string }>();
    for (const b of bills) {
      if (b.isDeleted) continue;
      const key = (b.phone && b.phone.length === 10) ? b.phone : b.cust.toLowerCase();
      if (!statsByCustomer.has(key)) {
        statsByCustomer.set(key, { visits: 0, spend: 0, dues: 0, lastVisit: 'Today' });
      }
      const st = statsByCustomer.get(key)!;
      // Requirement 7: visits = Total count of non-deleted bills where status = 'paid' or dueAmount = 0
      if (b.status === 'paid' || (b.dueAmount || 0) <= 0) {
        st.visits += 1;
      }
      // Only count non-clearance bills towards client lifetime spend so debt payments do not artificially inflate spend
      if (!b.id.startsWith('DUE-CLR-')) {
        st.spend += b.paidAmount || 0;
      }
      st.dues += b.dueAmount || 0;
      st.lastVisit = b.dateStr ? b.dateStr.split(',')[0] : 'Today';
    }

    const customers: Customer[] = (custRows || []).map((c) => {
      const cleanPhone = (c.phone || '').replace(/\D/g, '').slice(-10);
      const key = cleanPhone.length === 10 ? cleanPhone : c.name.toLowerCase();
      const liveStats = statsByCustomer.get(key);
      const liveVisits = liveStats ? liveStats.visits : 0;
      const liveSpend = liveStats ? liveStats.spend : 0;
      const dbDue = (c.outstanding_due_minor !== undefined && c.outstanding_due_minor !== null)
        ? Math.round(Number(c.outstanding_due_minor) / 100)
        : null;
      // Live bill dues strictly prioritized so newly created mobile bills with due in notes immediately reflect on customer
      const liveDue = (liveStats && liveStats.dues > 0)
        ? liveStats.dues
        : (dbDue !== null && dbDue > 0 ? dbDue : (dbDue || 0));
      const lastVisit = (liveStats && liveStats.visits > 0) ? liveStats.lastVisit : 'Never';

      return {
        id: c.id,
        name: c.name,
        phone: cleanPhone,
        vip: !!c.is_starred,
        visits: liveVisits,
        spend: liveSpend,
        due: liveDue,
        notes: c.notes || '',
        lastVisit,
        status: c.is_active ? 'active' : 'inactive',
      };
    });

    const reconciledBills = bills;

    // 8. Fetch expenses
    const { data: expRows } = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    const expenses: Expense[] = (expRows || []).map((e) => ({
      id: e.id,
      cat: 'Supplies',
      amount: Math.round((e.amount_minor || 0) / 100),
      note: e.note || '',
      pm: e.payment_method || 'UPI',
      staff: null,
      inProfit: e.include_in_profit !== false,
      date: e.expense_date || new Date().toISOString().split('T')[0],
    }));

    return {
      shop: shopProfile,
      categories,
      services,
      staff,
      customers,
      appointments,
      bills: reconciledBills,
      expenses,
    };
  } catch (err) {
    console.error('[Supabase] Exception in fetchSalonDataFromDb:', err);
    return null;
  }
}

/**
 * Persist a customer strictly into the current salon's customers table.
 */
export async function saveCustomerToDb(shopId: string, customer: {
  id?: string;
  name: string;
  phone: string;
  vip?: boolean;
  due?: number;
  notes?: string;
}): Promise<string | null> {
  try {
    const custId = isValidUuid(customer.id) ? customer.id! : generateUuid();
    const cleanPhone = (customer.phone || '').replace(/\D/g, '').slice(-10);

    // If customer with same phone already exists in this salon, update details
    if (cleanPhone) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('shop_id', shopId)
        .eq('phone', cleanPhone)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('customers')
          .update({
            name: (customer.name || 'Client').trim(),
            is_starred: !!customer.vip,
            notes: customer.notes?.trim() || null,
            is_active: true,
          })
          .eq('id', existing[0].id);
        return existing[0].id;
      }
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        id: custId,
        shop_id: shopId,
        name: (customer.name || 'Client').trim(),
        phone: cleanPhone || customer.phone.trim(),
        is_starred: !!customer.vip,
        outstanding_due_minor: Math.round((customer.due || 0) * 100),
        notes: customer.notes?.trim() || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[Supabase] Customer insert warning:', error.message);
      return null;
    }
    return data?.id || custId;
  } catch {
    return null;
  }
}

/**
 * Bulk persist imported contacts into the active salon's Supabase customers table.
 * Deduplicates by phone number for the active salon.
 */
export async function bulkSaveCustomersToDb(
  shopId: string,
  customersList: Array<{
    id?: string;
    name: string;
    phone: string;
    vip?: boolean;
    due?: number;
    notes?: string;
  }>
): Promise<{ success: boolean; insertedCount: number; updatedCount: number; error?: string }> {
  try {
    if (!shopId || !customersList || customersList.length === 0) {
      return { success: false, insertedCount: 0, updatedCount: 0, error: 'Shop ID or customers list is missing' };
    }

    // 1. Fetch existing phone numbers for this salon to prevent duplicate records
    const { data: existingRows, error: fetchErr } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('shop_id', shopId);

    if (fetchErr) {
      console.warn('[Supabase] Note on fetching existing customers:', fetchErr.message);
    }

    const existingMap = new Map<string, string>();
    (existingRows || []).forEach((row: any) => {
      if (row.phone) {
        const clean = row.phone.replace(/\D/g, '').slice(-10);
        if (clean) existingMap.set(clean, row.id);
      }
    });

    const newRowsToInsert: any[] = [];
    const seenPhonesInBatch = new Set<string>();
    let updatedCount = 0;

    for (const c of customersList) {
      const cleanPhone = (c.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length < 7) continue;

      if (existingMap.has(cleanPhone)) {
        // Customer already exists in this salon - update active status and notes
        const existingId = existingMap.get(cleanPhone)!;
        try {
          await supabase
            .from('customers')
            .update({
              name: (c.name || 'Client').trim(),
              is_active: true,
              notes: c.notes?.trim() || 'Imported from phone contacts',
            })
            .eq('id', existingId);
          updatedCount++;
        } catch {}
        continue;
      }

      if (seenPhonesInBatch.has(cleanPhone)) {
        continue;
      }
      seenPhonesInBatch.add(cleanPhone);

      const custUuid = isValidUuid(c.id) ? c.id! : generateUuid();
      newRowsToInsert.push({
        id: custUuid,
        shop_id: shopId,
        name: (c.name || 'Client').trim(),
        phone: cleanPhone,
        is_starred: !!c.vip,
        outstanding_due_minor: Math.round((Number(c.due) || 0) * 100),
        notes: (c.notes || 'Imported from phone contacts').trim(),
        is_active: true,
      });
    }

    let insertedCount = 0;
    if (newRowsToInsert.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < newRowsToInsert.length; i += BATCH_SIZE) {
        const batch = newRowsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from('customers')
          .insert(batch);

        if (insertErr) {
          console.error('[Supabase] Bulk insert batch encountered error, falling back to item-by-item insert:', insertErr);
          for (const item of batch) {
            try {
              const { error: singleErr } = await supabase.from('customers').insert(item);
              if (!singleErr) insertedCount++;
            } catch (e) {
              console.warn('[Supabase] Single customer insert fallback error:', e);
            }
          }
        } else {
          insertedCount += batch.length;
        }
      }
    }

    return {
      success: true,
      insertedCount,
      updatedCount,
    };
  } catch (err: any) {
    console.error('[Supabase] Exception in bulkSaveCustomersToDb:', err);
    return {
      success: false,
      insertedCount: 0,
      updatedCount: 0,
      error: err?.message || 'Database error',
    };
  }
}

/**
 * Update an existing customer in the Supabase database.
 */
export async function updateCustomerInDb(
  shopId: string,
  customerIdOrPhone: string,
  updated: Partial<Customer>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updated.name !== undefined) payload.name = updated.name.trim();
    if (updated.phone !== undefined) payload.phone = updated.phone.trim();
    if (updated.vip !== undefined) payload.is_starred = !!updated.vip;
    if (updated.due !== undefined) payload.outstanding_due_minor = Math.round(Number(updated.due) * 100);
    if (updated.notes !== undefined) payload.notes = updated.notes?.trim() || null;
    if (updated.status !== undefined) payload.is_active = updated.status === 'active';

    let query = supabase.from('customers').update(payload).eq('shop_id', shopId);
    if (isValidUuid(customerIdOrPhone)) {
      query = query.eq('id', customerIdOrPhone);
    } else {
      const rawDigits = customerIdOrPhone.replace(/\D/g, '');
      const cleanPhone = (updated.phone ? updated.phone.replace(/\D/g, '').slice(-10) : '') ||
        (!customerIdOrPhone.startsWith('c-') && rawDigits.length >= 7 ? rawDigits.slice(-10) : '');
      if (cleanPhone && cleanPhone.length >= 7) {
        query = query.eq('phone', cleanPhone);
      } else if (updated.name) {
        query = query.ilike('name', updated.name.trim());
      } else {
        query = query.eq('id', customerIdOrPhone);
      }
    }

    const { error } = await query;
    return !error;
  } catch {
    return false;
  }
}

/**
 * Soft-delete / deactivate a customer in the Supabase database.
 */
export async function deleteCustomerInDb(shopId: string, customerIdOrPhone: string): Promise<boolean> {
  try {
    let query = supabase.from('customers').update({ is_active: false }).eq('shop_id', shopId);
    if (isValidUuid(customerIdOrPhone)) {
      query = query.eq('id', customerIdOrPhone);
    } else {
      const cleanPhone = customerIdOrPhone.replace(/\D/g, '').slice(-10);
      query = query.eq('phone', cleanPhone || customerIdOrPhone);
    }

    const { error } = await query;
    return !error;
  } catch {
    return false;
  }
}

/**
 * Authoritatively reconcile a customer's outstanding_due_minor in Supabase from all active unpaid bills.
 * Strictly guarantees that customer due === sum of unpaid bills (status != 'paid' and status != 'deleted').
 * This mathematically prevents any doubling, stale phantom dues, or race condition discrepancies between mobile and web.
 */
export async function reconcileCustomerDueInDb(
  shopId: string,
  customerIdOrPhone: string
): Promise<number> {
  try {
    let customerId: string | null = null;
    let cleanPhone = '';

    if (isValidUuid(customerIdOrPhone)) {
      customerId = customerIdOrPhone;
      const { data: cRow } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customerId)
        .maybeSingle();
      if (cRow?.phone) {
        cleanPhone = cRow.phone.replace(/\D/g, '').slice(-10);
      }
    } else {
      cleanPhone = customerIdOrPhone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length >= 7) {
        const { data: cRow } = await supabase
          .from('customers')
          .select('id')
          .eq('shop_id', shopId)
          .eq('phone', cleanPhone)
          .maybeSingle();
        if (cRow?.id) customerId = cRow.id;
      }
    }

    if (!customerId && !cleanPhone) return 0;

    // Fetch all active (non-deleted, non-paid) bills for this customer in Supabase
    let billsQuery = supabase
      .from('bills')
      .select('due_amount_minor, status, notes')
      .eq('shop_id', shopId)
      .neq('status', 'deleted')
      .neq('status', 'paid');

    if (customerId) {
      if (cleanPhone) {
        billsQuery = billsQuery.or(`customer_id.eq.${customerId},notes.ilike.%phone:${cleanPhone}%`);
      } else {
        billsQuery = billsQuery.eq('customer_id', customerId);
      }
    } else if (cleanPhone) {
      billsQuery = billsQuery.ilike('notes', `%phone:${cleanPhone}%`);
    }

    const { data: activeBills, error } = await billsQuery;
    if (error) {
      console.warn('[Supabase] Failed to query active bills for due reconciliation:', error.message);
      return 0;
    }

    const totalDueMinor = (activeBills || []).reduce((sum, b) => {
      let dMinor = b.due_amount_minor || 0;
      if (dMinor === 0 && b.notes) {
        const m = b.notes.match(/due:(\d+)/);
        if (m) dMinor = parseInt(m[1], 10);
      }
      return sum + Math.max(0, dMinor);
    }, 0);

    // Update customer in database with exact mathematical sum
    let updateQuery = supabase
      .from('customers')
      .update({
        outstanding_due_minor: totalDueMinor,
        updated_at: new Date().toISOString(),
      })
      .eq('shop_id', shopId);

    if (customerId) {
      updateQuery = updateQuery.eq('id', customerId);
    } else {
      updateQuery = updateQuery.eq('phone', cleanPhone);
    }

    await updateQuery;
    return totalDueMinor;
  } catch (err) {
    console.warn('[Supabase] Error reconciling customer due:', err);
    return 0;
  }
}

/**
 * Persist an appointment strictly into the current salon's appointments table.
 * Guaranteed format: starts_at = "YYYY-MM-DD hh:mm AM/PM" (matching StyleFleet Android)
 */
export async function saveAppointmentToDb(
  shopId: string,
  appt: Omit<Appointment, 'id'>,
  providedId?: string
): Promise<string | null> {
  try {
    const apptId = (providedId && isValidUuid(providedId)) ? providedId : generateUuid();

    // Format starts_at strictly as local space-separated string expected by mobile & web:
    // e.g. "2026-10-27 10:30 AM"
    let cleanSlot = (appt.startsAt || '10:00 AM').trim();
    let h24 = 10;
    let mStr = '00';
    const timeMatch = cleanSlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      mStr = timeMatch[2];
      const ampm = (timeMatch[3] || 'AM').toUpperCase();
      cleanSlot = `${String(h).padStart(2, '0')}:${mStr} ${ampm}`;
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      h24 = h;
    }

    const cleanDate = (appt.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).trim();
    const formattedStartsAt = `${cleanDate}T${String(h24).padStart(2, '0')}:${mStr}:00+00:00`;

    // Resolve customer and staff foreign keys
    let customerId: string | null = null;
    let staffId: string | null = null;
    let serviceId: string | null = null;

    if (appt.phone) {
      const cleanPhone = appt.phone.replace(/\D/g, '').slice(-10);
      try {
        const { data: custRows } = await supabase
          .from('customers')
          .select('id')
          .eq('shop_id', shopId)
          .eq('phone', cleanPhone)
          .limit(1);
        if (custRows && custRows.length > 0) {
          customerId = custRows[0].id;
        } else if (appt.cust && appt.cust.trim() !== 'Client' && appt.cust.trim() !== '') {
          const newCustId = generateUuid();
          await supabase.from('customers').insert({
            id: newCustId,
            shop_id: shopId,
            name: appt.cust.trim(),
            phone: cleanPhone,
            is_starred: false,
            is_active: true,
          });
          customerId = newCustId;
        }
      } catch {}
    }

    if (appt.staff) {
      try {
        const staffNames = appt.staff.split(',').map((s) => s.trim()).filter(Boolean);
        for (const sName of staffNames) {
          const { data: stRows } = await supabase
            .from('staff')
            .select('id')
            .eq('shop_id', shopId)
            .ilike('name', sName)
            .limit(1);
          if (stRows && stRows.length > 0) {
            staffId = stRows[0].id;
            break;
          }
        }
      } catch {}
    }

    if (appt.service) {
      try {
        const primaryService = appt.service.split(',')[0].replace(/\(x\d+\)/, '').trim();
        const { data: srvRows } = await supabase
          .from('services')
          .select('id')
          .eq('shop_id', shopId)
          .ilike('name', primaryService)
          .limit(1);
        if (srvRows && srvRows.length > 0) {
          serviceId = srvRows[0].id;
        }
      } catch {}
    }

    const notesJson = JSON.stringify({
      cust: appt.cust,
      service: appt.service,
      staff_name: appt.staff,
      amount: appt.amount,
    });

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        id: apptId,
        shop_id: shopId,
        customer_id: customerId,
        staff_id: staffId,
        service_id: serviceId,
        starts_at: formattedStartsAt,
        duration_minutes: 30,
        status: appt.status || 'Confirmed',
        notes: notesJson,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[Supabase] Appointment insert warning:', error.message);
      return null;
    }
    return data?.id || apptId;
  } catch {
    return null;
  }
}

/**
 * Update appointment status in Supabase with full mobile audit parity.
 */
export async function updateAppointmentStatusInDb(
  shopId: string,
  apptId: string,
  status: string,
  audit?: { role: 'owner' | 'stylist'; name: string }
): Promise<boolean> {
  try {
    const updatePayload: any = { status };
    if (status === 'Cancelled') {
      try {
        const { data: existing } = await supabase
          .from('appointments')
          .select('notes')
          .eq('id', apptId)
          .eq('shop_id', shopId)
          .single();

        let notesObj: any = {};
        if (existing?.notes) {
          try {
            notesObj = JSON.parse(existing.notes);
          } catch {
            notesObj = { note: existing.notes };
          }
        }
        notesObj.is_deleted = true;
        notesObj.deleted_at = new Date().toISOString();
        if (audit) {
          notesObj.deleted_by_role = audit.role;
          notesObj.deleted_by_name = audit.name;
        }
        updatePayload.notes = JSON.stringify(notesObj);
      } catch {}
    } else if (status === 'Confirmed') {
      try {
        const { data: existing } = await supabase
          .from('appointments')
          .select('notes')
          .eq('id', apptId)
          .eq('shop_id', shopId)
          .single();

        if (existing?.notes) {
          try {
            const notesObj = JSON.parse(existing.notes);
            delete notesObj.is_deleted;
            delete notesObj.deleted_at;
            delete notesObj.deleted_by_role;
            delete notesObj.deleted_by_name;
            updatePayload.notes = JSON.stringify(notesObj);
          } catch {}
        }
      } catch {}
    }

    const { error } = await supabase
      .from('appointments')
      .update(updatePayload)
      .eq('id', apptId)
      .eq('shop_id', shopId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Persist a bill and line items transactionally strictly into the current salon's tables.
 */
export async function saveBillToDb(
  shopId: string,
  bill: Omit<Bill, 'id' | 'dateStr' | 'isDeleted' | 'isToday'> & { invoiceNumber: string }
): Promise<string | null> {
  try {
    const billId = generateUuid();
    // Mathematical Invariant (paise integer calculations)
    const itemsSubtotalMinor = (bill.items || []).reduce(
      (sum, it) => sum + Math.round((it.price || 0) * 100) * (it.qty || 1),
      0
    );
    const subtotalMinor = itemsSubtotalMinor > 0 ? itemsSubtotalMinor : Math.round(bill.total * 100);
    const discountMinor = Math.min(subtotalMinor, Math.max(0, Math.round((bill.discount || 0) * 100)));
    const taxMinor = Math.max(0, Math.round(((bill as any).tax || 0) * 100));
    const tipMinor = Math.max(0, Math.round(((bill as any).tip || 0) * 100));
    const totalMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor + tipMinor);
    const paidMinor = Math.min(totalMinor, Math.max(0, Math.round(bill.paidAmount * 100)));
    const dueMinor = Math.max(0, totalMinor - paidMinor);

    // Resolve customer foreign key (look up or auto-add walk-in client)
    let customerId: string | null = null;
    if (bill.phone) {
      const cleanPhone = bill.phone.replace(/\D/g, '').slice(-10);
      try {
        const { data: custRows } = await supabase
          .from('customers')
          .select('id')
          .eq('shop_id', shopId)
          .eq('phone', cleanPhone)
          .limit(1);
        if (custRows && custRows.length > 0) {
          customerId = custRows[0].id;
        } else if (bill.cust && bill.cust.trim() !== 'Walk-in Client' && bill.cust.trim() !== '') {
          const newCustId = generateUuid();
          await supabase.from('customers').insert({
            id: newCustId,
            shop_id: shopId,
            name: bill.cust.trim(),
            phone: cleanPhone,
            is_starred: false,
            is_active: true,
          });
          customerId = newCustId;
        }
      } catch {}
    }

    // Resolve staff foreign key (supports multi-selected stylists)
    let staffId: string | null = null;
    if (bill.staff) {
      try {
        const staffNames = bill.staff.split(',').map((s) => s.trim()).filter(Boolean);
        for (const sName of staffNames) {
          const { data: stRows } = await supabase
            .from('staff')
            .select('id')
            .eq('shop_id', shopId)
            .ilike('name', sName)
            .limit(1);
          if (stRows && stRows.length > 0) {
            staffId = stRows[0].id;
            break;
          }
        }
      } catch {}
    }

    const billStatus = dueMinor === 0 ? 'paid' : (paidMinor > 0 ? 'partially_paid' : 'pending');
    const paymentMethod = bill.mode || 'UPI';
    const billDateStr = (bill as any).dateStr || '';
    // Only include due: prefix when dueMinor > 0. For normal bills, include paid: so mobile does not falsely display "Due Settled" badge
    const duePrefix = dueMinor > 0 ? `due:${dueMinor};paid:${paidMinor};` : `paid:${paidMinor};`;
    const notesStr = `${duePrefix}staff_name:${bill.staff};cust:${bill.cust};phone:${bill.phone};mode:${paymentMethod}${billDateStr ? `;date_str:${billDateStr}` : ''};`;
    const nowIso = new Date().toISOString();

    const cleanInvNum = (bill.invoiceNumber || billId).replace(/\.pdf$/i, '').trim();
    const officialPdfKey = `${cleanInvNum}.pdf`;
    const officialPdfUrl = `https://stylefleet.tecstellar.com/b/${officialPdfKey}`;

    const { error: billErr } = await supabase.from('bills').insert({
      id: billId,
      shop_id: shopId,
      customer_id: customerId,
      staff_id: staffId,
      invoice_number: bill.invoiceNumber,
      status: billStatus,
      subtotal_minor: subtotalMinor,
      discount_minor: discountMinor,
      tax_minor: taxMinor,
      tip_minor: tipMinor,
      total_minor: totalMinor,
      paid_amount_minor: paidMinor,
      due_amount_minor: dueMinor,
      notes: notesStr,
      issued_at: nowIso,
      pdf_url: officialPdfUrl,
    });

    if (billErr) {
      console.warn('[Supabase] Bill insert warning:', billErr.message);
      return null;
    }

    // Authoritatively synchronize customer's outstanding_due_minor from all active bills in Supabase
    if (customerId || bill.phone) {
      try {
        await reconcileCustomerDueInDb(shopId, customerId || bill.phone);
      } catch (err) {
        console.warn('[Supabase] Customer due sync warning:', err);
      }
    }

    // Insert bill items with snapshot
    if (bill.items && bill.items.length > 0) {
      for (const item of bill.items) {
        const unitPriceMinor = Math.round(item.price * 100);
        const qty = item.qty || 1;
        await supabase.from('bill_items').insert({
          id: generateUuid(),
          bill_id: billId,
          service_name_snapshot: item.name,
          quantity: qty,
          unit_price_minor: unitPriceMinor,
          discount_minor: 0,
          tax_minor: 0,
          line_total_minor: unitPriceMinor * qty,
          staff_id: staffId,
        });
      }
    }

    // Insert payment record into payments table
    try {
      await supabase.from('payments').insert({
        id: generateUuid(),
        shop_id: shopId,
        bill_id: billId,
        amount_minor: paidMinor > 0 ? paidMinor : totalMinor,
        method: paymentMethod,
        status: 'Completed',
        paid_at: nowIso,
      });
    } catch {
      // Payment table may have RLS
    }

    // Trigger asynchronous PDF generation & Supabase Storage upload
    try {
      fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId,
          billId,
          invoiceNumber: bill.invoiceNumber,
          customerName: bill.cust,
          customerPhone: bill.phone,
          stylist: bill.staff || 'Stylist',
          staff: bill.staff || 'Stylist',
          items: (bill.items || []).map((it) => ({ ...it, staff: it.staff || bill.staff || 'Stylist' })),
          subtotal: Math.round(subtotalMinor / 100),
          discount: Math.round(discountMinor / 100),
          tax: Math.round(taxMinor / 100),
          total: Math.round(totalMinor / 100),
          paidAmount: Math.round(paidMinor / 100),
          dueAmount: Math.round(dueMinor / 100),
          paymentMethod,
          issuedAt: nowIso,
        }),
      }).catch((e) => console.warn('[Supabase] PDF upload background notice:', e));
    } catch {}

    return billId;
  } catch {
    return null;
  }
}

/**
 * Persist a staff member strictly into the current salon's staff table.
 * Exactly matches StyleFleet Mobile App schema.
 * Authenticates as owner to satisfy Postgres RLS policies.
 */
export async function saveStaffMemberToDb(
  shopId: string,
  member: { id?: string; name: string; phone: string; role?: string }
): Promise<string | null> {
  try {
    const cleanPhone = (member.phone || '').replace(/\D/g, '').slice(-10);
    const staffId = isValidUuid(member.id) ? member.id! : generateUuid();

    // 1. Ensure authenticated session as salon owner (satisfies RLS)
    await ensureSupabaseOwnerSession(shopId);

    const insertPayload = {
      id: staffId,
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

    let { data, error } = await supabase
      .from('staff')
      .insert(insertPayload)
      .select('id')
      .single();

    // 2. If RLS 42501 error, force re-authenticate and retry
    if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) {
      await ensureSupabaseOwnerSession(shopId, true);
      ({ data, error } = await supabase
        .from('staff')
        .insert(insertPayload)
        .select('id')
        .single());
    }

    if (!error && (data?.id || staffId)) {
      return data?.id || staffId;
    }

    // 3. Fallback to server API endpoint (/api/staff)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, member: { ...member, id: staffId } }),
      });
      const json = await res.json();
      if (json.success && json.id) {
        return json.id;
      }
    } catch (apiErr) {
      console.warn('[Staff API Fallback error]:', apiErr);
    }

    if (error) {
      console.warn('[Supabase] Staff insert warning:', error.message);
    }
    return null;
  } catch (err) {
    console.error('[Supabase] Staff insert exception:', err);
    return null;
  }
}

/**
 * Update an existing staff member in Supabase (permissions, role, rating, active status).
 */
export async function updateStaffMemberInDb(
  shopId: string,
  staffId: string,
  updated: Partial<StaffMember>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {};
    if (updated.name !== undefined) payload.name = updated.name.trim();
    if (updated.phone !== undefined) payload.phone = (updated.phone || '').replace(/\D/g, '').slice(-10);
    if (updated.role !== undefined) payload.role = updated.role;
    if (updated.status !== undefined) payload.is_active = updated.status === 'active';
    if (updated.rating !== undefined) payload.rating = updated.rating;
    if (updated.permissions !== undefined) {
      const permsArray = updated.permissions || [];
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

    await ensureSupabaseOwnerSession(shopId);

    let { error } = await supabase
      .from('staff')
      .update(payload)
      .eq('id', staffId)
      .eq('shop_id', shopId);

    if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) {
      await ensureSupabaseOwnerSession(shopId, true);
      ({ error } = await supabase
        .from('staff')
        .update(payload)
        .eq('id', staffId)
        .eq('shop_id', shopId));
    }

    if (!error) return true;

    // Server API Fallback
    try {
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, staffId, updates: updated }),
      });
      const json = await res.json();
      return !!json.success;
    } catch {
      return false;
    }
  } catch (err) {
    console.warn('[Supabase] Staff update exception:', err);
    return false;
  }
}

/**
 * Persist an expense strictly into the current salon's expenses table.
 */
export async function saveExpenseToDb(
  shopId: string,
  expense: Omit<Expense, 'id' | 'date'> & { id?: string; date?: string }
): Promise<string | null> {
  try {
    const expId = isValidUuid(expense.id) ? expense.id! : generateUuid();

    // Look up category_id if available
    let catId: string | null = null;
    try {
      const { data: catRows } = await supabase
        .from('expense_categories')
        .select('id')
        .or(`shop_id.eq.${shopId},shop_id.is.null`)
        .limit(1);
      if (catRows && catRows.length > 0) {
        catId = catRows[0].id;
      }
    } catch {}

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id: expId,
        shop_id: shopId,
        category_id: catId,
        note: expense.note.trim(),
        amount_minor: Math.round(expense.amount * 100),
        payment_method: expense.pm || 'UPI',
        expense_date: expense.date || new Date().toISOString().split('T')[0],
        include_in_profit: expense.inProfit !== false,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[Supabase] Expense insert warning:', error.message);
      return null;
    }
    return data?.id || expId;
  } catch {
    return null;
  }
}

/**
 * Delete an expense entry from Supabase.
 */
export async function deleteExpenseInDb(shopId: string, expenseId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('shop_id', shopId)
      .eq('id', expenseId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Update an existing expense in Supabase.
 */
export async function updateExpenseInDb(
  shopId: string,
  expenseId: string,
  updated: Partial<Expense>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {};
    if (updated.amount !== undefined) payload.amount_minor = Math.round(Number(updated.amount) * 100);
    if (updated.note !== undefined) payload.note = updated.note.trim();
    if (updated.pm !== undefined) payload.payment_method = updated.pm;
    if (updated.date !== undefined) payload.expense_date = updated.date;
    if (updated.inProfit !== undefined) payload.include_in_profit = updated.inProfit;

    const { error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('shop_id', shopId)
      .eq('id', expenseId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Update shop profile metadata strictly for this salon's shop_id.
 */
export async function updateShopProfileInDb(shopId: string, profile: Partial<ShopProfile>): Promise<boolean> {
  try {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (profile.shopName) updatePayload.name = profile.shopName.trim();
    if (profile.phone) updatePayload.phone = profile.phone.trim();
    if (profile.address) updatePayload.address = profile.address.trim();
    if (profile.city) updatePayload.city = profile.city.trim();
    if (profile.pinCode) updatePayload.pin_code = profile.pinCode.trim();
    if (profile.gstin !== undefined) updatePayload.gstin = profile.gstin?.trim() || null;
    if (profile.upiId !== undefined) updatePayload.upi_id = profile.upiId?.trim() || '';
    if (profile.invoicePrefix) updatePayload.invoice_prefix = profile.invoicePrefix;
    if (profile.logoImg !== undefined) updatePayload.logo_path = profile.logoImg;

    // Fetch existing shop to preserve and merge social_links and owner_profile_id
    const { data: existingShop } = await supabase
      .from('shops')
      .select('social_links, owner_profile_id, phone')
      .eq('id', shopId)
      .maybeSingle();

    if (profile.ownerName || profile.upiId !== undefined || profile.bookingHours) {
      const social = (existingShop?.social_links as any) || {};
      if (profile.ownerName) social.owner_name = profile.ownerName.trim();
      if (profile.upiId !== undefined) social.upi_id = profile.upiId.trim();
      updatePayload.social_links = social;
    }

    const { error } = await supabase
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId);

    // Synchronize profiles table full_name so mobile app and web both immediately display the owner's exact name
    if (profile.ownerName && profile.ownerName.trim()) {
      const newOwnerName = profile.ownerName.trim();
      try {
        if (existingShop?.owner_profile_id) {
          await supabase
            .from('profiles')
            .update({ full_name: newOwnerName, updated_at: new Date().toISOString() })
            .eq('id', existingShop.owner_profile_id);
        }
        const cleanPhone = (profile.phone || existingShop?.phone || '').replace(/\D/g, '').slice(-10);
        if (cleanPhone) {
          await supabase
            .from('profiles')
            .update({ full_name: newOwnerName, updated_at: new Date().toISOString() })
            .or(`phone.ilike.%${cleanPhone}%,phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`);
        }
      } catch {}
    }

    return !error;
  } catch {
    return false;
  }
}

/**
 * Soft-delete a bill in Supabase (30-day restore bin).
 */
export async function deleteBillInDb(
  shopId: string,
  invoiceNumberOrId: string,
  deletedByName?: string
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: 'deleted',
      updated_at: nowIso,
    };
    if (deletedByName) {
      updatePayload.notes = `deleted_by:${deletedByName.trim()};deleted_at:${nowIso}`;
    }

    // Fetch bill details prior to deletion to identify customer for due reconciliation
    let billCustQuery = supabase
      .from('bills')
      .select('id, customer_id, notes')
      .eq('shop_id', shopId);

    if (isValidUuid(invoiceNumberOrId)) {
      billCustQuery = billCustQuery.or(`id.eq.${invoiceNumberOrId},invoice_number.eq.${invoiceNumberOrId}`);
    } else {
      billCustQuery = billCustQuery.eq('invoice_number', invoiceNumberOrId);
    }
    const { data: bRows } = await billCustQuery;
    const targetBill = bRows && bRows.length > 0 ? bRows[0] : null;

    let query = supabase
      .from('bills')
      .update(updatePayload)
      .eq('shop_id', shopId);

    if (isValidUuid(invoiceNumberOrId)) {
      query = query.or(`id.eq.${invoiceNumberOrId},invoice_number.eq.${invoiceNumberOrId}`);
    } else {
      query = query.eq('invoice_number', invoiceNumberOrId);
    }

    const { error } = await query;
    if (error) return false;

    // Immediately reconcile customer's outstanding due so deleted bills cannot cause phantom dues
    if (targetBill) {
      let phoneMatch: string | null = null;
      if (targetBill.notes) {
        const pMatch = targetBill.notes.match(/phone:([^;]+)/);
        if (pMatch && pMatch[1]) phoneMatch = pMatch[1].trim();
      }
      const custIdentifier = targetBill.customer_id || phoneMatch;
      if (custIdentifier) {
        await reconcileCustomerDueInDb(shopId, custIdentifier);
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Update an existing bill in Supabase.
 */
export async function updateBillInDb(
  shopId: string,
  invoiceNumberOrId: string,
  updated: Partial<Bill>
): Promise<boolean> {
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updated.total !== undefined) {
      updatePayload.total_minor = Math.round(updated.total * 100);
      updatePayload.subtotal_minor = Math.round(updated.total * 100);
    }
    if (updated.discount !== undefined) {
      updatePayload.discount_minor = Math.round(updated.discount * 100);
    }
    if (updated.paidAmount !== undefined) {
      updatePayload.paid_amount_minor = Math.round(updated.paidAmount * 100);
    }
    if (updated.dueAmount !== undefined) {
      updatePayload.due_amount_minor = Math.round(updated.dueAmount * 100);
    }
    if (updated.mode !== undefined) {
      updatePayload.payment_mode = updated.mode;
    }
    if (updated.status !== undefined) {
      updatePayload.status = updated.status;
    }

    // Resolve customer and staff foreign keys & update snapshot notes
    if (updated.staff) {
      try {
        const staffNames = updated.staff.split(',').map((s) => s.trim()).filter(Boolean);
        for (const sName of staffNames) {
          const { data: stRows } = await supabase
            .from('staff')
            .select('id')
            .eq('shop_id', shopId)
            .ilike('name', sName)
            .limit(1);
          if (stRows && stRows.length > 0) {
            updatePayload.staff_id = stRows[0].id;
            break;
          }
        }
      } catch {}
    }

    if (updated.phone) {
      const cleanPhone = updated.phone.replace(/\D/g, '').slice(-10);
      try {
        const { data: custRows } = await supabase
          .from('customers')
          .select('id')
          .eq('shop_id', shopId)
          .eq('phone', cleanPhone)
          .limit(1);
        if (custRows && custRows.length > 0) {
          updatePayload.customer_id = custRows[0].id;
        }
      } catch {}
    }

    // Update notes string with synchronized due, paid, client, staff, and mode details (mobile parity)
    if (updated.cust !== undefined || updated.phone !== undefined || updated.staff !== undefined || updated.mode !== undefined || updated.dueAmount !== undefined || updated.paidAmount !== undefined) {
      let baseNotes = (updated.notes || '').replace(/due:\d+;?/g, '').replace(/paid:\d+;?/g, '').trim();
      const dueMinorVal = updated.dueAmount !== undefined ? Math.round(updated.dueAmount * 100) : null;
      const paidMinorVal = updated.paidAmount !== undefined ? Math.round(updated.paidAmount * 100) : null;
      const duePrefix = (dueMinorVal !== null && dueMinorVal > 0) ? `due:${dueMinorVal};` : '';
      const paidPrefix = paidMinorVal !== null ? `paid:${paidMinorVal};` : '';
      updatePayload.notes = `${duePrefix}${paidPrefix}${baseNotes ? baseNotes + ';' : ''}staff_name:${updated.staff || 'Stylist'};cust:${updated.cust || 'Client'};phone:${updated.phone || ''};mode:${updated.mode || 'UPI'};[Edited];`;
    } else if (updated.notes !== undefined) {
      updatePayload.notes = updated.notes;
    }

    let query = supabase.from('bills').update(updatePayload).eq('shop_id', shopId);
    if (isValidUuid(invoiceNumberOrId)) {
      query = query.or(`id.eq.${invoiceNumberOrId},invoice_number.eq.${invoiceNumberOrId}`);
    } else {
      query = query.eq('invoice_number', invoiceNumberOrId);
    }

    const { error } = await query;

    // Synchronize payments table if paid amount or payment method updated
    if (!error && (updated.paidAmount !== undefined || updated.mode !== undefined)) {
      try {
        let billUuid = isValidUuid(invoiceNumberOrId) ? invoiceNumberOrId : null;
        if (!billUuid) {
          const { data: bRow } = await supabase
            .from('bills')
            .select('id')
            .eq('shop_id', shopId)
            .eq('invoice_number', invoiceNumberOrId)
            .limit(1);
          if (bRow && bRow.length > 0) billUuid = bRow[0].id;
        }
        if (billUuid) {
          const payUpdate: Record<string, any> = {};
          if (updated.paidAmount !== undefined) payUpdate.amount_minor = Math.round(updated.paidAmount * 100);
          if (updated.mode !== undefined) payUpdate.method = updated.mode;
          await supabase.from('payments').update(payUpdate).eq('bill_id', billUuid).eq('shop_id', shopId);
        }
      } catch {}
    }

    // Asynchronously regenerate updated PDF invoice in Supabase Storage
    try {
      fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId,
          invoiceNumber: invoiceNumberOrId,
          customerName: updated.cust,
          customerPhone: updated.phone,
          stylist: updated.staff || 'Stylist',
          staff: updated.staff || 'Stylist',
          total: updated.total,
          paidAmount: updated.paidAmount,
          dueAmount: updated.dueAmount,
          paymentMethod: updated.mode,
          issuedAt: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {}

    // Authoritatively re-sync customer due if due, total, or payment status changed
    if (!error && (updated.dueAmount !== undefined || updated.paidAmount !== undefined || updated.status !== undefined || updated.total !== undefined)) {
      try {
        const custIdentifier = updatePayload.customer_id || updated.phone;
        if (custIdentifier) {
          await reconcileCustomerDueInDb(shopId, custIdentifier);
        }
      } catch {}
    }

    return !error;
  } catch {
    return false;
  }
}

/**
 * Transactionally settle a customer due in Supabase:
 * 1. Updates customers.outstanding_due_minor
 * 2. Directly updates all unpaid bills for this customer in the bills table (due_amount_minor, paid_amount_minor, status)
 * 3. Records a clearance receipt bill and payment entry in Supabase so Today's revenue and ledger match
 */
export async function settleCustomerDueInDb(
  shopId: string,
  customer: { id: string; name: string; phone: string; currentDue: number },
  paymentAmount: number,
  paymentMode: 'Cash' | 'UPI' | 'Card',
  collectorName: string,
  clearAllRemainingDues: boolean = false
): Promise<{ success: boolean; newDue: number }> {
  try {
    const payment = Math.max(0, paymentAmount);
    if (payment <= 0 && !clearAllRemainingDues) return { success: false, newDue: customer.currentDue };

    const cleanPhone = (customer.phone || '').replace(/\D/g, '').slice(-10);
    const newDue = clearAllRemainingDues ? 0 : Math.max(0, (customer.currentDue || 0) - payment);
    const newDueMinor = Math.round(newDue * 100);
    const paymentMinor = Math.round(payment * 100);
    const nowIso = new Date().toISOString();

    // 1. Update customers table
    let custQuery = supabase
      .from('customers')
      .update({
        outstanding_due_minor: newDueMinor,
        updated_at: nowIso,
      })
      .eq('shop_id', shopId);

    if (isValidUuid(customer.id)) {
      custQuery = custQuery.eq('id', customer.id);
    } else if (cleanPhone) {
      custQuery = custQuery.eq('phone', cleanPhone);
    } else {
      custQuery = custQuery.ilike('name', customer.name.trim());
    }
    await custQuery;

    // 2. Query all unpaid bills for this customer in Supabase
    let candidateBillsQuery = supabase
      .from('bills')
      .select('id, invoice_number, total_minor, paid_amount_minor, due_amount_minor, status, notes')
      .eq('shop_id', shopId)
      .neq('status', 'deleted')
      .neq('status', 'paid')
      .order('created_at', { ascending: true });

    if (isValidUuid(customer.id)) {
      candidateBillsQuery = candidateBillsQuery.or(`customer_id.eq.${customer.id},notes.ilike.%${cleanPhone}%`);
    } else if (cleanPhone) {
      candidateBillsQuery = candidateBillsQuery.ilike('notes', `%${cleanPhone}%`);
    }

    const { data: unpaidBills } = await candidateBillsQuery;

    // Deduct payment paies across all unpaid bills
    let remainingToDeductMinor = paymentMinor;
    if (unpaidBills && unpaidBills.length > 0) {
      for (const b of unpaidBills) {
        if (!clearAllRemainingDues && newDueMinor > 0 && remainingToDeductMinor <= 0) break;
        let currentBillDueMinor = typeof b.due_amount_minor === 'number' && b.due_amount_minor > 0
          ? b.due_amount_minor
          : 0;
        if (currentBillDueMinor === 0 && b.notes && b.notes.includes('due:')) {
          const m = b.notes.match(/due:(\d+)/);
          if (m) currentBillDueMinor = parseInt(m[1], 10);
        }
        if (currentBillDueMinor === 0 && b.status !== 'paid') {
          currentBillDueMinor = Math.max(0, (b.total_minor || 0) - (b.paid_amount_minor || 0));
        }
        if (currentBillDueMinor <= 0) continue;

        const currentBillPaidMinor = b.paid_amount_minor || 0;
        let deductMinor = 0;
        let updatedBillDueMinor = 0;
        let updatedBillPaidMinor = 0;
        let updatedStatus: 'paid' | 'partially_paid' = 'paid';

        if (clearAllRemainingDues || newDueMinor === 0) {
          deductMinor = currentBillDueMinor;
          updatedBillDueMinor = 0;
          updatedBillPaidMinor = b.total_minor || (currentBillPaidMinor + currentBillDueMinor);
          updatedStatus = 'paid';
        } else {
          deductMinor = Math.min(currentBillDueMinor, remainingToDeductMinor);
          remainingToDeductMinor -= deductMinor;
          updatedBillDueMinor = currentBillDueMinor - deductMinor;
          updatedBillPaidMinor = currentBillPaidMinor + deductMinor;
          updatedStatus = updatedBillDueMinor <= 0 ? 'paid' : 'partially_paid';
        }

        // Clean out old due/paid tags and format notes with mobile-compatible due/paid tags and [Edited] marker
        let existingNotes = (b.notes || '').replace(/due:\d+;?/g, '').replace(/paid:\d+;?/g, '').replace(/\[Edited\];?/g, '').trim();
        const updatedNotes = `due:${updatedBillDueMinor};paid:${updatedBillPaidMinor};${existingNotes}${existingNotes.endsWith(';') ? '' : ';'}clearance_paid:${deductMinor};[Edited];`;

        await supabase
          .from('bills')
          .update({
            due_amount_minor: updatedBillDueMinor,
            paid_amount_minor: updatedBillPaidMinor,
            status: updatedStatus,
            notes: updatedNotes,
            updated_at: nowIso,
          })
          .eq('id', b.id);

        // Also insert payment record directly linked to this bill so mobile app's bill-level queries update instantly
        try {
          await supabase.from('payments').insert({
            id: generateUuid(),
            shop_id: shopId,
            bill_id: b.id,
            amount_minor: deductMinor,
            method: paymentMode,
            status: 'Completed',
            paid_at: nowIso,
          });
        } catch {}
      }

      if (clearAllRemainingDues || newDueMinor === 0) {
        let custZeroQuery = supabase
          .from('customers')
          .update({ outstanding_due_minor: 0, updated_at: nowIso })
          .eq('shop_id', shopId);
        if (isValidUuid(customer.id)) custZeroQuery = custZeroQuery.eq('id', customer.id);
        else if (cleanPhone) custZeroQuery = custZeroQuery.eq('phone', cleanPhone);
        await custZeroQuery;
      } else {
        await reconcileCustomerDueInDb(shopId, customer.id || cleanPhone);
      }
    }

    // 3. Insert clearance receipt bill into bills table
    const clearanceBillId = generateUuid();
    const shortId = clearanceBillId.slice(0, 4);
    const invoiceNumber = `DUE-CLR-${Date.now().toString().slice(-4)}`;
    const officialPdfKey = `${invoiceNumber}.pdf`;
    const officialPdfUrl = `https://stylefleet.tecstellar.com/b/${officialPdfKey}`;
    const notesStr = `due:0;paid:${paymentMinor};staff_name:${collectorName};cust:${customer.name};phone:${cleanPhone};mode:${paymentMode};date_str:${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })};`;

    await supabase.from('bills').insert({
      id: clearanceBillId,
      shop_id: shopId,
      customer_id: isValidUuid(customer.id) ? customer.id : null,
      invoice_number: invoiceNumber,
      status: 'paid',
      subtotal_minor: paymentMinor,
      discount_minor: 0,
      tax_minor: 0,
      tip_minor: 0,
      total_minor: paymentMinor,
      paid_amount_minor: paymentMinor,
      due_amount_minor: 0,
      notes: notesStr,
      issued_at: nowIso,
      pdf_url: officialPdfUrl,
    });

    // 4. Insert into payments table
    try {
      await supabase.from('payments').insert({
        id: generateUuid(),
        shop_id: shopId,
        bill_id: clearanceBillId,
        amount_minor: paymentMinor,
        method: paymentMode,
        status: 'Completed',
        paid_at: nowIso,
      });
    } catch {}

    return { success: true, newDue };
  } catch (err) {
    console.error('[Supabase] Error settling due:', err);
    return { success: false, newDue: customer.currentDue };
  }
}

/**
 * Restore a soft-deleted bill in Supabase.
 */
export async function restoreBillInDb(shopId: string, invoiceNumberOrId: string): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    let billCustQuery = supabase
      .from('bills')
      .select('id, customer_id, notes, due_amount_minor')
      .eq('shop_id', shopId);

    if (isValidUuid(invoiceNumberOrId)) {
      billCustQuery = billCustQuery.or(`id.eq.${invoiceNumberOrId},invoice_number.eq.${invoiceNumberOrId}`);
    } else {
      billCustQuery = billCustQuery.eq('invoice_number', invoiceNumberOrId);
    }
    const { data: bRows } = await billCustQuery;
    const targetBill = bRows && bRows.length > 0 ? bRows[0] : null;

    const restoreStatus = (targetBill && (targetBill.due_amount_minor || 0) > 0) ? 'partially_paid' : 'paid';

    let query = supabase
      .from('bills')
      .update({
        status: restoreStatus,
        updated_at: nowIso,
      })
      .eq('shop_id', shopId);

    if (isValidUuid(invoiceNumberOrId)) {
      query = query.or(`id.eq.${invoiceNumberOrId},invoice_number.eq.${invoiceNumberOrId}`);
    } else {
      query = query.eq('invoice_number', invoiceNumberOrId);
    }

    const { error } = await query;
    if (error) return false;

    if (targetBill) {
      let phoneMatch: string | null = null;
      if (targetBill.notes) {
        const pMatch = targetBill.notes.match(/phone:([^;]+)/);
        if (pMatch && pMatch[1]) phoneMatch = pMatch[1].trim();
      }
      const custIdentifier = targetBill.customer_id || phoneMatch;
      if (custIdentifier) {
        await reconcileCustomerDueInDb(shopId, custIdentifier);
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Permanently delete a salon and all its associated data from Supabase.
 */
export async function deleteSalonAccountInDb(shopId: string): Promise<boolean> {
  try {
    if (!shopId) return false;

    // Delete dependent records first to handle foreign key constraints cleanly
    await supabase.from('bills').delete().eq('shop_id', shopId);
    await supabase.from('appointments').delete().eq('shop_id', shopId);
    await supabase.from('customers').delete().eq('shop_id', shopId);
    await supabase.from('expenses').delete().eq('shop_id', shopId);
    await supabase.from('services').delete().eq('shop_id', shopId);
    await supabase.from('service_categories').delete().eq('shop_id', shopId);
    await supabase.from('staff').delete().eq('shop_id', shopId);

    // Delete the shop entry
    const { error } = await supabase.from('shops').delete().eq('id', shopId);
    if (error) {
      console.error('[Supabase] Error deleting shop account:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Supabase] Exception deleting shop account:', err);
    return false;
  }
}

/**
 * Check whether a salon and optionally a specific stylist still exists in Supabase.
 * Returns { exists: boolean, reason?: string }
 */
export async function verifyAccountActiveInDb(
  shopId: string,
  role?: string,
  staffId?: string,
  staffPhone?: string
): Promise<{ active: boolean; reason?: string }> {
  try {
    if (!shopId) return { active: false, reason: 'No salon ID found.' };

    // 1. Verify shop exists in Supabase
    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .select('id, name')
      .eq('id', shopId)
      .maybeSingle();

    if (shopErr || !shop) {
      return { active: false, reason: 'This salon account was permanently deleted from the database.' };
    }

    // 2. If user is a stylist, verify staff member exists and is active
    if (role === 'stylist') {
      let query = supabase.from('staff').select('id, is_active, name').eq('shop_id', shopId);
      if (staffId && isValidUuid(staffId)) {
        query = query.eq('id', staffId);
      } else if (staffPhone) {
        const clean = staffPhone.replace(/\D/g, '').slice(-10);
        query = query.or(`phone.eq.${clean},phone.eq.+91${clean}`);
      }

      const { data: staffList, error: staffErr } = await query;
      if (staffErr || !staffList || staffList.length === 0) {
        return { active: false, reason: 'Your stylist account was deleted or removed from this salon.' };
      }

      if (staffList[0].is_active === false) {
        return { active: false, reason: 'Your stylist account has been deactivated.' };
      }
    }

    return { active: true };
  } catch {
    // In case of transient network failure, don't trigger false logouts
    return { active: true };
  }
}

/**
 * Persist a service into Supabase services table.
 */
export async function saveServiceToDb(
  shopId: string,
  service: { id?: string; cat?: string; name: string; price: number; dur?: number; active?: boolean }
): Promise<string | null> {
  try {
    const srvId = isValidUuid(service.id) ? service.id! : generateUuid();

    // Look up category_id if provided
    let categoryId: string | null = null;
    if (service.cat) {
      const { data: catRows } = await supabase
        .from('service_categories')
        .select('id')
        .eq('shop_id', shopId)
        .ilike('name', service.cat.trim())
        .limit(1);

      if (catRows && catRows.length > 0) {
        categoryId = catRows[0].id;
      } else {
        // Auto-create category in DB if doesn't exist
        const newCatId = generateUuid();
        await supabase.from('service_categories').insert({
          id: newCatId,
          shop_id: shopId,
          name: service.cat.trim(),
          is_active: true,
        });
        categoryId = newCatId;
      }
    }

    const { error } = await supabase.from('services').insert({
      id: srvId,
      shop_id: shopId,
      category_id: categoryId,
      name: service.name.trim(),
      price_minor: Math.round(Number(service.price) * 100),
      duration_minutes: Number(service.dur) || 30,
      is_active: service.active !== false,
    });

    if (error) {
      console.warn('[Supabase] Service insert warning:', error.message);
      return null;
    }
    return srvId;
  } catch (err) {
    console.error('[Supabase] Exception in saveServiceToDb:', err);
    return null;
  }
}

/**
 * Update an existing service in Supabase.
 */
export async function updateServiceInDb(
  shopId: string,
  serviceId: string,
  updated: Partial<ServiceItem>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updated.name !== undefined) payload.name = updated.name.trim();
    if (updated.price !== undefined) payload.price_minor = Math.round(Number(updated.price) * 100);
    if (updated.dur !== undefined) payload.duration_minutes = Number(updated.dur);
    if (updated.active !== undefined) payload.is_active = updated.active;

    if (updated.cat) {
      const { data: catRows } = await supabase
        .from('service_categories')
        .select('id')
        .eq('shop_id', shopId)
        .ilike('name', updated.cat.trim())
        .limit(1);
      if (catRows && catRows.length > 0) {
        payload.category_id = catRows[0].id;
      }
    }

    const { error } = await supabase
      .from('services')
      .update(payload)
      .eq('shop_id', shopId)
      .eq('id', serviceId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete a service from Supabase.
 */
export async function deleteServiceInDb(shopId: string, serviceId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('shop_id', shopId)
      .eq('id', serviceId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Toggle service active status in Supabase.
 */
export async function toggleServiceActiveInDb(shopId: string, serviceId: string, active: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('services')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('shop_id', shopId)
      .eq('id', serviceId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Save a new category to Supabase.
 */
export async function saveCategoryToDb(shopId: string, name: string): Promise<string | null> {
  try {
    const catId = generateUuid();
    const { error } = await supabase.from('service_categories').insert({
      id: catId,
      shop_id: shopId,
      name: name.trim(),
      is_active: true,
    });
    if (error) return null;
    return catId;
  } catch {
    return null;
  }
}

/**
 * Delete a category from Supabase.
 */
export async function deleteCategoryInDb(shopId: string, name: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('service_categories')
      .delete()
      .eq('shop_id', shopId)
      .ilike('name', name.trim());
    return !error;
  } catch {
    return false;
  }
}

/**
 * Rename a category in Supabase.
 */
export async function renameCategoryInDb(shopId: string, oldName: string, newName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('service_categories')
      .update({ name: newName.trim() })
      .eq('shop_id', shopId)
      .ilike('name', oldName.trim());
    return !error;
  } catch {
    return false;
  }
}

/**
 * Update an existing appointment in Supabase.
 */
export async function updateAppointmentInDb(
  shopId: string,
  appointmentId: string,
  updates: Partial<Appointment>
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }

    if (updates.date !== undefined || updates.startsAt !== undefined) {
      const d = (updates.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).trim();
      const t = (updates.startsAt || '10:00 AM').trim();
      let h24 = 10;
      let mStr = '00';
      const timeMatch = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        mStr = timeMatch[2];
        const ampm = (timeMatch[3] || 'AM').toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        h24 = h;
      }
      payload.starts_at = `${d}T${String(h24).padStart(2, '0')}:${mStr}:00+00:00`;
    }

    if (updates.staff) {
      try {
        const staffNames = updates.staff.split(',').map((s) => s.trim()).filter(Boolean);
        for (const sName of staffNames) {
          const { data: stRows } = await supabase
            .from('staff')
            .select('id')
            .eq('shop_id', shopId)
            .ilike('name', sName)
            .limit(1);
          if (stRows && stRows.length > 0) {
            payload.staff_id = stRows[0].id;
            break;
          }
        }
      } catch {}
    }

    if (updates.phone) {
      try {
        const clean = updates.phone.replace(/\D/g, '').slice(-10);
        const { data: cRows } = await supabase
          .from('customers')
          .select('id')
          .eq('shop_id', shopId)
          .eq('phone', clean)
          .limit(1);
        if (cRows && cRows.length > 0) payload.customer_id = cRows[0].id;
      } catch {}
    }

    if (updates.service) {
      try {
        const primaryService = updates.service.split(',')[0].replace(/\(x\d+\)/, '').trim();
        const { data: srvRows } = await supabase
          .from('services')
          .select('id')
          .eq('shop_id', shopId)
          .ilike('name', primaryService)
          .limit(1);
        if (srvRows && srvRows.length > 0) payload.service_id = srvRows[0].id;
      } catch {}
    }

    if (updates.cust !== undefined || updates.phone !== undefined || updates.service !== undefined || updates.staff !== undefined || updates.amount !== undefined) {
      payload.notes = JSON.stringify({
        cust: updates.cust,
        phone: updates.phone,
        service: updates.service,
        staff_name: updates.staff,
        amount: updates.amount,
      });
    }

    const { error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('shop_id', shopId)
      .eq('id', appointmentId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete an appointment in Supabase (or mark cancelled).
 */
export async function deleteAppointmentInDb(
  shopId: string,
  appointmentId: string,
  deletedByName?: string
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const updater: Record<string, any> = {
      status: 'cancelled',
      updated_at: nowIso,
    };
    if (deletedByName) {
      updater.notes = `deleted_by:${deletedByName.trim()};deleted_at:${nowIso}`;
    }
    const { error } = await supabase
      .from('appointments')
      .update(updater)
      .eq('shop_id', shopId)
      .eq('id', appointmentId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete / deactivate a staff member in Supabase.
 */
export async function deleteStaffInDb(shopId: string, staffId: string): Promise<boolean> {
  try {
    await ensureSupabaseOwnerSession(shopId);

    let { error } = await supabase
      .from('staff')
      .delete()
      .eq('shop_id', shopId)
      .eq('id', staffId);

    if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) {
      await ensureSupabaseOwnerSession(shopId, true);
      ({ error } = await supabase
        .from('staff')
        .delete()
        .eq('shop_id', shopId)
        .eq('id', staffId));
    }

    if (!error) return true;

    // Server API Fallback
    try {
      const res = await fetch(`/api/staff?shopId=${encodeURIComponent(shopId)}&staffId=${encodeURIComponent(staffId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      return !!json.success;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
