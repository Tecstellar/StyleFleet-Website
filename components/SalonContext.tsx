'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Language, TranslationDictionary, useTranslationHelper } from '@/lib/translations';
import { getShopPrefixFromShopName, formatInvoiceNumber } from '@/lib/salon-helpers';
import {
  fetchSalonDataFromDb,
  saveCustomerToDb,
  updateCustomerInDb,
  deleteCustomerInDb,
  saveAppointmentToDb,
  updateAppointmentStatusInDb,
  updateAppointmentInDb,
  deleteAppointmentInDb,
  saveBillToDb,
  deleteBillInDb,
  updateBillInDb,
  restoreBillInDb,
  saveExpenseToDb,
  updateExpenseInDb,
  deleteExpenseInDb,
  saveStaffMemberToDb,
  updateStaffMemberInDb,
  deleteStaffInDb,
  ensureSupabaseOwnerSession,
  saveServiceToDb,
  updateServiceInDb,
  deleteServiceInDb,
  toggleServiceActiveInDb,
  saveCategoryToDb,
  deleteCategoryInDb,
  renameCategoryInDb,
  updateShopProfileInDb,
  generateUuid,
  isValidUuid,
  bulkSaveCustomersToDb,
  verifyAccountActiveInDb,
  settleCustomerDueInDb,
} from '@/lib/supabase-service';

export interface ShopProfile {
  id?: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
  gstin: string;
  upiId: string;
  bookingHours: string;
  invoicePrefix: string;
  invoicePrefixFormat?: 'standard' | 'monthly' | 'yearly';
  logoImg: string;
  applyGst?: boolean;
  gstRate?: number;
  instagram?: string;
  facebook?: string;
  googleMaps?: string;
  latitude?: number;
  longitude?: number;
  gpsAddress?: string;
  createdAt?: string;
  subscription?: {
    plan?: string;
    status?: 'active' | 'expired' | 'trial';
    validUntil?: string;
  };
}

export interface ServiceItem {
  id: string;
  cat: string;
  name: string;
  price: number;
  dur: number;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  vip: boolean;
  visits: number;
  spend: number;
  due: number;
  notes?: string;
  lastVisit?: string;
  status?: 'active' | 'inactive';
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  rev: number;
  count: number;
  rating: string;
  chair: string;
  status?: 'active' | 'inactive';
  invited?: boolean;
  permissions?: string[];
  commissionRate?: number;
}

export interface Appointment {
  id: string;
  cust: string;
  phone: string;
  customerId?: string;
  service: string;
  staff: string;
  startsAt: string;
  date: string;
  amount: number;
  status: 'In chair' | 'Confirmed' | 'Done' | 'Cancelled';
  deletedBy?: string;
  deletedAt?: string;
}

export interface BillItem {
  name: string;
  price: number;
  qty: number;
  staff?: string;
}

export interface BillPayment {
  amount_minor: number;
  method: string;
  paid_at?: string;
}

export interface Bill {
  id: string;
  cust: string;
  phone: string;
  customerId?: string;
  dateStr: string;
  items: BillItem[];
  staff: string;
  total: number;
  paidAmount: number;
  dueAmount: number;
  mode: 'UPI' | 'Cash' | 'Card' | 'Partial Pay' | 'Fully Pending';
  status: 'paid' | 'partially_paid' | 'pending';
  isDeleted: boolean;
  isToday: boolean;
  isYesterday?: boolean;
  createdAt?: string;
  isEdited?: boolean;
  editedAt?: string;
  notes?: string;
  discount?: number;
  tax?: number;
  tip?: number;
  deletedAt?: string;
  deletedBy?: string;
  reminderStatus?: 'Not Sent' | 'Sent' | 'Pending';
  confirmationStatus?: 'Pending' | 'Confirmed';
  payments?: BillPayment[];
}

export interface Expense {
  id: string;
  cat: string;
  amount: number;
  note: string;
  pm: string;
  staff?: string | null;
  staffId?: string | null;
  inProfit: boolean;
  date: string;
  createdAt?: string;
}

