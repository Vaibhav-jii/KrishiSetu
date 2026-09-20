import React, { useState, useRef, useEffect } from "react";
import { Leaf, MapPin, Calendar, User, Download, Send, Mic, MicOff, MessageSquare, Settings } from "lucide-react";
import { SectionHeader, PageHeader } from "../components/Shared";
import { runAdvisory, downloadAdvisoryPdf, chatWithReport, transcribeAudio, fetchChatHistory } from "../utils/api";
import { saveReport } from "../utils/reportStore";
import ReactMarkdown from 'react-markdown';
import { useLanguage } from "../contexts/LanguageContext";
import { getProfile } from "../utils/settingsStore";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface CropAnalysisPageProps {
  /** Pre-loaded report data for "Continue Chat" from ReportsPage */
  preloadedReport?: {
    session_id: string;
    fullReport: string;
    crop: string;
  } | null;
}

export default function CropAnalysisPage({ preloadedReport }: CropAnalysisPageProps) {
  const { t, lang } = useLanguage();
  const profile = getProfile();
  const profileLocation = profile.location && profile.state ? `${profile.location}, ${profile.state}` : "Agra, Uttar Pradesh";
  
  const [cropType, setCropType] = useState(preloadedReport?.crop || "Wheat");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(preloadedReport ? { final_report: preloadedReport.fullReport, session_id: preloadedReport.session_id } : null);
  const [error, setError] = useState("");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Transcribe state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Load persistent chat history when result is available
  useEffect(() => {
    const reportId = result?.session_id;
    if (reportId && !chatHistoryLoaded) {
      setChatHistoryLoaded(true);
      fetchChatHistory(reportId).then((data) => {
        if (data.success && data.messages && data.messages.length > 0) {
          const loaded: ChatMessage[] = data.messages.map((m: any) => ({
            role: m.role as "user" | "assistant",
            text: m.text,
          }));
          setChatMessages(loaded);
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
        }
      }).catch(() => {});
    }
  }, [result?.session_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setChatMessages([]);
    setChatHistoryLoaded(false);

    try {
      const data = await runAdvisory(cropType, profileLocation, `Analyze crop health for ${cropType} in ${profileLocation}`, imageFile);
      setResult(data);
      // Persist report for Reports tab & Dashboard
      const reportText = typeof data.final_report === 'string' ? data.final_report : '';
      const sessionId = data.session_id || `report-${Date.now()}`;
      saveReport({
        id: sessionId,
        crop: cropType,
        location: profileLocation,
        date: new Date().toISOString(),
        status: data.errors && Object.keys(data.errors).length > 0 ? "Action Required" : "Completed",
        summary: reportText.slice(0, 120),
        fullReport: reportText,
      });

      // Auto-trigger the initial proactive chat greeting
      if (sessionId) {
        setChatLoading(true);
        try {
          const res = await chatWithReport(reportText, "Generate greeting and follow up question", "", lang, sessionId, true);
          setChatMessages([{ role: "assistant", text: res.reply }]);
        } catch (e) {
          console.error("Failed to generate initial greeting", e);
        } finally {
          setChatLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to run advisory pipeline.");
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  const handleDownload = async () => {
    if (!result) return;
    const reportText = typeof result.final_report === 'string' ? result.final_report : '';
    try {
      await downloadAdvisoryPdf(result.session_id || "report", reportText);
    } catch (err) {
      alert("Failed to download PDF. The backend might not have wkhtmltopdf installed.");
    }
  };

  // ─── Chat Logic ───────────────────────────────────────────
  const getReportText = () => {
    if (!result) return "";
    return typeof result.final_report === 'string' ? result.final_report
      : typeof result.report === 'string' ? result.report
      : JSON.stringify(result, null, 2);
  };

  const getReportId = () => result?.session_id || "";

  const buildChatHistory = () => {
    return chatMessages
      .map((m) => `${m.role === "user" ? "Farmer" : "KrishiSetu"}: ${m.text}`)
      .join("\n");
  };

  const handleChatSend = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", text: message }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const history = buildChatHistory();
      const reportId = getReportId();
      const res = await chatWithReport(getReportText(), message, history, lang, reportId);
      setChatMessages([...newMessages, { role: "assistant", text: res.reply }]);
    } catch (err: any) {
      setChatMessages([...newMessages, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  // ─── Transcription (Mic) Logic ─────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        if (audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          try {
            const res = await transcribeAudio(audioBlob);
            if (res.transcript) {
              setChatInput((prev) => (prev ? prev + " " : "") + res.transcript);
            }
          } catch (err) {
            console.error("Transcription failed:", err);
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div>
      <PageHeader
        title={t("crop.title")}
        subtitle={t("crop.subtitle")}
        right={
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("crop.date")}</div>
            <div className="text-[12px] font-medium text-foreground">{todayStr}</div>
          </div>
        }
      />

      <section className="mb-8 pb-8 border-b border-border">
        <SectionHeader index="01" title={t("crop.newAnalysis")} subtitle={t("crop.uploadImage")} />
        <form onSubmit={handleSubmit} className="bg-[#fafafa] border border-border p-5 rounded-sm max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("crop.cropType")}</label>
              <input 
                type="text" 
                value={cropType} 
                onChange={(e) => setCropType(e.target.value)}
                className="w-full bg-background border border-border px-3 py-2 text-[13px] outline-none focus:border-[#2d5a1b]"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("crop.location")}</label>
              <div className="w-full bg-[#f0f0f0] border border-border px-3 py-2 text-[13px] text-muted-foreground flex items-center gap-2">
                <MapPin size={12} className="flex-shrink-0" />
                <span className="truncate">{profileLocation}</span>
                <span className="text-[10px] ml-auto whitespace-nowrap text-[#2d5a1b]">{t("location.auto")}</span>
              </div>
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{t("crop.cropImage")}</label>
            <input 
              type="file" 
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="w-full text-[12px] file:mr-4 file:py-2 file:px-4 file:border-0 file:text-[11px] file:uppercase file:tracking-widest file:bg-border file:text-foreground hover:file:bg-[#e5e5e5] transition-colors cursor-pointer"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full sm:w-auto bg-[#2d5a1b] text-white px-6 py-2.5 text-[12.5px] font-medium hover:bg-[#234715] transition-colors disabled:opacity-50"
          >
            {loading ? t("crop.analyzing") : t("crop.runAnalysis")}
          </button>
          {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
        </form>
      </section>

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          <div className="inline-block w-5 h-5 border-2 border-border border-t-[#2d5a1b] rounded-full animate-spin mb-3"></div>
          <div>{t("crop.pipelineRunning")}</div>
        </div>
      )}

      {result && (
        <>
          <section className="mb-8">
            <SectionHeader index="02" title={t("crop.results")} subtitle={t("crop.generatedReport")} />
            
            <div className="bg-background border border-border p-6 rounded-sm">
              <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground prose-headings:font-semibold prose-a:text-[#2d5a1b]">
                <ReactMarkdown>{
                  typeof result.final_report === 'string' ? result.final_report
                  : typeof result.report === 'string' ? result.report
                  : JSON.stringify(result, null, 2)
                }</ReactMarkdown>
              </div>
            </div>
            
            <div className="mt-8 pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">KrishiSetu</span> Agricultural Intelligence Platform
                <br />Ref: {result.session_id || "Session"} · {todayStr}
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 text-[12.5px] bg-[#2d5a1b] text-white px-4 py-2 rounded-sm hover:bg-[#234715] transition-colors font-medium flex-shrink-0"
              >
                <Download size={13} /> {t("crop.downloadPdf")}
              </button>
            </div>
          </section>

          {/* ─── Section 03: Follow-up Chat ─── */}
          <section className="mb-12">
            <SectionHeader index="03" title={t("chat.title")} subtitle={t("chat.subtitle")} />

            <div className="bg-background border border-border rounded-sm overflow-hidden max-w-2xl">
              {/* Chat messages */}
              <div className="max-h-[340px] overflow-y-auto p-4 space-y-3" style={{ minHeight: chatMessages.length > 0 ? "120px" : "60px" }}>
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground text-[12px] py-4 flex items-center justify-center gap-2">
                    <MessageSquare size={14} />
                    {t("chat.placeholder")}
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 text-[12.5px] leading-relaxed rounded-lg ${
                        msg.role === "user"
                          ? "bg-[#2d5a1b] text-white rounded-br-sm"
                          : "bg-[#f5f5f4] text-foreground border border-border rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none text-[12.5px] prose-p:my-1 prose-strong:text-foreground">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#f5f5f4] border border-border px-3.5 py-2.5 rounded-lg rounded-bl-sm text-[12px] text-muted-foreground flex items-center gap-2">
                      <div className="inline-block w-3 h-3 border-2 border-border border-t-[#2d5a1b] rounded-full animate-spin"></div>
                      {t("chat.thinking")}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input bar */}
              <div className="border-t border-border p-3 bg-[#fafafa]">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder={t("chat.placeholder")}
                      disabled={chatLoading}
                      className="w-full bg-background border border-border px-3 py-2.5 pr-10 text-[13px] outline-none focus:border-[#2d5a1b] rounded-sm disabled:opacity-50"
                    />
                    {/* Transcribe mic button inside input */}
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={chatLoading || isTranscribing}
                      title={isRecording ? "Stop recording" : t("chat.recordHint")}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-sm grid place-items-center transition-all disabled:opacity-40 ${
                        isRecording
                          ? "bg-red-500 text-white animate-pulse"
                          : isTranscribing
                          ? "bg-amber-100 text-amber-600"
                          : "bg-transparent text-muted-foreground hover:text-[#2d5a1b] hover:bg-[#edf3e8]"
                      }`}
                    >
                      {isTranscribing ? (
                        <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      ) : isRecording ? (
                        <MicOff size={14} />
                      ) : (
                        <Mic size={14} />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || chatLoading}
                    className="h-[38px] px-4 bg-[#2d5a1b] text-white rounded-sm text-[12px] font-medium hover:bg-[#234715] transition-colors disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Send size={13} />
                    {t("chat.send")}
                  </button>
                </div>
                {(isRecording || isTranscribing) && (
                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                    {isRecording ? "🔴 Recording..." : t("chat.transcribing")}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
