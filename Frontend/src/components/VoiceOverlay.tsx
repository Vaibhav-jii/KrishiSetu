import React, { useEffect, useState, useRef } from "react";
import { PhoneOff, Captions, Mic, Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../contexts/LanguageContext";
import { runVoiceChat, fetchVoiceGreeting } from "../utils/api";

const ROUTES = [
  { kw: ["disease", "leaf", "spot", "rot", "blight", "fungus", "रोग", "पत्ती", "बीमारी", "धब्बे", "सड़न"], page: "crop" },
  { kw: ["price", "mandi", "sell", "rate", "cost", "भाव", "मंडी", "बेच", "दाम", "कीमत"], page: "market" },
  { kw: ["scheme", "yojana", "loan", "subsidy", "gov", "योजना", "ऋण", "सरकार", "लोन", "सब्सिडी"], page: "schemes" },
  { kw: ["weather", "rain", "temp", "wind", "monsoon", "मौसम", "बारिश", "पानी", "तापमान"], page: "weather" },
];

const localStrings = {
  appName: { en: "KrishiSetu", hi: "कृषिसेतु" },
  greeting: { en: "Connecting...", hi: "जुड़ रहा हूँ..." },
  listening: { en: "Listening to your voice...", hi: "बोलिए, मैं सुन रहा हूँ..." },
  thinking: { en: "Consulting AI advisors...", hi: "सलाहकारों से परामर्श कर रहा हूँ..." },
  replying: { en: "Solutions Prepared", hi: "समाधान पाया गया" },
  speakNow: { en: "Speak now...", hi: "बोलना शुरू करें..." },
  transcript: { en: "Transcript", hi: "लिखित" },
  endCall: { en: "End Call", hi: "समाप्त करें" },
};

interface VoiceOverlayProps {
  voiceOpen: boolean;
  setVoiceOpen: (open: boolean) => void;
  setActivePage: (page: any) => void;
  sessionId: string;
  pageContext?: string;
}

export default function VoiceOverlay({ voiceOpen, setVoiceOpen, setActivePage, sessionId, pageContext = "" }: VoiceOverlayProps) {
  const { lang } = useLanguage();
  
  const [phase, setPhase] = useState<"greeting" | "listening" | "thinking" | "replying" | "error">("greeting");
  const [transcript, setTranscript] = useState("");
  const [typedInput, setTypedInput] = useState("");
  const [showCaption, setShowCaption] = useState(true);
  const [reply, setReply] = useState("");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isListeningRef = useRef(false);
  const silenceTimeoutRef = useRef<any>(null);
  const isClosingRef = useRef(false);

  // Unlock or create AudioContext — must be called inside a user gesture
  const ensureAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  // Cleanup everything
  const cleanup = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioPlayRef.current) {
      audioPlayRef.current.pause();
      audioPlayRef.current = null;
    }
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    isListeningRef.current = false;
  };

  // Play base64 WAV audio using Web Audio API to bypass autoplay restrictions.
  // AudioContext stays unlocked after the initial user gesture (opening the overlay).
  const playBase64Audio = (base64Audio: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!base64Audio) {
        resolve();
        return;
      }

      try {
        const ctx = ensureAudioContext();
        // Convert base64 → ArrayBuffer
        const binaryStr = atob(base64Audio);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        ctx.decodeAudioData(
          arrayBuffer,
          (audioBuffer) => {
            // Stop any currently playing audio
            if (audioSourceRef.current) {
              try { audioSourceRef.current.stop(); } catch (e) {}
            }
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            audioSourceRef.current = source;
            source.onended = () => {
              audioSourceRef.current = null;
              resolve();
            };
            source.start(0);
          },
          (err) => {
            console.error("AudioContext decodeAudioData failed:", err);
            // Fallback: HTML Audio element
            const audioUrl = `data:audio/wav;base64,${base64Audio}`;
            const audio = new Audio(audioUrl);
            audioPlayRef.current = audio;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          }
        );
      } catch (e) {
        console.error("playBase64Audio error:", e);
        resolve();
      }
    });
  };

  // Greet the user with voice when overlay opens
  const playGreeting = async () => {
    if (isClosingRef.current) return;
    setPhase("greeting");
    setReply("");
    setTranscript("");

    try {
      const data = await fetchVoiceGreeting(lang);
      if (isClosingRef.current) return;

      if (data && data.success) {
        setReply(data.greeting_text || "");
        setPhase("replying");

        if (data.audio_response) {
          await playBase64Audio(data.audio_response);
        } else {
          // No audio — wait a bit so user can read the greeting text
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    } catch (err) {
      console.error("Greeting fetch error:", err);
      // Fallback: show text greeting without audio
      const fallbackGreeting = lang === "hi"
        ? "नमस्ते! मैं कृषिसेतु हूँ। बताइए, मैं आपकी क्या मदद कर सकता हूँ?"
        : "Hello! I am KrishiSetu. How can I help you today?";
      setReply(fallbackGreeting);
      setPhase("replying");
      await new Promise((r) => setTimeout(r, 2500));
    }

    // After greeting finishes, start listening
    if (!isClosingRef.current) {
      startListening();
    }
  };

  // Handle submitting voice query
  const submitVoiceQuery = async (audioBlob: Blob | null, textQuery = "") => {
    cleanup();
    setPhase("thinking");
    
    try {
      const response = await runVoiceChat(sessionId, audioBlob, textQuery, lang, pageContext);
      
      if (response && response.success) {
        setReply(response.text_response);
        
        // Check if there's any keyword matching route navigation
        const queryText = response.query || textQuery;
        const lowerCmd = queryText.toLowerCase();
        const matchedRoute = ROUTES.find((r) => r.kw.some((k) => lowerCmd.includes(k)));
        if (matchedRoute) {
          setActivePage(matchedRoute.page);
        }

        setPhase("replying");

        if (response.audio_response) {
          // Play the base64 voice response from Sarvam TTS
          await playBase64Audio(response.audio_response);

          // After audio finishes, go back to listening
          if (!isClosingRef.current) {
            startListening();
          }
        } else {
          // No voice output from backend, wait and go back to listening
          setTimeout(() => {
            if (!isClosingRef.current) {
              startListening();
            }
          }, 4000);
        }
      } else {
        throw new Error("Unsuccessful assistant response");
      }
    } catch (error) {
      console.error("Voice chat error:", error);
      setPhase("error");
      const errMsg = lang === "hi" 
        ? "सहायता प्राप्त करने में विफलता। कृपया पुनः प्रयास करें।" 
        : "Failed to reach KrishiSetu voice assistant. Please try again.";
      setReply(errMsg);
      
      setTimeout(() => {
        if (!isClosingRef.current) {
          startListening();
        }
      }, 5000);
    }
  };

  const startListening = async () => {
    cleanup();
    setPhase("listening");
    setTranscript("");
    setReply("");
    setTypedInput("");
    audioChunksRef.current = [];
    isListeningRef.current = true;

    // 1. Start Audio Recording via MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          submitVoiceQuery(audioBlob);
        }
      };
      
      recorder.start();
    } catch (err) {
      console.warn("Microphone access denied or unavailable:", err);
      setRecognitionSupported(false);
    }

    // 2. Start Web Speech API for real-time transcript captioning
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
        
        rec.onresult = (e: any) => {
          const current = Array.from(e.results)
            .map((r: any) => r[0].transcript)
            .join("");
          setTranscript(current);
          
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          // If no speech for 2.2 seconds, trigger stop recording and submit
          silenceTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              stopListeningAndSubmit();
            }
          }, 2200);
        };
        
        rec.onend = () => {
          if (isListeningRef.current && !transcript) {
            try {
              rec.start();
            } catch (err) {}
          }
        };
        
        rec.onerror = (e: any) => {
          console.error("Speech recognition error:", e.error);
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.error(e);
      }
    } else {
      setRecognitionSupported(false);
    }
  };

  const stopListeningAndSubmit = () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Triggered when the voice assistant modal opens or language changes
  useEffect(() => {
    if (voiceOpen) {
      isClosingRef.current = false;
      // Unlock AudioContext immediately (still within the gesture chain from the button click)
      ensureAudioContext();
      playGreeting();
    } else {
      isClosingRef.current = true;
      cleanup();
    }
    return () => {
      isClosingRef.current = true;
      cleanup();
    };
  }, [voiceOpen, lang]); // eslint-disable-line


  const handleOrbClick = () => {
    // Ensure AudioContext is unlocked on user gesture
    ensureAudioContext();
    if (phase === "listening") {
      stopListeningAndSubmit();
    } else if (phase === "replying" || phase === "greeting") {
      if (audioPlayRef.current) {
        audioPlayRef.current.pause();
      }
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (e) {}
        audioSourceRef.current = null;
      }
      startListening();
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typedInput.trim()) {
      submitVoiceQuery(null, typedInput);
    }
  };

  const end = () => {
    isClosingRef.current = true;
    cleanup();
    // Close AudioContext to free resources
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setVoiceOpen(false);
  };

  const t = (key: keyof typeof localStrings) => {
    return localStrings[key]?.[lang] || localStrings[key]?.en || key;
  };

  return (
    <AnimatePresence>
      {voiceOpen && (
        <>
          <style>{`
            @keyframes pulse-ring-green {
              0% { transform: scale(0.95); opacity: 0.5; }
              50% { transform: scale(1.15); opacity: 0.3; }
              100% { transform: scale(1.3); opacity: 0; }
            }
            .animate-pulsering-green {
              animation: pulse-ring-green 1.6s infinite;
            }
            .glow-green-orb {
              box-shadow: 0 0 25px 2px rgba(46, 204, 113, 0.45);
            }
            .glass-box {
              background: rgba(20, 32, 22, 0.65);
              border: 1px solid rgba(46, 204, 113, 0.15);
              backdrop-filter: blur(12px);
              border-radius: 1rem;
            }
          `}</style>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-between py-12 px-6"
            style={{
              background: "radial-gradient(circle at 50% 35%, rgba(46,204,113,0.15), rgba(10,15,10,0.96) 60%)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Top Label */}
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.2em] text-[#3DDC84] font-semibold">{t("appName")}</p>
              <p className="text-[#8aa193] text-xs mt-1.5 flex items-center justify-center gap-1">
                <Sparkles size={12} className="text-[#2ECC71]" />
                {phase === "greeting" && t("greeting")}
                {phase === "listening" && t("listening")}
                {phase === "thinking" && t("thinking")}
                {phase === "replying" && t("replying")}
                {phase === "error" && "Error"}
              </p>
            </div>

            {/* Orb waveform */}
            <div className="relative grid place-items-center">
              <span className="absolute w-64 h-64 rounded-full bg-[#2ECC71]/10 animate-pulsering-green" />
              <span className="absolute w-64 h-64 rounded-full bg-[#2ECC71]/10 animate-pulsering-green" style={{ animationDelay: "0.8s" }} />
              <motion.div
                animate={{ scale: (phase === "listening" || phase === "greeting") ? [1, 1.08, 1] : 1 }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="relative w-36 h-36 rounded-full grid place-items-center glow-green-orb cursor-pointer"
                onClick={handleOrbClick}
                style={{ background: "radial-gradient(circle at 50% 40%, #3DDC84, #1d7a48)" }}
              >
                <Mic size={44} className="text-black" />
              </motion.div>
              {(phase === "listening" || phase === "greeting") && (
                <div className="absolute -bottom-10 flex items-end gap-1 h-8">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 rounded-full bg-[#A8FF60]"
                      animate={{ height: [6, 26, 10, 30, 8] }}
                      transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.08 }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Transcript / Input text box */}
            <div className="w-full max-w-sm">
              {(phase === "replying" || phase === "greeting") && reply && (
                <p className="text-center text-[#3DDC84] mb-4 font-medium px-4 leading-relaxed">{reply}</p>
              )}
              
              {phase === "error" && (
                <p className="text-center text-red-400 mb-4 px-4">{reply}</p>
              )}

              {showCaption && (
                <div className="glass-box p-4 text-center min-h-[60px] flex flex-col items-center justify-center text-white">
                  {recognitionSupported ? (
                    <p className="text-sm">
                      {transcript || t("speakNow")}
                      <span className="animate-pulse ml-0.5">|</span>
                    </p>
                  ) : (
                    /* Fallback Typing Input */
                    <form onSubmit={handleTextSubmit} className="flex gap-2 w-full">
                      <input
                        type="text"
                        value={typedInput}
                        onChange={(e) => setTypedInput(e.target.value)}
                        placeholder={lang === "hi" ? "अपना प्रश्न यहाँ टाइप करें..." : "Type your question here..."}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2ECC71]"
                      />
                      <button type="submit" className="bg-[#2ECC71] text-black p-2 rounded-xl active:scale-95 transition-transform">
                        <Send size={14} />
                      </button>
                    </form>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-center gap-4 mt-6">
                {recognitionSupported && (
                  <button
                    onClick={() => setShowCaption((s) => !s)}
                    className="h-10 px-4 rounded-full flex items-center gap-2 text-sm border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors"
                  >
                    <Captions size={16} /> {t("transcript")}
                  </button>
                )}
                <button
                  onClick={end}
                  className="h-10 px-6 rounded-full flex items-center gap-2 font-semibold border border-[#3DDC84] text-[#3DDC84] hover:bg-[#3DDC84] hover:text-black transition-colors"
                >
                  <PhoneOff size={16} /> {t("endCall")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
