import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Cloud, Wind, Eye, Thermometer, Droplets, MapPin } from "lucide-react";
import { PageHeader } from "../components/Shared";
import { fetchWeather } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { getDefaultLocation } from "../utils/settingsStore";

export default function WeatherPage() {
  const { t } = useLanguage();
  const defaultLoc = getDefaultLocation();
  const [location] = useState(defaultLoc);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadWeather() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchWeather(location);
        setWeatherData(data);
      } catch (err: any) {
        setError(err.message || "Failed to load weather data.");
      } finally {
        setLoading(false);
      }
    }
    loadWeather();
  }, [location]);

  // Transform data for the chart
  const tempTrendData = weatherData?.forecast_3d?.map((w: any) => ({
    date: (() => {
      try {
        const d = new Date(w.date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      } catch { return w.date; }
    })(),
    high: w.temp,
    rain: w.rain_prob,
  })) || [];

  return (
    <div>
      <PageHeader
        title={t("weather.title")}
        subtitle={`${t("weather.realtime")} ${location} · ${t("weather.updatedToday")}`}
      />

      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-[#fafafa] border border-border px-3 py-2 rounded-sm text-[13px] text-muted-foreground">
          <MapPin size={13} className="text-[#2d5a1b] flex-shrink-0" />
          <span className="font-medium text-foreground">{location}</span>
          <span className="text-[10px] text-[#2d5a1b]">({t("location.auto")})</span>
        </div>
      </div>


      {loading ? (
        <div className="text-[12px] text-muted-foreground py-4">{t("weather.fetchingData")}</div>
      ) : error ? (
        <div className="text-[12px] text-red-600 py-4">{error}</div>
      ) : weatherData ? (
        <>
          {/* Today strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-border mb-8">
            {[
              { label: t("weather.temperature"), value: `${weatherData.today?.temp || "--"}°C`, sub: `${t("weather.condition")}: ${weatherData.today?.condition || "--"}`, icon: Thermometer },
              { label: t("weather.humidity"), value: `${weatherData.today?.humidity || "--"}%`, sub: t("weather.humidity"), icon: Droplets },
              { label: t("weather.windSpeed"), value: `${weatherData.today?.wind_speed || "--"} km/h`, sub: t("weather.windSpeed"), icon: Wind },
              { label: t("weather.visibility"), value: t("weather.good"), sub: t("weather.clear"), icon: Eye },
            ].map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} className={`px-5 py-4 ${i < 3 ? "border-r border-border" : ""} ${i >= 2 ? "border-t border-border lg:border-t-0" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                    <Icon size={13} className="text-muted-foreground" />
                  </div>
                  <div className="text-[22px] font-semibold text-foreground tracking-tight" style={{ fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">{k.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Temp + rain chart */}
          {tempTrendData.length > 0 && (
            <div className="mb-8 pb-8 border-b border-border">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[13px] font-semibold text-foreground">{t("weather.forecastChart")}</h2>
              </div>
              <div className="h-52 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tempTrendData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a3a3a3" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="temp" tick={{ fontSize: 10, fill: "#a3a3a3", fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}°`} domain={[0, 'auto']} width={30} />
                    <YAxis yAxisId="rain" orientation="right" tick={{ fontSize: 10, fill: "#a3a3a3", fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={35} />
                    <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #e5e5e5", borderRadius: 2 }} />
                    <Bar yAxisId="rain" dataKey="rain" fill="#bfdbfe" radius={[2, 2, 0, 0]} barSize={18} name="Rain %" />
                    <Bar yAxisId="temp" dataKey="high" fill="#2d5a1b" radius={[2, 2, 0, 0]} barSize={10} opacity={0.7} name="High °C" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-5 text-[11px] text-muted-foreground ml-8 mt-2">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#2d5a1b] opacity-70 inline-block" /> {t("weather.temperature")} (°C)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#bfdbfe] inline-block" /> {t("weather.rainProb")} (%)</span>
              </div>
            </div>
          )}

          {/* Forecast table */}
          {weatherData.forecast_3d && weatherData.forecast_3d.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[13px] font-semibold text-foreground mb-4">{t("weather.forecastDetail")}</h2>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border">
                    {["Date", t("weather.condition"), t("weather.temperature"), t("weather.rainProb"), t("weather.advisory")].map((h, i) => (
                      <th key={h} className={`text-[10px] uppercase tracking-widest text-muted-foreground pb-2 font-medium ${i <= 1 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weatherData.forecast_3d.map((w: any, i: number) => (
                    <tr key={i} className={`border-b border-border hover:bg-[#fafafa] transition-colors ${i === 0 ? "bg-[#fafafa]" : ""}`}>
                      <td className="py-2.5 text-foreground font-medium whitespace-nowrap">
                        {w.date}
                      </td>
                      <td className="py-2.5 text-muted-foreground capitalize">{w.condition}</td>
                      <td className="py-2.5 text-right text-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "11.5px" }}>{w.temp}°C</td>
                      <td className={`py-2.5 text-right ${w.rain_prob >= 60 ? "text-blue-700 font-semibold" : "text-muted-foreground"}`} style={{ fontFamily: "'DM Mono', monospace", fontSize: "11.5px" }}>{w.rain_prob}%</td>
                      <td className="py-2.5 text-right">
                        {w.rain_prob >= 60
                          ? <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-sm">{t("weather.noSpraying")}</span>
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
