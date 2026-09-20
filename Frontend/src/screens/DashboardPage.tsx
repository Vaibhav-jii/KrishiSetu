import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { LayoutDashboard, Leaf, TrendingUp, FileText, Cloud, BarChart3, ChevronRight, AlertTriangle, CheckCircle2, User, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PageHeader } from "../components/Shared";
import { fetchWeather, fetchPrediction } from "../utils/api";
import { getReports, getReportsThisMonth, ReportEntry, formatDateShort } from "../utils/reportStore";
import { useLanguage } from "../contexts/LanguageContext";
import { getProfile } from "../utils/settingsStore";

type PageId = "dashboard" | "crop" | "market" | "schemes" | "weather" | "reports";

export default function DashboardPage({ navigate }: { navigate: (p: PageId) => void }) {
  const { t } = useLanguage();
  const profile = getProfile();
  
  const [weatherData, setWeatherData] = useState<any>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<any[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  
  const loc = profile.location || "Agra";

  useEffect(() => {
    fetchWeather(loc).then(setWeatherData).catch(console.error);
    setReports(getReports());
    
    // Fetch real predictions for the dashboard market snapshot
    async function loadMarket() {
      try {
        const crops = ["Wheat", "Mustard", "Maize", "Cotton"];
        const prices = [2450, 5320, 2060, 6800];
        const results = [];
        
        for (let i = 0; i < crops.length; i++) {
          const res = await fetchPrediction(crops[i], profile.state || "Uttar Pradesh", 6, prices[i]);
          const predicted = res.prediction?.predicted_price || prices[i];
          const changePercent = ((predicted - prices[i]) / prices[i] * 100).toFixed(1);
          const isUp = predicted >= prices[i];
          
          results.push({
            crop: crops[i],
            price: `₹${prices[i]}`,
            change: `${isUp ? '+' : ''}${changePercent}%`,
            up: isUp
          });
        }
        setMarketSnapshot(results);
      } catch (err) {
        console.error("Failed to load market data", err);
      } finally {
        setLoadingMarket(false);
      }
    }
    loadMarket();
  }, [loc, profile.state]);

  // Derive real numbers from the report store
  const reportsThisMonth = getReportsThisMonth();
  const actionRequired = reports.filter(r => r.status === "Action Required").length;
  const recentReports = reports.slice(0, 5); // show up to 5 most recent

  // Build weekly activity from real report data (last 7 days)
  const weeklyActivity = (() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts: Record<string, number> = {};
    const now = new Date();
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const label = days[d.getDay()];
      counts[label] = 0;
    }
    // Count reports per day
    reports.forEach(r => {
      const d = new Date(r.date);
      const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) {
        const label = days[d.getDay()];
        counts[label] = (counts[label] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([day, count]) => ({ day, reports: count }));
  })();

  return (
    <div>
      <PageHeader
        title={t("dash.title")}
        subtitle={`${loc} · ${t("dash.subtitle")}`}
        right={
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("dash.lastUpdated")}</div>
            <div className="text-[12px] font-medium text-foreground">{t("dash.liveData")}</div>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-0 border border-border mb-8 max-w-2xl">
        {[
          { label: t("dash.reportsMonth"), value: String(reportsThisMonth), sub: t("dash.generatedVia"), icon: FileText },
          { label: t("dash.actionRequired"), value: String(actionRequired), sub: actionRequired > 0 ? `${actionRequired} ${t("dash.needReview")}` : t("dash.allClear"), icon: AlertTriangle },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className={`px-5 py-4 ${i < 1 ? "border-r border-border" : ""}`}>
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
        {/* Left: Recent reports */}
        <div className="lg:col-span-2 space-y-8">
          {/* Recent reports */}
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[13px] font-semibold text-foreground">{t("dash.recentReports")}</h2>
              <button onClick={() => navigate("reports")} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                {t("dash.allReports")} <ChevronRight size={11} />
              </button>
            </div>
            {recentReports.length > 0 ? (
              <table className="w-full text-[12.5px] border border-border">
                <thead className="bg-[#fafafa]">
                  <tr className="border-b border-border">
                    {["Session ID", "Crop", "Location", "Date", "Status"].map((h, i) => (
                      <th key={h} className={`px-4 text-[10px] uppercase tracking-widest text-muted-foreground py-2 font-medium ${i === 0 ? "text-left" : i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentReports.map((r, i) => {
                    const st = r.status === "Action Required" ? "text-amber-700 bg-amber-50 border-amber-200"
                      : r.status === "Completed" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-muted-foreground bg-[#f5f5f4] border-border";
                    const dateStr = new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <tr key={r.id + i} className="border-b border-border hover:bg-[#fafafa] transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.id.slice(0, 12)}…</td>
                        <td className="px-4 py-2.5 text-foreground font-medium">{r.crop}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.location}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{dateStr}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${st}`}>{t(r.status === "Action Required" ? "reports.actionRequired" : "reports.completed")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="border border-dashed border-border rounded-sm bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-[13px] text-muted-foreground">{t("dash.noReports")} <button onClick={() => navigate("crop")} className="text-[#2d5a1b] font-medium hover:underline">{t("nav.crop")}</button> {t("dash.toGetStarted")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Market + Activity */}
        <div className="space-y-8">
          {/* Market snapshot */}
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[13px] font-semibold text-foreground">{t("dash.marketSnapshot")}</h2>
              <button onClick={() => navigate("market")} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                {t("dash.details")} <ChevronRight size={11} />
              </button>
            </div>
            <div className="border border-border">
              {loadingMarket ? (
                <div className="px-4 py-4 text-center text-[12px] text-muted-foreground bg-[#fafafa]">
                  {t("dash.fetchingPredictions")}
                </div>
              ) : marketSnapshot.map((m, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < marketSnapshot.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-[13px] font-medium text-foreground">{m.crop}</span>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{m.price}</div>
                    <div className={`text-[11px] flex items-center justify-end gap-0.5 ${m.up ? "text-[#2d5a1b]" : "text-red-600"}`}>
                      {m.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {m.change}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly activity */}
          <div>
            <h2 className="text-[13px] font-semibold text-foreground mb-4">{t("dash.weeklyActivity")}</h2>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivity} barSize={14} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#a3a3a3" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#a3a3a3" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #e5e5e5", borderRadius: 2 }} />
                  <Bar dataKey="reports" fill="#2d5a1b" radius={[2, 2, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weather quick */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-foreground">{t("nav.weather")} — {loc}</h2>
              <button onClick={() => navigate("weather")} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                {t("dash.fullForecast")} <ChevronRight size={11} />
              </button>
            </div>
            {weatherData && weatherData.forecast_3d ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weatherData.forecast_3d.slice(0, 5).map((w: any, i: number) => (
                  <div key={i} className={`flex-shrink-0 text-center px-3 py-2.5 border border-border ${i === 0 ? "bg-[#fafafa]" : ""}`} style={{ minWidth: 64 }}>
                    <div className="text-[10px] text-muted-foreground mb-1">{formatDateShort(w.date)}</div>
                    <div className="text-[12px] font-semibold text-foreground">{w.temp}°C</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{w.condition}</div>
                    <div className={`text-[10px] mt-1 font-mono ${w.rain_prob >= 60 ? "text-blue-600" : "text-muted-foreground"}`}>{w.rain_prob}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-muted-foreground py-2">{t("dash.loadingWeather")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
