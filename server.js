// ==============================================================================
// TelePulse - Modern Real-time HTTP Server + Full AI Backend
// All AI features: Chat, Writer, TTS, Voice, Image Analysis, Translation,
//                  Smart Reply, Summary, AI Search, Moderation
// ==============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  loadEnvConfig,
  moderateText,
  moderateMedia,
  getModerationStats,
  loadAuditLogs,
  clearAuditLogs,
  normalizeText,
  scanUrlsInText
} = require('./moderationEngine');

const config = loadEnvConfig();
const PORT = config.PORT || 8000;
const HOST = config.HOST || '0.0.0.0';

// Helper to get local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseRequestBody(req, maxBytes = 70 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesCount = 0;
    req.on('data', chunk => {
      bytesCount += chunk.length;
      if (bytesCount > maxBytes) {
        reject(new Error("So'rov hajmi ruxsat etilgan limitdan oshdi."));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        if (!body.trim()) return resolve({});
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Noto'g'ri JSON formati: " + err.message));
      }
    });
    req.on('error', err => reject(err));
  });
}

// ─── Gemini AI Helper ─────────────────────────────────────────────────────────

const AI_MODEL = config.AI_MODEL || 'gemini-2.0-flash-exp';

async function callGeminiAPI(payload, stream = false) {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY .env faylida sozlanmagan');
  }

  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${apiKey}`;

  // Use Node.js built-in fetch (Node 18+) or https module
  let fetchFn;
  if (typeof fetch !== 'undefined') {
    fetchFn = fetch;
  } else {
    // Polyfill via https module for older Node
    fetchFn = (url, opts) => new Promise((resolve, reject) => {
      const https = require('https');
      const urlObj = new URL(url);
      const postData = opts.body;
      const reqOpts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: opts.method || 'POST',
        headers: opts.headers || {}
      };
      const req = https.request(reqOpts, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(JSON.parse(data)),
            text: () => Promise.resolve(data),
            body: { getReader: () => {
              let pos = 0;
              const encoder = new (require('util').TextEncoder || TextEncoder)();
              const buf = Buffer.from(data);
              return {
                read: () => {
                  if (pos >= buf.length) return Promise.resolve({ done: true });
                  const chunk = buf.slice(pos, pos + 1024);
                  pos += chunk.length;
                  return Promise.resolve({ done: false, value: chunk });
                }
              };
            }}
          });
        });
      });
      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API xatosi (${response.status}): ${errText.slice(0, 200)}`);
  }

  return response;
}

async function geminiGenerateText(prompt, systemInstruction = null, imageData = null) {
  const parts = [];
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType || 'image/jpeg',
        data: imageData.base64
      }
    });
  }
  parts.push({ text: prompt });

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await callGeminiAPI(payload);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// ─── AI Error Normalizer ──────────────────────────────────────────────────────

function normalizeAIError(err) {
  const msg = err.message || '';
  if (msg.includes('API_KEY')) return "API kalit noto'g'ri yoki kiritilmagan";
  if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) return 'AI limiti tugadi. Keyinroq urinib ko\'ring';
  if (msg.includes('PERMISSION_DENIED')) return "API kalitga ruxsat yo'q";
  if (msg.includes('SAFETY')) return 'So\'rov xavfsizlik filtriga tushdi. Boshqacha yozing';
  if (msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED')) return 'AI sekin javob berdi. Qayta urinib ko\'ring';
  if (msg.includes('sozlanmagan')) return 'AI xizmati hali sozlanmagan. .env fayliga GEMINI_API_KEY qo\'shing';
  return 'AI xizmatida xatolik yuz berdi. Qayta urinib ko\'ring';
}

// ==============================================================================
//  API ROUTES
// ==============================================================================

