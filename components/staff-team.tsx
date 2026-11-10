'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSalon, StaffMember } from '@/components/SalonContext';
import { matchStaffName } from '@/lib/salon-helpers';

type ReportInterval = 'day' | 'week' | 'month';

interface StaffTeamViewProps {
  onOpenAddStaff?: () => void;
}

export const StaffTeamView: React.FC<StaffTeamViewProps> = ({ onOpenAddStaff }) => {
  const {
    role,
    isDarkMode,
    staff,
    addStaff,
    updateStaff,
    deleteStaff,
    toggleStaffStatus,
    inviteStaffViaWhatsApp,
    bills,
    shopProfile,
    showToast,
  } = useSalon();

  // Performance Report Interval State: Day, Week, Month
  const [reportInterval, setReportInterval] = useState<ReportInterval>('day');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [showReportPreviewModal, setShowReportPreviewModal] = useState(false);
  const [editingStylist, setEditingStylist] = useState<StaffMember | null>(null);
  const [ratingStylist, setRatingStylist] = useState<StaffMember | null>(null);
  const [permissionsStylist, setPermissionsStylist] = useState<StaffMember | null>(null);

  // Form states for Add Stylist (Full name & 10-digit mobile)
  const [addFullName, setAddFullName] = useState('');
  const [addMobile, setAddMobile] = useState('');

  // Form states for Edit Stylist
  const [editFullName, setEditFullName] = useState('');
  const [editMobile, setEditMobile] = useState('');

  // Form state for Rating
  const [selectedRating, setSelectedRating] = useState('5.0');

  // Form state for Permissions
  const [stylistPerms, setStylistPerms] = useState<string[]>([]);

  // Vertical 3-dots action menu open tracker (stylist ID)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close 3-dots menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.team-menu-container')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Today ISO
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter bills based on Day, Week, Month
  const filteredBillsByInterval = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let start = new Date();
    if (reportInterval === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (reportInterval === 'week') {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (reportInterval === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
    }

    return bills.filter((b) => {
      if (b.isDeleted) return false;
      if (reportInterval === 'day' && b.isToday) return true;
      if (!b.dateStr) return reportInterval === 'day';
      const bDate = new Date(b.dateStr);
      if (isNaN(bDate.getTime())) return reportInterval === 'day';
      return bDate >= start && bDate <= today;
    });
  }, [bills, reportInterval]);

  // Aggregate stats per stylist (supports multi-stylist bills)
  const getStylistStats = (stylistName: string) => {
    const match = filteredBillsByInterval.filter(
      (b) => matchStaffName(b.staff, stylistName)
    );
    const servicesCount = match.reduce(
      (acc, b) => acc + (b.items?.reduce((iAcc, item) => iAcc + item.qty, 0) || 1),
      0
    );
    const billsCount = match.length;
    const rev = match.reduce((acc, b) => acc + (b.paidAmount || 0), 0);
    return { servicesCount, billsCount, rev };
  };

  // Overall totals for the performance box
  const totalBilledServices = useMemo(() => {
    return filteredBillsByInterval.reduce(
      (acc, b) => acc + (b.items?.reduce((iAcc, item) => iAcc + item.qty, 0) || 1),
      0
    );
  }, [filteredBillsByInterval]);

  const totalBilledRevenue = useMemo(() => {
    return filteredBillsByInterval.reduce((acc, b) => acc + (b.paidAmount || 0), 0);
  }, [filteredBillsByInterval]);

  // Handle Add Stylist Submit
  const handleAddStylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingStaff) return;
    const cleanMobile = addMobile.replace(/\D/g, '');
    if (!addFullName.trim()) {
      showToast('Please enter the stylist full name.', 'error');
      return;
    }
    if (cleanMobile.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }

    setIsSubmittingStaff(true);
    try {
      const res = await addStaff({
        name: addFullName.trim(),
        phone: cleanMobile,
        role: 'Stylist',
      });

      if (res && res.success === false) {
        return;
      }

      setAddFullName('');
      setAddMobile('');
      setShowAddModal(false);
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  // Open Edit Stylist Modal
  const handleOpenEdit = (st: StaffMember) => {
    setActiveMenuId(null);
    setEditingStylist(st);
    setEditFullName(st.name);
    setEditMobile(st.phone);
  };

  // Handle Edit Stylist Submit
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStylist) return;
    const cleanMobile = editMobile.replace(/\D/g, '');
    if (!editFullName.trim()) {
      showToast('Please enter a valid name.', 'error');
      return;
    }
    if (cleanMobile.length !== 10) {
      showToast('Please enter a 10-digit mobile number.', 'error');
      return;
    }

    updateStaff(editingStylist.id, {
      name: editFullName.trim(),
      phone: cleanMobile,
    });
    setEditingStylist(null);
  };

  // Open Rating Modal
  const handleOpenRating = (st: StaffMember) => {
    setActiveMenuId(null);
    setRatingStylist(st);
    setSelectedRating(st.rating || '5.0');
  };

  const handleSaveRating = () => {
    if (!ratingStylist) return;
    updateStaff(ratingStylist.id, { rating: selectedRating });
    showToast(`Rating for ${ratingStylist.name} updated to ${selectedRating} ⭐`);
    setRatingStylist(null);
  };

  const DEFAULT_STYLIST_PERMISSIONS = ['customers', 'sales', 'appointments', 'reminders'];

  const DAILY_WORK_PERMISSIONS = [
    { id: 'customers', label: 'Customers', desc: 'Client CRM & profiles' },
    { id: 'sales', label: 'Sales and Billing', desc: 'Create bills & accept payments' },
    { id: 'appointments', label: 'Appointments', desc: 'Appointment calendar & chair queue' },
    { id: 'reminders', label: 'Reminders and WhatsApp', desc: 'Client visit reminders & follow-ups' },
  ];

  const MONEY_TEAM_PERMISSIONS = [
    { id: 'expenses', label: 'Expenses', desc: 'Salon expenses, supplies, tea & petty cash' },
    { id: 'reports', label: 'Reports', desc: 'Business revenue, profits & financial audits' },
    { id: 'team', label: 'Team', desc: 'Manage staff members & roles' },
    { id: 'profile', label: 'Shop Profile', desc: 'Salon details, logo, timings & branding' },
    { id: 'clear_dues', label: 'Clear & Collect Dues', desc: 'Accept credit due payments & clear client debt' },
  ];

  const LIMITS_PERMISSIONS = [
    { id: 'past_expenses', label: 'Past Expenses', desc: 'Access historical expense ledgers beyond today' },
    { id: 'full_reports', label: 'Full Reports', desc: 'View store-wide reports beyond own chair stats' },
    { id: 'share_bills', label: 'Share Bills', desc: 'Share invoices via WhatsApp & export data' },
  ];

  const ALL_PERMISSIONS = [
    ...DAILY_WORK_PERMISSIONS,
    ...MONEY_TEAM_PERMISSIONS,
    ...LIMITS_PERMISSIONS,
  ];

  // Open Permissions Modal
  const handleOpenPermissions = (st: StaffMember) => {
    setActiveMenuId(null);
    setPermissionsStylist(st);
    setStylistPerms(st.permissions && st.permissions.length > 0 ? st.permissions : DEFAULT_STYLIST_PERMISSIONS);
  };

  const handleSavePermissions = () => {
    if (!permissionsStylist) return;
    updateStaff(permissionsStylist.id, { permissions: stylistPerms });
    try {
      window.dispatchEvent(new Event('storage'));
    } catch {}
    showToast(`Permissions updated for ${permissionsStylist.name}.`);
    setPermissionsStylist(null);
  };

  // Export to Excel / CSV (Excel compatible with UTF-8 BOM)
  const handleExportCSV = () => {
    let csv = `\uFEFFSTYLEFLEET SALON OS - STYLIST PERFORMANCE & COMMISSIONS\n`;
    csv += `Salon:,"${shopProfile?.shopName || 'StyleFleet Salon'}"\n`;
    csv += `Period:,"${reportInterval.toUpperCase()}"\n`;
    csv += `Generated:,"${new Date().toLocaleString('en-IN')}"\n\n`;

    const headers = ['Stylist Name', 'Role', 'Mobile Number', 'Chair', 'Rating', 'Services Delivered', 'Billed Revenue (INR)', 'Commission Rate (%)', 'Commission Earned (INR)', 'Net to Salon (INR)', 'Status'];
    const rows = staff.map((st) => {
      const stats = getStylistStats(st.name);
      const commRate = st.commissionRate || 15;
      const commEarned = Math.round((stats.rev * commRate) / 100);
      const netToSalon = Math.max(0, stats.rev - commEarned);

      return [
        `"${st.name}"`,
        `"${st.role || 'Stylist'}"`,
        `"+91 ${st.phone}"`,
        `"${st.chair || 'Main Floor'}"`,
        `"${st.rating || '5.0'}"`,
        stats.servicesCount,
        stats.rev,
        `${commRate}%`,
        commEarned,
        netToSalon,
        `"${st.status === 'inactive' ? 'Inactive' : st.invited ? 'Invited' : 'Active'}"`,
      ].join(',');
    });

    csv += [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stylist_performance_report_${reportInterval}_${todayIso}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Stylist Performance CSV exported successfully!');
  };

  // Download / Print PDF Report (Dedicated printable statement)
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      showToast('Popup blocker prevented PDF generation. Please allow popups.', 'error');
      return;
    }

    const totalRev = staff.reduce((acc, st) => acc + getStylistStats(st.name).rev, 0);
    const totalSvcs = staff.reduce((acc, st) => acc + getStylistStats(st.name).servicesCount, 0);
    const totalComm = staff.reduce((acc, st) => {
      const stats = getStylistStats(st.name);
      return acc + Math.round((stats.rev * (st.commissionRate || 15)) / 100);
    }, 0);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>StyleFleet Staff Performance - ${reportInterval.toUpperCase()}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 32px; margin: 0; }
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
            <div class="title">${shopProfile?.shopName || 'StyleFleet Salon'}</div>
            <div class="subtitle">Official Stylist ROI, Commission & Performance Statement · ${reportInterval.toUpperCase()}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: bold;">Date: ${new Date().toLocaleDateString('en-IN')}</div>
            <div style="font-size: 11px; color: #64748b;">Phone: +91 ${shopProfile?.phone || '9876543210'}</div>
          </div>
        </div>

        <div class="kpis">
          <div class="card">
            <div class="card-title">Total Staff</div>
            <div class="card-val">${staff.length} Stylists</div>
          </div>
          <div class="card">
            <div class="card-title">Total Staff Revenue</div>
            <div class="card-val gold">₹${totalRev.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Services Delivered</div>
            <div class="card-val">${totalSvcs} services</div>
          </div>
          <div class="card">
            <div class="card-title">Total Commissions</div>
            <div class="card-val">₹${totalComm.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div class="section-title">Stylist Roster & Commission Statement</div>
        <table>
          <thead>
            <tr>
              <th>Stylist Name</th>
              <th>Role & Station</th>
              <th>Mobile</th>
              <th class="text-right">Services</th>
              <th class="text-right">Billed Revenue (₹)</th>
              <th class="text-right">Comm. %</th>
              <th class="text-right">Commission (₹)</th>
              <th class="text-right">Net to Salon (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${staff.map(st => {
              const stats = getStylistStats(st.name);
              const commRate = st.commissionRate || 15;
              const commEarned = Math.round((stats.rev * commRate) / 100);
              const netToSalon = Math.max(0, stats.rev - commEarned);

              return `
                <tr>
                  <td><strong>${st.name}</strong></td>
                  <td>${st.role || 'Stylist'} · ${st.chair || 'Main Floor'}</td>
                  <td>+91 ${st.phone}</td>
                  <td class="text-right">${stats.servicesCount}</td>
                  <td class="text-right gold">₹${stats.rev.toLocaleString('en-IN')}</td>
                  <td class="text-right">${commRate}%</td>
                  <td class="text-right">₹${commEarned.toLocaleString('en-IN')}</td>
                  <td class="text-right">₹${netToSalon.toLocaleString('en-IN')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by StyleFleet Web Salon Management Platform · Official Team Audit
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 400);
    showToast('Stylist statement PDF generated!');
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Team & Stylists
              </h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                {staff.filter((s) => s.status !== 'inactive').length} Active
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Team roster, performance audits, WhatsApp invitations, ratings, and owner permissions
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black shadow-lg shadow-[#D4AF37]/25 active:scale-95 transition-all flex items-center gap-2 self-start sm:self-auto shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4 text-[#0B1F44]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Stylist</span>
        </button>
      </div>

      {/* 2. Top Box: Stylist Performance Report with Day / Week / Month Banner */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border transition-all shadow-md ${
          isDarkMode
            ? 'bg-[#121B33] border-[#D4AF37]/40'
            : 'bg-[#FFFDF7] border-[#D4AF37]/50'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-base font-black text-[#D4AF37] tracking-tight">
                Stylist Performance Report
              </h3>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
              Live services billed and revenue attribution for your salon team
            </p>
          </div>

          {/* Banner Tabs: Day, Week, Month */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-black/20 border border-white/10 shrink-0 self-start lg:self-auto">
            {(['day', 'week', 'month'] as ReportInterval[]).map((tab) => {
              const active = reportInterval === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setReportInterval(tab)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black capitalize transition-all cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37] text-[#0B1F44] shadow-md shadow-[#D4AF37]/25'
                      : isDarkMode
                      ? 'text-[#A7B0C3] hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'day' ? 'Day (Today)' : tab === 'week' ? 'Week' : 'Month'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Performance Metrics & Action Buttons */}
        <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
            <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-white border-slate-200'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                Services Billed ({reportInterval})
              </span>
              <strong className="text-xl font-black text-sky-400 block mt-1">
                {totalBilledServices} Services
              </strong>
              <span className={`text-[10px] block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                From {filteredBillsByInterval.length} invoices
              </span>
            </div>

            <div className={`p-3.5 rounded-2xl border ${isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-white border-slate-200'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                Total Billed Revenue
              </span>
              <strong className="text-xl font-black text-emerald-400 block mt-1">
                ₹ {totalBilledRevenue.toLocaleString()}
              </strong>
              <span className={`text-[10px] block ${isDarkMode ? 'text-[#737D92]' : 'text-slate-500'}`}>
                Net stylist collections
              </span>
            </div>

            <div className={`p-3.5 rounded-2xl border col-span-2 sm:col-span-1 ${isDarkMode ? 'bg-[#0B172E] border-[#D4AF37]/30' : 'bg-[#FFFDF5] border-[#D4AF37]/40'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] block">
                Active Stylists
              </span>
              <strong className={`text-xl font-black block mt-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {staff.filter((s) => s.status !== 'inactive').length} Members
              </strong>
              <span className="text-[10px] text-[#D4AF37]/80 font-semibold">
                Available in Roster
              </span>
            </div>
          </div>

          {/* Action Buttons: View Report, Excel Icon, PDF Icon */}
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            {/* View Report Button */}
            <button
              onClick={() => setShowReportPreviewModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black shadow-md shadow-[#D4AF37]/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>View Report</span>
            </button>

            {/* Excel Download Icon Button */}
            <button
              onClick={handleExportCSV}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-[#121B33] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-white border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 shadow-xs'
              }`}
              title="Download Excel / CSV Report"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>

            {/* PDF Download Icon Button */}
            <button
              onClick={handlePrintPDF}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-[#121B33] border-red-500/40 text-red-400 hover:bg-red-500/20'
                  : 'bg-white border-red-500/40 text-red-600 hover:bg-red-50 shadow-xs'
              }`}
              title="Download / Print PDF Report"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Team Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {staff.map((st) => {
          const stats = getStylistStats(st.name);
          const isInactive = st.status === 'inactive';
          const isInvited = !isInactive && st.invited;
          const isActive = !isInactive && !isInvited;

          return (
            <div
              key={st.id}
              className={`p-6 rounded-3xl border transition-all text-center space-y-4 shadow-lg relative group ${
                isInactive
                  ? isDarkMode
                    ? 'bg-[#0E1528] border-white/5 opacity-60'
                    : 'bg-slate-100 border-slate-300 opacity-60'
                  : isDarkMode
                  ? 'bg-[#121B33] border-[#2A3858] hover:border-[#D4AF37]/40'
                  : 'bg-white border-slate-200 hover:border-[#D4AF37]/60 shadow-sm'
              }`}
            >
              {/* Top Row: Status Badge and Vertical 3-Dot (Owner only) */}
              <div className="flex items-center justify-between">
                <div>
                  {isInactive ? (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30">
                      Inactive
                    </span>
                  ) : isInvited ? (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                      Invited
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active
                    </span>
                  )}
                </div>

                {/* Rating Pill */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                  <svg className="w-3 h-3 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <span>{st.rating || '5.0'}</span>
                </div>

                {/* Vertical 3-Dots Action Menu (Owner Only) */}
                {role === 'owner' && (
                  <div className="relative team-menu-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === st.id ? null : st.id);
                      }}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                        isDarkMode
                          ? 'border-white/10 hover:border-[#D4AF37] text-[#A7B0C3] hover:text-white'
                          : 'border-slate-300 hover:border-slate-400 text-slate-700 hover:text-black'
                      }`}
                      title="Manage Stylist"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>

                    {/* Popover Dropdown Menu */}
                    {activeMenuId === st.id && (
                      <div
                        className={`absolute right-0 top-9 w-44 rounded-2xl border shadow-2xl py-1.5 z-30 animate-fadeIn text-left ${
                          isDarkMode ? 'bg-[#0F1C36] border-[#2A3858] text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        {/* 1. Edit Stylist */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(st)}
                          className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                            isDarkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          <span>Edit Stylist</span>
                        </button>

                        {/* 2. Update Rating */}
                        <button
                          type="button"
                          onClick={() => handleOpenRating(st)}
                          className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                            isDarkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                          <span>Update Rating</span>
                        </button>

                        {/* 3. Stylist Permissions */}
                        <button
                          type="button"
                          onClick={() => handleOpenPermissions(st)}
                          className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                            isDarkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                          <span>Stylist Permissions</span>
                        </button>

                        {/* 4. Make Inactive / Reactivate */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            toggleStaffStatus(st.id);
                          }}
                          className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                            isInactive
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-amber-400 hover:bg-amber-500/10'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isInactive ? "M5 13l4 4L19 7" : "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"} />
                          </svg>
                          <span>{isInactive ? 'Make Active' : 'Make Inactive'}</span>
                        </button>

                        {/* 5. Delete Stylist */}
                        <div className="border-t border-white/10 my-1" />
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            deleteStaff(st.id);
                          }}
                          className="w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 text-red-400 hover:bg-red-500/10 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Avatar & Name */}
              <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] font-black text-lg flex items-center justify-center mx-auto shadow-inner group-hover:scale-105 transition-transform">
                {st.name.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <strong className={`text-base font-bold block ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                  {st.name}
                </strong>
                <span className={`text-xs block mt-0.5 font-mono ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                  +91 {st.phone}
                </span>
              </div>

              {/* Live Performance Stats for Selected Period */}
              <div
                className={`pt-3 border-t grid grid-cols-2 gap-2 text-xs ${
                  isDarkMode ? 'border-white/[0.06]' : 'border-slate-100'
                }`}
              >
                <div
                  className={`p-2 rounded-xl border ${
                    isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-[#F7F9FC] border-slate-200'
                  }`}
                >
                  <span className={`text-[10px] block font-medium ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#374151]'}`}>
                    Services ({reportInterval})
                  </span>
                  <strong className="text-sm text-sky-400 font-extrabold block mt-0.5">
                    {stats.servicesCount}
                  </strong>
                </div>

                <div
                  className={`p-2 rounded-xl border ${
                    isDarkMode ? 'bg-[#0B1F44] border-white/5' : 'bg-[#F7F9FC] border-slate-200'
                  }`}
                >
                  <span className={`text-[10px] block font-medium ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#374151]'}`}>
                    Revenue
                  </span>
                  <strong className="text-sm text-[#D4AF37] font-extrabold block mt-0.5">
                    ₹ {stats.rev.toLocaleString()}
                  </strong>
                </div>
              </div>

              {/* Invite via WhatsApp Button */}
              <button
                type="button"
                onClick={() => inviteStaffViaWhatsApp(st.id)}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                  st.invited
                    ? isDarkMode
                      ? 'bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25'
                      : 'bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                </svg>
                <span>{st.invited ? 'Invited (Resend)' : 'Invite via WhatsApp'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* ================= MODAL: ADD STYLIST (FULL NAME & 10-DIGIT MOBILE) ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-sm w-full space-y-4 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Add Stylist to Team
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 bg-white/5 text-[#A7B0C3] hover:text-white'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddStylistSubmit} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'} mb-1.5 uppercase tracking-wider`}>
                  Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-semibold outline-none transition-colors ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } focus:border-[#D4AF37]`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'} mb-1.5 uppercase tracking-wider`}>
                  10-Digit Mobile Number *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#D4AF37]">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit number"
                    value={addMobile}
                    onChange={(e) => setAddMobile(e.target.value.replace(/\D/g, ''))}
                    required
                    className={`w-full pl-12 pr-3.5 py-2.5 rounded-2xl border text-xs font-mono font-bold outline-none transition-colors ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } focus:border-[#D4AF37]`}
                  />
                </div>
              </div>

              <div className={`flex gap-3 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`flex-1 py-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode
                      ? 'border-white/10 text-[#A7B0C3] hover:text-white hover:bg-white/5'
                      : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStaff}
                  className="flex-1 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black shadow-lg shadow-[#D4AF37]/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingStaff ? 'Saving...' : 'Save Stylist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT STYLIST ================= */}
      {editingStylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-sm w-full space-y-4 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            <div className={`flex items-center justify-between pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Edit Stylist Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingStylist(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'} mb-1.5 uppercase tracking-wider`}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-semibold outline-none ${
                    isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  } focus:border-[#D4AF37]`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'} mb-1.5 uppercase tracking-wider`}>
                  10-Digit Mobile Number *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#D4AF37]">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, ''))}
                    required
                    className={`w-full pl-12 pr-3.5 py-2.5 rounded-2xl border text-xs font-mono font-bold outline-none ${
                      isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    } focus:border-[#D4AF37]`}
                  />
                </div>
              </div>

              <div className={`flex gap-3 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setEditingStylist(null)}
                  className={`flex-1 py-2.5 rounded-2xl border text-xs font-bold cursor-pointer transition-colors ${
                    isDarkMode
                      ? 'border-white/10 text-slate-300 hover:bg-white/5'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black cursor-pointer shadow-lg shadow-[#D4AF37]/25"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: UPDATE RATING ================= */}
      {ratingStylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-xs w-full space-y-4 shadow-2xl relative text-center ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            <div className={`flex items-center justify-between pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <h3 className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                Update Rating for {ratingStylist.name}
              </h3>
              <button
                type="button"
                onClick={() => setRatingStylist(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="py-2">
              <span className="text-3xl font-black text-amber-400 block">
                {selectedRating} / 5.0
              </span>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                Client review rating score
              </p>
            </div>

            {/* Quick Star Selection Chips */}
            <div className="grid grid-cols-5 gap-1.5">
              {['5.0', '4.9', '4.8', '4.5', '4.0'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRating(r)}
                  className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                    selectedRating === r
                      ? 'bg-[#D4AF37] border-[#D4AF37] text-[#0B1F44] shadow-md'
                      : isDarkMode
                      ? 'bg-[#121B33] border-[#2A3858] text-[#A7B0C3]'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className={`flex gap-2.5 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setRatingStylist(null)}
                className={`flex-1 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRating}
                className="flex-1 py-2 rounded-xl bg-[#D4AF37] text-[#0B1F44] text-xs font-black shadow-md cursor-pointer"
              >
                Save Rating
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: STYLIST PERMISSIONS ================= */}
      {permissionsStylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            {/* Header */}
            <div className={`flex items-start justify-between pb-2 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <div>
                <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                  Stylist Permissions
                </h3>
                <p className={`text-xs mt-0.5 leading-relaxed ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                  Choose what <strong>{permissionsStylist.name}</strong> can open in the app. Changes apply when they next open StyleFleet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsStylist(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer shrink-0 ml-2 transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Beautiful Permission Progress Card */}
            <div
              className={`p-4 rounded-2xl border space-y-3 ${
                isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-[10px] block uppercase font-black tracking-wider ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                    Access Scope
                  </span>
                  <span className="text-sm font-black text-[#D4AF37]">
                    {stylistPerms.length} of {ALL_PERMISSIONS.length} allowed
                  </span>
                </div>
                <span className="text-xs font-mono font-black text-yellow-400">
                  {Math.round((stylistPerms.length / ALL_PERMISSIONS.length) * 100)}%
                </span>
              </div>

              {/* Visual Progress Bar (Solid Yellow Bar - No Gradient) */}
              <div className="w-full h-2.5 rounded-full bg-black/25 overflow-hidden p-0.5 border border-white/5">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-yellow-400"
                  style={{ width: `${Math.round((stylistPerms.length / ALL_PERMISSIONS.length) * 100)}%` }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setStylistPerms(ALL_PERMISSIONS.map((p) => p.id))}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer transition-colors"
                >
                  Allow All
                </button>
                <button
                  type="button"
                  onClick={() => setStylistPerms([])}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 cursor-pointer transition-colors"
                >
                  Block All
                </button>
                <button
                  type="button"
                  onClick={() => setStylistPerms(DEFAULT_STYLIST_PERMISSIONS)}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg border border-sky-500/30 text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 cursor-pointer transition-colors"
                >
                  Default
                </button>
              </div>
            </div>

            {/* Division 1: Daily Work (Default Allowed) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Daily Work
                </span>
                <span className="text-[10px] text-emerald-400 font-black bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Default Allowed
                </span>
              </div>

              <div className="space-y-1.5">
                {DAILY_WORK_PERMISSIONS.map((perm) => {
                  const isChecked = stylistPerms.includes(perm.id);
                  return (
                    <div
                      key={perm.id}
                      onClick={() => {
                        if (isChecked) {
                          setStylistPerms(stylistPerms.filter((p) => p !== perm.id));
                        } else {
                          setStylistPerms([...stylistPerms, perm.id]);
                        }
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? isDarkMode
                            ? 'bg-[#121B33] border-[#D4AF37]/50 shadow-sm'
                            : 'bg-[#FFFDF7] border-[#D4AF37]/60 shadow-xs'
                          : isDarkMode
                          ? 'bg-[#0B172E] border-white/5 opacity-60'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="pr-3">
                        <span className={`text-xs font-black block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {perm.label}
                        </span>
                        <span className={`text-[10px] block mt-0.5 font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                          {perm.desc}
                        </span>
                      </div>
                      {/* iOS-style toggle switch */}
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                          isChecked ? 'bg-[#D4AF37]' : 'bg-slate-600/40'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Division 2: Money, Team, and Settings (Default Off / Sensitive) */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Money, Team, and Settings
                </span>
                <span className="text-[10px] text-amber-400 font-black bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  Default Off
                </span>
              </div>

              <div className="space-y-1.5">
                {MONEY_TEAM_PERMISSIONS.map((perm) => {
                  const isChecked = stylistPerms.includes(perm.id);
                  return (
                    <div
                      key={perm.id}
                      onClick={() => {
                        if (isChecked) {
                          setStylistPerms(stylistPerms.filter((p) => p !== perm.id));
                        } else {
                          setStylistPerms([...stylistPerms, perm.id]);
                        }
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? isDarkMode
                            ? 'bg-[#121B33] border-[#D4AF37]/50 shadow-sm'
                            : 'bg-[#FFFDF7] border-[#D4AF37]/60 shadow-xs'
                          : isDarkMode
                          ? 'bg-[#0B172E] border-white/5 opacity-60'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="pr-3">
                        <span className={`text-xs font-black block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {perm.label}
                        </span>
                        <span className={`text-[10px] block mt-0.5 font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                          {perm.desc}
                        </span>
                      </div>
                      {/* iOS-style toggle switch */}
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                          isChecked ? 'bg-[#D4AF37]' : 'bg-slate-600/40'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Division 3: Limits (Default Off / Sensitive) */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black text-sky-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Limits
                </span>
                <span className="text-[10px] text-sky-400 font-black bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                  Default Off
                </span>
              </div>

              <div className="space-y-1.5">
                {LIMITS_PERMISSIONS.map((perm) => {
                  const isChecked = stylistPerms.includes(perm.id);
                  return (
                    <div
                      key={perm.id}
                      onClick={() => {
                        if (isChecked) {
                          setStylistPerms(stylistPerms.filter((p) => p !== perm.id));
                        } else {
                          setStylistPerms([...stylistPerms, perm.id]);
                        }
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? isDarkMode
                            ? 'bg-[#121B33] border-[#D4AF37]/50 shadow-sm'
                            : 'bg-[#FFFDF7] border-[#D4AF37]/60 shadow-xs'
                          : isDarkMode
                          ? 'bg-[#0B172E] border-white/5 opacity-60'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="pr-3">
                        <span className={`text-xs font-black block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {perm.label}
                        </span>
                        <span className={`text-[10px] block mt-0.5 font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                          {perm.desc}
                        </span>
                      </div>
                      {/* iOS-style toggle switch */}
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                          isChecked ? 'bg-[#D4AF37]' : 'bg-slate-600/40'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className={`flex gap-3 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setPermissionsStylist(null)}
                className="flex-1 py-2.5 rounded-2xl border border-white/10 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="flex-1 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] text-xs font-black cursor-pointer shadow-lg shadow-[#D4AF37]/25"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: STYLIST PERFORMANCE REPORT PREVIEW ================= */}
      {showReportPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-2xl w-full space-y-4 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>
                  Stylist Performance Report Preview
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                  Period: <strong className="text-[#D4AF37] capitalize">{reportInterval}</strong> · {shopProfile.shopName}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>Excel (.csv)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>PDF / Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportPreviewModal(false)}
                  className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                    isDarkMode
                      ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                  }`}
                  aria-label="Close"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-white/10 text-[#A7B0C3]' : 'border-slate-200 text-slate-500'}`}>
                    <th className="py-2.5 px-3">Stylist</th>
                    <th className="py-2.5 px-3">Mobile</th>
                    <th className="py-2.5 px-3 text-center">Rating</th>
                    <th className="py-2.5 px-3 text-center">Services Billed</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {staff.map((st) => {
                    const stats = getStylistStats(st.name);
                    const isInactive = st.status === 'inactive';
                    return (
                      <tr key={st.id} className={isInactive ? 'opacity-50' : ''}>
                        <td className="py-3 px-3 font-bold">{st.name}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">+91 {st.phone}</td>
                        <td className="py-3 px-3 text-center text-amber-400 font-black">
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-3 h-3 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                            <span>{st.rating || '5.0'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-sky-400">{stats.servicesCount}</td>
                        <td className="py-3 px-3 text-right font-black text-emerald-400">₹ {stats.rev.toLocaleString()}</td>
                        <td className="py-3 px-3 text-center">
                          {isInactive ? (
                            <span className="text-[10px] font-bold text-slate-400">Inactive</span>
                          ) : st.invited ? (
                            <span className="text-[10px] font-bold text-sky-400">Invited</span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-400">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
              isDarkMode ? 'bg-[#0B172E] border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <span>Total Team Revenue ({reportInterval}): <strong className="text-emerald-400 font-black">₹ {totalBilledRevenue.toLocaleString()}</strong></span>
              <span>Total Services Billed: <strong className="text-sky-400 font-black">{totalBilledServices}</strong></span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};