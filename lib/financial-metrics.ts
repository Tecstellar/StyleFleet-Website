import { Bill } from '@/components/SalonContext';

export interface SalesMetrics {
  total_minor: number;
  prev_minor: number;
  bills_count: number;
  avg_bill_minor: number;
  today_revenue: number;
  today_invoices_count: number;
  bars: { label: string; amt_minor: number; height_pct: number }[];
  subLabel: string;
  paymentTotals: { UPI: number; Cash: number; Card: number };
}

/**
 * Single Source of Truth for Financial Sales Metrics.
 * Replicates the exact algorithm from StyleFleet Android (`billingRepository.getSalesMetrics`).
 * Ensures 100% exact parity between the mobile app and website for Revenue and Invoices Count.
 */
export function getSalesMetrics(
  period: 'Day' | 'Week' | 'Month' = 'Day',
  billsList: Bill[] = []
): SalesMetrics {
  const allBills = billsList || [];
  const activeBills = allBills.filter((b) => b && !b.isDeleted);
  const now = new Date();

  // Midnight boundaries in current local time (Asia/Kolkata)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  // Helper to get timestamp of a bill
  const getBillTime = (b: Bill): number => {
    if (b.createdAt) {
      const t = new Date(b.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (b.dateStr) {
      const t = new Date(b.dateStr).getTime();
      if (!isNaN(t)) return t;
    }
    return now.getTime();
  };

  // Helper to get collected revenue for a bill (matches mobile app parity)
  const getBillCollectedMinor = (b: Bill): number => {
    if (b.status === 'pending') return 0;
    if (b.status === 'partially_paid') {
      return Math.round((b.paidAmount ?? b.total ?? 0) * 100);
    }
    return Math.round((b.total || 0) * 100);
  };

  interface CollectedPayment {
    amount_minor: number;
    method: string;
    time: number;
    bill: Bill;
  }

  const allPayments: CollectedPayment[] = [];
  for (const b of activeBills) {
    const collected = getBillCollectedMinor(b);
    if (collected <= 0 || b.status === 'pending') {
      continue;
    }

    if (b.payments && b.payments.length > 0) {
      const sumPayments = b.payments.reduce((acc, p) => acc + (p.amount_minor || 0), 0);
      for (const p of b.payments) {
        const pt = p.paid_at ? new Date(p.paid_at).getTime() : getBillTime(b);
        // Scale payments proportionally if sum does not match current collected total
        const effectiveAmount =
          sumPayments > 0 && sumPayments !== collected
            ? Math.round(((p.amount_minor || 0) / sumPayments) * collected)
            : (p.amount_minor || 0);

        if (effectiveAmount > 0) {
          allPayments.push({
            amount_minor: effectiveAmount,
            method: p.method || b.mode || 'UPI',
            time: isNaN(pt) ? getBillTime(b) : pt,
            bill: b,
          });
        }
      }
    } else {
      allPayments.push({
        amount_minor: collected,
        method: b.mode || 'UPI',
        time: getBillTime(b),
        bill: b,
      });
    }
  }

  let filteredPayments: CollectedPayment[] = [];
  let prevPayments: CollectedPayment[] = [];
  let bars: { label: string; amt_minor: number; height_pct: number }[] = [];
  let subLabel = '';

  if (period === 'Day') {
    // Current day (Today)
    filteredPayments = allPayments.filter((p) => p.time >= todayStart && p.time <= todayEnd);

    // Yesterday
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    prevPayments = allPayments.filter((p) => p.time >= yesterdayStart && p.time < todayStart);

    const timeSlots = [
      { label: '9a', startHour: 0, endHour: 10 },
      { label: '11a', startHour: 10, endHour: 12 },
      { label: '1p', startHour: 12, endHour: 14 },
      { label: '3p', startHour: 14, endHour: 16 },
      { label: '5p', startHour: 16, endHour: 18 },
      { label: '7p', startHour: 18, endHour: 20 },
      { label: '9p', startHour: 20, endHour: 24 },
    ];

    const slotTotals = timeSlots.map((slot) => {
      const slotPayments = filteredPayments.filter((p) => {
        const d = new Date(p.time);
        const h = d.getHours();
        return h >= slot.startHour && h < slot.endHour;
      });
      const amt = slotPayments.reduce((acc, p) => acc + p.amount_minor, 0);
      return { label: slot.label, amt_minor: amt, height_pct: 10 };
    });

    const maxSlot = Math.max(...slotTotals.map((s) => s.amt_minor), 0);
    bars = slotTotals.map((s) => ({
      label: s.label,
      amt_minor: s.amt_minor,
      height_pct: maxSlot > 0 ? Math.max(10, Math.round((s.amt_minor / maxSlot) * 100)) : 10,
    }));

    const todayStr = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    subLabel = `Today (${todayStr}) vs yesterday`;
  } else if (period === 'Week') {
    // 7 days ending today (inclusive of today)
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    filteredPayments = allPayments.filter((p) => p.time >= weekStart && p.time <= todayEnd);

    // Prior 7-day period
    const prevWeekStart = weekStart - 7 * 24 * 60 * 60 * 1000;
    prevPayments = allPayments.filter((p) => p.time >= prevWeekStart && p.time < weekStart);

    const dayBars: { label: string; amt_minor: number; height_pct: number }[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const dStart = todayStart - i * 24 * 60 * 60 * 1000;
      const dEnd = dStart + 24 * 60 * 60 * 1000 - 1;
      const targetDate = new Date(dStart);
      const dayLabel = i === 0 ? 'Today' : dayNames[targetDate.getDay()];

      const dayPayments = allPayments.filter((p) => p.time >= dStart && p.time <= dEnd);
      const amt = dayPayments.reduce((acc, p) => acc + p.amount_minor, 0);
      dayBars.push({ label: dayLabel, amt_minor: amt, height_pct: 10 });
    }

    const maxDay = Math.max(...dayBars.map((d) => d.amt_minor), 0);
    bars = dayBars.map((d) => ({
      label: d.label,
      amt_minor: d.amt_minor,
      height_pct: maxDay > 0 ? Math.max(10, Math.round((d.amt_minor / maxDay) * 100)) : 10,
    }));

    subLabel = `Last 7 days (including Today) vs prior week`;
  } else {
    // Month: 1st of current month up to today
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    filteredPayments = allPayments.filter((p) => p.time >= monthStart && p.time <= todayEnd);

    // Previous month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const prevMonthEnd = monthStart - 1;
    prevPayments = allPayments.filter((p) => p.time >= prevMonthStart && p.time <= prevMonthEnd);

    const weekBuckets: { label: string; amt_minor: number; height_pct: number }[] = [];
    const daysInMonthSoFar = now.getDate();
    const numWeeks = Math.max(1, Math.ceil(daysInMonthSoFar / 7));

    for (let w = 1; w <= Math.max(4, numWeeks); w++) {
      const wStart = monthStart + (w - 1) * 7 * 24 * 60 * 60 * 1000;
      const wEnd = Math.min(todayEnd, wStart + 7 * 24 * 60 * 60 * 1000 - 1);

      const wPayments = allPayments.filter((p) => p.time >= wStart && p.time <= wEnd);
      const amt = wPayments.reduce((acc, p) => acc + p.amount_minor, 0);
      weekBuckets.push({
        label: w === numWeeks ? `W${w} (Now)` : `W${w}`,
        amt_minor: amt,
        height_pct: 10,
      });
    }

    const maxWeek = Math.max(...weekBuckets.map((w) => w.amt_minor), 0);
    bars = weekBuckets.map((w) => ({
      label: w.label,
      amt_minor: w.amt_minor,
      height_pct: maxWeek > 0 ? Math.max(10, Math.round((w.amt_minor / maxWeek) * 100)) : 10,
    }));

    const monthName = now.toLocaleString('en-US', { month: 'long' });
    subLabel = `${monthName} (up to Today) vs last month`;
  }

  const totalMinor = filteredPayments.reduce((acc, p) => acc + p.amount_minor, 0);
  const prevMinor = prevPayments.reduce((acc, p) => acc + p.amount_minor, 0);
  const billsCount = new Set(filteredPayments.map((p) => p.bill.id)).size;
  const avgBillMinor = billsCount > 0 ? Math.round(totalMinor / billsCount) : 0;

  const paymentTotals: Record<string, number> = { UPI: 0, Cash: 0, Card: 0 };
  for (const p of filteredPayments) {
    const m = (p.method || 'UPI').toUpperCase();
    if (m.includes('CASH')) paymentTotals.Cash += p.amount_minor;
    else if (m.includes('CARD')) paymentTotals.Card += p.amount_minor;
    else paymentTotals.UPI += p.amount_minor;
  }

  return {
    total_minor: totalMinor,
    prev_minor: prevMinor,
    bills_count: billsCount,
    avg_bill_minor: avgBillMinor,
    today_revenue: Math.round(totalMinor / 100),
    today_invoices_count: billsCount,
    bars,
    subLabel,
    paymentTotals: {
      UPI: Math.round(paymentTotals.UPI / 100),
      Cash: Math.round(paymentTotals.Cash / 100),
      Card: Math.round(paymentTotals.Card / 100),
    },
  };
}