const server = http.createServer(async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const cleanUrl = req.url.split('?')[0];

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // ─── 1. Server Info ────────────────────────────────────────────────────────
  if (cleanUrl === '/api/server-info' || cleanUrl === '/api/ip') {
    const cfg = loadEnvConfig();
    return sendJSON(res, 200, {
      ip: localIP,
      port: PORT,
      url: `http://${localIP}:${PORT}/login.html`,
      aiEnabled: !!cfg.GEMINI_API_KEY,
      aiModel: AI_MODEL,
      features: {
        chat: cfg.AI_CHAT_ENABLED !== 'false',
        writer: cfg.AI_WRITER_ENABLED !== 'false',
        tts: cfg.AI_TTS_ENABLED !== 'false',
        voice: cfg.AI_VOICE_ENABLED !== 'false',
        imageAnalysis: cfg.AI_IMAGE_ANALYSIS_ENABLED !== 'false',
        translation: cfg.AI_TRANSLATION_ENABLED !== 'false',
        smartReply: cfg.AI_SMART_REPLY_ENABLED !== 'false',
        summary: cfg.AI_SUMMARY_ENABLED !== 'false'
      }
    });
  }

  // ─── 2. Text Moderation ────────────────────────────────────────────────────
  if (cleanUrl === '/api/moderate/text' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const result = await moderateText({
        text: payload.text || '',
        senderId: payload.senderId || 'guest',
        senderName: payload.senderName || 'Foydalanuvchi',
        clientIp
      });
      return sendJSON(res, 200, result);
    } catch (e) {
      return sendJSON(res, 400, { allowed: false, reason: e.message });
    }
  }

  // ─── 3. Media Moderation ───────────────────────────────────────────────────
  if (cleanUrl === '/api/moderate/media' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const result = await moderateMedia({
        base64Data: payload.dataUrl || payload.base64Data || '',
        mimeType: payload.mimeType || 'image/jpeg',
        type: payload.type || 'image',
        fileName: payload.fileName || '',
        fileSize: payload.fileSize || 0,
        senderId: payload.senderId || 'guest',
        senderName: payload.senderName || 'Foydalanuvchi',
        clientIp
      });
      return sendJSON(res, 200, result);
    } catch (e) {
      return sendJSON(res, 400, { allowed: false, reason: e.message });
    }
  }

  // ─── 4. Moderation Stats ───────────────────────────────────────────────────
  if (cleanUrl === '/api/moderation/stats' && req.method === 'GET') {
    return sendJSON(res, 200, getModerationStats());
  }

  if (cleanUrl === '/api/moderation/logs' && req.method === 'GET') {
    return sendJSON(res, 200, loadAuditLogs());
  }

  if (cleanUrl === '/api/moderation/clear-logs' && req.method === 'POST') {
    return sendJSON(res, 200, clearAuditLogs());
  }

  if (cleanUrl === '/api/moderation/test' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const testText = payload.text || '';
      const normalized = normalizeText(testText);
      const urlCheck = scanUrlsInText(testText);
      const modResult = await moderateText({ text: testText, senderId: 'admin_test', senderName: 'Admin', clientIp });
      return sendJSON(res, 200, {
        input: testText, normalized,
        urlsFound: urlCheck.flagged ? [urlCheck.matched] : [],
        verdict: modResult.allowed ? 'SAFE' : 'BLOCKED',
        allowed: modResult.allowed,
        flag: modResult.flag || 'safe',
        reason: modResult.reason || 'Kontent xavfsiz.',
        aiEngine: config.GEMINI_API_KEY ? 'Gemini AI' : 'Heuristic Engine'
      });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AI ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── AI.1: AI Chat (Gemini) ────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/chat' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { message, history = [], language = 'uz' } = payload;

      if (!message) return sendJSON(res, 400, { error: 'Xabar bo\'sh bo\'lmasin' });

      const systemPrompt = language === 'uz'
        ? `Sen TelePulce messenjeri uchun yaratilgan aqlli AI yordamchisisisan. Noming "TelePulce AI". 
O'zbek tilida, do'stona va professional tarzda javob ber.
Qisqa va aniq bo'l. Kod yozishda, tarjimada, tushuntirishda yordam bera olasan.
Suhbat tarixini eslab tur. Yolg'on ma'lumot berma.`
        : language === 'ru'
        ? `Ты умный AI-ассистент мессенджера TelePulce. Отвечай по-русски, дружелюбно и профессионально.`
        : `You are TelePulce AI, a smart assistant for TelePulce messenger. Answer in English, friendly and professional.`;

      // Build conversation with history
      const contents = [];
      for (const h of history.slice(-10)) {
        contents.push({ role: h.role, parts: [{ text: h.text }] });
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const apiKey = config.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY sozlanmagan');

      const apiPayload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 1024 }
      };

      // Streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

      let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
      if (!fetchFn) {
        // Fallback non-streaming
        const response = await geminiGenerateText(message, systemPrompt);
        res.write(`data: ${JSON.stringify({ text: response, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      try {
        const apiRes = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiPayload)
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          throw new Error(`API xatosi: ${errText.slice(0, 200)}`);
        }

        // Stream the response
        const reader = apiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const chunk = JSON.parse(jsonStr);
                const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) {
                  res.write(`data: ${JSON.stringify({ text, done: false })}\n\n`);
                }
              } catch (e) {}
            }
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamErr) {
        res.write(`data: ${JSON.stringify({ error: normalizeAIError(streamErr), done: true })}\n\n`);
        res.end();
      }

    } catch (e) {
      if (!res.headersSent) {
        return sendJSON(res, 500, { error: normalizeAIError(e) });
      }
    }
    return;
  }

  // ─── AI.2: AI Writer ───────────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/write' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { action, text, language = 'uz', context = '' } = payload;

      const prompts = {
        write: `O'zbek tilida quyidagi so'rov asosida matn yoz: "${text}". Faqat tayyor matnni ber, boshqa tushuntirish kerak emas.`,
        rewrite: `Ushbu matnni qayta yoz, ma'nosini saqlab yangi uslubda: "${text}"`,
        shorten: `Ushbu matnni qisqartir, asosiy fikrni saqla: "${text}"`,
        expand: `Ushbu matnni to'liq qilib yoz, ko'proq ma'lumot qo'sh: "${text}"`,
        translate: `Ushbu matnni "${language}" tiliga tarjima qil: "${text}". Faqat tarjimani ber.`,
        grammar: `Ushbu matndagi grammatik xatolarni tuzat va to'g'ri variantni ber: "${text}"`,
        professional: `Ushbu matnni professional va rasmiy uslubda qayta yoz: "${text}"`,
        birthday: `"${text}" uchun tug'ilgan kun tabrigi yoz. Iliq, samimiy va qisqa bo'lsin.`,
        email: `"${text}" mavzusida professional email yoz.`
      };

      const prompt = prompts[action] || `${text} haqida matn yoz`;
      const systemPrompt = 'Sen professional matn yozuvchi yordamchisisisan. Faqat so\'ralgan matnni ber, qo\'shimcha tushuntirish keraksiz.';

      const result = await geminiGenerateText(prompt, systemPrompt);
      return sendJSON(res, 200, { result, action });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e) });
    }
  }

  // ─── AI.3: Text-to-Speech ─────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/tts' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { text, language = 'uz-UZ', voice = 'uz-UZ-Standard-A' } = payload;

      if (!text) return sendJSON(res, 400, { error: 'Matn bo\'sh bo\'lmasin' });
      if (text.length > 5000) return sendJSON(res, 400, { error: 'Matn juda uzun (max 5000 belgi)' });

      const ttsApiKey = config.GOOGLE_TTS_API_KEY || config.GEMINI_API_KEY;
      if (!ttsApiKey) {
        return sendJSON(res, 200, { 
          fallback: true, 
          message: 'TTS API kaliti yo\'q. Brauzer Web Speech API ishlatiladi.',
          text, language 
        });
      }

      const ttsEndpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`;

      let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
      if (!fetchFn) {
        return sendJSON(res, 200, { fallback: true, text, language });
      }

      const ttsPayload = {
        input: { text },
        voice: {
          languageCode: language,
          name: voice,
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0
        }
      };

      const ttsRes = await fetchFn(ttsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsPayload)
      });

      if (!ttsRes.ok) {
        // Fallback to browser TTS
        return sendJSON(res, 200, { fallback: true, text, language, message: 'Google TTS xatosi, brauzer TTS ishlatiladi' });
      }

      const ttsData = await ttsRes.json();
      const audioContent = ttsData.audioContent;
      if (!audioContent) {
        return sendJSON(res, 200, { fallback: true, text, language });
      }

      return sendJSON(res, 200, { audioBase64: audioContent, format: 'mp3' });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e), fallback: true });
    }
  }

  // ─── AI.4: Image Analysis ─────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/analyze-image' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req, 20 * 1024 * 1024);
      const { imageBase64, mimeType = 'image/jpeg', question = 'Bu rasmda nima bor?' } = payload;

      if (!imageBase64) return sendJSON(res, 400, { error: 'Rasm ma\'lumoti kerak' });

      const systemPrompt = `Sen rasmlarni tahlil qiluvchi AI yordamchisisisan. 
