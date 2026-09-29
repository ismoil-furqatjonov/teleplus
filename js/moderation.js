// ==============================================================================
// TelePulse - AI Content Moderation Frontend Module
// Client-side Interceptor, Video Frame Analyzer & UI Modal Guardian
// ==============================================================================

import { currentUser, userDocData } from './auth.js';

// Configuration defaults
const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];

// Client-side quick fallback dictionary (for offline protection)
const FALLBACK_BAD_WORDS = [
  'jalab', 'fohisha', 'foxisha', 'qotoq', 'qo\'toq', 'sikish', 'sikey', 'sikaman', 'siktir',
  'itvachcha', 'haromi', 'dalbayob', 'gandon', 'shlyuxa', 'onangni', 'kot', 'ko\'t', 'am',
  'porno', 'porn', 'xxx', 'seks', 'sex', 'nude', 'penis', 'vagina', 'fuck', 'bitch', 'cunt',
  'хуй', 'пизда', 'блядь', 'блять', 'ебать', 'сука', 'мудак', 'порно'
];

const FALLBACK_ADULT_DOMAINS = [
  'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'chaturbate', 'stripchat', 'camsoda',
  'redtube', 'youporn', 'beeg', 'spankbang', 'brazzers', 'xhamster', 'iplogger', 'grabify'
];

// ─── Modal & Notification Presentation ─────────────────────────────────────────

/**
 * Displays modern popup when content is blocked
 */
export function showModerationBlockedModal(reason = '', flag = 'inappropriate') {
  let modal = document.getElementById('modal-moderation-blocked');
  if (!modal) {
    createModerationBlockedModalDOM();
    modal = document.getElementById('modal-moderation-blocked');
  }

  const reasonEl = document.getElementById('moderation-modal-reason-text');
  const detailsEl = document.getElementById('moderation-modal-flag-badge');

  if (reasonEl) {
    reasonEl.textContent = reason || "Sayt tartib-qoidalariga zid material aniqlandi.";
  }

  if (detailsEl) {
    let flagLabel = 'Xavfsizlik filtri';
    if (flag.includes('profanity') || flag.includes('18')) flagLabel = '18+ / Nomaqbul so\'z';
    else if (flag.includes('url')) flagLabel = 'Zararli / 18+ Havola';
    else if (flag.includes('nudity')) flagLabel = '18+ Tasvir / Video';
    else if (flag.includes('size')) flagLabel = 'Hajm chegarasi';
    detailsEl.textContent = flagLabel;
  }

  // Play subtle warning sound if possible
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}

  modal.classList.add('active');

  // Also trigger toast notification
  if (window.showToast) {
    window.showToast("⚠️ Kontent bloklandi: qoidalarga mos emas.", "error");
  }
}

/**
 * Creates the blocked modal dynamically if not already in DOM
 */
