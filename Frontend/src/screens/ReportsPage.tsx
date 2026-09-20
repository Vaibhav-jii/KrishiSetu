import React, { useState, useEffect } from "react";
import { Search, FileDown, Download, Trash2, RefreshCw, MessageSquare } from "lucide-react";
import { PageHeader } from "../components/Shared";
import { getReports, clearReports, ReportEntry } from "../utils/reportStore";
import { downloadAdvisoryPdf } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";

interface ReportsPageProps {
  navigate?: (page: string) => void;
  onContinueChat?: (report: { session_id: string; fullReport: string; crop: string }) => void;
}

export default function ReportsPage({ navigate, onContinueChat }: ReportsPageProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [allReports, setAllReports] = useState<ReportEntry[]>([]);

  // Load reports from localStorage on mount
  useEffect(() => {
    setAllReports(getReports());
  }, []);

  const refresh = () => setAllReports(getReports());

  const filtered = search.trim()
    ? allReports.filter(r =>
        r.crop.toLowerCase().includes(search.toLowerCase()) ||
        r.location.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        r.summary.toLowerCase().includes(search.toLowerCase())
      )
    : allReports;

  const thisMonth = (() => {
    const now = new Date();
    return allReports.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  })();

  const actionRequired = allReports.filter(r => r.status === "Action Required").length;
  const completed = allReports.filter(r => r.status === "Completed").length;

  const handleContinueChat = (r: ReportEntry) => {
    if (onContinueChat) {
      onContinueChat({
        session_id: r.id,
        fullReport: r.fullReport || r.summary,
        crop: r.crop,
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        right={
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-2 text-[12.5px] border border-border px-3 py-2 rounded-sm hover:bg-[#f5f5f4] transition-colors font-medium"
            >
              <RefreshCw size={13} /> {t("reports.refresh")}
            </button>
            {allReports.length > 0 && (
              <button
                onClick={() => { clearReports(); setAllReports([]); }}
                className="flex items-center gap-2 text-[12.5px] text-red-600 border border-red-200 px-3 py-2 rounded-sm hover:bg-red-50 transition-colors font-medium"
              >
                <Trash2 size={13} /> {t("reports.clearAll")}
              </button>
            )}
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-0 border border-border mb-8">
        {[
          { label: t("reports.totalReports"), value: String(thisMonth), sub: t("reports.thisMonth") },
          { label: t("reports.actionRequired"), value: String(actionRequired), sub: t("reports.needsReview") },
          { label: t("reports.completed"), value: String(completed), sub: t("reports.successfulRuns") },
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
          placeholder={t("reports.searchPlaceholder")}
          className="text-[12.5px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground w-full"
        />
      </div>

      {filtered.length > 0 ? (
        <table className="w-full text-[12.5px] border border-border">
          <thead className="bg-[#fafafa]">
            <tr className="border-b border-border">
              {[t("reports.sessionId"), t("reports.crop"), t("reports.location"), t("reports.date"), ""].map((h, i) => (
                <th key={i} className={`px-4 text-[10px] uppercase tracking-widest text-muted-foreground py-2 font-medium ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const dateStr = new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              return (
                <tr key={r.id + i} className="border-b border-border hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.id.slice(0, 16)}...</td>
                  <td className="px-4 py-2.5 text-foreground font-medium">{r.crop}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.location}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{dateStr}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onContinueChat && (
                        <button
                          onClick={() => handleContinueChat(r)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#2d5a1b] bg-[#edf3e8] border border-[#2d5a1b]/20 rounded-sm hover:bg-[#2d5a1b] hover:text-white transition-colors"
                        >
                          <MessageSquare size={11} /> Chat
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            await downloadAdvisoryPdf(r.id, r.fullReport || r.summary);
                          } catch (err) {
                            alert("Failed to download PDF. The backend might not have wkhtmltopdf installed.");
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#2d5a1b] bg-[#edf3e8] border border-[#2d5a1b]/20 rounded-sm hover:bg-[#2d5a1b] hover:text-white transition-colors"
                      >
                        <Download size={11} /> {t("reports.download")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-[13px] border border-dashed border-border rounded-sm bg-[#fafafa]">
          <p className="mb-2 font-medium text-foreground">{t("reports.noReports")}</p>
          <p>{t("reports.runCropAnalysis")}</p>
        </div>
      )}
    </div>
  );
}