O'zbek tilida aniq va tushunarli tavsif ber. 
Rasm mazmuni, undagi ob'ektlar, matn (OCR) va muhim tafsilotlarni tushuntir.`;

      const prompt = question || 'Bu rasmda nima bor? Batafsil tushuntir.';

      const parts = [
        { inlineData: { mimeType, data: imageBase64.replace(/^data:[^;]+;base64,/, '') } },
        { text: prompt }
      ];

      const apiKey = config.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY sozlanmagan');

      const apiPayload = {
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
      };

      const response = await callGeminiAPI(apiPayload);
      const data = await response.json();
      const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Rasmni tahlil qilib bo\'lmadi';

      return sendJSON(res, 200, { analysis, question });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e) });
    }
  }

  // ─── AI.5: Smart Reply ────────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/smart-reply' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { message, context = '' } = payload;

      if (!message) return sendJSON(res, 400, { error: 'Xabar kerak' });

      const prompt = `Quyidagi xabarga 3 ta qisqa javob variantini ber (har biri 1-2 gap):
Xabar: "${message}"
${context ? `Kontekst: ${context}` : ''}

Faqat JSON array formatida javob ber:
["Javob 1", "Javob 2", "Javob 3"]`;

      const result = await geminiGenerateText(prompt, "Sen chat yordamchisisisan. Faqat so'ralgan JSON formatida javob ber.");

      let replies = [];
      try {
        const match = result.match(/\[[\s\S]*\]/);
        if (match) replies = JSON.parse(match[0]);
      } catch (e) {
        // Parse fallback
        replies = result.split('\n').filter(l => l.trim().startsWith('"') || l.trim().match(/^\d+\./)).slice(0, 3).map(l => l.replace(/^[\d."]+\s*/, '').replace(/[",$]/g, '').trim());
      }

      if (!replies.length) replies = ['Ha, bo\'ladi', 'Tushunarli', 'Mayli'];
      return sendJSON(res, 200, { replies: replies.slice(0, 3) });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e), replies: ['Ha', 'Mayli', 'Tushunarli'] });
    }
  }

  // ─── AI.6: Translation ────────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/translate' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { text, from = 'auto', to = 'uz' } = payload;

      if (!text) return sendJSON(res, 400, { error: 'Matn kerak' });

      const langNames = {
        uz: "O'zbek", ru: 'Rus', en: 'Ingliz', de: 'Nemis',
        fr: 'Fransuz', ar: 'Arab', zh: 'Xitoy', ja: 'Yapon', ko: 'Koreys', tr: 'Turk'
      };

      const fromLang = from === 'auto' ? 'avtomatik aniqlab' : (langNames[from] || from);
      const toLang = langNames[to] || to;

      const prompt = `Quyidagi matnni ${fromLang} tilidan ${toLang} tiliga tarjima qil.
Faqat tarjimani ber, boshqa tushuntirish keraksiz.

Matn: "${text}"`;

      const result = await geminiGenerateText(prompt, 'Sen professional tarjimon yordamchisisisan. Faqat tarjimani ber.');
      return sendJSON(res, 200, { translation: result.trim(), from, to });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e) });
    }
  }

  // ─── AI.7: Chat Summary ───────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/summary' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { messages = [], chatName = 'Chat' } = payload;

      if (!messages.length) return sendJSON(res, 400, { error: 'Xabarlar kerak' });

      const msgText = messages.slice(-50).map(m =>
        `${m.senderName || 'Foydalanuvchi'}: ${m.text || '[media]'}`
      ).join('\n');

      const prompt = `Quyidagi chat suhbatini qisqacha xulosalab ber (O'zbek tilida):
- Asosiy mavzular
- Muhim kelishuvlar yoki qarorlar
- Qisqa umumiy xulosа

Faqat mavjud xabarlar asosida, o'ylab topma.

Chat: ${chatName}
Xabarlar:
${msgText}`;

      const result = await geminiGenerateText(prompt, "Sen suhbat xulosalash mutaxassisisan. Faqat mavjud ma'lumotlardan foydalanasan.");
      return sendJSON(res, 200, { summary: result, messageCount: messages.length });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e) });
    }
  }

  // ─── AI.8: AI Search ─────────────────────────────────────────────────────
  if (cleanUrl === '/api/ai/search' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { query, messages = [], chats = [] } = payload;

      if (!query) return sendJSON(res, 400, { error: 'Qidiruv so\'rovi kerak' });

      const dataText = messages.slice(-100).map(m =>
        `[${m.chatName || 'Chat'}] ${m.senderName}: ${m.text || '[media]'} (${new Date(m.createdAt || Date.now()).toLocaleDateString()})`
      ).join('\n');

      if (!dataText.trim()) {
        return sendJSON(res, 200, { results: [], message: 'Qidiruv uchun xabarlar topilmadi' });
      }

      const prompt = `Quyidagi suhbat ma'lumotlaridan foydalanib, so'rovga mos xabarlarni top:

So'rov: "${query}"

Ma'lumotlar:
${dataText}

Faqat mavjud ma'lumotlardan tegishli xabarlarni ko'rsat. O'ylab topma.
JSON formatida qaytargin: {"results": [{"chat": "chat nomi", "sender": "jo'natuvchi", "text": "xabar matni", "date": "sana"}]}`;

      const result = await geminiGenerateText(prompt, 'Sen qidiruv yordamchisisisan. Faqat JSON formatida javob ber.');

      let results = [];
      try {
        const match = result.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          results = parsed.results || [];
        }
      } catch (e) {
        results = [];
      }

      return sendJSON(res, 200, { results, query });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e), results: [] });
    }
  }

  // ─── AI.9: Profile Bio Writer ─────────────────────────────────────────────
  if (cleanUrl === '/api/ai/profile-bio' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { description, style = 'professional' } = payload;

      if (!description) return sendJSON(res, 400, { error: 'Tavsif kerak' });

      const styles = {
        professional: 'professional va rasmiy',
        friendly: 'do\'stona va iliq',
        short: 'juda qisqa (1-2 gap)',
        creative: 'ijodiy va qiziqarli'
      };

      const prompt = `Quyidagi ma'lumot asosida ${styles[style] || 'professional'} uslubda bio yoz (O'zbek tilida):
"${description}"
Faqat bio matnini ber.`;

      const result = await geminiGenerateText(prompt, 'Sen professional bio yozuvchisisisan.');
      return sendJSON(res, 200, { bio: result.trim(), style });
    } catch (e) {
      return sendJSON(res, 500, { error: normalizeAIError(e) });
    }
  }

  // ─── AI.10: AI Features Status ────────────────────────────────────────────
  if (cleanUrl === '/api/ai/status' && req.method === 'GET') {
    const cfg = loadEnvConfig();
    return sendJSON(res, 200, {
      available: !!cfg.GEMINI_API_KEY,
      model: AI_MODEL,
      ttsAvailable: !!(cfg.GOOGLE_TTS_API_KEY || cfg.GEMINI_API_KEY),
      features: {
        chat: cfg.AI_CHAT_ENABLED !== 'false',
        writer: cfg.AI_WRITER_ENABLED !== 'false',
        tts: cfg.AI_TTS_ENABLED !== 'false',
        imageAnalysis: cfg.AI_IMAGE_ANALYSIS_ENABLED !== 'false',
        translation: cfg.AI_TRANSLATION_ENABLED !== 'false',
        smartReply: cfg.AI_SMART_REPLY_ENABLED !== 'false',
        summary: cfg.AI_SUMMARY_ENABLED !== 'false'
      }
    });
  }

  // ─── Static File Serving ────────────────────────────────────────────────────
  let filePath = path.join(__dirname, cleanUrl === '/' ? 'login.html' : cleanUrl);

  const safeBase = path.resolve(__dirname);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(safeBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Ruxsat berilmagan');
    return;
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Fayl Topilmadi');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    fs.createReadStream(resolvedPath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const cfg = loadEnvConfig();
  console.log('\n===============================================================');
  console.log('🚀 TelePulce Server ishga tushdi!');
  console.log('===============================================================');
  console.log(`💻 Ushbu kompyuterda:      http://localhost:${PORT}/login.html`);
  console.log(`📱 Wi-Fi dagi telefonlar:  http://${localIP}:${PORT}/login.html`);
  console.log(`🤖 AI Dvigateli:           ${cfg.GEMINI_API_KEY ? `Google Gemini (${AI_MODEL})` : 'Heuristic Engine (API keysiz)'}`);
  console.log(`🔊 Text-to-Speech:         ${cfg.GOOGLE_TTS_API_KEY ? 'Google Cloud TTS' : cfg.GEMINI_API_KEY ? 'Gemini + Web Speech' : 'Web Speech API (bepul)'}`);
  console.log(`⚙️  AI Status:              http://localhost:${PORT}/api/ai/status`);
  console.log('===============================================================');
  if (!cfg.GEMINI_API_KEY) {
    console.log('⚠️  GEMINI_API_KEY topilmadi!');
    console.log('   .env fayliga kalitni qo\'ying: https://aistudio.google.com/app/apikey');
    console.log('   Moderation heuristic rejimda ishlaydi.\n');
  }
});
