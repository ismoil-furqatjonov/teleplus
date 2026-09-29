// ==============================================================================
// TelePulce - AI Module (Frontend)
// Barcha AI funksiyalari: Chat, Writer, TTS, Image Analysis,
// Smart Reply, Translation, Summary, Voice
// API keylar hech qachon frontend ichida ko'rinmaydi — server orqali ishlaydi
// ==============================================================================

// ─── Configuration ────────────────────────────────────────────────────────────
const AI_BASE_URL = (() => {
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.match(/^192\.168\./)) {
    return `${protocol}//${hostname}:${port || 8000}`;
  }
  return ''; // Same origin for production
})();

// AI Feature settings (from localStorage)
export const AI_SETTINGS = {
  get chatEnabled() { return localStorage.getItem('ai_chat_enabled') !== 'false'; },
  get writerEnabled() { return localStorage.getItem('ai_writer_enabled') !== 'false'; },
  get ttsEnabled() { return localStorage.getItem('ai_tts_enabled') !== 'false'; },
  get voiceEnabled() { return localStorage.getItem('ai_voice_enabled') !== 'false'; },
  get imageAnalysisEnabled() { return localStorage.getItem('ai_image_analysis_enabled') !== 'false'; },
  get translationEnabled() { return localStorage.getItem('ai_translation_enabled') !== 'false'; },
  get smartReplyEnabled() { return localStorage.getItem('ai_smart_reply_enabled') !== 'false'; },
  get summaryEnabled() { return localStorage.getItem('ai_summary_enabled') !== 'false'; },

  set(key, val) { localStorage.setItem(`ai_${key}_enabled`, val ? 'true' : 'false'); }
};

// Request cancellation tokens
const activeRequests = new Map();

function cancelRequest(key) {
  const controller = activeRequests.get(key);
  if (controller) {
    controller.abort();
    activeRequests.delete(key);
  }
}

function makeRequest(key) {
  cancelRequest(key);
  const controller = new AbortController();
  activeRequests.set(key, controller);
  return controller;
}

// ─── Error Handler ────────────────────────────────────────────────────────────
function handleAIError(e, fallback = 'AI xizmatida xatolik') {
  if (e?.name === 'AbortError') return null;
  const msg = e?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::')) {
    return 'Internet aloqasi yo\'q yoki server ishlamayapti';
  }
  return fallback;
}

// ─── AI.1: CHAT (Streaming) ───────────────────────────────────────────────────
// Conversation history
let aiChatHistory = [];