function createModerationBlockedModalDOM() {
  const modalDiv = document.createElement('div');
  modalDiv.id = 'modal-moderation-blocked';
  modalDiv.className = 'modal-overlay moderation-overlay';
  modalDiv.innerHTML = `
    <div class="modal-card modal-moderation-card">
      <div class="moderation-header-icon">
        <div class="moderation-icon-circle">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
      </div>
      <div class="moderation-body-content">
        <h3 class="moderation-main-title">⚠️ Kontent bloklandi</h3>
        <p class="moderation-main-desc">Bu material sayt qoidalariga mos kelmaydi.</p>
        
        <div class="moderation-info-box">
          <div class="moderation-badge-row">
            <span class="moderation-flag-badge" id="moderation-modal-flag-badge">18+ / Nomaqbul</span>
            <span class="moderation-status-badge"><i class="fa-solid fa-ban"></i> Bloklandi</span>
          </div>
          <div class="moderation-reason-message" id="moderation-modal-reason-text">
            Aniqlangan sabab: Nomaqbul yoki 18+ mazmundagi material.
          </div>
        </div>

        <p class="moderation-footnote">
          TelePulse xavfsiz ta'lim va muloqot muhitini ta'minlash uchun barcha kontentlar avtomatik AI moderatsiya tekshiruvidan o'tadi.
        </p>
      </div>
      <div class="modal-footer" style="justify-content: center; padding-top: 10px;">
        <button class="btn-primary moderation-dismiss-btn" id="btn-close-moderation-modal">
          <i class="fa-solid fa-check"></i> Tushundim
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modalDiv);

  modalDiv.querySelector('#btn-close-moderation-modal')?.addEventListener('click', () => {
    modalDiv.classList.remove('active');
  });

  modalDiv.addEventListener('click', (e) => {
    if (e.target === modalDiv) modalDiv.classList.remove('active');
  });
}

// ─── Pre-flight Client Normalizer (Offline Protection) ────────────────────────
function clientQuickCheck(text) {
  if (!text) return { allowed: true };
  let norm = text.toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[$5]/g, 's');

  // Collapse inner dots/dashes
  norm = norm.replace(/([a-z0-9])[._\-*+~#^!|/\\:,]+([a-z0-9])/gi, '$1$2');

  for (const domain of FALLBACK_ADULT_DOMAINS) {
    if (norm.includes(domain)) {
      return {
        allowed: false,
        flag: 'adult_url',
        reason: "Havolada 18+ yoki shubhali veb-sayt aniqlandi."
      };
    }
  }

  for (const bad of FALLBACK_BAD_WORDS) {
    if (bad.length <= 3) {
      const words = norm.split(/[^a-z0-9_']+/);
      if (words.includes(bad)) {
        return {
          allowed: false,
          flag: 'profanity_18',
          reason: "Nomaqbul yoki 18+ so'z aniqlandi."
        };
      }
    } else {
      if (norm.includes(bad)) {
        return {
          allowed: false,
          flag: 'profanity_18',
          reason: "Nomaqbul yoki 18+ mazmundagi so'z/ibora aniqlandi."
        };
      }
    }
  }

  return { allowed: true };
}

// ─── Backend Text Moderation Interceptor ──────────────────────────────────────
export async function validateAndModerateText(text, user = null) {
  if (!text || !text.trim()) return { allowed: true };

  // 1. Instant client-side check
  const quick = clientQuickCheck(text);
  if (!quick.allowed) {
    showModerationBlockedModal(quick.reason, quick.flag);
    return { allowed: false, reason: quick.reason };
  }

  // 2. Comprehensive backend server check (AI + normalizer + logs)
  try {
    const sender = user || currentUser;
    const senderName = userDocData?.displayName || sender?.displayName || 'Foydalanuvchi';
    const senderId = sender?.uid || 'guest';

    const resp = await fetch('/api/moderate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        senderId,
        senderName
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      if (!data.allowed) {
        showModerationBlockedModal(data.reason || "Bu kontent qoidalarga mos emas.", data.flag);
        return { allowed: false, reason: data.reason };
      }
      return { allowed: true };
    }
  } catch (err) {
    console.warn('Backend moderatsiya serveri bilan aloqa bo\'lmadi, lokal filtr ishlatildi:', err);
  }

  return { allowed: true };
}

// ─── Video Frame Extractor ────────────────────────────────────────────────────
/**
 * Extracts sample frames (e.g., at 1s, middle, and 80%) from a video file
 * using HTML5 Video + Offscreen Canvas without uploading the video first!
 */
export async function extractVideoKeyframes(videoFile, frameCount = 3) {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      const fileUrl = URL.createObjectURL(videoFile);
      video.src = fileUrl;

      const frames = [];

      video.onloadedmetadata = async () => {
        const duration = video.duration || 3;
        const seekPoints = [];

        if (frameCount === 1) {
          seekPoints.push(Math.min(1, duration * 0.5));
        } else {
          for (let i = 1; i <= frameCount; i++) {
            seekPoints.push((duration * i) / (frameCount + 1));
          }
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        for (const point of seekPoints) {
          await new Promise((res) => {
            video.currentTime = point;
            video.onseeked = () => {
              canvas.width = Math.min(640, video.videoWidth || 480);
              canvas.height = Math.min(480, video.videoHeight || 360);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              frames.push(dataUrl);
              res();
            };
            video.onerror = () => res();
          });
        }

        URL.revokeObjectURL(fileUrl);
        resolve(frames);
      };

      video.onerror = () => {
        URL.revokeObjectURL(fileUrl);
        resolve([]);
      };
    } catch (e) {
      resolve([]);
    }
  });
}

// ─── File & Media Moderation Interceptor ──────────────────────────────────────
export async function validateAndModerateMedia(file, type = 'image', user = null) {
  if (!file) return { allowed: true };

  // 1. File Size Verification
  if (type === 'image' && file.size > MAX_IMAGE_SIZE_BYTES) {
    const reason = `Rasm hajmi ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB dan oshmasligi lozim.`;
    showModerationBlockedModal(reason, 'size_exceeded');
    return { allowed: false, reason };
  }

  if (type === 'video' && file.size > MAX_VIDEO_SIZE_BYTES) {
    const reason = `Video hajmi ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB dan oshmasligi lozim.`;
    showModerationBlockedModal(reason, 'size_exceeded');
    return { allowed: false, reason };
  }

  // 2. MIME Type & Extension Sanitization
  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();

  const disallowedExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.php', '.phtml', '.js', '.vbs', '.msi'];
  if (disallowedExts.some(ext => fileName.endsWith(ext)) || fileName.includes('..')) {
    const reason = "Xavfsizlik talablariga zid fayl kengaytmasi yoki nomi.";
    showModerationBlockedModal(reason, 'malicious_filename');
    return { allowed: false, reason };
  }

  if (type === 'image' && fileType && !ALLOWED_IMAGE_TYPES.includes(fileType)) {
    const reason = "Faqat ruxsat etilgan rasm formatlari (JPG, PNG, WEBP, GIF) qabul qilinadi.";
    showModerationBlockedModal(reason, 'invalid_mime');
    return { allowed: false, reason };
  }

  const sender = user || currentUser;
  const senderName = userDocData?.displayName || sender?.displayName || 'Foydalanuvchi';
  const senderId = sender?.uid || 'guest';

  // 3. For Video: Extract keyframes and inspect each frame
  if (type === 'video' || type === 'round_video') {
    if (window.showToast) window.showToast("Video xavfsizligi AI orqali tekshirilmoqda...", "info");

    const frames = await extractVideoKeyframes(file, 3);
    for (let i = 0; i < frames.length; i++) {
      try {
        const resp = await fetch('/api/moderate/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl: frames[i],
            type: 'video',
            fileName: `${file.name}_frame_${i + 1}.jpg`,
            fileSize: file.size,
            senderId,
            senderName
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (!data.allowed) {
            showModerationBlockedModal(
              data.reason || "Videoda nomaqbul yoki 18+ kadrlar aniqlangani sababli yuklash bekor qilindi.",
              data.flag || 'video_blocked'
            );
            return { allowed: false, reason: data.reason };
          }
        }
      } catch (err) {
        console.warn('Video moderatsiyasida xatolik:', err);
      }
    }

    return { allowed: true };
  }

  // 4. For Image: Read data URL and inspect with backend AI/heuristic
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;

      try {
        const resp = await fetch('/api/moderate/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl,
            type: 'image',
            fileName: file.name,
            fileSize: file.size,
            senderId,
            senderName
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (!data.allowed) {
            showModerationBlockedModal(
              data.reason || "Rasmda 18+ yoki nomaqbul material aniqlandi.",
              data.flag || 'image_blocked'
            );
            return resolve({ allowed: false, reason: data.reason });
          }
        }
      } catch (err) {
        console.warn('Rasm moderatsiya xatoligi:', err);
      }

      resolve({ allowed: true });
    };

    reader.onerror = () => resolve({ allowed: false, reason: "Faylni o'qishda xatolik." });
    reader.readAsDataURL(file);
  });
}

// ─── Admin Panel UI Integration ───────────────────────────────────────────────

/**
 * Initializes the AI Moderation panel in Settings
 */
export function initModerationAdminPanel() {
  createModerationBlockedModalDOM();

  const settingsTabs = document.querySelector('.settings-sidebar-tabs');
  const settingsContentArea = document.querySelector('.settings-content-area');

  if (settingsTabs && !document.getElementById('tab-settings-moderation')) {
    const tabEl = document.createElement('div');
    tabEl.id = 'tab-settings-moderation';
    tabEl.className = 'settings-tab-item';
    tabEl.setAttribute('data-section', 'moderation');
    tabEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color:#ef4444;"></i> AI Moderatsiya`;
    settingsTabs.appendChild(tabEl);

    tabEl.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-item').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-section-panel').forEach(p => p.classList.remove('active'));
      tabEl.classList.add('active');
      document.getElementById('settings-sec-moderation')?.classList.add('active');
      loadModerationAdminData();
    });
  }

  if (settingsContentArea && !document.getElementById('settings-sec-moderation')) {
    const panelEl = document.createElement('div');
    panelEl.id = 'settings-sec-moderation';
    panelEl.className = 'settings-section-panel moderation-admin-panel';
    panelEl.innerHTML = `
      <div class="moderation-admin-header">
        <div class="admin-title-row">
          <div>
            <h3 style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700;">
              <i class="fa-solid fa-shield-halved" style="color:#ef4444;"></i> AI Content Moderation & Xavfsizlik
            </h3>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              Matn, rasm, video va havolalarni 18+ hamda nomaqbul kontentdan himoya qilish tizimi
            </p>
          </div>
          <button class="btn-secondary" id="btn-refresh-moderation-stats" style="padding:6px 12px;font-size:12px;">
            <i class="fa-solid fa-arrows-rotate"></i> Yangilash
          </button>
        </div>

        <!-- Metric Stat Cards -->
        <div class="moderation-stats-grid">
          <div class="stat-mini-card">
            <div class="stat-mini-label">Tizim Holati</div>
            <div class="stat-mini-val" id="stat-mod-status" style="color:#10b981;">FAOL 🟢</div>
          </div>
          <div class="stat-mini-card">
            <div class="stat-mini-label">Jami Bloklangan</div>
            <div class="stat-mini-val" id="stat-mod-total" style="color:#ef4444;">0</div>
          </div>
          <div class="stat-mini-card">
            <div class="stat-mini-label">Matnlar</div>
            <div class="stat-mini-val" id="stat-mod-text">0</div>
          </div>
          <div class="stat-mini-card">
            <div class="stat-mini-label">Rasmlar</div>
            <div class="stat-mini-val" id="stat-mod-images">0</div>
          </div>
          <div class="stat-mini-card">
            <div class="stat-mini-label">Videolar</div>
            <div class="stat-mini-val" id="stat-mod-videos">0</div>
          </div>
          <div class="stat-mini-card">
            <div class="stat-mini-label">Havolalar</div>
            <div class="stat-mini-val" id="stat-mod-links">0</div>
          </div>
        </div>

        <!-- AI Engine Status Banner -->
        <div class="moderation-engine-banner">
          <i class="fa-solid fa-microchip" style="font-size:20px;color:var(--accent-color);"></i>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;" id="stat-mod-engine-name">Google Gemini AI + Anti-Bypass Filter</div>
            <div style="font-size:11px;color:var(--text-muted);" id="stat-mod-rules-info">Xatoliklarni oldini olish: Maktab so'zlari whitelist orqali himoyalangan</div>
          </div>
        </div>

        <!-- Interactive Admin Sandbox Test -->
        <div class="moderation-test-sandbox">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:8px;">
            <i class="fa-solid fa-flask"></i> Moderatsiya Test Laboratoriyasi (Sandbox)
          </h4>
          <div style="display:flex;gap:8px;">
            <input type="text" id="admin-test-input" class="form-input" placeholder="Tekshirish uchun ixtiyoriy matn yoki havola kiriting...">
            <button class="btn-primary" id="btn-run-admin-test" style="width:auto;padding:0 16px;white-space:nowrap;">
              <i class="fa-solid fa-play"></i> Tekshirish
            </button>
          </div>
          <div id="admin-test-result-box" style="display:none;margin-top:10px;padding:10px 14px;border-radius:10px;font-size:13px;"></div>
        </div>

        <!-- Audit Logs Table -->
        <div class="moderation-logs-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h4 style="font-size:13px;font-weight:600;">
              <i class="fa-solid fa-clock-rotate-left"></i> Bloklangan Kontentlar Jurnali (Audit Logs)
            </h4>
            <button class="btn-secondary danger" id="btn-clear-moderation-logs" style="padding:4px 10px;font-size:11px;">
              <i class="fa-solid fa-trash"></i> Jurnalni tozalash
            </button>
          </div>

          <div class="moderation-table-wrapper">
            <table class="moderation-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Tur</th>
                  <th>Sabab</th>
                  <th>Foydalanuvchi</th>
                  <th>Kontent / Parchasi</th>
                </tr>
              </thead>
              <tbody id="moderation-logs-tbody">
                <tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Jurnal yuklanmoqda...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    settingsContentArea.appendChild(panelEl);

    // Event listeners
    panelEl.querySelector('#btn-refresh-moderation-stats')?.addEventListener('click', loadModerationAdminData);
    panelEl.querySelector('#btn-clear-moderation-logs')?.addEventListener('click', clearModerationAdminLogs);
    panelEl.querySelector('#btn-run-admin-test')?.addEventListener('click', runAdminSandboxTest);
  }
}

/**
 * Loads stats & logs from backend API
 */
export async function loadModerationAdminData() {
  try {
    const [statsResp, logsResp] = await Promise.all([
      fetch('/api/moderation/stats').then(r => r.json()).catch(() => null),
      fetch('/api/moderation/logs').then(r => r.json()).catch(() => [])
    ]);

    if (statsResp) {
      const statusEl = document.getElementById('stat-mod-status');
      const totalEl = document.getElementById('stat-mod-total');
      const textEl = document.getElementById('stat-mod-text');
      const imgEl = document.getElementById('stat-mod-images');
      const vidEl = document.getElementById('stat-mod-videos');
      const linkEl = document.getElementById('stat-mod-links');
      const engineEl = document.getElementById('stat-mod-engine-name');

      if (statusEl) statusEl.textContent = `${statsResp.status} 🟢`;
      if (totalEl) totalEl.textContent = statsResp.totalBlocked || 0;
      if (textEl) textEl.textContent = statsResp.textBlocked || 0;
      if (imgEl) imgEl.textContent = statsResp.imagesBlocked || 0;
      if (vidEl) vidEl.textContent = statsResp.videosBlocked || 0;
      if (linkEl) linkEl.textContent = statsResp.linksBlocked || 0;
      if (engineEl) engineEl.textContent = statsResp.aiEngine || 'Anti-Bypass Guard';
    }

    renderModerationLogsTable(logsResp || []);
  } catch (e) {
    console.error('Moderatsiya ma\'lumotlarini yuklashda xato:', e);
  }
}

function renderModerationLogsTable(logs) {
  const tbody = document.getElementById('moderation-logs-tbody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);"><i class="fa-solid fa-circle-check" style="color:#10b981;font-size:20px;display:block;margin-bottom:6px;"></i> Hozircha birorta ham qoidabuzarlik bloklanmagan. Tizim toza!</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 50).map(item => {
    let typeBadge = `<span class="mod-type-badge text"><i class="fa-solid fa-font"></i> Matn</span>`;
    if (item.type === 'image') typeBadge = `<span class="mod-type-badge image"><i class="fa-solid fa-image"></i> Rasm</span>`;
    else if (item.type === 'video') typeBadge = `<span class="mod-type-badge video"><i class="fa-solid fa-video"></i> Video</span>`;
    else if (item.type === 'link') typeBadge = `<span class="mod-type-badge link"><i class="fa-solid fa-link"></i> Havola</span>`;

    const time = item.dateStr || new Date(item.timestamp).toLocaleTimeString();
    const safeSnippet = escapeHTML(item.snippet || '');
    const safeReason = escapeHTML(item.reason || '');
    const safeSender = escapeHTML(item.senderName || 'Foydalanuvchi');

    return `
      <tr>
        <td style="white-space:nowrap;font-size:11px;color:var(--text-muted);">${time}</td>
        <td>${typeBadge}</td>
        <td style="font-weight:500;color:#ef4444;font-size:12px;">${safeReason}</td>
        <td style="font-size:12px;">${safeSender}</td>
        <td style="font-family:monospace;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeSnippet}</td>
      </tr>
    `;
  }).join('');
}

async function clearModerationAdminLogs() {
  if (!confirm("Barcha moderatsiya bloklash jurnallarini o'chirmoqchimisiz?")) return;
  try {
    await fetch('/api/moderation/clear-logs', { method: 'POST' });
    loadModerationAdminData();
    if (window.showToast) window.showToast("Jurnal tozalandi.", "info");
  } catch (e) {}
}

async function runAdminSandboxTest() {
  const inputEl = document.getElementById('admin-test-input');
  const resultBox = document.getElementById('admin-test-result-box');
  if (!inputEl || !resultBox) return;

  const text = inputEl.value.trim();
  if (!text) return;

  resultBox.style.display = 'block';
  resultBox.style.background = 'var(--bg-secondary)';
  resultBox.style.color = 'var(--text-primary)';
  resultBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> AI tekshiruvi ketmoqda...`;

  try {
    const resp = await fetch('/api/moderation/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await resp.json();
    const isSafe = data.allowed;

    resultBox.style.background = isSafe ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    resultBox.style.border = `1px solid ${isSafe ? '#10b981' : '#ef4444'}`;
    resultBox.style.color = isSafe ? '#10b981' : '#ef4444';

    resultBox.innerHTML = `
      <div style="font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <i class="fa-solid ${isSafe ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
        ${data.verdict}
      </div>
      <div><strong>Sabab:</strong> ${escapeHTML(data.reason)}</div>
      <div style="font-size:11px;margin-top:4px;color:var(--text-muted);">
        <strong>Normalizatsiya:</strong> "${escapeHTML(data.normalized)}" | <strong>AI Dvigatel:</strong> ${data.aiEngine}
      </div>
    `;

    // Refresh logs table
    loadModerationAdminData();
  } catch (err) {
    resultBox.innerHTML = `<span style="color:#ef4444;">Xatolik: ${err.message}</span>`;
  }
}

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
