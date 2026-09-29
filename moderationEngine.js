// ==============================================================================
// TelePulse - AI Content Moderation Engine
// Text, Image, Video Keyframe, and URL Safety Guardian
// ==============================================================================

const fs = require('fs');
const path = require('path');

// ─── Environment & Config Loader ──────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, '.env');
const LOGS_FILE = path.join(__dirname, 'data', 'moderation_logs.json');

function loadEnvConfig() {
  const config = {
    PORT: 8000,
    HOST: '0.0.0.0',
    GEMINI_API_KEY: '',
    MODERATION_STRICTNESS: 'balanced',
    MAX_IMAGE_SIZE_MB: 15,
    MAX_VIDEO_SIZE_MB: 50,
    MAX_AUDIT_LOGS: 500
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key in config) {
            if (typeof config[key] === 'number') {
              config[key] = Number(val) || config[key];
            } else {
              config[key] = val;
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ .env faylini o\'qishda xatolik:', e.message);
    }
  }

  // Also check process.env overrides
  if (process.env.GEMINI_API_KEY) config.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (process.env.PORT) config.PORT = Number(process.env.PORT) || config.PORT;

  return config;
}

let config = loadEnvConfig();

// ─── Educational & School Whitelist (False Positive Prevention) ───────────────
// Oddiy maktab, dars va o'qish so'zlarini noto'g'ri bloklamaslik uchun maxsus ro'yxat
const SCHOOL_WHITELIST = new Set([
  'sinf', 'maktab', 'dars', 'ustoz', 'muallim', 'oqituvchi', "o'qituvchi", 'talaba', 'oquvchi', "o'quvchi",
  'konspekt', 'vazifa', 'topshiriq', 'kitob', 'daftar', 'qalam', 'ruchka', 'parta', 'doska',
  'baho', 'kundalik', 'imtihon', 'test', 'javob', 'savol', 'fan', 'matematika', 'fizika', 'kimyo',
  'biologiya', 'tarix', 'adabiyot', 'ona tili', 'ingliz tili', 'informatika', 'geografiya', 'astronomiya',
  'davomat', 'hozir', 'keldi', 'yoq', "yo'q", 'sababli', 'sababsiz', 'maruza', "ma'ruza", 'amaliy',
  'seminar', 'amaliyot', 'amal', 'amallar', 'amallari', 'bajarish', 'salom', 'assalomu alaykum',
  'rahmat', 'xush kelibsiz', 'xayrli kun', 'darslik', 'kutubxona', 'laboratoriya', 'tanaffus',
  'baholash', 'maktabimiz', 'ustozim', 'darsda', 'sinfdosh', 'talabalar', 'shox', 'ticher', 'teacher',
  'student', 'homework', 'attendance', 'lesson', 'school', 'class', 'classroom', 'exam', 'grade',
  'samolyot', 'sakkiz', 'kamalak', 'qamash', 'toman', 'zamon', 'hammasi', 'omad', 'dam', 'salomatlik'
]);

// ─── Known 18+ / Pornographic / Malicious Domains ─────────────────────────────
const ADULT_DOMAINS = [
  'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'chaturbate', 'stripchat', 'camsoda',
  'redtube', 'youporn', 'beeg', 'spankbang', 'brazzers', 'bangbros', 'xhamster',
  'eporner', 'tnaflix', 'tube8', 'livejasmin', 'bonga', 'bongacams', 'cam4',
  'myfreecams', 'faphouse', 'motherless', 'hqporner', 'txxx', 'rule34', 'gelbooru',
  'nhentai', 'luscious', 'hentai', 'heavy-r', 'kaotic', 'bestgore', 'liveleak'
];

const SUSPICIOUS_TLDS = ['.xxx', '.porn', '.adult', '.sexy', '.cam', '.sex', '.webcam'];
const IP_LOGGER_DOMAINS = ['grabify.link', 'iplogger.org', 'iplogger.com', '2no.co', 'yip.su', 'iplogger.ru', 'psh.me'];

