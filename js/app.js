// TelePulse - Main Application Orchestrator & UI Interactions
import { authReady, currentUser, userDocData } from './auth.js';
import { initTheme } from './profile.js';
import { initChatListStream, openChatById, handleFileUpload, sendMessagePayload } from './chat.js';
import { loadGroupMemberSelectionList } from './group.js';
import {
  db, storage, collection, query, where, getDocs, getDoc, addDoc, doc,
  updateDoc, serverTimestamp, ref, uploadBytesResumable, getDownloadURL
} from './firebase.js';

let mediaRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceSeconds = 0;

// ─── Auth Ready — App Init ────────────────────────────────────────────────────
window.onTelePulseAuthReady = async (user, userData) => {
  if (!user || !userData) return;

  // Sidebar user info
  const nameEl = document.getElementById('my-display-name');
  const usernameEl = document.getElementById('my-username');
  const avatarEl = document.getElementById('my-avatar');
  if (nameEl) nameEl.textContent = userData.displayName || user.displayName || 'Foydalanuvchi';
  if (usernameEl) usernameEl.textContent = `@${userData.username || ''}`;
  if (avatarEl) avatarEl.src = userData.photoURL || user.photoURL || '';

  initTheme(userData.theme);
  initEmojiGrid();
  await initChatListStream(user, userData);
};

// ─── Rich Telegram Emoji Categories & Picker ────────────────────────────────
const EMOJI_CATEGORIES = {
  smileys: [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
    '😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
    '😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
    '🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁',
    '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
    '😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','🤖','🎃'
  ],
  gestures: [
    '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
    '👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲',
    '🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁',
    '🦷','🦴','👀','👁️','👅','👄','👶','👧','🧒','👦','👩','🧑','👨','👵','🧓','👴'
  ],
  hearts: [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗',
    '💖','💘','💝','💟','💯','🔥','💥','✨','⭐','🌟','💫','⚡','💢','💤','💨','🕳️',
    '🎉','🎊','🎁','🎈','🏆','🥇','🥈','🥉','🏅','🎖️','💎','👑','🔮','🧿'
  ],
  animals: [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
    '🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗',
    '🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂',
    '🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋',
    '🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂',
    '🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🕊️'
  ],
  food: [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
    '🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠',
    '🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭',
    '🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜',
    '🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🧁','🍰','🎂','🍮','🍭',
    '🍬','🍫','🍿','🍩','🍪','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧃','🧉','🍾','☕'
  ],
  activities: [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍',
    '🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌',
    '🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽',
    '🚣','🧗','🚵','🚴','🎯','🎳','🎮','🎰','🧩','🎲','♟️','🎨','🎬','🎤','🎧','🎼'
  ],
  travel: [
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛴','🚲',
    '🛵','🏍️','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄',
    '🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','🚀','🛸','🚁','🛶','⛵',
    '🚤','🛥️','🛳️','⛴️','🚢','⚓','🛟','🚧','⛽','🚏','🚥','🚦','🗿','🗽','🗼','🏰'
  ],
  objects: [
    '💻','🖥️','🖨️','⌨️','🖱️','💽','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞',
    '☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋',
    '🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️',
    '🧰','🔧','🔨','⚒️','🛠️','⛏️','🪓','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨'
  ]
};

let currentEmojiCategory = 'smileys';

function renderEmojiList(category = 'smileys', filterQuery = '') {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;

  let emojiList = [];
  if (filterQuery.trim()) {
    const q = filterQuery.trim();
    // Search all categories
    Object.values(EMOJI_CATEGORIES).forEach(arr => {
      emojiList.push(...arr);
    });
    // Deduplicate
    emojiList = [...new Set(emojiList)];
  } else {
    emojiList = EMOJI_CATEGORIES[category] || EMOJI_CATEGORIES.smileys;
  }

  grid.innerHTML = '';
  emojiList.forEach(emoji => {
    const span = document.createElement('span');
    span.className = 'emoji-item';
    span.textContent = emoji;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.getElementById('message-text-input');
      if (input) {
        input.value += emoji;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });
    grid.appendChild(span);
  });
}

