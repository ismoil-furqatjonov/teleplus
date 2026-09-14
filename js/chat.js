// TelePulse - Core Real-time Messaging Engine
import {
  db,
  storage,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from './firebase.js';
import { authReady, currentUser, userDocData } from './auth.js';
import { togglePinChat, compressImage } from './profile.js';
import { promoteToAdmin, removeMemberFromGroup, leaveGroup } from './group.js';

let activeChatId = null;
let activeChatData = null;
let chatListUnsubscribe = null;
let messagesUnsubscribe = null;
let activeChatDocUnsubscribe = null;
let replyingMessage = null;
let editingMessageId = null;
let targetContextMessage = null;
let typingTimeout = null;

// DOM Elements
const chatListContainer = document.getElementById('chat-list-container');
const messagesContainer = document.getElementById('messages-container');
const noChatView = document.getElementById('no-chat-view');
const activeChatContainer = document.getElementById('active-chat-container');
const messageTextInput = document.getElementById('message-text-input');
const sendMsgBtn = document.getElementById('btn-send-message');
const micBtn = document.getElementById('btn-mic');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');

// ─── Notification Sound ────────────────────────────────────────────────────
function playNotificationSound(type = 'incoming') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'incoming') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {}
}

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

function triggerWebNotification(title, body, icon) {
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    new Notification(title, { body, icon });
  }
}

// ─── Chat List Stream ────────────────────────────────────────────────────────
export async function initChatListStream(user, userData) {
  // Auth tayyor bo'lguncha kut
  await authReady;
  if (!user) return;

  if (chatListUnsubscribe) chatListUnsubscribe();

  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', user.uid)
  );

  chatListUnsubscribe = onSnapshot(q, async (snapshot) => {
    if (!snapshot) return;
    const chats = [];

    for (const docSnap of snapshot.docs) {
      const chat = { id: docSnap.id, ...docSnap.data() };

      if (chat.type === 'private') {
        const otherUid = (chat.participants || []).find(uid => uid !== user.uid);
        if (otherUid) {
          try {
            const uSnap = await getDoc(doc(db, 'users', otherUid));
            if (uSnap.exists()) {
              const uData = uSnap.data();
              chat.otherUserData = uData;
              chat.displayTitle = uData.displayName;
              chat.displayAvatar = uData.photoURL;
              chat.isOnline = uData.online;
            }
          } catch (e) {}
        }
      } else {
        chat.displayTitle = chat.groupName;
        chat.displayAvatar = chat.groupAvatar;
      }
      chats.push(chat);
    }

    const pinnedSet = new Set(userData?.pinnedChats || []);
    chats.sort((a, b) => {
      const ap = pinnedSet.has(a.id) ? 1 : 0;
      const bp = pinnedSet.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.updatedAt?.seconds || 0;
      const bt = b.updatedAt?.seconds || 0;
      return bt - at;
    });

    currentChatsList = chats;
    currentPinnedSet = pinnedSet;
    renderChatListItems(currentChatsList, currentPinnedSet);
  }, (err) => {
    console.error('Chat list error:', err);
  });
}

let currentChatsList = [];
let currentPinnedSet = new Set();

export function refreshChatListView() {
  renderChatListItems(currentChatsList, currentPinnedSet);
}
window.refreshChatListView = refreshChatListView;

// Setup Filter Tabs & Search handlers directly
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    refreshChatListView();
  });
});

document.getElementById('global-search-input')?.addEventListener('input', () => {
  refreshChatListView();
});

