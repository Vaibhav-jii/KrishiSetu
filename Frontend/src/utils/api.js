// Use Vercel environment variables in production, fallback to localhost for local development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Execute the multi-agent agricultural advisory pipeline.
 */
export async function runAdvisory(cropType, location, query, imageFile = null) {
  const formData = new FormData();
  formData.append('crop_type', cropType);
  formData.append('location', location);
  formData.append('query', query || `Analyze crop health for ${cropType} in ${location}`);
  
  // Inject logged-in user_id if available
  const userJson = localStorage.getItem("krishisetu_user");
  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      if (user && user.id) {
        formData.append('user_id', user.id.toString());
      }
    } catch (e) {}
  }
  
  if (imageFile) {
    formData.append('image', imageFile);
  }

  const response = await fetch(`${API_BASE_URL}/advisory`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Failed to execute pipeline' }));
    throw new Error(errData.detail || 'Failed to connect to KrishiSetu API');
  }

  return response.json();
}

/**
 * Fetch past advisory reports for a session ID.
 */
export async function getHistory(sessionId) {
  const response = await fetch(`${API_BASE_URL}/history/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error('Failed to retrieve history');
  }
  return response.json();
}

/**
 * Fetch all past advisory reports.
 */
export async function getAllHistory(userId = null) {
  let url = `${API_BASE_URL}/history/all`;
  if (userId) {
    url += `?user_id=${userId}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to retrieve all history');
  }
  return response.json();
}

/**
 * Download a PDF copy of the advisory report.
 */
