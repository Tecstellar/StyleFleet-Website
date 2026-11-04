'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { 
  Crown, 
  Scissors, 
  PhoneCall, 
  MessageCircle, 
  Instagram,
  CheckCircle2,
  Smartphone,
  QrCode,
  RefreshCw,
  Laptop
} from 'lucide-react';
import { OwnerRegistrationView } from '@/components/owner-registration';
import { findSalonByPhone } from '@/lib/supabase-service';
import { supabase } from '@/lib/supabase';

// Service list for the interactive front-desk demo
const DEMO_SERVICES = [
  ['Signature haircut & fade', '35 min', 800],
  ['Beard precision sculpt', '20 min', 450],
  ['Moroccan keratin spa', '55 min', 1800],
  ['24K gold facial', '40 min', 1400],
] as const;

// Language translation data for multilingual bill
const LANGUAGE_DICTIONARY = {
  English: [
    ['Haircut', '₹800'],
    ['Beard sculpt', '₹450'],
    ['Keratin spa', '₹1,800'],
    'Total',
  ],
  'தமிழ்': [
    ['முடி திருத்துதல்', '₹800'],
    ['தாடி ஷேப்பிங்', '₹450'],
    ['கெரட்டின் ஸ்பா', '₹1,800'],
    'மொத்தத் தொகை',
  ],
  'हिन्दी': [
    ['हेयरकट', '₹800'],
    ['दाढ़ी शेपिंग', '₹450'],
    ['केराटिन स्पा', '₹1,800'],
    'कुल राशि',
  ],
} as const;

