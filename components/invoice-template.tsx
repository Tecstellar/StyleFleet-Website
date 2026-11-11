'use client';

import React from 'react';
import { useSalonSafe, type Bill, type ShopProfile } from '@/components/SalonContext';
import { buildOfficialWhatsAppBillMessage, openWhatsAppBill } from '@/lib/salon-helpers';

interface InvoiceTemplateProps {
  bill: Bill;
  shopProfile: ShopProfile;
  pdfStorageUrl?: string;
  pdfFileName?: string;
  onClose?: () => void;
  onShareWhatsApp?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function printInvoiceSinglePage(elementId: string) {
  if (typeof window === 'undefined') return;
  const target = document.getElementById(elementId);
  if (!target) {
    window.print();
    return;
  }

  // Remove existing print iframe if any
  const oldIframe = document.getElementById('stylefleet-print-iframe');
  if (oldIframe) {
    try {
      oldIframe.remove();
    } catch {}
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'stylefleet-print-iframe';
  iframe.setAttribute(
    'style',
    'position:fixed;top:-99999px;left:-99999px;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-9999;'
  );
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  // Collect stylesheet tags from parent document
  const headElements: string[] = [];
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    headElements.push(node.outerHTML);
  });

  // Clone invoice and strip screen-only controls
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, [data-ui="no-print"]').forEach((el) => el.remove());

  const printDocumentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice</title>
  ${headElements.join('\n')}
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0F1A36 !important;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      overflow: visible !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
    }
    #${elementId} {
      visibility: visible !important;
      display: block !important;
      position: relative !important;
      width: 100% !important;
      max-width: 680px !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      border: 1px solid #DDE1E8 !important;
      border-radius: 14px !important;
      box-shadow: none !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;

  doc.open();
  doc.write(printDocumentHtml);
  doc.close();

  const iframeWin = iframe.contentWindow;
  if (!iframeWin) {
    window.print();
    return;
  }

  const triggerPrint = () => {
    try {
      iframeWin.focus();
      iframeWin.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {}
      }, 3000);
    }
  };

  const images = doc.images;
  if (!images || images.length === 0) {
    setTimeout(triggerPrint, 200);
  } else {
    let pending = images.length;
    const checkImage = () => {
      pending--;
      if (pending <= 0) {
        setTimeout(triggerPrint, 200);
      }
    };
    for (let i = 0; i < images.length; i++) {
      if (images[i].complete) {
        pending--;
      } else {
        images[i].addEventListener('load', checkImage, { once: true });
        images[i].addEventListener('error', checkImage, { once: true });
      }
    }
    if (pending <= 0) {
      setTimeout(triggerPrint, 200);
    } else {
      setTimeout(triggerPrint, 1000);
    }
  }
}