// ─── Render Chat List ────────────────────────────────────────────────────────
function renderChatListItems(chats, pinnedSet) {
  if (!chatListContainer) return;
  chatListContainer.innerHTML = '';

  const activeTab = document.querySelector('.filter-tab.active')?.dataset.tab || 'all';
  const searchQuery = document.getElementById('global-search-input')?.value.toLowerCase().trim() || '';

  const filtered = chats.filter(chat => {
    if (activeTab === 'private' && chat.type !== 'private') return false;
    if (activeTab === 'groups' && chat.type !== 'group') return false;
    if (activeTab === 'pinned' && !pinnedSet.has(chat.id)) return false;
    if (searchQuery) {
      const t = chat.displayTitle?.toLowerCase() || '';
      const m = chat.lastMessage?.text?.toLowerCase() || '';
      const u = chat.otherUserData?.username?.toLowerCase() || '';
      return t.includes(searchQuery) || m.includes(searchQuery) || u.includes(searchQuery);
    }
    return true;
  });

  if (filtered.length === 0) {
    const emptyMsg = activeTab === 'groups' ? 'Hozircha guruhlar mavjud emas' : (activeTab === 'private' ? 'Shaxsiy chatlar mavjud emas' : 'Chatlar topilmadi');
    chatListContainer.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;">${emptyMsg}</div>`;
    return;
  }

  filtered.forEach(chat => {
    const item = document.createElement('div');
    item.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
    item.dataset.chatId = chat.id;

    const unread = chat.unreadCount?.[currentUser?.uid] || 0;
    const isPinned = pinnedSet.has(chat.id);
    const lastMsgText = chat.lastMessage?.text || 'Muloqot yo\'q';
    let timeStr = '';
    if (chat.updatedAt?.seconds) {
      timeStr = new Date(chat.updatedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    item.innerHTML = `
      <div class="avatar-wrapper">
        <img class="user-avatar" src="${chat.displayAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Chat'}" alt="Avatar">
        ${chat.type === 'private' && chat.isOnline ? '<div class="online-indicator"></div>' : ''}
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <div class="chat-item-title">
            ${escapeHTML(chat.displayTitle || 'Chat')}
            ${chat.type === 'group' ? '<i class="fa-solid fa-users" style="font-size:11px;color:var(--accent-color);"></i>' : ''}
          </div>
          <span class="chat-item-time">${timeStr}</span>
        </div>
        <div class="chat-item-preview">
          <span class="last-msg">${escapeHTML(lastMsgText)}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            ${isPinned ? '<i class="fa-solid fa-thumbtack pin-icon"></i>' : ''}
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
        </div>
      </div>`;

    item.addEventListener('click', () => openChatById(chat.id, chat));
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(isPinned ? "Pin'dan chiqarish?" : "Pin qilish?")) {
        togglePinChat(chat.id, isPinned);
      }
    });

    chatListContainer.appendChild(item);
  });
}

// ─── Close Active Chat ───────────────────────────────────────────────────────
export function closeActiveChat() {
  activeChatId = null;
  activeChatData = null;
  window.activeChatData = null;

  if (messagesUnsubscribe) messagesUnsubscribe();
  if (activeChatDocUnsubscribe) activeChatDocUnsubscribe();

  if (activeChatContainer) activeChatContainer.style.display = 'none';
  if (noChatView) noChatView.style.display = 'flex';
  document.getElementById('sidebar')?.classList.remove('hidden-mobile');
  document.getElementById('info-drawer')?.classList.remove('active');

  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}
window.closeActiveChat = closeActiveChat;

document.getElementById('btn-mobile-back')?.addEventListener('click', closeActiveChat);
document.getElementById('btn-close-chat')?.addEventListener('click', closeActiveChat);

// ─── Open Chat ───────────────────────────────────────────────────────────────
export async function openChatById(chatId, cachedData = null) {
  // Auth tayyor bo'lguncha kut
  await authReady;
  if (!currentUser) return;

  activeChatId = chatId;
  noChatView.style.display = 'none';
  activeChatContainer.style.display = 'flex';

  // Highlight in list
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });

  // Mobile: sidebar yashir
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.add('hidden-mobile');
  }

  // Unread reset
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      [`unreadCount.${currentUser.uid}`]: 0
    });
  } catch (e) {}

  // Chat doc listener
  if (activeChatDocUnsubscribe) activeChatDocUnsubscribe();
  activeChatDocUnsubscribe = onSnapshot(doc(db, 'chats', chatId), async (docSnap) => {
    if (!docSnap.exists()) return;
    activeChatData = { id: docSnap.id, ...docSnap.data() };
    window.activeChatData = activeChatData;
    updateChatHeaderUI(activeChatData);
    updateTypingUI(activeChatData);
  }, (err) => console.error('Chat doc error:', err));

  listenToMessagesStream(chatId);
}