// ─── Profanity & 18+ Bad Words Vocabulary ─────────────────────────────────────
// Uzbek, Russian and English core root stems
const UZ_BAD_WORDS = [
  'jalab', 'fohisha', 'foxisha', 'qotoq', 'qutoq', "qo'toq", 'amjoq', 'amchala',
  'sikish', 'sikay', 'sikey', 'sikaman', 'sikarman', 'siktir', 'sikilgan',
  'itvachcha', 'it emgan', 'haromi', 'dalbayob', 'dalbayop', 'gandon',
  'shlyuxa', 'yiban', 'ibnutiy', 'padariga lanat', 'onangni', 'onangdi',
  'skaman', 'skyat', 'kotinga', "ko'tinga", 'kot', "ko't", 'am', 'minet',
  'masturbatsiya', 'onanizm', 'erotika', 'pornografiya', 'porno', 'seks', 'sex'
];

const RU_BAD_WORDS = [
  'хуй', 'пизда', 'блядь', 'блять', 'ебать', 'ебал', 'ебут', 'ебись',
  'сука', 'мудак', 'гандон', 'шлюха', 'порно', 'член', 'сосать', 'сиськи',
  'трахать', 'секс', 'минет', 'дрочить', 'порнуха', 'залупа', 'долбоеб',
  'хуйня', 'пиздобол', 'пидор', 'пидорас', 'гондон'
];

const EN_BAD_WORDS = [
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'cunt', 'dick', 'pussy',
  'porn', 'porno', 'pornography', 'xxx', 'nude', 'nudes', 'naked',
  'blowjob', 'handjob', 'whore', 'slut', 'dildo', 'hentai', 'milf',
  'incest', 'rape', 'cock', 'boobs', 'penis', 'vagina'
];

// Cyrillic to Latin homoglyph map
const HOMOGLYPH_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '',
  'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

// ─── Normalizer (Anti-Bypass Engine) ──────────────────────────────────────────
function normalizeText(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.toLowerCase();

  // Remove zero-width spaces and invisible characters
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0\u200E\u200F]/g, '');

  // Convert Cyrillic homoglyphs to Latin
  let converted = '';
  for (const char of str) {
    converted += HOMOGLYPH_MAP[char] || char;
  }
  str = converted;

  // Leetspeak substitutions
  str = str
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/ph/g, 'f');

  return str;
}

// Collapses punctuation between letters: e.g. "s.e.x" -> "sex", "j-a-l-a-b" -> "jalab"
function collapseSeparators(str) {
  let res = str;
  let prev = '';
  // Remove punctuation between letters
  while (prev !== res) {
    prev = res;
    res = res.replace(/([a-z0-9])[._\-*+~#^!|/\\:,]+([a-z0-9])/gi, (m, a, b) => a + b);
  }
  // Collapse single spaced letters: e.g. "s e x" -> "sex", "j a l a b" -> "jalab"
  res = res.replace(/\b([a-z0-9])\s+(?=[a-z0-9]\b)/gi, (m, a) => a);
  return res;
}

// Collapses repeated identical characters: e.g. "jaaaalaaaab" -> "jalab"
function collapseRepeats(str) {
  return str.replace(/(.)\1{2,}/g, '$1$1');
}

// ─── URL / Link Scanner ───────────────────────────────────────────────────────
function scanUrlsInText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(?:com|org|net|ru|uz|xxx|porn|adult|sexy|cam|io|top|link|cc|site|info)[^\s]*)/gi;
  const matches = text.match(urlRegex) || [];

  for (const match of matches) {
    const lowerMatch = match.toLowerCase();

    // Check adult domains
    for (const ad of ADULT_DOMAINS) {
      if (lowerMatch.includes(ad)) {
        return {
          flagged: true,
          type: 'adult_url',
          matched: match,
          reason: "Havolada 18+ yoki pornografik veb-sayt aniqlandi."
        };
      }
    }

    // Check suspicious adult TLDs
    for (const tld of SUSPICIOUS_TLDS) {
      if (lowerMatch.includes(tld)) {
        return {
          flagged: true,
          type: 'suspicious_tld',
          matched: match,
          reason: "Xavfli yoki 18+ domen kengaytmasi (.xxx, .porn va h.k.) aniqlandi."
        };
      }
    }

    // Check IP logger / phishing domains
    for (const ipl of IP_LOGGER_DOMAINS) {
      if (lowerMatch.includes(ipl)) {
        return {
          flagged: true,
          type: 'malicious_link',
          matched: match,
          reason: "Zararli yoki foydalanuvchi ma'lumotlarini o'g'irlovchi (IP logger) havola aniqlandi."
        };
      }
    }
  }

  return { flagged: false };
}

