import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";
import {
  LayoutDashboard, BarChart3, FileText, User, Menu,
  ChevronRight, LogOut, Search, Download, MapPin,
  AlertTriangle, CheckCircle2, RefreshCw,
} from "lucide-react";
import LocationHeatmap, { MapData } from "../components/LocationHeatmap";

type AdminPageId = "dashboard" | "reports" | "disease-map";

const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

interface AdminPortalProps {
  onLogout?: () => void;
}

interface Report {
  session_id: string;
  crop: string;
  location: string;
  query: string;
  created_at: string;
  user_name: string;
  user_city: string;
  disease: string;
  severity: string;
}

interface DashboardData {
  stats: { total_farmers: number; total_reports: number };
  reports: Report[];
  location_distribution: { location: string; count: number }[];
}

// ─── Bubble colors ──────────────────────────────────────────
const BUBBLE_COLORS = [
  "#2d5a1b", "#4a8c2a", "#6fb43e", "#96cc66", "#b8dd8e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6",
];

// ─── Helper: format date ────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Page Header ────────────────────────────────────────────
function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right && <div className="ml-4 flex-shrink-0">{right}</div>}
    </div>
  );
}

// ─── Bubble Tooltip ─────────────────────────────────────────
const BubbleTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#e5e5e5] px-3 py-2 text-[12px] shadow-sm">
      <div className="font-medium text-foreground flex items-center gap-1.5">
        <MapPin size={10} /> {d.location}
      </div>
      <div className="text-muted-foreground mt-0.5">{d.count} report{d.count !== 1 ? "s" : ""}</div>
    </div>
  );
};