function initEmojiGrid() {
  renderEmojiList(currentEmojiCategory);

  // Tab click events
  document.querySelectorAll('.emoji-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.emoji-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEmojiCategory = btn.dataset.category || 'smileys';
      const searchInput = document.getElementById('emoji-search-input');
      if (searchInput) searchInput.value = '';
      renderEmojiList(currentEmojiCategory);
    });
  });

  // Search input event
  const searchInput = document.getElementById('emoji-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderEmojiList(currentEmojiCategory, e.target.value);
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }
}

// ─── Popover Toggles ──────────────────────────────────────────────────────────
document.getElementById('btn-emoji-picker')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('attachment-popover')?.classList.remove('active');
  document.getElementById('emoji-popover')?.classList.toggle('active');
});

document.getElementById('btn-attachment')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('emoji-popover')?.classList.remove('active');
  document.getElementById('attachment-popover')?.classList.toggle('active');
});

document.addEventListener('click', () => {
  document.querySelectorAll('.popover-menu').forEach(el => el.classList.remove('active'));
});

// ─── File Inputs ──────────────────────────────────────────────────────────────
document.getElementById('file-input-image')?.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFileUpload(e.target.files[0], 'image');
  document.getElementById('attachment-popover')?.classList.remove('active');
  e.target.value = '';
});

document.getElementById('file-input-video')?.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFileUpload(e.target.files[0], 'video');
  document.getElementById('attachment-popover')?.classList.remove('active');
  e.target.value = '';
});

document.getElementById('file-input-doc')?.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFileUpload(e.target.files[0], 'document');
  document.getElementById('attachment-popover')?.classList.remove('active');
  e.target.value = '';
});

// ─── Voice Recorder ───────────────────────────────────────────────────────────
const micBtn = document.getElementById('btn-mic');
const voiceBar = document.getElementById('voice-recorder-bar');
const recordingTimerEl = document.getElementById('recording-timer');

micBtn?.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Brauzeringiz ovoz yozishni qo'llab-quvvatlamaydi!"); return;
  }
  if (!window.activeChatData) {
    showToast("Ovoz yozish uchun avval biror chatni tanlang!", "warning");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Cross-browser audio MIME detection (Chrome, Firefox, Safari iOS)
    const audioMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    let chosenMime = audioMimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    mediaRecorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    // 100ms timeslice ensures continuous data buffering
    mediaRecorder.start(100);

    if (voiceBar) voiceBar.style.display = 'flex';
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'none';

    voiceSeconds = 0;
    if (recordingTimerEl) recordingTimerEl.textContent = '00:00';
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(() => {
      voiceSeconds++;
      const m = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
      const s = String(voiceSeconds % 60).padStart(2, '0');
      if (recordingTimerEl) recordingTimerEl.textContent = `${m}:${s}`;
    }, 1000);
  } catch (err) {
    alert("Mikrofondan foydalanishga ruxsat berilmadi: " + err.message);
  }
});

document.getElementById('btn-cancel-voice')?.addEventListener('click', () => stopVoice(false));
document.getElementById('btn-send-voice')?.addEventListener('click', () => stopVoice(true));

function stopVoice(shouldSend) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  mediaRecorder.onstop = async () => {
    clearInterval(voiceTimerInterval);
    if (voiceBar) voiceBar.style.display = 'none';
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'flex';

    if (shouldSend && audioChunks.length > 0) {
      const mime = mediaRecorder.mimeType || 'audio/webm';
      const ext = mime.includes('mp4') ? 'mp4' : (mime.includes('ogg') ? 'ogg' : 'webm');
      const blob = new Blob(audioChunks, { type: mime });
      const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mime });
      handleFileUpload(file, 'voice');
      showToast("Ovozli xabar yuborilmoqda...", "info");
    }
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  };

  try {
    mediaRecorder.requestData();
  } catch (e) {}
  mediaRecorder.stop();
}

// ─── Telegram Round Video ("Krujochek") Recorder ─────────────────────────────
let roundVideoRecorder = null;
let roundVideoChunks = [];
let roundVideoStream = null;
let roundVideoInterval = null;
let roundVideoSeconds = 0;
let currentCameraFacing = 'user';

const roundVideoBtn = document.getElementById('btn-round-video');
const roundVideoModal = document.getElementById('round-video-modal');
const roundVideoPreview = document.getElementById('round-video-camera-preview');
const roundVideoTimerEl = document.getElementById('round-video-timer');
const roundRingProgress = document.getElementById('round-ring-progress');
const switchCamBtn = document.getElementById('btn-switch-camera');
const sendRoundVideoBtn = document.getElementById('btn-send-round-video');
const cancelRoundVideoBtn = document.getElementById('btn-cancel-round-video');