export async function sendAIChatMessage(message, onChunk, onDone, onError) {
  if (!AI_SETTINGS.chatEnabled) {
    onError?.('AI Chat sozlamalarda o\'chirilgan');
    return;
  }

  const controller = makeRequest('ai_chat');

  try {
    const response = await fetch(`${AI_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: aiChatHistory.slice(-10)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      onError?.(err.error || 'AI serveri ishlamayapti');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              onError?.(data.error);
              return;
            }
            if (data.text) {
              fullText += data.text;
              onChunk?.(data.text, fullText);
            }
            if (data.done) {
              // Add to history
              aiChatHistory.push({ role: 'user', text: message });
              aiChatHistory.push({ role: 'model', text: fullText });
              if (aiChatHistory.length > 20) aiChatHistory = aiChatHistory.slice(-20);
              onDone?.(fullText);
              return;
            }
          } catch (e) {}
        }
      }
    }

    aiChatHistory.push({ role: 'user', text: message });
    aiChatHistory.push({ role: 'model', text: fullText });
    onDone?.(fullText);

  } catch (e) {
    const errMsg = handleAIError(e, 'AI bilan bog\'lanib bo\'lmadi');
    if (errMsg) onError?.(errMsg);
  }
}

export function clearAIChatHistory() {
  aiChatHistory = [];
}

// ─── AI.2: WRITER ─────────────────────────────────────────────────────────────
export async function aiWrite(action, text, language = 'uz') {
  if (!AI_SETTINGS.writerEnabled) throw new Error('AI Writer o\'chirilgan');

  const controller = makeRequest('ai_writer');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, text, language }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI Writer xatosi');
    return data.result;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'AI Writer ishlashida xatolik');
  }
}

// ─── AI.3: TEXT-TO-SPEECH ─────────────────────────────────────────────────────
let currentTTSAudio = null;
let ttsState = 'idle'; // idle | loading | playing | paused | error

export async function textToSpeech(text, language = 'uz-UZ', onStateChange) {
  if (!AI_SETTINGS.ttsEnabled) {
    onStateChange?.('error', 'TTS o\'chirilgan');
    return;
  }

  if (ttsState === 'playing') {
    pauseTTS();
    return;
  }

  if (ttsState === 'paused' && currentTTSAudio) {
    currentTTSAudio.play();
    ttsState = 'playing';
    onStateChange?.('playing');
    return;
  }

  ttsState = 'loading';
  onStateChange?.('loading');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });

    const data = await res.json();

    if (data.fallback || !data.audioBase64) {
      // Use Web Speech API as fallback
      useBrowserTTS(text, language, onStateChange);
      return;
    }

    // Play Google TTS audio
    const audioBlob = base64ToBlob(`data:audio/mp3;base64,${data.audioBase64}`, 'audio/mp3');
    const audioUrl = URL.createObjectURL(audioBlob);

    if (currentTTSAudio) {
      currentTTSAudio.pause();
      currentTTSAudio = null;
    }

    currentTTSAudio = new Audio(audioUrl);
    currentTTSAudio.onplay = () => { ttsState = 'playing'; onStateChange?.('playing'); };
    currentTTSAudio.onpause = () => { ttsState = 'paused'; onStateChange?.('paused'); };
    currentTTSAudio.onended = () => { ttsState = 'idle'; onStateChange?.('idle'); URL.revokeObjectURL(audioUrl); };
    currentTTSAudio.onerror = () => { ttsState = 'error'; onStateChange?.('error', 'Audio o\'ynashda xatolik'); };

    await currentTTSAudio.play();

  } catch (e) {
    useBrowserTTS(text, language, onStateChange);
  }
}

function useBrowserTTS(text, language, onStateChange) {
  if (!('speechSynthesis' in window)) {
    ttsState = 'error';
    onStateChange?.('error', 'Brauzeringiz TTS ni qo\'llab-quvvatlamaydi');
    return;
  }

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = language;
  utter.rate = 0.9;
  utter.pitch = 1.0;

  utter.onstart = () => { ttsState = 'playing'; onStateChange?.('playing'); };
  utter.onend = () => { ttsState = 'idle'; onStateChange?.('idle'); };
  utter.onerror = (e) => { ttsState = 'error'; onStateChange?.('error', 'TTS xatosi: ' + e.error); };

  window.speechSynthesis.speak(utter);
}

export function pauseTTS() {
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    ttsState = 'paused';
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.pause();
    ttsState = 'paused';
  }
}

export function stopTTS() {
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio.currentTime = 0;
    currentTTSAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  ttsState = 'idle';
}

function base64ToBlob(base64, type) {
  const parts = base64.split(';base64,');
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type });
}

// ─── AI.4: SPEECH-TO-TEXT (Voice Assistant) ───────────────────────────────────
let speechRecognition = null;

export function startVoiceRecognition(onResult, onError, onStart, language = 'uz-UZ') {
  if (!AI_SETTINGS.voiceEnabled) {
    onError?.('Voice Assistant o\'chirilgan');
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('Brauzeringiz ovoz tanishni qo\'llab-quvvatlamaydi');
    return null;
  }

  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = language;
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => onStart?.();
  speechRecognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    const isFinal = e.results[e.results.length - 1].isFinal;
    onResult?.(transcript, isFinal);
  };
  speechRecognition.onerror = (e) => {
    let msg = 'Ovoz tanishda xatolik';
    if (e.error === 'not-allowed') msg = 'Mikrofon ruxsati berilmagan. Brauzer sozlamalarida ruxsat bering.';
    else if (e.error === 'no-speech') msg = 'Ovoz aniqlanmadi. Qayta urinib ko\'ring.';
    else if (e.error === 'network') msg = 'Internet aloqasi yo\'q';
    onError?.(msg);
  };
  speechRecognition.onend = () => {};

  try {
    speechRecognition.start();
  } catch (e) {
    onError?.('Mikrofon ishga tushmadi: ' + e.message);
    return null;
  }

  return speechRecognition;
}

export function stopVoiceRecognition() {
  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
  }
}

// ─── AI.5: IMAGE ANALYSIS ────────────────────────────────────────────────────
export async function analyzeImage(imageFile, question = 'Bu rasmda nima bor?') {
  if (!AI_SETTINGS.imageAnalysisEnabled) throw new Error('Rasm tahlili o\'chirilgan');

  // Convert file to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });

  const controller = makeRequest('ai_image');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/analyze-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: imageFile.type || 'image/jpeg',
        question
      }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rasm tahlil qilinmadi');
    return data.analysis;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Rasm tahlilida xatolik');
  }
}

// Analyze image from URL (base64 string)
export async function analyzeImageFromBase64(base64, mimeType, question) {
  const controller = makeRequest('ai_image_b64');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/analyze-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType, question }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rasm tahlil qilinmadi');
    return data.analysis;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Rasm tahlilida xatolik');
  }
}

// ─── AI.6: SMART REPLY ────────────────────────────────────────────────────────
export async function getSmartReplies(message, context = '') {
  if (!AI_SETTINGS.smartReplyEnabled) return [];

  const controller = makeRequest('ai_smart_reply');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/smart-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok || !data.replies) return [];
    return data.replies;
  } catch (e) {
    if (e?.name === 'AbortError') return [];
    return [];
  }
}

// ─── AI.7: TRANSLATION ────────────────────────────────────────────────────────
export async function translateText(text, from = 'auto', to = 'uz') {
  if (!AI_SETTINGS.translationEnabled) throw new Error('Tarjima o\'chirilgan');

  const controller = makeRequest('ai_translate');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from, to }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tarjimada xatolik');
    return data.translation;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Tarjimada xatolik');
  }
}

// ─── AI.8: CHAT SUMMARY ──────────────────────────────────────────────────────
export async function summarizeChat(messages, chatName = 'Chat') {
  if (!AI_SETTINGS.summaryEnabled) throw new Error('Xulosa o\'chirilgan');

  const controller = makeRequest('ai_summary');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, chatName }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Xulosa yaratilmadi');
    return data.summary;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Xulosa yaratishda xatolik');
  }
}

// ─── AI.9: AI SEARCH ─────────────────────────────────────────────────────────
export async function aiSearch(query, messages, chats) {
  const controller = makeRequest('ai_search');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, messages, chats }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Qidiruv muvaffaqiyatsiz');
    return data.results || [];
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Qidiruvda xatolik');
  }
}

// ─── AI.10: PROFILE BIO ──────────────────────────────────────────────────────
export async function generateBio(description, style = 'professional') {
  const controller = makeRequest('ai_bio');

  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/profile-bio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, style }),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bio yaratilmadi');
    return data.bio;
  } catch (e) {
    const err = handleAIError(e);
    throw new Error(err || 'Bio yaratishda xatolik');
  }
}

// ─── AI.11: AI STATUS CHECK ──────────────────────────────────────────────────
export async function checkAIStatus() {
  try {
    const res = await fetch(`${AI_BASE_URL}/api/ai/status`, { method: 'GET' });
    if (!res.ok) return { available: false };
    return await res.json();
  } catch (e) {
    return { available: false, error: 'Server bilan bog\'lanib bo\'lmadi' };
  }
}

// ─── AI Chat UI Manager ───────────────────────────────────────────────────────
let aiChatPanelOpen = false;
let aiChatMessages = []; // {role: 'user'|'ai', text, time}

export function initAIChatPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (!panel) return;

  // Load history from localStorage
  const saved = localStorage.getItem('ai_chat_messages');
  if (saved) {
    try {
      aiChatMessages = JSON.parse(saved);
      renderAIChatMessages();
    } catch(e) {}
  }

  const inputEl = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');
  const clearBtn = document.getElementById('ai-chat-clear');

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIChatFromUI();
    }
  });

  inputEl?.addEventListener('input', () => {
    if (sendBtn) sendBtn.disabled = !inputEl.value.trim();
    autoResizeTextarea(inputEl);
  });

  sendBtn?.addEventListener('click', sendAIChatFromUI);

  clearBtn?.addEventListener('click', () => {
    aiChatMessages = [];
    aiChatHistory = [];
    localStorage.removeItem('ai_chat_messages');
    renderAIChatMessages();
  });
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function sendAIChatFromUI() {
  const inputEl = document.getElementById('ai-chat-input');
  const text = inputEl?.value.trim();
  if (!text) return;

  if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }

  const userMsg = { role: 'user', text, time: Date.now() };
  aiChatMessages.push(userMsg);
  renderAIChatMessages();

  // Show typing indicator
  const typingId = addAITypingIndicator();

  let fullResponse = '';

  await sendAIChatMessage(
    text,
    (chunk, full) => {
      fullResponse = full;
      updateAITypingIndicator(typingId, full);
    },
    (finalText) => {
      removeAITypingIndicator(typingId);
      const aiMsg = { role: 'ai', text: finalText, time: Date.now() };
      aiChatMessages.push(aiMsg);
      // Keep max 50 messages in memory
      if (aiChatMessages.length > 50) aiChatMessages = aiChatMessages.slice(-50);
      localStorage.setItem('ai_chat_messages', JSON.stringify(aiChatMessages));
      renderAIChatMessages();
    },
    (error) => {
      removeAITypingIndicator(typingId);
      const errMsg = { role: 'ai', text: `❌ ${error}`, time: Date.now(), isError: true };
      aiChatMessages.push(errMsg);
      renderAIChatMessages();
    }
  );
}

function renderAIChatMessages() {
  const container = document.getElementById('ai-messages-container');
  if (!container) return;

  if (aiChatMessages.length === 0) {
    container.innerHTML = `
      <div class="ai-chat-welcome">
        <div class="ai-chat-welcome-icon">🤖</div>
        <h3>TelePulce AI</h3>
        <p>Sizga qanday yordam bera olaman?</p>
        <div class="ai-suggestions">
          <button class="ai-suggestion-btn" onclick="window.useAISuggestion('Bugungi uchun reja tuz')">📋 Reja tuz</button>
          <button class="ai-suggestion-btn" onclick="window.useAISuggestion('Salom, kim siz?')">👋 Tanishuv</button>
          <button class="ai-suggestion-btn" onclick="window.useAISuggestion('Kod yozishda yordam ber')">💻 Kod yordam</button>
          <button class="ai-suggestion-btn" onclick="window.useAISuggestion('Inglizchani o\\'zbek tiliga tarjima qil')">🌐 Tarjima</button>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  aiChatMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${msg.role} ${msg.isError ? 'ai-msg-error' : ''}`;
    const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (msg.role === 'user') {
      div.innerHTML = `
        <div class="ai-msg-bubble">${escapeAndFormat(msg.text)}</div>
        <div class="ai-msg-time">${timeStr}</div>`;
    } else {
      div.innerHTML = `
        <div class="ai-msg-avatar">🤖</div>
        <div class="ai-msg-content">
          <div class="ai-msg-bubble">${formatAIResponse(msg.text)}</div>
          <div class="ai-msg-actions">
            <button onclick="window.copyAIText('${escapeAttr(msg.text)}')" title="Nusxalash"><i class="fa-solid fa-copy"></i></button>
            <button onclick="window.speakAIText('${escapeAttr(msg.text)}')" title="Ovoz"><i class="fa-solid fa-volume-high"></i></button>
            <span class="ai-msg-time">${timeStr}</span>
          </div>
        </div>`;
    }
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

function addAITypingIndicator() {
  const container = document.getElementById('ai-messages-container');
  if (!container) return null;
  const id = 'ai-typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-ai';
  div.id = id;
  div.innerHTML = `
    <div class="ai-msg-avatar">🤖</div>
    <div class="ai-msg-content">
      <div class="ai-msg-bubble ai-typing-bubble">
        <span class="ai-typing-dots"><span></span><span></span><span></span></span>
        <span class="ai-typing-text">AI yozmoqda...</span>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateAITypingIndicator(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const bubble = el.querySelector('.ai-msg-bubble');
  if (bubble) bubble.innerHTML = formatAIResponse(text) + '<span class="ai-cursor">▋</span>';
  const container = document.getElementById('ai-messages-container');
  if (container) container.scrollTop = container.scrollHeight;
}

function removeAITypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function formatAIResponse(text) {
  if (!text) return '';
  return escapeAndFormat(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/, '').replace(/```$/, '');
      return `<pre class="ai-code-block"><code>${escapeAndFormat(code)}</code></pre>`;
    })
    .replace(/\n/g, '<br>');
}

function escapeAndFormat(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str || '').replace(/'/g, '\\\'').replace(/\n/g, ' ').slice(0, 500);
}

// Global helpers
window.useAISuggestion = (text) => {
  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.focus();
  }
};

window.copyAIText = (text) => {
  navigator.clipboard.writeText(text).catch(() => {});
  window.showToast?.('Nusxalandi', 'success');
};

window.speakAIText = async (text) => {
  await textToSpeech(text, 'uz-UZ', (state, err) => {
    if (state === 'loading') window.showToast?.('Ovoz yaratilmoqda...', 'info');
    if (state === 'error') window.showToast?.(err || 'TTS xatosi', 'error');
  });
};

// ─── AI Writer UI ─────────────────────────────────────────────────────────────
export function initAIWriter(targetInputId = 'message-text-input') {
  const writerBtn = document.getElementById('btn-ai-writer');
  const writerPanel = document.getElementById('ai-writer-panel');
  if (!writerBtn || !writerPanel) return;

  writerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    writerPanel.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!writerPanel.contains(e.target) && e.target !== writerBtn) {
      writerPanel.classList.remove('active');
    }
  });

  // Writer action buttons
  writerPanel.querySelectorAll('[data-writer-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.writerAction;
      const targetInput = document.getElementById(targetInputId);
      const customInput = document.getElementById('ai-writer-custom-input');
      let text = customInput?.value.trim() || targetInput?.value.trim() || '';

      if (!text && action !== 'write') {
        window.showToast?.('Avval matn kiriting', 'warning');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${btn.textContent}`;

      try {
        const result = await aiWrite(action, text);
        const resultEl = document.getElementById('ai-writer-result');
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.querySelector('.ai-writer-result-text').textContent = result;
          resultEl.querySelector('.btn-insert-to-chat').onclick = () => {
            if (targetInput) {
              targetInput.value = result;
              targetInput.dispatchEvent(new Event('input'));
              targetInput.focus();
            }
            writerPanel.classList.remove('active');
            window.showToast?.('Matn inputga joylashtirildi', 'success');
          };
        }
      } catch (e) {
        window.showToast?.(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || btn.textContent;
      }
    });

    // Save original text
    btn.dataset.originalText = btn.innerHTML;
  });
}