export async function downloadAdvisoryPdf(sessionId, reportMarkdown) {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('report', reportMarkdown);

  const response = await fetch(`${API_BASE_URL}/advisory/pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to download report PDF');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `krishisetu_report_${sessionId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Fetch real-time weather from OpenWeatherMap via backend.
 * @param {string} location - City name (e.g. "Delhi")
 * @returns {Promise<object>} { success, location, today, forecast_3d }
 */
export async function fetchWeather(location = 'Delhi') {
  const cacheKey = `weather_${location.toLowerCase()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  const response = await fetch(`${API_BASE_URL}/weather?location=${encodeURIComponent(location)}`);
  if (!response.ok) {
    let errDetail = 'Failed to fetch weather';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errDetail = errData.detail;
    } catch (_) {}
    throw new Error(errDetail);
  }
  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error('Could not parse weather response');
  }

  // Normalize backend field names to what the frontend components expect.
  // For today: prefer temp_c (actual current temp from OWM main.temp).
  // For forecast days: fall back to temp_max_c (no current reading available).
  function normalizeDay(d, isToday = false) {
    if (!d) return d;
    return {
      ...d,
      temp: isToday
        ? (d.temp_c ?? d.temp_max_c ?? d.temp)
        : (d.temp_max_c ?? d.temp),
      humidity: d.humidity_percent ?? d.humidity,
      wind_speed: d.wind_speed_kmh ?? d.wind_speed,
      rain_prob: d.rain_probability_percent ?? d.rain_prob,
      condition: d.description ?? d.condition,
    };
  }

  const result = {
    ...data,
    today: normalizeDay(data.today, true),
    forecast_3d: (data.forecast_3d || []).map((d) => normalizeDay(d, false)),
  };
  sessionStorage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

/**
 * Fetch eligible government schemes via Tavily + LLM.
 * @param {string} crop - Crop type (e.g. "tomato")
 * @param {string} location - State name (e.g. "Maharashtra")
 * @returns {Promise<object>} { success, scheme_result }
 */
export async function fetchSchemes(crop = 'wheat', location = 'Maharashtra') {
  const cacheKey = `schemes_${crop.toLowerCase()}_${location.toLowerCase()}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  const response = await fetch(
    `${API_BASE_URL}/schemes?crop=${encodeURIComponent(crop)}&location=${encodeURIComponent(location)}`
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Scheme search failed' }));
    throw new Error(errData.detail || 'Failed to fetch schemes');
  }
  const data = await response.json();

  // Normalize backend field names (source_url → link) for frontend
  if (data.scheme_result && data.scheme_result.eligible_schemes) {
    data.scheme_result.eligible_schemes = data.scheme_result.eligible_schemes.map(s => ({
      ...s,
      link: s.source_url || s.link || null,
    }));
  }

  sessionStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

/**
 * Get XGBoost 7-day crop price prediction.
 * @param {string} crop - Crop type
 * @param {string} state - Indian state
 * @param {number} month - Current month (1-12)
 * @param {number} lastPrice - Last known price per quintal
 * @returns {Promise<object>} { success, prediction }
 */
export async function fetchPrediction(crop = 'tomato', state = 'Maharashtra', month = 6, lastPrice = 2500) {
  const response = await fetch(
    `${API_BASE_URL}/predict?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}&month=${month}&last_price=${lastPrice}`
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Prediction failed' }));
    throw new Error(errData.detail || 'Failed to get prediction');
  }
  return response.json();
}

/**
 * Get current LLM model info.
 * @returns {Promise<object>} { success, provider, model, api_key_set, available_providers }
 */
export async function getModelInfo() {
  const response = await fetch(`${API_BASE_URL}/settings/model`);
  if (!response.ok) {
    throw new Error('Failed to get model info');
  }
  return response.json();
}

/**
 * Switch the active LLM provider and model at runtime.
 * @param {string} provider - Provider name (gemini, groq, ollama, openrouter, openai)
 * @param {string} [modelName] - Optional model name override
 * @returns {Promise<object>} { success, message, provider, model }
 */
export async function switchModel(provider, modelName = null) {
  const formData = new FormData();
  formData.append('provider', provider);
  if (modelName) {
    formData.append('model_name', modelName);
  }

  const response = await fetch(`${API_BASE_URL}/settings/model`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Failed to switch model' }));
    throw new Error(errData.detail || 'Failed to switch model');
  }
  return response.json();
}

/**
 * Execute the voice-to-voice RAG chat query.
 * @param {string} sessionId
 * @param {Blob|null} audioBlob
 * @param {string} [text]
 * @param {string} [lang] - "hi" or "en"
 * @returns {Promise<object>} { success, query, text_response, audio_response }
 */
export async function runVoiceChat(sessionId, audioBlob = null, text = '', lang = 'en', pageContext = '') {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('lang', lang);
  
  if (audioBlob) {
    formData.append('audio', audioBlob, 'voice_query.wav');
  }
  if (text) {
    formData.append('text', text);
  }
  if (pageContext) {
    formData.append('page_context', pageContext);
  }

  const response = await fetch(`${API_BASE_URL}/voice/chat`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Failed to communicate with voice assistant' }));
    throw new Error(errData.detail || 'Voice assistant error');
  }

  return response.json();
}

/**
 * Fetch a TTS voice greeting from the backend.
 * @param {string} lang - "hi" or "en"
 * @returns {Promise<object>} { success, greeting_text, audio_response }
 */
export async function fetchVoiceGreeting(lang = 'en') {
  const response = await fetch(`${API_BASE_URL}/voice/greet?lang=${encodeURIComponent(lang)}`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Greeting fetch failed' }));
    throw new Error(errData.detail || 'Failed to fetch greeting');
  }
  return response.json();
}

/**
 * Transcribe audio to text via Sarvam STT (no LLM, no TTS).
 * Used by the inline chat transcribe button.
 * @param {Blob} audioBlob - Recorded audio
 * @returns {Promise<object>} { success, transcript }
 */
export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'transcribe.wav');

  const response = await fetch(`${API_BASE_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Transcription failed' }));
    throw new Error(errData.detail || 'Failed to transcribe audio');
  }

  return response.json();
}

/**
 * Send a follow-up question about a specific crop advisory report.
 * If reportId is provided, uses the persistent endpoint that saves to Supabase.
 * @param {string} reportContext - The full report markdown
 * @param {string} userMessage - The farmer's question
 * @param {string} [chatHistory] - Serialized previous messages
 * @param {string} [lang] - "en" or "hi"
 * @param {string} [reportId] - Optional report/session ID for persistent chat
 * @param {boolean} [isGreeting] - Optional flag to trigger an initial LLM greeting
 * @returns {Promise<object>} { success, reply }
 */
export async function chatWithReport(reportContext, userMessage, chatHistory = '', lang = 'en', reportId = '', isGreeting = false) {
  // Get user_id from localStorage
  let userId = null;
  try {
    const user = JSON.parse(localStorage.getItem('krishisetu_user') || '{}');
    userId = user.id || null;
  } catch (_) {}

  const url = reportId
    ? `${API_BASE_URL}/chat/report/${encodeURIComponent(reportId)}`
    : `${API_BASE_URL}/chat/report`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      report_context: reportContext,
      user_message: userMessage,
      chat_history: chatHistory,
      lang: lang,
      is_greeting: isGreeting,
      user_id: userId,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Chat failed' }));
    throw new Error(errData.detail || 'Failed to get answer');
  }

  return response.json();
}

/**
 * Fetch saved chat history for a specific report from Supabase.
 * @param {string} reportId - The report/session ID
 * @returns {Promise<object>} { success, report_id, messages: [{ role, text, created_at }] }
 */
export async function fetchChatHistory(reportId) {
  const response = await fetch(`${API_BASE_URL}/chat/report/${encodeURIComponent(reportId)}`);
  if (!response.ok) {
    return { success: true, report_id: reportId, messages: [] };
  }
  return response.json();
}

/**
 * Fetch all chat sessions (groups of messages) from the backend.
 * @returns {Promise<object>} { success, sessions }
 */
export async function fetchAllChatHistory() {
  // Get user_id from localStorage to fetch only this user's chats
  let userId = null;
  try {
    const user = JSON.parse(localStorage.getItem('krishisetu_user') || '{}');
    userId = user.id || null;
  } catch (_) {}

  const url = userId
    ? `${API_BASE_URL}/chat/all-history?user_id=${userId}`
    : `${API_BASE_URL}/chat/all-history`;

  const response = await fetch(url);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: 'Failed to fetch all chat history' }));
    throw new Error(errData.detail || 'Failed to fetch all chat history');
  }
  return response.json();
}