async function startRoundCamera(facing = 'user') {
  if (roundVideoStream) {
    roundVideoStream.getTracks().forEach(t => t.stop());
  }
  const constraints = {
    audio: true,
    video: {
      facingMode: facing,
      width: { ideal: 480 },
      height: { ideal: 480 }
    }
  };
  roundVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
  if (roundVideoPreview) {
    roundVideoPreview.srcObject = roundVideoStream;
    roundVideoPreview.muted = true;
    await roundVideoPreview.play().catch(() => {});
  }
  return roundVideoStream;
}

roundVideoBtn?.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Brauzeringiz kameradan foydalanishni qo'llab-quvvatlamaydi!");
    return;
  }
  try {
    const stream = await startRoundCamera(currentCameraFacing);
    if (roundVideoModal) roundVideoModal.style.display = 'flex';

    // Pick best supported MIME
    const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    let chosenMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    roundVideoChunks = [];
    roundVideoRecorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);

    roundVideoRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) roundVideoChunks.push(e.data);
    };

    roundVideoRecorder.start(100);

    // Reset timer & SVG progress
    roundVideoSeconds = 0;
    if (roundVideoTimerEl) roundVideoTimerEl.textContent = '00:00';
    if (roundRingProgress) roundRingProgress.style.strokeDashoffset = '289';

    clearInterval(roundVideoInterval);
    roundVideoInterval = setInterval(() => {
      roundVideoSeconds++;
      const m = String(Math.floor(roundVideoSeconds / 60)).padStart(2, '0');
      const s = String(roundVideoSeconds % 60).padStart(2, '0');
      if (roundVideoTimerEl) roundVideoTimerEl.textContent = `${m}:${s}`;

      // Max 60 seconds
      const maxSec = 60;
      const progress = Math.min(1, roundVideoSeconds / maxSec);
      if (roundRingProgress) {
        roundRingProgress.style.strokeDashoffset = `${289 - (289 * progress)}`;
      }

      if (roundVideoSeconds >= maxSec) {
        stopRoundVideo(true);
      }
    }, 1000);

  } catch (err) {
    alert("Kameraga ulanishda xatolik: " + err.message);
  }
});

switchCamBtn?.addEventListener('click', async () => {
  currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
  try {
    await startRoundCamera(currentCameraFacing);
  } catch (e) {}
});

sendRoundVideoBtn?.addEventListener('click', () => stopRoundVideo(true));
cancelRoundVideoBtn?.addEventListener('click', () => stopRoundVideo(false));

function stopRoundVideo(shouldSend) {
  clearInterval(roundVideoInterval);
  if (roundVideoModal) roundVideoModal.style.display = 'none';

  if (!roundVideoRecorder || roundVideoRecorder.state === 'inactive') {
    if (roundVideoStream) roundVideoStream.getTracks().forEach(t => t.stop());
    return;
  }

  roundVideoRecorder.onstop = async () => {
    if (roundVideoStream) roundVideoStream.getTracks().forEach(t => t.stop());

    if (shouldSend && roundVideoChunks.length > 0) {
      const mime = roundVideoRecorder.mimeType || 'video/webm';
      const blob = new Blob(roundVideoChunks, { type: mime });
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `krujochek_${Date.now()}.${ext}`, { type: mime });
      handleFileUpload(file, 'round_video');
    }
  };

  roundVideoRecorder.stop();
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────
document.getElementById('fab-new-chat')?.addEventListener('click', () => {
  document.getElementById('modal-new-chat')?.classList.add('active');
  document.getElementById('search-username-input')?.focus();
});