// Stat Counter component with smooth cubic ease-out on scroll
function StatCounter({
  target,
  suffix = '',
  prefix = '',
}: {
  target: number;
  suffix?: string;
  prefix?: string;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animatedRef.current) {
            animatedRef.current = true;
            const startTime = performance.now();
            const duration = 1400;

            const step = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const k = Math.min(1, elapsed / duration);
              const eased = 1 - Math.pow(1 - k, 3);
              setVal(Math.round(target * eased));
              if (k < 1) {
                requestAnimationFrame(step);
              }
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref}>
      <b>
        {prefix}
        {val}
        {suffix}
      </b>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();

  // Navigation View State: Landing Page vs Login vs Register
  const [view, setView] = useState<'home' | 'login' | 'register'>('home');
  const [role, setRole] = useState<'owner' | 'stylist'>('owner');
  const [authStep, setAuthStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Login Mode Slider State: 'otp' (Mobile OTP / Registration) vs 'qr' (Scan with App / Link to PC)
  const [loginMode, setLoginMode] = useState<'otp' | 'qr'>('qr');
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrPairCode, setQrPairCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrExpiresIn, setQrExpiresIn] = useState<number>(180);
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(false);
  const [isQrExpired, setIsQrExpired] = useState<boolean>(false);
  const [showQrSim, setShowQrSim] = useState<boolean>(false);
  const [simPhone, setSimPhone] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Interactive Demo State
  const [activeServices, setActiveServices] = useState<number[]>([0, 1]);
  const [waSent, setWaSent] = useState(false);
  const [shownTotal, setShownTotal] = useState(1250);
  const sumTotal = activeServices.reduce((sum, i) => sum + DEMO_SERVICES[i][2], 0);

  // Animated running total for interactive demo bill
  useEffect(() => {
    const from = shownTotal;
    const to = sumTotal;
    const t0 = performance.now();
    let raf: number;

    const f = (t: number) => {
      const k = Math.min(1, (t - t0) / 500);
      const eased = 1 - Math.pow(1 - k, 3);
      setShownTotal(Math.round(from + (to - from) * eased));
      if (k < 1) {
        raf = requestAnimationFrame(f);
      }
    };

    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [sumTotal]);

  // Multilingual Paper Receipt State
  const [currentLang, setCurrentLang] = useState<'English' | 'தமிழ்' | 'हिन्दी'>('English');

  // Toast notification helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Switch to login view
  const openLogin = (selectedRole: 'owner' | 'stylist' = 'owner') => {
    setRole(selectedRole);
    setAuthStep('phone');
    setPhone('');
    setOtp(['', '', '', '', '', '']);
    setAgreeToTerms(false);
    setView('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const returnHome = () => {
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearLocalSalonCache = () => {
    try {
      localStorage.removeItem('stylefleet_bills_db');
      localStorage.removeItem('stylefleet_appointments_db');
      localStorage.removeItem('stylefleet_customers_db');
      localStorage.removeItem('stylefleet_staff_team_db');
      localStorage.removeItem('stylefleet_expenses_db');
      localStorage.removeItem('stylefleet_shop_profile');
    } catch {}
  };

  // Generate dynamic QR session for mobile-to-desktop linking
  const generateQrSession = useCallback(async () => {
    setIsLoadingQr(true);
    setIsQrExpired(false);
    try {
      const res = await fetch('/api/auth/qr-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success) {
        setQrSessionId(data.sessionId);
        setQrPairCode(data.pairCode);
        setQrExpiresIn(data.expiresIn || 180);
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const qrContent = currentOrigin ? `${data.qrData}&origin=${encodeURIComponent(currentOrigin)}` : data.qrData;
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
          qrContent
        )}&color=07152B&bgcolor=FFFFFF&qzone=2`;
        setQrDataUrl(qrImg);
      } else {
        showToast('Unable to initialize QR code session', 'error');
      }
    } catch {
      showToast('Error connecting to QR authentication service', 'error');
    } finally {
      setIsLoadingQr(false);
    }
  }, [role]);

  // Trigger QR generation whenever view is login and loginMode is qr
  useEffect(() => {
    if (view === 'login' && loginMode === 'qr') {
      generateQrSession();
    }
  }, [view, loginMode, role, generateQrSession]);

  // QR expiration countdown
  useEffect(() => {
    if (view !== 'login' || loginMode !== 'qr' || isQrExpired || !qrSessionId) return;
    const timer = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          setIsQrExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [view, loginMode, isQrExpired, qrSessionId]);

  // Poll and Realtime listener for QR scan authorization from mobile app
  useEffect(() => {
    if (view !== 'login' || loginMode !== 'qr' || isQrExpired || !qrSessionId) return;

    let isSubscribed = true;

    const handleAuthenticated = (authPayload: any) => {
      if (!isSubscribed) return;
      isSubscribed = false;

      clearLocalSalonCache();

      const shopName = authPayload.shopName || 'StyleFleet Salon';
      showToast(`⚡ Mobile Linked! Welcome to ${shopName}.`, 'success');

      localStorage.setItem('stylefleet_shop_id', authPayload.shopId);
      localStorage.setItem(
        'stylefleet_auth_session',
        JSON.stringify({
          isLoggedIn: true,
          role: authPayload.role || role,
          phone: authPayload.phone,
          shopId: authPayload.shopId,
          shopName: shopName,
          ownerName: authPayload.ownerName,
          staffId: authPayload.staffId,
          staffName: authPayload.staffName,
          stylistName: authPayload.staffName || authPayload.ownerName || 'User',
          loginTime: new Date().toISOString(),
        })
      );

      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    };

    // 1. Supabase Realtime channel for zero-latency, DNS-free mobile linking
    const sessionChannel = supabase.channel(`sf-qr:${qrSessionId}`, {
      config: { broadcast: { self: false } },
    });
    sessionChannel
      .on('broadcast', { event: 'authorize' }, ({ payload }) => {
        if (payload?.shopId) {
          handleAuthenticated(payload);
        }
      })
      .subscribe();

    let codeChannel: any = null;
    if (qrPairCode) {
      codeChannel = supabase.channel(`sf-qr:code_${qrPairCode}`, {
        config: { broadcast: { self: false } },
      });
      codeChannel
        .on('broadcast', { event: 'authorize' }, ({ payload }: any) => {
          if (payload?.shopId) {
            handleAuthenticated(payload);
          }
        })
        .subscribe();
    }

    // 2. Fallback polling for HTTP/server session
    const interval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch(`/api/auth/qr-session?sessionId=${qrSessionId}`);
        const data = await res.json();
        if (!isSubscribed) return;

        if (data.status === 'authenticated' && data.shopId) {
          handleAuthenticated({
            shopId: data.shopId,
            role: data.role,
            phone: data.phone,
            shopName: data.shopName,
            ...(data.authSession || {}),
          });
        } else if (data.status === 'expired') {
          setIsQrExpired(true);
        }
      } catch {
        // Retry silently on intermittent network drops
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      supabase.removeChannel(sessionChannel);
      if (codeChannel) supabase.removeChannel(codeChannel);
    };
  }, [view, loginMode, isQrExpired, qrSessionId, qrPairCode, role, router]);

  // Simulator helper to test mobile app scan confirmation directly on web
  const handleSimulateAppScan = async () => {
    if (!qrSessionId) return;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/auth/qr-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: qrSessionId,
          pairCode: qrPairCode,
          role,
          phone: simPhone || '8870500106',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Mobile authorization confirmed! Linking desktop...', 'success');
      } else {
        showToast(data.error || 'Simulation failed', 'error');
      }
    } catch {
      showToast('Error during simulator link', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  // Timer for OTP resend countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (authStep === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [authStep, countdown]);

  // Phone submission handler - Dispatches real SMS OTP via 2Factor API
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }
    if (!agreeToTerms) {
      showToast('Please agree to the Terms of Service & Privacy Policy of StyleFleet', 'error');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        setOtpSessionId(data.sessionId);
        setCountdown(30);
        setCanResend(false);
        setOtp(['', '', '', '', '', '']);
        setAuthStep('otp');
        showToast(data.message || `Verification code sent to +91 ${cleanPhone}`, 'success');
        setTimeout(() => {
          otpRefs.current[0]?.focus();
        }, 150);
      } else {
        showToast(data.error || 'Failed to send OTP via SMS', 'error');
      }
    } catch {
      showToast('Network error sending OTP. Please try again.', 'error');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Resend OTP code via 2Factor API
  const handleResend = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    setIsSendingOtp(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        setOtpSessionId(data.sessionId);
        setCountdown(30);
        setCanResend(false);
        showToast(`New verification code sent to +91 ${cleanPhone}`, 'success');
      } else {
        showToast(data.error || 'Failed to resend code', 'error');
      }
    } catch {
      showToast('Network error resending OTP', 'error');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // OTP box input handling
  const handleOtpChange = (index: number, val: string) => {
    const numeric = val.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = numeric ? numeric[0] : '';
    setOtp(newOtp);

    if (numeric && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto verify if all 6 boxes filled
    if (newOtp.every((digit) => digit !== '')) {
      setTimeout(() => verifyOtp(newOtp.join('')), 200);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      const newOtp = [...otp];
      for (let i = 0; i < pasteData.length; i++) {
        newOtp[i] = pasteData[i];
      }
      setOtp(newOtp);
      if (pasteData.length === 6) {
        setTimeout(() => verifyOtp(pasteData), 250);
      } else {
        otpRefs.current[pasteData.length]?.focus();
      }
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length < 6) {
      showToast('Please enter the complete 6-digit code', 'error');
      return;
    }

    setIsVerifyingOtp(true);

    if (otpSessionId) {
      try {
        const res = await fetch('/api/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: otpSessionId, otp: code }),
        });
        const data = await res.json();
        if (!data.success || !data.matched) {
          showToast(data.error || 'Invalid OTP code. Please check and try again.', 'error');
          setIsVerifyingOtp(false);
          return;
        }
      } catch {
        showToast('Verification server error. Please try again.', 'error');
        setIsVerifyingOtp(false);
        return;
      }
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    // Look up salon in cloud Supabase database
    const dbLookup = await findSalonByPhone(cleanPhone, role);

    if (role === 'stylist') {
      if (dbLookup.found && dbLookup.role === 'stylist' && dbLookup.shopId) {
        clearLocalSalonCache();
        const stylistDisplayName = dbLookup.staffName || 'Stylist';
        showToast(`Welcome back, ${stylistDisplayName}! Logged in to ${dbLookup.shopName || 'Salon'}.`, 'success');
        
        localStorage.setItem('stylefleet_shop_id', dbLookup.shopId);
        localStorage.setItem(
          'stylefleet_auth_session',
          JSON.stringify({
            isLoggedIn: true,
            role: 'stylist',
            phone: cleanPhone,
            shopId: dbLookup.shopId,
            shopName: dbLookup.shopName || 'StyleFleet Salon',
            staffId: dbLookup.staffId,
            stylistName: stylistDisplayName,
            staffName: stylistDisplayName,
            stylistRole: 'Stylist',
            loginTime: new Date().toISOString(),
          })
        );
        setTimeout(() => router.push('/dashboard'), 500);
      } else {
        showToast(`No stylist profile found for +91 ${cleanPhone}. Please ask your salon owner to add your phone number.`, 'error');
        setIsVerifyingOtp(false);
      }
    } else {
      // Owner workspace authentication
      if (dbLookup.found && dbLookup.shopId) {
        clearLocalSalonCache();
        const salonName = dbLookup.shopName || 'StyleFleet Salon';
        showToast(`Welcome back! Successfully logged into ${salonName}.`, 'success');

        localStorage.setItem('stylefleet_shop_id', dbLookup.shopId);
        localStorage.setItem(
          'stylefleet_auth_session',
          JSON.stringify({
            isLoggedIn: true,
            role: 'owner',
            phone: cleanPhone,
            shopId: dbLookup.shopId,
            shopName: salonName,
            loginTime: new Date().toISOString(),
          })
        );
        setTimeout(() => router.push('/dashboard'), 500);
      } else {
        showToast(`No salon registered with +91 ${cleanPhone}. Setting up your new salon workspace!`, 'success');
        setView('register');
      }
    }
  };

  // If user selected registration
  if (view === 'register') {
    return (
      <OwnerRegistrationView
        initialPhone={phone.replace(/\D/g, '').slice(-10)}
        onBackToLogin={() => setView('login')}
        onRegistrationComplete={() => router.push('/dashboard')}
      />
    );
  }

  return (
    <div className="landing-exact" id="top">

      {/* ================= VIEW 1: EXACT LUXURY LANDING PAGE ================= */}
      {view === 'home' && (
        <>
          {/* Navigation Bar */}
          <nav>
            <div className="wrap">
              <a className="logo" href="#top">
                <img
                  src="/assets/stylefleet-logo.png"
                  alt="StyleFleet Logo"
                  width={36}
                  height={36}
                  className="logo-img"
                />
                <span>StyleFleet</span>
              </a>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#compare">Comparison</a></li>
                <li><a href="#languages">Languages</a></li>
                <li><a href="#reviews">Reviews</a></li>
                <li><a href="#pricing">Pricing</a></li>
              </ul>
              <button
                type="button"
                className="btn gold"
                onClick={() => openLogin('owner')}
              >
                Get started
              </button>
            </div>
          </nav>

          {/* Hero Section */}
          <header className="hero">
            <div className="wrap">
              <div>
                <h1 className="in">
                  Built for salons, designed for <em>growth.</em>
                </h1>
                <p className="lead in">
                  Bill multiple services in 15 seconds, see every styling chair live, send invoices on WhatsApp, and know your real profit at closing time. One calm workspace, on any phone or tablet.
                </p>
                <div className="cta in">
                  <a
                    className="btn store-btn gold"
                    href="https://play.google.com/store/apps/details?id=com.stylefleet.app"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg className="store-icon" viewBox="0 0 512 512">
                      <path fill="#4285F4" d="M48.2 24.3C44.7 28 42.7 33.7 42.7 41.3v429.4c0 7.6 2 13.3 5.5 17l2.1 1.9L274.4 265.5v-5.2L50.3 22.4l-2.1 1.9z" />
                      <path fill="#FBBC04" d="M349 340.2l-74.6-74.7v-5.2l74.6-74.7 1.8 1 88.2 50.1c25.2 14.3 25.2 37.8 0 52.2l-88.2 50.1-1.8 1.2z" />
                      <path fill="#EA4335" d="M350.8 339l-76.4-76.4L50.3 486.7c8.3 8.8 22.1 9.9 37.4 1.2L350.8 339z" />
                      <path fill="#34A853" d="M350.8 173L87.7 24.1C72.4 15.4 58.6 16.5 50.3 25.3l224.1 224.1 76.4-76.4z" />
                    </svg>
                    <div>
                      <span className="store-sub">GET IT ON</span>
                      <strong className="store-title">Google Play</strong>
                    </div>
                  </a>

                  <a
                    className="btn store-btn dark-store"
                    href="#ios-download"
                    onClick={(e) => {
                      e.preventDefault();
                      showToast('StyleFleet iOS App is rolling out on the App Store.', 'success');
                    }}
                  >
                    <svg className="store-icon" viewBox="0 0 170 170" fill="currentColor">
                      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.77-8.7-10.42-18.79-13.97-30.27-3.55-11.48-5.33-22.42-5.33-32.83 0-14.36 3.55-26.33 10.66-35.91 7.11-9.58 16.14-14.43 27.09-14.56 5.34 0 11.27 1.48 17.79 4.43 6.52 2.96 10.74 4.49 12.67 4.49 1.74 0 6.06-1.57 12.96-4.71 6.9-3.14 12.96-4.58 18.18-4.33 13.94.65 24.96 5.86 33.05 15.64-12.19 7.4-18.17 17.51-17.95 30.34.22 10.02 4.13 18.49 11.75 25.43 7.62 6.94 16.75 10.97 27.42 12.09-2.18 6.53-4.91 13.28-8.2 20.25zM119.22 31.84c0-7.72 2.76-14.89 8.28-21.52 5.53-6.63 12.41-10.66 20.65-12.09.22 1.09.33 2.18.33 3.26 0 7.61-2.85 14.86-8.54 21.74-5.69 6.87-12.71 10.87-21.06 12-0.22-1.09-.33-2.18-.33-3.39z" />
                    </svg>
                    <div>
                      <span className="store-sub">DOWNLOAD ON THE</span>
                      <strong className="store-title">App Store</strong>
                    </div>
                  </a>
                </div>
                <div className="trust in">
                  <span>No hardware to buy</span>
                  <span>Bills sent on WhatsApp</span>
                  <span>Set up in 60 seconds</span>
                </div>
              </div>

              {/* Interactive Front-Desk Demo */}
              <div className="demo in" aria-label="Interactive billing demo">
                <header>
                  <span className="live">Live salon floor · 4 chairs active</span>
                  <span>Try the front desk</span>
                </header>
                <div id="svcs">
                  {DEMO_SERVICES.map((s, i) => {
                    const isSelected = activeServices.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className="svc"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setActiveServices((prev) =>
                            prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                          );
                          setWaSent(false);
                        }}
                      >
                        <span>
                          <b>{s[0]}</b>
                          <small>{s[1]}</small>
                        </span>
                        <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          ₹{s[2].toLocaleString('en-IN')}
                          <span className="tick">✓</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="bill">
                  <div className="meta">
                    <span>Luxe Salon · Digital bill</span>
                    <span>#SF-8924</span>
                  </div>
                  <div id="lines">
                    {activeServices.length === 0 ? (
                      <div className="row">Select a service to start a bill</div>
                    ) : (
                      activeServices.map((i) => {
                        const s = DEMO_SERVICES[i];
                        return (
                          <div className="row" key={i}>
                            <span>{s[0]}</span>
                            <span>₹{s[2].toLocaleString('en-IN')}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="tot">
                    <span>Grand total</span>
                    <b id="total">₹{shownTotal.toLocaleString('en-IN')}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn wa ${waSent ? 'sent' : ''}`}
                  id="wa"
                  onClick={() => {
                    if (activeServices.length > 0) {
                      setWaSent(true);
                    }
                  }}
                >
                  {waSent ? 'Bill sent to Priya ✓' : 'Share on WhatsApp'}
                </button>
              </div>
            </div>
          </header>

          {/* Stats Section */}
          <div className="wrap">
            <div className="stats">
              <div>
                <StatCounter target={15} />
                <span>seconds to check out</span>
              </div>
              <div>
                <StatCounter target={92} suffix="%" />
                <span>appointments kept via WhatsApp</span>
              </div>
              <div>
                <StatCounter target={360} suffix="°" />
                <span>real-time financial audit</span>
              </div>
              <div>
                <b>₹0</b>
                <span>hardware lock-in, any device</span>
              </div>
            </div>
          </div>

          {/* Comparison Section */}
          <section id="compare">
            <div className="wrap">
              <h2>The old way, and the StyleFleet way.</h2>
              <p className="lead">Why busy salons are leaving paper books and clunky legacy software behind.</p>
              <div className="cmp">
                <div className="old">
                  <h3>The traditional way</h3>
                  <ul style={{ padding: 0 }}>
                    <li><b>Paper registers</b>Lost receipts, wrong sums, and handwriting nobody can read.</li>
                    <li><b>Empty chairs and double bookings</b>No view of who is free, so walk-ins leave.</li>
                    <li><b>Commission disputes</b>Nightly arguments over tips and shares with no record.</li>
                    <li><b>Expensive POS machines</b>Forced purchases, monthly rentals, and breakdowns.</li>
                  </ul>
                </div>
                <div className="new">
                  <h3>The StyleFleet way</h3>
                  <ul style={{ padding: 0 }}>
                    <li><b>15-second digital checkout</b>Pick services, split UPI, card and cash, send the invoice.</li>
                    <li><b>Live chair matrix</b>See which chairs are in use, cleaning, or ready.</li>
                    <li><b>Automatic commission audits</b>Each stylist sees their own tips and earnings live.</li>
                    <li><b>Runs on any phone or tablet</b>Sign in with an OTP. No install, no hardware cost.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section id="features" style={{ background: 'var(--bg2)' }}>
            <div className="wrap">
              <h2>Everything from first haircut to final profit.</h2>
              <p className="lead">Five connected tools that cover the whole salon day.</p>
              <div className="mods">
                <div className="mod wide">
                  <h3>Express checkout</h3>
                  <p>Combine a haircut, colour, spa and beard sculpt on one receipt. Assign a stylist to each service.</p>
                  <div className="chip"><span>Haircut</span><b>₹800</b></div>
                  <div className="chip"><span>Keratin spa</span><b>₹1,800</b></div>
                  <div className="chip on"><span>Total</span><b>₹3,050</b></div>
                </div>
                <div className="mod wide">
                  <h3>Live chair matrix</h3>
                  <p>Track which chairs are busy, when they free up, and who is working.</p>
                  <div className="chip on"><span>Chair 1</span><b>Fade in progress</b></div>
                  <div className="chip"><span>Chair 2</span><b>Ready for walk-in</b></div>
                  <div className="chip"><span>Chair 3</span><b>Keratin spa, 30 min</b></div>
                </div>
                <div className="mod">
                  <h3>WhatsApp bills</h3>
                  <p>Clients get an itemised receipt with your branding and a UPI QR code.</p>
                  <div className="chip on">Your bill of ₹1,800 is paid.</div>
                </div>
                <div className="mod">
                  <h3>Stylist hub</h3>
                  <p>Every stylist has a login to see their queue, tips and commission.</p>
                  <div className="chip"><span>Anand</span><b>₹1,240</b></div>
                  <div className="chip"><span>Deepa</span><b>₹1,680</b></div>
                </div>
                <div className="mod">
                  <h3>Profit audit</h3>
                  <p>Revenue, expenses and net profit in one tap.</p>
                  <div className="chip"><span>Revenue</span><b>₹38,450</b></div>
                  <div className="chip"><span>Expenses</span><b>−₹4,200</b></div>
                  <div className="bar"><i /></div>
                </div>
              </div>
            </div>
          </section>

          {/* Multilingual Section */}
          <section id="languages">
            <div className="wrap lang">
              <div>
                <h2>Speaks your language.</h2>
                <p className="lead">
                  Create invoices and WhatsApp alerts in English, Tamil or Hindi so every client and stylist feels at home.
                </p>
                <div className="tabs" role="tablist" id="tabs">
                  {(['English', 'தமிழ்', 'हिन्दी'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="tab"
                      role="tab"
                      aria-selected={currentLang === k}
                      onClick={() => setCurrentLang(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div className="paper" id="paper" role="tabpanel" aria-live="polite">
                {LANGUAGE_DICTIONARY[currentLang].slice(0, 3).map((r, i) => (
                  <div className="r" key={i}>
                    <span>{r[0]}</span>
                    <b>{r[1]}</b>
                  </div>
                ))}
                <div className="t">
                  <span>{LANGUAGE_DICTIONARY[currentLang][3]}</span>
                  <span>₹3,050</span>
                </div>
              </div>
            </div>
          </section>

          {/* Reviews Section */}
          <section id="reviews" style={{ background: 'var(--bg2)' }}>
            <div className="wrap">
              <h2>Loved by India's master stylists.</h2>
              <div className="rev">
                <figure>
                  <blockquote>StyleFleet cut our front-desk rush by 80%. Clients love getting their bills on WhatsApp.</blockquote>
                  <figcaption>
                    <i>KR</i>
                    <span><b>Kavitha R.</b>The Velvet Mirror, Chennai</span>
                  </figcaption>
                </figure>
                <figure>
                  <blockquote>Stylists track their own commission and tips. No disputes, and a calm close every night.</blockquote>
                  <figcaption>
                    <i>RK</i>
                    <span><b>Rajesh K.</b>Blade &amp; Beard Studio, Coimbatore</span>
                  </figcaption>
                </figure>
                <figure>
                  <blockquote>Setup took two minutes with a mobile OTP. It runs on our counter tablet, no POS machine needed.</blockquote>
                  <figcaption>
                    <i>AM</i>
                    <span><b>Ananya M.</b>Glamour Lounge, Bengaluru</span>
                  </figcaption>
                </figure>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section id="pricing">
            <div className="wrap">
              <h2>Simple plans, clear taxes.</h2>
              <p className="lead">
                Every plan includes unlimited digital bills, appointments, WhatsApp sharing, chair tracking and multi-stylist access.
              </p>
              <div className="price">
                <div className="plan">
                  <h3>3 months</h3>
                  <small>Quarterly foundation</small>
                  <div className="amt">₹2,999</div>
                  <small>₹999 a month, plus 18% GST · ₹3,538.82 total</small>
                  <ul>
                    <li>Unlimited WhatsApp billing</li>
                    <li>Multi-stylist workspace</li>
                    <li>Live chair matrix</li>
                    <li>Daily expense and profit audit</li>
                  </ul>
                  <button type="button" className="btn ghost" onClick={() => openLogin('owner')}>
                    Get started
                  </button>
                </div>

                <div className="plan best">
                  <span className="flag">Most popular · Save ₹2,000</span>
                  <h3>12 months</h3>
                  <small>Annual complete salon OS</small>
                  <div className="amt">
                    ₹9,999<s>₹11,999</s>
                  </div>
                  <small>About ₹833 a month, plus 18% GST · ₹11,798.82 total</small>
                  <ul>
                    <li>Everything in 6 months</li>
                    <li>365 days of cloud access</li>
                    <li>360° audit with live net profit</li>
                    <li>VIP onboarding and staff training</li>
                    <li>Custom WhatsApp sender ID and logo</li>
                    <li>Dedicated relationship manager</li>
                  </ul>
                  <button type="button" className="btn gold" onClick={() => openLogin('owner')}>
                    Start annual plan
                  </button>
                </div>

                <div className="plan">
                  <h3>6 months</h3>
                  <small>Half-year growth · Save ₹500</small>
                  <div className="amt">
                    ₹5,499<s>₹5,999</s>
                  </div>
                  <small>About ₹916 a month, plus 18% GST · ₹6,488.82 total</small>
                  <ul>
                    <li>Everything in 3 months</li>
                    <li>Commission and tip tracking</li>
                    <li>Appointment reminders</li>
                    <li>Priority WhatsApp support</li>
                  </ul>
                  <button type="button" className="btn ghost" onClick={() => openLogin('owner')}>
                    Claim 6 months
                  </button>
                </div>
              </div>
              <p className="gst">100% tax compliant. You receive an official GST invoice with every plan.</p>
            </div>
          </section>

          {/* Final Call to Action */}
          <section style={{ paddingTop: 0 }}>
            <div className="wrap">
              <div className="final">
                <h2>Make every salon day effortless.</h2>
                <p className="lead">
                  Fast billing, a live chair queue and automatic WhatsApp invoices on any phone or desktop.
                </p>
                <div className="cta">
                  <a
                    className="btn store-btn gold"
                    href="https://play.google.com/store/apps/details?id=com.stylefleet.app"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg className="store-icon" viewBox="0 0 512 512">
                      <path fill="#4285F4" d="M48.2 24.3C44.7 28 42.7 33.7 42.7 41.3v429.4c0 7.6 2 13.3 5.5 17l2.1 1.9L274.4 265.5v-5.2L50.3 22.4l-2.1 1.9z" />
                      <path fill="#FBBC04" d="M349 340.2l-74.6-74.7v-5.2l74.6-74.7 1.8 1 88.2 50.1c25.2 14.3 25.2 37.8 0 52.2l-88.2 50.1-1.8 1.2z" />
                      <path fill="#EA4335" d="M350.8 339l-76.4-76.4L50.3 486.7c8.3 8.8 22.1 9.9 37.4 1.2L350.8 339z" />
                      <path fill="#34A853" d="M350.8 173L87.7 24.1C72.4 15.4 58.6 16.5 50.3 25.3l224.1 224.1 76.4-76.4z" />
                    </svg>
                    <div>
                      <span className="store-sub">GET IT ON</span>
                      <strong className="store-title">Google Play</strong>
                    </div>
                  </a>

                  <a
                    className="btn store-btn dark-store"
                    style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(246,239,226,0.35)', color: '#F6EFE2' }}
                    id="ios-download"
                    href="#top"
                    onClick={(e) => {
                      e.preventDefault();
                      showToast('StyleFleet iOS App is rolling out on the App Store.', 'success');
                    }}
                  >
                    <svg className="store-icon" viewBox="0 0 170 170" fill="#F6EFE2">
                      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.77-8.7-10.42-18.79-13.97-30.27-3.55-11.48-5.33-22.42-5.33-32.83 0-14.36 3.55-26.33 10.66-35.91 7.11-9.58 16.14-14.43 27.09-14.56 5.34 0 11.27 1.48 17.79 4.43 6.52 2.96 10.74 4.49 12.67 4.49 1.74 0 6.06-1.57 12.96-4.71 6.9-3.14 12.96-4.58 18.18-4.33 13.94.65 24.96 5.86 33.05 15.64-12.19 7.4-18.17 17.51-17.95 30.34.22 10.02 4.13 18.49 11.75 25.43 7.62 6.94 16.75 10.97 27.42 12.09-2.18 6.53-4.91 13.28-8.2 20.25zM119.22 31.84c0-7.72 2.76-14.89 8.28-21.52 5.53-6.63 12.41-10.66 20.65-12.09.22 1.09.33 2.18.33 3.26 0 7.61-2.85 14.86-8.54 21.74-5.69 6.87-12.71 10.87-21.06 12-0.22-1.09-.33-2.18-.33-3.39z" />
                    </svg>
                    <div>
                      <span className="store-sub" style={{ opacity: 0.85 }}>DOWNLOAD ON THE</span>
                      <strong className="store-title">App Store</strong>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* ================= COMPREHENSIVE LUXURY FOOTER ================= */}
          <footer className="footer-luxury border-t border-white/10 bg-[#071329]/95 text-slate-300 py-12">
            <div className="wrap max-w-6xl mx-auto px-4 sm:px-6">
              {/* Top Section: 3 Balanced Columns */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 pb-10">
                {/* Column 1: Brand Logo, Description & App Store Buttons */}
                <div className="md:col-span-6 space-y-4">
                  <a className="logo inline-flex items-center gap-2.5" href="#top" style={{ textDecoration: 'none' }}>
                    <img
                      src="/assets/stylefleet-logo.png"
                      alt="StyleFleet Logo"
                      width={40}
                      height={40}
                      className="logo-img"
                    />
                    <span className="text-xl font-black tracking-tight text-[#D4AF37]">StyleFleet</span>
                  </a>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
                    The modern luxury salon management platform. Express digital billing, real-time appointment scheduling, multi-chair stylist performance matrix, and automated WhatsApp engagement in one calm workspace.
                  </p>

                  {/* App Download Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {/* Google Play Button */}
                    <a
                      className="btn store-btn gold"
                      style={{
                        padding: '9px 18px',
                        minWidth: '170px',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                      href="https://play.google.com/store/apps/details?id=com.stylefleet.app"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg className="store-icon" viewBox="0 0 512 512" style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                        <path fill="#4285F4" d="M48.2 24.3C44.7 28 42.7 33.7 42.7 41.3v429.4c0 7.6 2 13.3 5.5 17l2.1 1.9L274.4 265.5v-5.2L50.3 22.4l-2.1 1.9z" />
                        <path fill="#FBBC04" d="M349 340.2l-74.6-74.7v-5.2l74.6-74.7 1.8 1 88.2 50.1c25.2 14.3 25.2 37.8 0 52.2l-88.2 50.1-1.8 1.2z" />
                        <path fill="#EA4335" d="M350.8 339l-76.4-76.4L50.3 486.7c8.3 8.8 22.1 9.9 37.4 1.2L350.8 339z" />
                        <path fill="#34A853" d="M350.8 173L87.7 24.1C72.4 15.4 58.6 16.5 50.3 25.3l224.1 224.1 76.4-76.4z" />
                      </svg>
                      <div>
                        <span className="store-sub" style={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.1, fontWeight: 700, letterSpacing: '0.06em' }}>
                          GET IT ON
                        </span>
                        <strong className="store-title" style={{ fontSize: '0.98rem', display: 'block', lineHeight: 1.15, fontWeight: 800 }}>
                          Google Play
                        </strong>
                      </div>
                    </a>

                    {/* App Store Button */}
                    <a
                      className="btn store-btn dark-store"
                      style={{
                        padding: '9px 18px',
                        minWidth: '170px',
                        textDecoration: 'none',
                        background: 'rgba(255,255,255,0.06)',
                        borderColor: 'rgba(217, 178, 106, 0.45)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                      href="#ios-download"
                      onClick={(e) => {
                        e.preventDefault();
                        showToast('StyleFleet iOS App is rolling out on the App Store.', 'success');
                      }}
                    >
                      <svg className="store-icon" viewBox="0 0 170 170" fill="currentColor" style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.77-8.7-10.42-18.79-13.97-30.27-3.55-11.48-5.33-22.42-5.33-32.83 0-14.36 3.55-26.33 10.66-35.91 7.11-9.58 16.14-14.43 27.09-14.56 5.34 0 11.27 1.48 17.79 4.43 6.52 2.96 10.74 4.49 12.67 4.49 1.74 0 6.06-1.57 12.96-4.71 6.9-3.14 12.96-4.58 18.18-4.33 13.94.65 24.96 5.86 33.05 15.64-12.19 7.4-18.17 17.51-17.95 30.34.22 10.02 4.13 18.49 11.75 25.43 7.62 6.94 16.75 10.97 27.42 12.09-2.18 6.53-4.91 13.28-8.2 20.25zM119.22 31.84c0-7.72 2.76-14.89 8.28-21.52 5.53-6.63 12.41-10.66 20.65-12.09.22 1.09.33 2.18.33 3.26 0 7.61-2.85 14.86-8.54 21.74-5.69 6.87-12.71 10.87-21.06 12-0.22-1.09-.33-2.18-.33-3.39z" />
                      </svg>
                      <div>
                        <span className="store-sub" style={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.1, fontWeight: 700, letterSpacing: '0.06em', opacity: 0.85 }}>
                          DOWNLOAD ON THE
                        </span>
                        <strong className="store-title" style={{ fontSize: '0.98rem', display: 'block', lineHeight: 1.15, fontWeight: 800 }}>
                          App Store
                        </strong>
                      </div>
                    </a>
                  </div>
                </div>

                {/* Column 2: Contact & Demo */}
                <div className="md:col-span-3 space-y-3">
                  <h4 className="text-xs font-black text-[#D4AF37] uppercase tracking-wider">
                    Contact & Demo
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Request a free salon demo call or live onboarding:
                  </p>
                  <p className="text-sm font-extrabold text-white">
                    <a href="tel:+918870500106" className="hover:text-[#D4AF37] transition-colors inline-flex items-center gap-2" style={{ textDecoration: 'none' }}>
                      <svg className="w-4 h-4 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      +91 88705 00106
                    </a>
                  </p>
                  <div className="flex flex-col gap-2 pt-1 text-xs text-slate-400">
                    <a
                      href="https://wa.me/918870500106?text=Hi%20StyleFleet%2C%20I%20would%20like%20to%20request%20a%20free%20demo%20call."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-400 transition-colors inline-flex items-center gap-2"
                      style={{ textDecoration: 'none' }}
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                      </svg>
                      <span>WhatsApp Demo (+91 88705 00106)</span>
                    </a>
                    <a
                      href="https://instagram.com/stylefleet.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#D4AF37] transition-colors inline-flex items-center gap-2"
                      style={{ textDecoration: 'none' }}
                    >
                      <svg className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                      </svg>
                      <span>Instagram (@stylefleet.app)</span>
                    </a>
                  </div>
                </div>

                {/* Column 3: Company, Legal & Policies */}
                <div className="md:col-span-3 space-y-3">
                  <h4 className="text-xs font-black text-[#D4AF37] uppercase tracking-wider">
                    Company & Legal
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    © 2026 StyleFleet. Powered by{' '}
                    <a
                      href="https://tecstellar.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white hover:text-[#D4AF37] underline underline-offset-4 decoration-[#D4AF37]/50 hover:decoration-[#D4AF37] transition-colors"
                    >
                      Tecstellar
                    </a>
                    .
                  </p>
                  <div className="flex flex-col gap-2 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="text-left text-slate-400 hover:text-white transition-colors underline underline-offset-3 cursor-pointer bg-transparent border-0 p-0"
                    >
                      Privacy Policy
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-left text-slate-400 hover:text-white transition-colors underline underline-offset-3 cursor-pointer bg-transparent border-0 p-0"
                    >
                      Terms and Conditions
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Only Admin Link */}
              <div className="border-t border-white/10 pt-5 pb-2 flex items-center justify-end text-xs">
                <a
                  href="https://stylefleet-admin.tecstellar.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                  className="text-xs font-bold text-slate-500/80 hover:text-[#D4AF37] tracking-wider transition-colors select-none"
                  title="StyleFleet Master Admin Portal"
                >
                  Admin
                </a>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ================= VIEW 2: DEDICATED CLEAN LOGIN PAGE ================= */}
      {view === 'login' && (
        <div className="min-h-screen flex flex-col justify-between">
          <nav>
            <div className="wrap">
              <button type="button" className="logo" onClick={returnHome}>
                <img
                  src="/assets/stylefleet-logo.png"
                  alt="StyleFleet Logo"
                  width={34}
                  height={34}
                  className="logo-img"
                />
                <span>StyleFleet</span>
              </button>
              <button type="button" className="btn ghost" onClick={returnHome}>
                ← Back to Home
              </button>
            </div>
          </nav>

          <section className="min-h-[calc(100vh-160px)] flex items-center justify-center p-4 sm:p-8 relative z-10">
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl bg-[#0B1E3B]">
              
              {/* Left Visual Panel - Dynamically switches between Owner & Stylist */}
              <div className="hidden md:block md:col-span-5 relative bg-[#07152B] overflow-hidden min-h-[520px]">
                {/* 1. Salon Owner Visual */}
                <div
                  className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                    role === 'owner' ? 'opacity-100 scale-100 z-10 pointer-events-auto' : 'opacity-0 scale-105 z-0 pointer-events-none'
                  }`}
                >
                  <img
                    src="/images/owner-workspace.jpg"
                    alt="Executive Salon Owner Workspace"
                    className="w-full h-full object-cover object-center filter brightness-[0.95] contrast-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07152B] via-[#07152B]/45 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0B1E3B]/70" />
                </div>

                {/* 2. Stylist Visual */}
                <div
                  className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                    role === 'stylist' ? 'opacity-100 scale-100 z-10 pointer-events-auto' : 'opacity-0 scale-105 z-0 pointer-events-none'
                  }`}
                >
                  <img
                    src="/images/stylist-workspace.jpg"
                    alt="Master Hair Stylist Workspace"
                    className="w-full h-full object-cover object-center filter brightness-[0.95] contrast-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07152B] via-[#07152B]/45 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0B1E3B]/70" />
                </div>

                {/* Visual Panel Info Overlay */}
                <div className="absolute bottom-8 left-7 right-7 z-20 space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#07152B]/95 border border-[#F5A623]/50 shadow-lg">
                    <div className="w-5 h-5 rounded-md overflow-hidden flex items-center justify-center p-0.5 bg-[#F5A623]/20 shrink-0">
                      <img src="/assets/stylefleet-logo.png" alt="StyleFleet" width={20} height={20} className="w-5 h-5 object-contain" />
                    </div>
                    <span className="text-[11px] font-bold text-[#F5A623] uppercase tracking-wider flex items-center gap-1.5">
                      {role === 'owner' ? (
                        <>
                          <Crown className="w-3.5 h-3.5 text-[#F5A623]" />
                          <span>Owner Workspace</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3.5 h-3.5 text-[#F5A623]" />
                          <span>Stylist Workspace</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-extrabold text-white tracking-tight">
                      {role === 'owner' ? 'Total Salon Command' : 'Precision Hair & Beauty'}
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed font-normal bg-[#07152B]/90 p-3 rounded-2xl border border-white/10 shadow-md">
                      {role === 'owner'
                        ? '“Complete visibility over express billing, chair schedules, staff commissions, and real-time revenue analytics.”'
                        : '“Dedicated chair schedules, service queues, personal tips tally, and transparent commission audits built for artists.”'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-[#F5A623]">
                    <span>Unified Luxury Salon Management Platform</span>
                  </div>
                </div>
              </div>

              {/* Right Form Panel */}
              <div className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
                
                {/* Title & Badge */}
                <div className="space-y-1 mb-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-extrabold text-white tracking-tight">
                      {role === 'owner' ? 'Salon Owner Workspace' : 'Stylist Workspace'}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/30">
                      {role === 'owner' ? (
                        <>
                          <Crown className="w-3 h-3 text-[#F5A623]" />
                          <span>Owner</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3 h-3 text-[#F5A623]" />
                          <span>Stylist</span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    {role === 'owner'
                      ? 'Sign in to access your salon billing, appointments, staff team & real-time revenue analytics.'
                      : 'Sign in to review your scheduled appointments, active chair queue & personal tips.'}
                  </p>
                </div>

                {/* Interactive Slider Switcher: Link with App QR vs Mobile OTP */}
                <div className="p-1.5 bg-[#07152B] border border-white/10 rounded-2xl flex items-center gap-1.5 my-4 shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode('qr');
                      generateQrSession();
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      loginMode === 'qr'
                        ? 'bg-[#D4AF37] text-[#07152B] shadow-md shadow-[#D4AF37]/25 font-extrabold'
                        : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Scan with App</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#07152B]/20 uppercase tracking-wider font-extrabold">
                      Instant
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMode('otp')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      loginMode === 'otp'
                        ? 'bg-[#D4AF37] text-[#07152B] shadow-md shadow-[#D4AF37]/25 font-extrabold'
                        : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Mobile OTP & Register</span>
                  </button>
                </div>

                {/* ================= OPTION 1: SCAN WITH APP (LINK TO PC) ================= */}
                {loginMode === 'qr' && (
                  <div className="space-y-4 pt-1">
                    {/* Role toggle */}
                    <div className="flex items-center justify-between px-3 py-2 bg-[#07152B] rounded-xl border border-white/5 text-xs">
                      <span className="text-[#94A3B8]">Sign in workspace as:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRole('owner')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            role === 'owner' ? 'bg-[#D4AF37] text-[#07152B]' : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Owner</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole('stylist')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            role === 'stylist' ? 'bg-[#D4AF37] text-[#07152B]' : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Stylist</span>
                        </button>
                      </div>
                    </div>

                    {/* QR Code Container */}
                    <div className="flex flex-col items-center justify-center p-5 bg-[#07152B] border border-white/10 rounded-2xl relative shadow-2xl">
                      <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-[#D4AF37]/40 relative">
                        {isLoadingQr ? (
                          <div className="w-48 h-48 flex flex-col items-center justify-center gap-2 bg-white rounded-xl">
                            <span className="w-7 h-7 border-2 border-[#07152B] border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold text-[#07152B]">Generating Secure QR...</span>
                          </div>
                        ) : isQrExpired ? (
                          <div className="w-48 h-48 flex flex-col items-center justify-center gap-3 bg-[#07152B] text-white rounded-xl p-3 text-center">
                            <span className="text-xs text-[#94A3B8]">Code expired</span>
                            <button
                              type="button"
                              onClick={generateQrSession}
                              className="px-3.5 py-2 bg-[#D4AF37] text-[#07152B] rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:bg-[#C59F2E] cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Regenerate QR</span>
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <img
                              src={qrDataUrl}
                              alt="StyleFleet Desktop Link QR Code"
                              width={192}
                              height={192}
                              className="rounded-xl block"
                            />
                            {/* Center StyleFleet Logo Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-10 h-10 rounded-xl bg-[#07152B] border border-[#D4AF37] p-1 flex items-center justify-center shadow-lg">
                                <img src="/assets/stylefleet-logo.png" alt="SF" width={22} height={22} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Live Waiting Pulse & Expiry */}
                      <div className="flex items-center justify-between w-full mt-4 pt-3 border-t border-white/5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                          <span className="text-slate-300 font-medium text-[11px]">Waiting for mobile app scan...</span>
                        </div>

                        <div className="flex items-center gap-2 text-[#94A3B8]">
                          <span className="text-[11px] font-mono">
                            {Math.floor(qrExpiresIn / 60)}:{(qrExpiresIn % 60).toString().padStart(2, '0')}
                          </span>
                          <button
                            type="button"
                            onClick={generateQrSession}
                            title="Refresh QR Code"
                            className="p-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQr ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* How to Link Instructions Card */}
                    <div className="p-3.5 rounded-2xl bg-[#07152B] border border-white/5 text-left space-y-2">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-[#F5A623]" />
                        <span>How to link with StyleFleet Mobile App:</span>
                      </div>
                      <ol className="text-[11px] text-[#94A3B8] space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
                        <li>Open the <strong className="text-white">StyleFleet App</strong> on your phone</li>
                        <li>Go to <strong className="text-white">Settings / Account</strong> → Tap <strong className="text-[#F5A623]">Link to PC</strong></li>
                        <li>Scan this QR code with the app scanner to log in instantly</li>
                      </ol>
                    </div>

                    {/* Simulator Accordion for Instant Web Testing */}
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => setShowQrSim(!showQrSim)}
                        className="text-[11px] text-[#D4AF37] hover:underline font-semibold cursor-pointer"
                      >
                        {showQrSim ? '▼ Hide App Simulator' : '⚡ Test Link from Web (Mobile App Simulator)'}
                      </button>

                      {showQrSim && (
                        <div className="mt-2 p-3 bg-[#07152B] border border-[#D4AF37]/30 rounded-xl space-y-2 text-left">
                          <div className="text-[11px] font-bold text-white">Simulate Mobile App Confirmation</div>
                          <p className="text-[10px] text-[#94A3B8]">
                            Enter your registered salon mobile number to approve desktop login instantly:
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="tel"
                              placeholder="Mobile (e.g. 8870500106)"
                              value={simPhone}
                              onChange={(e) => setSimPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-[#0F223D] border border-white/10 text-xs text-white outline-none focus:border-[#F5A623]"
                            />
                            <button
                              type="button"
                              disabled={isSimulating || !qrSessionId}
                              onClick={handleSimulateAppScan}
                              className="px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#C59F2E] text-[#07152B] font-extrabold text-xs shrink-0 disabled:opacity-50 cursor-pointer"
                            >
                              {isSimulating ? 'Linking...' : 'Confirm Link'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ================= OPTION 2: MOBILE OTP & REGISTER ================= */}
                {loginMode === 'otp' && (
                  <div className="space-y-4 pt-1">
                    {/* Role Selection Tabs */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          setRole('owner');
                          setAuthStep('phone');
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          role === 'owner'
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15 -translate-y-0.5'
                            : 'bg-[#07152B] border-white/5 hover:border-white/20'
                        }`}
                      >
                        <Crown className={`w-5 h-5 mb-1.5 ${role === 'owner' ? 'text-[#F5A623]' : 'text-[#94A3B8]'}`} />
                        <strong className="text-xs block font-bold text-white">Salon Owner</strong>
                        <span className="text-[10px] text-[#94A3B8] block mt-0.5">Billing & Management</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRole('stylist');
                          setAuthStep('phone');
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          role === 'stylist'
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15 -translate-y-0.5'
                            : 'bg-[#07152B] border-white/5 hover:border-white/20'
                        }`}
                      >
                        <Scissors className={`w-5 h-5 mb-1.5 ${role === 'stylist' ? 'text-[#F5A623]' : 'text-[#94A3B8]'}`} />
                        <strong className="text-xs block font-bold text-white">Stylist</strong>
                        <span className="text-[10px] text-[#94A3B8] block mt-0.5">Queue & Daily Tips</span>
                      </button>
                    </div>

                    {/* STEP 1: MOBILE INPUT */}
                    {authStep === 'phone' && (
                      <form onSubmit={handlePhoneSubmit} className="space-y-4">
                        <div>
                          <label htmlFor="mobile-input" className="block text-xs font-bold text-[#94A3B8] mb-2">
                            Mobile Number
                          </label>
                          <div className="relative flex items-center">
                            <span className="absolute left-4 text-sm font-bold text-[#F5A623] select-none">+91</span>
                            <input
                              id="mobile-input"
                              type="tel"
                              maxLength={10}
                              inputMode="numeric"
                              placeholder="Enter 10-digit mobile number"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              required
                              className="w-full py-3.5 pl-14 pr-4 rounded-2xl bg-[#07152B] border border-white/10 focus:border-[#F5A623] outline-none text-white text-sm font-semibold transition-all placeholder:text-[#94A3B8]/50"
                            />
                          </div>
                        </div>

                        {/* Terms and Policy Agreement */}
                        <div
                          className="flex items-center gap-2.5 pt-0.5 select-none cursor-pointer group"
                          onClick={() => setAgreeToTerms(!agreeToTerms)}
                        >
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                              agreeToTerms
                                ? 'bg-[#D4AF37] border-[#D4AF37] text-[#07152B]'
                                : 'bg-[#07152B] border-white/30 group-hover:border-[#D4AF37]/60'
                            }`}
                          >
                            {agreeToTerms && (
                              <svg className="w-3 h-3 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <label className="text-[11px] text-[#94A3B8] cursor-pointer leading-tight group-hover:text-slate-300">
                            I agree to the{' '}
                            <span
                              className="text-[#D4AF37] font-semibold hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTermsModal(true);
                              }}
                            >
                              Terms of Service
                            </span>{' '}
                            &{' '}
                            <span
                              className="text-[#D4AF37] font-semibold hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPrivacyModal(true);
                              }}
                            >
                              Privacy Policy
                            </span>
                          </label>
                        </div>

                        <button
                          type="submit"
                          disabled={isSendingOtp}
                          className={`py-3.5 px-4 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#07152B] text-sm font-extrabold shadow-lg shadow-[#D4AF37]/25 active:scale-[0.98] transition-all w-full flex items-center justify-center gap-2 cursor-pointer ${
                            isSendingOtp ? 'opacity-70 cursor-wait' : ''
                          }`}
                        >
                          {isSendingOtp ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-[#07152B] border-t-transparent rounded-full animate-spin" />
                              <span>Sending OTP...</span>
                            </>
                          ) : (
                            <>
                              <span>Continue with Mobile</span>
                              <span>→</span>
                            </>
                          )}
                        </button>
                      </form>
                    )}

                    {/* STEP 2: SMS OTP VERIFICATION */}
                    {authStep === 'otp' && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          verifyOtp(otp.join(''));
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-[#94A3B8]">SMS Verification Code</label>
                            <button
                              type="button"
                              onClick={() => setAuthStep('phone')}
                              className="text-xs text-[#F5A623] hover:underline font-semibold cursor-pointer"
                            >
                              Change Number
                            </button>
                          </div>
                          <p className="text-xs text-[#94A3B8] mb-3">
                            Enter the 6-digit code dispatched via SMS to <strong className="text-white">+91 {phone}</strong>
                          </p>

                          <div className="grid grid-cols-6 gap-2">
                            {otp.map((digit, idx) => (
                              <input
                                key={idx}
                                ref={(el) => {
                                  otpRefs.current[idx] = el;
                                }}
                                type="text"
                                maxLength={1}
                                inputMode="numeric"
                                value={digit}
                                onChange={(e) => handleOtpChange(idx, e.target.value)}
                                onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                onPaste={handleOtpPaste}
                                className="w-full h-11 sm:h-12 text-center text-lg sm:text-xl font-bold bg-[#07152B] border border-white/10 rounded-xl sm:rounded-2xl text-white outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 transition-all"
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                          <span>
                            {canResend ? (
                              <button
                                type="button"
                                onClick={handleResend}
                                className="text-[#F5A623] font-bold hover:underline cursor-pointer"
                              >
                                Resend code
                              </button>
                            ) : (
                              `Resend code in ${countdown}s`
                            )}
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={isVerifyingOtp}
                          className={`py-3.5 px-4 rounded-2xl bg-[#D4AF37] hover:bg-[#C59F2E] text-[#07152B] text-sm font-extrabold shadow-lg shadow-[#D4AF37]/25 active:scale-[0.98] transition-all w-full flex items-center justify-center gap-2 cursor-pointer ${
                            isVerifyingOtp ? 'opacity-70 cursor-wait' : ''
                          }`}
                        >
                          {isVerifyingOtp ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-[#07152B] border-t-transparent rounded-full animate-spin" />
                              <span>Verifying OTP...</span>
                            </>
                          ) : (
                            <>
                              <span>Verify & Access Workspace</span>
                              <span>↗</span>
                            </>
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                )}

              </div>
            </div>
          </section>

          {/* ================= COMPREHENSIVE LUXURY FOOTER (LOGIN VIEW) ================= */}
          <footer className="footer-luxury border-t border-white/10 bg-[#071329]/95 text-slate-300 py-10 mt-12">
            <div className="wrap max-w-6xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8">
                <div className="md:col-span-6 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/assets/stylefleet-logo.png"
                      alt="StyleFleet Logo"
                      width={36}
                      height={36}
                      className="logo-img"
                    />
                    <span className="text-lg font-black tracking-tight text-[#D4AF37]">StyleFleet</span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                    The modern luxury salon management platform. Express digital billing, real-time appointments, stylist performance, and WhatsApp customer engagement.
                  </p>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <h4 className="text-xs font-black text-[#D4AF37] uppercase tracking-wider">Contact</h4>
                  <p className="text-xs text-white font-bold">
                    <a href="tel:+918870500106" className="hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5" style={{ textDecoration: 'none' }}>
                      <svg className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      +91 88705 00106
                    </a>
                  </p>
                  <div className="flex flex-col gap-1.5 text-xs text-slate-400">
                    <a
                      href="https://wa.me/918870500106?text=Hi%20StyleFleet%2C%20I%20would%20like%20to%20request%20a%20free%20demo%20call."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                      style={{ textDecoration: 'none' }}
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.06-2.131-.538-1.839-.765-3.023-2.627-3.114-2.748-.09-.122-.745-.989-.745-1.895 0-.907.472-1.352.641-1.536.17-.184.37-.23.493-.23.123 0 .247.001.355.006.114.005.267-.043.418.32.155.371.531 1.294.577 1.389.047.094.078.204.016.326-.062.123-.093.2-.185.309-.092.109-.194.244-.277.328-.093.094-.19.196-.082.381.108.185.481.794 1.031 1.285.709.632 1.306.828 1.492.92.185.093.293.078.401-.047.108-.124.463-.54.586-.726.123-.185.247-.154.416-.093.17.062 1.079.509 1.264.601.185.093.308.139.354.216.046.078.046.452-.098.857z" />
                      </svg>
                      <span>WhatsApp (+91 88705 00106)</span>
                    </a>
                    <a
                      href="https://instagram.com/stylefleet.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5"
                      style={{ textDecoration: 'none' }}
                    >
                      <svg className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                      </svg>
                      <span>@stylefleet.app</span>
                    </a>
                  </div>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <h4 className="text-xs font-black text-[#D4AF37] uppercase tracking-wider">Company & Legal</h4>
                  <p className="text-xs text-slate-300">
                    © 2026 StyleFleet. Powered by{' '}
                    <a
                      href="https://tecstellar.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-white hover:text-[#D4AF37] underline underline-offset-4 decoration-[#D4AF37]/50 transition-colors"
                    >
                      Tecstellar
                    </a>
                    .
                  </p>
                  <div className="flex gap-3 text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="text-slate-400 hover:text-white underline underline-offset-3 cursor-pointer bg-transparent border-0 p-0"
                    >
                      Privacy Policy
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-slate-400 hover:text-white underline underline-offset-3 cursor-pointer bg-transparent border-0 p-0"
                    >
                      Terms
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-5 pb-2 flex items-center justify-end text-xs">
                <a
                  href="https://stylefleet-admin.tecstellar.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                  className="text-xs font-bold text-slate-500/80 hover:text-[#D4AF37] tracking-wider transition-colors select-none"
                  title="StyleFleet Master Admin Portal"
                >
                  Admin
                </a>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/* ================= PRIVACY POLICY MODAL ================= */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#07152B] border border-[#D4AF37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 text-left max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white">StyleFleet Privacy Policy</h3>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white block mb-0.5">1. Salon Data Ownership:</strong>
                All salon client records, phone numbers, visit histories, appointment bookings, services rendered, pricing, digital bills, and daily revenue metrics entered into StyleFleet remain the exclusive and confidential property of your salon.
              </p>
              <p>
                <strong className="text-white block mb-0.5">2. Client Data & WhatsApp Delivery:</strong>
                Client phone numbers are utilized strictly for account security, appointment notifications, and delivering official digital invoices via WhatsApp or SMS. Client contact information is never sold, leased, or shared with third-party advertisers.
              </p>
              <p>
                <strong className="text-white block mb-0.5">3. Staff & Financial Privacy:</strong>
                Stylist commissions, attendance records, tip allocations, and owner financial dashboards are secured by role-based authentication and restricted permissions.
              </p>
              <p>
                <strong className="text-white block mb-0.5">4. Cloud Encryption & Security:</strong>
                All transactions and database logs are encrypted using enterprise TLS/SSL in transit and end-to-end encrypted storage powered by Supabase.
              </p>
              <p>
                <strong className="text-white block mb-0.5">5. Operator & Data Rights:</strong>
                StyleFleet is engineered and operated by <strong className="text-white">Tecstellar Technologies</strong> (<a href="https://tecstellar.com" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">tecstellar.com</a>). For data inquiries or account deletion, contact our support desk at <strong>+91 88705 00106</strong>.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-[#07152B] font-bold text-xs shadow-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TERMS AND CONDITIONS MODAL ================= */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#07152B] border border-[#D4AF37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 text-left max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white">Terms & Conditions</h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white block mb-0.5">1. Platform Services:</strong>
                StyleFleet provides comprehensive cloud salon management software, including express digital POS billing, live multi-chair matrix tracking, appointment scheduling, and automated WhatsApp invoice delivery.
              </p>
              <p>
                <strong className="text-white block mb-0.5">2. Account Responsibility & Security:</strong>
                Salon owners and staff are responsible for maintaining confidentiality of their mobile login OTPs and managing team access permissions within their workspace.
              </p>
              <p>
                <strong className="text-white block mb-0.5">3. Billing & Due Settlement Accuracy:</strong>
                The platform computes transaction totals, GST, partial payments, and pending dues based on salon inputs. Settle due records synchronize seamlessly across the web workspace and the StyleFleet Android application.
              </p>
              <p>
                <strong className="text-white block mb-0.5">4. Subscriptions & Taxation:</strong>
                Stated plans are billed in Indian Rupees (INR) exclusive of applicable 18% GST (9% CGST + 9% SGST). Computer-generated tax invoices are issued automatically upon subscription activation.
              </p>
              <p>
                <strong className="text-white block mb-0.5">5. Operator & Intellectual Property:</strong>
                StyleFleet is engineered and powered by <strong className="text-white">Tecstellar Technologies</strong> (<a href="https://tecstellar.com" target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] underline">tecstellar.com</a>). All intellectual property rights are reserved. Support hotline: <strong>+91 88705 00106</strong>.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="px-5 py-2 rounded-xl bg-[#D4AF37] text-[#07152B] font-bold text-xs shadow-md cursor-pointer"
              >
                Accept & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TOAST NOTIFICATION ================= */}
      {toast && (
        <div
          className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl bg-[#0B1E3B] border shadow-2xl text-xs font-bold flex items-center gap-3"
          style={{ borderColor: toast.type === 'error' ? '#EF4444' : '#F5A623' }}
        >
          {toast.type === 'error' ? (
            <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="text-white">{toast.message}</span>
        </div>
      )}

    </div>
  );
}