// ─── Smart Reply UI ───────────────────────────────────────────────────────────
let smartReplyDebounce = null;

export async function loadSmartReplies(lastMessage) {
  if (!AI_SETTINGS.smartReplyEnabled || !lastMessage) return;

  clearTimeout(smartReplyDebounce);
  smartReplyDebounce = setTimeout(async () => {
    const container = document.getElementById('smart-reply-container');
    if (!container) return;

    container.innerHTML = '<span class="smart-reply-loading"><i class="fa-solid fa-spinner fa-spin"></i></span>';

    try {
      const replies = await getSmartReplies(lastMessage.text || '');
      if (!replies?.length) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = '';
      replies.forEach(reply => {
        const btn = document.createElement('button');
        btn.className = 'smart-reply-btn';
        btn.textContent = reply;
        btn.addEventListener('click', () => {
          const input = document.getElementById('message-text-input');
          if (input) {
            input.value = reply;
            input.dispatchEvent(new Event('input'));
            input.focus();
          }
        });
        container.appendChild(btn);
      });
    } catch (e) {
      container.innerHTML = '';
    }
  }, 800);
}

// ─── Image Analysis Button (shown on image messages) ─────────────────────────
export function showImageAnalysisBtn(messageEl, imageUrl) {
  if (!AI_SETTINGS.imageAnalysisEnabled) return;

  const existing = messageEl.querySelector('.btn-ai-analyze');
  if (existing) return;

  const btn = document.createElement('button');
  btn.className = 'btn-ai-analyze';
  btn.innerHTML = '<i class="fa-solid fa-robot"></i> AI bilan tahlil';
  btn.title = 'AI orqali rasmni tahlil qilish';

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tahlil qilinmoqda...';

    try {
      // Fetch image and convert to base64
      const imgRes = await fetch(imageUrl).catch(() => null);
      let base64 = null;
      let mimeType = 'image/jpeg';

      if (imgRes?.ok) {
        const blob = await imgRes.blob();
        mimeType = blob.type || 'image/jpeg';
        base64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.readAsDataURL(blob);
        });
      }

      if (!base64) throw new Error('Rasm yuklanmadi');

      const analysis = await analyzeImageFromBase64(base64, mimeType, 'Bu rasmda nima bor? Batafsil tushuntir.');

      showAIAnalysisResult(analysis);
    } catch (e) {
      window.showToast?.(e.message || 'Rasm tahlil qilinmadi', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-robot"></i> AI bilan tahlil';
    }
  });

  const container = messageEl.querySelector('.image-msg-container') || messageEl.querySelector('.message-bubble');
  if (container) container.appendChild(btn);
}