window.openChatById = openChatById;

// ─── Chat Header UI ───────────────────────────────────────────────────────────
async function updateChatHeaderUI(chat) {
  const avatarImg = document.getElementById('chat-header-avatar');
  const titleEl = document.getElementById('chat-header-title');
  const subtitleEl = document.getElementById('chat-header-subtitle');
  const onlineDot = document.getElementById('chat-header-online-dot');
  if (!avatarImg || !titleEl) return;

  if (chat.type === 'private') {
    const otherUid = (chat.participants || []).find(uid => uid !== currentUser?.uid);
    if (!otherUid) return;
    try {
      const uSnap = await getDoc(doc(db, 'users', otherUid));
      if (!uSnap.exists()) return;
      const uData = uSnap.data();
      avatarImg.src = uData.photoURL || '';
      titleEl.innerHTML = `${escapeHTML(uData.displayName)} <span class="premium-badge"><i class="fa-solid fa-star"></i></span>`;
      if (uData.online) {
        subtitleEl.textContent = 'online';
        subtitleEl.className = 'chat-subtitle online';
        if (onlineDot) onlineDot.style.display = 'block';
      } else {
        const ls = uData.lastSeen?.seconds ? new Date(uData.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        subtitleEl.textContent = ls ? `oxirgi ko'ringan: ${ls}` : 'offline';
        subtitleEl.className = 'chat-subtitle';
        if (onlineDot) onlineDot.style.display = 'none';
      }
    } catch (e) {}
  } else {
    avatarImg.src = chat.groupAvatar || '';
    titleEl.innerHTML = `${escapeHTML(chat.groupName || 'Guruh')} <i class="fa-solid fa-users" style="font-size:12px;color:var(--accent-color);"></i>`;
    subtitleEl.textContent = `${(chat.participants || []).length} ta a'zo`;
    subtitleEl.className = 'chat-subtitle';
    if (onlineDot) onlineDot.style.display = 'none';
  }
}

// ─── Typing UI ────────────────────────────────────────────────────────────────
function updateTypingUI(chat) {
  if (!typingIndicator) return;
  const typingUids = Object.keys(chat.typing || {}).filter(uid => uid !== currentUser?.uid && chat.typing[uid] === true);
  typingIndicator.style.display = typingUids.length > 0 ? 'flex' : 'none';
  if (typingText) typingText.textContent = 'yozmoqda...';
}

// ─── Messages Stream ──────────────────────────────────────────────────────────
function listenToMessagesStream(chatId) {
  if (messagesUnsubscribe) messagesUnsubscribe();
  if (!messagesContainer) return;

  let firstLoad = true;
  const q = query(
    collection(db, `chats/${chatId}/messages`),
    orderBy('createdAt', 'asc')
  );

  messagesUnsubscribe = onSnapshot(q, (snapshot) => {
    if (!snapshot) return;
    messagesContainer.innerHTML = '';

    snapshot.docs.forEach(docSnap => {
      const msg = { id: docSnap.id, ...docSnap.data() };
      if (msg.deletedFor?.includes(currentUser?.uid)) return;

      // Mark seen
      if (msg.senderId !== currentUser?.uid && !(msg.seenBy || []).includes(currentUser?.uid)) {
        updateDoc(doc(db, `chats/${chatId}/messages`, msg.id), {
          seenBy: arrayUnion(currentUser.uid)
        }).catch(() => {});
      }

      renderSingleMessageBubble(msg);
    });

    // Sound on new message (not first load)
    if (!firstLoad) playNotificationSound('incoming');
    firstLoad = false;

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, (err) => {
    console.error('Messages stream error:', err);
  });
}

// ─── Render Message Bubble ────────────────────────────────────────────────────
function renderSingleMessageBubble(msg) {
  const isOut = msg.senderId === currentUser?.uid;
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isOut ? 'out' : 'in'}`;
  wrapper.dataset.msgId = msg.id;

  let timeStr = '';
  if (msg.createdAt?.seconds) {
    timeStr = new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (msg.createdAt) {
    timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const isSeen = (msg.seenBy || []).length > 1;
  const statusTicks = isOut
    ? `<span class="status-ticks">${isSeen ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-check"></i>'}</span>`
    : '';

  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `<div class="reply-quote">
      <div class="reply-quote-author">${escapeHTML(msg.replyTo.senderName || '')}</div>
      <div class="reply-quote-text">${escapeHTML(msg.replyTo.text || '')}</div>
    </div>`;
  }

  let forwardHTML = '';
  if (msg.forwardFrom) {
    forwardHTML = `<div class="forward-tag"><i class="fa-solid fa-share"></i> ${escapeHTML(msg.forwardFrom.senderName || '')} dan yo'naltirildi</div>`;
  }

  let payloadHTML = '';
  if (msg.type === 'text' || !msg.type) {
    payloadHTML = `<span>${escapeHTML(msg.text || '')}</span>`;
  } else if (msg.type === 'image') {
    payloadHTML = `
      ${msg.text ? `<div>${escapeHTML(msg.text)}</div>` : ''}
      <div class="image-msg-container">
        <img class="message-image" src="${msg.fileURL}" alt="Rasm" loading="lazy" onclick="openLightbox('${msg.fileURL}', false)">
        <button class="media-view-btn" onclick="openLightbox('${msg.fileURL}', false)" title="Kattalashtirish">
          <i class="fa-solid fa-expand"></i>
        </button>
      </div>`;
  } else if (msg.type === 'video') {
    payloadHTML = `
      <div class="video-msg-container">
        <video class="message-video" src="${msg.fileURL}" controls playsinline preload="metadata"></video>
        <button class="video-expand-btn" onclick="openLightbox('${msg.fileURL}', true)" title="To'liq ekranda ko'rish">
          <i class="fa-solid fa-expand"></i>
        </button>
      </div>`;
  } else if (msg.type === 'round_video') {
    payloadHTML = `
      <div class="round-video-wrapper" onclick="toggleRoundVideo(this)">
        <video class="round-video-item" src="${msg.fileURL}" playsinline loop muted></video>
        <div class="round-video-overlay">
          <i class="fa-solid fa-play"></i>
        </div>
        <div class="round-video-time">00:00</div>
      </div>`;
  } else if (msg.type === 'document') {
    payloadHTML = `<a class="file-attachment" href="${msg.fileURL}" target="_blank">
      <i class="fa-solid fa-file-arrow-down file-icon"></i>
      <div class="file-info">
        <div class="file-name">${escapeHTML(msg.fileName || 'Fayl')}</div>
        <div class="file-size">${formatBytes(msg.fileSize || 0)}</div>
      </div>
    </a>`;
  } else if (msg.type === 'voice') {
    payloadHTML = `<div class="voice-msg-player">
      <button class="voice-play-btn" onclick="toggleVoicePlayback(this,'${msg.fileURL}')">
        <i class="fa-solid fa-play"></i>
      </button>
      <div class="voice-waveform">
        ${[50,80,30,90,60,40,70,55,85,35].map(h => `<div class="wave-bar" style="height:${h}%"></div>`).join('')}
      </div>
      <span style="font-size:11px;color:var(--text-muted);">Ovozli</span>
    </div>`;
  }

  let reactionsHTML = '';
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    reactionsHTML = '<div class="reactions-container">';
    for (const [emoji, uids] of Object.entries(msg.reactions)) {
      if (uids && uids.length > 0) {
        const hasReacted = uids.includes(currentUser?.uid);
        reactionsHTML += `<div class="reaction-pill ${hasReacted ? 'user-reacted' : ''}" onclick="toggleReaction('${msg.id}','${emoji}')">
          <span>${emoji}</span> <span>${uids.length}</span>
        </div>`;
      }
    }
    reactionsHTML += '</div>';
  }

  wrapper.innerHTML = `
    ${!isOut && activeChatData?.type === 'group' ? `<div class="sender-name-label">${escapeHTML(msg.senderName || '')}</div>` : ''}
    <div class="message-bubble ${msg.type === 'round_video' ? 'bubble-round-video' : ''}">
      ${forwardHTML}${replyHTML}${payloadHTML}
      <div class="message-meta">
        ${msg.isEdited ? '<span style="font-style:italic;font-size:10px;">tahrirlandi</span>' : ''}
        <span>${timeStr}</span>
        ${statusTicks}
      </div>
    </div>
    ${reactionsHTML}`;

  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMessageContextMenu(e, msg);
  });

  // Telegram shortcut: Double-click message to reply
  wrapper.addEventListener('dblclick', (e) => {
    e.preventDefault();
    replyingMessage = msg;
    const bar = document.getElementById('reply-preview-bar');
    const title = document.getElementById('reply-preview-title');
    const text = document.getElementById('reply-preview-text');
    if (bar) bar.style.display = 'flex';
    if (title) title.textContent = `${msg.senderName || ''} ga javob`;
    if (text) text.textContent = msg.text || msg.type;
    messageTextInput?.focus();
  });

  messagesContainer.appendChild(wrapper);
}