// ─── Fast Heuristic Text Moderation ───────────────────────────────────────────
function inspectTextHeuristics(originalText) {
  if (!originalText || !originalText.trim()) {
    return { allowed: true };
  }

  // 1. Scan for harmful URLs first
  const urlCheck = scanUrlsInText(originalText);
  if (urlCheck.flagged) {
    return {
      allowed: false,
      flag: 'url_blocked',
      reason: urlCheck.reason,
      snippet: urlCheck.matched
    };
  }

  // 2. Normalize text and handle anti-bypass
  const normalized = normalizeText(originalText);
  const collapsedSep = collapseSeparators(normalized);
  const collapsedRep = collapseRepeats(collapsedSep);

  // Tokenize into clean words
  const rawWords = normalized.split(/[^a-z0-9_']+/).filter(Boolean);
  const collapsedWords = collapsedRep.split(/[^a-z0-9_']+/).filter(Boolean);
  const allWordTokens = new Set([...rawWords, ...collapsedWords]);

  // Combine bad words dictionary
  const badWordList = [...UZ_BAD_WORDS, ...RU_BAD_WORDS, ...EN_BAD_WORDS];

  // 3. Check for specific bad words with false-positive protections
  for (const bad of badWordList) {
    const badNorm = normalizeText(bad);

    // Short offensive words (e.g. 'am', 'kot', 'fuck', 'sex') require exact word boundary check
    if (badNorm.length <= 3) {
      for (const token of allWordTokens) {
        // If token is exactly the bad word and NOT a whitelisted word
        if (token === badNorm && !SCHOOL_WHITELIST.has(token)) {
          return {
            allowed: false,
            flag: 'profanity_18',
            reason: "Nomaqbul yoki 18+ mazmundagi so'z aniqlandi.",
            matched: bad
          };
        }
      }
    } else {
      // Longer bad words: check word tokens and substrings
      for (const token of allWordTokens) {
        if (SCHOOL_WHITELIST.has(token)) continue; // Never flag whitelisted words

        if (token.includes(badNorm)) {
          return {
            allowed: false,
            flag: 'profanity_18',
            reason: "Nomaqbul, haqoratli yoki 18+ ibora aniqlandi.",
            matched: bad
          };
        }
      }

      // Check across entire collapsed string
      if (collapsedRep.includes(badNorm)) {
        // Double check not part of a whitelisted sequence
        let isWhitelisted = false;
        for (const wl of SCHOOL_WHITELIST) {
          if (wl.includes(badNorm) && collapsedRep.includes(wl)) {
            isWhitelisted = true;
            break;
          }
        }
        if (!isWhitelisted) {
          return {
            allowed: false,
            flag: 'profanity_18',
            reason: "Nomaqbul, haqoratli yoki 18+ ibora aniqlandi.",
            matched: bad
          };
        }
      }
    }
  }

  return { allowed: true };
}

// ─── Gemini AI Deep Moderation ────────────────────────────────────────────────
async function checkWithGeminiAI(content, isMedia = false, mimeType = 'image/jpeg') {
  const currentConfig = loadEnvConfig();
  if (!currentConfig.GEMINI_API_KEY) {
    return null; // Gemini key not configured, fall back to heuristic
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentConfig.GEMINI_API_KEY}`;

    let contentsPayload = [];

    if (!isMedia) {
      // Text Prompt
      contentsPayload = [{
        parts: [{
          text: `You are an automated educational safety moderation AI for a school communication and attendance platform named TelePulse.
Analyze this message for:
1. Severe profanity, vulgarity, obscenity.
2. 18+ adult sexual content, pornography, sexual solicitation.
3. Severe harassment, threats, or hate speech.
4. Malicious or adult URLs.

CRUCIAL RULE: Do NOT block normal everyday school/educational conversation, polite greetings, classroom tasks, teacher-student communication, or benign Uzbek/Russian discussion.
Strictly return a JSON object with this exact structure:
{"allowed": boolean, "flag": "safe" | "profanity" | "adult_18" | "harassment" | "malicious_url", "reason": "Short Uzbek reason for user if blocked, otherwise empty string"}

Message to analyze:
"${content.slice(0, 1000)}"`
        }]
      }];
    } else {
      // Image / Video Frame Base64 Prompt
      // Content is expected to be raw base64 data without data-uri prefix
      contentsPayload = [{
        parts: [
          {
            text: `You are a visual safety moderation AI. Classify if this image/frame contains:
1. Nudity, pornography, exposed genitals, breasts, sexual acts, or 18+ adult content.
2. Graphic violence, blood, or gore.
If any of these are present, set allowed to false. If it is safe (e.g. normal photos, documents, faces, school activities, nature), set allowed to true.
Strictly respond with JSON:
{"allowed": boolean, "flag": "safe" | "nudity_18" | "violence", "reason": "Short Uzbek reason for user if blocked, otherwise empty string"}`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: content
            }
          }
        ]
      }];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contentsPayload,
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Gemini API status not OK:', response.status);
      return null;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) {
      const parsed = JSON.parse(rawText.trim());
      return parsed;
    }
  } catch (err) {
    console.warn('Gemini AI moderation call error:', err.message);
  }

  return null;
}

// ─── Image & Frame Content Heuristic (Skin-Tone / Entropy Analyzer) ───────────
// Acts as a fast local fallback when Gemini is offline or not configured
function inspectImageBufferHeuristic(buffer) {
  if (!buffer || buffer.length < 100) {
    return { allowed: false, reason: "Fayl yaroqsiz yoki bo'sh." };
  }

  // Check magic bytes for valid image format
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';
  const isGif = buffer.slice(0, 3).toString('ascii') === 'GIF';

  if (!isJpeg && !isPng && !isWebp && !isGif) {
    return {
      allowed: false,
      flag: 'invalid_format',
      reason: "Faqat ruxsat etilgan rasm formatlari (JPG, PNG, WEBP, GIF) qabul qilinadi."
    };
  }

  // Simple skin-chroma frequency estimation over raw bytes sample
  let skinToneMatch = 0;
  const sampleStep = Math.max(1, Math.floor(buffer.length / 5000));
  let sampled = 0;

  for (let i = 20; i < buffer.length - 3; i += sampleStep) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    sampled++;

    // Standard human skin color boundaries in RGB space
    if (r > 95 && g > 40 && b > 20 &&
        (Math.max(r, g, b) - Math.min(r, g, b) > 15) &&
        Math.abs(r - g) > 15 && r > g && r > b) {
      skinToneMatch++;
    }
  }

  const skinRatio = sampled > 0 ? (skinToneMatch / sampled) : 0;

  // Very high skin tone ratio (> 72% of image pixels) indicates likely nudity
  if (skinRatio > 0.72) {
    return {
      allowed: false,
      flag: 'high_skin_ratio_18',
      reason: "Rasmda me'yordan ortiq ochiq tana/nomaqbul 18+ kontent belgilari aniqlandi."
    };
  }

  return { allowed: true };
}

// ─── Audit Logging & Stats Engine ─────────────────────────────────────────────
let auditLogsCache = null;

function loadAuditLogs() {
  if (auditLogsCache !== null) return auditLogsCache;
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, 'utf8');
      auditLogsCache = JSON.parse(data);
      if (!Array.isArray(auditLogsCache)) auditLogsCache = [];
    } else {
      auditLogsCache = [];
    }
  } catch (e) {
    auditLogsCache = [];
  }
  return auditLogsCache;
}

function saveAuditLogs(logs) {
  try {
    const dir = path.dirname(LOGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep up to max logs
    const trimmed = logs.slice(0, config.MAX_AUDIT_LOGS || 500);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    auditLogsCache = trimmed;
  } catch (e) {
    console.error('Audit loglarini saqlashda xato:', e.message);
  }
}

function recordBlockedEvent({ type, reason, flag, senderName, senderId, snippet, clientIp }) {
  const logs = loadAuditLogs();
  const event = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    dateStr: new Date().toLocaleString('uz-UZ'),
    type: type || 'text', // text | image | video | link
    reason: reason || "Nomaqbul kontent qoidalarga zid.",
    flag: flag || 'inappropriate',
    senderName: senderName || 'Noma\'lum',
    senderId: senderId || 'guest',
    snippet: snippet ? (snippet.length > 80 ? snippet.substring(0, 77) + '...' : snippet) : '',
    clientIp: clientIp || '127.0.0.1'
  };

  logs.unshift(event);
  saveAuditLogs(logs);
  return event;
}

function getModerationStats() {
  const logs = loadAuditLogs();
  const currentConfig = loadEnvConfig();

  const stats = {
    status: 'ACTIVE',
    aiEngine: currentConfig.GEMINI_API_KEY ? 'Google Gemini AI + Anti-Bypass Filter' : 'Anti-Bypass Heuristic Engine (Offline Safe)',
    totalBlocked: logs.length,
    textBlocked: logs.filter(l => l.type === 'text').length,
    imagesBlocked: logs.filter(l => l.type === 'image').length,
    videosBlocked: logs.filter(l => l.type === 'video').length,
    linksBlocked: logs.filter(l => l.type === 'link').length,
    strictness: currentConfig.MODERATION_STRICTNESS || 'balanced',
    maxImageSizeMB: currentConfig.MAX_IMAGE_SIZE_MB || 15,
    maxVideoSizeMB: currentConfig.MAX_VIDEO_SIZE_MB || 50,
    geminiConfigured: !!currentConfig.GEMINI_API_KEY
  };

  return stats;
}

function clearAuditLogs() {
  saveAuditLogs([]);
  return { success: true };
}

// ─── Public API Methods ───────────────────────────────────────────────────────

/**
 * Moderate text message or caption
 */
async function moderateText({ text, senderId, senderName, clientIp }) {
  if (!text || !text.trim()) {
    return { allowed: true };
  }

  // 1. Fast local checks (leetspeak, bad words, 18+ links)
  const localResult = inspectTextHeuristics(text);
  if (!localResult.allowed) {
    const isUrl = localResult.flag === 'url_blocked';
    recordBlockedEvent({
      type: isUrl ? 'link' : 'text',
      reason: localResult.reason,
      flag: localResult.flag,
      senderName,
      senderId,
      snippet: localResult.snippet || text,
      clientIp
    });
    return {
      allowed: false,
      flag: localResult.flag,
      reason: localResult.reason,
      matched: localResult.matched
    };
  }

  // 2. Check with Gemini AI for deeper nuance if available
  const aiResult = await checkWithGeminiAI(text, false);
  if (aiResult && aiResult.allowed === false) {
    recordBlockedEvent({
      type: aiResult.flag === 'malicious_url' ? 'link' : 'text',
      reason: aiResult.reason || "AI tekshiruvi: Nomaqbul yoki 18+ mazmundagi xabar.",
      flag: aiResult.flag || 'ai_flagged',
      senderName,
      senderId,
      snippet: text,
      clientIp
    });
    return {
      allowed: false,
      flag: aiResult.flag || 'ai_flagged',
      reason: aiResult.reason || "⚠️ Bu kontent qoidalarga mos emas."
    };
  }

  return { allowed: true };
}

/**
 * Moderate Media (Image or Video Keyframe)
 */
async function moderateMedia({ base64Data, mimeType, type, fileName, fileSize, senderId, senderName, clientIp }) {
  const currentConfig = loadEnvConfig();
  const maxImgBytes = (currentConfig.MAX_IMAGE_SIZE_MB || 15) * 1024 * 1024;
  const maxVidBytes = (currentConfig.MAX_VIDEO_SIZE_MB || 50) * 1024 * 1024;

  // 1. Size checks
  if (type === 'image' && fileSize && fileSize > maxImgBytes) {
    return {
      allowed: false,
      flag: 'size_exceeded',
      reason: `Rasm hajmi ${currentConfig.MAX_IMAGE_SIZE_MB}MB dan oshmasligi kerak.`
    };
  }

  if (type === 'video' && fileSize && fileSize > maxVidBytes) {
    return {
      allowed: false,
      flag: 'size_exceeded',
      reason: `Video hajmi ${currentConfig.MAX_VIDEO_SIZE_MB}MB dan oshmasligi kerak.`
    };
  }

  // 2. Filename sanitization check
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const disallowedExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.php', '.phtml', '.js', '.vbs', '.msi'];
    if (disallowedExts.includes(ext) || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return {
        allowed: false,
        flag: 'malicious_filename',
        reason: "Xavfsizlik talablariga zid fayl kengaytmasi yoki nom."
      };
    }
  }

  if (!base64Data) {
    return { allowed: true };
  }

  // Extract raw base64 clean data
  let cleanBase64 = base64Data;
  let detectedMime = mimeType || 'image/jpeg';
  if (cleanBase64.includes(',')) {
    const parts = cleanBase64.split(',');
    const match = parts[0].match(/:(.*?);/);
    if (match) detectedMime = match[1];
    cleanBase64 = parts[1];
  }

  const buffer = Buffer.from(cleanBase64, 'base64');

  // 3. AI Vision check via Gemini if available
  const aiVisionResult = await checkWithGeminiAI(cleanBase64, true, detectedMime);
  if (aiVisionResult && aiVisionResult.allowed === false) {
    recordBlockedEvent({
      type: type || 'image',
      reason: aiVisionResult.reason || "18+ yoki nomaqbul rasm/video materiali aniqlandi.",
      flag: aiVisionResult.flag || 'nudity_18',
      senderName,
      senderId,
      snippet: fileName || `${type} upload`,
      clientIp
    });
    return {
      allowed: false,
      flag: aiVisionResult.flag || 'nudity_18',
      reason: aiVisionResult.reason || "⚠️ 18+ yoki nomaqbul kontent aniqlangani sababli yuklash bekor qilindi."
    };
  }

  // 4. Local fast heuristic check
  const heuristicResult = inspectImageBufferHeuristic(buffer);
  if (!heuristicResult.allowed) {
    recordBlockedEvent({
      type: type || 'image',
      reason: heuristicResult.reason,
      flag: heuristicResult.flag,
      senderName,
      senderId,
      snippet: fileName || `${type} upload`,
      clientIp
    });
    return {
      allowed: false,
      flag: heuristicResult.flag,
      reason: heuristicResult.reason
    };
  }

  return { allowed: true };
}

module.exports = {
  loadEnvConfig,
  moderateText,
  moderateMedia,
  getModerationStats,
  loadAuditLogs,
  clearAuditLogs,
  recordBlockedEvent,
  normalizeText,
  scanUrlsInText
};