// ─── Dashboard Page ─────────────────────────────────────────
function DashboardPage({ data, loading, onRefresh, navigate }: {
  data: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  navigate: (p: AdminPageId) => void;
}) {
  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={16} className="animate-spin text-muted-foreground mr-2" />
        <span className="text-[13px] text-muted-foreground">Loading dashboard…</span>
      </div>
    );
  }

  const { stats, reports, location_distribution } = data;

  // Prepare bubble data — spread locations across a grid-like layout
  const bubbleData = location_distribution.map((loc, i) => ({
    x: 20 + (i % 5) * 18 + Math.random() * 8,
    y: 20 + Math.floor(i / 5) * 25 + Math.random() * 10,
    z: loc.count,
    location: loc.location,
    count: loc.count,
  }));

  // Weekly activity from real reports
  const weekMap: Record<string, number> = {};
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayNames.forEach(d => weekMap[d] = 0);
  reports.forEach(r => {
    if (r.created_at) {
      const day = dayNames[new Date(r.created_at).getDay()];
      weekMap[day] = (weekMap[day] || 0) + 1;
    }
  });
  const weeklyActivity = dayNames.map(d => ({ day: d, reports: weekMap[d] }));

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="KrishiSetu Platform Overview · All Users"
        right={
          <button onClick={onRefresh} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-border mb-8">
        {[
          { label: "Total Farmers", value: String(stats.total_farmers), sub: "Registered users", icon: User },
          { label: "Total Reports", value: String(stats.total_reports), sub: "All advisory reports", icon: FileText },
          { label: "Locations", value: String(location_distribution.length), sub: "Unique report locations", icon: MapPin },
          { label: "Latest Report", value: reports[0] ? formatDate(reports[0].created_at) : "—", sub: reports[0]?.crop || "No reports yet", icon: CheckCircle2 },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className={`px-5 py-4 ${i < 3 ? "border-r border-border" : ""} ${i >= 2 ? "border-t border-border lg:border-t-0" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                <Icon size={13} className="text-muted-foreground" />
              </div>
              <div className="text-[22px] font-semibold text-foreground tracking-tight" style={{ fontFamily: "'DM Mono', monospace" }}>
                {k.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* Weekly Report Activity Chart */}
          <div className="border border-border p-6 bg-white">
            <h2 className="text-[14px] font-semibold text-foreground mb-6">Weekly Activity</h2>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivity}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#888" }} />
                  <Tooltip cursor={{ fill: "#fcfcfc" }} contentStyle={{ fontSize: 12, border: "1px solid #eee" }} />
                  <Bar dataKey="reports" fill="#2d5a1b" radius={[2, 2, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-8">
          {/* Recent Reports List */}
          <div className="border border-border bg-white rounded-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Recent Reports</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">All states · latest first</p>
              </div>
              <button onClick={() => navigate("reports")} className="text-[11.5px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                All <ChevronRight size={12} />
              </button>
            </div>
            
            {reports.length === 0 ? (
              <div className="p-8 text-center text-[12.5px] text-muted-foreground">
                No reports yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {reports.slice(0, 5).map((r, i) => (
                  <div key={i} className="p-5 hover:bg-[#fafafa] transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-[13.5px] font-semibold text-foreground group-hover:text-[#2d5a1b] transition-colors">{r.user_name}</div>
                      <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${
                        r.severity === "High" ? "text-red-700 bg-red-50 border-red-200" :
                        r.severity === "Medium" ? "text-amber-700 bg-amber-50 border-amber-200" :
                        "text-emerald-700 bg-emerald-50 border-emerald-200"
                      }`}>
                        {r.severity}
                      </div>
                    </div>
                    <div className="text-[13px] text-foreground mb-1.5 font-medium">{r.disease}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {r.crop} · {r.location.split(',')[0]} · {formatDate(r.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reports Page ───────────────────────────────────────────
function ReportsPage({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const [search, setSearch] = useState("");

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={16} className="animate-spin text-muted-foreground mr-2" />
        <span className="text-[13px] text-muted-foreground">Loading reports…</span>
      </div>
    );
  }

  const { reports } = data;
  const filtered = search
    ? reports.filter(r =>
        r.user_name.toLowerCase().includes(search.toLowerCase()) ||
        r.crop.toLowerCase().includes(search.toLowerCase()) ||
        r.location.toLowerCase().includes(search.toLowerCase()) ||
        r.session_id.toLowerCase().includes(search.toLowerCase())
      )
    : reports;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`All advisory reports · ${reports.length} total`}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-0 border border-border mb-8">
        {[
          { label: "Total Reports", value: String(reports.length), sub: "All time" },
          { label: "Unique Farmers", value: String(new Set(reports.map(r => r.user_name)).size), sub: "Who generated reports" },
          { label: "Unique Locations", value: String(new Set(reports.map(r => r.location).filter(Boolean)).size), sub: "Report locations" },
        ].map((k, i) => (
          <div key={i} className={`px-5 py-4 ${i < 2 ? "border-r border-border" : ""}`}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{k.label}</div>
            <div className="text-[22px] font-semibold text-foreground tracking-tight" style={{ fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 border border-border px-3 py-2 mb-6 w-full max-w-sm">
        <Search size={13} className="text-muted-foreground flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search farmer, crop, or location..."
          className="text-[12.5px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground w-full"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          {search ? `No reports found for "${search}"` : "No reports yet. Reports will appear when farmers generate advisories."}
        </div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border">
              {["Session ID", "Farmer", "Crop", "Location", "Date"].map((h, i) => (
                <th key={h} className={`text-[10px] uppercase tracking-widest text-muted-foreground pb-2 font-medium ${i >= 4 ? "text-right" : "text-left"} ${i === 3 ? "hidden md:table-cell" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b border-border hover:bg-[#fafafa] transition-colors group">
                <td className="py-2.5 pr-4 font-mono text-[11px] text-muted-foreground max-w-[120px] truncate">{r.session_id || "—"}</td>
                <td className="py-2.5 pr-4 text-foreground font-medium">{r.user_name}</td>
                <td className="py-2.5 pr-4 text-muted-foreground">{r.crop || "—"}</td>
                <td className="py-2.5 pr-4 text-muted-foreground hidden md:table-cell">{r.location || "—"}</td>
                <td className="py-2.5 text-right text-muted-foreground">{formatDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


// ─── Disease Map Page ───────────────────────────────────────
function DiseaseMapPage({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={16} className="animate-spin text-muted-foreground mr-2" />
        <span className="text-[13px] text-muted-foreground">Loading disease map…</span>
      </div>
    );
  }

  // Parse reports to build state-level data
  const stateMap: Record<string, { severity: string; count: number; diseases: Record<string, number> }> = {};
  
  data.reports.forEach(r => {
    const parts = r.location.split(',');
    const state = parts[parts.length - 1]?.trim() || '';
    if (!state) return;

    if (!stateMap[state]) {
      stateMap[state] = { severity: "Low", count: 0, diseases: {} };
    }
    
    stateMap[state].count += 1;
    
    if (r.disease) {
      stateMap[state].diseases[r.disease] = (stateMap[state].diseases[r.disease] || 0) + 1;
    }

    if (r.severity === "High") stateMap[state].severity = "High";
    else if (r.severity === "Medium" && stateMap[state].severity !== "High") stateMap[state].severity = "Medium";
  });

  const mapData: MapData[] = Object.entries(stateMap).map(([state, info]) => {
    // Get most common disease for the state
    let topDisease = "";
    let maxCount = 0;
    Object.entries(info.diseases).forEach(([d, c]) => {
      if (c > maxCount) { maxCount = c; topDisease = d; }
    });

    // Approximate center coordinates (fallback to central India if unknown)
    const STATE_COORDINATES: Record<string, [number, number]> = {
      'Andhra Pradesh': [79.0, 16.0], 'Arunachal Pradesh': [93.5, 28.0], 'Assam': [92.0, 26.5], 'Bihar': [85.0, 26.0],
      'Chhattisgarh': [82.0, 22.0], 'Goa': [73.8, 15.5], 'Gujarat': [72.0, 22.0], 'Haryana': [77.0, 29.0],
      'Himachal Pradesh': [77.0, 32.0], 'Jharkhand': [85.0, 23.0], 'Karnataka': [75.5, 15.5], 'Kerala': [76.0, 10.0],
      'Madhya Pradesh': [78.5, 22.5], 'Maharashtra': [75.5, 19.5], 'Manipur': [94.8, 24.7], 'Meghalaya': [91.8, 25.0],
      'Mizoram': [93.0, 23.0], 'Nagaland': [94.1, 26.1], 'Odisha': [85.0, 20.5], 'Punjab': [75.5, 31.5],
      'Rajasthan': [75.0, 27.5], 'Sikkim': [88.2, 28.0], 'Tamil Nadu': [78.5, 11.0], 'Telangana': [79.0, 18.5],
      'Tripura': [91.8, 23.8], 'Uttar Pradesh': [78.5, 26.5], 'Uttarakhand': [79.5, 30.5], 'West Bengal': [88.0, 24.0]
    };
    const coords = STATE_COORDINATES[state] || [78.0, 20.0];

    return {
      state,
      coords,
      severity: info.severity,
      count: info.count,
      disease: topDisease || "Unknown",
    };
  });

  const highSeverityStates = mapData.filter(d => d.severity === "High");
  const mediumSeverityStates = mapData.filter(d => d.severity === "Medium");

  // Calculate India Summary
  const diseaseCounts: Record<string, number> = {};
  data.reports.forEach(r => {
    if (r.disease) diseaseCounts[r.disease] = (diseaseCounts[r.disease] || 0) + 1;
  });
  const summaryList = Object.entries(diseaseCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title="Disease Heatmap"
        subtitle="Live outbreak clusters · All India"
        right={
          <div className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-600 rounded-sm text-[11px] font-semibold">
            <AlertTriangle size={12} /> Admin Access · All India
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="h-[600px]">
            <LocationHeatmap data={mapData} />
          </div>
        </div>

        <div className="space-y-6">
          {/* High Severity */}
          <div className="border border-border bg-white rounded-sm">
            <div className="p-4 border-b border-border">
              <h3 className="text-[14px] font-bold text-foreground">High Severity</h3>
              <p className="text-[11px] text-muted-foreground">{highSeverityStates.length} states</p>
            </div>
            <div className="divide-y divide-border">
              {highSeverityStates.length === 0 ? (
                <div className="p-4 text-[12px] text-muted-foreground">No high severity outbreaks.</div>
              ) : (
                highSeverityStates.map((s, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-bold text-foreground mb-0.5">{s.state}</div>
                      <div className="text-[11.5px] text-muted-foreground">{s.disease}</div>
                    </div>
                    <div className="text-[10px] font-semibold px-2 py-0.5 rounded-sm border text-red-700 bg-red-50 border-red-200">
                      High
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Medium Severity */}
          <div className="border border-border bg-white rounded-sm">
            <div className="p-4 border-b border-border">
              <h3 className="text-[14px] font-bold text-foreground">Medium Severity</h3>
              <p className="text-[11px] text-muted-foreground">{mediumSeverityStates.length} states</p>
            </div>
            <div className="divide-y divide-border">
              {mediumSeverityStates.length === 0 ? (
                <div className="p-4 text-[12px] text-muted-foreground">No medium severity outbreaks.</div>
              ) : (
                mediumSeverityStates.map((s, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-bold text-foreground mb-0.5">{s.state}</div>
                      <div className="text-[11.5px] text-muted-foreground">{s.disease}</div>
                    </div>
                    <div className="text-[10px] font-semibold px-2 py-0.5 rounded-sm border text-amber-700 bg-amber-50 border-amber-200">
                      Medium
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* India Summary */}
          <div className="border border-border bg-white rounded-sm p-4">
            <h3 className="text-[13px] font-bold text-foreground mb-4">India Summary</h3>
            <div className="space-y-3">
              {summaryList.slice(0, 5).map(([disease, count], i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-red-500" : i === 1 ? "bg-blue-500" : "bg-emerald-500"}`} />
                    <span className="text-[12.5px] text-muted-foreground">{disease}</span>
                  </div>
                  <span className="text-[13px] font-bold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminPortal ───────────────────────────────────────
export default function AdminPortal({ onLogout }: AdminPortalProps) {
  const [activePage, setActivePage] = useState<AdminPageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/dashboard`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Admin dashboard fetch failed:", e);
      setData({ stats: { total_farmers: 0, total_reports: 0 }, reports: [], location_distribution: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDashboard(); }, []);

  const NAV_ITEMS: { id: AdminPageId; label: string; icon: any }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "disease-map", label: "Disease Map", icon: MapPin },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ];

  const pageTitle: Record<AdminPageId, string> = {
    dashboard: "Dashboard",
    "disease-map": "Disease Map",
    reports: "Reports",
  };

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        return <DashboardPage data={data} loading={loading} onRefresh={fetchDashboard} navigate={setActivePage} />;
      case "disease-map":
        return <DiseaseMapPage data={data} loading={loading} />;
      case "reports":
        return <ReportsPage data={data} loading={loading} />;
    }
  }

  function handleLogout() {
    localStorage.removeItem("krishisetu_admin");
    if (onLogout) onLogout();
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-[210px] border-r border-border flex flex-col flex-shrink-0 bg-background transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="h-[52px] flex items-center px-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2C10 2 5 7 5 12C5 14.76 7.24 17 10 17C12.76 17 15 14.76 15 12C15 7 10 2 10 2Z" fill="#2d5a1b" fillOpacity="0.15" stroke="#2d5a1b" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M10 17V19" stroke="#2d5a1b" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 8L13 11" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M10 10L7 12" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <div>
              <span className="text-[14px] font-semibold tracking-tight text-foreground">
                Krishi<span style={{ color: "#2d5a1b" }}>Setu</span>
              </span>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground" style={{ marginTop: -2 }}>Admin</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2 mt-1">Platform</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActivePage(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-sm text-[13px] text-left transition-colors mb-px ${active ? "bg-[#e8eef4] text-[#0f1f2e] font-medium" : "text-muted-foreground hover:text-foreground hover:bg-[#f5f5f4]"}`}
              >
                <Icon size={14} strokeWidth={active ? 2 : 1.5} />
                {item.label}
              </button>
            );
          })}

          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2 mt-5">Info</div>
          <div className="px-3 py-[5px] text-[11.5px] text-muted-foreground">
            {data ? `${data.stats.total_farmers} Farmers` : "Loading…"}
          </div>
          <div className="px-3 py-[5px] text-[11.5px] text-muted-foreground">
            {data ? `${data.stats.total_reports} Reports` : ""}
          </div>
        </nav>

        <div className="px-3 py-3 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-full bg-[#e8eef4] flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-[#0f1f2e]">A</span>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">Administrator</div>
              <div className="text-[10px] text-muted-foreground truncate">admin@krishisetu.com</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-sm transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[52px] border-b border-border flex items-center justify-between px-5 lg:px-8 bg-background flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground hidden sm:block">KrishiSetu Admin</span>
              <ChevronRight size={12} className="text-muted-foreground hidden sm:block" />
              <span className="text-foreground font-medium">{pageTitle[activePage]}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 lg:px-10 py-8">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