interface SalonContextType {
  role: 'owner' | 'stylist';
  setRole: (role: 'owner' | 'stylist') => void;
  currentScreen: string;
  setCurrentScreen: (screen: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationDictionary;
  
  shopProfile: ShopProfile;
  updateShopProfile: (profile: Partial<ShopProfile>) => void;

  categories: string[];
  addCategory: (cat: string) => void;
  editCategory: (oldCat: string, newCat: string) => void;
  deleteCategory: (cat: string) => void;

  services: ServiceItem[];
  addService: (service: Omit<ServiceItem, 'id' | 'active'>) => void;
  addServices: (services: Array<Omit<ServiceItem, 'id' | 'active'>>) => Promise<number>;
  updateService: (id: string, updated: Partial<ServiceItem>) => void;
  deleteService: (id: string) => void;
  toggleServiceActive: (id: string) => void;
  bulkDeleteServices: (ids: string[]) => void;
  bulkUpdateServices: (ids: string[], updates: Partial<ServiceItem>) => void;

  customers: Customer[];
  addCustomer: (cust: { name: string; phone: string; vip?: boolean; due?: number; notes?: string; lastVisit?: string; status?: 'active' | 'inactive' }) => Customer;
  toggleCustomerVip: (id: string) => void;
  updateCustomer: (id: string, updated: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  markCustomerInactive: (id: string) => void;
  reactivateCustomer: (id: string) => void;
  importCustomers: (custs: Array<{ name: string; phone: string; vip?: boolean; due?: number; notes?: string; lastVisit?: string }>) => Promise<number>;
  settleCustomerDue: (cust: Customer, paymentAmount: number, paymentMode: 'Cash' | 'UPI' | 'Card', clearAllRemainingDues?: boolean) => Promise<void>;

  staff: StaffMember[];
  addStaff: (member: { name: string; phone: string; role?: string }) => Promise<{ success: boolean; id?: string; error?: string }>;
  updateStaff: (id: string, updated: Partial<StaffMember>) => Promise<boolean>;
  deleteStaff: (id: string) => Promise<boolean>;
  toggleStaffStatus: (id: string) => void;
  inviteStaffViaWhatsApp: (id: string) => void;

  appointments: Appointment[];
  addAppointment: (appt: Omit<Appointment, 'id'>) => void;
  updateAppointmentStatus: (id: string, status: Appointment['status']) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string, customDeletedBy?: string) => void;
  markArrivedAndBill: (appt: Appointment) => void;

  bills: Bill[];
  setBills: React.Dispatch<React.SetStateAction<Bill[]>>;
  createBill: (bill: Omit<Bill, 'id' | 'dateStr' | 'isDeleted' | 'isToday'>, customDateStr?: string, customIsToday?: boolean) => Bill;
  editBill: (id: string, updated: Partial<Bill>) => void;
  deleteBill: (id: string, customDeletedBy?: string) => void;
  restoreBill: (id: string) => void;

  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'date'> & { id?: string; date?: string }) => void;
  updateExpense: (id: string, updated: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  // Active Billing Cart
  billCartItems: BillItem[];
  billCustName: string;
  setBillCustName: (name: string) => void;
  billCustPhone: string;
  setBillCustPhone: (phone: string) => void;
  billStaffSelect: string;
  setBillStaffSelect: React.Dispatch<React.SetStateAction<string>>;
  billDiscount: number;
  setBillDiscount: (discount: number) => void;
  billPaymentMode: Bill['mode'];
  setBillPaymentMode: (mode: Bill['mode']) => void;
  partialPaidAmount: number;
  setPartialPaidAmount: (amt: number) => void;
  addCartItem: (service: { name: string; price: number; staff?: string }) => void;
  removeCartItem: (index: number) => void;
  updateCartItemQty: (index: number, qty: number) => void;
  clearCart: () => void;

  // Active Invoice View modal
  activeInvoice: Bill | null;
  setActiveInvoice: (bill: Bill | null) => void;

  toast: { message: string; type: 'success' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  isHydrated: boolean;
  isLoadingSalonData: boolean;
  currentShopId: string | null;
  setCurrentShopId: (id: string | null) => void;
  loggedInStaffName: string | null;
  setLoggedInStaffName: (name: string | null) => void;
  hasPermission: (permissionId: string) => boolean;
  currentStylistPermissions: string[];
}

const DEFAULT_SHOP_PROFILE: ShopProfile = {
  shopName: '',
  ownerName: '',
  phone: '',
  address: '',
  city: '',
  pinCode: '',
  gstin: '',
  upiId: '',
  bookingHours: '09:00 AM – 08:30 PM',
  invoicePrefix: 'INV-',
  logoImg: '',
};

const DEFAULT_STAFF: StaffMember[] = [];

const SalonContext = createContext<SalonContextType | undefined>(undefined);

export const SalonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<'owner' | 'stylist'>('owner');
  const [currentScreen, setCurrentScreen] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('stylefleet_app_language');
        if (saved && ['en', 'hi', 'ta', 'te', 'kn', 'ml'].includes(saved)) {
          return saved as Language;
        }
      } catch {}
    }
    return 'en';
  });

  useEffect(() => {
    try {
      localStorage.setItem('stylefleet_app_language', language);
    } catch {}
  }, [language]);

  const t = useMemo(() => useTranslationHelper(language), [language]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoadingSalonData, setIsLoadingSalonData] = useState(true);
  const [currentShopId, setCurrentShopId] = useState<string | null>(null);
  const [loggedInStaffName, setLoggedInStaffName] = useState<string | null>(null);

  const [shopProfile, setShopProfile] = useState<ShopProfile>(DEFAULT_SHOP_PROFILE);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3600);
  };

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        document.body.classList.remove('light');
        document.body.classList.add('dark');
        if (isHydrated) localStorage.setItem('stylefleet_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.body.classList.remove('dark');
        document.body.classList.add('light');
        if (isHydrated) localStorage.setItem('stylefleet_theme', 'light');
      }
    } catch {
      // Ignore if DOM unavailable
    }
  }, [isDarkMode, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_shop_profile', JSON.stringify(shopProfile));
    } catch {}
  }, [shopProfile, isHydrated]);

  const updateShopProfile = (updated: Partial<ShopProfile>) => {
    setShopProfile((prev) => {
      const merged = { ...prev, ...updated };
      try {
        localStorage.setItem('stylefleet_shop_profile', JSON.stringify(merged));
      } catch {}
      return merged;
    });
    if (currentShopId) {
      updateShopProfileInDb(currentShopId, updated);
    }
    showToast('Shop profile updated successfully');
  };

  const [categories, setCategories] = useState<string[]>([
    'Hair',
    'Beard',
    'Colour',
    'Care',
    'Packages',
  ]);

  const addCategory = (cat: string) => {
    const trimmed = (cat || '').trim();
    if (!trimmed || categories.some((c) => c.trim().toLowerCase() === trimmed.toLowerCase())) return;
    setCategories((prev) => [...prev, trimmed]);
    if (currentShopId) {
      saveCategoryToDb(currentShopId, trimmed);
    }
    showToast(`Category "${trimmed}" added!`);
  };

  const editCategory = (oldCat: string, newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed || trimmed.toLowerCase() === oldCat.toLowerCase()) return;
    setCategories((prev) => prev.map((c) => (c.toLowerCase() === oldCat.toLowerCase() ? trimmed : c)));
    setServices((prev) =>
      prev.map((s) => (s.cat.toLowerCase() === oldCat.toLowerCase() ? { ...s, cat: trimmed } : s))
    );
    if (currentShopId) {
      renameCategoryInDb(currentShopId, oldCat, trimmed);
    }
    showToast(`Category renamed to "${trimmed}"!`);
  };

  const deleteCategory = (cat: string) => {
    const target = cat.trim();
    setCategories((prev) => prev.filter((c) => c.toLowerCase() !== target.toLowerCase()));
    setServices((prev) =>
      prev.map((s) => (s.cat.toLowerCase() === target.toLowerCase() ? { ...s, cat: 'General' } : s))
    );
    if (!categories.some((c) => c.toLowerCase() === 'general')) {
      setCategories((prev) => [...prev, 'General']);
    }
    if (currentShopId) {
      deleteCategoryInDb(currentShopId, target);
    }
    showToast(`Category "${target}" deleted. Services moved to General.`);
  };

  const [services, setServices] = useState<ServiceItem[]>([]);

  const addService = (newService: Omit<ServiceItem, 'id' | 'active'>) => {
    const srvId = generateUuid();
    const s: ServiceItem = {
      ...newService,
      id: srvId,
      active: true,
    };
    setServices((prev) => [s, ...prev]);
    if (currentShopId) {
      saveServiceToDb(currentShopId, s);
    }
    showToast(`Service "${s.name}" added to price list.`);
  };

  const addServices = async (newServices: Array<Omit<ServiceItem, 'id' | 'active'>>): Promise<number> => {
    if (!newServices || newServices.length === 0) return 0;
    const createdItems: ServiceItem[] = newServices.map((it) => ({
      ...it,
      id: generateUuid(),
      active: true,
    }));

    // Update categories if new categories were extracted from the menu
    const newCats = new Set<string>();
    createdItems.forEach((s) => {
      if (s.cat && !categories.includes(s.cat)) {
        newCats.add(s.cat);
      }
    });
    if (newCats.size > 0) {
      setCategories((prev) => Array.from(new Set([...prev, ...Array.from(newCats)])));
    }

    setServices((prev) => [...createdItems, ...prev]);

    if (currentShopId) {
      for (const s of createdItems) {
        saveServiceToDb(currentShopId, s);
      }
    }

    showToast(`Successfully added ${createdItems.length} services to catalog!`, 'success');
    return createdItems.length;
  };

  const toggleServiceActive = (id: string) => {
    const target = services.find((s) => s.id === id);
    if (!target) return;
    const nextActive = !target.active;
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: nextActive } : s))
    );
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      toggleServiceActiveInDb(effectiveShopId, id, nextActive);
    }
  };

  const updateService = (id: string, updated: Partial<ServiceItem>) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updated } : s))
    );
    if (currentShopId) {
      updateServiceInDb(currentShopId, id, updated);
    }
    showToast('Service updated successfully.');
  };

  const deleteService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
    if (currentShopId) {
      deleteServiceInDb(currentShopId, id);
    }
    showToast('Service removed from menu.');
  };

  const bulkDeleteServices = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setServices((prev) => prev.filter((s) => !idSet.has(s.id)));
    if (currentShopId) {
      for (const id of ids) {
        deleteServiceInDb(currentShopId, id);
      }
    }
    showToast(`Deleted ${ids.length} services.`);
  };

  const bulkUpdateServices = (ids: string[], updates: Partial<ServiceItem>) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setServices((prev) =>
      prev.map((s) => (idSet.has(s.id) ? { ...s, ...updates } : s))
    );
    if (currentShopId) {
      for (const id of ids) {
        updateServiceInDb(currentShopId, id, updates);
      }
    }
    showToast(`Updated ${ids.length} services.`);
  };

  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_customers_db', JSON.stringify(customers));
    } catch {}
  }, [customers, isHydrated]);

  const addCustomer = ({
    name,
    phone,
    vip = false,
    due = 0,
    notes = '',
    lastVisit = 'Never',
    status = 'active',
  }: {
    name: string;
    phone: string;
    vip?: boolean;
    due?: number;
    notes?: string;
    lastVisit?: string;
    status?: 'active' | 'inactive';
  }) => {
    const custId = generateUuid();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const newCust: Customer = {
      id: custId,
      name: name.trim(),
      phone: cleanPhone || phone.trim(),
      vip,
      visits: 0,
      spend: 0,
      due: Number(due) || 0,
      notes: notes || '',
      lastVisit: lastVisit || 'Never',
      status: status || 'active',
    };
    setCustomers((prev) => [newCust, ...prev]);
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      saveCustomerToDb(effectiveShopId, newCust).then((savedId) => {
        if (savedId && savedId !== custId) {
          setCustomers((prev) =>
            prev.map((c) => (c.id === custId ? { ...c, id: savedId } : c))
          );
        }
      });
    }
    showToast(`Client "${name}" added to CRM!`);
    return newCust;
  };

  const toggleCustomerVip = (id: string) => {
    const target = customers.find((c) => c.id === id);
    if (!target) return;
    const newVip = !target.vip;
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, vip: newVip } : c))
    );
    showToast(newVip ? `⭐ ${target.name} marked as VIP / MVP!` : `${target.name} removed from VIP`);
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      updateCustomerInDb(
        effectiveShopId,
        id,
        { vip: newVip },
        { phone: target.phone, name: target.name }
      );
    }
  };

  const updateCustomer = (id: string, updated: Partial<Customer>) => {
    const existing = customers.find((c) => c.id === id);
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      const identifier = (existing && isValidUuid(existing.id))
        ? existing.id
        : (existing?.phone || updated.phone || existing?.name || id);
      updateCustomerInDb(effectiveShopId, identifier, {
        ...updated,
        phone: updated.phone || existing?.phone,
        name: updated.name || existing?.name,
      });
    }
    showToast('Client details updated');
  };

  const deleteCustomer = (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      deleteCustomerInDb(effectiveShopId, id);
    }
    showToast('Client permanently deleted from CRM');
  };

  const setCustomerActiveStatus = (id: string, nextStatus: 'active' | 'inactive') => {
    const target = customers.find((c) => c.id === id);
    const hasInactiveTag = nextStatus === 'active' && (target?.notes || '').includes('[inactive]');
    const cleanedNotes = hasInactiveTag ? target!.notes!.replace(/\[inactive\]\s*/g, '').trim() : undefined;

    setCustomers((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: nextStatus, ...(cleanedNotes !== undefined ? { notes: cleanedNotes } : {}) }
          : c
      )
    );

    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      updateCustomerInDb(
        effectiveShopId,
        id,
        { status: nextStatus, ...(cleanedNotes !== undefined ? { notes: cleanedNotes } : {}) },
        target ? { phone: target.phone, name: target.name } : undefined
      );
    }
    showToast(
      nextStatus === 'inactive'
        ? `${target?.name || 'Client'} moved to Inactive records`
        : `${target?.name || 'Client'} reactivated to Active CRM!`
    );
  };

  const markCustomerInactive = (id: string) => setCustomerActiveStatus(id, 'inactive');

  const reactivateCustomer = (id: string) => setCustomerActiveStatus(id, 'active');

  const importCustomers = async (
    newClients: Array<{ name: string; phone: string; vip?: boolean; due?: number; notes?: string; lastVisit?: string }>
  ): Promise<number> => {
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);

    const formattedList: Customer[] = newClients.map((nc) => {
      const cleanPhone = (nc.phone || '').replace(/\D/g, '').slice(-10);
      return {
        id: generateUuid(),
        name: (nc.name || 'Client').trim(),
        phone: cleanPhone,
        vip: !!nc.vip,
        visits: 0,
        spend: 0,
        due: Number(nc.due) || 0,
        notes: nc.notes || 'Imported from phone contacts',
        lastVisit: nc.lastVisit || 'Never',
        status: 'active' as const,
      };
    }).filter((c) => c.phone && c.phone.length >= 7);

    if (formattedList.length === 0) {
      showToast('No valid contacts to import', 'error');
      return 0;
    }

    // Deduplicate against state by phone
    setCustomers((prev) => {
      const existingPhones = new Set(prev.map((c) => c.phone.replace(/\D/g, '').slice(-10)));
      const novel = formattedList.filter((c) => !existingPhones.has(c.phone));
      return [...novel, ...prev];
    });

    if (effectiveShopId) {
      try {
        const res = await bulkSaveCustomersToDb(effectiveShopId, formattedList);
        if (res.success) {
          showToast(`Stored ${res.insertedCount} new clients in Supabase database!`);
          return res.insertedCount;
        } else {
          showToast(`Contacts saved locally (Supabase: ${res.error || 'notice'})`, 'error');
        }
      } catch (err: any) {
        console.error('[SalonContext] bulkSaveCustomersToDb error:', err);
        showToast('Contacts saved locally, cloud sync pending', 'error');
      }
    } else {
      showToast(`Imported ${formattedList.length} contacts locally!`);
    }

    return formattedList.length;
  };

  const [staff, setStaff] = useState<StaffMember[]>(DEFAULT_STAFF);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_staff_team_db', JSON.stringify(staff));
    } catch {}
  }, [staff, isHydrated]);

  const addStaff = async ({ name, phone, role: staffRole }: { name: string; phone: string; role?: string }): Promise<{ success: boolean; id?: string; error?: string }> => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const staffId = generateUuid();
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);

    let savedId = staffId;
    if (effectiveShopId) {
      const dbId = await saveStaffMemberToDb(effectiveShopId, { id: staffId, name: name.trim(), phone: cleanPhone, role: staffRole });
      if (!dbId) {
        showToast(`Could not save stylist "${name}" to the database. Please try again.`, 'error');
        return { success: false, error: 'Database save failed' };
      }
      savedId = dbId;
    }

    const newStaff: StaffMember = {
      id: savedId,
      name: name.trim(),
      role: staffRole?.trim() || 'Stylist',
      phone: cleanPhone || phone.trim(),
      rev: 0,
      count: 0,
      rating: '5.0',
      chair: 'Available',
      status: 'active',
      invited: false,
      permissions: ['customers', 'sales', 'appointments', 'reminders'],
    };

    setStaff((prev) => {
      if (prev.some((s) => s.id === savedId)) return prev;
      return [...prev, newStaff];
    });

    showToast(`Stylist "${name}" added to Team!`, 'success');
    return { success: true, id: savedId };
  };

  const updateStaff = async (id: string, updated: Partial<StaffMember>): Promise<boolean> => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    if (currentShopId) {
      await updateStaffMemberInDb(currentShopId, id, updated);
    }
    showToast('Stylist updated successfully.');
    return true;
  };

  const currentStylistMember = useMemo(() => {
    if (role !== 'stylist') return null;
    let session: any = null;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('stylefleet_auth_session');
        if (raw) session = JSON.parse(raw);
      } catch {}
    }
    const targetName = (loggedInStaffName || session?.staffName || session?.stylistName || '').trim().toLowerCase();
    const targetPhone = (session?.phone || '').replace(/\D/g, '').slice(-10);
    const targetId = session?.staffId;

    return (
      staff.find((s) => {
        if (targetId && s.id === targetId) return true;
        if (targetPhone && s.phone) {
          const cleanP = s.phone.replace(/\D/g, '').slice(-10);
          if (cleanP === targetPhone) return true;
        }
        if (targetName && s.name && s.name.trim().toLowerCase() === targetName) return true;
        return false;
      }) || (staff.length === 1 ? staff[0] : null)
    );
  }, [role, staff, loggedInStaffName]);

  const currentStylistPermissions = useMemo(() => {
    if (role !== 'stylist') {
      return [
        'customers',
        'sales',
        'appointments',
        'reminders',
        'expenses',
        'reports',
        'team',
        'profile',
        'past_expenses',
        'full_reports',
        'share_bills',
        'clear_dues',
      ];
    }
    if (currentStylistMember && currentStylistMember.permissions && currentStylistMember.permissions.length > 0) {
      return currentStylistMember.permissions;
    }
    return ['customers', 'sales', 'appointments', 'reminders'];
  }, [role, currentStylistMember]);

  const hasPermission = useCallback(
    (permissionId: string): boolean => {
      if (role !== 'stylist') return true;
      return currentStylistPermissions.includes(permissionId);
    },
    [role, currentStylistPermissions]
  );

  const deleteStaff = async (id: string): Promise<boolean> => {
    setStaff((prev) => prev.filter((s) => s.id !== id));
    if (currentShopId) {
      await deleteStaffInDb(currentShopId, id);
    }
    showToast('Stylist removed.');
    return true;
  };

  const toggleStaffStatus = (id: string) => {
    const target = staff.find((s) => s.id === id);
    if (!target) return;
    const nextStatus: 'active' | 'inactive' = target.status === 'inactive' ? 'active' : 'inactive';
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: nextStatus } : s))
    );
    const effectiveShopId =
      currentShopId ||
      shopProfile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);
    if (effectiveShopId) {
      updateStaffMemberInDb(effectiveShopId, id, { status: nextStatus });
    }
    showToast('Stylist status updated.');
  };

  const inviteStaffViaWhatsApp = (id: string) => {
    const target = staff.find((s) => s.id === id);
    if (!target) return;
    const cleanPhone = target.phone.replace(/\D/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `Hello ${target.name}! You are invited to join ${shopProfile.shopName} on StyleFleet Salon OS. Access your schedule & express billing here: https://stylefleet.app/`
    );
    window.open(`https://wa.me/${phoneWithCode}?text=${msg}`, '_blank');
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, invited: true } : s))
    );
    showToast(`WhatsApp invitation dispatched to ${target.name}!`);
  };

  const getContextTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_appointments_db', JSON.stringify(appointments));
    } catch {}
  }, [appointments, isHydrated]);

  const addAppointment = (newAppt: Omit<Appointment, 'id'>) => {
    const apptId = generateUuid();
    let apptStaff = (newAppt.staff || '').trim();
    if (apptStaff === 'Karthik' || !apptStaff) {
      apptStaff = staff.length > 0 ? staff[0].name : (shopProfile?.ownerName || 'Stylist');
    }
    const a: Appointment = {
      ...newAppt,
      staff: apptStaff,
      id: apptId,
    };
    setAppointments((prev) => [a, ...prev]);
    if (currentShopId) {
      saveAppointmentToDb(currentShopId, a, apptId);
    }
    showToast(`Appointment booked for ${a.cust} at ${a.startsAt}!`);
  };

  const updateAppointmentStatus = (id: string, status: Appointment['status']) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    if (currentShopId) {
      const audit = {
        role: role === 'stylist' ? ('stylist' as const) : ('owner' as const),
        name: role === 'stylist' && loggedInStaffName ? loggedInStaffName : (shopProfile.ownerName || 'Owner'),
      };
      updateAppointmentStatusInDb(currentShopId, id, status, audit);
    }
    showToast(`Appointment marked as ${status}.`);
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
    if (currentShopId) {
      updateAppointmentInDb(currentShopId, id, updates);
    }
    showToast('Appointment updated successfully!', 'success');
  };

  const deleteAppointment = (id: string, customDeletedBy?: string) => {
    const nowIso = new Date().toISOString();
    const deletedByName = customDeletedBy || (role === 'stylist' && loggedInStaffName ? `${loggedInStaffName} (Stylist)` : (shopProfile?.ownerName || 'Owner'));
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'Cancelled', deletedAt: nowIso, deletedBy: deletedByName } : a))
    );
    if (currentShopId) {
      deleteAppointmentInDb(currentShopId, id, deletedByName);
    }
    showToast(`Appointment cancelled & deleted by ${deletedByName}.`, 'success');
  };

  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_bills_db', JSON.stringify(bills));
    } catch {}
  }, [bills, isHydrated]);

  const createBill = (billData: Omit<Bill, 'id' | 'dateStr' | 'isDeleted' | 'isToday'>, customDateStr?: string, customIsToday?: boolean) => {
    const now = new Date();
    const defaultDateStr = `${now.getDate()} ${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dateStr = customDateStr || defaultDateStr;
    const isToday = customIsToday !== undefined ? customIsToday : true;
    const prefixToUse = shopProfile.invoicePrefix || getShopPrefixFromShopName(shopProfile.shopName);
    const billId = formatInvoiceNumber(
      prefixToUse,
      shopProfile.invoicePrefixFormat || 'standard',
      bills.length + 1,
      now
    );

    let billStaff = (billData.staff || '').trim();
    if (billStaff === 'Karthik' || !billStaff) {
      billStaff = staff.length > 0 ? staff[0].name : (shopProfile?.ownerName || 'Stylist');
    }

    const newBill: Bill = {
      ...billData,
      staff: billStaff,
      id: billId,
      dateStr,
      isDeleted: false,
      isToday,
      isEdited: false,
    };

    setBills((prev) => [newBill, ...prev]);
    if (currentShopId) {
      saveBillToDb(currentShopId, { ...newBill, invoiceNumber: billId });
    }

    // Update customer spend / due if exists, or auto-add walk-in to customers if a valid name is provided
    setCustomers((prev) => {
      const exists = prev.find((c) => (billData.phone && c.phone === billData.phone) || (billData.cust && c.name.toLowerCase() === billData.cust.toLowerCase()));
      if (exists) {
        const newDue = (exists.due || 0) + billData.dueAmount;
        const newSpend = (exists.spend || 0) + billData.paidAmount;
        if (currentShopId) {
          const identifier = (exists.id && isValidUuid(exists.id)) ? exists.id : (exists.phone || billData.phone || exists.name);
          // saveBillToDb authoritatively reconciles outstanding_due_minor in Supabase from bills table.
          // Omit due here to prevent double-increment race conditions.
          updateCustomerInDb(currentShopId, identifier, {
            spend: newSpend,
            phone: exists.phone || billData.phone,
            name: exists.name,
          });
        }
        return prev.map((c) => {
          if (c.id === exists.id) {
            return {
              ...c,
              spend: newSpend,
              due: newDue,
              visits: (c.visits || 0) + 1,
              lastVisit: 'Today',
            };
          }
          return c;
        });
      } else if (billData.cust && billData.cust.trim() !== 'Walk-in Client' && billData.cust.trim() !== '') {
        const newC: Customer = {
          id: `c-${Date.now()}`,
          name: billData.cust.trim(),
          phone: billData.phone || '',
          vip: false,
          visits: 1,
          spend: billData.paidAmount,
          due: billData.dueAmount,
          lastVisit: 'Today',
          status: 'active',
        };
        return [newC, ...prev];
      }
      return prev;
    });

    showToast(`Bill #${billId} generated successfully!`);
    return newBill;
  };

  const editBill = (id: string, updated: Partial<Bill>) => {
    const now = new Date();
    const editedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updated, isEdited: true, editedAt: editedTime } : b))
    );
    if (currentShopId) {
      updateBillInDb(currentShopId, id, updated);
    }
    showToast(`Bill #${id} updated successfully.`);
  };

  const deleteBill = (id: string, customDeletedBy?: string) => {
    const nowIso = new Date().toISOString();
    const deletedByName = customDeletedBy || (role === 'stylist' && loggedInStaffName ? `${loggedInStaffName} (Stylist)` : (shopProfile?.ownerName || 'Owner'));
    setBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isDeleted: true, deletedAt: nowIso, deletedBy: deletedByName } : b))
    );
    if (currentShopId) {
      deleteBillInDb(currentShopId, id, deletedByName);
    }
    showToast(`Bill #${id} deleted by ${deletedByName} (moved to 30-day recovery bin).`);
  };

  const restoreBill = (id: string) => {
    setBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isDeleted: false, deletedAt: undefined } : b))
    );
    if (currentShopId) {
      restoreBillInDb(currentShopId, id);
    }
    showToast(`Bill #${id} restored successfully.`);
  };

  const settleCustomerDue = async (
    cust: Customer,
    paymentAmount: number,
    paymentMode: 'Cash' | 'UPI' | 'Card',
    clearAllRemainingDues: boolean = false
  ) => {
    const payment = Math.max(0, paymentAmount);
    if (payment <= 0 && !clearAllRemainingDues) return;
    const isClearingAll = clearAllRemainingDues || payment >= (cust.due || 0);
    const newDue = isClearingAll ? 0 : Math.max(0, (cust.due || 0) - payment);
    const collectorName = role === 'stylist' && loggedInStaffName ? `${loggedInStaffName} (Supervisor)` : (shopProfile?.ownerName || 'Owner');

    // 1. Immediately update customer in state
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === cust.id
          ? { ...c, due: newDue, spend: (c.spend || 0) + payment }
          : c
      )
    );

    // 2. Immediately reduce unpaid bills in state
    let remaining = payment;
    const cleanTargetPhone = (cust.phone || '').replace(/\D/g, '').slice(-10);
    const targetName = cust.name.trim().toLowerCase();

    setBills((prev) =>
      prev.map((b) => {
        if ((b.dueAmount || 0) <= 0 || b.isDeleted) return b;
        const cleanBPhone = (b.phone || '').replace(/\D/g, '').slice(-10);
        const bCustName = (b.cust || '').trim().toLowerCase();
        const matches =
          (b.customerId && b.customerId === cust.id) ||
          (cleanTargetPhone && cleanBPhone && cleanTargetPhone === cleanBPhone) ||
          (targetName && bCustName && targetName === bCustName);

        if (matches) {
          if (isClearingAll) {
            return {
              ...b,
              dueAmount: 0,
              paidAmount: b.total,
              status: 'paid',
              isEdited: true,
            };
          }
          if (remaining > 0) {
            const deduct = Math.min(b.dueAmount || 0, remaining);
            remaining -= deduct;
            const updatedDue = (b.dueAmount || 0) - deduct;
            const updatedPaid = (b.paidAmount || 0) + deduct;
            return {
              ...b,
              dueAmount: updatedDue,
              paidAmount: updatedPaid,
              status: updatedDue <= 0 ? 'paid' : 'partially_paid',
              isEdited: true,
            };
          }
        }
        return b;
      })
    );

    // 3. Create clearance bill in state (settleCustomerDueInDb authoritatively persists clearance bill to Supabase)
    const clearanceBill: Bill = {
      id: `DUE-CLR-${Date.now().toString().slice(-4)}`,
      cust: cust.name,
      phone: cust.phone || '',
      items: [{ name: `Due Payment Clearance (${cust.name})`, price: payment, qty: 1 }],
      staff: collectorName,
      total: payment,
      paidAmount: payment,
      dueAmount: 0,
      mode: paymentMode as any,
      status: 'paid',
      discount: 0,
      tax: 0,
      tip: 0,
      dateStr: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isToday: true,
      isDeleted: false,
      isEdited: false,
    };
    setBills((prev) => [clearanceBill, ...prev]);

    // 4. Atomically persist due settlement and bill deductions to Supabase
    if (currentShopId) {
      await settleCustomerDueInDb(
        currentShopId,
        { id: cust.id, name: cust.name, phone: cust.phone, currentDue: cust.due || 0 },
        payment,
        paymentMode,
        collectorName,
        isClearingAll
      );
    }

    showToast(`Received ₹${payment} via ${paymentMode}. ${isClearingAll ? 'All dues cleared! Remaining: ₹0' : `Remaining Due: ₹${newDue}`}`);
  };

  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_expenses_db', JSON.stringify(expenses));
    } catch {}
  }, [expenses, isHydrated]);

  // Unified client-side hydration from localStorage (prevents SSR / client mismatch)
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('stylefleet_theme');
      if (savedTheme === 'light') {
        setIsDarkMode(false);
      }
      const savedLang = localStorage.getItem('stylefleet_language') as Language | null;
      if (savedLang && ['en', 'hi', 'ta', 'te', 'kn', 'ml'].includes(savedLang)) {
        setLanguage(savedLang);
      }
      const storedProfile = localStorage.getItem('stylefleet_shop_profile');
      if (storedProfile) {
        setShopProfile(JSON.parse(storedProfile));
      }
      const storedCust = localStorage.getItem('stylefleet_customers_db');
      if (storedCust) {
        setCustomers(JSON.parse(storedCust));
      }
      let initialStaff: StaffMember[] = [];
      const storedStaff = localStorage.getItem('stylefleet_staff_team_db');
      if (storedStaff) {
        try {
          initialStaff = JSON.parse(storedStaff);
          setStaff(initialStaff);
        } catch {}
      }
      const singleStaff = initialStaff.length === 1 ? initialStaff[0].name.trim() : null;
      const owner = shopProfile?.ownerName?.trim() || 'Owner';

      const storedAppts = localStorage.getItem('stylefleet_appointments_db');
      if (storedAppts) {
        try {
          const parsedAppts: Appointment[] = JSON.parse(storedAppts);
          const cleanAppts = parsedAppts.map((a) => {
            if (a.staff === 'Karthik' || (singleStaff && (!a.staff || a.staff === 'Staff' || a.staff === 'Stylist'))) {
              return { ...a, staff: singleStaff || owner };
            }
            if (a.staff && a.staff.includes('Karthik')) {
              return { ...a, staff: a.staff.replace(/Karthik/gi, singleStaff || owner) };
            }
            return a;
          });
          setAppointments(cleanAppts);
        } catch {}
      }
      const storedBills = localStorage.getItem('stylefleet_bills_db');
      if (storedBills) {
        try {
          const parsedBills: Bill[] = JSON.parse(storedBills);
          const cleanBills = parsedBills.map((b) => {
            if (b.staff === 'Karthik' || (singleStaff && (!b.staff || b.staff === 'Staff' || b.staff === 'Stylist'))) {
              return { ...b, staff: singleStaff || owner };
            }
            if (b.staff && b.staff.includes('Karthik')) {
              return { ...b, staff: b.staff.replace(/Karthik/gi, singleStaff || owner) };
            }
            return b;
          });
          setBills(cleanBills);
        } catch {}
      }
      const storedExpenses = localStorage.getItem('stylefleet_expenses_db');
      if (storedExpenses) {
        setExpenses(JSON.parse(storedExpenses));
      }

      // Helper to immediately log out a user whose account or salon was deleted
      const forceLogoutUser = (reason: string = 'Your account was deleted from the database. You have been logged out.') => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {}
        alert(reason);
        window.location.href = '/';
      };

      // Check if active salon has a registered shop_id in cloud Supabase
      const savedShopId = localStorage.getItem('stylefleet_shop_id');
      const authSessionStr = localStorage.getItem('stylefleet_auth_session');
      let activeSession: any = null;
      if (authSessionStr) {
        try {
          activeSession = JSON.parse(authSessionStr);
          if (activeSession.role) setRole(activeSession.role);
          if (activeSession.staffName || activeSession.stylistName) {
            setLoggedInStaffName(activeSession.staffName || activeSession.stylistName);
          }
        } catch {}
      }

      if (savedShopId) {
        setCurrentShopId(savedShopId);
        setIsLoadingSalonData(true);
        ensureSupabaseOwnerSession(savedShopId).catch(() => {});
        fetchSalonDataFromDb(savedShopId)
          .then((dbData) => {
            if (!dbData) {
              // The shop was permanently deleted from Supabase!
              console.warn('[SalonContext] Shop not found in Supabase. Logging out immediately.');
              forceLogoutUser('This salon account was permanently deleted from Supabase. You have been logged out.');
              return;
            }

            // If user is a stylist, verify they are still in the staff list
            if (activeSession && activeSession.role === 'stylist') {
              const stylistExists = (dbData.staff || []).some((s) => {
                if (activeSession.staffId && s.id === activeSession.staffId) return true;
                if (activeSession.phone && s.phone) {
                  const cleanS = activeSession.phone.replace(/\D/g, '').slice(-10);
                  const cleanP = s.phone.replace(/\D/g, '').slice(-10);
                  if (cleanS === cleanP) return true;
                }
                if (activeSession.staffName && s.name && s.name.trim().toLowerCase() === activeSession.staffName.trim().toLowerCase()) {
                  return true;
                }
                return false;
              });

              if (!stylistExists) {
                console.warn('[SalonContext] Stylist removed from salon staff in Supabase. Logging out immediately.');
                forceLogoutUser('Your stylist account was removed from this salon. You have been logged out.');
                return;
              }
            }

            setShopProfile(dbData.shop);
            setCategories(dbData.categories);
            setServices(dbData.services);
            setStaff(dbData.staff);
            setCustomers(dbData.customers);

            const activeStaffList = dbData.staff || [];
            const singleStaffMember = activeStaffList.length === 1 ? activeStaffList[0].name.trim() : null;
            const shopOwnerName = dbData.shop?.ownerName?.trim() || 'Owner';

            const cleanDbBills = (dbData.bills || []).map((b: Bill) => {
              if (b.staff === 'Karthik' || (singleStaffMember && (!b.staff || b.staff === 'Staff' || b.staff === 'Stylist'))) {
                return { ...b, staff: singleStaffMember || shopOwnerName };
              }
              if (b.staff && b.staff.includes('Karthik')) {
                return { ...b, staff: b.staff.replace(/Karthik/gi, singleStaffMember || shopOwnerName) };
              }
              return b;
            });

            const cleanDbAppts = (dbData.appointments || []).map((a: Appointment) => {
              if (a.staff === 'Karthik' || (singleStaffMember && (!a.staff || a.staff === 'Staff' || a.staff === 'Stylist'))) {
                return { ...a, staff: singleStaffMember || shopOwnerName };
              }
              if (a.staff && a.staff.includes('Karthik')) {
                return { ...a, staff: a.staff.replace(/Karthik/gi, singleStaffMember || shopOwnerName) };
              }
              return a;
            });

            setAppointments(cleanDbAppts);
            setBills(cleanDbBills);
            setExpenses(dbData.expenses);
          })
          .catch((err) => {
            console.warn('[SalonContext] Could not load cloud state:', err);
          })
          .finally(() => {
            setIsLoadingSalonData(false);
          });
      } else {
        setIsLoadingSalonData(false);
      }
    } catch (e) {
      console.error('Error hydrating salon state from localStorage:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Real-time synchronization of salon state (customers, dues, bills, appointments, staff permissions) from Supabase
  useEffect(() => {
    if (!currentShopId) return;

    const handleSyncSalonState = async () => {
      try {
        const dbData = await fetchSalonDataFromDb(currentShopId);
        if (dbData) {
          if (dbData.shop) {
            setShopProfile((prev) => ({
              ...prev,
              ...dbData.shop,
              ownerName: dbData.shop.ownerName || prev.ownerName,
            }));
          }
          if (dbData.staff && dbData.staff.length > 0) {
            setStaff(dbData.staff);
          }
          if (dbData.bills && dbData.bills.length > 0) {
            setBills(dbData.bills);
          }
          if (dbData.appointments && dbData.appointments.length > 0) {
            setAppointments(dbData.appointments);
          }
          if (dbData.customers && dbData.customers.length > 0) {
            setCustomers(dbData.customers);
          }
        }
      } catch {}
    };

    // Sub-second push synchronization via Supabase Realtime for instant mobile ⇄ web parity
    const realtimeChannel = supabase
      .channel(`realtime_salon_${currentShopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${currentShopId}` },
        () => {
          handleSyncSalonState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${currentShopId}` },
        () => {
          handleSyncSalonState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `shop_id=eq.${currentShopId}` },
        () => {
          handleSyncSalonState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `shop_id=eq.${currentShopId}` },
        () => {
          handleSyncSalonState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff', filter: `shop_id=eq.${currentShopId}` },
        () => {
          handleSyncSalonState();
        }
      )
      .subscribe();

    window.addEventListener('focus', handleSyncSalonState);
    const syncInterval = setInterval(handleSyncSalonState, 8000);

    return () => {
      supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', handleSyncSalonState);
      clearInterval(syncInterval);
    };
  }, [currentShopId]);

  // Continuous integrity: Synchronize bills and appointments strictly with registered salon stylists
  useEffect(() => {
    if (!isHydrated || staff.length === 0) return;
    const singleStaffName = staff.length === 1 ? staff[0].name.trim() : null;
    const ownerName = (shopProfile?.ownerName || 'Owner').trim();

    setBills((prev) => {
      let changed = false;
      const sanitized = prev.map((b) => {
        const s = (b.staff || '').trim();
        if (s === 'Karthik' || (singleStaffName && (!s || s === 'Staff' || s === 'Stylist'))) {
          changed = true;
          return { ...b, staff: singleStaffName || ownerName };
        }
        if (s.includes('Karthik')) {
          changed = true;
          return { ...b, staff: s.replace(/Karthik/gi, singleStaffName || ownerName) };
        }
        return b;
      });
      return changed ? sanitized : prev;
    });

    setAppointments((prev) => {
      let changed = false;
      const sanitized = prev.map((a) => {
        const s = (a.staff || '').trim();
        if (s === 'Karthik' || (singleStaffName && (!s || s === 'Staff' || s === 'Stylist'))) {
          changed = true;
          return { ...a, staff: singleStaffName || ownerName };
        }
        if (s.includes('Karthik')) {
          changed = true;
          return { ...a, staff: s.replace(/Karthik/gi, singleStaffName || ownerName) };
        }
        return a;
      });
      return changed ? sanitized : prev;
    });
  }, [staff, isHydrated, shopProfile?.ownerName]);

  // Continuous verification: Immediately log out user if their account or salon was deleted from Supabase
  useEffect(() => {
    if (!currentShopId) return;

    const checkActiveSessionInDb = async () => {
      try {
        const authSessionStr = localStorage.getItem('stylefleet_auth_session');
        if (!authSessionStr) return;
        const session = JSON.parse(authSessionStr);

        const result = await verifyAccountActiveInDb(
          currentShopId,
          session.role,
          session.staffId,
          session.phone
        );

        if (!result.active) {
          console.warn('[SalonContext] Account no longer active in Supabase:', result.reason);
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {}
          alert(result.reason || 'Your account was deleted from Supabase. You have been logged out.');
          window.location.href = '/';
        }
      } catch (err) {
        console.warn('[SalonContext] Session check skipped due to error:', err);
      }
    };

    // Run check periodically (every 8 seconds to immediately detect deletions from mobile phone)
    const intervalId = setInterval(checkActiveSessionInDb, 8000);

    // Run check when window gains focus, tab becomes visible, or storage changes
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkActiveSessionInDb();
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'stylefleet_shop_id' || e.key === 'stylefleet_auth_session') {
        checkActiveSessionInDb();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('storage', handleStorage);
    };
  }, [currentShopId]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('stylefleet_language', language);
    } catch {}
  }, [language, isHydrated]);

  const resolveStaffIdByName = (staffName?: string | null): string | null => {
    const clean = (staffName || '').trim().toLowerCase();
    if (!clean) return null;
    return staff.find((s) => s.name.trim().toLowerCase() === clean)?.id || null;
  };

  const getEffectiveShopId = () =>
    currentShopId ||
    shopProfile?.id ||
    (typeof window !== 'undefined' ? localStorage.getItem('stylefleet_shop_id') : null);

  const addExpense = (newExp: Omit<Expense, 'id' | 'date'> & { id?: string; date?: string }) => {
    const today = new Date().toISOString().split('T')[0];
    const expId = isValidUuid(newExp.id) ? newExp.id! : generateUuid();
    const resolvedStaffId = newExp.staffId !== undefined ? newExp.staffId : resolveStaffIdByName(newExp.staff);
    const exp: Expense = {
      id: expId,
      cat: newExp.cat,
      amount: Number(newExp.amount) || 0,
      note: newExp.note,
      pm: newExp.pm,
      staff: newExp.staff || null,
      staffId: resolvedStaffId,
      inProfit: newExp.inProfit !== undefined ? newExp.inProfit : true,
      date: newExp.date || today,
      createdAt: newExp.createdAt || new Date().toISOString(),
    };
    setExpenses((prev) => [exp, ...prev]);
    const effectiveShopId = getEffectiveShopId();
    if (effectiveShopId) {
      saveExpenseToDb(effectiveShopId, exp);
    }
    showToast(`Expense of ₹${exp.amount} recorded.`);
  };

  const updateExpense = (id: string, updated: Partial<Expense>) => {
    const patch: Partial<Expense> = { ...updated };
    if (updated.staff !== undefined && updated.staffId === undefined) {
      patch.staffId = resolveStaffIdByName(updated.staff);
    }
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
    const effectiveShopId = getEffectiveShopId();
    if (effectiveShopId) {
      updateExpenseInDb(effectiveShopId, id, patch);
    }
    showToast('Expense updated successfully.');
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    const effectiveShopId = getEffectiveShopId();
    if (effectiveShopId) {
      deleteExpenseInDb(effectiveShopId, id);
    }
    showToast('Expense entry deleted.');
  };

  // ================= BILL CART CONTROLLER =================
  const [billCartItems, setBillCartItems] = useState<BillItem[]>([]);
  const [billCustName, setBillCustName] = useState('');
  const [billCustPhone, setBillCustPhone] = useState('');
  const [billStaffSelect, setBillStaffSelect] = useState(() => {
    if (role === 'stylist' && loggedInStaffName) return loggedInStaffName;
    return shopProfile?.ownerName?.trim() || 'Owner';
  });
  const [billDiscount, setBillDiscount] = useState(0);
  const [billPaymentMode, setBillPaymentMode] = useState<Bill['mode']>('UPI');
  const [partialPaidAmount, setPartialPaidAmount] = useState(0);

  // Synchronize default stylist selection based on active role and profile
  useEffect(() => {
    if (role === 'stylist' && loggedInStaffName) {
      setBillStaffSelect(loggedInStaffName);
    } else if (role === 'owner') {
      const owner = shopProfile?.ownerName?.trim() || 'Owner';
      setBillStaffSelect((prev) => (!prev || prev === 'Stylist' || prev === 'Staff' || prev === 'Karthik' ? (staff.length === 1 ? staff[0].name : owner) : prev));
    }
  }, [role, loggedInStaffName, shopProfile?.ownerName]);

  const addCartItem = ({ name, price, staff: itemStaff }: { name: string; price: number; staff?: string }) => {
    setBillCartItems((prev) => {
      const existing = prev.find((i) => i.name === name);
      if (existing) {
        return prev.map((i) => (i.name === name ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { name, price, qty: 1, staff: itemStaff || billStaffSelect || (staff.length > 0 ? staff[0].name : 'Stylist') }];
    });
    showToast(`Added "${name}" to bill`);
  };

  const removeCartItem = (index: number) => {
    setBillCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCartItemQty = (index: number, qty: number) => {
    if (qty <= 0) {
      removeCartItem(index);
      return;
    }
    setBillCartItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, qty } : item))
    );
  };

  const clearCart = () => {
    setBillCartItems([]);
    setBillCustName('');
    setBillCustPhone('');
    setBillDiscount(0);
    setBillPaymentMode('UPI');
    setPartialPaidAmount(0);
  };

  // Mark arrived and auto-fill in billing
  const markArrivedAndBill = (appt: Appointment) => {
    updateAppointmentStatus(appt.id, 'Done');
    setBillCustName(appt.cust);
    setBillCustPhone(appt.phone);
    const defaultStaff = role === 'stylist' && loggedInStaffName ? loggedInStaffName : (shopProfile.ownerName || 'Owner');
    setBillStaffSelect(appt.staff || defaultStaff);
    setBillCartItems([{ name: appt.service, price: appt.amount, qty: 1, staff: appt.staff || defaultStaff }]);
    setCurrentScreen('billing');
    showToast(`Prefilled bill for ${appt.cust}!`);
  };

  const [activeInvoice, setActiveInvoice] = useState<Bill | null>(null);

  return (
    <SalonContext.Provider
      value={{
        role,
        setRole,
        currentScreen,
        setCurrentScreen,
        isDarkMode,
        toggleTheme,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
        language,
        setLanguage,
        t,
        shopProfile,
        updateShopProfile,
        categories,
        addCategory,
        editCategory,
        deleteCategory,
        services,
        addService,
        addServices,
        updateService,
        deleteService,
        toggleServiceActive,
        bulkDeleteServices,
        bulkUpdateServices,
        customers,
        addCustomer,
        toggleCustomerVip,
        updateCustomer,
        deleteCustomer,
        markCustomerInactive,
        reactivateCustomer,
        importCustomers,
        settleCustomerDue,
        staff,
        addStaff,
        updateStaff,
        deleteStaff,
        toggleStaffStatus,
        inviteStaffViaWhatsApp,
        appointments,
        addAppointment,
        updateAppointmentStatus,
        updateAppointment,
        deleteAppointment,
        markArrivedAndBill,
        bills,
        setBills,
        createBill,
        editBill,
        deleteBill,
        restoreBill,
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
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
        activeInvoice,
        setActiveInvoice,
        toast,
        showToast,
        isHydrated,
        isLoadingSalonData,
        currentShopId,
        setCurrentShopId,
        loggedInStaffName,
        setLoggedInStaffName,
        hasPermission,
        currentStylistPermissions,
      }}
    >
      <div suppressHydrationWarning className={isDarkMode ? 'dark' : ''}>
        {children}
        {toast && (
          <div
            className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-[#11284A] border shadow-2xl text-sm font-semibold flex items-center gap-3 text-white"
            style={{ borderColor: toast.type === 'error' ? '#EF4444' : '#D4AF37' }}
          >
            {toast.type === 'error' ? (
              <svg className="w-4 h-4 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </SalonContext.Provider>
  );
};

export const useSalonSafe = () => {
  return useContext(SalonContext) || null;
};

export const useSalon = () => {
  const context = useContext(SalonContext);
  if (!context) {
    throw new Error('useSalon must be used within a SalonProvider');
  }
  return context;
};