// ─── Voice Playback ───────────────────────────────────────────────────────────
window.toggleVoicePlayback = (btn, url) => {
  if (!btn._audio) {
    btn._audio = new Audio(url);
    btn._audio.onended = () => { btn.querySelector('i').className = 'fa-solid fa-play'; };
  }
  if (btn._audio.paused) {
    btn._audio.play();
    btn.querySelector('i').className = 'fa-solid fa-pause';
  } else {
    btn._audio.pause();
    btn.querySelector('i').className = 'fa-solid fa-play';
  }
};

// ─── Round Video (Krujochek) Playback ─────────────────────────────────────────
window.toggleRoundVideo = (container) => {
  const vid = container.querySelector('video');
  const overlay = container.querySelector('.round-video-overlay');
  const icon = overlay?.querySelector('i');
  const timeEl = container.querySelector('.round-video-time');
  if (!vid) return;

  if (vid.paused) {
    vid.muted = false;
    vid.play().then(() => {
      if (overlay) overlay.style.opacity = '0';
      if (icon) icon.className = 'fa-solid fa-pause';
    }).catch(() => {});
  } else {
    vid.pause();
    if (overlay) overlay.style.opacity = '1';
    if (icon) icon.className = 'fa-solid fa-play';
  }

  if (!vid._timeTracked) {
    vid._timeTracked = true;
    vid.addEventListener('timeupdate', () => {
      if (timeEl && vid.duration) {
        const rem = Math.max(0, Math.floor(vid.duration - vid.currentTime));
        const m = String(Math.floor(rem / 60)).padStart(2, '0');
        const s = String(rem % 60).padStart(2, '0');
        timeEl.textContent = `${m}:${s}`;
      }
    });
    vid.addEventListener('ended', () => {
      if (overlay) overlay.style.opacity = '1';
      if (icon) icon.className = 'fa-solid fa-play';
    });
  }
};

