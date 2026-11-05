import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateInvoicePdfBuffer, type InvoicePdfData } from '@/lib/invoice-pdf-generator';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || searchParams.get('invoiceNumber') || searchParams.get('billId');
    if (!id) {
      return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });
    }

    const cleanId = decodeURIComponent(id).replace(/\.pdf$/i, '').trim();

    // 1. Find bill in Supabase database
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    let billRow: any = null;

    if (isUuid) {
      const { data } = await supabase
        .from('bills')
        .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
        .eq('id', cleanId)
        .maybeSingle();
      billRow = data;
    }

    if (!billRow) {
      const candidates = [
        cleanId,
        cleanId.replace(/_/g, '-'),
        cleanId.replace(/-/g, '_'),
      ];
      for (const cand of candidates) {
        const { data } = await supabase
          .from('bills')
          .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
          .eq('invoice_number', cand)
          .maybeSingle();
        if (data) {
          billRow = data;
          break;
        }
      }
    }

    if (!billRow) {
      const { data } = await supabase
        .from('bills')
        .select('*, bill_items(*), customers(name, phone), staff(name), shops(*)')
        .ilike('invoice_number', `%${cleanId}%`)
        .limit(1)
        .maybeSingle();
      billRow = data;
    }

    // 2. Check Supabase storage candidates
    const shortId = billRow?.id ? billRow.id.replace(/-/g, '').slice(0, 4) : '0001';
    const invNumber = billRow?.invoice_number || cleanId;
    
    const storageKeys: string[] = [];
    if (billRow?.pdf_url) {
      const urlKey = billRow.pdf_url.split('/').pop()?.split('?')[0];
      if (urlKey) storageKeys.push(urlKey);
    }
    storageKeys.push(`${invNumber}_${shortId}.pdf`);
    storageKeys.push(`${cleanId}.pdf`);
    storageKeys.push(`${invNumber}.pdf`);

    for (const key of storageKeys) {
      try {
        const { data: fileData, error } = await supabase.storage.from('invoices').download(key);
        if (!error && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="Invoice_${invNumber}.pdf"`,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch {}
    }

    // 3. If not in storage and we found billRow, generate on the fly
    if (billRow) {
      const shopData = billRow.shops || {};
      const rawItems = billRow.bill_items || [];
      const parsedStaff = (billRow.staff as any)?.name || 'Stylist';

      const pdfData: InvoicePdfData = {
        invoiceNumber: invNumber,
        billId: billRow.id,
        issuedAt: billRow.created_at || new Date().toISOString(),
        customerName: (billRow.customers as any)?.name || 'Client',
        customerPhone: (billRow.customers as any)?.phone || '',
        stylistName: parsedStaff,
        shop: {
          shopName: shopData.name || 'StyleFleet Salon',
          phone: shopData.phone || '',
          street: shopData.address || '',
          city: shopData.city || '',
          pincode: shopData.pin_code || '',
          email: shopData.email || '',
          upiId: shopData.upi_id || '',
          logoImg: shopData.logo_path || '',
        },
        items: rawItems.map((it: any) => ({
          name: it.service_name_snapshot || 'Salon Service',
          price: Math.round((it.unit_price_minor || 0) / 100),
          qty: it.quantity || 1,
          staff: parsedStaff,
        })),
        subtotal: Math.round((billRow.total_minor || 0) / 100),
        discount: Math.round((billRow.discount_minor || 0) / 100),
        tax: 0,
        total: Math.round((billRow.total_minor || 0) / 100),
        paidAmount: Math.round((billRow.paid_amount_minor || 0) / 100),
        dueAmount: Math.round((billRow.due_amount_minor || 0) / 100),
        paymentMethod: 'UPI',
        paymentStatus: (billRow.due_amount_minor || 0) <= 0 ? 'paid' : 'pending',
      };

      const pdfBytes = await generateInvoicePdfBuffer(pdfData);

      // Save to storage in background
      supabase.storage.from('invoices').upload(`${invNumber}_${shortId}.pdf`, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      }).catch(() => {});

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Invoice_${invNumber}.pdf"`,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  } catch (err: any) {
    console.error('[Download Route Error]:', err);
    return NextResponse.json({ error: err.message || 'Download failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      shopId,
      billId,
      invoiceNumber,
      customerName,
      customerPhone,
      items,
      subtotal,
      discount,
      tax,
      total,
      paidAmount,
      dueAmount,
      paymentMethod,
      issuedAt,
      shopProfile,
      staff,
      staffName,
      stylist,
    } = body;

    const invNumber = invoiceNumber || billId || 'INV';
    const cleanInv = String(invNumber).replace(/\.pdf$/i, '').trim();

    // Check storage first if shortId or standard exists
    const shortId = billId ? billId.replace(/-/g, '').slice(0, 4) : '0001';
    const storageKeys = [
      `${cleanInv}_${shortId}.pdf`,
      `${cleanInv}.pdf`,
    ];

    for (const key of storageKeys) {
      try {
        const { data: fileData, error } = await supabase.storage.from('invoices').download(key);
        if (!error && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="Invoice_${cleanInv}.pdf"`,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch {}
    }

    // Otherwise generate PDF buffer directly
    const resolvedStaff = stylist || staffName || staff || (items && items[0]?.staff) || 'Stylist';
    const pdfData: InvoicePdfData = {
      invoiceNumber: cleanInv,
      billId,
      issuedAt: issuedAt || new Date().toISOString(),
      customerName: customerName || 'Client',
      customerPhone: customerPhone || '',
      stylistName: resolvedStaff,
      shop: shopProfile || { shopName: 'StyleFleet Salon' },
      items: items || [],
      subtotal: subtotal ?? total,
      discount: discount ?? 0,
      tax: tax ?? 0,
      total,
      paidAmount: paidAmount ?? total,
      dueAmount: dueAmount ?? 0,
      paymentMethod: paymentMethod || 'UPI',
      paymentStatus: (dueAmount || 0) <= 0 ? 'paid' : (paidAmount > 0 ? 'partially_paid' : 'pending'),
    };

    const pdfBytes = await generateInvoicePdfBuffer(pdfData);

    // Save to storage asynchronously
    supabase.storage.from('invoices').upload(`${cleanInv}_${shortId}.pdf`, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    }).catch(() => {});

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice_${cleanInv}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[Download POST Route Error]:', err);
    return NextResponse.json({ error: err.message || 'Download failed' }, { status: 500 });
  }
}
