'use client';

import React, { useState } from 'react';
import { useSalon, Customer, Bill } from '@/components/SalonContext';
import { InvoiceTemplate } from '@/components/invoice-template';
import { buildOfficialWhatsAppBillMessage, openWhatsAppBill } from '@/lib/salon-helpers';

interface CustomersProps {
  onOpenAddClientModal?: () => void;
}

export function CustomersView({ onOpenAddClientModal }: CustomersProps) {
  const {
    customers,
    addCustomer,
    toggleCustomerVip,
    updateCustomer,
    deleteCustomer,
    markCustomerInactive,
    reactivateCustomer,
    importCustomers,
    settleCustomerDue,
    bills,
    setBills,
    createBill,
    editBill,
    loggedInStaffName,
    appointments,
    setCurrentScreen,
    setBillCustName,
    setBillCustPhone,
    shopProfile,
    showToast,
    isDarkMode,
    role,
    hasPermission,
    t,
  } = useSalon();

  const isStylist = role === 'stylist';
  const canClearDues = role === 'owner' || hasPermission('clear_dues');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'vip' | 'dues' | 'inactive'>('all');

  // Modals & Popovers
  const [showAddChoiceModal, setShowAddChoiceModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Three dots menu active customer id
  const [openMenuCustId, setOpenMenuCustId] = useState<string | null>(null);

  // Edit Customer Modal state
  const [editingCust, setEditingCust] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVip, setEditVip] = useState(false);
  const [editDue, setEditDue] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');

  // Invoice Preview Modal
  const [viewingBillInvoice, setViewingBillInvoice] = useState<Bill | null>(null);

  // Customer Visit History Modal (opened when touching client)
  const [historyCust, setHistoryCust] = useState<Customer | null>(null);
  const [openDetailMenu, setOpenDetailMenu] = useState(false);

  // Notes Modal state (opened when touching notes)
  const [notesCust, setNotesCust] = useState<Customer | null>(null);
  const [tempNotes, setTempNotes] = useState('');

  // Settle Due Modal state
  const [settlingDueCust, setSettlingDueCust] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMode, setSettleMode] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [clearAllDues, setClearAllDues] = useState<boolean>(true);

  // Manual Add Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDue, setFormDue] = useState<number>(0);
  const [formVip, setFormVip] = useState(false);
  const [formNotes, setFormNotes] = useState('');

  // Contacts Import State (Clean real device / file import, no dummy names)
  const [deviceContacts, setDeviceContacts] = useState<Array<{ name: string; phone: string; notes?: string }>>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // Native Device Contact Picker (supported on mobile browsers)
  const handlePickDeviceContacts = async () => {
    if (typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        let props = ['name', 'tel'];
        if ('getProperties' in (navigator as any).contacts) {
          try {
            const supported = await (navigator as any).contacts.getProperties();
            props = props.filter((p: string) => supported.includes(p));
          } catch {}
        }
        if (props.length === 0) props = ['name', 'tel'];

        const contacts = await (navigator as any).contacts.select(props, { multiple: true });
        if (contacts && contacts.length > 0) {
          const formatted = contacts.map((c: any) => {
            let name = 'Client';
            if (Array.isArray(c.name) && c.name.length > 0) {
              name = c.name[0] || 'Client';
            } else if (typeof c.name === 'string' && c.name.trim()) {
              name = c.name.trim();
            }

            let rawTel = '';
            if (Array.isArray(c.tel) && c.tel.length > 0) {
              rawTel = c.tel[0] || '';
            } else if (typeof c.tel === 'string') {
              rawTel = c.tel;
            }
            const cleanPhone = rawTel.replace(/\D/g, '').slice(-10);

            return {
              name: name.trim(),
              phone: cleanPhone.length >= 7 ? cleanPhone : rawTel.replace(/\D/g, ''),
              notes: 'Imported from phone contacts',
            };
          }).filter((c: any) => c.phone && c.phone.length >= 7);

          setDeviceContacts(formatted);
          setSelectedContacts(formatted.map((c: any) => c.phone));
          showToast(`Loaded ${formatted.length} contact(s) from device.`);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        showToast('Contact selection cancelled or permission denied.', 'error');
      }
    } else {
      showToast('Native Contact Picker is supported on mobile devices. You can also upload a .csv / .vcf contact file.', 'error');
    }
  };

  // Contacts file upload (.csv or .vcf)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      const parsed: Array<{ name: string; phone: string; notes?: string }> = [];
      const lines = text.split('\n');
      for (const line of lines) {
        const parts = line.split(/[,\t;]/);
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const phone = parts[1].replace(/\D/g, '').slice(-10);
          if (name && phone.length === 10) {
            parsed.push({ name, phone, notes: 'Imported via contact file' });
          }
        }
      }
      if (parsed.length > 0) {
        setDeviceContacts(parsed);
        setSelectedContacts(parsed.map((c) => c.phone));
        showToast(`Loaded ${parsed.length} contacts from file.`);
      } else {
        showToast('No valid name & 10-digit phone pairs found in file. Format: Name, Phone', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Split Active vs Inactive Customers
  const activeCustomers = customers.filter((c) => c.status !== 'inactive');
  const inactiveCustomers = customers.filter((c) => c.status === 'inactive');

  // KPI Calculations (based on active client base)
  const totalClients = activeCustomers.length;
  const vipCount = activeCustomers.filter((c) => c.vip).length;
  const totalDue = activeCustomers.reduce((sum, c) => sum + (c.due || 0), 0);
  const dueClientsCount = activeCustomers.filter((c) => (c.due || 0) > 0).length;
  const inactiveCount = inactiveCustomers.length;

  // Filtered Customers based on activeTab and searchTerm
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'inactive') {
      return c.status === 'inactive';
    }

    // Default tabs show active clients
    if (c.status === 'inactive') return false;

    if (activeTab === 'vip') return c.vip;
    if (activeTab === 'dues') return (c.due || 0) > 0;
    return true;
  });

  // Handle trigger phone contacts API or modal fallback
  const handleTriggerImportContacts = async () => {
    setShowAddChoiceModal(false);

    // Native Contacts Picker on mobile devices (Android Chrome, Edge, Samsung Internet)
    if (typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        let props = ['name', 'tel'];
        if ('getProperties' in (navigator as any).contacts) {
          try {
            const supported = await (navigator as any).contacts.getProperties();
            props = props.filter((p: string) => supported.includes(p));
          } catch (e) {
            console.warn('ContactsManager getProperties failed:', e);
          }
        }
        if (props.length === 0) props = ['name', 'tel'];

        // { multiple: true } allows selecting a single contact OR multiple contacts
        const deviceContacts = await (navigator as any).contacts.select(props, { multiple: true });

        if (deviceContacts && deviceContacts.length > 0) {
          const newClients = deviceContacts.map((c: any) => {
            let name = 'Client';
            if (Array.isArray(c.name) && c.name.length > 0) {
              name = c.name[0] || 'Client';
            } else if (typeof c.name === 'string' && c.name.trim()) {
              name = c.name.trim();
            }

            let rawTel = '';
            if (Array.isArray(c.tel) && c.tel.length > 0) {
              rawTel = c.tel[0] || '';
            } else if (typeof c.tel === 'string') {
              rawTel = c.tel;
            }

            const cleanPhone = rawTel.replace(/\D/g, '').slice(-10);

            return {
              name: name.trim(),
              phone: cleanPhone.length >= 7 ? cleanPhone : rawTel.replace(/\D/g, ''),
              vip: false,
              due: 0,
              notes: 'Imported from phone contacts',
              lastVisit: 'Never',
            };
          }).filter((c: any) => c.phone && c.phone.length >= 7);

          if (newClients.length > 0) {
            showToast(`Saving ${newClients.length} contact(s) to Supabase database...`);
            await importCustomers(newClients);
            return;
          } else {
            showToast('Selected contact had no valid mobile number.', 'error');
            return;
          }
        }
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User backed out or cancelled the picker
          return;
        }
        console.warn('Native contact picker error, opening import modal:', err);
      }
    }

    // Fallback for browsers without Contact Picker API (desktop or iOS Safari)
    setShowImportModal(true);
  };

  // Handle Manual Add Client Submit
  const handleSaveManualClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      showToast('Please enter both name and mobile number', 'error');
      return;
    }
    if (formPhone.replace(/\D/g, '').length < 10) {
      showToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    addCustomer({
      name: formName.trim(),
      phone: formPhone.replace(/\D/g, ''),
      vip: formVip,
      due: Number(formDue) || 0,
      notes: formNotes.trim(),
      lastVisit: 'Never',
    });

    setFormName('');
    setFormPhone('');
    setFormDue(0);
    setFormVip(false);
    setFormNotes('');
    setShowManualModal(false);
  };

  // Open Edit Client Modal
  const handleOpenEdit = (c: Customer) => {
    setEditingCust(c);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditVip(c.vip);
    setEditDue(c.due || 0);
    setEditNotes(c.notes || '');
    setOpenMenuCustId(null);
  };

  // Save Edit Client
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCust) return;
    if (!editName.trim() || !editPhone.trim()) {
      showToast('Name and mobile cannot be empty', 'error');
      return;
    }

    updateCustomer(editingCust.id, {
      name: editName.trim(),
      phone: editPhone.replace(/\D/g, ''),
      vip: editVip,
      due: Number(editDue) || 0,
      notes: editNotes.trim(),
    });

    if (historyCust && historyCust.id === editingCust.id) {
      setHistoryCust((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              phone: editPhone.replace(/\D/g, ''),
              vip: editVip,
              due: Number(editDue) || 0,
              notes: editNotes.trim(),
            }
          : null
      );
    }

    setEditingCust(null);
  };

  // Handle Contacts Import
  const handleImportContacts = async () => {
    if (selectedContacts.length === 0) {
      showToast('Please select at least one contact to import', 'error');
      return;
    }

    const toImport = deviceContacts
      .filter((sc) => selectedContacts.includes(sc.phone))
      .map((sc) => ({
        name: sc.name,
        phone: sc.phone,
        vip: false,
        due: 0,
        notes: sc.notes,
        lastVisit: 'Never',
      }));

    showToast(`Saving ${toImport.length} contact(s) to Supabase database...`);
    await importCustomers(toImport);
    setSelectedContacts([]);
    setDeviceContacts([]);
    setShowImportModal(false);
  };

  // Handle Due Settle
  const handleSettleDue = async () => {
    if (!settlingDueCust) return;
    if (!canClearDues) {
      showToast('Stylists do not have permission to clear client dues. Contact the salon owner or supervisor.', 'error');
      return;
    }
    const currentDue = settlingDueCust.due || 0;
    const payment = Math.max(0, Number(settleAmount));
    if (payment <= 0 && !clearAllDues) {
      showToast('Please enter a valid payment amount.', 'error');
      return;
    }

    await settleCustomerDue(settlingDueCust, payment, settleMode, clearAllDues);
    setSettlingDueCust(null);
  };

  // Get Bills & Visits for a specific customer
  const getCustomerBills = (c: Customer): Bill[] => {
    return bills.filter(
      (b) =>
        b.phone === c.phone ||
        b.cust.toLowerCase() === c.name.toLowerCase()
    );
  };

  return (
    <section className="space-y-6 animate-fadeIn pb-16">
      {/* ================= 3 TOP KPI CARDS ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Total Clients */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-md relative overflow-hidden group ${
            isDarkMode
              ? 'bg-[#121B33] border-[#2A3858] hover:border-[#2A3858]'
              : 'bg-white border-[#E2E8F0] shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#374151]'}`}>
                {t.allClients || 'Total Registered Clients'}
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tracking-tight ${isDarkMode ? 'text-[#F8FAFC]' : 'text-[#1F2937]'}`}>
                  {totalClients}
                </span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
                  ↑ Active
                </span>
              </div>
              <p className={`text-[11px] pt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}>
                Full salon client database ledger
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-xl" />
        </div>

        {/* KPI 2: VIP / MVP Customers */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-md relative overflow-hidden group ${
            isDarkMode
              ? 'bg-[#121B33] border-[#2A3858] hover:border-amber-500/30'
              : 'bg-white border-[#E2E8F0] shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#D4AF37] fill-[#D4AF37]" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                <span>VIP / MVP Clients</span>
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-[#D4AF37] tracking-tight">
                  {vipCount}
                </span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-300/80' : 'text-[#8C6239]'}`}>
                  ({Math.round((vipCount / Math.max(1, totalClients)) * 100)}% of total)
                </span>
              </div>
              <p className={`text-[11px] pt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}>
                High-spend loyalty regulars & priority booking
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[#D4AF37] flex items-center justify-center">
              <svg className="w-5 h-5 fill-amber-400" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-amber-500/5 rounded-full blur-xl" />
        </div>

        {/* KPI 3: Total Amount Due */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-md relative overflow-hidden group ${
            isDarkMode
              ? 'bg-[#121B33] border-[#2A3858] hover:border-rose-500/30'
              : 'bg-white border-[#E2E8F0] shadow-sm'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-rose-400' : 'text-[#DC2626]'}`}>
                Total Pending Dues
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tracking-tight ${totalDue > 0 ? (isDarkMode ? 'text-rose-400' : 'text-[#DC2626]') : (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')}`}>
                  ₹{totalDue.toLocaleString('en-IN')}
                </span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#374151]'}`}>
                  {dueClientsCount} {dueClientsCount === 1 ? 'client' : 'clients'}
                </span>
              </div>
              <p className={`text-[11px] pt-1 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}>
                {totalDue > 0 ? 'Outstanding client credit to collect' : 'All customer balances fully settled!'}
              </p>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
              totalDue > 0 ? 'bg-rose-500/10 border-rose-500/25 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-rose-500/5 rounded-full blur-xl" />
        </div>
      </div>

      {/* ================= CONTROLS & FILTER BAR ================= */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-white border-[#E2E8F0] shadow-sm'
        }`}
      >
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <svg
            className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by client name, mobile or preference notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#D4AF37] transition-all ${
    isDarkMode
      ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC] placeholder:text-[#737D92]'
      : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937] placeholder:text-[#4B5563]'
  }`}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${
                isDarkMode ? 'text-[#A7B0C3] hover:text-white' : 'text-slate-400 hover:text-slate-800'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'all'
                ? `bg-[#D4AF37] ${isDarkMode ? 'text-[#0B1F44]' : 'text-[#1F2937]'} shadow-md shadow-amber-400/20`
                : isDarkMode
                ? 'bg-[#1A2746] text-[#A7B0C3] hover:text-[#F8FAFC] border border-[#2A3858]'
                : 'bg-[#F7F9FC] text-[#374151] hover:text-[#1F2937] border border-[#E2E8F0]'
            }`}
          >
            {t.allClients || 'All Clients'} ({totalClients})
          </button>
          <button
            onClick={() => setActiveTab('vip')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
              activeTab === 'vip'
                ? `bg-[#D4AF37] ${isDarkMode ? 'text-[#0B1F44]' : 'text-[#1F2937]'} shadow-md shadow-amber-400/20`
                : isDarkMode
                ? 'bg-[#1A2746] text-[#A7B0C3] hover:text-[#F8FAFC] border border-[#2A3858]'
                : 'bg-[#F7F9FC] text-[#374151] hover:text-[#1F2937] border border-[#E2E8F0]'
            }`}
          >
            <svg className="w-3 h-3 text-[#D4AF37] fill-[#D4AF37]" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            <span>VIP / MVPs ({vipCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('dues')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
              activeTab === 'dues'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : isDarkMode
                ? 'bg-[#1A2746] text-[#A7B0C3] hover:text-[#F8FAFC] border border-[#2A3858]'
                : 'bg-[#F7F9FC] text-[#374151] hover:text-[#1F2937] border border-[#E2E8F0]'
            }`}
          >
            <svg className="w-3 h-3 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>With Dues ({dueClientsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('inactive')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
              activeTab === 'inactive'
                ? 'bg-slate-700 text-[#D4AF37] border border-[#D4AF37]/50 shadow-md'
                : isDarkMode
                ? 'bg-[#1A2746] text-[#A7B0C3] hover:text-[#F8FAFC] border border-[#2A3858]'
                : 'bg-[#F7F9FC] text-[#374151] hover:text-[#1F2937] border border-[#E2E8F0]'
            }`}
          >
            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Inactive Records ({inactiveCount})</span>
          </button>
        </div>

        {/* Action Button: Add Client (With Manual & Import options) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddChoiceModal(!showAddChoiceModal)}
            className="relative group px-4 sm:px-5 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#0B1F44] font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 border border-[#D4AF37] shrink-0 cursor-pointer"
          >
            <svg className="w-4 h-4 text-[#0B1F44]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span className="tracking-wide text-[11px] font-black">{t.addClient || 'Add Client'}</span>
            <svg className="w-3.5 h-3.5 text-[#0B1F44]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Add Choice Dropdown Popover */}
          {showAddChoiceModal && (
            <div className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl p-2 z-40 space-y-1 animate-fadeIn ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858]' : 'bg-[#FFFFFF] border-[#E2E8F0] shadow-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => {
                  setShowAddChoiceModal(false);
                  setShowManualModal(true);
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800/70 text-left flex items-center gap-3 transition-colors group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <strong className={`text-xs font-bold block group-hover:text-[#D4AF37] transition-colors ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                    Add Client Manually
                  </strong>
                  <span className={`text-[10px] block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}>
                    Full name, mobile, initial due & notes
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={handleTriggerImportContacts}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800/70 text-left flex items-center gap-3 transition-colors group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <strong className={`text-xs font-bold block group-hover:text-emerald-500 transition-colors ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                    {t.importContacts || 'Import from Contacts'}
                  </strong>
                  <span className={`text-[10px] block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#4B5563]'}`}>
                    Device contacts app (single or multiple)
                  </span>
                </div>
              </button>

              <div className={`pt-1 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-[#E2E8F0]'}`}>
                <button
                  type="button"
                  onClick={() => setShowAddChoiceModal(false)}
                  className="w-full py-1 text-center text-[10px] font-semibold text-[#737D92] hover:text-slate-300 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= COMPACT SQUARE CUSTOMER GRID (6 PER ROW) ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-2.5">
        {filteredCustomers.length === 0 ? (
          <div
            className={`col-span-full p-10 rounded-2xl border text-center space-y-3 ${
              isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#A7B0C3]' : 'bg-white border-slate-200 text-[#737D92]'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h4 className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>No clients found</h4>
            <p className={`text-xs font-bold max-w-sm mx-auto ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#0F172A]'}`}>
              No clients match &ldquo;{searchTerm}&rdquo;. Try adjusting your search term or add a new client to your CRM.
            </p>
            <button
              onClick={() => setShowManualModal(true)}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#0B1F44] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              + Add Client Manually
            </button>
          </div>
        ) : (
          <>
            {filteredCustomers.map((c) => {
              const hasDue = (c.due || 0) > 0;

              return (
                <div
                  key={c.id}
                  onClick={() => setHistoryCust(c)}
                  className={`p-2.5 sm:p-3 rounded-2xl border transition-all relative flex flex-col justify-between group cursor-pointer select-none min-h-[135px] sm:min-h-[145px] ${
                    c.vip
                      ? isDarkMode
                        ? 'bg-[#121B33] border-[#D4AF37]/50 hover:border-[#D4AF37] shadow-sm shadow-[#D4AF37]/10'
                        : 'bg-white border-[#D4AF37]/60 hover:border-[#D4AF37] shadow-xs ring-1 ring-[#D4AF37]/20'
                      : isDarkMode
                      ? 'bg-[#121B33] border-[#2A3858] hover:border-[#D4AF37]/60 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-[#D4AF37]/60 shadow-2xs'
                  }`}
                  title="Touch to view visit history & client ledger"
                >
                  {/* Top Row: VIP Star on Left, WhatsApp & Call on Right */}
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      title={c.vip ? 'VIP / MVP Client (Click to remove)' : 'Mark as VIP Client'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCustomerVip(c.id);
                      }}
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-transform active:scale-90 cursor-pointer ${
                        c.vip
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] shadow-xs'
                          : isDarkMode
                          ? 'bg-[#1A2746] border-[#2A3858] text-[#737D92] hover:text-[#D4AF37]'
                          : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-[#D4AF37]'
                      }`}
                    >
                      <svg
                        className={`w-3 h-3 ${c.vip ? 'fill-amber-400 text-[#D4AF37]' : 'fill-none stroke-current'}`}
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                        />
                      </svg>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={`WhatsApp ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg = encodeURIComponent(
                            `Hello ${c.name}! Greetings from ${shopProfile.shopName}. We hope to see you soon!`
                          );
                          window.open(`https://wa.me/91${c.phone}?text=${msg}`, '_blank');
                          showToast(`Opened WhatsApp chat for ${c.name}`);
                        }}
                        className="w-6 h-6 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
                      >
                        <svg className="w-3 h-3 fill-emerald-400" viewBox="0 0 24 24">
                          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        title={`Call ${c.name} (+91 ${c.phone})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`tel:+91${c.phone}`);
                        }}
                        className="w-6 h-6 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-400 flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Middle Content: Initials + Name + Phone + Notes */}
                  <div className="my-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div
                        className={`w-5 h-5 rounded-md border text-[9px] font-black flex items-center justify-center shrink-0 ${
                          c.vip
                            ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#D4AF37]'
                            : isDarkMode
                            ? 'bg-[#1A2746] border-[#2A3858] text-[#A7B0C3]'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <strong className={`text-xs font-bold truncate block ${isDarkMode ? 'text-white' : 'text-slate-900'} group-hover:text-[#D4AF37] transition-colors`}>
                        {c.name}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'} truncate font-mono text-[9px]`}>
                        +91 {c.phone}
                      </span>
                      {c.status === 'inactive' && (
                        <span className="text-[7px] px-1 py-0.2 rounded bg-slate-500/20 text-slate-400 font-bold uppercase tracking-wider">
                          Inactive
                        </span>
                      )}
                    </div>

                    {c.notes && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotesCust(c);
                          setTempNotes(c.notes || '');
                        }}
                        className={`mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium flex items-center gap-1 truncate cursor-pointer transition-colors ${
                          isDarkMode
                            ? 'bg-[#D4AF37]/10 text-[#EAE6D6] hover:bg-[#D4AF37]/20 border border-[#D4AF37]/20'
                            : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/60'
                        }`}
                        title={c.notes}
                      >
                        <span className="text-[#D4AF37] shrink-0 text-[9px]">📝</span>
                        <span className="truncate">{c.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Visits count on left, Spend/Due on right */}
                  <div className={`pt-1.5 border-t flex items-center justify-between text-[10px] ${isDarkMode ? 'border-white/10' : 'border-slate-100'}`}>
                    <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {c.visits ?? 0} {c.visits === 1 ? 'visit' : 'visits'}
                    </span>
                    {hasDue ? (
                      canClearDues ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSettlingDueCust(c);
                            setSettleAmount(c.due || 0);
                            setSettleMode('Cash');
                          }}
                          className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-black text-[10px] flex items-center gap-1 cursor-pointer transition-transform active:scale-95"
                          title="Click to clear or collect due"
                        >
                          <span>Due ₹{c.due}</span>
                          <span className="text-[9px] underline text-amber-400 font-bold">Clear</span>
                        </button>
                      ) : (
                        <span
                          className={`font-black text-[11px] px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-50 text-rose-600'}`}
                          title="Outstanding due balance (Stylists restricted from clearing dues)"
                        >
                          Due ₹{c.due}
                        </span>
                      )
                    ) : (
                      <span className="font-black text-[11px] text-[#D4AF37]">
                        ₹{(c.spend || 0).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* + Add Client Dashed Box */}
            <button
              type="button"
              onClick={() => setShowManualModal(true)}
              className={`p-2.5 sm:p-3 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 text-center cursor-pointer min-h-[135px] sm:min-h-[145px] group select-none ${
                isDarkMode
                  ? 'border-[#2A3858] hover:border-[#D4AF37] hover:bg-white/[0.02] text-slate-400 hover:text-white'
                  : 'border-slate-300 hover:border-amber-400 hover:bg-amber-50/40 text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-xs font-black tracking-tight">+ Add Client</span>
              <span className="text-[9px] opacity-70">Register new record</span>
            </button>
          </>
        )}
      </div>

      {/* ================= MODAL: CLIENT VISIT & BILLING HISTORY (TOUCHING CLIENT) ================= */}
      {historyCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`p-6 rounded-3xl border max-w-lg w-full space-y-4 shadow-2xl animate-scaleUp max-h-[90vh] flex flex-col ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'}`}>
            {/* Modal Header & Visibility Area */}
            <div className={`flex items-start justify-between border-b pb-3 shrink-0 ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl border text-sm font-black flex items-center justify-center shrink-0 ${
                    historyCust.vip
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#D4AF37]'
                      : isDarkMode
                      ? 'bg-[#1A2746] border-[#2A3858] text-slate-300'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {historyCust.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>{historyCust.name}</h3>
                    {historyCust.vip && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 font-black">
                        VIP MVP
                      </span>
                    )}
                    {historyCust.status === 'inactive' && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 font-black tracking-wider uppercase">
                        Inactive Record
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A7B0C3]">+91 {historyCust.phone}</p>
                </div>
              </div>

              {/* Action Buttons: Star VIP, Call, WhatsApp, Three-dot Menu, Close */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* STAR BUTTON FOR VIP */}
                <button
                  type="button"
                  title={historyCust.vip ? 'Remove VIP Status' : 'Mark as VIP Client'}
                  onClick={() => {
                    toggleCustomerVip(historyCust.id);
                    setHistoryCust((prev) => prev ? ({ ...prev, vip: !prev.vip }) : null);
                  }}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-transform active:scale-95 cursor-pointer ${
                    historyCust.vip
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#D4AF37]'
                      : isDarkMode
                      ? 'bg-[#121B33] border-[#2A3858] text-slate-400 hover:text-[#D4AF37]'
                      : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-[#B8863B]'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={historyCust.vip ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>

                {/* CALL BUTTON */}
                <button
                  type="button"
                  title={`Call ${historyCust.name} (+91 ${historyCust.phone})`}
                  onClick={() => window.open(`tel:+91${historyCust.phone}`)}
                  className="w-8 h-8 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/40 text-blue-400 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </button>

                {/* WHATSAPP BUTTON */}
                <button
                  type="button"
                  title={`WhatsApp message to ${historyCust.name}`}
                  onClick={() => {
                    const msg = encodeURIComponent(`Hello ${historyCust.name}! Greetings from ${shopProfile.shopName}. We hope to see you soon!`);
                    window.open(`https://wa.me/91${historyCust.phone}?text=${msg}`, '_blank');
                  }}
                  className="w-8 h-8 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-400 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 fill-emerald-400" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                  </svg>
                </button>

                {/* THREE-DOT MENU BUTTON (IN VISIBILITY AREA) */}
                <div className="relative">
                  <button
                    type="button"
                    title="Client options"
                    onClick={() => setOpenDetailMenu((prev) => !prev)}
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                      openDetailMenu
                        ? isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-200 border-slate-300 text-slate-900'
                        : isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#A7B0C3] hover:text-white' : 'bg-[#F7F9FC] border-[#E2E8F0] text-[#374151] hover:text-black'
                    }`}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {openDetailMenu && (
                    <div
                      className={`absolute right-0 mt-1.5 w-48 rounded-xl border p-1 z-30 animate-fadeIn ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858]' : 'bg-[#FFFFFF] border-[#E2E8F0]'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDetailMenu(false);
                          handleOpenEdit(historyCust);
                        }}
                        className={`w-full px-2.5 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${isDarkMode ? 'text-slate-200 hover:bg-slate-800 hover:text-[#D4AF37]' : 'text-[#1F2937] hover:bg-[#F7F9FC] hover:text-[#B8863B]'}`}
                      >
                        <svg className="w-3.5 h-3.5 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Edit Client</span>
                      </button>

                      {historyCust.status !== 'inactive' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDetailMenu(false);
                            markCustomerInactive(historyCust.id);
                            setHistoryCust((prev) => prev ? ({ ...prev, status: 'inactive' }) : null);
                            showToast(`Marked ${historyCust.name} as inactive`);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg hover:bg-amber-500/15 text-left text-xs font-semibold text-amber-400 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                          <span>Mark Inactive</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDetailMenu(false);
                            reactivateCustomer(historyCust.id);
                            setHistoryCust((prev) => prev ? ({ ...prev, status: 'active' }) : null);
                            showToast(`Reactivated ${historyCust.name}`);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg hover:bg-emerald-500/15 text-left text-xs font-semibold text-emerald-400 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Reactivate Client</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setOpenDetailMenu(false);
                          if (confirm(`Permanently remove ${historyCust.name} from CRM ledger?`)) {
                            deleteCustomer(historyCust.id);
                            setHistoryCust(null);
                          }
                        }}
                        className="w-full px-2.5 py-2 rounded-lg hover:bg-rose-500/15 text-left text-xs font-semibold text-rose-400 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Permanent Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* CLOSE BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    setHistoryCust(null);
                    setOpenDetailMenu(false);
                  }}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm cursor-pointer transition-colors shadow-sm ${
                    isDarkMode
                      ? 'bg-slate-800 hover:bg-slate-700 text-[#A7B0C3] hover:text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-300'
                  }`}
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ACTION OPTIONS: New Bill, Book Slot, WhatsApp, Chat (Marketing) */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
              {/* NEW BILL */}
              <button
                type="button"
                onClick={() => {
                  setBillCustName(historyCust.name);
                  setBillCustPhone(historyCust.phone);
                  setCurrentScreen('billing');
                  setHistoryCust(null);
                  showToast(`Pre-filled ${historyCust.name} for Express Billing!`);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border-[#D4AF37]/40 text-[#D4AF37]'
                    : 'bg-[#FEF3C7] hover:bg-[#FDE68A] border-[#D4AF37]/40 text-[#B8863B]'
                }`}
              >
                <svg className="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-[10px] font-extrabold tracking-tight">New Bill</span>
              </button>

              {/* BOOK SLOT */}
              <button
                type="button"
                onClick={() => {
                  setCurrentScreen('appointments');
                  setHistoryCust(null);
                  showToast(`Opening Calendar for ${historyCust.name}`);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                  isDarkMode
                    ? 'bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/40 text-blue-400'
                    : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-600'
                }`}
              >
                <svg className="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[10px] font-extrabold tracking-tight">Book Slot</span>
              </button>

              {/* WHATSAPP */}
              <button
                type="button"
                onClick={() => {
                  const msg = encodeURIComponent(`Hello ${historyCust.name}! Greetings from ${shopProfile.shopName}. We hope to see you soon!`);
                  window.open(`https://wa.me/91${historyCust.phone}?text=${msg}`, '_blank');
                  showToast(`Opened WhatsApp chat for ${historyCust.name}`);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                  isDarkMode
                    ? 'bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/40 text-emerald-400'
                    : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-600'
                }`}
              >
                <svg className="w-4 h-4 mb-1 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                </svg>
                <span className="text-[10px] font-extrabold tracking-tight">WhatsApp</span>
              </button>

              {/* CHAT (MARKETING) */}
              <button
                type="button"
                onClick={() => {
                  setCurrentScreen('whatsapp');
                  setHistoryCust(null);
                  showToast(`Opened WhatsApp Marketing for ${historyCust.name}`);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                  isDarkMode
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-400'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-600'
                }`}
              >
                <svg className="w-4 h-4 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-[10px] font-extrabold tracking-tight">Chat</span>
              </button>
            </div>

            {/* Quick Stats Banner: Visits, Lifetime Spend, Average Bill, Pending Due */}
            {(() => {
              const visitsCount = historyCust.visits || 0;
              const spendAmount = historyCust.spend || 0;
              const avgBill = visitsCount > 0 ? Math.round(spendAmount / visitsCount) : 0;
              const dueAmount = historyCust.due || 0;

              return (
                <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl border text-center shrink-0 ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#F7F9FC] border-[#E2E8F0]'}`}>
                  <div>
                    <span className="text-[9px] text-[#737D92] font-bold uppercase block">Visits</span>
                    <strong className={`text-xs sm:text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                      {visitsCount}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#737D92] font-bold uppercase block">Lifetime Spend</span>
                    <strong className="text-xs sm:text-sm font-extrabold text-[#D4AF37]">
                      ₹{spendAmount.toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#737D92] font-bold uppercase block">Average Bill</span>
                    <strong className={`text-xs sm:text-sm font-extrabold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      ₹{avgBill.toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#737D92] font-bold uppercase block">Pending Due</span>
                    <strong className={`text-xs sm:text-sm font-extrabold ${dueAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      ₹{dueAmount}
                    </strong>
                  </div>
                </div>
              );
            })()}

            {/* Quick Clear Due Banner if Outstanding Balance Exists */}
            {historyCust.due && historyCust.due > 0 ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-rose-400 font-bold text-xs">Unpaid Balance: ₹{historyCust.due}</span>
                </div>
                {canClearDues ? (
                  <button
                    type="button"
                    onClick={() => {
                      const c = historyCust;
                      setHistoryCust(null);
                      setSettlingDueCust(c);
                      setSettleAmount(c.due || 0);
                      setSettleMode('Cash');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs shadow-md transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Clear / Collect Due</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-semibold italic">
                    Restricted · Owner / Supervisor only
                  </span>
                )}
              </div>
            ) : null}

            {/* Client CRM Notes In Banner */}
            {historyCust.notes && (
              <div className="p-3 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-xs text-amber-300/90 flex items-start gap-2 shrink-0">
                <svg className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <div className="flex-1">
                  <strong className="text-[11px] font-bold text-[#D4AF37] block">Client CRM Preference:</strong>
                  <span>{historyCust.notes}</span>
                </div>
              </div>
            )}

            {/* Content Feed: Last Order + Order History */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-[160px]">
              {(() => {
                const customerBills = getCustomerBills(historyCust);
                const lastBill = customerBills.length > 0 ? customerBills[0] : null;

                return (
                  <>
                    {/* LAST ORDER CARD */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold flex items-center gap-1.5 ${isDarkMode ? 'text-[#D4AF37]' : 'text-[#B8863B]'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Last Order</span>
                        </h4>
                        {lastBill && (
                          <span className="text-[10px] text-[#737D92] font-semibold">{lastBill.dateStr}</span>
                        )}
                      </div>

                      {lastBill ? (
                        <div className={`p-3.5 rounded-2xl border space-y-2 ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#F7F9FC] border-[#E2E8F0]'}`}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <strong className={`font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>
                                #{lastBill.id}
                              </strong>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                lastBill.status === 'paid'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}>
                                {lastBill.status} ({lastBill.mode})
                              </span>
                            </div>
                            <span className="text-xs font-extrabold text-[#D4AF37]">
                              ₹{lastBill.total}
                            </span>
                          </div>

                          {/* Services in Last Order */}
                          <div className="space-y-1 pt-1.5 border-t border-[#2A3858]/60 text-xs">
                            {lastBill.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-[11px]">
                                <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                                  {it.name} × {it.qty}
                                </span>
                                <span className="text-[#A7B0C3]">
                                  ₹{it.price * it.qty}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-[#2A3858]/60">
                            <span className="text-[#A7B0C3]">Stylist: <strong className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>{lastBill.staff}</strong></span>
                            <div className="flex items-center gap-2">
                              {lastBill.notes && <span className="italic text-slate-400 text-[10px] truncate max-w-[120px]">{lastBill.notes}</span>}
                              <button
                                type="button"
                                onClick={() => setViewingBillInvoice(lastBill)}
                                className="text-[10px] font-bold text-[#D4AF37] hover:underline cursor-pointer"
                              >
                                View Invoice →
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={`p-3.5 rounded-2xl border text-center space-y-1.5 ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#F7F9FC] border-[#E2E8F0]'}`}>
                          <p className="text-xs text-[#A7B0C3]">No previous orders logged yet for {historyCust.name}.</p>
                        </div>
                      )}
                    </div>

                    {/* ORDER HISTORY LIST */}
                    <div className="space-y-2 pt-2">
                      <h4 className={`text-xs font-bold ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-600'}`}>
                        Order History ({customerBills.length})
                      </h4>

                      {customerBills.length === 0 ? (
                        <div className={`p-4 rounded-2xl border text-center space-y-2 ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#F7F9FC] border-[#E2E8F0]'}`}>
                          <p className="text-xs text-[#A7B0C3]">No historical invoices logged in system.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setBillCustName(historyCust.name);
                              setBillCustPhone(historyCust.phone);
                              setCurrentScreen('billing');
                              setHistoryCust(null);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-[#D4AF37] text-[#0B1F44] font-bold text-xs cursor-pointer hover:bg-[#C59F2E]"
                          >
                            Create First Bill
                          </button>
                        </div>
                      ) : (
                        customerBills.map((bill) => (
                          <div
                            key={bill.id}
                            className={`p-3 rounded-2xl border space-y-1.5 transition-colors ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#F7F9FC] border-[#E2E8F0]'}`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <strong className={`font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>#{bill.id}</strong>
                                <span className="text-[11px] text-[#A7B0C3]">{bill.dateStr}</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                bill.status === 'paid' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}>
                                {bill.status} ({bill.mode})
                              </span>
                            </div>

                            <div className="space-y-1 text-xs">
                              {bill.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{it.name} × {it.qty}</span>
                                  <span className="text-[#A7B0C3]">₹{it.price * it.qty}</span>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-between items-center text-xs pt-1 border-t border-[#2A3858]/60">
                              <span className="text-[11px] text-[#A7B0C3]">Stylist: <strong className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>{bill.staff}</strong></span>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-[#D4AF37]">₹{bill.total}</span>
                                <button
                                  type="button"
                                  onClick={() => setViewingBillInvoice(bill)}
                                  className="text-[10px] font-bold text-[#D4AF37] hover:underline cursor-pointer"
                                >
                                  View Invoice →
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer Actions: Edit Button, Inactive / Reactivate Button, Close Button */}
            <div className="flex gap-2 pt-3 border-t border-[#2A3858] shrink-0">
              {/* EDIT BUTTON */}
              <button
                type="button"
                onClick={() => {
                  handleOpenEdit(historyCust);
                }}
                className={`flex-1 py-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'bg-[#121B33] border-[#2A3858] text-[#D4AF37] hover:border-[#D4AF37]/50'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Edit Profile</span>
              </button>

              {/* INACTIVE / REACTIVATE BUTTON */}
              {historyCust.status === 'inactive' ? (
                <button
                  type="button"
                  onClick={() => {
                    reactivateCustomer(historyCust.id);
                    setHistoryCust((prev) => prev ? ({ ...prev, status: 'active' }) : null);
                    showToast(`Reactivated ${historyCust.name}`);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Reactivate</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    markCustomerInactive(historyCust.id);
                    setHistoryCust((prev) => prev ? ({ ...prev, status: 'inactive' }) : null);
                    showToast(`Marked ${historyCust.name} as inactive`);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-400 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <span>Mark Inactive</span>
                </button>
              )}

              {/* CLOSE BUTTON */}
              <button
                type="button"
                onClick={() => {
                  setHistoryCust(null);
                  setOpenDetailMenu(false);
                }}
                className={`px-4 py-2.5 rounded-xl border border-[#2A3858] text-xs font-semibold cursor-pointer transition-colors ${
                  isDarkMode ? 'text-slate-300 hover:text-white' : 'text-[#374151] hover:text-[#1F2937]'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT CLIENT CRM NOTES (TOUCHING NOTES) ================= */}
      {notesCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`p-6 rounded-3xl border max-w-sm w-full space-y-4 shadow-2xl animate-scaleUp ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>Client CRM Notes</h3>
                  <p className="text-[11px] text-[#A7B0C3]">{notesCust.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotesCust(null)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-[#A7B0C3] hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-300'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div>
              <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>
                Preferences, Haircut Style, Allergies or Notes
              </label>
              <textarea
                rows={4}
                placeholder="e.g. Skin fade cut, sensitive scalp, likes warm black tea, weekend appointments..."
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none transition-all ${isDarkMode ? 'placeholder-[#737D92]' : 'placeholder-[#4B5563]'} resize-none`}
              />
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-[#2A3858]">
              <button
                type="button"
                onClick={() => setNotesCust(null)}
                className={`flex-1 py-2 rounded-xl border border-[#2A3858] text-xs font-bold cursor-pointer ${isDarkMode ? 'text-slate-300 hover:text-white' : 'text-[#374151] hover:text-[#1F2937]'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateCustomer(notesCust.id, { notes: tempNotes.trim() });
                  setNotesCust(null);
                }}
                className={`flex-1 py-2 rounded-xl bg-[#D4AF37] text-xs font-extrabold ${isDarkMode ? 'text-[#0B1F44]' : 'text-[#1F2937]'} hover:brightness-105 cursor-pointer`}
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT CLIENT (FROM 3 DOTS) ================= */}
      {editingCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`p-6 rounded-3xl border max-w-md w-full space-y-4 shadow-2xl animate-scaleUp ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>Edit Client Details</h3>
                  <p className="text-[11px] text-[#A7B0C3]">{editingCust.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCust(null)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-[#A7B0C3] hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-300'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Mobile Number *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#D4AF37]">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                    className={`w-full pl-12 pr-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} font-mono focus:border-[#D4AF37] outline-none`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Outstanding Due Balance (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={editDue || ''}
                  onChange={(e) => setEditDue(Number(e.target.value))}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} font-mono focus:border-[#D4AF37] outline-none`}
                />
              </div>

              <div className="p-2.5 rounded-xl bg-[#121B33] border border-[#2A3858] flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[#D4AF37] fill-[#D4AF37]" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <span>VIP / MVP Client</span>
                </span>
                <input
                  type="checkbox"
                  checked={editVip}
                  onChange={(e) => setEditVip(e.target.checked)}
                  className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Client CRM Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none resize-none`}
                />
              </div>

              <div className={`flex gap-2.5 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setEditingCust(null)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    isDarkMode ? 'border-[#2A3858] text-slate-300 hover:text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-xs font-extrabold ${isDarkMode ? 'text-[#0B1F44]' : 'text-[#1F2937]'} cursor-pointer`}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD CLIENT MANUALLY ================= */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`p-6 rounded-3xl border max-w-md w-full space-y-4 shadow-2xl animate-scaleUp ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center text-sm">
                  <svg className="w-4 h-4 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>Add Client Manually</h3>
                  <p className="text-[11px] text-[#A7B0C3]">Register new customer to salon CRM ledger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-[#A7B0C3] hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-300'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveManualClient} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none transition-all ${isDarkMode ? 'placeholder-[#737D92]' : 'placeholder-[#4B5563]'}`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Mobile Number (WhatsApp) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#D4AF37]">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, ''))}
                    className={`w-full pl-12 pr-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} font-mono focus:border-[#D4AF37] outline-none transition-all ${isDarkMode ? 'placeholder-[#737D92]' : 'placeholder-[#4B5563]'}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Initial Due or Opening Balance (₹)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0 (if no pending balance)"
                  value={formDue || ''}
                  onChange={(e) => setFormDue(Number(e.target.value))}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none transition-all ${isDarkMode ? 'placeholder-[#737D92]' : 'placeholder-[#4B5563]'} font-mono`}
                />
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${isDarkMode ? 'bg-[#121B33] border-[#2A3858]' : 'bg-[#FFFDF5] border-[#D4AF37]/50'}`}>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#D4AF37] fill-[#D4AF37]" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <div>
                    <strong className={`text-xs font-black block ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>Mark as VIP / MVP Client</strong>
                    <span className={`text-[10px] font-bold block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#0F172A]'}`}>Priority service & gold highlight</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormVip(!formVip)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 cursor-pointer ${
                    formVip ? 'bg-[#D4AF37]' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-slate-950 transition-transform ${formVip ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className={`block text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-[#374151]'} mb-1.5 uppercase tracking-wider`}>Client Preference or Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Skin fade cut, prefers green tea, allergic to ammonia bleach..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs ${isDarkMode ? 'bg-[#121B33] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'} focus:border-[#D4AF37] outline-none transition-all ${isDarkMode ? 'placeholder-[#737D92]' : 'placeholder-[#4B5563]'} resize-none`}
                />
              </div>

              <div className={`flex gap-2.5 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    isDarkMode ? 'border-[#2A3858] text-slate-300 hover:text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2E] text-xs font-extrabold ${isDarkMode ? 'text-[#0B1F44]' : 'text-[#1F2937]'} shadow-md active:scale-98 transition-all cursor-pointer`}
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: IMPORT FROM CONTACTS ================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`p-6 rounded-3xl border max-w-lg w-full space-y-4 shadow-2xl animate-scaleUp ${isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#1F2937]'}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-[#1F2937]'}`}>Import from Contacts</h3>
                  <p className="text-[11px] text-[#A7B0C3]">Select contacts to import into StyleFleet CRM</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors shadow-sm ${
                  isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-[#A7B0C3] hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-300'
                }`}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-[#A7B0C3] pt-1">
              <span>{deviceContacts.length} contacts loaded</span>
              {deviceContacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedContacts.length === deviceContacts.length) {
                      setSelectedContacts([]);
                    } else {
                      setSelectedContacts(deviceContacts.map((c) => c.phone));
                    }
                  }}
                  className="text-[#D4AF37] font-bold hover:underline cursor-pointer"
                >
                  {selectedContacts.length === deviceContacts.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {/* Quick action buttons to load contacts from mobile phone or file */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pb-2">
              <button
                type="button"
                onClick={handlePickDeviceContacts}
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#0B1F44] border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                    : 'bg-[#FFFDF5] border-[#D4AF37] text-[#8C6239] hover:bg-[#FFF9E6]'
                }`}
              >
                <svg className="w-4 h-4 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Open Phone Contacts</span>
              </button>

              <label
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold cursor-pointer transition-all ${
                  isDarkMode
                    ? 'bg-[#0B1F44] border-white/10 text-white hover:border-[#D4AF37]/40'
                    : 'bg-white border-slate-300 text-[#0F172A] hover:border-[#D4AF37]'
                }`}
              >
                <svg className="w-4 h-4 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>Upload CSV / VCF File</span>
                <input
                  type="file"
                  accept=".csv,.vcf,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {deviceContacts.length === 0 ? (
                <div className={`p-6 rounded-2xl border text-center ${isDarkMode ? 'bg-[#0B1F44]/50 border-white/5 text-[#A7B0C3]' : 'bg-slate-50 border-slate-200 text-[#4B5563]'}`}>
                  <p className="text-xs font-semibold">
                    No contacts loaded yet. Tap &quot;Open Phone Contacts&quot; on your mobile phone or upload a contact file (.csv / .vcf) to import clients.
                  </p>
                </div>
              ) : (
                deviceContacts.map((contact) => {
                  const isSelected = selectedContacts.includes(contact.phone);
                  return (
                    <div
                      key={contact.phone}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedContacts(selectedContacts.filter((p) => p !== contact.phone));
                        } else {
                          setSelectedContacts([...selectedContacts, contact.phone]);
                        }
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50'
                          : isDarkMode
                          ? 'bg-[#121B33] border-[#2A3858] hover:border-[#D4AF37]/30'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-[#D4AF37] border-[#D4AF37] text-[#0B1F44]'
                              : 'border-[#2A3858] bg-transparent'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <strong className={`text-xs font-black block ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>{contact.name}</strong>
                          <span className={`text-[10px] font-bold block ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#0F172A]'}`}>+91 {contact.phone}</span>
                          {contact.notes && (
                            <span className={`text-[10px] block font-bold italic ${isDarkMode ? 'text-amber-300/70' : 'text-[#8C6239]'}`}>
                              {contact.notes}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-black ${isDarkMode ? 'text-[#A7B0C3]' : 'text-[#0F172A]'}`}>
                        {isSelected ? 'Selected' : 'Click to select'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className={`flex gap-2.5 pt-3 border-t ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isDarkMode ? 'border-[#2A3858] text-slate-300 hover:text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportContacts}
                disabled={selectedContacts.length === 0}
                className={`flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-md active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
              >
                Import {selectedContacts.length} Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: OFFICIAL LUXURY INVOICE ================= */}
      {viewingBillInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-3xl my-auto">
            <InvoiceTemplate
              bill={viewingBillInvoice}
              shopProfile={shopProfile}
              onClose={() => setViewingBillInvoice(null)}
              onShareWhatsApp={() => {
                const msg = buildOfficialWhatsAppBillMessage({
                  shopName: shopProfile.shopName || 'StyleFleet Salon',
                  shopPhone: shopProfile.phone || '',
                  upiId: shopProfile.upiId || '',
                  customerName: viewingBillInvoice.cust || 'Client',
                  invoiceNumber: viewingBillInvoice.id,
                  billId: viewingBillInvoice.id,
                  pdfUrl: (viewingBillInvoice as any).pdfUrl || (viewingBillInvoice as any).pdf_url,
                  totalAmount: viewingBillInvoice.total,
                  paidAmount: viewingBillInvoice.paidAmount,
                  dueAmount: viewingBillInvoice.dueAmount,
                  paymentMethod: viewingBillInvoice.mode || 'UPI',
                });
                openWhatsAppBill(viewingBillInvoice.phone, msg);
              }}
            />
          </div>
        </div>
      )}
      {/* ================= MODAL: COLLECT / CLEAR DUE PAYMENT ================= */}
      {settlingDueCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`p-6 rounded-3xl border max-w-md w-full space-y-5 shadow-2xl relative ${
              isDarkMode ? 'bg-[#1A2746] border-[#2A3858] text-[#F8FAFC]' : 'bg-white border-[#E2E8F0] text-[#1F2937]'
            }`}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkMode ? 'border-[#2A3858]' : 'border-slate-200'}`}>
              <div>
                <h3 className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Collect Client Due Payment
                </h3>
                <p className={`text-xs ${isDarkMode ? 'text-[#A7B0C3]' : 'text-slate-500'}`}>
                  {settlingDueCust.name} {settlingDueCust.phone ? `· +91 ${settlingDueCust.phone}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettlingDueCust(null)}
                className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Total Outstanding Due Badge */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
                  Total Outstanding Due
                </span>
                <span className="text-2xl font-black text-rose-500">
                  ₹{settlingDueCust.due || 0}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 block">Remaining Due</span>
                <span className="text-lg font-black text-[#D4AF37]">
                  ₹{clearAllDues ? 0 : Math.max(0, (settlingDueCust.due || 0) - (Number(settleAmount) || 0))}
                </span>
              </div>
            </div>

            {/* Amount Paid Now Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-black ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  Amount Paid Now (₹)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSettleAmount(settlingDueCust.due || 0);
                      setClearAllDues(true);
                    }}
                    className="text-[10px] font-bold text-[#D4AF37] hover:underline cursor-pointer"
                  >
                    Pay Full (₹{settlingDueCust.due})
                  </button>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-[#D4AF37]">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  value={settleAmount === 0 ? '' : settleAmount}
                  onChange={(e) => setSettleAmount(Math.max(0, Number(e.target.value)))}
                  placeholder="Enter amount paid (e.g. 150, 200, or full)"
                  className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border text-sm font-black outline-none transition-colors ${
                    isDarkMode
                      ? 'bg-[#0B1F44] border-[#2A3858] text-white focus:border-[#D4AF37]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-[#D4AF37]'
                  }`}
                  autoFocus
                />
              </div>

              {/* Clear All Dues Checkbox Toggle */}
              <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                clearAllDues
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : isDarkMode
                  ? 'bg-[#0B1F44] border-[#2A3858]'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <input
                  type="checkbox"
                  checked={clearAllDues}
                  onChange={(e) => setClearAllDues(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#D4AF37] focus:ring-0 cursor-pointer accent-[#D4AF37]"
                />
                <div className="flex-1">
                  <span className={`text-xs font-bold block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Clear all client dues completely (₹0 remaining)
                  </span>
                  <span className={`text-[10px] block leading-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {clearAllDues
                      ? `Accept ₹${settleAmount || 0} and write off any remaining debt so mobile & web show ₹0 balance.`
                      : `Only deduct ₹${settleAmount || 0}, leaving remaining ₹${Math.max(0, (settlingDueCust.due || 0) - (Number(settleAmount) || 0))} in credit.`}
                  </span>
                </div>
              </label>
            </div>

            {/* Payment Mode Selector: Cash / GPay / UPI / Card */}
            <div className="space-y-1.5">
              <label className={`text-xs font-black block ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Cash', 'UPI', 'Card'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSettleMode(m)}
                    className={`py-2 px-3 rounded-xl border text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      settleMode === m
                        ? 'bg-[#D4AF37] text-[#0B1F44] border-[#D4AF37] shadow-md shadow-amber-400/20'
                        : isDarkMode
                        ? 'bg-[#0B1F44] border-[#2A3858] text-slate-300 hover:text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:text-black'
                    }`}
                  >
                    <span>{m === 'UPI' ? 'GPay / UPI' : m}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSettlingDueCust(null)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  isDarkMode
                    ? 'border-white/10 hover:bg-white/5 text-slate-300'
                    : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSettleDue}
                disabled={!settleAmount || settleAmount <= 0}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Confirm Payment (₹{settleAmount})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