export function InvoiceTemplate({
  bill,
  shopProfile,
  pdfStorageUrl,
  pdfFileName,
  onClose,
  onShareWhatsApp,
  onEdit,
  onDelete,
}: InvoiceTemplateProps) {
  const salon = useSalonSafe();
  const role = salon?.role || 'owner';
  const hasPermission = salon?.hasPermission || (() => true);
  const isDarkMode = salon?.isDarkMode || false;
  const canShareBills = role === 'owner' || hasPermission('share_bills');
  const [shareOptionsOpen, setShareOptionsOpen] = React.useState(false);

  // Format invoice date into DD MMM YYYY (e.g. "27 Oct 2026")
  const formatInvoiceDate = (dateVal?: string): string => {
    try {
      if (!dateVal) {
        return new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
      const cleaned = dateVal.split(',')[0].trim();
      const parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
      return cleaned;
    } catch {
      return new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  };

  const invoiceDateStr = formatInvoiceDate(bill.createdAt || bill.dateStr);

  // Compute subtotal from items
  const itemsSubtotal = (bill.items || []).reduce(
    (acc, it) => acc + (it.price || 0) * (it.qty || 1),
    0
  );
  const discountAmount = bill.discount || 0;
  const taxAmount = (bill as any).tax || 0;
  const tipAmount = (bill as any).tip || 0;

  // Salon initial badge
  const salonInitial = shopProfile.shopName
    ? shopProfile.shopName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SF';

  // Payment status badge text
  const isPaid = (bill.dueAmount || 0) <= 0 || bill.status === 'paid';
  const isPartial = (bill.dueAmount || 0) > 0 && (bill.paidAmount || 0) > 0;
  const paymentBadgeText = isPaid ? 'PAID' : (isPartial ? 'PARTIAL' : 'PENDING');

  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);

  // Pre-generate official vector PDF to Supabase storage as soon as invoice preview opens
  React.useEffect(() => {
    const cleanInv = (bill.id || '').replace(/\.pdf$/i, '').trim();
    if (!cleanInv || !shopProfile?.id) return;
    try {
      fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: shopProfile.id,
          billId: bill.id,
          invoiceNumber: cleanInv,
          customerName: bill.cust || 'Client',
          customerPhone: bill.phone || '',
          stylist: bill.staff || 'Stylist',
          staff: bill.staff || 'Stylist',
          items: (bill.items || []).map((it) => ({
            ...it,
            staff: it.staff || bill.staff || 'Stylist',
          })),
          subtotal: itemsSubtotal,
          discount: discountAmount,
          tax: taxAmount,
          total: bill.total,
          paidAmount: bill.paidAmount,
          dueAmount: bill.dueAmount,
          paymentMethod: bill.mode || 'UPI',
          issuedAt: bill.createdAt || bill.dateStr,
          shopProfile,
        }),
      }).catch(() => {});
    } catch {}
  }, [bill.id, bill.staff, shopProfile?.id, shopProfile?.logoImg]);

  const handlePrint = () => {
    printInvoiceSinglePage('printable-luxury-invoice');
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const cleanInv = (bill.id || '').replace(/\.pdf$/i, '').trim();
      const filename = `Invoice_${cleanInv || 'Receipt'}.pdf`;

      const triggerDownloadBlob = (blob: Blob, name: string) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
          } catch {}
        }, 15000);
      };

      // 1. Check Supabase storage candidates for pre-rendered PDF
      const storageBase = 'https://nqwgxkdpwpgqkezaqsrx.supabase.co/storage/v1/object/public/invoices/';
      const candidates: string[] = [];
      if (pdfStorageUrl) candidates.push(pdfStorageUrl);
      if (pdfFileName) candidates.push(`${storageBase}${encodeURIComponent(pdfFileName)}`);
      candidates.push(`${storageBase}${encodeURIComponent(cleanInv)}.pdf`);

      for (const cand of candidates) {
        try {
          const resp = await fetch(cand);
          if (resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('pdf') || ct.includes('octet-stream')) {
              const blob = await resp.blob();
              if (blob.size > 500) {
                triggerDownloadBlob(blob, filename);
                return;
              }
            }
          }
        } catch {}
      }

      // 2. Fetch binary stream directly from server download endpoint
      try {
        const res = await fetch(`/api/invoices/download?id=${encodeURIComponent(cleanInv)}&billId=${encodeURIComponent(bill.id || '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: shopProfile.id,
            billId: bill.id,
            invoiceNumber: cleanInv,
            customerName: bill.cust || 'Client',
            customerPhone: bill.phone || '',
            stylist: bill.staff || 'Stylist',
            staff: bill.staff || 'Stylist',
            items: (bill.items || []).map((it) => ({
              ...it,
              staff: it.staff || bill.staff || 'Stylist',
            })),
            subtotal: itemsSubtotal,
            discount: discountAmount,
            tax: taxAmount,
            total: bill.total,
            paidAmount: bill.paidAmount,
            dueAmount: bill.dueAmount,
            paymentMethod: bill.mode || 'UPI',
            issuedAt: bill.createdAt || bill.dateStr,
            shopProfile,
          }),
        });

        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 500) {
            triggerDownloadBlob(blob, filename);
            return;
          }
        }
      } catch {}

      // 3. Fallback: navigate directly to server download endpoint with attachment header
      window.location.href = `/api/invoices/download?id=${encodeURIComponent(cleanInv)}&billId=${encodeURIComponent(bill.id || '')}`;
    } catch {
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDefaultWhatsAppShare = () => {
    if (onShareWhatsApp) {
      onShareWhatsApp();
      return;
    }
    const cleanInv = (bill.id || '').replace(/\.pdf$/i, '').trim();
    const msg = buildOfficialWhatsAppBillMessage({
      shopName: shopProfile.shopName || 'StyleFleet Salon',
      shopPhone: shopProfile.phone || '',
      upiId: shopProfile.upiId || '',
      customerName: bill.cust || 'Client',
      invoiceNumber: cleanInv,
      billId: bill.id,
      pdfUrl: `https://stylefleet.tecstellar.com/b/${encodeURIComponent(cleanInv)}.pdf`,
      totalAmount: bill.total,
      paidAmount: bill.paidAmount,
      dueAmount: bill.dueAmount,
      paymentMethod: bill.mode || 'UPI',
      socialLinks: {
        instagram: shopProfile.instagram,
        facebook: shopProfile.facebook,
      },
    });
    openWhatsAppBill(bill.phone, msg);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* ================= SCREEN-ONLY ACTION TOOLBAR (Hidden in Public Customer View) ================= */}
      {(onEdit || onDelete || onClose) && (
        <div
          className={`no-print w-full max-w-3xl flex items-center justify-between mb-3 px-3.5 py-2.5 rounded-2xl border backdrop-blur-md transition-colors shadow-lg ${
            isDarkMode
              ? 'bg-[#121B33]/95 border-[#2A3858] text-white'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black tracking-tight ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>
              Invoice Preview · #{bill.id}
            </span>
            {bill.isEdited && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40">
                Edited
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                title="Edit Bill"
                onClick={onEdit}
                className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  isDarkMode
                    ? 'bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border-[#D4AF37]/50 text-[#D4AF37]'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-400 text-amber-800'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                title="Delete Bill (30 Days)"
                onClick={onDelete}
                className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  isDarkMode
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/50 text-rose-300'
                    : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-black transition-all cursor-pointer shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-400 text-slate-800 hover:text-black'
                }`}
                title="Close Invoice Preview"
                aria-label="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= PRINTABLE LUXURY INVOICE SHEET ================= */}
      <div
        id="printable-luxury-invoice"
        className="w-full max-w-3xl bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 transition-all font-sans print:m-0 print:w-full print:max-w-none print:shadow-none print:rounded-none print:border-none"
        style={{
          colorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        }}
      >
        <style jsx global>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 4mm 6mm;
            }
            html, body {
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              max-height: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              background: #ffffff !important;
              color: #0F1A36 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              visibility: hidden !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: hidden !important;
            }
            /* Suppress parent overlays from creating ghost height */
            .fixed, [role="dialog"], .modal-overlay, .modal-backdrop, .animate-fadeIn {
              position: static !important;
              overflow: visible !important;
              background: transparent !important;
              backdrop-filter: none !important;
              padding: 0 !important;
              margin: 0 !important;
              height: auto !important;
              min-height: 0 !important;
              max-height: none !important;
            }
            /* Strict Single Sheet Presentation - Prevents duplicate 2nd page copy */
            #printable-luxury-invoice {
              visibility: visible !important;
              display: block !important;
              position: relative !important;
              left: 0 !important;
              right: 0 !important;
              top: 0 !important;
              margin: 2mm auto 0 auto !important;
              width: 100% !important;
              max-width: 680px !important;
              height: auto !important;
              max-height: 275mm !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: 1px solid #DDE1E8 !important;
              border-radius: 14px !important;
              overflow: visible !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
            }
            #printable-luxury-invoice * {
              visibility: visible !important;
            }
            /* Re-hide anything with .no-print and screen siblings */
            #printable-luxury-invoice .no-print,
            #printable-luxury-invoice .no-print *,
            .no-print,
            .no-print * {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              max-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              overflow: hidden !important;
            }
            body.stylefleet-single-page-print > *:not(:has(#printable-luxury-invoice)) {
              display: none !important;
              height: 0 !important;
              overflow: hidden !important;
            }
            #printable-luxury-invoice h1 {
              color: #ffffff !important;
              -webkit-text-fill-color: #ffffff !important;
            }
            [data-ui="invoice-table-header"],
            [data-ui="invoice-table-header"] * {
              color: #ffffff !important;
              -webkit-text-fill-color: #ffffff !important;
            }
            [data-ui="invoice-table-header"] [data-ui="amount-col"] {
              color: #D4A515 !important;
              -webkit-text-fill-color: #D4A515 !important;
            }
          }
        `}</style>

        {/* 1. HEADER SECTION (NAVY BACKGROUND) */}
        <div
          data-ui="invoice-header"
          className="bg-[#0F1A36] text-white p-5 sm:p-8 print:p-6"
          style={{ backgroundColor: '#0F1A36' }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Salon Info Left */}
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 border-[#D4A515] bg-white flex items-center justify-center text-[#D4A515] font-black text-lg shrink-0 shadow-sm overflow-hidden p-1"
                style={{ borderColor: '#D4A515', backgroundColor: '#ffffff' }}
              >
                {shopProfile.logoImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shopProfile.logoImg}
                    alt={shopProfile.shopName}
                    className="w-full h-full object-contain rounded-xl"
                  />
                ) : (
                  <span data-ui="invoice-logo-fallback" className="text-[#0F1A36] font-black">{salonInitial}</span>
                )}
              </div>
              <div className="space-y-0.5">
                <h1
                  className="text-lg sm:text-2xl font-black text-white tracking-tight"
                  style={{ color: '#ffffff' }}
                >
                  {shopProfile.shopName || 'StyleFleet Salon'}
                </h1>
                <p className="text-xs text-slate-300">
                  {shopProfile.address || 'Salon Address'}
                  {shopProfile.city ? `, ${shopProfile.city}` : ''}
                  {shopProfile.pinCode ? ` – ${shopProfile.pinCode}` : ''}
                </p>
                <p className="text-xs text-slate-300">
                  {shopProfile.phone ? `+91 ${shopProfile.phone}` : '+91 XXXXX XXXXX'}
                  {shopProfile.gstin ? ` · GSTIN: ${shopProfile.gstin}` : ''}
                </p>
              </div>
            </div>

            {/* Invoice Tag Right */}
            <div className="sm:text-right space-y-0.5">
              <h2
                className="text-2xl sm:text-3xl font-black tracking-widest uppercase"
                style={{ color: '#D4A515', letterSpacing: '3px' }}
              >
                INVOICE
              </h2>
              <div className="text-xs space-y-0.5">
                <div className="flex items-center sm:justify-end gap-2 text-slate-300">
                  <span className="text-slate-300">Invoice No.</span>
                  <strong className="text-white font-mono font-bold tracking-wide">
                    #{bill.id}
                  </strong>
                </div>
                <div className="flex items-center sm:justify-end gap-2 text-slate-300">
                  <span className="text-slate-300">Invoice Date</span>
                  <strong className="text-white font-bold">
                    {invoiceDateStr}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CHAMPAGNE GOLD ACCENT STRIPE */}
        <div
          className="h-[3.5px] w-full bg-[#D4A515]"
          style={{ backgroundColor: '#D4A515' }}
        />

        {/* 3. CUSTOMER & APPOINTMENT METADATA BAR (INFO SECTION - 4 PROMINENT COLUMNS) */}
        <div className="px-5 sm:px-8 py-3.5 sm:py-4 print:py-2.5 print:px-6 border-b border-slate-200 bg-white">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Column 1: Billed To */}
            <div>
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block"
                style={{ color: '#0F1A36' }}
              >
                BILLED TO
              </span>
              <p className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5 truncate">
                {bill.cust || 'Walk-in Client'}
              </p>
            </div>

            {/* Column 2: Mobile */}
            <div>
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block"
                style={{ color: '#0F1A36' }}
              >
                MOBILE
              </span>
              <p className="text-sm sm:text-base font-bold font-mono text-slate-900 mt-0.5">
                {bill.phone ? (bill.phone.startsWith('+91') ? bill.phone : `+91 ${bill.phone}`) : '+91 XXXXX XXXXX'}
              </p>
            </div>

            {/* Column 3: Stylist / Staff (Prominently Highlighted) */}
            <div>
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block"
                style={{ color: '#0F1A36' }}
              >
                {(bill.staff || '').includes(',') ? 'STYLISTS' : 'STYLIST'}
              </span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D4A515] inline-block shrink-0" />
                <p className="text-sm sm:text-base font-black text-[#0F1A36] truncate">
                  {bill.staff || 'Stylist'}
                </p>
              </div>
            </div>

            {/* Column 4: Appointment Date */}
            <div className="sm:text-right">
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block"
                style={{ color: '#0F1A36' }}
              >
                APPOINTMENT DATE
              </span>
              <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                {invoiceDateStr}
              </p>
            </div>
          </div>
        </div>

        {/* 4. SERVICES TABLE (FULLY RESPONSIVE ON MOBILE & DESKTOP) */}
        <div className="px-4 sm:px-8 pt-3 sm:pt-4 print:pt-2 print:px-6">
          <div className="w-full">
            {/* Table Header Bar */}
            <div
              data-ui="invoice-table-header"
              className="bg-[#0F1A36] text-white rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 print:py-1.5 flex items-center text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-sm"
              style={{ backgroundColor: '#0F1A36', color: '#ffffff' }}
            >
              <div className="flex-1 min-w-0 font-black text-white" style={{ color: '#ffffff' }}>SERVICE</div>
              <div className="w-24 sm:w-28 text-left font-black text-white" style={{ color: '#ffffff' }}>STYLIST</div>
              <div className="w-10 sm:w-14 text-center font-black text-white shrink-0" style={{ color: '#ffffff' }}>QTY</div>
              <div className="w-14 sm:w-20 text-right font-black text-white shrink-0" style={{ color: '#ffffff' }}>PRICE</div>
              <div
                data-ui="amount-col"
                className="w-16 sm:w-22 text-right text-[#D4A515] font-black shrink-0"
                style={{ color: '#D4A515' }}
              >
                AMOUNT
              </div>
            </div>

            {/* Table Body Rows: Strictly real selected services */}
            <div className="divide-y divide-slate-100">
              {bill.items && bill.items.length > 0 ? (
                bill.items.map((item, idx) => {
                  const itemQty = item.qty || 1;
                  const itemPrice = item.price || 0;
                  const itemTotal = itemPrice * itemQty;
                  const itemStaff = item.staff || bill.staff || 'Stylist';

                  return (
                    <div
                      key={idx}
                      className="px-3 sm:px-4 py-2 sm:py-2.5 print:py-1.5 flex items-center text-xs sm:text-sm hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <span className="font-bold text-slate-900 block truncate">{item.name}</span>
                      </div>
                      <div className="w-24 sm:w-28 text-left font-bold text-slate-800 text-xs sm:text-sm truncate">
                        {itemStaff}
                      </div>
                      <div className="w-10 sm:w-14 text-center font-bold text-slate-800 shrink-0">
                        {itemQty}
                      </div>
                      <div className="w-14 sm:w-20 text-right text-slate-700 font-mono text-[11px] sm:text-xs shrink-0">
                        ₹{itemPrice}
                      </div>
                      <div className="w-16 sm:w-22 text-right font-black text-slate-900 font-mono shrink-0">
                        ₹{itemTotal}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  No items recorded on this invoice.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. PAYMENT STATUS & FINANCIAL TOTALS BREAKDOWN */}
        <div className="px-5 sm:px-8 py-5 sm:py-6 print:py-3.5 print:px-6">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-5 sm:gap-6">
            {/* Left: Payment Status */}
            <div className="space-y-2">
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block"
                style={{ color: '#0F1A36' }}
              >
                PAYMENT
              </span>
              <div className="flex items-center gap-2">
                <span
                  data-ui="payment-badge"
                  className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase ${
                    isPaid
                      ? 'bg-emerald-100 text-emerald-800'
                      : isPartial
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  [{paymentBadgeText}]
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  via {bill.mode || 'UPI'}
                </span>
              </div>
              {shopProfile.upiId && !isPaid && (bill.dueAmount || 0) > 0 && (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 max-w-sm text-left shadow-sm">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    <svg className="w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    <span>Instant UPI Settlement</span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-snug">
                    Salon UPI ID: <strong className="font-mono font-black text-slate-900 select-all">{shopProfile.upiId}</strong>
                  </p>
                  <p className="text-[10px] text-amber-800 font-bold mt-0.5">
                    Pending Balance: ₹{(bill.dueAmount || 0).toLocaleString('en-IN')}
                  </p>
                  <a
                    href={`upi://pay?pa=${encodeURIComponent(shopProfile.upiId)}&pn=${encodeURIComponent(shopProfile.shopName)}&am=${bill.dueAmount}&cu=INR`}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-900 hover:text-amber-950 underline mt-1.5"
                  >
                    <span>Tap to Pay with UPI App (GPay / PhonePe / Paytm) →</span>
                  </a>
                </div>
              )}
            </div>

            {/* Right: Subtotal, Discount, Tax & Grand Total */}
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Subtotal</span>
                <strong className="text-slate-900 font-mono font-bold">
                  ₹{itemsSubtotal}
                </strong>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-amber-700">
                  <span>Discount</span>
                  <strong className="font-mono font-bold">
                    – ₹{discountAmount}
                  </strong>
                </div>
              )}

              {taxAmount > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>Tax (GST)</span>
                  <strong className="text-slate-900 font-mono font-bold">
                    + ₹{taxAmount}
                  </strong>
                </div>
              )}

              {tipAmount > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>Tip</span>
                  <strong className="text-slate-900 font-mono font-bold">
                    + ₹{tipAmount}
                  </strong>
                </div>
              )}

              {/* Grand Total Banner */}
              <div
                data-ui="invoice-total-banner"
                className="bg-[#0F1A36] text-white rounded-xl px-4 py-3.5 print:py-2 flex items-center justify-between my-2 print:my-1 shadow-sm"
                style={{ backgroundColor: '#0F1A36', color: '#ffffff' }}
              >
                <span className="text-[11px] font-black tracking-widest uppercase">
                  TOTAL AMOUNT
                </span>
                <span
                  data-ui="invoice-total-amount"
                  className="text-xl sm:text-2xl font-black font-mono text-[#D4A515]"
                  style={{ color: '#D4A515' }}
                >
                  ₹{bill.total}
                </span>
              </div>

              {/* Settlement Detail */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Paid Amount</span>
                  <strong className="text-slate-900 font-mono font-bold">
                    ₹{bill.paidAmount}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Balance Due</span>
                  <strong
                    className={`font-mono font-bold ${
                      (bill.dueAmount || 0) > 0 ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    ₹{bill.dueAmount || 0}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. THANK YOU BOX */}
        <div className="px-6 sm:px-8 pb-4 print:pb-2.5 print:px-6">
          <div
            className="p-4 print:p-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-center flex items-center justify-center gap-2"
          >
            <span className="text-base select-none" role="img" aria-label="scissors">✂️</span>
            <p className="text-xs sm:text-sm text-slate-700">
              Thank you for visiting <strong className="text-slate-900">{shopProfile.shopName || 'StyleFleet Salon'}</strong>. We look forward to serving you again!
            </p>
          </div>
        </div>

        {/* 7. BOTTOM ATTRIBUTION */}
        <div className="py-4 print:py-2 text-center border-t border-slate-100 bg-white">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            POWERED BY STYLEFLEET · {shopProfile.shopName || 'SALON'}
          </p>
        </div>

        {/* 8. SCREEN-ONLY BOTTOM TOOLBAR: Download PDF option for both web and mobile */}
        {!(onEdit || onDelete || onClose) ? (
          <div data-ui="invoice-footer" className="no-print p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-center">
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="w-full max-w-sm py-3 px-6 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              title="Download Invoice as PDF"
            >
              {isGeneratingPdf ? (
                <span className="w-4 h-4 border-2 border-[#0B1F44] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-[#0B1F44]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>
          </div>
        ) : shareOptionsOpen ? (
          <div data-ui="invoice-footer" className="no-print p-4 bg-slate-900 border-t border-slate-800">
            <div className="w-full flex items-center justify-between gap-2 animate-fadeIn">
              <div className="flex items-center gap-2">
                {canShareBills && (
                  <button
                    type="button"
                    onClick={handleDefaultWhatsAppShare}
                    className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                    </svg>
                    <span>WhatsApp</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-2 px-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPdf}
                  onClick={handleDownloadPdf}
                  className="py-2 px-3.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                  title="Save or Download Official Invoice as PDF"
                >
                  {isGeneratingPdf ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span>{isGeneratingPdf ? 'Generating...' : 'PDF'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShareOptionsOpen(false)}
                className="py-2 px-4 rounded-xl border border-white/30 text-white font-bold text-xs bg-white/10 hover:bg-white/20 cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div data-ui="invoice-footer" className="no-print p-4 bg-slate-900 border-t border-slate-800">
            <div className="w-full flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShareOptionsOpen(true)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-transform active:scale-95"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Share</span>
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-6 rounded-xl border border-white/30 text-white font-bold text-xs bg-white/10 hover:bg-white/20 cursor-pointer shadow-xs"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
