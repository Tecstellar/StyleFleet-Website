'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSalon, Bill } from '@/components/SalonContext';
import { AnimatedCounter } from '@/components/animated-counter';
import { buildOfficialWhatsAppBillMessage, openWhatsAppBill, matchStaffName, getMostlyUsedServices } from '@/lib/salon-helpers';
import { getSalesMetrics } from '@/lib/financial-metrics';
import { InvoiceTemplate } from '@/components/invoice-template';
import { StylistMultiSelect } from '@/components/stylist-multi-select';

interface SalesAndBillsProps {
  onViewInvoice?: (bill: Bill) => void;
  initialOpenNewBill?: boolean;
  onOpenAddClientModal?: () => void;
  onOpenImportContactsModal?: () => void;
  onOpenMenuCatalogModal?: () => void;
}

type SalesOption = 'today' | 'week' | 'month' | 'custom' | 'deleted';

export function SalesAndBillsView({
  onViewInvoice,
  initialOpenNewBill = false,
  onOpenAddClientModal,
  onOpenImportContactsModal,
  onOpenMenuCatalogModal,
}: SalesAndBillsProps) {
  const {
    role,
    loggedInStaffName,
    hasPermission,
    bills,
    appointments,
    expenses,
    staff,
    services,
    customers,
    deleteBill,
    editBill,
    restoreBill,
    shopProfile,
    setCurrentScreen,
    isDarkMode,
    showToast,
    billCartItems,
    billCustName,
    setBillCustName,
    billCustPhone,
    setBillCustPhone,
    billStaffSelect,
    setBillStaffSelect,
    billDiscount,
    setBillDiscount,
    billPaymentMode,
    setBillPaymentMode,
    partialPaidAmount,
    setPartialPaidAmount,
    addCartItem,
    removeCartItem,
    updateCartItemQty,
    clearCart,
    createBill,
    t,
  } = useSalon();

  const isStylist = role === 'stylist';
  const canShareBills = role === 'owner' || hasPermission('share_bills');

  // Helper date functions using local calendar
  const getTodayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatDateToIso = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getPreviousDateStr = (dateStr: string) => {
    const parts = dateStr.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatDateReadable = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const todayStr = useMemo(() => getTodayDateStr(), []);
  const yesterdayStr = useMemo(() => getPreviousDateStr(todayStr), [todayStr]);

  // Salon registration date from shopProfile (or earliest bill)
  const regDateObj = useMemo(() => {
    if (shopProfile?.createdAt) {
      const parsed = new Date(shopProfile.createdAt);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    let earliest = Infinity;
    bills.forEach((b) => {
      const t = b.isToday ? Date.now() : b.createdAt ? new Date(b.createdAt).getTime() : b.dateStr ? new Date(b.dateStr).getTime() : 0;
      if (t > 0 && t < earliest) earliest = t;
    });
    if (earliest !== Infinity) return new Date(earliest);
    return new Date();
  }, [shopProfile?.createdAt, bills]);

  const regDateStr = useMemo(() => formatDateToIso(regDateObj), [regDateObj]);

  // Primary Option: 'today' | 'custom' | 'deleted'
  const [salesOption, setSalesOption] = useState<SalesOption>('today');
  const [customFilterMode, setCustomFilterMode] = useState<'single' | 'range'>('single');
  const [customDate, setCustomDate] = useState<string>(yesterdayStr);
  const [customStartDate, setCustomStartDate] = useState<string>(yesterdayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  const [showCustomDateModal, setShowCustomDateModal] = useState<boolean>(false);
  const [tempFilterMode, setTempFilterMode] = useState<'single' | 'range'>('single');
  const [tempDateInput, setTempDateInput] = useState<string>(yesterdayStr);
  const [tempStartDate, setTempStartDate] = useState<string>(yesterdayStr);
  const [tempEndDate, setTempEndDate] = useState<string>(todayStr);

  // Peak Hours Time-based Bar Chart State
  const [timeGranularity, setTimeGranularity] = useState<'slots' | 'hourly'>('slots');
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);

  // Normal Invoice Modal (shown when touching any bill)
  const [selectedInvoiceBill, setSelectedInvoiceBill] = useState<Bill | null>(null);
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState<boolean>(false);
  const [shareActionSheetOpen, setShareActionSheetOpen] = useState<boolean>(false);

  // WhatsApp Bill Sent & Revenue Confirmation Modal State
  const [confirmationBill, setConfirmationBill] = useState<Bill | null>(null);
  const [selectedReminderStatus, setSelectedReminderStatus] = useState<'Not Sent' | 'Sent' | 'Pending'>('Sent');
  const [selectedConfirmationStatus, setSelectedConfirmationStatus] = useState<'Pending' | 'Confirmed'>('Confirmed');

  // Edit Bill Modal State
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editStaff, setEditStaff] = useState('');
  const [editMode, setEditMode] = useState<Bill['mode']>('UPI');
  const [editTotal, setEditTotal] = useState<number>(0);
  const [editPaid, setEditPaid] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');

  // Optional: Toggle for Full Financial Reports & P&L (Annual / Monthly)
  const [showFullFinancialReports, setShowFullFinancialReports] = useState(false);

  // Express Billing POS State
  const [showNewBillModal, setShowNewBillModal] = useState<boolean>(Boolean(initialOpenNewBill));
  const [billTip, setBillTip] = useState<number>(0);
  const [newBillDate, setNewBillDate] = useState<string>(todayStr);
  const [serviceSearchQuery, setServiceSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showPlanLimitModal, setShowPlanLimitModal] = useState<boolean>(false);

  React.useEffect(() => {
    if (initialOpenNewBill) {
      setShowNewBillModal(true);
    }
  }, [initialOpenNewBill]);

  React.useEffect(() => {
    if (role === 'stylist' && loggedInStaffName) {
      setBillStaffSelect(loggedInStaffName);
    } else if (role === 'owner') {
      const owner = shopProfile?.ownerName?.trim() || 'Owner';
      setBillStaffSelect((prev) => (!prev || prev === 'Stylist' || prev === 'Staff' ? owner : prev));
    }
  }, [role, loggedInStaffName, shopProfile?.ownerName, setBillStaffSelect]);

  // Cart Calculations for Express Billing POS
  const cartSubtotal = useMemo(() => {
    return billCartItems.reduce((acc, item) => acc + item.price * item.qty, 0);
  }, [billCartItems]);

  const safeDiscount = Math.min(cartSubtotal, Math.max(0, billDiscount || 0));
  const safeTip = Math.max(0, billTip || 0);
  const gstRate = shopProfile?.gstRate || 0;
  const taxAmount = shopProfile?.applyGst ? Math.round((cartSubtotal - safeDiscount) * (gstRate / 100)) : 0;
  const cartTotal = Math.max(0, cartSubtotal - safeDiscount + taxAmount + safeTip);

  let finalPaid = cartTotal;
  let finalDue = 0;
  let billStatus: Bill['status'] = 'paid';

  if (billPaymentMode === 'Partial Pay') {
    finalPaid = Math.min(cartTotal, partialPaidAmount);
    finalDue = Math.max(0, cartTotal - partialPaidAmount);
    billStatus = finalDue > 0 ? 'partially_paid' : 'paid';
  } else if (billPaymentMode === 'Fully Pending') {
    finalPaid = 0;
    finalDue = cartTotal;
    billStatus = 'pending';
  } else {
    finalPaid = cartTotal;
    finalDue = 0;
    billStatus = 'paid';
  }

  // Categories & Filtered Services for Express Billing Catalog
  const serviceCategories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach((s) => {
      if (s.cat) cats.add(s.cat);
    });
    return ['All', ...Array.from(cats)];
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (!s.active) return false;
      const matchesCat = selectedCategory === 'All' || s.cat === selectedCategory;
      const matchesSearch =
        !serviceSearchQuery ||
        s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()) ||
        (s.cat && s.cat.toLowerCase().includes(serviceSearchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [services, selectedCategory, serviceSearchQuery]);

  // Dynamic Mostly Used Services from real bills & appointments
  const mostlyUsedServices = useMemo(() => {
    return getMostlyUsedServices(services, bills, appointments, 6);
  }, [services, bills, appointments]);

  const mostlyUsedIds = useMemo(() => {
    return new Set(mostlyUsedServices.map((s) => s.id));
  }, [mostlyUsedServices]);

  // Recent clients for 1-click quick selection
  const recentClients = useMemo(() => {
    return customers
      .filter((c) => c.status !== 'inactive')
      .map((c) => ({ name: c.name, phone: c.phone }))
      .filter((item, idx, arr) => arr.findIndex((t) => t.phone === item.phone) === idx);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    if (!customers || customers.length === 0) return [];
    const query = billCustName.trim().toLowerCase();
    if (!query) return customers.slice(0, 15);
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.phone && c.phone.includes(query))
    ).slice(0, 15);
  }, [customers, billCustName]);

  const handleDecrementCartItem = (srvName: string) => {
    const idx = billCartItems.findIndex((item) => item.name === srvName);
    if (idx !== -1) {
      updateCartItemQty(idx, billCartItems[idx].qty - 1);
    }
  };

  const handleCompleteBill = () => {
    // 100 Free Bills Limit Check for unsubscribed salons
    const nonDeletedBillsCount = bills.filter((b) => !b.isDeleted).length;
    const isSubscribed = Boolean(
      (shopProfile as any)?.subscription?.status === 'active' ||
      (shopProfile as any)?.subscription?.status === 'pro' ||
      ((shopProfile as any)?.subscription?.plan && (shopProfile as any).subscription.plan.toLowerCase().includes('pro'))
    );
    if (!isSubscribed && nonDeletedBillsCount >= 100) {
      setShowPlanLimitModal(true);
      return;
    }

    if (billCartItems.length === 0) {
      showToast('Please add at least one service to the bill.', 'error');
      return;
    }
    const cust = billCustName.trim() || 'Walk-in Client';
    const phone = billCustPhone.trim();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const selectedD = new Date(newBillDate + 'T12:00:00');
    const day = selectedD.getDate();
    const month = selectedD.toLocaleString('en-US', { month: 'short' });
    const year = selectedD.getFullYear();
    const customDateStr = `${day} ${month} ${year}, ${timeStr}`;
    const isToday = newBillDate === todayStr;

    const newBill = createBill(
      {
        cust,
        phone,
        items: [...billCartItems],
        staff: billStaffSelect || (role === 'stylist' && loggedInStaffName ? loggedInStaffName : (shopProfile?.ownerName || 'Owner')),
        total: cartTotal,
        paidAmount: finalPaid,
        dueAmount: finalDue,
        mode: billPaymentMode,
        status: billStatus,
        discount: safeDiscount,
        tax: taxAmount,
        tip: safeTip,
      },
      customDateStr,
      isToday
    );

    clearCart();
    setBillTip(0);
    setNewBillDate(todayStr);
    setShowNewBillModal(false);
    setSelectedInvoiceBill(newBill);
    showToast(`Bill #${newBill.id} created successfully!`, 'success');
  };

  // Effective Active Bills (scoped for stylist vs owner)
  const effectiveBills = useMemo(() => {
    if (isStylist) {
      const nameLower = (loggedInStaffName || '').toLowerCase();
      return bills.filter(
        (b) =>
          !b.isDeleted &&
          b.isToday &&
          (!nameLower ||
            matchStaffName(b.staff, nameLower) ||
            b.items?.some((i) => matchStaffName(i.staff, nameLower)) ||
            b.notes?.toLowerCase().includes(nameLower))
      );
    }
    return bills.filter((b) => !b.isDeleted);
  }, [bills, isStylist, loggedInStaffName]);

  // Recently Deleted Bills (within last 30 days)
  const recentlyDeletedBills = useMemo(() => {
    const now = new Date().getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return bills.filter((b) => {
      if (!b.isDeleted) return false;
      if (b.deletedAt) {
        const deletedTime = new Date(b.deletedAt).getTime();
        return now - deletedTime <= thirtyDaysMs;
      }
      return true; // Default fallback in 30 days
    });
  }, [bills]);

  // Target Date for Analytics
  const targetDate = useMemo(() => {
    return salesOption === 'custom' ? customDate : todayStr;
  }, [salesOption, customDate, todayStr]);

  const priorDate = useMemo(() => {
    return getPreviousDateStr(targetDate);
  }, [targetDate]);

  // Date range helpers for periods (Today, Week, Month, Custom)
  const dateRanges = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    // Week: Last 7 days
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const priorWeekEnd = new Date(weekStart.getTime() - 1);
    const priorWeekStart = new Date(weekStart);
    priorWeekStart.setDate(priorWeekStart.getDate() - 7);

    // Month: Current Month (1st of this month to today)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const priorMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const priorMonthStart = new Date(priorMonthEnd.getFullYear(), priorMonthEnd.getMonth(), 1, 0, 0, 0, 0);

    // Custom Date or Date Range
    let customDStart: Date;
    let customDEnd: Date;
    let customPriorStart: Date;
    let customPriorEnd: Date;

    if (customFilterMode === 'range') {
      const sParts = customStartDate.split('-');
      const eParts = customEndDate.split('-');
      customDStart = new Date(Number(sParts[0]), Number(sParts[1]) - 1, Number(sParts[2]), 0, 0, 0, 0);
      customDEnd = new Date(Number(eParts[0]), Number(eParts[1]) - 1, Number(eParts[2]), 23, 59, 59, 999);
      const spanMs = Math.max(86400000, customDEnd.getTime() - customDStart.getTime());
      customPriorEnd = new Date(customDStart.getTime() - 1);
      customPriorStart = new Date(customPriorEnd.getTime() - spanMs);
    } else {
      const parts = customDate.split('-');
      customDStart = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
      customDEnd = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
      customPriorStart = new Date(customDStart);
      customPriorStart.setDate(customPriorStart.getDate() - 1);
      customPriorEnd = new Date(customDEnd);
      customPriorEnd.setDate(customPriorEnd.getDate() - 1);
    }

    return {
      today: { target: { start: todayStart, end: todayEnd }, prior: { start: yesterdayStart, end: yesterdayEnd } },
      week: { target: { start: weekStart, end: todayEnd }, prior: { start: priorWeekStart, end: priorWeekEnd } },
      month: { target: { start: monthStart, end: todayEnd }, prior: { start: priorMonthStart, end: priorMonthEnd } },
      custom: { target: { start: customDStart, end: customDEnd }, prior: { start: customPriorStart, end: customPriorEnd } },
    };
  }, [customDate, customFilterMode, customStartDate, customEndDate]);

  const activeRange = useMemo(() => {
    if (salesOption === 'week') return dateRanges.week;
    if (salesOption === 'month') return dateRanges.month;
    if (salesOption === 'custom') return dateRanges.custom;
    return dateRanges.today;
  }, [salesOption, dateRanges]);

  const periodTitle = useMemo(() => {
    switch (salesOption) {
      case 'today': return `Today (${formatDateReadable(todayStr)})`;
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'custom':
        if (customFilterMode === 'range') {
          return `${formatDateReadable(customStartDate)} – ${formatDateReadable(customEndDate)}`;
        }
        return customDate === yesterdayStr ? `Yesterday (${formatDateReadable(yesterdayStr)})` : formatDateReadable(customDate);
      default: return 'Sales Analytics';
    }
  }, [salesOption, todayStr, yesterdayStr, customDate, customFilterMode, customStartDate, customEndDate]);

  const priorPeriodTitle = useMemo(() => {
    switch (salesOption) {
      case 'today': return 'Yesterday';
      case 'week': return 'Last Week';
      case 'month': return 'Last Month';
      case 'custom': return customFilterMode === 'range' ? 'Prior Period' : 'Prior Day';
      default: return 'Prior Period';
    }
  }, [salesOption, customFilterMode]);

  // Check if a bill falls within a date range
  const isBillInDateRange = (b: Bill, start: Date, end: Date) => {
    if (b.isDeleted) return false;
    if (salesOption === 'today' || (salesOption === 'custom' && customFilterMode === 'single')) {
      const targetDStr = salesOption === 'custom' ? customDate : todayStr;
      if (start.getTime() === dateRanges.today.target.start.getTime() && b.isToday) return true;
      if (start.getTime() === dateRanges.today.prior.start.getTime() && b.isYesterday) return true;
      if (b.dateStr && b.dateStr.startsWith(targetDStr)) return true;
      if (b.createdAt && b.createdAt.startsWith(targetDStr)) return true;
    }
    const t = b.isToday ? new Date().getTime() : b.createdAt ? new Date(b.createdAt).getTime() : b.dateStr ? new Date(b.dateStr).getTime() : 0;
    if (!t) return false;
    return t >= start.getTime() && t <= end.getTime();
  };

  // Bills for Target Date & Prior Date
  const targetBills = useMemo(() => {
    return effectiveBills.filter((b) => isBillInDateRange(b, activeRange.target.start, activeRange.target.end));
  }, [effectiveBills, activeRange]);

  const priorBills = useMemo(() => {
    return effectiveBills.filter((b) => isBillInDateRange(b, activeRange.prior.start, activeRange.prior.end));
  }, [effectiveBills, activeRange]);

  // Helper: total bill value for service revenue, excluding debt clearance receipts
  const getBillRevenue = (b: Bill) => {
    if (b.id.startsWith('DUE-CLR-')) return 0;
    return b.total || 0;
  };

  const salesMetrics = useMemo(() => {
    if (salesOption === 'month') return getSalesMetrics('Month', effectiveBills);
    if (salesOption === 'week') return getSalesMetrics('Week', effectiveBills);
    if (salesOption === 'today') return getSalesMetrics('Day', effectiveBills);
    return null;
  }, [salesOption, effectiveBills]);

  // Target Day Analytics Computations (strictly matches mobile app metrics)
  const targetRevenue = useMemo(() => {
    if (salesMetrics) return salesMetrics.today_revenue;
    return targetBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .reduce((acc, b) => acc + getBillRevenue(b), 0);
  }, [salesMetrics, targetBills]);

  const priorRevenue = useMemo(() => {
    if (salesMetrics) return Math.round(salesMetrics.prev_minor / 100);
    return priorBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .reduce((acc, b) => acc + getBillRevenue(b), 0);
  }, [salesMetrics, priorBills]);

  const targetCount = salesMetrics ? salesMetrics.today_invoices_count : targetBills.length;
  const priorCount = priorBills.length;

  const revenueDiff = targetRevenue - priorRevenue;
  const diffPct = priorRevenue > 0
    ? Math.round((revenueDiff / priorRevenue) * 100)
    : targetRevenue > 0
    ? 100
    : 0;

  const avgBillValue = targetCount > 0 ? Math.round(targetRevenue / targetCount) : 0;

  // Payment Breakdown for Target Date (UPI, Cash, Card)
  const paymentBreakdown = useMemo(() => {
    let upi = 0;
    let cash = 0;
    let card = 0;

    targetBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .forEach((b) => {
        const amt = getBillRevenue(b);
        if (b.mode === 'Cash') cash += amt;
        else if (b.mode === 'Card') card += amt;
        else upi += amt; // UPI or default
      });

    const total = upi + cash + card || 1;
    const upiShare = Math.round((upi / total) * 100);
    const cashShare = Math.round((cash / total) * 100);
    const cardShare = Math.round((card / total) * 100);

    return { upi, cash, card, total: upi + cash + card, upiShare, cashShare, cardShare };
  }, [targetBills]);

  // Top Services for Target Date
  const topServices = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    targetBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .forEach((b) => {
        (b.items || []).forEach((it) => {
          if (!map[it.name]) {
            map[it.name] = { name: it.name, qty: 0, revenue: 0 };
          }
          map[it.name].qty += it.qty || 1;
          map[it.name].revenue += (it.price || 0) * (it.qty || 1);
        });
      });

    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [targetBills]);

  // Helper to extract bill hour (0-23)
  const getBillHour = (bill: Bill, fallbackIdx: number): number => {
    if (bill.createdAt) {
      const d = new Date(bill.createdAt);
      if (!isNaN(d.getTime())) return d.getHours();
    }
    if (bill.dateStr) {
      const m12 = bill.dateStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (m12) {
        let h = parseInt(m12[1], 10);
        const isPm = m12[3].toUpperCase() === 'PM';
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return h;
      }
      const m24 = bill.dateStr.match(/(\d{1,2}):(\d{2})/);
      if (m24) {
        const h = parseInt(m24[1], 10);
        if (h >= 0 && h <= 23) return h;
      }
    }
    const defaultHours = [10, 11, 12, 14, 15, 17, 18, 19, 20];
    const code = (bill.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), fallbackIdx);
    return defaultHours[code % defaultHours.length];
  };

  // Time-Based Bar Chart Data Calculation
  const timeChartData = useMemo(() => {
    if (salesOption === 'week') {
      const days = [
        { key: 'Mon', label: 'Mon', dayIdx: 1 },
        { key: 'Tue', label: 'Tue', dayIdx: 2 },
        { key: 'Wed', label: 'Wed', dayIdx: 3 },
        { key: 'Thu', label: 'Thu', dayIdx: 4 },
        { key: 'Fri', label: 'Fri', dayIdx: 5 },
        { key: 'Sat', label: 'Sat', dayIdx: 6 },
        { key: 'Sun', label: 'Sun', dayIdx: 0 },
      ];

      return days.map((d) => {
        const matchTarget = targetBills.filter((b) => {
          const date = b.createdAt ? new Date(b.createdAt) : b.dateStr ? new Date(b.dateStr) : null;
          return date && date.getDay() === d.dayIdx;
        });
        const matchPrior = priorBills.filter((b) => {
          const date = b.createdAt ? new Date(b.createdAt) : b.dateStr ? new Date(b.dateStr) : null;
          return date && date.getDay() === d.dayIdx;
        });
        const targetRev = matchTarget.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        const priorRev = matchPrior.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        return {
          key: d.key,
          label: d.label,
          targetRevenue: targetRev,
          targetCount: matchTarget.length,
          priorRevenue: priorRev,
          priorCount: matchPrior.length,
        };
      });
    }

    if (timeGranularity === 'slots') {
      const slots = [
        { key: 's1', label: '9 - 11 AM', minH: 0, maxH: 11 },
        { key: 's2', label: '11 - 1 PM', minH: 11, maxH: 13 },
        { key: 's3', label: '1 - 3 PM', minH: 13, maxH: 15 },
        { key: 's4', label: '3 - 5 PM', minH: 15, maxH: 17 },
        { key: 's5', label: '5 - 7 PM', minH: 17, maxH: 19 },
        { key: 's6', label: '7 - 9 PM', minH: 19, maxH: 21 },
        { key: 's7', label: '9 PM+', minH: 21, maxH: 24 },
      ];

      return slots.map((s) => {
        const matchTarget = targetBills.filter((b, idx) => {
          const h = getBillHour(b, idx);
          return h >= s.minH && h < s.maxH;
        });
        const matchPrior = priorBills.filter((b, idx) => {
          const h = getBillHour(b, idx);
          return h >= s.minH && h < s.maxH;
        });
        const targetRev = matchTarget.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        const priorRev = matchPrior.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        return {
          key: s.key,
          label: s.label,
          targetRevenue: targetRev,
          targetCount: matchTarget.length,
          priorRevenue: priorRev,
          priorCount: matchPrior.length,
        };
      });
    } else {
      const hours = [
        { key: 'h9', label: '9 AM', h: 9 },
        { key: 'h10', label: '10 AM', h: 10 },
        { key: 'h11', label: '11 AM', h: 11 },
        { key: 'h12', label: '12 PM', h: 12 },
        { key: 'h13', label: '1 PM', h: 13 },
        { key: 'h14', label: '2 PM', h: 14 },
        { key: 'h15', label: '3 PM', h: 15 },
        { key: 'h16', label: '4 PM', h: 16 },
        { key: 'h17', label: '5 PM', h: 17 },
        { key: 'h18', label: '6 PM', h: 18 },
        { key: 'h19', label: '7 PM', h: 19 },
        { key: 'h20', label: '8 PM', h: 20 },
        { key: 'h21', label: '9 PM+', h: 21 },
      ];

      return hours.map((item) => {
        const matchTarget = targetBills.filter((b, idx) => {
          const bh = getBillHour(b, idx);
          return item.h === 21 ? bh >= 21 : bh === item.h;
        });
        const matchPrior = priorBills.filter((b, idx) => {
          const bh = getBillHour(b, idx);
          return item.h === 21 ? bh >= 21 : bh === item.h;
        });
        const targetRev = matchTarget.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        const priorRev = matchPrior.filter((b) => b.confirmationStatus !== 'Pending').reduce((acc, b) => acc + getBillRevenue(b), 0);
        return {
          key: item.key,
          label: item.label,
          targetRevenue: targetRev,
          targetCount: matchTarget.length,
          priorRevenue: priorRev,
          priorCount: matchPrior.length,
        };
      });
    }
  }, [salesOption, timeGranularity, targetBills, priorBills]);

  // Peak Time Slot & Chart Scaling
  const peakSlot = useMemo(() => {
    let best = timeChartData[0];
    timeChartData.forEach((s) => {
      if (s.targetRevenue > (best?.targetRevenue || 0)) {
        best = s;
      }
    });
    return best && best.targetRevenue > 0 ? best : null;
  }, [timeChartData]);

  const maxSlotRev = useMemo(() => {
    return Math.max(...timeChartData.map((d) => d.targetRevenue), 1);
  }, [timeChartData]);

  // Comparative Bar Chart Max
  const chartMaxRevenue = Math.max(targetRevenue, priorRevenue, 1);
  const targetBarHeight = Math.max(14, Math.round((targetRevenue / chartMaxRevenue) * 100));
  const priorBarHeight = Math.max(14, Math.round((priorRevenue / chartMaxRevenue) * 100));

  // Edit Bill Handlers
  const handleOpenEdit = (bill: Bill) => {
    setEditingBill(bill);
    setEditCustName(bill.cust);
    setEditCustPhone(bill.phone);
    setEditStaff(bill.staff);
    setEditMode(bill.mode);
    setEditTotal(bill.total);
    setEditPaid(bill.paidAmount);
    setEditNotes(bill.notes || '');
    setInvoiceMenuOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;

    const totalNum = Number(editTotal) || 0;
    const paidNum = Number(editPaid) || 0;
    const dueNum = Math.max(0, totalNum - paidNum);
    const status: Bill['status'] = dueNum === 0 ? 'paid' : paidNum > 0 ? 'partially_paid' : 'pending';

    const updatedData: Partial<Bill> = {
      cust: editCustName.trim() || 'Walk-in Client',
      phone: editCustPhone.trim(),
      staff: editStaff,
      mode: editMode,
      total: totalNum,
      paidAmount: paidNum,
      dueAmount: dueNum,
      status,
      notes: editNotes.trim(),
    };

    editBill(editingBill.id, updatedData);

    if (selectedInvoiceBill && selectedInvoiceBill.id === editingBill.id) {
      setSelectedInvoiceBill({ ...selectedInvoiceBill, ...updatedData });
    }

    setEditingBill(null);
  };

  // Delete Bill Handlers (30-day soft delete)
  const handleDeleteBill = (bill: Bill) => {
    if (confirm(`Move Bill #${bill.id} to Recently Deleted? It will be safely retained for 30 days.`)) {
      deleteBill(bill.id);
      if (selectedInvoiceBill?.id === bill.id) {
        setSelectedInvoiceBill(null);
      }
      setInvoiceMenuOpen(false);
    }
  };

  // Share Bill Handler (WhatsApp)
  const handleShareInvoice = (bill: Bill) => {
    const msg = buildOfficialWhatsAppBillMessage({
      customerName: bill.cust,
      shopName: shopProfile.shopName || 'StyleFleet Salon',
      invoiceNumber: bill.id,
      billId: bill.id,
      pdfUrl: (bill as any).pdfUrl || (bill as any).pdf_url,
      totalAmount: bill.total,
      paidAmount: bill.paidAmount,
      dueAmount: bill.dueAmount,
      paymentMethod: bill.mode,
      shopPhone: shopProfile.phone || '9876543210',
      upiId: shopProfile.upiId,
    });
    openWhatsAppBill(bill.phone, msg);
    showToast(`Opening WhatsApp for #${bill.id}...`);

    // Close invoice box & open WhatsApp confirmation popup
    setSelectedInvoiceBill(null);
    setShareActionSheetOpen(false);
    setSelectedReminderStatus(bill.reminderStatus || 'Sent');
    setSelectedConfirmationStatus(bill.confirmationStatus || 'Confirmed');
    setConfirmationBill(bill);
  };

  // WhatsApp Confirmation Modal: Done Action
  const handleDoneConfirmation = () => {
    if (!confirmationBill) return;
    editBill(confirmationBill.id, {
      reminderStatus: selectedReminderStatus,
      confirmationStatus: selectedConfirmationStatus,
    });
    if (selectedConfirmationStatus === 'Confirmed') {
      showToast(`Bill #${confirmationBill.id} confirmed & recorded into revenue!`, 'success');
    } else {
      showToast(`Bill #${confirmationBill.id} saved as Pending.`);
    }
    setConfirmationBill(null);
  };

  // WhatsApp Confirmation Modal: Next Bill Action
  const handleNextBillConfirmation = () => {
    if (!confirmationBill) return;
    editBill(confirmationBill.id, {
      reminderStatus: selectedReminderStatus,
      confirmationStatus: selectedConfirmationStatus,
    });
    setConfirmationBill(null);
    // Reset and open new bill modal
    clearCart();
    setBillCustName('');
    setBillCustPhone('');
    setBillTip(0);
    setBillDiscount(0);
    setNewBillDate(todayStr);
    setShowNewBillModal(true);
    showToast('Ready for Next Bill!', 'success');
  };

  return (
    <section className="space-y-6 animate-fadeIn pb-16">
      {/* ================= 1. HEADER & LARGEST BEAUTIFUL NEW BILL BUTTON ================= */}
      <div
        className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                {t.salesRevenue || 'Sales & Revenue Analytics'}
              </h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                Live Audit
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Comparative daily performance, payment channels, and invoice records
            </p>
          </div>
        </div>

        {/* LUXURY PREMIUM NEW BILL BUTTON */}
        <button
          type="button"
          onClick={() => setShowNewBillModal(true)}
          className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F5A623] to-[#D4AF37] hover:brightness-110 text-[#07152B] font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-[#D4AF37]/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <svg className="w-5 h-5 text-[#07152B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
            <path d="M8 15h5" />
          </svg>
          <span>{t.createBill || 'New Bill'}</span>
        </button>
      </div>

      {/* ================= 2. PERIOD CONTROLS (OWNER SLIDER: TODAY/WEEK/MONTH vs STYLIST: TODAY/CUSTOM) ================= */}
      <div
        className={`p-2 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
          isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* OWNER SLIDER: TODAY, WEEK, MONTH */}
          {!isStylist ? (
            <div className={`p-1 rounded-xl flex items-center gap-1 border ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => setSalesOption('today')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 ${
                  salesOption === 'today'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{t.today || 'Today'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSalesOption('week')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 ${
                  salesOption === 'week'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{t.week || 'Week'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSalesOption('month')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 ${
                  salesOption === 'month'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{t.month || 'Month'}</span>
              </button>
            </div>
          ) : (
            /* STYLIST TOGGLE: ONLY TODAY AND CUSTOM */
            <button
              type="button"
              onClick={() => setSalesOption('today')}
              className={`px-5 py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-2 ${
                salesOption === 'today'
                  ? 'bg-[#D4AF37] text-[#0B1F44]'
                  : isDarkMode
                  ? 'text-[#A7B0C3] hover:text-white hover:bg-white/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <span>Today</span>
            </button>
          )}

          {/* CUSTOM OPTION (FOR BOTH OWNER AND STYLIST) */}
          <button
            type="button"
            onClick={() => {
              setTempFilterMode(customFilterMode);
              setTempDateInput(customDate);
              setTempStartDate(customStartDate);
              setTempEndDate(customEndDate);
              setShowCustomDateModal(true);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-2 ${
              salesOption === 'custom'
                ? 'bg-[#D4AF37] text-[#0B1F44]'
                : isDarkMode
                ? 'text-[#A7B0C3] hover:text-white hover:bg-white/5'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              {salesOption === 'custom'
                ? customFilterMode === 'range'
                  ? `Custom (${formatDateReadable(customStartDate)} – ${formatDateReadable(customEndDate)})`
                  : `Custom (${customDate === yesterdayStr ? 'Yesterday' : formatDateReadable(customDate)})`
                : 'Custom'}
            </span>
          </button>
        </div>

        {/* RECENTLY DELETED (30 DAYS) BUTTON - FOR OWNER ONLY */}
        {!isStylist && (
          <button
            type="button"
            onClick={() => setSalesOption(salesOption === 'deleted' ? 'today' : 'deleted')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              salesOption === 'deleted'
                ? 'bg-rose-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
            }`}
            title="Invoices retained for 30 days before permanent deletion"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Recently Deleted</span>
            {recentlyDeletedBills.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                {recentlyDeletedBills.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ================= 3. ACTIVE ANALYTICS VIEW ================= */}
      {salesOption !== 'deleted' ? (
        <div className="space-y-6">
          {/* Active Period Indicator */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Viewing Analytics for:{' '}
                <strong className="text-[#D4AF37]">
                  {periodTitle}
                </strong>
              </span>
              {salesOption === 'custom' && (
                <button
                  type="button"
                  onClick={() => {
                    setTempFilterMode(customFilterMode);
                    setTempDateInput(customDate);
                    setTempStartDate(customStartDate);
                    setTempEndDate(customEndDate);
                    setShowCustomDateModal(true);
                  }}
                  className="text-[11px] text-blue-400 hover:underline font-bold cursor-pointer"
                >
                  Change Date
                </button>
              )}
            </div>
            <span className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
              Compared with: {priorPeriodTitle}
            </span>
          </div>

          {/* KPI RUPEE CARD & COMPARATIVE BAR CHART CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* KPI CARD: THE RUPEE */}
            <div
              className={`lg:col-span-5 p-6 rounded-3xl border flex flex-col justify-between ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#D4AF37] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                    <span>Total Sales Revenue</span>
                  </span>
                  <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {targetCount} {targetCount === 1 ? 'bill' : 'bills'}
                  </span>
                </div>

                {/* Big Rupee Value */}
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-[#D4AF37]">₹</span>
                  <strong className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <AnimatedCounter value={targetRevenue} />
                  </strong>
                </div>

                {/* Comparative Variance Badge vs Prior Day */}
                <div className="mt-3 flex items-center gap-2">
                  <div
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${
                      revenueDiff >= 0
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    <span>{revenueDiff >= 0 ? '▲ +' : '▼ -'}₹{Math.abs(revenueDiff).toLocaleString('en-IN')}</span>
                    <span>({revenueDiff >= 0 ? `+${diffPct}%` : `${diffPct}%`})</span>
                  </div>
                  <span className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    vs {priorPeriodTitle.toLowerCase()}
                  </span>
                </div>
              </div>

              {/* Sub-Metrics: Average Bill & Collection Summary */}
              <div className="grid grid-cols-2 gap-3 pt-5 mt-5 border-t border-white/5">
                <div>
                  <span className={`text-[10px] font-bold block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    Average Bill Value
                  </span>
                  <strong className={`text-base font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    ₹{avgBillValue.toLocaleString('en-IN')}
                  </strong>
                </div>
                <div>
                  <span className={`text-[10px] font-bold block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    {priorPeriodTitle} Sales
                  </span>
                  <strong className={`text-base font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    ₹{priorRevenue.toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>
            </div>

            {/* PEAK HOURS TIME-BASED BAR CHART */}
            <div
              className={`lg:col-span-7 p-6 rounded-3xl border flex flex-col justify-between ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-2.5">
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Peak Hours
                  </h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    {salesOption === 'week' ? 'Day-wise weekly revenue progression' : 'Today\'s time-based revenue distribution & rush intervals'}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                  {/* Granularity Switch (Slots vs Hourly) for single-day */}
                  {salesOption !== 'week' && (
                    <div
                      className={`p-0.5 rounded-xl border flex items-center text-[10px] font-bold ${
                        isDarkMode ? 'bg-[#0E1528] border-white/10' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setTimeGranularity('slots')}
                        className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                          timeGranularity === 'slots'
                            ? 'bg-[#D4AF37] text-[#0B1F44] font-black'
                            : isDarkMode
                            ? 'text-slate-400 hover:text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2-Hr Slots
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeGranularity('hourly')}
                        className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                          timeGranularity === 'hourly'
                            ? 'bg-[#D4AF37] text-[#0B1F44] font-black'
                            : isDarkMode
                            ? 'text-slate-400 hover:text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Hourly
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Chart Legend & Peak Highlight */}
              <div className="flex items-center justify-between text-[11px] pt-2">
                <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37]" />
                  <span>{salesOption === 'today' ? "Today's Time Slots" : `${periodTitle} Slots`}</span>
                </div>

                {peakSlot && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37]">
                    Peak Slot: {peakSlot.label}
                  </span>
                )}
              </div>

              {/* Time-Based Vertical Bars Area (Today Only) */}
              <div className="flex items-end gap-1.5 sm:gap-2.5 pt-6 pb-2 h-52 overflow-x-auto">
                {timeChartData.map((slot) => {
                  const targetHeight = maxSlotRev > 0
                    ? Math.max(slot.targetRevenue > 0 ? 12 : 4, Math.round((slot.targetRevenue / maxSlotRev) * 100))
                    : 4;
                  const isPeak = peakSlot && peakSlot.key === slot.key;
                  const isHovered = hoveredSlotKey === slot.key;

                  return (
                    <div
                      key={slot.key}
                      onMouseEnter={() => setHoveredSlotKey(slot.key)}
                      onMouseLeave={() => setHoveredSlotKey(null)}
                      className="flex-1 min-w-[38px] flex flex-col items-center h-full justify-end group relative cursor-pointer"
                    >
                      {/* Floating Tooltip Bubble */}
                      {isHovered && (
                        <div
                          className={`absolute -top-12 z-20 px-2.5 py-1 rounded-xl border shadow-xl text-[10px] whitespace-nowrap pointer-events-none animate-fadeIn ${
                            isDarkMode ? 'bg-[#0B1528] border-[#2A3858] text-white' : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        >
                          <div className="font-bold text-[#D4AF37]">
                            {slot.label}: ₹{slot.targetRevenue.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[9px] text-slate-300">
                            {slot.targetCount} {slot.targetCount === 1 ? 'bill' : 'bills'}
                          </div>
                        </div>
                      )}

                      {/* Revenue Label Above Bar */}
                      <span
                        className={`text-[9px] sm:text-[10px] font-bold mb-1.5 transition-colors truncate max-w-full ${
                          isPeak
                            ? 'text-[#D4AF37] font-black'
                            : isDarkMode
                            ? 'text-slate-400 group-hover:text-white'
                            : 'text-slate-600 group-hover:text-slate-900'
                        }`}
                      >
                        {slot.targetRevenue >= 1000
                          ? `₹${(slot.targetRevenue / 1000).toFixed(1)}k`
                          : slot.targetRevenue > 0
                          ? `₹${slot.targetRevenue}`
                          : '₹0'}
                      </span>

                      {/* Single Elegant Target Bar (Today) */}
                      <div
                        className={`w-full max-w-[42px] h-32 rounded-xl flex items-end p-0.5 border ${
                          isPeak
                            ? isDarkMode
                              ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50'
                              : 'bg-amber-50 border-amber-300'
                            : isDarkMode
                            ? 'bg-[#0E1528] border-white/5 group-hover:border-white/20'
                            : 'bg-slate-50 border-slate-200 group-hover:border-slate-300'
                        }`}
                      >
                        <div
                          style={{ height: `${targetHeight}%` }}
                          className={`w-full rounded-t-lg transition-transform ${
                            isPeak ? 'bg-[#D4AF37] hover:bg-[#C59F2E]' : 'bg-[#D4AF37]/85 hover:bg-[#D4AF37]'
                          }`}
                          title={`${salesOption === 'today' ? 'Today' : periodTitle} - ${slot.label}: ₹${slot.targetRevenue} (${slot.targetCount} bills)`}
                        />
                      </div>

                      {/* Time Slot Label Under Bar */}
                      <span
                        className={`text-[10px] mt-2 font-bold tracking-tight text-center ${
                          isPeak
                            ? 'text-[#D4AF37] font-black'
                            : isDarkMode
                            ? 'text-slate-300'
                            : 'text-slate-700'
                        }`}
                      >
                        {slot.label}
                      </span>

                      {/* Bill Count Sub-Label */}
                      <span className={`text-[9px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                        {slot.targetCount}b
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Insight Strip */}
              <div
                className={`pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-2 ${
                  isDarkMode ? 'border-white/5' : 'border-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Operating Window:
                  </span>
                  <strong className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    9:00 AM - 9:30 PM
                  </strong>
                </div>

                {peakSlot && (
                  <span className={`text-[10px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    Busiest rush recorded at <strong>{peakSlot.label}</strong> (₹{peakSlot.targetRevenue.toLocaleString('en-IN')} · {peakSlot.targetCount} bills)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ================= 4. PAYMENT BREAKDOWN (UPI, CASH, CARD) & TOP SERVICES ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* PAYMENT CHANNELS: UPI, CASH, CARD */}
            <div
              className={`lg:col-span-6 p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <h3 className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Collected Via Channels
                </h3>
                <p className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                  Payment modes reconciled for {periodTitle}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* UPI */}
                <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-bold text-sky-400 block">UPI Pay</span>
                  <strong className={`text-base font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    ₹{paymentBreakdown.upi.toLocaleString('en-IN')}
                  </strong>
                  <span className="text-[10px] font-semibold text-sky-400/80 block mt-0.5">
                    {paymentBreakdown.upiShare}% share
                  </span>
                </div>

                {/* CASH */}
                <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-bold text-emerald-400 block">Cash</span>
                  <strong className={`text-base font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    ₹{paymentBreakdown.cash.toLocaleString('en-IN')}
                  </strong>
                  <span className="text-[10px] font-semibold text-emerald-400/80 block mt-0.5">
                    {paymentBreakdown.cashShare}% share
                  </span>
                </div>

                {/* CARD */}
                <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-bold text-amber-400 block">Card</span>
                  <strong className={`text-base font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    ₹{paymentBreakdown.card.toLocaleString('en-IN')}
                  </strong>
                  <span className="text-[10px] font-semibold text-amber-400/80 block mt-0.5">
                    {paymentBreakdown.cardShare}% share
                  </span>
                </div>
              </div>
            </div>

            {/* TOP SERVICES */}
            <div
              className={`lg:col-span-6 p-6 rounded-3xl border space-y-3 ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Top Services Sold
                  </h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    Best-performing services on this day
                  </p>
                </div>
                <span className="text-xs font-bold text-[#D4AF37]">
                  {topServices.length} items
                </span>
              </div>

              {topServices.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#737D92]">
                  No services logged for this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {topServices.map((srv, idx) => (
                    <div
                      key={srv.name}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                        isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] font-black text-[10px] flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <strong className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {srv.name}
                        </strong>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          ×{srv.qty}
                        </span>
                        <strong className="text-emerald-400 font-bold">
                          ₹{srv.revenue.toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ================= 5. INVOICES / BILLS LIST FOR THAT DAY ================= */}
          <div
            className={`p-6 rounded-3xl border space-y-4 ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {salesOption === 'today' ? "Today's Bills" : `${periodTitle} Bills`}
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                  Touch any bill below to view full invoice, share, edit, or delete
                </p>
              </div>
              <span className="text-xs font-black px-3 py-1 rounded-xl bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                {targetBills.length} Invoices
              </span>
            </div>

            {targetBills.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-xs text-[#737D92]">
                  No bills generated yet for {periodTitle.toLowerCase()}.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewBillModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#0B1F44] font-black text-xs cursor-pointer hover:bg-[#C59F2E]"
                >
                  Create First Bill
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {targetBills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => {
                      setSelectedInvoiceBill(bill);
                      setInvoiceMenuOpen(false);
                    }}
                    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isDarkMode
                        ? 'bg-[#0F1C36] border-[#2A3858] hover:border-[#D4AF37]/50'
                        : 'bg-slate-50 border-slate-200 hover:border-[#D4AF37]/60'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {bill.cust}
                        </strong>
                        <span className="text-[10px] font-bold text-[#D4AF37] px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/30">
                          #{bill.id}
                        </span>
                        <span className="text-[10px] font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded-md border border-sky-400/30">
                          {bill.mode}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            bill.status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {bill.status}
                        </span>
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                        Stylist: <span className="font-semibold">{bill.staff}</span> · Phone: +91 {bill.phone}
                      </p>
                      {bill.items && bill.items.length > 0 && (
                        <p className={`text-[11px] truncate max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Services: {bill.items.map((i) => `${i.name} (${i.qty})`).join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                      <div className="text-right">
                        <strong className="text-base text-emerald-400 font-black block">
                          ₹{bill.paidAmount || bill.total}
                        </strong>
                        {bill.dueAmount > 0 && (
                          <span className="text-[10px] text-rose-400 font-bold block">
                            Due: ₹{bill.dueAmount}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#D4AF37] font-bold flex items-center gap-1">
                        <span>View</span>
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= RECENTLY DELETED BIN (30 DAYS RETENTION) ================= */
        <div
          className={`p-6 rounded-3xl border space-y-4 ${
            isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <h3 className={`text-base font-extrabold text-rose-400 flex items-center gap-2`}>
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Recently Deleted Invoices (30 Days Retention)</span>
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                Deleted bills remain stored in this bin for 30 days and can be restored at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSalesOption('today')}
              className="text-xs text-[#D4AF37] font-bold hover:underline cursor-pointer"
            >
              ← Back to Sales
            </button>
          </div>

          {recentlyDeletedBills.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#737D92]">
              No deleted bills found in the 30-day retention bin.
            </div>
          ) : (
            <div className="space-y-3">
              {recentlyDeletedBills.map((b) => (
                <div
                  key={b.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isDarkMode ? 'bg-[#0F1C36] border-rose-500/20' : 'bg-rose-50/40 border-rose-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {b.cust}
                      </strong>
                      <span className="text-[10px] font-bold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-md">
                        #{b.id}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Total: ₹{b.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                        Deleted by: {b.deletedBy || b.staff || 'Stylist'}
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        on {b.deletedAt ? formatDateReadable(b.deletedAt.split('T')[0]) : 'Recently'} · 30-day recovery bin
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => restoreBill(b.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Restore Bill</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 6. CUSTOM DATE PICKER POP-UP MODAL ================= */}
      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-md w-full space-y-4 shadow-2xl animate-scaleUp ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Custom Date Filter
                  </h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                    Choose a single day or filter by date range
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomDateModal(false)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200 shadow-xs'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mode Switcher: Single Date vs Date Range */}
            <div className={`grid grid-cols-2 p-1 rounded-2xl border ${isDarkMode ? 'bg-black/20 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setTempFilterMode('single')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  tempFilterMode === 'single'
                    ? 'bg-[#D4AF37] text-[#0B1F44] shadow-md'
                    : isDarkMode
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Single Date</span>
              </button>
              <button
                type="button"
                onClick={() => setTempFilterMode('range')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  tempFilterMode === 'range'
                    ? 'bg-[#D4AF37] text-[#0B1F44] shadow-md'
                    : isDarkMode
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>Date Range (From – To)</span>
              </button>
            </div>

            {/* Mode Specific Columns */}
            {tempFilterMode === 'single' ? (
              <div className="space-y-3">
                {/* Quick Chips: Today or Yesterday */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSalesOption('today');
                      setShowCustomDateModal(false);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      salesOption === 'today'
                        ? 'bg-[#D4AF37] text-[#0B1F44] border-[#D4AF37]'
                        : isDarkMode
                        ? 'bg-[#121B33] border-[#2A3858] text-slate-300 hover:text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    Today ({formatDateReadable(todayStr)})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTempDateInput(yesterdayStr);
                      setCustomDate(yesterdayStr);
                      setCustomFilterMode('single');
                      setSalesOption('custom');
                      setShowCustomDateModal(false);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      salesOption === 'custom' && customFilterMode === 'single' && customDate === yesterdayStr
                        ? 'bg-[#D4AF37] text-[#0B1F44] border-[#D4AF37]'
                        : isDarkMode
                        ? 'bg-[#121B33] border-[#2A3858] text-slate-300 hover:text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    Yesterday ({formatDateReadable(yesterdayStr)})
                  </button>
                </div>

                {/* Single Date Input Column */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-[11px] font-bold text-[#A7B0C3]">
                    Choose Single Date:
                  </label>
                  <input
                    type="date"
                    min={regDateStr}
                    max={todayStr}
                    value={tempDateInput}
                    onChange={(e) => setTempDateInput(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Available from registered date ({formatDateReadable(regDateStr)}) up to today.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Quick Range Presets */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 6);
                      const s = formatDateToIso(d);
                      setTempStartDate(s < regDateStr ? regDateStr : s);
                      setTempEndDate(todayStr);
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer text-center ${
                      isDarkMode
                        ? 'border-white/10 text-slate-300 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#D4AF37] hover:text-[#B8863B]'
                    }`}
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 13);
                      const s = formatDateToIso(d);
                      setTempStartDate(s < regDateStr ? regDateStr : s);
                      setTempEndDate(todayStr);
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer text-center ${
                      isDarkMode
                        ? 'border-white/10 text-slate-300 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#D4AF37] hover:text-[#B8863B]'
                    }`}
                  >
                    Last 14 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 29);
                      const s = formatDateToIso(d);
                      setTempStartDate(s < regDateStr ? regDateStr : s);
                      setTempEndDate(todayStr);
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer text-center ${
                      isDarkMode
                        ? 'border-white/10 text-slate-300 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#D4AF37] hover:text-[#B8863B]'
                    }`}
                  >
                    Last 30 Days
                  </button>
                </div>

                {/* Two Columns: From Date & To Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-700'}`}>
                      From Date:
                    </label>
                    <input
                      type="date"
                      min={regDateStr}
                      max={tempEndDate || todayStr}
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none ${
                        isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-700'}`}>
                      To Date:
                    </label>
                    <input
                      type="date"
                      min={tempStartDate || regDateStr}
                      max={todayStr}
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none ${
                        isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Range Preview Helper */}
                <div className={`p-2.5 rounded-xl border text-center text-xs font-semibold ${
                  isDarkMode ? 'bg-[#121B33]/60 border-white/5 text-[#D4AF37]' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  Selected Range: {formatDateReadable(tempStartDate)} → {formatDateReadable(tempEndDate)}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className={`flex gap-2 pt-2 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => {
                  if (tempFilterMode === 'single') {
                    if (tempDateInput) {
                      setCustomFilterMode('single');
                      setCustomDate(tempDateInput);
                      setSalesOption('custom');
                      setShowCustomDateModal(false);
                    }
                  } else {
                    if (tempStartDate && tempEndDate) {
                      setCustomFilterMode('range');
                      setCustomStartDate(tempStartDate);
                      setCustomEndDate(tempEndDate);
                      setSalesOption('custom');
                      setShowCustomDateModal(false);
                    }
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs cursor-pointer shadow-md transition-transform active:scale-95"
              >
                {tempFilterMode === 'single' ? 'View Day Analytics' : 'Apply Range Filter'}
              </button>
              <button
                type="button"
                onClick={() => setShowCustomDateModal(false)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 7. OFFICIAL LUXURY INVOICE MODAL ================= */}
      {selectedInvoiceBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-3xl my-auto">
            <InvoiceTemplate
              bill={selectedInvoiceBill}
              shopProfile={shopProfile}
              onClose={() => {
                setSelectedInvoiceBill(null);
                setInvoiceMenuOpen(false);
                setShareActionSheetOpen(false);
              }}
              onShareWhatsApp={() => handleShareInvoice(selectedInvoiceBill)}
              onEdit={() => {
                const b = selectedInvoiceBill;
                setSelectedInvoiceBill(null);
                handleOpenEdit(b);
              }}
              onDelete={() => {
                const b = selectedInvoiceBill;
                setSelectedInvoiceBill(null);
                handleDeleteBill(b);
              }}
            />
          </div>
        </div>
      )}

      {/* ================= 8. WHATSAPP BILL SENT & REVENUE CONFIRMATION MODAL ================= */}
      {confirmationBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-md w-full space-y-4 shadow-2xl animate-scaleUp ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            {/* Header: Bill Sent & Customer Details */}
            <div className={`flex items-center gap-3 pb-3 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 fill-emerald-400" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Bill Sent
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30">
                    Delivered
                  </span>
                </div>
                <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                  Invoice #{confirmationBill.id} · ₹{confirmationBill.total} delivered to {confirmationBill.cust}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmationBill(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Reminder Set Status Options (Not Sent | Sent | Pending) */}
            <div className="space-y-1.5">
              <label className={`block text-[11px] font-bold tracking-wide uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Reminder Set Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Not Sent', 'Sent', 'Pending'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedReminderStatus(st)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                      selectedReminderStatus === st
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : isDarkMode
                        ? 'bg-[#121B33] border-[#2A3858] text-slate-300 hover:text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {selectedReminderStatus === st && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>{st}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Confirmation Status Options (Pending | Confirmed) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`block text-[11px] font-bold tracking-wide uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Confirmation Status
                </label>
                <span className="text-[10px] text-[#D4AF37] font-semibold">
                  {selectedConfirmationStatus === 'Confirmed' ? '✓ Added into Revenue' : '⏳ Revenue Pending'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['Pending', 'Confirmed'] as const).map((cs) => (
                  <button
                    key={cs}
                    type="button"
                    onClick={() => setSelectedConfirmationStatus(cs)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                      selectedConfirmationStatus === cs
                        ? cs === 'Confirmed'
                          ? 'bg-[#D4AF37] text-[#0B1F44] border-[#D4AF37] shadow-md font-black'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-black'
                        : isDarkMode
                        ? 'bg-[#121B33] border-[#2A3858] text-slate-300 hover:text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {selectedConfirmationStatus === cs && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>{cs}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Luxury WhatsApp Message Preview */}
            <div className="space-y-1.5 pt-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                WhatsApp Preview
              </span>
              <div
                className={`p-3.5 rounded-2xl border relative overflow-hidden ${
                  isDarkMode ? 'bg-[#0E1B33] border-[#2A3858]' : 'bg-[#EBF7F0] border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/15 text-xs">
                  <span className="font-extrabold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {shopProfile.shopName || "Priya's Salon"}
                  </span>
                  <span className="text-[10px] text-slate-400">Just now</span>
                </div>
                <div className={`space-y-1 text-xs leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  <p className="font-extrabold">Thanks, {confirmationBill.cust || 'Joe'}!</p>
                  <p className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                    <span>📎</span> Invoice Attached · #{confirmationBill.id}
                  </p>
                  <p className="font-semibold text-emerald-400">
                    Paid by {confirmationBill.mode || 'Cash'} · ₹{confirmationBill.paidAmount || confirmationBill.total}
                  </p>
                  <p className="text-[#D4AF37] font-bold text-[11px] pt-0.5">
                    ✨ See you in 4 weeks!
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Actions: Next Bill and Done */}
            <div className="flex gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleNextBillConfirmation}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  isDarkMode
                    ? 'bg-[#121B33] border-[#2A3858] text-white hover:bg-[#1C2B4C]'
                    : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
                }`}
              >
                <svg className="w-4 h-4 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
                  <path d="M8 8h8" />
                  <path d="M8 12h6" />
                </svg>
                <span>Next Bill</span>
              </button>

              <button
                type="button"
                onClick={handleDoneConfirmation}
                className="flex-1 py-3 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs transition-transform active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 8. EDIT BILL MODAL ================= */}
      {editingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-sm w-full space-y-4 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            <div className={`flex items-center justify-between pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Edit Bill #{editingBill.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editCustName}
                  onChange={(e) => setEditCustName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Customer Phone</label>
                <input
                  type="tel"
                  value={editCustPhone}
                  onChange={(e) => setEditCustPhone(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                  required
                />
              </div>

              {/* Serving Stylist(s) Multi-Select */}
              <StylistMultiSelect
                value={editStaff}
                onChange={setEditStaff}
                label="Serving Stylist(s)"
                sublabel="Select Owner, Stylist, or Both"
              />

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Payment Mode</label>
                <select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value as Bill['mode'])}
                  className={`w-full px-2.5 py-2 rounded-xl border text-xs outline-none ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Partial Pay">Partial Pay</option>
                  <option value="Fully Pending">Fully Pending</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Total (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editTotal}
                    onChange={(e) => setEditTotal(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300'
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Paid (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editPaid}
                    onChange={(e) => setEditPaid(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-emerald-400' : 'bg-slate-50 border-slate-300'
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs cursor-pointer shadow-md"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    isDarkMode
                      ? 'border-white/10 text-slate-300 hover:bg-white/5'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 9. EXPRESS BILLING POS MODAL ================= */}
      {showNewBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div
            className={`rounded-3xl border w-full max-w-4xl shadow-2xl animate-scaleUp my-auto flex flex-col max-h-[92vh] overflow-hidden ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-slate-200 text-[#1F2937]'
            }`}
          >
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-base sm:text-lg font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    New Bill
                  </h3>
                  <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                    Select services, client details, payment modes & generate official bill
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {billCartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Clear Cart
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewBillModal(false)}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer transition-colors ${
                    isDarkMode
                      ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200 shadow-xs'
                  }`}
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Client Details Card */}
              <div
                className={`p-4 rounded-2xl border ${
                  isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                  <span className="text-xs font-extrabold text-[#D4AF37]">
                    1. Client Details
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomerDropdown((prev) => !prev)}
                      className="px-2.5 py-1 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Select Existing Client ({customers.length})</span>
                    </button>
                    <span className={`text-[10px] ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                      Walk-in if empty
                    </span>
                  </div>
                </div>

                {/* 1-Click Recent Clients Pill Bar */}
                {recentClients.length > 0 && (
                  <div className="mb-2.5 space-y-1">
                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Recent Clients (1-Click)
                    </span>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                      {recentClients.slice(0, 6).map((rc) => (
                        <button
                          key={rc.phone}
                          type="button"
                          onClick={() => {
                            setBillCustName(rc.name);
                            setBillCustPhone(rc.phone);
                            showToast(`Selected client ${rc.name}!`);
                          }}
                          className={`px-2.5 py-1 rounded-xl border text-left shrink-0 transition-all cursor-pointer ${
                            isDarkMode
                              ? 'border-[#2A3858] bg-[#121B33] hover:border-[#D4AF37]'
                              : 'border-slate-200 bg-white hover:border-[#D4AF37] hover:bg-amber-50/50 shadow-2xs'
                          }`}
                        >
                          <span className={`text-[11px] font-bold block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {rc.name}
                          </span>
                          <span className={`text-[10px] ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                            +91 {rc.phone.slice(-4)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Client Name with Autocomplete */}
                  <div className="relative">
                    <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Client Name
                    </label>
                    <input
                      type="text"
                      placeholder="Search existing or enter name..."
                      value={billCustName}
                      onFocus={() => {
                        if (customers.length > 0) setShowCustomerDropdown(true);
                      }}
                      onChange={(e) => {
                        setBillCustName(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none font-semibold ${
                        isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />

                    {/* Floating Customer Suggestions Dropdown */}
                    {showCustomerDropdown && (
                      <div
                        className={`absolute left-0 right-0 top-full mt-1.5 max-h-52 overflow-y-auto rounded-2xl border shadow-2xl p-1 z-50 animate-fadeIn ${
                          isDarkMode ? 'bg-[#162340] border-[#2A3858]' : 'bg-white border-slate-300'
                        }`}
                      >
                        <div className={`p-1.5 flex items-center justify-between border-b text-[10px] font-extrabold text-[#D4AF37] ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                          <span>Existing Customers ({filteredCustomers.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowCustomerDropdown(false)}
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                              isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black hover:bg-slate-100'
                            }`}
                          >
                            ✕
                          </button>
                        </div>
                        {filteredCustomers.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No existing clients matching &ldquo;{billCustName}&rdquo;.
                          </div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setBillCustName(c.name);
                                setBillCustPhone(c.phone);
                                setShowCustomerDropdown(false);
                                showToast(`Selected existing client ${c.name}!`, 'success');
                              }}
                              className={`w-full p-2 text-left rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                isDarkMode ? 'hover:bg-[#1f315a] text-white' : 'hover:bg-slate-100 text-slate-900'
                              }`}
                            >
                              <div>
                                <strong className="block font-bold">{c.name}</strong>
                                <span className="text-[10px] text-slate-400 font-mono">+91 {c.phone}</span>
                              </div>
                              {c.vip && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40">
                                  VIP
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      WhatsApp Mobile
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit number"
                      value={billCustPhone}
                      onChange={(e) => setBillCustPhone(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none font-semibold ${
                        isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Bill Date (Max: Today)
                    </label>
                    <input
                      type="date"
                      max={todayStr}
                      value={newBillDate}
                      onChange={(e) => setNewBillDate(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none font-semibold cursor-pointer ${
                        isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Service Catalog & Tap to Add (Full Width for 5-per-row square boxes on desktop) */}
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#D4AF37]">
                      2. Select Services (Tap to Add)
                    </span>
                    <span className={`text-[11px] ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                      {billCartItems.reduce((acc, i) => acc + i.qty, 0)} items in cart
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={serviceSearchQuery}
                    onChange={(e) => setServiceSearchQuery(e.target.value)}
                    className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                {/* ⭐ MOSTLY USED SERVICES AT THE TOP */}
                {mostlyUsedServices.length > 0 && (
                  <div className={`p-3 rounded-2xl border space-y-2 transition-colors ${
                    isDarkMode ? 'bg-[#121B33] border-[#D4AF37]/35' : 'bg-amber-50/70 border-amber-200 shadow-2xs'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">⭐</span>
                        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-[#D4AF37]' : 'text-amber-900'}`}>
                          Mostly Used Services
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isDarkMode ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-amber-100 text-amber-800'
                      }`}>
                        Tap to 1-Click Add
                      </span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                      {mostlyUsedServices.map((srv) => {
                        const cartItem = billCartItems.find((i) => i.name === srv.name);
                        return (
                          <div
                            key={srv.id}
                            onClick={() => addCartItem(srv)}
                            className={`relative p-2.5 rounded-xl border shrink-0 min-w-[145px] max-w-[165px] flex flex-col justify-between transition-all cursor-pointer select-none active:scale-95 ${
                              cartItem
                                ? 'bg-[#D4AF37]/20 border-[#D4AF37] shadow-sm shadow-[#D4AF37]/20 ring-1 ring-[#D4AF37]/50'
                                : isDarkMode
                                ? 'bg-[#1A2746] border-[#2A3858] hover:border-[#D4AF37]/50'
                                : 'bg-white border-slate-200 hover:border-[#D4AF37] shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1 min-h-[22px]">
                              {cartItem ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDecrementCartItem(srv.name);
                                  }}
                                  className="w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-xs font-black shadow-xs cursor-pointer transition-transform active:scale-90"
                                  title="Remove one"
                                  aria-label="Remove"
                                >
                                  –
                                </button>
                              ) : (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                                  ⭐ Mostly Used
                                </span>
                              )}

                              <div className="flex items-center gap-1">
                                {cartItem && (
                                  <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-500">
                                    ⭐
                                  </span>
                                )}
                                {cartItem && (
                                  <span className="w-5 h-5 rounded-full bg-[#D4AF37] text-[#07152B] font-black text-[10px] flex items-center justify-center shadow-xs">
                                    {cartItem.qty}
                                  </span>
                                )}
                              </div>
                            </div>

                            <strong className={`block text-xs font-bold truncate my-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                              {srv.name}
                            </strong>

                            <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                              <span className="text-xs font-extrabold text-[#D4AF37] font-mono">
                                ₹{srv.price}
                              </span>
                              <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                {srv.dur}m
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs [scrollbar-width:none]">
                  {serviceCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-[#D4AF37] text-[#0B1F44]'
                          : isDarkMode
                          ? 'bg-[#121B33] border border-[#2A3858] text-slate-300 hover:text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Services Grid (Square Boxes: ~5 per row on desktop, tap anywhere to add, corner minus to decrement) */}
                <div className={`max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5 p-2 rounded-2xl border ${
                  isDarkMode ? 'border-[#2A3858] bg-[#121B33]' : 'border-slate-200 bg-slate-50'
                }`}>
                  {filteredServices.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-xs text-slate-400">
                      No services match your search.
                    </div>
                  ) : (
                    filteredServices.map((srv) => {
                      const cartItem = billCartItems.find((i) => i.name === srv.name);
                      const isMostlyUsed = mostlyUsedIds.has(srv.id);

                      return (
                        <div
                          key={srv.id}
                          onClick={() => addCartItem(srv)}
                          className={`relative p-2.5 rounded-2xl border flex flex-col justify-between transition-all select-none cursor-pointer active:scale-95 min-h-[110px] sm:min-h-[115px] ${
                            cartItem
                              ? 'bg-[#D4AF37]/20 border-[#D4AF37] shadow-sm shadow-[#D4AF37]/20 ring-1 ring-[#D4AF37]/50'
                              : isDarkMode
                              ? 'bg-[#1A2746] border-[#2A3858] hover:border-[#D4AF37]/60 hover:bg-[#1f315a]'
                              : 'bg-white border-slate-200 hover:border-[#D4AF37] hover:bg-amber-50/40 shadow-2xs'
                          }`}
                        >
                          {/* Top Row: Left Minus button if in cart, Right Count Badge if in cart */}
                          <div className="flex items-center justify-between gap-1 w-full min-h-[22px]">
                            <div>
                              {cartItem ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDecrementCartItem(srv.name);
                                  }}
                                  className="w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-xs font-black shadow-xs cursor-pointer transition-transform active:scale-90"
                                  title="Remove one"
                                  aria-label="Remove"
                                >
                                  –
                                </button>
                              ) : isMostlyUsed ? (
                                <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                                  ⭐ Mostly
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1">
                              {cartItem && isMostlyUsed && (
                                <span className="text-[10px]" title="Mostly Used">⭐</span>
                              )}
                              {cartItem ? (
                                <span className="w-5 h-5 rounded-full bg-[#D4AF37] text-[#07152B] font-black text-[10px] flex items-center justify-center shadow-xs">
                                  {cartItem.qty}
                                </span>
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center text-[10px] font-black">
                                  +
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Middle: Service Name */}
                          <div className="my-1 flex-1 flex items-center">
                            <strong className={`block text-xs font-bold leading-tight line-clamp-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                              {srv.name}
                            </strong>
                          </div>

                          {/* Bottom: Price & Duration */}
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                            <span className="font-extrabold text-[#D4AF37] font-mono">
                              ₹{srv.price}
                            </span>
                            <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {srv.dur}m
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Section 3: 2-Column Responsive Layout for Cart & Stylist + Totals & Payment */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Stylist Multi-Select & Active Cart */}
                <div
                  className={`lg:col-span-6 p-4 rounded-2xl border space-y-3.5 flex flex-col justify-between ${
                    isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <StylistMultiSelect
                    value={billStaffSelect}
                    onChange={setBillStaffSelect}
                    label="Serving Stylist(s)"
                    sublabel="Select Owner, Stylist, or Both"
                  />

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold text-[#D4AF37]">
                        Active Cart ({billCartItems.length} items)
                      </span>
                      {billCartItems.length > 0 && (
                        <button
                          type="button"
                          onClick={clearCart}
                          className="text-[11px] text-rose-400 hover:underline font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {billCartItems.length === 0 ? (
                        <div className={`p-4 text-center text-xs border border-dashed rounded-xl ${isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-500'}`}>
                          No services added yet. Tap services above to add.
                        </div>
                      ) : (
                        billCartItems.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                              isDarkMode ? 'bg-[#121B33] border-white/5' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <strong className={`block truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                {item.name}
                              </strong>
                              <span className={`text-[10px] ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                                ₹{item.price} each
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className={`flex items-center rounded-lg border ${isDarkMode ? 'border-white/10' : 'border-slate-300'}`}>
                                <button
                                  type="button"
                                  onClick={() => updateCartItemQty(idx, item.qty - 1)}
                                  className="px-2 py-0.5 text-xs hover:text-[#D4AF37] font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="px-1 text-xs font-bold">{item.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItemQty(idx, item.qty + 1)}
                                  className="px-2 py-0.5 text-xs hover:text-[#D4AF37] font-bold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>

                              <strong className="text-xs font-black text-[#D4AF37] w-14 text-right">
                                ₹{item.price * item.qty}
                              </strong>

                              <button
                                type="button"
                                onClick={() => removeCartItem(idx)}
                                className="text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer"
                                aria-label="Delete item"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Discounts, Payment Mode, Financial Totals & Generate Bill Button */}
                <div
                  className={`lg:col-span-6 p-4 rounded-2xl border space-y-3 flex flex-col justify-between ${
                    isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Discount & Tip Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Discount (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={billDiscount || ''}
                          onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value)))}
                          className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold outline-none ${
                            isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Tip (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={billTip || ''}
                          onChange={(e) => setBillTip(Math.max(0, Number(e.target.value)))}
                          className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold outline-none ${
                            isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Payment Mode Selector */}
                    <div>
                      <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Payment Mode
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                        {(['UPI', 'Cash', 'Card', 'Partial Pay', 'Fully Pending'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setBillPaymentMode(mode)}
                            className={`py-1.5 px-2 rounded-xl border text-center transition-colors cursor-pointer text-[11px] ${
                              billPaymentMode === mode
                                ? 'bg-[#D4AF37] text-[#0B1F44] border-[#D4AF37]'
                                : isDarkMode
                                ? 'bg-[#121B33] border-[#2A3858] text-slate-300 hover:text-white'
                                : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>

                      {billPaymentMode === 'Partial Pay' && (
                        <div className="mt-2 p-2.5 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 space-y-1">
                          <label className="block text-[10px] font-bold text-[#D4AF37]">
                            Amount Received Now (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={cartTotal}
                            value={partialPaidAmount}
                            onChange={(e) => setPartialPaidAmount(Number(e.target.value))}
                            className={`w-full px-3 py-1.5 rounded-xl border text-xs font-bold outline-none ${
                              isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />
                          <div className="flex justify-between text-[11px] font-bold pt-1">
                            <span className="text-slate-400">Due Balance:</span>
                            <span className="text-rose-400">₹{Math.max(0, cartTotal - partialPaidAmount)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Summary & Checkout Button */}
                  <div className={`space-y-3 pt-2 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="space-y-1 text-xs">
                      <div className={`flex justify-between ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span>Subtotal:</span>
                        <span>₹{cartSubtotal}</span>
                      </div>
                      {safeDiscount > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Discount:</span>
                          <span>-₹{safeDiscount}</span>
                        </div>
                      )}
                      {taxAmount > 0 && (
                        <div className={`flex justify-between ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>GST ({gstRate}%):</span>
                          <span>₹{taxAmount}</span>
                        </div>
                      )}
                      {safeTip > 0 && (
                        <div className="flex justify-between text-[#D4AF37]">
                          <span>Tip:</span>
                          <span>+₹{safeTip}</span>
                        </div>
                      )}
                      <div className={`flex justify-between text-sm font-black pt-1 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-200'}`}>
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>Net Payable:</span>
                        <span className="text-[#D4AF37] text-base">₹{cartTotal}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={billCartItems.length === 0}
                      onClick={handleCompleteBill}
                      className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg select-none ${
                        billCartItems.length === 0
                          ? 'bg-gradient-to-r from-[#D4AF37]/50 via-[#F5A623]/50 to-[#D4AF37]/50 text-[#07152B]/70 border border-[#D4AF37]/40 cursor-not-allowed opacity-75'
                          : 'bg-gradient-to-r from-[#D4AF37] via-[#F5A623] to-[#D4AF37] hover:brightness-105 active:scale-[0.98] text-[#07152B] shadow-md shadow-[#D4AF37]/30 border border-[#FFE17D]'
                      }`}
                    >
                      <svg className="w-5 h-5 shrink-0 text-[#07152B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                      <span className="truncate">Generate Bill & Open Invoice (₹{cartTotal})</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: 100 FREE BILLS LIMIT REACHED ================= */}
      {showPlanLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 sm:p-7 rounded-3xl border max-w-lg w-full space-y-5 shadow-2xl transition-all animate-scaleUp ${
              isDarkMode
                ? 'bg-[#1A2746] border-[#2A3858] text-white'
                : 'bg-white border-slate-200 text-[#1F2937]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black shrink-0">
                <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className={`text-base sm:text-lg font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Free Plan Limit Reached (100 / 100 Bills)
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                  You have completed your 100 free bills on StyleFleet Starter
                </p>
              </div>
            </div>

            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              To continue creating bills without limits, sending official WhatsApp invoices, and unlocking detailed financial analytics, please subscribe to an active StyleFleet plan.
            </p>

            {/* Plans Showcase */}
            <div className="space-y-2 text-xs">
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <strong className="block font-bold">3 Months Pro</strong>
                  <span className="text-[11px] text-slate-400">₹2,999 + 18% GST (₹3,538.82)</span>
                </div>
                <span className="text-xs font-black text-[#D4AF37]">₹2,999</span>
              </div>

              <div className={`p-3 rounded-2xl border flex items-center justify-between relative overflow-hidden ${
                isDarkMode ? 'bg-[#121B33] border-[#D4AF37]/40 ring-1 ring-[#D4AF37]/30' : 'bg-amber-50/50 border-[#D4AF37]/60'
              }`}>
                <div className="absolute top-0 right-0 bg-[#D4AF37] text-[#0B1F44] text-[9px] font-black px-2 py-0.5 rounded-bl-lg">
                  POPULAR
                </div>
                <div>
                  <strong className="block font-bold">6 Months Pro (Offer Price)</strong>
                  <span className="text-[11px] text-slate-400">₹5,499 (Original ₹5,999)</span>
                </div>
                <span className="text-xs font-black text-[#D4AF37]">₹5,499</span>
              </div>

              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <strong className="block font-bold">12 Months Pro (Best Value)</strong>
                  <span className="text-[11px] text-slate-400">₹9,999 (Original ₹11,999)</span>
                </div>
                <span className="text-xs font-black text-[#D4AF37]">₹9,999</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPlanLimitModal(false)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  isDarkMode
                    ? 'border-[#2A3858] text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPlanLimitModal(false);
                  setCurrentScreen('settings');
                  showToast('Navigate to Settings → Subscription to upgrade!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black shadow-md active:scale-98 transition-all cursor-pointer"
              >
                Upgrade Subscription →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