// ─── Lightbox Media Viewer ───────────────────────────────────────────────────
window.openLightbox = (url, isVideo = false) => {
  const modal = document.getElementById('modal-lightbox');
  const img = document.getElementById('lightbox-image');
  const vid = document.getElementById('lightbox-video');
  const dl = document.getElementById('lightbox-download-btn');
  if (!modal) return;

  if (dl) dl.href = url;

  if (isVideo) {
    if (img) img.style.display = 'none';
    if (vid) {
      vid.style.display = 'block';
      vid.src = url;
      vid.play().catch(() => {});
    }
  } else {
    if (vid) {
      vid.pause();
      vid.style.display = 'none';
    }
    if (img) {
      img.style.display = 'block';
      img.src = url;
    }
  }
  modal.classList.add('active');
};

// ─── Context Menu ─────────────────────────────────────────────────────────────
function openMessageContextMenu(e, msg) {
  targetContextMessage = msg;
  const menu = document.getElementById('message-context-menu');
  if (!menu) return;
  menu.style.display = 'block';
  let x = Math.min(e.clientX, window.innerWidth - 190);
  let y = Math.min(e.clientY, window.innerHeight - 250);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const isMine = msg.senderId === currentUser?.uid;
  const editEl = document.getElementById('ctx-edit');
  const delAllEl = document.getElementById('ctx-delete-for-everyone');
  if (editEl) editEl.style.display = (isMine && (!msg.type || msg.type === 'text')) ? 'flex' : 'none';
  if (delAllEl) delAllEl.style.display = isMine ? 'flex' : 'none';
}