document.getElementById('search-username-input')?.addEventListener('input', async (e) => {
  const queryText = e.target.value.trim().toLowerCase();
  const resultEl = document.getElementById('search-users-result');
  if (!resultEl) return;

  if (queryText.length < 1) { resultEl.innerHTML = ''; return; }

  await authReady;
  if (!currentUser) return;

  try {
    const q = query(
      collection(db, 'users'),
      where('username', '>=', queryText),
      where('username', '<=', queryText + '\uf8ff')
    );
    const snap = await getDocs(q);
    resultEl.innerHTML = '';

    if (snap.empty) {
      resultEl.innerHTML = '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px;">Topilmadi</div>';
      return;
    }

    snap.forEach(docSnap => {
      const uData = docSnap.data();
      if (uData.uid === currentUser.uid) return;

      const item = document.createElement('div');
      item.className = 'user-select-item';
      item.innerHTML = `
        <img class="user-avatar" style="width:36px;height:36px;" src="${uData.photoURL || ''}" alt="">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;">${uData.displayName || ''}</div>
          <div style="font-size:12px;color:var(--text-muted);">@${uData.username || ''}</div>
        </div>`;

      item.addEventListener('click', async () => {
        await startOrOpenPrivateChat(uData);
        document.getElementById('modal-new-chat')?.classList.remove('active');
      });
      resultEl.appendChild(item);
    });
  } catch (err) {
    console.error('User search error:', err);
  }
});

async function startOrOpenPrivateChat(targetUser) {
  await authReady;
  if (!currentUser) return;

  try {
    const q = query(
      collection(db, 'chats'),
      where('type', '==', 'private'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const snap = await getDocs(q);
    let existingId = null;

    snap.forEach(docSnap => {
      if ((docSnap.data().participants || []).includes(targetUser.uid)) {
        existingId = docSnap.id;
      }
    });

    if (existingId) {
      openChatById(existingId);
    } else {
      const ref = await addDoc(collection(db, 'chats'), {
        type: 'private',
        participants: [currentUser.uid, targetUser.uid],
        unreadCount: { [currentUser.uid]: 0, [targetUser.uid]: 0 },
        typing: { [currentUser.uid]: false, [targetUser.uid]: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: null
      });
      openChatById(ref.id);
    }
  } catch (err) {
    console.error('Start chat error:', err);
  }
}

// ─── New Group Modal ──────────────────────────────────────────────────────────
document.getElementById('btn-create-group-instead')?.addEventListener('click', () => {
  document.getElementById('modal-new-chat')?.classList.remove('active');
  document.getElementById('modal-new-group')?.classList.add('active');
  loadGroupMemberSelectionList();
});

// ─── Modal Close Triggers ─────────────────────────────────────────────────────
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.dataset.modal;
    if (modalId) {
      document.getElementById(modalId)?.classList.remove('active');
    } else {
      btn.closest('.modal-overlay')?.classList.remove('active');
    }
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ─── Global Toast Notifications ──────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-circle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}
window.showToast = showToast;

// ─── Global Escape Key to Close Everything ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.popover-menu.active').forEach(p => p.classList.remove('active'));
    const rModal = document.getElementById('round-video-modal');
    if (rModal && rModal.style.display !== 'none') {
      stopRoundVideo(false);
    }
    const ctx = document.getElementById('message-context-menu');
    if (ctx) ctx.style.display = 'none';
    document.getElementById('info-drawer')?.classList.remove('active');
  }
});

// ─── Right Info Drawer ────────────────────────────────────────────────────────
const infoDrawer = document.getElementById('info-drawer');

document.getElementById('btn-chat-info-drawer')?.addEventListener('click', () => {
  infoDrawer?.classList.toggle('active');
  if (infoDrawer?.classList.contains('active')) populateInfoDrawer();
});

document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
  infoDrawer?.classList.remove('active');
});

