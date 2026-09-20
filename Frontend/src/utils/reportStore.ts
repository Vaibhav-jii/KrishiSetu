/**
 * Simple localStorage-backed report store.
 * Every time the crop advisory pipeline produces a report,
 * we persist it here so the Reports page and Dashboard
 * can show real numbers and enable PDF downloads.
 */

export interface ReportEntry {
  id: string;         // session_id from backend
  crop: string;
  location: string;
  date: string;       // ISO string
  status: "Completed" | "Action Required" | "Error";
  summary: string;    // first 120 chars of the final_report
  fullReport: string; // full markdown text for PDF download
}

const STORAGE_KEY = "krishisetu_reports";

function readAll(): ReportEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function syncReportsFromBackend() {
  try {
    const userJson = localStorage.getItem("krishisetu_user");
    let userId = null;
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        userId = user.id;
      } catch (e) {}
    }

    // dynamically import to avoid circular dependency issues if any
    const api = await import("./api");
    const data = await api.getAllHistory(userId);
    if (data && data.success && Array.isArray(data.reports)) {
      const backendReports: ReportEntry[] = [];
      
      data.reports.forEach((row: any) => {
        const id = row.metadata?.session_id || row.id;
        if (!id) return;
        // Extract summary from document
        const doc = row.document || "";
        const summaryText = doc.slice(0, 150) + "...";
        
        backendReports.push({
          id: id,
          crop: row.metadata?.crop || "Unknown",
          location: row.metadata?.location || "Unknown",
          date: row.metadata?.saved_at || new Date().toISOString(),
          status: "Completed",
          summary: summaryText,
          fullReport: doc
        });
      });
      
      // MERGE with existing local reports so local reports NEVER vanish!
      const existing = readAll();
      const existingMap = new Map<string, ReportEntry>();

      // Keep existing local reports first
      existing.forEach((r) => {
        if (r && r.id) existingMap.set(r.id, r);
      });

      // Overlay with backend reports
      backendReports.forEach((r) => {
        if (r && r.id) existingMap.set(r.id, r);
      });

      const merged = Array.from(existingMap.values());
      // Sort by date newest first
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      writeAll(merged.slice(0, 50));
    }
  } catch (err) {
    console.error("Failed to sync reports from backend", err);
  }
}

function writeAll(reports: ReportEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

/** Save a new report entry (de-dupes by id). */
export function saveReport(entry: ReportEntry) {
  const all = readAll();
  // avoid duplicates
  if (all.some(r => r.id === entry.id)) return;
  all.unshift(entry); // newest first
  // keep at most 50 reports (full text is larger)
  writeAll(all.slice(0, 50));
}

/** Get all stored reports, newest first. */
export function getReports(): ReportEntry[] {
  return readAll();
}

/** Get count of reports generated this month. */
export function getReportsThisMonth(): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return readAll().filter(r => {
    const d = new Date(r.date);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
}

/** Clear all stored reports. */
export function clearReports() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Parse a date string (YYYY-MM-DD) into a short weekday name.
 * e.g. "2026-06-24" → "Tue"
 */
export function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return dateStr;
  }
}

/**
 * Download a report as a markdown text file (fallback when PDF backend fails).
 */
export function downloadReportAsText(report: ReportEntry) {
  const content = report.fullReport || report.summary || "No report content available.";
  const header = `# KrishiSetu Advisory Report\n\n- **Crop:** ${report.crop}\n- **Location:** ${report.location}\n- **Date:** ${new Date(report.date).toLocaleDateString()}\n- **Session:** ${report.id}\n\n---\n\n`;
  const blob = new Blob([header + content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `krishisetu_${report.crop.toLowerCase()}_${report.id.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
