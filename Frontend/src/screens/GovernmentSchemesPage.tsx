import React, { useState } from "react";
import { Search, ExternalLink, MapPin } from "lucide-react";
import { PageHeader } from "../components/Shared";
import { fetchSchemes } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { getDefaultState, getLandAcres } from "../utils/settingsStore";

export default function GovernmentSchemesPage() {
  const { t } = useLanguage();
  const profileState = getDefaultState();
  const profileLand = getLandAcres();
  const [crop, setCrop] = useState("Wheat");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await fetchSchemes(crop, profileState);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to load government schemes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("schemes.title")}
        subtitle={t("schemes.subtitle")}
      />

      <form onSubmit={handleSearch} className="mb-8 flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("schemes.crop")}</label>
          <input 
            type="text" 
            value={crop} 
            onChange={(e) => setCrop(e.target.value)}
            className="bg-background border border-border px-3 py-2 text-[13px] outline-none focus:border-[#2d5a1b] w-48"
            required
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("schemes.stateLocation")}</label>
          <div className="flex items-center gap-2 bg-[#f0f0f0] border border-border px-3 py-2 text-[13px] text-muted-foreground w-48 h-[38px]">
            <MapPin size={12} className="text-[#2d5a1b] flex-shrink-0" />
            <span className="truncate font-medium text-foreground">{profileState}</span>
            <span className="text-[9px] ml-auto text-[#2d5a1b] whitespace-nowrap">{t("location.auto")}</span>
          </div>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("schemes.landArea")}</label>
          <div className="flex items-center bg-[#f0f0f0] border border-border px-3 py-2 text-[13px] text-muted-foreground w-32 h-[38px]">
            <span className="font-medium text-foreground">{profileLand || "—"}</span>
          </div>
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="bg-[#2d5a1b] text-white px-6 py-2 text-[13px] font-medium hover:bg-[#234715] transition-colors disabled:opacity-50 h-[38px]"
        >
          {loading ? t("schemes.searching") : t("schemes.findSchemes")}
        </button>
      </form>

      {error && <div className="text-[12px] text-red-600 mb-6">{error}</div>}

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          <div className="inline-block w-5 h-5 border-2 border-border border-t-[#2d5a1b] rounded-full animate-spin mb-3"></div>
          <div>{t("schemes.agenticSearch")}</div>
        </div>
      )}

      {result && result.scheme_result && (
        <div className="space-y-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-foreground">
              {result.scheme_result.total_found} {t("schemes.schemesFound")}
            </h2>
            {result.scheme_result.state_specific && (
              <span className="text-[10px] uppercase tracking-widest text-[#2d5a1b] font-medium bg-[#edf3e8] px-2 py-1 rounded-sm">
                {t("schemes.stateSpecific")}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {result.scheme_result.eligible_schemes?.map((scheme: any, idx: number) => (
              <div key={idx} className="bg-background border border-border p-5 rounded-sm flex flex-col">
                <h3 className="text-[13.5px] font-semibold text-[#2d5a1b] mb-2">{scheme.scheme_name}</h3>
                <p className="text-[12px] text-foreground mb-4 leading-relaxed">{scheme.description}</p>
                
                <div className="space-y-3 flex-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("schemes.eligibility")}</div>
                    <div className="text-[12px]">{scheme.eligibility}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("schemes.applicationSteps")}</div>
                    <div className="text-[12px] whitespace-pre-wrap">{scheme.applicationSteps || scheme.application_steps}</div>
                  </div>
                </div>
                
                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px]">
                  <div>
                    {scheme.deadline ? (
                      <span className="text-amber-700 font-medium">{t("schemes.deadline")}: {scheme.deadline}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("schemes.ongoing")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(scheme.scheme_name + ' government scheme India')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[#2d5a1b] hover:underline font-medium"
                    >
                      <Search size={11} />
                      {t("schemes.googleIt")}
                    </a>
                    {scheme.link && scheme.link !== "null" && (
                      <a href={scheme.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#2d5a1b] hover:underline font-medium">
                        <ExternalLink size={11} />
                        {t("schemes.applyNow")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
