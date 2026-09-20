import { useState, useEffect } from "react";
import { Eye, EyeOff, ArrowRight, Leaf, Shield, BarChart3, FileText, Github } from "lucide-react";
import { useSignIn, useSignUp, useClerk } from "@clerk/clerk-react";

interface LoginProps {
  onLogin?: () => void;
  onAdminLogin?: () => void;
}

export default function Login({ onLogin, onAdminLogin }: LoginProps = {}) {
  const [showPassword, setShowPassword] = useState(false);
  const [farmerId, setFarmerId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Mode: 'login' | 'register' | 'forgot-password'
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: isLoadedSignUp, signUp, setActive: setActiveSignUp } = useSignUp();
  const { signOut } = useClerk();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>('login');

  // Registration specific state
  const [regName, setRegName] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regLand, setRegLand] = useState("");
  const [regPhone, setRegPhone] = useState("");

  type Role = "officer" | "admin";
  const [role, setRole] = useState<Role>("officer");
  const isAdmin = role === "admin";
  const accentDark = isAdmin ? "#0f1f2e" : "#1a3310";
  const accentHover = isAdmin ? "#1a3348" : "#2d5a1b";
  const accentGreen = "#2d5a1b";
  const setIdentifier = setFarmerId;
  const identifier = farmerId;

  // Real stats from backend
  const [stats, setStats] = useState([
    { value: "-", label: "Registered Farmers" },
    { value: "-", label: "Reports This Month" }
  ]);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
    fetch(`${API}/stats`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats([
            { value: data.registered_farmers, label: "Registered Farmers" },
            { value: data.reports_this_month, label: "Reports This Month" }
          ]);
        }
      })
      .catch(() => { });
  }, []);



  const syncClerkUser = async (email: string, name: string, phone: string, city: string, land_owned: string) => {
    try {
      const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/auth/clerk-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, phone, city, land_owned })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("krishisetu_user", JSON.stringify(data.user));
      }
    } catch (err) {
      console.error("Sync failed", err);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

    if (isAdmin) {
      try {
        const res = await fetch(`${API}/auth/admin-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Invalid admin credentials");
          setLoading(false);
          return;
        }
        localStorage.setItem("krishisetu_admin", JSON.stringify(data.admin));
        setLoading(false);
        onAdminLogin?.();
      } catch (err: any) {
        setError("Unable to connect to server");
        setLoading(false);
      }
      return;
    }

    try {
      if (mode === 'register') {
        const res = await fetch(`${API}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: regName,
            city: regCity,
            email: farmerId,
            password,
            phone: regPhone,
            land_owned: regLand,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Registration failed");
          setLoading(false);
          return;
        }
        localStorage.setItem("krishisetu_user", JSON.stringify(data.user));
        setSuccess("Account created successfully!");
        setLoading(false);
        onLogin?.();
        return;
      }

      if (mode === 'forgot-password') {
        const res = await fetch(`${API}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: farmerId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Password reset failed");
          setLoading(false);
          return;
        }
        setSuccess(data.message || "Temporary password sent! Check your email.");
        setLoading(false);
        return;
      }

      // Direct Login (Zero 2FA, instant authentication for recruiters & demo)
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: farmerId, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Invalid email or password");
        setLoading(false);
        return;
      }

      localStorage.setItem("krishisetu_user", JSON.stringify(data.user));
      setLoading(false);
      onLogin?.();
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Could not connect to backend server. Please make sure backend is running.");
    } finally {
      setLoading(false);
    }
  }

  const [oauthLoading, setOauthLoading] = useState(false);

  const handleOAuth = async (provider: "oauth_google" | "oauth_github") => {
    setError("");
    setOauthLoading(true);
    try {
      // Prefer signUp (handles both new + existing users)
      if (isLoadedSignUp && signUp) {
        await signUp.authenticateWithRedirect({
          strategy: provider,
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/"
        });
      } else if (isLoaded && signIn) {
        await signIn.authenticateWithRedirect({
          strategy: provider,
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/"
        });
      }
    } catch (err: any) {
      console.error("OAuth error:", err);
      setOauthLoading(false);
      setError(err.errors?.[0]?.longMessage || err.errors?.[0]?.message || "OAuth sign-in failed. Please try again.");
    }
  };
  const features = [
    { icon: Leaf, label: "Crop disease detection & advisory" },
    { icon: BarChart3, label: "Live market price forecasts" },
    { icon: FileText, label: "Government scheme eligibility" },
    { icon: Shield, label: "Secure farmer data portal" },
  ];

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {/* ── Left panel ────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: accentDark }}
      >
        {/* Subtle texture overlay — fine dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />

        {/* Wheat field photo, tinted */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1750418180525-cce49e403e78?w=900&h=1200&fit=crop&auto=format"
            alt="Wheat fields at harvest — golden and green"
            className="w-full h-full object-cover opacity-[0.12]"
            style={{ mixBlendMode: "luminosity" }}
          />
        </div>

        {/* Content above fold */}
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10 2C10 2 5 7 5 12C5 14.76 7.24 17 10 17C12.76 17 15 14.76 15 12C15 7 10 2 10 2Z"
                  fill="#7eb86a" fillOpacity="0.3" stroke="#7eb86a" strokeWidth="1.5" strokeLinejoin="round"
                />
                <path d="M10 17V19" stroke="#7eb86a" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 8L13 11" stroke="#7eb86a" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 10L7 12" stroke="#7eb86a" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="text-[16px] font-semibold tracking-tight text-white">
                Krishi<span style={{ color: "#7eb86a" }}>Setu</span>
              </div>
              {isAdmin && (
                <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: "#5a8a9f" }}>Admin Portal</div>
              )}
            </div>
          </div>

          <div className="mb-12">
            <h1 className="text-[38px] font-semibold leading-[1.15] tracking-tight mb-4" style={{ color: "#f0f7eb" }}>
              {isAdmin
                ? <><span>State-level</span><br /><span>Oversight</span><br /><span>Dashboard</span></>
                : <><span>Agricultural</span><br /><span>Intelligence</span><br /><span>Platform</span></>
              }
            </h1>
            <p className="text-[14px] leading-relaxed" style={{ color: "#8aab78", maxWidth: 340 }}>
              {isAdmin
                ? "Monitor crop disease outbreaks across all states. Access all farmer reports, heatmaps, and district-level analytics."
                : "Crop advisory, market forecasting, and government scheme management for agricultural officers and cooperatives."
              }
            </p>
          </div>

          {/* Features list */}
          <div className="space-y-3">
            {features.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(126,184,106,0.12)", border: "1px solid rgba(126,184,106,0.2)" }}
                >
                  <Icon size={13} style={{ color: "#7eb86a" }} strokeWidth={1.5} />
                </div>
                <span className="text-[13px]" style={{ color: "#8aab78" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="relative z-10">
          <div
            className="pt-6 grid grid-cols-2 gap-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            {stats.map((s, i) => (
              <div key={i} className={i === 0 ? "pr-6 border-r" : "pl-6"} style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <div
                  className="text-[20px] font-semibold tracking-tight"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#f0f7eb" }}
                >
                  {s.value}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "#6a8f5a" }}>{s.label}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 bg-white overflow-y-auto py-8">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
            <path d="M10 2C10 2 5 7 5 12C5 14.76 7.24 17 10 17C12.76 17 15 14.76 15 12C15 7 10 2 10 2Z"
              fill="#2d5a1b" fillOpacity="0.15" stroke="#2d5a1b" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M10 17V19" stroke="#2d5a1b" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 8L13 11" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M10 10L7 12" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-[#111]">
            Krishi<span className="text-[#2d5a1b]">Setu</span>
          </span>
        </div>

        <div className="w-full" style={{ maxWidth: 360 }}>
          {/* Role toggle */}
          {mode !== 'register' && (
            <div className="flex border border-[#e5e5e5] mb-8 overflow-hidden" style={{ borderRadius: 2 }}>
              {([{ key: "officer" as Role, label: "Farmer" }, { key: "admin" as Role, label: "Administrator" }]).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { setRole(r.key); setIdentifier(""); setPassword(""); }}
                  className="flex-1 py-2 text-[12.5px] font-semibold transition-colors"
                  style={{
                    backgroundColor: role === r.key ? accentDark : "transparent",
                    color: role === r.key ? "#fff" : "#737373",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Header */}
          <div className="mb-7">
            <h2 className="text-[22px] font-semibold tracking-tight text-[#111]">
              {isAdmin ? "Admin sign in" : "Sign in"}
            </h2>
            <p className="text-[13px] text-[#737373] mt-1.5">
              {isAdmin
                ? "Restricted to authorised state-level administrators"
                : "Access the agricultural intelligence portal"}
            </p>
          </div>

          {/* Admin warning banner */}
          {isAdmin && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 px-3 py-2.5 mb-5" style={{ borderRadius: 2 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-[11.5px] text-amber-800 leading-relaxed">
                Admin credentials are issued by the KrishiSetu backend team. Self-registration is not available for this role.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded text-[13px] text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 px-3 py-2.5 bg-green-50 border border-green-200 rounded text-[13px] text-green-700">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ── REGISTER FIELDS ── */}
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">Full Name *</label>
                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Ramesh Kumar" required
                    className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                    style={{ borderRadius: 2 }} onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">City / District *</label>
                  <input type="text" value={regCity} onChange={(e) => setRegCity(e.target.value)} placeholder="Agra, Uttar Pradesh" required
                    className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                    style={{ borderRadius: 2 }} onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")} />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">Acres (Opt)</label>
                    <input type="number" value={regLand} onChange={(e) => setRegLand(e.target.value)} placeholder="5"
                      className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                      style={{ borderRadius: 2 }} onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")} />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">Phone (Opt)</label>
                    <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="+91 XXXXX"
                      className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                      style={{ borderRadius: 2 }} onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")} />
                  </div>
                </div>
              </>
            )}

            {/* ── SHARED EMAIL/PASSWORD ── */}
            {(mode === 'login' || mode === 'register') && (
              <>
                {/* Farmer ID / Email */}
                <div>
                  <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">
                    {isAdmin ? "Admin ID or Email" : " Email"}
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={isAdmin ? "Type : admin@krishisetu.com" : "Type : bansalvaibhav0409@gmail.com"}
                    required
                    className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                    style={{ borderRadius: 2 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = accentDark)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[12px] font-medium text-[#111] uppercase tracking-wider">
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('forgot-password'); setError(""); setSuccess(""); }}
                        className="text-[12px] text-[#2d5a1b] hover:opacity-70 transition-opacity"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? "Create a password" : (isAdmin ? "Type : admin123" : "Type : Very_good_site")}
                      required
                      className="w-full px-3 py-2.5 pr-10 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                      style={{ borderRadius: 2 }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = accentDark)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3a3a3] hover:text-[#737373] transition-colors"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </>
            )}


            {!isAdmin && mode === 'login' && (
              <div className="flex flex-col gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => handleOAuth("oauth_google")}
                  disabled={oauthLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-[13.5px] font-medium text-[#111] bg-white border border-[#e5e5e5] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                  style={{ borderRadius: 2 }}
                >
                  {oauthLoading ? (
                    <div style={{ width: 16, height: 16, border: "2px solid #e5e5e5", borderTopColor: "#2d5a1b", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  )}
                  {oauthLoading ? "Connecting..." : "Continue with Google"}
                </button>
                <div className="flex items-center gap-4 my-2">
                  <div className="h-px bg-[#e5e5e5] flex-1"></div>
                  <span className="text-[11px] uppercase tracking-wider text-[#a3a3a3]">Or continue with email</span>
                  <div className="h-px bg-[#e5e5e5] flex-1"></div>
                </div>
              </div>
            )}

            {/* ── FORGOT PASSWORD FIELDS ── */}

            {mode === 'forgot-password' && (
              <div>
                <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  value={farmerId}
                  onChange={(e) => setFarmerId(e.target.value)}
                  placeholder="Enter your registered email"
                  required
                  className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                  style={{ borderRadius: 2 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
                />
              </div>
            )}


            {/* Remember me */}

            {!isAdmin && mode === 'login' && (
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setRemember(!remember)}
                  className="w-4 h-4 border flex items-center justify-center transition-colors flex-shrink-0"
                  style={{ borderRadius: 2, backgroundColor: remember ? accentGreen : "white", borderColor: remember ? accentGreen : "#d4d4d4" }}
                >
                  {remember && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className="text-[13px] text-[#737373]">Keep me signed in for 30 days</span>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: accentDark, borderRadius: 2 }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = accentHover)}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = accentDark)}
              >
                {loading ? (
                  <>
                    <span
                      className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: "spin 0.7s linear infinite" }}
                    />
                    {mode === 'register' ? 'Creating Account…' : mode === 'forgot-password' ? 'Sending Code…' : 'Authenticating…'}
                  </>
                ) : (
                  <>
                    {mode === 'register' ? 'Create Account' : mode === 'forgot-password' ? 'Send Reset Code' : isAdmin ? "Sign in to Admin Portal" : 'Sign in to portal'}
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>

          {mode === 'verify-2fa' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(""); setSuccess(""); }}
              className="w-full py-2.5 mt-4 text-[13px] font-medium text-[#111] border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors flex items-center justify-center gap-2"
              style={{ borderRadius: 2 }}
            >
              Back to Sign in
            </button>
          )}

          {/* Divider */}
          {!isAdmin && (
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[#e5e5e5]" />
              <span className="text-[11px] text-[#c0c0c0] uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-[#e5e5e5]" />
            </div>
          )}

          {/* Mode switchers */}
          {!isAdmin && mode === 'login' && (
            <>
              <p className="mt-4 text-center text-[13px] text-[#737373]">
                Don't have an account? <button onClick={() => { setMode('register'); setRole('officer'); setError(""); setSuccess(""); }} className="text-[#2d5a1b] font-medium hover:underline">Register here</button>
              </p>
            </>
          )}

          {mode === 'register' && (
            <p className="text-center text-[13px] text-[#737373]">
              Already have an account? <button type="button" onClick={() => { setMode('login'); setError(""); setSuccess(""); }} className="text-[#2d5a1b] font-medium hover:underline">Sign in here</button>
            </p>
          )}

          {mode === 'forgot-password' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(""); setSuccess(""); }}
              className="w-full py-2.5 text-[13px] font-medium text-[#111] border border-[#e5e5e5] bg-white hover:bg-[#fafafa] transition-colors flex items-center justify-center gap-2"
              style={{ borderRadius: 2 }}
            >
              Back to Sign in
            </button>
          )}

          {/* Footer */}
          <p className="mt-8 text-center text-[11.5px] text-[#a3a3a3] leading-relaxed">
            {isAdmin
              ? <>For admin access issues, contact the<br /><span className="text-[#c0c0c0]">KrishiSetu backend team</span></>
              : <>For access requests, contact KrishiSetu Backend Team.<br /><span className="text-[#c0c0c0]">KrishiSetu · 2026</span></>
            }
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
