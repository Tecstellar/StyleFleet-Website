'use client';

import React, { useState, useMemo } from 'react';
import { useSalon } from '@/components/SalonContext';
import { getSalesMetrics } from '@/lib/financial-metrics';

export const RemindersView: React.FC = () => {
  const {
    isDarkMode,
    appointments,
    customers,
    bills,
    expenses,
    shopProfile,
    showToast,
    setCurrentScreen,
  } = useSalon();

  // Local state to track which reminders have been clicked/dispatched during the session
  const [sentApptReminders, setSentApptReminders] = useState<Record<string, boolean>>({});
  const [sentDueFollowUps, setSentDueFollowUps] = useState<Record<string, boolean>>({});

  // Today ISO string
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // 1. RULE 1: APPOINTMENTS REQUIRING 3-HOUR REMINDER
  // Appointments scheduled for today that are confirmed or in chair
  const upcomingAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const isToday = a.date === todayIso || !a.date;
      return isToday && a.status !== 'Cancelled';
    });
  }, [appointments, todayIso]);

  // 2. RULE 2: CLIENTS WITH PENDING DUES (3-DAY FOLLOW-UP)
  // Gather customers with active due > 0 or bills with dueAmount > 0
  const clientsWithDues = useMemo(() => {
    const list: { id: string; name: string; phone: string; due: number; lastBilled?: string }[] = [];
    const seenPhones = new Set<string>();

    // From customers CRM
    customers.forEach((c) => {
      if (c.due && c.due > 0 && c.phone) {
        seenPhones.add(c.phone);
        list.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          due: c.due,
          lastBilled: c.lastVisit || 'Recent visit',
        });
      }
    });

    // From unpaid/partially paid bills
    bills.forEach((b) => {
      if (!b.isDeleted && b.dueAmount > 0 && b.phone && !seenPhones.has(b.phone)) {
        seenPhones.add(b.phone);
        list.push({
          id: b.id,
          name: b.cust,
          phone: b.phone,
          due: b.dueAmount,
          lastBilled: b.dateStr || 'Recent bill',
        });
      }
    });

    return list;
  }, [customers, bills]);

  // 3. RULE 3: DAY CLOSING SUMMARY METRICS (9:00 PM)
  const todayBills = useMemo(() => {
    return bills.filter((b) => !b.isDeleted && (b.isToday || b.dateStr === todayIso));
  }, [bills, todayIso]);

  const salesMetrics = useMemo(() => {
    return getSalesMetrics('Day', bills);
  }, [bills]);

  const todayGrossInflow = salesMetrics.today_revenue;
  const todayInvoicesCount = salesMetrics.today_invoices_count;
  const todayCashInflow = salesMetrics.paymentTotals.Cash;
  const todayUpiInflow = salesMetrics.paymentTotals.UPI;
  const todayCardInflow = salesMetrics.paymentTotals.Card;

  const todayExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.date === todayIso || !e.date)
      .reduce((acc, e) => acc + (e.amount || 0), 0);
  }, [expenses, todayIso]);

  const todayNetProfit = todayGrossInflow - todayExpenses;
  const todayNewDues = useMemo(() => {
    return todayBills.reduce((acc, b) => acc + (b.dueAmount || 0), 0);
  }, [todayBills]);

  // WhatsApp Handlers
  const handleSendApptReminder = (appt: (typeof upcomingAppointments)[0]) => {
    const rawPhone = appt.phone.replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const msg = encodeURIComponent(
      `Hello ${appt.cust}! Friendly reminder from ${shopProfile.shopName}: Your appointment is scheduled for today at ${appt.startsAt} for ${appt.service} with ${appt.staff}. Please let us know if you need any adjustments. Looking forward to seeing you!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    setSentApptReminders((prev) => ({ ...prev, [appt.id]: true }));
    showToast(`3-Hour appointment reminder dispatched for ${appt.cust}!`);
  };

  const handleSendDueReminder = (client: (typeof clientsWithDues)[0]) => {
    const rawPhone = client.phone.replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const msg = encodeURIComponent(
      `Dear ${client.name}, this is a gentle reminder from ${shopProfile.shopName} regarding your pending balance of ₹${client.due}. Kindly settle via UPI (${shopProfile.upiId || 'at our counter'}) at your convenience. Thank you for choosing us!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
    setSentDueFollowUps((prev) => ({ ...prev, [client.id]: true }));
    showToast(`3-Day payment due reminder dispatched to ${client.name}!`);
  };

  const handleSendDayClosingSummary = () => {
    const rawPhone = shopProfile.phone.replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const summaryText = encodeURIComponent(
      `*${shopProfile.shopName} - 9:00 PM DAY CLOSING AUDIT*\n` +
      `Date: ${todayIso}\n\n` +
      `• Total Invoices: ${todayInvoicesCount}\n` +
      `• Total Inflow: ₹${todayGrossInflow}\n` +
      `  - UPI: ₹${todayUpiInflow}\n` +
      `  - Cash: ₹${todayCashInflow}\n` +
      `  - Card: ₹${todayCardInflow}\n` +
      `• Operating Expenses: ₹${todayExpenses}\n` +
      `• Estimated Net Profit: ₹${todayNetProfit}\n` +
      `• New Pending Dues: ₹${todayNewDues}\n\n` +
      `Report automatically compiled by StyleFleet Salon OS at 9:00 PM.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${summaryText}`, '_blank');
    showToast('9:00 PM Day Closing summary prepared for WhatsApp delivery!');
  };

  return (
    <section className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Header Banner */}
      <div
        className={`p-6 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-md ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center font-black shadow-inner shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Salon Reminders & Automation
              </h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                Rule Engine
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              3-hour appointment notifications, 3-day payment due alerts, and daily 9:00 PM closing reconciliation
            </p>
          </div>
        </div>

        {/* Quick Screen Switch to Marketing */}
        <button
          onClick={() => setCurrentScreen('whatsapp')}
          className={`px-4 py-2 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto ${
            isDarkMode
              ? 'bg-[#142347] border-[#2A3858] text-[#A7B0C3] hover:text-white hover:border-[#D4AF37]/50'
              : 'bg-slate-50 border-slate-300 text-slate-700 hover:text-black'
          }`}
        >
          <span>WhatsApp Marketing →</span>
        </button>
      </div>

      {/* 2. Top Summary KPI Pill Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Rule 1 Badge */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-[#121B33] border-indigo-500/40' : 'bg-white border-indigo-500/40 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Rule 1: 3 Hours Before
            </span>
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
          <strong className={`text-xl block mt-1 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {upcomingAppointments.length} Appointments Today
          </strong>
          <span className={`text-[11px] block mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
            Scheduled 3h reminder alerts
          </span>
        </div>

        {/* Rule 2 Badge */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-[#121B33] border-amber-500/30' : 'bg-white border-amber-500/30 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
              Rule 2: Every 3 Days
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          </div>
          <strong className={`text-xl block mt-1 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {clientsWithDues.length} Pending Due Clients
          </strong>
          <span className={`text-[11px] block mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
            Follow-up cycle active
          </span>
        </div>

        {/* Rule 3 Badge */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isDarkMode
              ? 'bg-[#121B33] border-[#D4AF37]/40'
              : 'bg-[#FFFDF5] border-[#D4AF37]/50 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#D4AF37]">
              Rule 3: Daily 9:00 PM
            </span>
            <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          <strong className={`text-xl block mt-1 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Day Closing Audit Ready
          </strong>
          <span className={`text-[11px] block mt-0.5 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
            ₹{todayGrossInflow} revenue / ₹{todayExpenses} expenses
          </span>
        </div>
      </div>

      {/* ================= RULE 1: APPOINTMENT REMINDER (3 HOURS BEFORE) ================= */}
      <div
        className={`p-6 rounded-3xl border space-y-4 shadow-lg transition-all ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
        }`}
      >
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <h3 className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                1. Appointment Reminders (3 Hours Before)
              </h3>
            </div>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Mandatory reminder dispatched 3 hours before client appointment to minimize no-shows
            </p>
          </div>
          <span className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 bg-indigo-500/15 px-3 py-1 rounded-xl border border-indigo-500/30 self-start sm:self-auto">
            {upcomingAppointments.length} Active Today
          </span>
        </div>

        {upcomingAppointments.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              No appointments scheduled for today
            </p>
            <p className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
              When clients book appointments, 3-hour reminder alerts will automatically queue here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingAppointments.map((appt) => {
              const isSent = sentApptReminders[appt.id];
              return (
                <div
                  key={appt.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isDarkMode
                      ? 'bg-[#0B1F44] border-white/5 hover:border-indigo-500/40'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {appt.cust}
                      </strong>
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                        +91 {appt.phone}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-lg border border-indigo-500/30">
                        {appt.startsAt}
                      </span>
                    </div>
                    <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                      Service: <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{appt.service}</strong> · Stylist: <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{appt.staff}</strong>
                    </p>
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 flex items-center gap-1">
                      <span>•</span> 3-hour pre-service window active
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={() => handleSendApptReminder(appt)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer ${
                        isSent
                          ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                      </svg>
                      <span>{isSent ? 'Sent (Resend)' : 'Send WhatsApp Reminder'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= RULE 2: PAYMENT DUE FOLLOW-UP (EVERY 3 DAYS) ================= */}
      <div
        className={`p-6 rounded-3xl border space-y-4 shadow-lg transition-all ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-slate-200'
        }`}
      >
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider">
                2. Payment Due Follow-up (Every 3 Days)
              </h3>
            </div>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Recurring automated follow-up scheduled every 3 days until outstanding balance is resolved
            </p>
          </div>
          <span className="text-[11px] font-extrabold text-amber-400 bg-amber-400/10 px-3 py-1 rounded-xl border border-amber-400/20 self-start sm:self-auto">
            {clientsWithDues.length} Unpaid Receivables
          </span>
        </div>

        {clientsWithDues.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              Zero outstanding dues recorded
            </p>
            <p className={`text-[11px] ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
              All customer bills and balances are fully settled!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clientsWithDues.map((client) => {
              const isSent = sentDueFollowUps[client.id];
              return (
                <div
                  key={client.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isDarkMode
                      ? 'bg-[#0B1F44] border-white/5 hover:border-amber-500/30'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {client.name}
                      </strong>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border ${
                        isDarkMode ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-700 bg-slate-100 border-slate-300'
                      }`}>
                        +91 {client.phone}
                      </span>
                      <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        3-Day Cycle Due
                      </span>
                    </div>
                    <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                      Last Visit/Bill: {client.lastBilled}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="text-right">
                      <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>Pending Due</span>
                      <strong className={`text-base font-black block ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>
                        ₹ {client.due.toLocaleString()}
                      </strong>
                    </div>

                    <button
                      onClick={() => handleSendDueReminder(client)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer ${
                        isSent
                          ? 'bg-amber-600/30 border border-amber-500/40 text-amber-300'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                      </svg>
                      <span>{isSent ? 'Sent (Resend)' : 'Send 3-Day Notice'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= RULE 3: DAY CLOSING SUMMARY (9:00 PM) ================= */}
      <div
        className={`p-6 rounded-3xl border space-y-4 shadow-xl transition-all ${
          isDarkMode
            ? 'bg-[#121B33] border-[#D4AF37]/40'
            : 'bg-[#FFFDF7] border-[#D4AF37]/50 shadow-md'
        }`}
      >
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <h3 className="text-sm font-black text-[#D4AF37] uppercase tracking-wider">
                3. Day Closing Summary (Daily at 9:00 PM)
              </h3>
            </div>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Automated end-of-day register audit, collections breakdown, and net profit report
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleSendDayClosingSummary}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black shadow-lg shadow-[#D4AF37]/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-[#0B1F44]" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
              </svg>
              <span>Send 9 PM Summary to Owner</span>
            </button>
          </div>
        </div>

        {/* Closing Audit Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-white border-slate-200'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
              Today Bills
            </span>
            <strong className={`text-lg font-black block mt-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {todayInvoicesCount}
            </strong>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Invoices Generated</span>
          </div>

          <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-white border-slate-200'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
              Total Revenue
            </span>
            <strong className="text-lg font-black text-emerald-400 block mt-1">
              ₹ {todayGrossInflow.toLocaleString()}
            </strong>
            <span className={`text-[10px] block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
              UPI: ₹{todayUpiInflow} · Cash: ₹{todayCashInflow}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-white border-slate-200'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
              Today Expenses
            </span>
            <strong className="text-lg font-black text-red-400 block mt-1">
              ₹ {todayExpenses.toLocaleString()}
            </strong>
            <span className="text-[10px] text-red-400/80 font-semibold">Operational Payouts</span>
          </div>

          <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-[#D4AF37]/30' : 'bg-[#FFFDF5] border-[#D4AF37]/40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] block">
              Estimated Net Profit
            </span>
            <strong className={`text-lg font-black block mt-1 ${todayNetProfit >= 0 ? 'text-[#D4AF37]' : 'text-red-400'}`}>
              ₹ {todayNetProfit.toLocaleString()}
            </strong>
            <span className="text-[10px] text-[#D4AF37]/80 font-semibold">9 PM Balance</span>
          </div>
        </div>
      </div>
    </section>
  );
};