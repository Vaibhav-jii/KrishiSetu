import React, { useState, useEffect } from "react";
import { LayoutDashboard, Leaf, TrendingUp, FileText, Cloud, BarChart3, ChevronRight, Menu, Download, Settings, LogOut, Globe } from "lucide-react";
import DashboardPage from "../screens/DashboardPage";
import CropAnalysisPage from "../screens/CropAnalysisPage";
import MarketForecastPage from "../screens/MarketForecastPage";
import GovernmentSchemesPage from "../screens/GovernmentSchemesPage";
import WeatherPage from "../screens/WeatherPage";
import ReportsPage from "../screens/ReportsPage";
import SettingsPage from "../screens/SettingsPage";
import Login from "../login/Login";
import Landing from "../landing/landing";
import AdminPortal from "../admin/AdminPortal";
import { useLanguage } from "../contexts/LanguageContext";
import { getProfile } from "../utils/settingsStore";
import { syncReportsFromBackend } from "../utils/reportStore";
import MicButton from "../components/MicButton";
import VoiceOverlay from "../components/VoiceOverlay";
import { useUser, useClerk, AuthenticateWithRedirectCallback } from "@clerk/clerk-react";

type PageId = "dashboard" | "crop" | "market" | "schemes" | "weather" | "reports" | "settings";