function showAIAnalysisResult(text) {
  let modal = document.getElementById('modal-ai-result');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-ai-result';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:500px;">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-robot" style="color:var(--accent-color)"></i> AI Tahlil Natijasi</div>
          <button class="icon-btn modal-close" data-modal="modal-ai-result"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div id="ai-result-text" style="line-height:1.7;white-space:pre-wrap;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary modal-close" data-modal="modal-ai-result">Yopish</button>
          <button class="btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('ai-result-text').textContent);window.showToast('Nusxalandi','success')">
            <i class="fa-solid fa-copy"></i> Nusxalash
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  }

  document.getElementById('ai-result-text').textContent = text;
  modal.classList.add('active');
}

// ─── Context Menu AI Actions ──────────────────────────────────────────────────
export function addAIContextMenuItems(contextMenu, msg) {
  // Remove old AI items
  contextMenu.querySelectorAll('.ai-ctx-item').forEach(el => el.remove());

  const aiDivider = document.createElement('div');
  aiDivider.className = 'context-menu-divider ai-ctx-item';
  contextMenu.appendChild(aiDivider);

  // Translate
  if (AI_SETTINGS.translationEnabled && msg.text) {
    const translateItem = document.createElement('div');
    translateItem.className = 'context-menu-item ai-ctx-item';
    translateItem.innerHTML = '<i class="fa-solid fa-language"></i> AI Tarjima';
    translateItem.addEventListener('click', async () => {
      contextMenu.style.display = 'none';
      const currentLang = document.documentElement.lang || 'uz';
      const to = currentLang === 'uz' ? 'en' : 'uz';
      try {
        window.showToast?.('Tarjima qilinmoqda...', 'info');
        const translation = await translateText(msg.text, 'auto', to);
        showAIAnalysisResult(`🌐 Tarjima (→ ${to === 'uz' ? "O'zbek" : 'Ingliz'}):\n\n${translation}`);
      } catch (e) {
        window.showToast?.(e.message, 'error');
      }
    });
    contextMenu.appendChild(translateItem);
  }

  // Summary for long texts
  if (AI_SETTINGS.summaryEnabled && msg.text && msg.text.length > 200) {
    const summaryItem = document.createElement('div');
    summaryItem.className = 'context-menu-item ai-ctx-item';
    summaryItem.innerHTML = '<i class="fa-solid fa-compress"></i> AI Qisqartirish';
    summaryItem.addEventListener('click', async () => {
      contextMenu.style.display = 'none';
      try {
        window.showToast?.('Qisqartirilmoqda...', 'info');
        const result = await aiWrite('shorten', msg.text);
        showAIAnalysisResult(`📝 Qisqartirilgan:\n\n${result}`);
      } catch (e) {
        window.showToast?.(e.message, 'error');
      }
    });
    contextMenu.appendChild(summaryItem);
  }
}
