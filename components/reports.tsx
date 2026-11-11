'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSalon, Bill, Expense } from '@/components/SalonContext';
import { AnimatedCounter } from '@/components/animated-counter';
import { matchStaffName, parseSelectedStylists } from '@/lib/salon-helpers';

type ReportTab = 'report' | 'summary';
type ReportSliderPeriod = 'today' | 'week' | 'month' | 'custom';

/** Matches mobile isOpeningDueBill: excludes DUE-* and opening due balance entries from service sales & profit. */
const isOpeningDueBill = (b: Bill): boolean => {
  if (b.id?.startsWith('DUE-')) return true;
  const n = (b.notes || '').toLowerCase();
  return (
    n.includes('opening balance') ||
    n.includes('adjusted customer due') ||
    n.includes('opening due balance') ||
    n.includes('customer opening due balance') ||
    n.includes('initial opening')
  );
};

/** Matches mobile Net Profit & Margin: genuine sales billed (total) minus expenses counted in profit. */
const calcNetProfitAndMargin = (billList: Bill[], expenseList: Expense[]) => {
  const salesTotal = billList
    .filter((b) => b.confirmationStatus !== 'Pending' && !isOpeningDueBill(b))
    .reduce((acc, b) => acc + (b.total || 0), 0);
  const countedExpenses = expenseList
    .filter((e) => e.inProfit !== false)
    .reduce((acc, e) => acc + (e.amount || 0), 0);
  const netProfit = salesTotal - countedExpenses;
  const marginPct = salesTotal > 0 ? Math.round((netProfit / salesTotal) * 100) : 0;
  return { salesTotal, countedExpenses, netProfit, marginPct };
};

const getLocalDateKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ReportsView() {
  const { role, bills, expenses, staff, services, shopProfile, isDarkMode, showToast, hasPermission, loggedInStaffName } = useSalon();

  const hasReportsAccess = role === 'owner' || hasPermission('reports');
  const hasFullReportsAccess = role === 'owner' || hasPermission('full_reports');

  // Tab: 'report' vs 'summary'
  const [activeTab, setActiveTab] = useState<ReportTab>('report');

  // Helper date functions using local calendar
  const getTodayDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayStr = useMemo(() => getTodayDateStr(), []);

  // Summary Selectors: Year & Month
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0 = Jan, 9 = Oct
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthIdx);

  // Timestamp parser for a bill
  const getBillTime = (b: Bill): number => {
    if (b.isToday) return new Date().getTime();
    if (b.createdAt) {
      const t = new Date(b.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (b.dateStr) {
      const t = new Date(b.dateStr).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // Timestamp parser for an expense (createdAt first to match mobile getExpenseTimestamp)
  const getExpenseTime = (exp: Expense): number => {
    if (exp.createdAt) {
      const t = new Date(exp.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (exp.date) {
      const t = new Date(exp.date).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // Salon registration date from shopProfile (or earliest transaction)
  const regDateObj = useMemo(() => {
    if (shopProfile?.createdAt) {
      const parsed = new Date(shopProfile.createdAt);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    let earliest = Infinity;
    bills.forEach((b) => {
      const t = getBillTime(b);
      if (t > 0 && t < earliest) earliest = t;
    });
    if (earliest !== Infinity) return new Date(earliest);
    return new Date();
  }, [shopProfile?.createdAt, bills]);

  const regYear = regDateObj.getFullYear();
  const regMonth = regDateObj.getMonth();
  const regDateStr = useMemo(() => {
    return `${regDateObj.getFullYear()}-${String(regDateObj.getMonth() + 1).padStart(2, '0')}-${String(regDateObj.getDate()).padStart(2, '0')}`;
  }, [regDateObj]);

  // Report Slider: 'today' | 'week' | 'month' | 'custom'
  const [sliderPeriod, setSliderPeriod] = useState<ReportSliderPeriod>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  const monthNames = useMemo(() => [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ], []);

  // Available Years: ONLY from salon registration year up to current year (never before registration!)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    const minYear = Math.min(regYear, currentYear);
    for (let yr = currentYear; yr >= minYear; yr--) {
      years.push(yr);
    }
    return years.length > 0 ? years : [currentYear];
  }, [currentYear, regYear]);

  // Available Months: for selected year, only from registration month onwards (and up to current month for this year)
  const availableMonths = useMemo(() => {
    const list: { idx: number; name: string }[] = [];
    const startM = selectedYear === regYear ? regMonth : 0;
    const endM = selectedYear === currentYear ? currentMonthIdx : 11;
    for (let m = startM; m <= endM; m++) {
      list.push({ idx: m, name: monthNames[m] });
    }
    return list.length > 0 ? list : [{ idx: currentMonthIdx, name: monthNames[currentMonthIdx] }];
  }, [selectedYear, regYear, regMonth, currentYear, currentMonthIdx, monthNames]);

  // Sync selectedYear if not in availableYears
  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Sync selectedMonth if not in availableMonths
  useEffect(() => {
    const isCurrentValid = availableMonths.some((m) => m.idx === selectedMonth);
    if (!isCurrentValid && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[availableMonths.length - 1].idx);
    }
  }, [availableMonths, selectedMonth]);

  // Restrict Stylist Access if not granted by Owner
  if (!hasReportsAccess) {
    return (
      <div className="p-8 rounded-3xl border text-center text-xs bg-[#0F1C36] border-white/10 text-[#A7B0C3] my-6">
        <svg className="w-10 h-10 mx-auto mb-3 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <strong className="text-white text-sm block mb-1">Access Restricted by Salon Owner</strong>
        <span>Financial reports and audits have not been enabled for your stylist account.</span>
      </div>
    );
  }

  // Active Bills (non-deleted, filtered for chair if stylist lacks full reports)
  const activeBills = useMemo(() => {
    const nonDeleted = bills.filter((b) => !b.isDeleted);
    if (role === 'stylist' && !hasFullReportsAccess && loggedInStaffName) {
      const nameLower = loggedInStaffName.trim().toLowerCase();
      return nonDeleted.filter((b) => matchStaffName(b.staff, nameLower));
    }
    return nonDeleted;
  }, [bills, role, hasFullReportsAccess, loggedInStaffName]);

  // ================= 1. REPORT TAB DATE RANGE & METRICS =================
  const reportDateRange = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (sliderPeriod === 'today') {
      return { start: todayStart, end: todayEnd, label: 'Today' };
    }
    if (sliderPeriod === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 6);
      return { start: weekStart, end: todayEnd, label: 'This Week (Last 7 Days)' };
    }
    if (sliderPeriod === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: monthStart, end: todayEnd, label: 'This Month' };
    }
    // Custom
    const startParts = customStartDate.split('-');
    const endParts = customEndDate.split('-');
    const customStart = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 0, 0, 0, 0);
    const customEnd = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]), 23, 59, 59, 999);
    return { start: customStart, end: customEnd, label: `${customStartDate} to ${customEndDate}` };
  }, [sliderPeriod, customStartDate, customEndDate]);

  // Bills within Report period
  const reportBills = useMemo(() => {
    return activeBills.filter((b) => {
      if (sliderPeriod === 'today' && b.isToday) return true;
      const t = getBillTime(b);
      if (!t) return false;
      return t >= reportDateRange.start.getTime() && t <= reportDateRange.end.getTime();
    });
  }, [activeBills, reportDateRange, sliderPeriod]);

  // Expenses within Report period
  const reportExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const t = getExpenseTime(e);
      if (!t) return false;
      return t >= reportDateRange.start.getTime() && t <= reportDateRange.end.getTime();
    });
  }, [expenses, reportDateRange]);

  // Financial KPIs for Report (Only Confirmed bills enter into revenue)
  const totalSalesCollected = useMemo(() => {
    return reportBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .reduce((acc, b) => acc + (b.paidAmount || b.total || 0), 0);
  }, [reportBills]);

  const grossSalesBilled = useMemo(() => {
    return reportBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .reduce((acc, b) => acc + (b.total || 0), 0);
  }, [reportBills]);

  const outstandingFromCustomers = useMemo(() => {
    return reportBills.reduce((acc, b) => acc + (b.dueAmount || 0), 0);
  }, [reportBills]);

  const totalExpensesAmount = useMemo(() => {
    return reportExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  }, [reportExpenses]);

  const { netProfit, marginPct } = useMemo(
    () => calcNetProfitAndMargin(reportBills, reportExpenses),
    [reportBills, reportExpenses]
  );

  // Payment Summary (Zero Transactions, UPI, Cash, Card, Total Collected)
  const paymentSummary = useMemo(() => {
    let upi = 0;
    let cash = 0;
    let card = 0;
    let zeroCount = 0;

    reportBills.forEach((b) => {
      const amt = b.paidAmount || b.total || 0;
      if (amt === 0 || b.status === 'pending') {
        zeroCount += 1;
      }
      if (b.mode === 'Cash') {
        cash += amt;
      } else if (b.mode === 'Card') {
        card += amt;
      } else {
        upi += amt;
      }
    });

    const total = upi + cash + card;
    return {
      zeroTransactions: zeroCount,
      upiCollected: upi,
      cashCollected: cash,
      cardCollected: card,
      totalCollected: total,
    };
  }, [reportBills]);

  // Day-wise Breakdown
  const dayWiseBreakdown = useMemo(() => {
    const map: Record<string, { date: string; billsCount: number; gross: number; collected: number; expenses: number; profitSales: number; countedExpenses: number; netProfit: number }> = {};

    reportBills.forEach((b) => {
      const t = getBillTime(b);
      const dStr = t ? getLocalDateKey(t) : (b.dateStr?.split(',')[0] || todayStr);
      if (!map[dStr]) {
        map[dStr] = { date: dStr, billsCount: 0, gross: 0, collected: 0, expenses: 0, profitSales: 0, countedExpenses: 0, netProfit: 0 };
      }
      map[dStr].billsCount += 1;
      map[dStr].gross += b.total || 0;
      map[dStr].collected += b.paidAmount || b.total || 0;
      if (b.confirmationStatus !== 'Pending' && !isOpeningDueBill(b)) {
        map[dStr].profitSales += b.total || 0;
      }
    });

    reportExpenses.forEach((e) => {
      const t = getExpenseTime(e);
      const dStr = t ? getLocalDateKey(t) : (e.date ? e.date.split('T')[0] : todayStr);
      if (!map[dStr]) {
        map[dStr] = { date: dStr, billsCount: 0, gross: 0, collected: 0, expenses: 0, profitSales: 0, countedExpenses: 0, netProfit: 0 };
      }
      map[dStr].expenses += e.amount || 0;
      if (e.inProfit !== false) {
        map[dStr].countedExpenses += e.amount || 0;
      }
    });

    Object.values(map).forEach((item) => {
      item.netProfit = item.profitSales - item.countedExpenses;
    });

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [reportBills, reportExpenses, todayStr]);

  // Stylist Performance - Strictly synchronized with registered staff team
  const stylistPerformance = useMemo(() => {
    const map: Record<string, { name: string; role: string; servicesDone: number; billsCount: number; grossSales: number; commissionRate: number; commissionEarned: number }> = {};

    // 1. Strictly register only staff members that exist in the shop's staff team
    staff.forEach((s) => {
      if (!s.name) return;
      const cleanName = s.name.trim();
      map[cleanName] = {
        name: cleanName,
        role: s.role || 'Stylist',
        servicesDone: 0,
        billsCount: 0,
        grossSales: 0,
        commissionRate: s.commissionRate || 10,
        commissionEarned: 0,
      };
    });

    const registeredStaffList = staff.filter((s) => Boolean(s.name && s.name.trim()));
    const singleRegisteredStaff = registeredStaffList.length === 1 ? registeredStaffList[0].name.trim() : null;
    const ownerName = (shopProfile?.ownerName || 'Owner').trim();

    reportBills.forEach((b) => {
      const assignedStylists = parseSelectedStylists(b.staff);
      let stylistsToCredit: string[] = [];

      if (singleRegisteredStaff) {
        // Salon has exactly one stylist hired (e.g. Priya) - all shop styling bills belong to this stylist
        stylistsToCredit = [singleRegisteredStaff];
      } else if (registeredStaffList.length > 1) {
        // Multi-stylist shop: match strictly against registered staff names
        assignedStylists.forEach((name) => {
          const match = registeredStaffList.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
          if (match && !stylistsToCredit.includes(match.name.trim())) {
            stylistsToCredit.push(match.name.trim());
          }
        });
        // If bill was explicitly assigned to Owner and owner is taking services
        if (stylistsToCredit.length === 0 && assignedStylists.some((n) => n.trim().toLowerCase() === ownerName.toLowerCase())) {
          if (!map[ownerName]) {
            map[ownerName] = {
              name: ownerName,
              role: 'Owner',
              servicesDone: 0,
              billsCount: 0,
              grossSales: 0,
              commissionRate: 0,
              commissionEarned: 0,
            };
          }
          stylistsToCredit = [ownerName];
        }
      } else {
        // 0 registered staff: salon is operated by owner directly
        if (!map[ownerName]) {
          map[ownerName] = {
            name: ownerName,
            role: 'Owner',
            servicesDone: 0,
            billsCount: 0,
            grossSales: 0,
            commissionRate: 0,
            commissionEarned: 0,
          };
        }
        stylistsToCredit = [ownerName];
      }

      if (stylistsToCredit.length === 0) return; // Absolutely no unregistered phantom staff allowed!

      const splitFactor = stylistsToCredit.length;
      const billRev = Math.round((b.paidAmount || b.total || 0) / splitFactor);
      const itemsCount = Math.round((b.items || []).reduce((acc, it) => acc + (it.qty || 1), 0) / splitFactor);

      stylistsToCredit.forEach((stylistName) => {
        if (map[stylistName]) {
          map[stylistName].billsCount += 1;
          map[stylistName].grossSales += billRev;
          map[stylistName].servicesDone += Math.max(1, itemsCount);
        }
      });
    });

    Object.values(map).forEach((item) => {
      item.commissionEarned = Math.round(item.grossSales * (item.commissionRate / 100));
    });

    return Object.values(map).sort((a, b) => b.grossSales - a.grossSales);
  }, [staff, reportBills, shopProfile?.ownerName]);

  // Service Performance
  const servicePerformance = useMemo(() => {
    const map: Record<string, { name: string; cat: string; qty: number; revenue: number; sharePct: number }> = {};

    reportBills.forEach((b) => {
      (b.items || []).forEach((it) => {
        if (!map[it.name]) {
          const matchingSrv = services.find((s) => s.name.toLowerCase() === it.name.toLowerCase());
          map[it.name] = {
            name: it.name,
            cat: matchingSrv?.cat || 'General',
            qty: 0,
            revenue: 0,
            sharePct: 0,
          };
        }
        map[it.name].qty += it.qty || 1;
        map[it.name].revenue += (it.price || 0) * (it.qty || 1);
      });
    });

    const totalRev = Object.values(map).reduce((sum, s) => sum + s.revenue, 0) || 1;
    Object.values(map).forEach((s) => {
      s.sharePct = Math.round((s.revenue / totalRev) * 100);
    });

    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [reportBills, services]);

  // ================= 2. EXPORT ACTIONS (PDF & EXCEL) =================
  const handleGeneratePdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      showToast('Popup blocker prevented report generation. Please allow popups.', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>StyleFleet Report - ${reportDateRange.label}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 32px; margin: 0; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
          .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: #f8fafc; }
          .card-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; }
          .card-val { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 6px; }
          .section-title { font-size: 16px; font-weight: 700; margin: 24px 0 12px; color: #0f172a; border-left: 4px solid #D4AF37; padding-left: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          th { text-align: left; padding: 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-weight: 700; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .gold { color: #8C6239; font-weight: 800; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${shopProfile.shopName || 'StyleFleet Salon'}</div>
            <div class="subtitle">Official Financial Performance Statement · ${reportDateRange.label}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: bold;">Generated on: ${new Date().toLocaleDateString('en-IN')}</div>
            <div style="font-size: 11px; color: #64748b;">Phone: +91 ${shopProfile.phone || '9876543210'}</div>
          </div>
        </div>

        <div class="kpis">
          <div class="card">
            <div class="card-title">Net Profit</div>
            <div class="card-val gold">₹${netProfit.toLocaleString('en-IN')} (${marginPct}%)</div>
          </div>
          <div class="card">
            <div class="card-title">Total Sales Collected</div>
            <div class="card-val">₹${totalSalesCollected.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Customer Outstanding</div>
            <div class="card-val">₹${outstandingFromCustomers.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Expenses</div>
            <div class="card-val">₹${totalExpensesAmount.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div class="section-title">Payment Summary</div>
        <table>
          <thead>
            <tr><th>Channel / Metric</th><th class="text-right">Collected Amount (₹)</th><th class="text-right">Share</th></tr>
          </thead>
          <tbody>
            <tr><td>UPI Collected</td><td class="text-right">₹${paymentSummary.upiCollected.toLocaleString('en-IN')}</td><td class="text-right">${Math.round((paymentSummary.upiCollected / (paymentSummary.totalCollected || 1)) * 100)}%</td></tr>
            <tr><td>Cash Collected</td><td class="text-right">₹${paymentSummary.cashCollected.toLocaleString('en-IN')}</td><td class="text-right">${Math.round((paymentSummary.cashCollected / (paymentSummary.totalCollected || 1)) * 100)}%</td></tr>
            <tr><td>Card Collected</td><td class="text-right">₹${paymentSummary.cardCollected.toLocaleString('en-IN')}</td><td class="text-right">${Math.round((paymentSummary.cardCollected / (paymentSummary.totalCollected || 1)) * 100)}%</td></tr>
            <tr style="font-weight: bold; background: #f8fafc;"><td>Total Collected (Zero Bills: ${paymentSummary.zeroTransactions})</td><td class="text-right gold">₹${paymentSummary.totalCollected.toLocaleString('en-IN')}</td><td class="text-right">100%</td></tr>
          </tbody>
        </table>

        <div class="section-title">Stylist Performance</div>
        <table>
          <thead>
            <tr><th>Stylist Name</th><th>Role</th><th class="text-right">Services Done</th><th class="text-right">Bills</th><th class="text-right">Gross Sales (₹)</th><th class="text-right">Commission (₹)</th></tr>
          </thead>
          <tbody>
            ${stylistPerformance.map(s => `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.role}</td>
                <td class="text-right">${s.servicesDone}</td>
                <td class="text-right">${s.billsCount}</td>
                <td class="text-right">₹${s.grossSales.toLocaleString('en-IN')}</td>
                <td class="text-right">₹${s.commissionEarned.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">Top Services Ranking</div>
        <table>
          <thead>
            <tr><th>Service Name</th><th>Category</th><th class="text-right">Units Sold</th><th class="text-right">Revenue (₹)</th><th class="text-right">Share %</th></tr>
          </thead>
          <tbody>
            ${servicePerformance.slice(0, 8).map(s => `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.cat}</td>
                <td class="text-right">${s.qty}</td>
                <td class="text-right">₹${s.revenue.toLocaleString('en-IN')}</td>
                <td class="text-right">${s.sharePct}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by StyleFleet Web Salon Management Platform · Confidential Business Audit
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 400);
    showToast('Report PDF printable statement generated!');
  };

  const handleGenerateExcel = () => {
    let csv = `\uFEFFStyleFleet Salon Performance Report\n`;
    csv += `Salon:,"${shopProfile.shopName || 'StyleFleet Salon'}"\n`;
    csv += `Period:,"${reportDateRange.label}"\n`;
    csv += `Generated:,"${new Date().toLocaleString('en-IN')}"\n\n`;

    csv += `1. FINANCIAL OVERVIEW\n`;
    csv += `Metric,Amount (INR)\n`;
    csv += `Total Sales Collected,${totalSalesCollected}\n`;
    csv += `Customer Outstanding Due,${outstandingFromCustomers}\n`;
    csv += `Total Expenses,${totalExpensesAmount}\n`;
    csv += `Net Profit,${netProfit}\n`;
    csv += `Net Profit Margin %,${marginPct}%\n\n`;

    csv += `2. PAYMENT SUMMARY\n`;
    csv += `Channel,Amount (INR)\n`;
    csv += `UPI Collected,${paymentSummary.upiCollected}\n`;
    csv += `Cash Collected,${paymentSummary.cashCollected}\n`;
    csv += `Card Collected,${paymentSummary.cardCollected}\n`;
    csv += `Total Collected,${paymentSummary.totalCollected}\n`;
    csv += `Zero Transactions Count,${paymentSummary.zeroTransactions}\n\n`;

    csv += `3. DAY-WISE BREAKDOWN\n`;
    csv += `Date,Bills Count,Gross Billed,Collected,Expenses,Net Margin\n`;
    dayWiseBreakdown.forEach((d) => {
      csv += `"${d.date}",${d.billsCount},${d.gross},${d.collected},${d.expenses},${d.netProfit}\n`;
    });
    csv += `\n`;

    csv += `4. STYLIST PERFORMANCE\n`;
    csv += `Stylist Name,Role,Services Delivered,Bills Handled,Gross Sales (INR),Commission Earned (INR)\n`;
    stylistPerformance.forEach((s) => {
      csv += `"${s.name}","${s.role}",${s.servicesDone},${s.billsCount},${s.grossSales},${s.commissionEarned}\n`;
    });
    csv += `\n`;

    csv += `5. SERVICE PERFORMANCE\n`;
    csv += `Service Name,Category,Units Sold,Gross Revenue (INR),Share %\n`;
    servicePerformance.forEach((s) => {
      csv += `"${s.name}","${s.cat}",${s.qty},${s.revenue},${s.sharePct}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `StyleFleet-Report-${sliderPeriod}-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report downloaded as Excel / CSV spreadsheet!');
  };

  // ================= 3. SUMMARY TAB (CHOOSE YEAR & MONTH) =================
  const selectedMonthBills = useMemo(() => {
    return activeBills.filter((b) => {
      const t = getBillTime(b);
      if (!t) return false;
      const d = new Date(t);
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [activeBills, selectedYear, selectedMonth]);

  const selectedMonthExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const t = getExpenseTime(e);
      if (!t) return false;
      const d = new Date(t);
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [expenses, selectedYear, selectedMonth]);

  // Monthly Metrics (Only Confirmed bills enter into revenue)
  const monthlySales = useMemo(() => {
    return selectedMonthBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .reduce((acc, b) => acc + (b.paidAmount || b.total || 0), 0);
  }, [selectedMonthBills]);

  const monthlyExpenses = useMemo(() => {
    return selectedMonthExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  }, [selectedMonthExpenses]);

  const { netProfit: monthlyNetProfit, marginPct: monthlyMargin } = useMemo(
    () => calcNetProfitAndMargin(selectedMonthBills, selectedMonthExpenses),
    [selectedMonthBills, selectedMonthExpenses]
  );
  const monthlyBillsCount = selectedMonthBills.length;
  const monthlyOutstanding = useMemo(() => {
    return selectedMonthBills.reduce((acc, b) => acc + (b.dueAmount || 0), 0);
  }, [selectedMonthBills]);

  // Days in selected month - bounded strictly between salon registration date and today (no empty 00 days!)
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const startDay = (selectedYear === regYear && selectedMonth === regMonth) ? regDateObj.getDate() : 1;
  const endDay = (selectedYear === currentYear && selectedMonth === currentMonthIdx) ? new Date().getDate() : daysInMonth;
  const activeDaysCount = Math.max(1, endDay - startDay + 1);
  const avgDailyRevenue = activeDaysCount > 0 ? Math.round(monthlySales / activeDaysCount) : 0;

  // Top Stylist of the Month - strictly registered staff only
  const topStylistOfMonth = useMemo(() => {
    const map: Record<string, number> = {};
    const registeredStaffList = staff.filter((s) => Boolean(s.name && s.name.trim()));
    const singleRegisteredStaff = registeredStaffList.length === 1 ? registeredStaffList[0].name.trim() : null;
    const ownerName = (shopProfile?.ownerName || 'Owner').trim();

    registeredStaffList.forEach((s) => {
      map[s.name.trim()] = 0;
    });

    selectedMonthBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .forEach((b) => {
        const assignedStylists = parseSelectedStylists(b.staff);
        let stylistsToCredit: string[] = [];

        if (singleRegisteredStaff) {
          stylistsToCredit = [singleRegisteredStaff];
        } else if (registeredStaffList.length > 1) {
          assignedStylists.forEach((name) => {
            const match = registeredStaffList.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
            if (match && !stylistsToCredit.includes(match.name.trim())) {
              stylistsToCredit.push(match.name.trim());
            }
          });
        } else {
          stylistsToCredit = [ownerName];
          if (map[ownerName] === undefined) map[ownerName] = 0;
        }

        if (stylistsToCredit.length === 0) return;

        const share = Math.round((b.paidAmount || b.total || 0) / stylistsToCredit.length);
        stylistsToCredit.forEach((name) => {
          if (map[name] !== undefined) {
            map[name] += share;
          }
        });
      });

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], revenue: sorted[0][1] } : null;
  }, [selectedMonthBills, staff, shopProfile?.ownerName]);

  // Top Service of the Month
  const topServiceOfMonth = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    selectedMonthBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .forEach((b) => {
        (b.items || []).forEach((it) => {
          if (!map[it.name]) map[it.name] = { qty: 0, revenue: 0 };
          map[it.name].qty += it.qty || 1;
          map[it.name].revenue += (it.price || 0) * (it.qty || 1);
        });
      });
    const sorted = Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
    return sorted.length > 0 ? { name: sorted[0][0], qty: sorted[0][1].qty, revenue: sorted[0][1].revenue } : null;
  }, [selectedMonthBills]);

  // Day-by-Day comparison for selected month (strictly from registration day onwards)
  const monthlyDayBreakdown = useMemo(() => {
    const daysMap: Record<number, { day: number; sales: number; expenses: number; profitSales: number; countedExpenses: number; netProfit: number }> = {};
    for (let i = startDay; i <= endDay; i++) {
      daysMap[i] = { day: i, sales: 0, expenses: 0, profitSales: 0, countedExpenses: 0, netProfit: 0 };
    }

    selectedMonthBills
      .filter((b) => b.confirmationStatus !== 'Pending')
      .forEach((b) => {
        const t = getBillTime(b);
        if (t) {
          const d = new Date(t);
          const day = d.getDate();
          if (daysMap[day]) {
            daysMap[day].sales += b.paidAmount || b.total || 0;
            if (!isOpeningDueBill(b)) {
              daysMap[day].profitSales += b.total || 0;
            }
          }
        }
      });

    selectedMonthExpenses.forEach((e) => {
      const t = getExpenseTime(e);
      if (t) {
        const d = new Date(t);
        const day = d.getDate();
        if (daysMap[day]) {
          daysMap[day].expenses += e.amount || 0;
          if (e.inProfit !== false) {
            daysMap[day].countedExpenses += e.amount || 0;
          }
        }
      }
    });

    return Object.values(daysMap).map((row) => ({
      ...row,
      netProfit: row.profitSales - row.countedExpenses,
    }));
  }, [startDay, endDay, selectedMonthBills, selectedMonthExpenses]);

  // Download Monthly Report Action (Excel / CSV)
  const handleDownloadMonthlyReport = () => {
    let csv = `\uFEFFStyleFleet Executive Monthly Summary Report\n`;
    csv += `Salon:,"${shopProfile.shopName || 'StyleFleet Salon'}"\n`;
    csv += `Month & Year:,"${monthNames[selectedMonth]} ${selectedYear}"\n`;
    csv += `Generated:,"${new Date().toLocaleString('en-IN')}"\n\n`;

    csv += `MONTHLY EXECUTIVE METRICS\n`;
    csv += `Total Revenue Collected,${monthlySales}\n`;
    csv += `Total Expenses,${monthlyExpenses}\n`;
    csv += `Net Profit,${monthlyNetProfit}\n`;
    csv += `Net Margin %,${monthlyMargin}%\n`;
    csv += `Total Bills / Invoices,${monthlyBillsCount}\n`;
    csv += `Average Daily Revenue,${avgDailyRevenue}\n`;
    csv += `Customer Outstanding Due,${monthlyOutstanding}\n`;
    csv += `Top Performing Stylist,"${topStylistOfMonth?.name || 'N/A'}" (INR ${topStylistOfMonth?.revenue || 0})\n`;
    csv += `Top Performing Service,"${topServiceOfMonth?.name || 'N/A'}" (Units: ${topServiceOfMonth?.qty || 0}, INR ${topServiceOfMonth?.revenue || 0})\n\n`;

    csv += `DAY-BY-DAY MONTHLY FINANCIAL TREND\n`;
    csv += `Day,Sales Collected (INR),Expenses (INR),Net Day Profit (INR)\n`;
    monthlyDayBreakdown.forEach((d) => {
      csv += `${d.day} ${monthNames[selectedMonth]} ${selectedYear},${d.sales},${d.expenses},${d.netProfit}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `StyleFleet-Monthly-Report-${monthNames[selectedMonth]}-${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded monthly report for ${monthNames[selectedMonth]} ${selectedYear}!`);
  };

  // Generate Monthly PDF Action
  const handleGenerateMonthlyPdf = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      showToast('Popup blocker prevented report generation. Please allow popups.', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>StyleFleet Monthly Report - ${monthNames[selectedMonth]} ${selectedYear}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 32px; margin: 0; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
          .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: #f8fafc; }
          .card-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; }
          .card-val { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 6px; }
          .section-title { font-size: 16px; font-weight: 700; margin: 24px 0 12px; color: #0f172a; border-left: 4px solid #D4AF37; padding-left: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          th { text-align: left; padding: 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-weight: 700; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .gold { color: #8C6239; font-weight: 800; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${shopProfile.shopName || 'StyleFleet Salon'}</div>
            <div class="subtitle">Executive Monthly Summary Report · ${monthNames[selectedMonth]} ${selectedYear}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: bold;">Generated on: ${new Date().toLocaleDateString('en-IN')}</div>
            <div style="font-size: 11px; color: #64748b;">Phone: +91 ${shopProfile.phone || '9876543210'}</div>
          </div>
        </div>

        <div class="kpis">
          <div class="card">
            <div class="card-title">Monthly Net Profit</div>
            <div class="card-val gold">₹${monthlyNetProfit.toLocaleString('en-IN')} (${monthlyMargin}%)</div>
          </div>
          <div class="card">
            <div class="card-title">Total Revenue Collected</div>
            <div class="card-val">₹${monthlySales.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Monthly Outflow Expenses</div>
            <div class="card-val">₹${monthlyExpenses.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Customer Outstanding Khata</div>
            <div class="card-val">₹${monthlyOutstanding.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div class="section-title">Day-by-Day Monthly Performance Trend</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-right">Sales Collected (₹)</th>
              <th class="text-right">Expenses Outflow (₹)</th>
              <th class="text-right">Net Daily Margin (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${monthlyDayBreakdown.map((d) => `
              <tr>
                <td><strong>${d.day} ${monthNames[selectedMonth]} ${selectedYear}</strong></td>
                <td class="text-right">₹${d.sales.toLocaleString('en-IN')}</td>
                <td class="text-right">₹${d.expenses.toLocaleString('en-IN')}</td>
                <td class="text-right gold">₹${d.netProfit.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by StyleFleet Web Salon Management Platform · Confidential Business Audit
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 400);
    showToast(`Monthly PDF report generated for ${monthNames[selectedMonth]} ${selectedYear}!`);
  };

  return (
    <section className="space-y-6 animate-fadeIn pb-16">
      {/* ================= HEADER & REPORT / SUMMARY TABS ================= */}
      <div
        className={`p-6 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Salon Reports & Business Intelligence
              </h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                Owner Only
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Financial statements, payment channel audit, stylist commissions, and monthly performance ledger
            </p>
          </div>
        </div>

        {/* TWO PRIMARY OPTIONS: REPORT VS SUMMARY */}
        <div
          className={`p-1.5 rounded-2xl border flex items-center gap-1 shrink-0 ${
            isDarkMode ? 'bg-[#0B1F44] border-[#2A3858]' : 'bg-slate-100 border-slate-300'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'report'
                ? 'bg-[#D4AF37] text-[#0B1F44]'
                : isDarkMode
                ? 'text-[#A7B0C3] hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Report</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'summary'
                ? 'bg-[#D4AF37] text-[#0B1F44]'
                : isDarkMode
                ? 'text-[#A7B0C3] hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Summary</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ========================== OPTION 1: REPORT TAB ========================= */}
      {/* ========================================================================= */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          {/* Slider & Action Bar: Today, Week, Month, Custom Slider + Generate PDF & Excel */}
          <div
            className={`p-3 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {/* Slider: Today, Week, Month, Custom */}
            <div
              className={`p-1 rounded-xl flex items-center gap-1 border flex-wrap ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => setSliderPeriod('today')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                  sliderPeriod === 'today'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => setSliderPeriod('week')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                  sliderPeriod === 'week'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Week
              </button>

              <button
                type="button"
                onClick={() => setSliderPeriod('month')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                  sliderPeriod === 'month'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Month
              </button>

              <button
                type="button"
                onClick={() => setSliderPeriod('custom')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 ${
                  sliderPeriod === 'custom'
                    ? 'bg-[#D4AF37] text-[#0B1F44]'
                    : isDarkMode
                    ? 'text-[#A7B0C3] hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Custom</span>
              </button>
            </div>

            {/* Custom Date Pickers if Custom is active */}
            {sliderPeriod === 'custom' && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <input
                  type="date"
                  min={regDateStr}
                  max={todayStr}
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-xs outline-none font-semibold ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  min={customStartDate || regDateStr}
                  max={todayStr}
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-xs outline-none font-semibold ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            )}

            {/* TWO ACTION BUTTONS: GENERATE PDF & GENERATE EXCEL */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGeneratePdf}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-rose-600/25 active:scale-95"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Generate PDF</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateExcel}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-md"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Generate Excel</span>
              </button>
            </div>
          </div>

          {/* ================= 4 FINANCIAL KPIS ================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Net Profit */}
            <div
              className={`p-5 rounded-3xl border ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="text-[11px] font-bold text-[#D4AF37] block">Net Profit</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-[#D4AF37]">₹</span>
                <strong className={`text-2xl font-extrabold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <AnimatedCounter value={netProfit} />
                </strong>
              </div>
              <span className={`text-[10px] font-bold mt-1 block ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {marginPct}% Profit Margin
              </span>
            </div>

            {/* 2. Total Sales Collected */}
            <div
              className={`p-5 rounded-3xl border ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <span className={`text-[11px] font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Total Sales Collected
              </span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-[#D4AF37]">₹</span>
                <strong className={`text-2xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  <AnimatedCounter value={totalSalesCollected} />
                </strong>
              </div>
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mt-1 block`}>
                Gross Billed: ₹{grossSalesBilled.toLocaleString('en-IN')}
              </span>
            </div>

            {/* 3. Outstanding from Customers */}
            <div
              className={`p-5 rounded-3xl border ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="text-[11px] font-bold text-rose-400 block">Outstanding from Customers</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-rose-400">₹</span>
                <strong className="text-2xl font-extrabold text-rose-400">
                  <AnimatedCounter value={outstandingFromCustomers} />
                </strong>
              </div>
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mt-1 block`}>
                Pending & Unpaid Balances
              </span>
            </div>

            {/* 4. Total Expenses */}
            <div
              className={`p-5 rounded-3xl border ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="text-[11px] font-bold text-amber-500 block">Total Expenses</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-black text-amber-500">₹</span>
                <strong className="text-2xl font-extrabold text-amber-500">
                  <AnimatedCounter value={totalExpensesAmount} />
                </strong>
              </div>
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} mt-1 block`}>
                {reportExpenses.length} Expense Records Logged
              </span>
            </div>
          </div>

          {/* ================= PAYMENT SUMMARY ================= */}
          <div
            className={`p-6 rounded-3xl border space-y-4 ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Payment Summary
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                  Breakdown by collection channel and recorded volume
                </p>
              </div>
              <span className="text-xs font-black px-3 py-1 rounded-xl bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                Reconciled Ledger
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Zero Transactions */}
              <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-slate-400 block">Zero Transactions</span>
                <strong className={`text-lg font-black mt-1 block ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {paymentSummary.zeroTransactions}
                </strong>
                <span className="text-[10px] text-slate-500">Complimentary / Due</span>
              </div>

              {/* UPI Collected */}
              <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-sky-400 block">UPI Collected</span>
                <strong className={`text-lg font-black mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  ₹{paymentSummary.upiCollected.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-sky-400 font-bold">
                  {Math.round((paymentSummary.upiCollected / (paymentSummary.totalCollected || 1)) * 100)}% Share
                </span>
              </div>

              {/* Cash Collected */}
              <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-emerald-400 block">Cash Collected</span>
                <strong className={`text-lg font-black mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  ₹{paymentSummary.cashCollected.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-emerald-400 font-bold">
                  {Math.round((paymentSummary.cashCollected / (paymentSummary.totalCollected || 1)) * 100)}% Share
                </span>
              </div>

              {/* Card Collected */}
              <div className={`p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-cyan-400 block">Card Collected</span>
                <strong className={`text-lg font-black mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  ₹{paymentSummary.cardCollected.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-cyan-400 font-bold">
                  {Math.round((paymentSummary.cardCollected / (paymentSummary.totalCollected || 1)) * 100)}% Share
                </span>
              </div>

              {/* Total Collected */}
              <div className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0B1F44] border-[#D4AF37]/40' : 'bg-[#FFFDF5] border-[#D4AF37]'}`}>
                <span className="text-[10px] font-bold text-[#D4AF37] block">Total Collected</span>
                <strong className="text-lg font-black mt-1 block text-[#D4AF37]">
                  ₹{paymentSummary.totalCollected.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-[#D4AF37] font-extrabold">100% Volume</span>
              </div>
            </div>
          </div>

          {/* ================= DAY-WISE BREAKDOWN TABLE ================= */}
          <div
            className={`p-6 rounded-3xl border space-y-4 ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Day-Wise Performance Breakdown
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                  Daily sales, receipts, expenses, and net margins
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {dayWiseBreakdown.length} Active Days Recorded
              </span>
            </div>

            {dayWiseBreakdown.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No transactions recorded for {reportDateRange.label}.
              </div>
            ) : (
              <div className="overflow-x-auto [scrollbar-width:none]">
                <table className="w-full min-w-[520px] text-xs text-left">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-white/10 text-[#A7B0C3]' : 'border-slate-200 text-slate-600'}`}>
                      <th className="py-2.5 px-3 font-bold">Date</th>
                      <th className="py-2.5 px-3 font-bold text-center">Bills</th>
                      <th className="py-2.5 px-3 font-bold text-right">Gross Billed</th>
                      <th className="py-2.5 px-3 font-bold text-right">Sales Collected</th>
                      <th className="py-2.5 px-3 font-bold text-right">Expenses</th>
                      <th className="py-2.5 px-3 font-bold text-right">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dayWiseBreakdown.map((row) => (
                      <tr key={row.date} className="hover:bg-white/[0.02]">
                        <td className={`py-3 px-3 font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {row.date}
                        </td>
                        <td className={`py-3 px-3 text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {row.billsCount}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          ₹{row.gross.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-400">
                          ₹{row.collected.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-right text-amber-400">
                          ₹{row.expenses.toLocaleString('en-IN')}
                        </td>
                        <td className={`py-3 px-3 text-right font-black ${row.netProfit >= 0 ? 'text-[#D4AF37]' : 'text-rose-400'}`}>
                          ₹{row.netProfit.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================= STYLIST PERFORMANCE & SERVICE PERFORMANCE ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* STYLIST PERFORMANCE */}
            <div
              className={`lg:col-span-7 p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Stylist Performance & Commissions
                  </h3>
                  <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    Services delivered, sales generated, and commissions
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto [scrollbar-width:none]">
                <table className="w-full min-w-[520px] text-xs text-left">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-white/10 text-[#A7B0C3]' : 'border-slate-200 text-slate-600'}`}>
                      <th className="py-2.5 px-2 font-bold">Stylist</th>
                      <th className="py-2.5 px-2 font-bold text-center">Services</th>
                      <th className="py-2.5 px-2 font-bold text-center">Bills</th>
                      <th className="py-2.5 px-2 font-bold text-right">Revenue (₹)</th>
                      <th className="py-2.5 px-2 font-bold text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stylistPerformance.map((st) => (
                      <tr key={st.name} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-2">
                          <strong className={`block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{st.name}</strong>
                          <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{st.role}</span>
                        </td>
                        <td className={`py-2.5 px-2 text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {st.servicesDone}
                        </td>
                        <td className={`py-2.5 px-2 text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {st.billsCount}
                        </td>
                        <td className="py-2.5 px-2 text-right font-extrabold text-[#D4AF37]">
                          ₹{st.grossSales.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-emerald-400">
                          ₹{st.commissionEarned.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SERVICE PERFORMANCE */}
            <div
              className={`lg:col-span-5 p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Service Performance Ranking
                  </h3>
                  <p className={`text-xs ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                    Top services sold and revenue contributions
                  </p>
                </div>
              </div>

              {servicePerformance.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No services sold during this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {servicePerformance.slice(0, 7).map((srv, idx) => (
                    <div
                      key={srv.name}
                      className={`p-3 rounded-2xl border flex items-center justify-between ${
                        isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="w-5 h-5 rounded-lg bg-[#D4AF37]/20 text-[#D4AF37] font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 truncate">
                          <strong className={`text-xs font-bold block truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {srv.name}
                          </strong>
                          <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {srv.cat} · {srv.qty} sold
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <strong className="text-xs font-black text-[#D4AF37] block">
                          ₹{srv.revenue.toLocaleString('en-IN')}
                        </strong>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          {srv.sharePct}% share
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ========================== OPTION 2: SUMMARY TAB ======================== */}
      {/* ========================================================================= */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Summary Selectors: Choose Year & Choose Month */}
          <div
            className={`p-5 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3 flex-wrap">
              {/* CHOOSE YEAR */}
              <div>
                <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Choose Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-extrabold outline-none cursor-pointer ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* CHOOSE MONTH */}
              <div>
                <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Choose Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-extrabold outline-none cursor-pointer ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#D4AF37]' : 'bg-white border-slate-300 text-[#8C6239]'
                  }`}
                >
                  {availableMonths.map((m) => (
                    <option key={m.idx} value={m.idx}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* DOWNLOAD MONTHLY REPORT BUTTONS (PDF & EXCEL) */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={handleGenerateMonthlyPdf}
                className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-md"
                title="Generate printable monthly PDF statement"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                </svg>
                <span>Generate Monthly PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMonthlyReport}
                className="px-5 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 shadow-md"
                title="Download monthly Excel (.csv) spreadsheet"
              >
                <svg className="w-4 h-4 text-[#0B1F44]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Monthly Excel</span>
              </button>
            </div>
          </div>

          {/* Complete Performance Overview Banner */}
          <div
            className={`p-6 rounded-3xl border space-y-6 ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/5 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={`text-lg font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {monthNames[selectedMonth]} {selectedYear} Performance Summary
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#D4AF37]/20 text-[#D4AF37]">
                    Full Month Audit
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                  Consolidated monthly financials, customer volume, and average daily revenue
                </p>
              </div>

              <div className="text-right">
                <span className={`text-[10px] block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Month Days
                </span>
                <strong className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                  {daysInMonth} Days
                </strong>
              </div>
            </div>

            {/* 4 Executive Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[11px] font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Monthly Revenue
                </span>
                <strong className="text-xl font-black text-[#D4AF37] mt-1 block">
                  ₹{monthlySales.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-slate-500">Collected in minor units</span>
              </div>

              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[11px] font-bold text-amber-500 block">
                  Total Monthly Expenses
                </span>
                <strong className="text-xl font-black text-amber-500 mt-1 block">
                  ₹{monthlyExpenses.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-slate-500">{selectedMonthExpenses.length} Expense entries</span>
              </div>

              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[11px] font-bold text-emerald-400 block">
                  Net Monthly Profit
                </span>
                <strong className={`text-xl font-black mt-1 block ${monthlyNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ₹{monthlyNetProfit.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-emerald-400 font-bold">{monthlyMargin}% Net Margin</span>
              </div>

              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[11px] font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Bills Generated
                </span>
                <strong className={`text-xl font-black mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {monthlyBillsCount}
                </strong>
                <span className="text-[10px] text-slate-500">Completed checkouts</span>
              </div>
            </div>

            {/* Highlights: Top Stylist, Top Service, Average Daily Revenue */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-[#D4AF37] block">
                  Top Stylist of the Month
                </span>
                <strong className={`text-sm font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {topStylistOfMonth ? topStylistOfMonth.name : 'No records'}
                </strong>
                <span className="text-[11px] text-slate-400">
                  {topStylistOfMonth ? `₹${topStylistOfMonth.revenue.toLocaleString('en-IN')} revenue` : '—'}
                </span>
              </div>

              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-[#D4AF37] block">
                  Top Service of the Month
                </span>
                <strong className={`text-sm font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {topServiceOfMonth ? topServiceOfMonth.name : 'No records'}
                </strong>
                <span className="text-[11px] text-slate-400">
                  {topServiceOfMonth ? `${topServiceOfMonth.qty} delivered · ₹${topServiceOfMonth.revenue.toLocaleString('en-IN')}` : '—'}
                </span>
              </div>

              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-[#0F1C36] border-[#2A3858]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-bold text-slate-400 block">
                  Average Daily Revenue
                </span>
                <strong className={`text-sm font-extrabold mt-1 block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  ₹{avgDailyRevenue.toLocaleString('en-IN')} / day
                </strong>
                <span className="text-[11px] text-slate-400">
                  Customer Due: ₹{monthlyOutstanding.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Day-by-Day Monthly Trend Table */}
            <div>
              <h4 className={`text-sm font-extrabold mb-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Day-by-Day Revenue vs Expenses ({monthNames[selectedMonth]} {selectedYear})
              </h4>
              <div className="max-h-64 overflow-y-auto pr-1">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Revenue (₹)</th>
                      <th className="py-2 px-3 text-right">Expenses (₹)</th>
                      <th className="py-2 px-3 text-right">Daily Margin (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {monthlyDayBreakdown.map((d) => (
                      <tr key={d.day} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-3 font-semibold">
                          {d.day} {monthNames[selectedMonth]}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">
                          {d.sales > 0 ? `₹${d.sales.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-amber-400">
                          {d.expenses > 0 ? `₹${d.expenses.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className={`py-2 px-3 text-right font-bold ${d.netProfit >= 0 ? 'text-[#D4AF37]' : 'text-rose-400'}`}>
                          {d.sales > 0 || d.expenses > 0 || d.netProfit !== 0 ? `₹${d.netProfit.toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}