export default function App() {
  const { t, lang, setLang } = useLanguage();
  const profile = getProfile();
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sessionId] = useState(() => "farmer_" + Math.random().toString(36).substring(2, 11));
  const [preloadedReport, setPreloadedReport] = useState<{ session_id: string; fullReport: string; crop: string } | null>(null);

  // Wrap setActivePage to clear preloadedReport when navigating away from crop
  const navigateTo = (page: any) => {
    if (page !== "crop") setPreloadedReport(null);
    setActivePage(page as PageId);
  };

  // Clerk user state
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();

  // Dedicated OAuth callback route — this MUST stay rendered until Clerk finishes
  const isSSOCallback = window.location.pathname === "/sso-callback";
  
  // Auth state
  const [authPhase, setAuthPhase] = useState<"landing" | "login" | "app" | "admin">(() => {
    if (localStorage.getItem("krishisetu_admin")) return "admin";
    if (localStorage.getItem("krishisetu_user")) return "app";
    return "landing";
  });

  // When Clerk finishes OAuth OR when a stale Clerk session exists after refresh,
  // sync user to Supabase and go straight to app
  useEffect(() => {
    if (!clerkLoaded || !clerkUser) return;
    if (isSSOCallback) return; // Let AuthenticateWithRedirectCallback handle it
    // Skip if already in the app or admin
    if (authPhase === "app" || authPhase === "admin") return;
    
    const email = clerkUser.primaryEmailAddress?.emailAddress || "";
    const name = clerkUser.fullName || "Farmer";
    const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
    fetch(`${API}/auth/clerk-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem("krishisetu_user", JSON.stringify(data.user));
        }
        window.history.replaceState({}, "", "/");
        setAuthPhase("app");
      })
      .catch(() => {
        window.history.replaceState({}, "", "/");
        setAuthPhase("login");
      });
  }, [clerkLoaded, clerkUser, authPhase]);

  React.useEffect(() => {
    if (authPhase === "app") {
      syncReportsFromBackend();
    }
  }, [authPhase]);

  // SSO callback page — Clerk redirects here after Google/GitHub auth.
  // AuthenticateWithRedirectCallback MUST stay mounted until it finishes processing.
  if (isSSOCallback) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <AuthenticateWithRedirectCallback />
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e5e5e5", borderTopColor: "#2d5a1b", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#737373", fontSize: 14 }}>Completing sign in...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  // Show loading while Clerk loads OR while syncing a detected Clerk user
  // This prevents the landing page flash after OAuth redirect
  if ((authPhase === "landing" || authPhase === "login") && (!clerkLoaded || clerkUser)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e5e5e5", borderTopColor: "#2d5a1b", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authPhase === "landing") {
    return <Landing onEnter={() => setAuthPhase("login")} />;
  }

  if (authPhase === "login") {
    return <Login onLogin={() => setAuthPhase("app")} onAdminLogin={() => setAuthPhase("admin")} />;
  }

  if (authPhase === "admin") {
    return <AdminPortal onLogout={() => setAuthPhase("landing")} />;
  }

  const NAV_ITEMS: { id: PageId; labelKey: string; icon: any }[] = [
    { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { id: "crop", labelKey: "nav.crop", icon: Leaf },
    { id: "market", labelKey: "nav.market", icon: TrendingUp },
    { id: "schemes", labelKey: "nav.schemes", icon: FileText },
    { id: "weather", labelKey: "nav.weather", icon: Cloud },
    { id: "reports", labelKey: "nav.reports", icon: BarChart3 },
    { id: "settings", labelKey: "nav.settings", icon: Settings },
  ];

  const pageTitle: Record<PageId, string> = {
    dashboard: t("dash.title"),
    crop: t("crop.title"),
    market: t("market.title"),
    schemes: t("schemes.title"),
    weather: t("weather.title"),
    reports: t("reports.title"),
    settings: t("settings.title"),
  };

  function renderPage() {
    switch (activePage) {
      case "dashboard": return <DashboardPage navigate={navigateTo} />;
      case "crop":      return <CropAnalysisPage preloadedReport={preloadedReport} />;
      case "market":    return <MarketForecastPage />;
      case "schemes":   return <GovernmentSchemesPage />;
      case "weather":   return <WeatherPage />;
      case "reports":   return <ReportsPage navigate={navigateTo} onContinueChat={(report) => { setPreloadedReport(report); navigateTo("crop"); }} />;
      case "settings":  return <SettingsPage />;
    }
  }

  const contextItems = [
    profile.name || "Kisan",
    profile.location ? `${profile.location}, ${profile.state}` : t("dash.subtitle"),
    profile.landAcres ? `${profile.landAcres} Acres` : ""
  ].filter(Boolean);

  async function handleLogout() {
    localStorage.removeItem("krishisetu_user");
    localStorage.removeItem("krishisetu_admin");
    await signOut();
    setAuthPhase("landing");
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-[210px] border-r border-border flex flex-col flex-shrink-0 bg-background transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {/* Logo */}
        <div className="h-[52px] flex items-center px-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex-shrink-0">
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2C10 2 5 7 5 12C5 14.76 7.24 17 10 17C12.76 17 15 14.76 15 12C15 7 10 2 10 2Z" fill="#2d5a1b" fillOpacity="0.15" stroke="#2d5a1b" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 17V19" stroke="#2d5a1b" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 8L13 11" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M10 10L7 12" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">
              Krishi<span className="text-[#2d5a1b]">Setu</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2 mt-1">{t("nav.platform")}</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { navigateTo(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-sm text-[13px] text-left transition-colors mb-px ${active ? "bg-[#edf3e8] text-[#2d5a1b] font-medium" : "text-muted-foreground hover:text-foreground hover:bg-[#f5f5f4]"}`}
              >
                <Icon size={14} strokeWidth={active ? 2 : 1.5} />
                {t(item.labelKey)}
              </button>
            );
          })}

          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2 mt-5">{t("nav.context")}</div>
          {contextItems.map((item, i) => (
            <div key={i} className="px-3 py-[5px] text-[11.5px] text-muted-foreground">{item}</div>
          ))}
        </nav>

        <div className="px-4 py-2 border-t border-border flex-shrink-0">
          <button onClick={handleLogout} className="flex items-center gap-2 text-[12px] text-red-600 hover:text-red-700 w-full font-medium py-1">
            <LogOut size={14} />
            Logout
          </button>
        </div>


      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-[52px] border-b border-border flex items-center justify-between px-5 lg:px-8 bg-background flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground hidden sm:block">KrishiSetu</span>
              <ChevronRight size={12} className="text-muted-foreground hidden sm:block" />
              <span className="text-foreground font-medium">{pageTitle[activePage]}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground hidden md:block">
              {profile.location || "Agra Dist."} · {profile.name || "Farmer"}
            </span>
            <button
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-sm border border-border hover:border-[#2d5a1b] hover:bg-[#edf3e8] transition-colors text-foreground"
              title={lang === "en" ? "Switch to Hindi" : "Switch to English"}
            >
              <Globe size={13} className="text-[#2d5a1b]" />
              {lang === "en" ? "हिं" : "EN"}
            </button>
            {activePage === "crop" && (
              <button className="flex items-center gap-1.5 text-[12px] bg-foreground text-background px-3 py-1.5 rounded-sm hover:opacity-90 transition-opacity font-medium">
                <Download size={12} />
                <span className="hidden sm:block">{t("crop.downloadPdf")}</span>
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 lg:px-10 py-8">
            {renderPage()}
          </div>
        </main>
      </div>

      <MicButton onClick={() => setVoiceOpen(true)} visible={!voiceOpen} />
      <VoiceOverlay
        voiceOpen={voiceOpen}
        setVoiceOpen={setVoiceOpen}
        setActivePage={navigateTo}
        sessionId={sessionId}
        pageContext={[
          `Current page: ${activePage}`,
          `Farmer: ${profile.name || "Unknown"}`,
          `Location: ${profile.location || "Agra"}, ${profile.state || "Uttar Pradesh"}`,
          profile.landAcres ? `Land: ${profile.landAcres} acres` : "",
        ].filter(Boolean).join(" | ")}
      />
    </div>
  );
}