document.addEventListener('click', () => {
  const menu = document.getElementById('message-context-menu');
  if (menu) menu.style.display = 'none';
});

// ─── Context Menu Actions ─────────────────────────────────────────────────────
document.getElementById('ctx-reply')?.addEventListener('click', () => {
  if (!targetContextMessage) return;
  replyingMessage = targetContextMessage;
  const bar = document.getElementById('reply-preview-bar');
  const title = document.getElementById('reply-preview-title');
  const text = document.getElementById('reply-preview-text');
  if (bar) bar.style.display = 'flex';
  if (title) title.textContent = `${targetContextMessage.senderName || ''} ga javob`;
  if (text) text.textContent = targetContextMessage.text || targetContextMessage.type;
  messageTextInput?.focus();
});

document.getElementById('ctx-copy')?.addEventListener('click', () => {
  if (targetContextMessage?.text) navigator.clipboard.writeText(targetContextMessage.text).catch(() => {});
});

document.getElementById('ctx-forward')?.addEventListener('click', async () => {
  if (!targetContextMessage) return;
  const modal = document.getElementById('modal-forward');
  const container = document.getElementById('forward-chats-list');
  if (!modal || !container) return;
  container.innerHTML = '';
  modal.classList.add('active');

  try {
    const snap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid)));
    snap.forEach(docSnap => {
      const cData = docSnap.data();
      const item = document.createElement('div');
      item.className = 'user-select-item';
      item.innerHTML = `<div style="font-weight:600;">${escapeHTML(cData.groupName || 'Chat')}</div>`;
      item.addEventListener('click', async () => {
        await sendMessagePayload(docSnap.id, targetContextMessage.text, targetContextMessage.type, targetContextMessage.fileURL, null, {
          senderId: targetContextMessage.senderId,
          senderName: targetContextMessage.senderName
        });
        modal.classList.remove('active');
      });
      container.appendChild(item);
    });
  } catch (e) {}
});

document.getElementById('ctx-edit')?.addEventListener('click', () => {
  if (!targetContextMessage || !messageTextInput) return;
  editingMessageId = targetContextMessage.id;
  messageTextInput.value = targetContextMessage.text || '';
  messageTextInput.dispatchEvent(new Event('input'));
  const bar = document.getElementById('reply-preview-bar');
  const title = document.getElementById('reply-preview-title');
  const text = document.getElementById('reply-preview-text');
  if (bar) bar.style.display = 'flex';
  if (title) title.textContent = 'Xabarni tahrirlash';
  if (text) text.textContent = targetContextMessage.text || '';
  if (sendMsgBtn) sendMsgBtn.style.display = 'flex';
  if (micBtn) micBtn.style.display = 'none';
  messageTextInput.focus();
});

document.getElementById('ctx-delete-for-me')?.addEventListener('click', async () => {
  if (!targetContextMessage || !activeChatId) return;
  try {
    await updateDoc(doc(db, `chats/${activeChatId}/messages`, targetContextMessage.id), {
      deletedFor: arrayUnion(currentUser.uid)
    });
  } catch (e) {}
});

document.getElementById('ctx-delete-for-everyone')?.addEventListener('click', async () => {
  if (!targetContextMessage || !activeChatId) return;
  try {
    await deleteDoc(doc(db, `chats/${activeChatId}/messages`, targetContextMessage.id));
  } catch (e) {}
});

