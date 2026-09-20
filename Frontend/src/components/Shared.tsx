import { CheckCircle2 } from 'lucide-react';
// ─── Shared components ────────────────────────────────────────────────────────
export function SectionHeader({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline justify-between mb-5">
      <h2 className="text-[14px] font-semibold text-foreground tracking-tight">
        <span className="text-muted-foreground font-normal mr-2">{index} —</span>{title}
      </h2>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{subtitle}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
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

export const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#e5e5e5] px-3 py-2 text-[12px]">
      <div className="text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium text-foreground">₹{payload[0].value.toLocaleString()}/qtl</div>
    </div>
  );
};

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Eligible: "text-emerald-700 bg-emerald-50 border-emerald-200",
    Registered: "text-blue-700 bg-blue-50 border-blue-200",
    "Not Assessed": "text-muted-foreground bg-[#f5f5f4] border-border",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${styles[status] ?? styles["Not Assessed"]}`}>
      {status}
    </span>
  );
}

