'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { InvoiceTemplate } from '@/components/invoice-template';
import type { Bill, ShopProfile } from '@/components/SalonContext';

interface BillPublicPageProps {
  params: {
    id: string;
  };
}

export default function BillPublicPage({ params }: BillPublicPageProps) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadPublicBill() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const rawParam = decodeURIComponent(params.id || '');
        const cleanId = rawParam.replace(/\.pdf$/i, '').trim();

        if (!cleanId) {
          setErrorMsg('Invalid or missing invoice identifier.');
          setLoading(false);
          return;
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
        let billRow: any = null;

        // 1. If cleanId is a valid UUID, query by id directly
        if (isUuid) {
          const { data } = await supabase
            .from('bills')
            .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
            .eq('id', cleanId)
            .limit(1)
            .maybeSingle();
          billRow = data;
        }

        // 2. Query by invoice_number variants
        if (!billRow) {
          // Check for trailing short UUID suffix (e.g. "INV-1_784b" -> base="INV-1", shortId="784b")
          const trailingShortMatch = cleanId.match(/^(.*?)(?:_([a-f0-9]{4,8}))$/i);
          const baseNumber = trailingShortMatch ? trailingShortMatch[1] : cleanId;
          const shortId = trailingShortMatch ? trailingShortMatch[2] : null;

          const candidates = Array.from(new Set([
            cleanId,
            baseNumber,
            baseNumber.replace(/_/g, '-'),
            baseNumber.replace(/-/g, '_'),
            cleanId.replace(/_/g, '-'),
          ])).filter(Boolean);

          for (const cand of candidates) {
            const { data } = await supabase
              .from('bills')
              .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
              .eq('invoice_number', cand)
              .limit(1)
              .maybeSingle();
            if (data) {
              billRow = data;
              break;
            }
          }

          // 3. If shortId is available, search by UUID prefix
          if (!billRow && shortId) {
            const { data } = await supabase
              .from('bills')
              .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
              .ilike('id', `${shortId}%`)
              .limit(1)
              .maybeSingle();
            if (data) billRow = data;
          }

          // 4. Fallback ilike search on invoice_number
          if (!billRow && baseNumber) {
            const { data } = await supabase
              .from('bills')
              .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
              .ilike('invoice_number', `%${baseNumber}%`)
              .limit(1)
              .maybeSingle();
            if (data) billRow = data;
          }
        }

        if (!billRow) {
          setErrorMsg(`Invoice #${cleanId} was not found in the StyleFleet registry.`);
          setLoading(false);
          return;
        }

        // Parse notes for metadata if stored as key:value
        let parsedStaff = (billRow.staff as any)?.name || 'Stylist';
        let parsedCust = (billRow.customers as any)?.name || 'Walk-in Client';
        let parsedPhone = (billRow.customers as any)?.phone || '';
        let parsedMode = 'UPI';

        if (billRow.notes) {
          const parts = billRow.notes.split(';');
          for (const p of parts) {
            if (p.startsWith('staff_name:') && parsedStaff === 'Stylist') parsedStaff = p.replace('staff_name:', '');
            if (p.startsWith('cust:') && parsedCust === 'Walk-in Client') parsedCust = p.replace('cust:', '');
            if (p.startsWith('phone:') && !parsedPhone) parsedPhone = p.replace('phone:', '');
            if (p.startsWith('mode:')) parsedMode = p.replace('mode:', '');
          }
        }

        // Map bill items
        const rawItems = billRow.bill_items || [];
        const items = rawItems.map((it: any) => ({
          name: it.service_name_snapshot || 'Salon Service',
          price: Math.round((it.unit_price_minor || 0) / 100),
          qty: it.quantity || 1,
          staff: parsedStaff,
        }));

        const mappedBill: Bill = {
          id: billRow.invoice_number || billRow.id,
          dateStr: billRow.created_at || new Date().toISOString(),
          cust: parsedCust,
          phone: parsedPhone,
          items: items.length > 0 ? items : [{ name: 'Salon Service', price: Math.round((billRow.total_minor || 0) / 100), qty: 1 }],
          staff: parsedStaff,
          total: Math.round((billRow.total_minor || 0) / 100),
          paidAmount: Math.round((billRow.paid_amount_minor || 0) / 100),
          dueAmount: Math.round((billRow.due_amount_minor || 0) / 100),
          status: billRow.status === 'paid' ? 'paid' : ((billRow.due_amount_minor || 0) > 0 && (billRow.paid_amount_minor || 0) > 0 ? 'partially_paid' : 'pending'),
          mode: (parsedMode || 'UPI') as any,
          discount: Math.round((billRow.discount_minor || 0) / 100),
          isToday: false,
          isDeleted: false,
          createdAt: billRow.created_at,
          reminderStatus: billRow.reminder_status,
          confirmationStatus: billRow.confirmation_status,
        };

        const shopData = billRow.shops || {};
        const mappedShop: ShopProfile = {
          id: shopData.id || billRow.shop_id,
          shopName: shopData.name || 'StyleFleet Salon',
          ownerName: shopData.social_links?.owner_name || 'Owner',
          phone: shopData.phone || '',
          address: shopData.address || '',
          city: shopData.city || '',
          pinCode: shopData.pin_code || '',
          gstin: shopData.gstin || '',
          upiId: shopData.upi_id || shopData.social_links?.upi_id || '',
          bookingHours: `${shopData.social_links?.booking_start_time || '09:00 AM'} - ${shopData.social_links?.booking_end_time || '08:30 PM'}`,
          invoicePrefix: shopData.invoice_prefix || 'INV-',
          logoImg: shopData.logo_path || '',
          applyGst: (shopData.gst_rate || 0) > 0,
          instagram: shopData.social_links?.instagram,
          facebook: shopData.social_links?.facebook,
        };

        setBill(mappedBill);
        setShopProfile(mappedShop);
        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching public bill:', err);
        setErrorMsg('Failed to load bill invoice from cloud database.');
        setLoading(false);
      }
    }

    loadPublicBill();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B132B] flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-full border-3 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin mb-4" />
        <h2 className="text-base font-bold tracking-wide">Loading Official Invoice...</h2>
        <p className="text-xs text-slate-400 mt-1">Retrieving verified salon ledger</p>
      </div>
    );
  }

  if (errorMsg || !bill || !shopProfile) {
    return (
      <div className="min-h-screen bg-[#0B132B] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center text-2xl mb-4">
          ⚠️
        </div>
        <h1 className="text-xl font-black tracking-tight text-white">Invoice Not Found</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm">
          {errorMsg || 'The requested invoice link could not be verified or has been moved.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs cursor-pointer shadow-md transition-transform active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center py-4 sm:py-8 px-2 sm:px-4">
      {/* Top Floating App Bar */}
      <div className="no-print w-full max-w-3xl flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center font-black text-xs">
            SF
          </div>
          <div>
            <span className="text-xs font-black text-white block">StyleFleet Verified Invoice</span>
            <span className="text-[10px] text-slate-400 block">{shopProfile.shopName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {shopProfile.phone && (
            <button
              onClick={() => window.open(`tel:+91${shopProfile.phone}`)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="hidden sm:inline">Call Salon</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <svg className="w-3.5 h-3.5 text-[#0B1F44]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Save PDF / Print</span>
          </button>
        </div>
      </div>

      {/* The Printable Official Luxury Invoice Template */}
      <div className="w-full max-w-3xl">
        <InvoiceTemplate
          bill={bill}
          shopProfile={shopProfile}
        />
      </div>
    </div>
  );
}