async function populateInfoDrawer() {
  const container = document.getElementById('drawer-content-body');
  if (!container || !window.activeChatData) return;

  const chat = window.activeChatData;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Yuklanmoqda...</div>';

  await authReady;
  if (!currentUser) return;

  try {
    if (chat.type === 'private') {
      const otherUid = (chat.participants || []).find(uid => uid !== currentUser.uid);
      if (!otherUid) return;
      const uSnap = await getDoc(doc(db, 'users', otherUid));
      if (!uSnap.exists()) return;
      const uData = uSnap.data();
      container.innerHTML = `
        <img class="user-avatar" style="width:100px;height:100px;" src="${uData.photoURL || ''}" alt="">
        <h3 style="font-weight:700;">${uData.displayName || ''}</h3>
        <div style="font-size:13px;color:var(--text-secondary);">@${uData.username || ''}</div>
        <div class="premium-badge"><i class="fa-solid fa-star"></i> TELEPULSE PREMIUM</div>
        <div style="width:100%;border-top:1px solid var(--border-color);padding-top:12px;margin-top:10px;">
          <div style="font-weight:600;font-size:13px;color:var(--text-muted);">BIO</div>
          <div style="font-size:14px;margin-top:4px;">${uData.bio || 'Mavjud emas'}</div>
        </div>`;
    } else {
      const isAdmin = (chat.admins || []).includes(currentUser.uid);
      let membersHTML = '<div style="width:100%;"><div style="font-weight:600;font-size:13px;color:var(--text-muted);margin-bottom:8px;">A\'ZOLAR</div>';

      for (const uid of (chat.participants || [])) {
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            const mAdmin = (chat.admins || []).includes(uid);
            const mOwner = chat.ownerId === uid;
            membersHTML += `<div class="user-select-item" style="justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:10px;">
                <img class="user-avatar" style="width:32px;height:32px;" src="${uData.photoURL || ''}" alt="">
                <div>
                  <div style="font-size:13px;font-weight:600;">${uData.displayName || ''}</div>
                  <div style="font-size:11px;color:var(--text-muted);">@${uData.username || ''}</div>
                </div>
              </div>
              <div>
                ${mOwner ? '<span class="premium-badge">OWNER</span>' : mAdmin ? '<span class="premium-badge">ADMIN</span>' : ''}
                ${isAdmin && !mOwner && uid !== currentUser.uid ? `<button onclick="window.kickMember('${chat.id}','${uid}')" style="border:none;background:none;color:var(--danger-color);cursor:pointer;font-size:13px;margin-left:6px;"><i class="fa-solid fa-user-minus"></i></button>` : ''}
              </div>
            </div>`;
          }
        } catch (e) {}
      }
      membersHTML += '</div>';

      container.innerHTML = `
        <img class="user-avatar" style="width:100px;height:100px;" src="${chat.groupAvatar || ''}" alt="">
        <h3 style="font-weight:700;">${chat.groupName || 'Guruh'}</h3>
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;">${chat.groupDescription || ''}</div>
        ${membersHTML}
        <button class="btn-secondary" onclick="window.leaveGroupHandler('${chat.id}')" style="width:100%;color:var(--danger-color);margin-top:20px;">
          <i class="fa-solid fa-right-from-bracket"></i> Guruhdan chiqish
        </button>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger-color);font-size:13px;">Yuklashda xatolik: ${err.message}</div>`;
  }
}

window.kickMember = async (chatId, uid) => {
  if (!confirm("Ushbu a'zoni guruhdan chiqarmoqchimisiz?")) return;
  const { removeMemberFromGroup } = await import('./group.js');
  await removeMemberFromGroup(chatId, uid);
  populateInfoDrawer();
};

window.leaveGroupHandler = async (chatId) => {
  if (!confirm("Guruhdan chiqishni tasdiqlaysizmi?")) return;
  const { leaveGroup } = await import('./group.js');
  await leaveGroup(chatId);
  infoDrawer?.classList.remove('active');
  document.getElementById('active-chat-container').style.display = 'none';
  document.getElementById('no-chat-view').style.display = 'flex';
};

// ─── QR Share Modal (Local Wi-Fi Network & Mobile Access) ────────────────────
document.getElementById('share-app-btn')?.addEventListener('click', async () => {
  const modal = document.getElementById('modal-share-app');
  const qrImg = document.getElementById('qr-code-img');
  const urlInput = document.getElementById('share-url-input');

  let targetUrl = window.location.origin + window.location.pathname.replace('index.html', 'login.html');

  // If local, fetch server's real local network Wi-Fi IP so phone connects directly!
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        const info = await res.json();
        if (info.url) {
          targetUrl = info.url;
        }
      }
    } catch (e) {}
  }

  function setQR(url) {
    if (urlInput) urlInput.value = url;
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  }

  setQR(targetUrl);
  modal?.classList.add('active');

  // Allow manual edit if user wants custom IP/domain
  if (urlInput && !urlInput._qrBound) {
    urlInput._qrBound = true;
    urlInput.removeAttribute('readonly');
    urlInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val && qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(val)}`;
      }
    });
  }
});

document.getElementById('btn-copy-share-url')?.addEventListener('click', () => {
  const urlInput = document.getElementById('share-url-input');
  if (urlInput?.value) {
    navigator.clipboard.writeText(urlInput.value).catch(() => {});
    showToast("Havola nusxalandi!", "success");
    const btn = document.getElementById('btn-copy-share-url');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Nusxalandi!';
      setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Nusxalash'; }, 2000);
    }
  }
});
