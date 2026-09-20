import re

with open("src/login/Login.tsx", "r") as f:
    content = f.read()

# 1. Add Clerk imports
content = content.replace(
    'import { Eye, EyeOff, ArrowRight, Leaf, Shield, BarChart3, FileText } from "lucide-react";',
    'import { Eye, EyeOff, ArrowRight, Leaf, Shield, BarChart3, FileText, Github } from "lucide-react";\nimport { useSignIn, useSignUp } from "@clerk/clerk-react";'
)

# 2. Add Clerk hooks and new state
hook_injection = """  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: isLoadedSignUp, signUp, setActive: setActiveSignUp } = useSignUp();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password' | 'verify-email' | 'reset-password-code'>('login');"""

content = re.sub(
    r"  const \[mode, setMode\] = useState<'login' \| 'register' \| 'forgot-password'>\('login'\);",
    hook_injection,
    content
)

# 3. Rewrite handleSubmit for Clerk
new_handle_submit = """
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
        localStorage.setItem("kisanmind_user", JSON.stringify(data.user));
      }
    } catch (err) {
      console.error("Sync failed", err);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !isLoadedSignUp) return;

    setLoading(true);
    setError("");
    setSuccess("");

    if (isAdmin) {
      try {
        const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
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
        localStorage.setItem("kisanmind_admin", JSON.stringify(data.admin));
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
        await signUp.create({ emailAddress: farmerId, password });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setMode('verify-email');
        setSuccess("Verification code sent to your email!");
      } 
      else if (mode === 'verify-email') {
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status === "complete") {
          await setActiveSignUp({ session: result.createdSessionId });
          await syncClerkUser(farmerId, regName, regPhone, regCity, regLand);
          setSuccess("Account created successfully!");
          onLogin?.();
        } else {
          setError("Invalid verification code");
        }
      }
      else if (mode === 'forgot-password') {
        await signIn.create({ strategy: "reset_password_email_code", identifier: farmerId });
        setMode('reset-password-code');
        setSuccess("Password reset code sent to your email!");
      }
      else if (mode === 'reset-password-code') {
        const result = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code, password });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          await syncClerkUser(farmerId, "Farmer", "", "", "");
          setSuccess("Password reset successfully!");
          onLogin?.();
        } else {
          setError("Invalid reset code or password");
        }
      }
      else {
        // Login mode
        const result = await signIn.create({ identifier: farmerId, password });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          await syncClerkUser(farmerId, "Farmer", "", "", "");
          onLogin?.();
        } else {
          setError("Could not complete login");
        }
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  const handleOAuth = (provider: "oauth_google" | "oauth_github") => {
    if (!isLoaded) return;
    signIn.authenticateWithRedirect({
      strategy: provider,
      redirectUrl: "/",
      redirectUrlComplete: "/"
    });
  };
"""

# Replace handleSubmit
content = re.sub(
    r"  async function handleSubmit\(e: React\.FormEvent\) \{.*?(?=  const features = \[)",
    new_handle_submit,
    content,
    flags=re.DOTALL
)

# 4. Add OAuth Buttons
oauth_ui = """
            {!isAdmin && mode === 'login' && (
              <div className="flex flex-col gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => handleOAuth("oauth_google")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-[13.5px] font-medium text-[#111] bg-white border border-[#e5e5e5] hover:bg-[#fafafa] transition-colors"
                  style={{ borderRadius: 2 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth("oauth_github")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-[13.5px] font-medium text-white bg-[#24292e] hover:bg-[#1b1f23] transition-colors"
                  style={{ borderRadius: 2 }}
                >
                  <Github size={16} />
                  Continue with GitHub
                </button>
                <div className="flex items-center gap-4 my-2">
                  <div className="h-px bg-[#e5e5e5] flex-1"></div>
                  <span className="text-[11px] uppercase tracking-wider text-[#a3a3a3]">Or continue with email</span>
                  <div className="h-px bg-[#e5e5e5] flex-1"></div>
                </div>
              </div>
            )}
            
            {/* ── FORGOT PASSWORD FIELDS ── */}
"""

content = content.replace(
    "            {/* ── FORGOT PASSWORD FIELDS ── */}",
    oauth_ui
)

# 5. Add Verification UI
verification_ui = """
            {/* ── VERIFICATION CODE FIELDS ── */}
            {(mode === 'verify-email' || mode === 'reset-password-code') && (
              <>
                <div className="mb-4">
                  <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    required
                    className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                    style={{ borderRadius: 2 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
                  />
                </div>
                
                {mode === 'reset-password-code' && (
                  <div className="mb-4">
                    <label className="block text-[12px] font-medium text-[#111] mb-1.5 uppercase tracking-wider">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      className="w-full px-3 py-2.5 text-[13.5px] text-[#111] bg-white border border-[#e5e5e5] outline-none transition-colors placeholder:text-[#c0c0c0]"
                      style={{ borderRadius: 2 }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "#2d5a1b")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
                    />
                  </div>
                )}
              </>
            )}

            {/* Remember me */}
"""

content = content.replace(
    "            {/* Remember me */}",
    verification_ui
)

# Update loading button texts
content = content.replace(
    "{mode === 'register' ? 'Creating Account…' : mode === 'forgot-password' ? 'Sending…' : 'Authenticating…'}",
    "{mode === 'register' ? 'Creating Account…' : mode === 'verify-email' ? 'Verifying…' : mode === 'forgot-password' ? 'Sending Code…' : mode === 'reset-password-code' ? 'Resetting…' : 'Authenticating…'}"
)

content = content.replace(
    "{mode === 'register' ? 'Create Account' : mode === 'forgot-password' ? 'Reset Password' : isAdmin ? \"Sign in to Admin Portal\" : 'Sign in to portal'}",
    "{mode === 'register' ? 'Create Account' : mode === 'verify-email' ? 'Verify Email' : mode === 'forgot-password' ? 'Send Reset Code' : mode === 'reset-password-code' ? 'Reset Password' : isAdmin ? \"Sign in to Admin Portal\" : 'Sign in to portal'}"
)

with open("src/login/Login.tsx", "w") as f:
    f.write(content)

print("Done rewriting Login.tsx")