document.getElementById('btn-cancel-reply')?.addEventListener('click', () => {
  replyingMessage = null;
  editingMessageId = null;
  if (messageTextInput) messageTextInput.value = '';
  document.getElementById('reply-preview-bar')?.style && (document.getElementById('reply-preview-bar').style.display = 'none');
  if (sendMsgBtn) sendMsgBtn.style.display = 'none';
  if (micBtn) micBtn.style.display = 'flex';
});

// Quick reactions
document.querySelectorAll('.quick-reactions .emoji-item').forEach(span => {
  span.addEventListener('click', async (e) => {
    e.stopPropagation();
    const emoji = span.dataset.reaction;
    if (targetContextMessage && activeChatId) {
      await toggleReaction(targetContextMessage.id, emoji);
    }
  });
});

window.toggleReaction = async (msgId, emoji) => {
  if (!activeChatId || !currentUser) return;
  try {
    const msgRef = doc(db, `chats/${activeChatId}/messages`, msgId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) return;
    const currentUids = msgSnap.data().reactions?.[emoji] || [];
    if (currentUids.includes(currentUser.uid)) {
      await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayUnion(currentUser.uid) });
    }
  } catch (e) {}
};

// ─── Send Message ─────────────────────────────────────────────────────────────
export async function sendMessagePayload(chatId, text, type = 'text', fileURL = null, fileDetails = null, forwardFrom = null) {
  await authReady;
  if (!chatId || !currentUser) return;

  const chatRef = doc(db, 'chats', chatId);

  // Edit mode
  if (editingMessageId) {
    try {
      await updateDoc(doc(db, `chats/${chatId}/messages`, editingMessageId), {
        text: text, isEdited: true
      });
    } catch (e) {}
    editingMessageId = null;
    document.getElementById('reply-preview-bar')?.style && (document.getElementById('reply-preview-bar').style.display = 'none');
    return;
  }

  const msgData = {
    chatId,
    senderId: currentUser.uid,
    senderName: userDocData?.displayName || currentUser.displayName || 'Foydalanuvchi',
    text: text || '',
    type,
    fileURL: fileURL || null,
    fileName: fileDetails?.name || null,
    fileSize: fileDetails?.size || null,
    reactions: {},
    seenBy: [currentUser.uid],
    deletedFor: [],
    isEdited: false,
    createdAt: serverTimestamp()
  };

  if (replyingMessage) {
    msgData.replyTo = {
      id: replyingMessage.id,
      text: replyingMessage.text || replyingMessage.type,
      senderName: replyingMessage.senderName
    };
    replyingMessage = null;
    document.getElementById('reply-preview-bar')?.style && (document.getElementById('reply-preview-bar').style.display = 'none');
  }

  if (forwardFrom) msgData.forwardFrom = forwardFrom;

  try {
    await addDoc(collection(db, `chats/${chatId}/messages`), msgData);

    // Update chat meta + unread
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const cData = chatSnap.data();
      const updatePayload = {
        updatedAt: serverTimestamp(),
        lastMessage: {
          text: type === 'text' ? (text || '') : `[${type}]`,
          senderId: currentUser.uid,
          createdAt: new Date(),
          type
        }
      };
      (cData.participants || []).forEach(uid => {
        if (uid !== currentUser.uid) {
          updatePayload[`unreadCount.${uid}`] = (cData.unreadCount?.[uid] || 0) + 1;
        }
      });
      await updateDoc(chatRef, updatePayload);
    }
    playNotificationSound('outgoing');
  } catch (e) {
    console.error('Message send error:', e);
  }
}

// ─── Input Handler ────────────────────────────────────────────────────────────
const roundVideoBtn = document.getElementById('btn-round-video');

