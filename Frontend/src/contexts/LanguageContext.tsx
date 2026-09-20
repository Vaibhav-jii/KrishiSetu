import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Lang = "en" | "hi";

// ─── Translation Dictionary ──────────────────────────────────────────────────
const translations: Record<string, Record<Lang, string>> = {
  // Navigation
  "nav.platform": { en: "Platform", hi: "प्लेटफ़ॉर्म" },
  "nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड" },
  "nav.crop": { en: "Crop Analysis", hi: "फसल विश्लेषण" },
  "nav.market": { en: "Market Forecast", hi: "बाज़ार पूर्वानुमान" },
  "nav.schemes": { en: "Government Schemes", hi: "सरकारी योजनाएं" },
  "nav.weather": { en: "Weather", hi: "मौसम" },
  "nav.reports": { en: "Reports", hi: "रिपोर्ट" },
  "nav.settings": { en: "Settings", hi: "सेटिंग्स" },
  "nav.context": { en: "Context", hi: "संदर्भ" },

  // Dashboard
  "dash.title": { en: "Dashboard", hi: "डैशबोर्ड" },
  "dash.subtitle": { en: "Kharif & Rabi Season 2026", hi: "खरीफ एवं रबी सीज़न 2026" },
  "dash.lastUpdated": { en: "Last Updated", hi: "अंतिम अपडेट" },
  "dash.liveData": { en: "Live Data", hi: "लाइव डेटा" },
  "dash.reportsMonth": { en: "Reports This Month", hi: "इस माह की रिपोर्ट" },
  "dash.generatedVia": { en: "Generated via Crop Analysis", hi: "फसल विश्लेषण द्वारा" },
  "dash.actionRequired": { en: "Action Required", hi: "कार्रवाई आवश्यक" },
  "dash.allClear": { en: "All clear", hi: "सब ठीक" },
  "dash.needReview": { en: "need review", hi: "समीक्षा आवश्यक" },
  "dash.recentReports": { en: "Recent Advisory Reports", hi: "हालिया सलाहकार रिपोर्ट" },
  "dash.allReports": { en: "All reports", hi: "सभी रिपोर्ट" },
  "dash.noReports": { en: "No reports yet. Run a", hi: "अभी कोई रिपोर्ट नहीं।" },
  "dash.toGetStarted": { en: "to get started.", hi: "शुरू करने के लिए फसल विश्लेषण चलाएं।" },
  "dash.marketSnapshot": { en: "Market Snapshot", hi: "बाज़ार स्नैपशॉट" },
  "dash.details": { en: "Details", hi: "विवरण" },
  "dash.fetchingPredictions": { en: "Fetching live ML predictions...", hi: "लाइव ML पूर्वानुमान ला रहे हैं..." },
  "dash.weeklyActivity": { en: "Weekly Report Activity", hi: "साप्ताहिक रिपोर्ट गतिविधि" },
  "dash.fullForecast": { en: "Full forecast", hi: "पूर्ण पूर्वानुमान" },
  "dash.loadingWeather": { en: "Loading live weather...", hi: "लाइव मौसम लोड हो रहा है..." },

  // Crop Analysis
  "crop.title": { en: "Crop Advisory Report", hi: "फसल सलाहकार रिपोर्ट" },
  "crop.subtitle": { en: "KrishiSetu Agricultural Intelligence System", hi: "कृषिसेतु कृषि बुद्धिमत्ता प्रणाली" },
  "crop.date": { en: "Date", hi: "तारीख" },
  "crop.newAnalysis": { en: "New Analysis", hi: "नया विश्लेषण" },
  "crop.uploadImage": { en: "Upload Image", hi: "छवि अपलोड करें" },
  "crop.cropType": { en: "Crop Type", hi: "फसल का प्रकार" },
  "crop.location": { en: "Location", hi: "स्थान" },
  "crop.cropImage": { en: "Crop Image (Optional)", hi: "फसल की छवि (वैकल्पिक)" },
  "crop.runAnalysis": { en: "Run Analysis", hi: "विश्लेषण चलाएं" },
  "crop.analyzing": { en: "Analyzing...", hi: "विश्लेषण हो रहा है..." },
  "crop.pipelineRunning": { en: "Agentic Pipeline is running... This may take up to 30 seconds.", hi: "एजेंटिक पाइपलाइन चल रही है... इसमें 30 सेकंड तक लग सकते हैं।" },
  "crop.results": { en: "Analysis Results", hi: "विश्लेषण परिणाम" },
  "crop.generatedReport": { en: "Generated Report", hi: "उत्पन्न रिपोर्ट" },
  "crop.downloadPdf": { en: "Download PDF", hi: "PDF डाउनलोड करें" },

  // Weather
  "weather.title": { en: "Weather Outlook", hi: "मौसम का पूर्वानुमान" },
  "weather.realtime": { en: "Real-time data for", hi: "रियल-टाइम डेटा:" },
  "weather.updatedToday": { en: "Updated Today", hi: "आज अपडेट" },
  "weather.cityName": { en: "City Name", hi: "शहर का नाम" },
  "weather.getWeather": { en: "Get Weather", hi: "मौसम देखें" },
  "weather.fetching": { en: "Fetching...", hi: "ला रहे हैं..." },
  "weather.fetchingData": { en: "Fetching live weather data...", hi: "लाइव मौसम डेटा ला रहे हैं..." },
  "weather.temperature": { en: "Temperature", hi: "तापमान" },
  "weather.humidity": { en: "Humidity", hi: "नमी" },
  "weather.windSpeed": { en: "Wind Speed", hi: "हवा की गति" },
  "weather.visibility": { en: "Visibility", hi: "दृश्यता" },
  "weather.good": { en: "Good", hi: "अच्छी" },
  "weather.clear": { en: "Clear conditions", hi: "साफ़ मौसम" },
  "weather.forecastChart": { en: "Forecast Chart", hi: "पूर्वानुमान चार्ट" },
  "weather.forecastDetail": { en: "Forecast Detail", hi: "पूर्वानुमान विवरण" },
  "weather.condition": { en: "Condition", hi: "स्थिति" },
  "weather.rainProb": { en: "Rain Prob.", hi: "बारिश सम्भावना" },
  "weather.advisory": { en: "Advisory", hi: "सलाह" },
  "weather.noSpraying": { en: "No Spraying", hi: "छिड़काव न करें" },

  // Government Schemes
  "schemes.title": { en: "Government Schemes", hi: "सरकारी योजनाएं" },
  "schemes.subtitle": { en: "Central & State agricultural benefit programmes", hi: "केंद्र एवं राज्य कृषि लाभ कार्यक्रम" },
  "schemes.crop": { en: "Crop", hi: "फसल" },
  "schemes.stateLocation": { en: "State / Location", hi: "राज्य / स्थान" },
  "schemes.landArea": { en: "Land Area (Acres)", hi: "भूमि क्षेत्र (एकड़)" },
  "schemes.findSchemes": { en: "Find Schemes", hi: "योजनाएं खोजें" },
  "schemes.searching": { en: "Searching...", hi: "खोज रहे हैं..." },
  "schemes.agenticSearch": { en: "Agentic Search is looking for eligible schemes...", hi: "एजेंटिक सर्च पात्र योजनाएं खोज रहा है..." },
  "schemes.schemesFound": { en: "Schemes Found", hi: "योजनाएं मिलीं" },
  "schemes.stateSpecific": { en: "Includes State-Specific", hi: "राज्य-विशिष्ट शामिल" },
  "schemes.eligibility": { en: "Eligibility", hi: "पात्रता" },
  "schemes.applicationSteps": { en: "Application Steps", hi: "आवेदन चरण" },
  "schemes.deadline": { en: "Deadline", hi: "अंतिम तिथि" },
  "schemes.ongoing": { en: "Ongoing", hi: "चालू" },
  "schemes.googleIt": { en: "Google It", hi: "गूगल करें" },
  "schemes.applyNow": { en: "Apply Now →", hi: "अभी आवेदन करें →" },

  // Reports
  "reports.title": { en: "Reports", hi: "रिपोर्ट" },
  "reports.subtitle": { en: "All advisory, market, and scheme reports", hi: "सभी सलाहकार, बाज़ार और योजना रिपोर्ट" },
  "reports.refresh": { en: "Refresh", hi: "रिफ्रेश" },
  "reports.clearAll": { en: "Clear All", hi: "सब मिटाएं" },
  "reports.totalReports": { en: "Total Reports", hi: "कुल रिपोर्ट" },
  "reports.thisMonth": { en: "This Month", hi: "इस माह" },
  "reports.actionRequired": { en: "Action Required", hi: "कार्रवाई आवश्यक" },
  "reports.needsReview": { en: "Needs review", hi: "समीक्षा आवश्यक" },
  "reports.completed": { en: "Completed", hi: "पूर्ण" },
  "reports.successfulRuns": { en: "Successful runs", hi: "सफल रन" },
  "reports.searchPlaceholder": { en: "Search by crop, location, or ID...", hi: "फसल, स्थान या ID से खोजें..." },
  "reports.sessionId": { en: "Session ID", hi: "सत्र ID" },
  "reports.crop": { en: "Crop", hi: "फसल" },
  "reports.location": { en: "Location", hi: "स्थान" },
  "reports.date": { en: "Date", hi: "तारीख" },
  "reports.download": { en: "Download", hi: "डाउनलोड" },
  "reports.noReports": { en: "No reports yet", hi: "अभी कोई रिपोर्ट नहीं" },
  "reports.runCropAnalysis": { en: "Run a Crop Analysis to generate your first report.", hi: "अपनी पहली रिपोर्ट बनाने के लिए फसल विश्लेषण चलाएं।" },

  // Market
  "market.title": { en: "Market Forecast", hi: "बाज़ार पूर्वानुमान" },
  "market.subtitle": { en: "AI Price Predictions · Uttar Pradesh", hi: "AI मूल्य पूर्वानुमान · उत्तर प्रदेश" },
  "market.inputPrice": { en: "Input Current Local Price (₹/qtl) for accuracy", hi: "सटीकता के लिए वर्तमान स्थानीय मूल्य (₹/क्विंटल) दर्ज करें" },
  "market.loading": { en: "Loading predictions using ML models...", hi: "ML मॉडल से पूर्वानुमान लोड हो रहे हैं..." },
  "market.currentPrice": { en: "Current Price", hi: "वर्तमान मूल्य" },
  "market.forecast7d": { en: "7-Day Forecast", hi: "7-दिन पूर्वानुमान" },
  "market.expectedChange": { en: "Expected Change", hi: "अपेक्षित बदलाव" },
  "market.modelConfidence": { en: "Model Confidence", hi: "मॉडल विश्वसनीयता" },
  "market.perQuintal": { en: "per quintal", hi: "प्रति क्विंटल" },
  "market.outlook7d": { en: "7-day outlook", hi: "7-दिन दृष्टिकोण" },
  "market.reliability": { en: "R² Reliability", hi: "R² विश्वसनीयता" },

  // Settings
  "settings.title": { en: "Settings", hi: "सेटिंग्स" },
  "settings.subtitle": { en: "Personalize your KrishiSetu experience", hi: "अपना कृषिसेतु अनुभव कस्टमाइज़ करें" },
  "settings.profile": { en: "Farmer Profile", hi: "किसान प्रोफ़ाइल" },
  "settings.profileDesc": { en: "Personal information", hi: "व्यक्तिगत जानकारी" },
  "settings.name": { en: "Full Name", hi: "पूरा नाम" },
  "settings.namePlaceholder": { en: "Enter your name", hi: "अपना नाम दर्ज करें" },
  "settings.locationLabel": { en: "Default City / District", hi: "डिफ़ॉल्ट शहर / जिला" },
  "settings.locationHint": { en: "Used as default for Weather", hi: "मौसम के लिए डिफ़ॉल्ट" },
  "settings.stateLabel": { en: "State", hi: "राज्य" },
  "settings.stateHint": { en: "Used as default for Schemes", hi: "योजनाओं के लिए डिफ़ॉल्ट" },
  "settings.landLabel": { en: "Total Land (Acres)", hi: "कुल भूमि (एकड़)" },
  "settings.landHint": { en: "Used to filter scheme eligibility", hi: "योजना पात्रता के लिए" },
  "settings.save": { en: "Save Settings", hi: "सेटिंग्स सेव करें" },
  "settings.saved": { en: "Saved ✓", hi: "सेव हो गया ✓" },
  "settings.language": { en: "Language", hi: "भाषा" },
  "settings.languageDesc": { en: "App display language", hi: "ऐप प्रदर्शन भाषा" },

  // Common
  "common.status": { en: "Status", hi: "स्थिति" },
  "common.completed": { en: "Completed", hi: "पूर्ण" },
  "common.error": { en: "Error", hi: "त्रुटि" },

  // Chatbot (Crop Analysis follow-up)
  "chat.title": { en: "Ask Follow-up Questions", hi: "अनुवर्ती प्रश्न पूछें" },
  "chat.subtitle": { en: "Ask about your report", hi: "अपनी रिपोर्ट के बारे में पूछें" },
  "chat.placeholder": { en: "Ask a question about this report...", hi: "इस रिपोर्ट के बारे में प्रश्न पूछें..." },
  "chat.send": { en: "Send", hi: "भेजें" },
  "chat.thinking": { en: "Thinking...", hi: "सोच रहा हूँ..." },
  "chat.transcribing": { en: "Transcribing...", hi: "लिख रहा हूँ..." },
  "chat.recordHint": { en: "Hold to record, release to transcribe", hi: "रिकॉर्ड करने के लिए दबाएं, ट्रांसक्राइब करने के लिए छोड़ें" },

  // Auto-location
  "location.auto": { en: "From your profile", hi: "आपकी प्रोफ़ाइल से" },
  "location.change": { en: "Change in Settings", hi: "सेटिंग्स में बदलें" },

  // Language toggle
  "lang.toggle": { en: "हिं", hi: "EN" },
  "lang.label": { en: "Hindi", hi: "English" },
};

// ─── Context ──────────────────────────────────────────────────────────────────
interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

const LANG_STORAGE_KEY = "krishisetu_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      return (stored === "hi" ? "hi" : "en") as Lang;
    } catch {
      return "en";
    }
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_STORAGE_KEY, l);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[lang] || translations[key]?.en || key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