if (messageTextInput) {
  messageTextInput.addEventListener('input', () => {
    const val = messageTextInput.value.trim();
    if (val.length > 0) {
      if (sendMsgBtn) sendMsgBtn.style.display = 'flex';
      if (micBtn) micBtn.style.display = 'none';
      if (roundVideoBtn) roundVideoBtn.style.display = 'none';
    } else if (!editingMessageId) {
      if (sendMsgBtn) sendMsgBtn.style.display = 'none';
      if (micBtn) micBtn.style.display = 'flex';
      if (roundVideoBtn) roundVideoBtn.style.display = 'flex';
    }

    if (activeChatId && currentUser) {
      updateDoc(doc(db, 'chats', activeChatId), { [`typing.${currentUser.uid}`]: true }).catch(() => {});
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        updateDoc(doc(db, 'chats', activeChatId), { [`typing.${currentUser.uid}`]: false }).catch(() => {});
      }, 2500);
    }
  });

  messageTextInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = messageTextInput.value.trim();
      if (text && activeChatId) {
        await sendMessagePayload(activeChatId, text, 'text');
        messageTextInput.value = '';
        if (sendMsgBtn) sendMsgBtn.style.display = 'none';
        if (micBtn) micBtn.style.display = 'flex';
        if (roundVideoBtn) roundVideoBtn.style.display = 'flex';
      }
    }
  });
}

sendMsgBtn?.addEventListener('click', async () => {
  const text = messageTextInput?.value.trim();
  if (text && activeChatId) {
    await sendMessagePayload(activeChatId, text, 'text');
    if (messageTextInput) messageTextInput.value = '';
    if (sendMsgBtn) sendMsgBtn.style.display = 'none';
    if (micBtn) micBtn.style.display = 'flex';
    if (roundVideoBtn) roundVideoBtn.style.display = 'flex';
  }
});

// ─── File Upload (Images, Videos, Voice, Krujochek, Docs) ──────────────────────
export async function handleFileUpload(file, type) {
  if (!activeChatId || !file || !currentUser) return;

  let uploadFile = file;

  // Fast client-side image compression for chat images
  if (type === 'image' && file.size > 200 * 1024) {
    try {
      const compressed = await compressImage(file, 1280, 1280, 0.82);
      if (compressed?.file) uploadFile = compressed.file;
    } catch (e) {}
  }

  const progressContainer = document.getElementById('upload-progress-container');
  const progressFill = document.getElementById('upload-progress-fill');
  if (progressContainer) progressContainer.style.display = 'block';
  if (progressFill) progressFill.style.width = '0%';

  const fileRef = ref(storage, `chat_files/${activeChatId}/${Date.now()}_${uploadFile.name}`);
  const uploadTask = uploadBytesResumable(fileRef, uploadFile);

  uploadTask.on('state_changed',
    (snap) => {
      const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
      if (progressFill) progressFill.style.width = `${pct}%`;
    },
    (err) => {
      alert("Fayl yuklashda xatolik: " + err.message);
      if (progressContainer) progressContainer.style.display = 'none';
    },
    async () => {
      const url = await getDownloadURL(uploadTask.ref);
      const label = type === 'round_video' ? 'Dumaloq video' : uploadFile.name;
      await sendMessagePayload(activeChatId, label, type, url, { name: uploadFile.name, size: uploadFile.size });
      if (progressContainer) progressContainer.style.display = 'none';
    }
  );
}

// ─── Drag & Drop Support ──────────────────────────────────────────────────────
if (messagesContainer) {
  messagesContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    messagesContainer.classList.add('drag-over');
  });

  messagesContainer.addEventListener('dragleave', () => {
    messagesContainer.classList.remove('drag-over');
  });

  messagesContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    messagesContainer.classList.remove('drag-over');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      let fileType = 'document';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';
      handleFileUpload(file, fileType);
    }
  });
}

// ─── Scroll to Bottom Button ──────────────────────────────────────────────────
const scrollBottomBtn = document.getElementById('btn-scroll-bottom');
if (messagesContainer && scrollBottomBtn) {
  messagesContainer.addEventListener('scroll', () => {
    const isUp = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight > 180;
    scrollBottomBtn.style.display = isUp ? 'flex' : 'none';
  });

  scrollBottomBtn.addEventListener('click', () => {
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
