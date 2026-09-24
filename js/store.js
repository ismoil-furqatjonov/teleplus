// TelePulse - Resilient Data Store & Mock Sync Manager
// Provides instant offline/demo storage and seamless Firebase integration

const STORE_KEY_USERS = 'telepulse_users_db_v2';
const STORE_KEY_CHATS = 'telepulse_chats_db_v2';
const STORE_KEY_MESSAGES = 'telepulse_messages_db_v2';
const STORE_KEY_STORIES = 'telepulse_stories_db_v2';
const STORE_KEY_CURRENT_USER = 'telepulse_current_user_v2';

// ─── Default Demo Data ────────────────────────────────────────────────────────
const DEFAULT_DEMO_USERS = [
  {
    uid: 'demo_user_1',
    displayName: 'Alisher Navoiy',
    username: 'navoiy',
    email: 'navoiy@telepulse.app',
    photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Navoiy',
    bio: 'Shoir, mutafakkir va davlat arbobi.',
    online: true,
    lastSeen: Date.now(),
    joinedDate: '2025-01-10',
    theme: 'dark'
  },
  {
    uid: 'demo_user_2',
    displayName: 'Dilnoza Rahimova',
    username: 'dilnoza_r',
    email: 'dilnoza@telepulse.app',
    photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Dilnoza',
    bio: 'UI/UX Dizayner & TelePulse ishqibozi ✨',
    online: true,
    lastSeen: Date.now(),
    joinedDate: '2025-02-14',
    theme: 'dark'
  },
  {
    uid: 'demo_user_3',
    displayName: 'Jamshidbek IT',
    username: 'jamshid_dev',
    email: 'jamshid@telepulse.app',
    photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Jamshid',
    bio: 'Full-stack Web & Mobile Developer 🚀',
    online: false,
    lastSeen: Date.now() - 3600000,
    joinedDate: '2025-03-01',
    theme: 'dark'
  }
];

const DEFAULT_DEMO_CHATS = [
  {
    id: 'chat_group_1',
    type: 'group',
    groupName: 'Dasturchilar Hamjamiyati 💻',
    groupAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=Devs',
    groupDescription: 'O\'zbekiston dasturchilarining rasmiy muloqot guruhi. JavaScript, Python, Web va Mobile texnologiyalar.',
    ownerId: 'demo_user_3',
    admins: ['demo_user_3', 'demo_user_1'],
    participants: ['demo_user_1', 'demo_user_2', 'demo_user_3'],
    unreadCount: {},
    typing: {},
    pinnedMessageId: 'msg_3',
    updatedAt: Date.now(),
    lastMessage: {
      text: 'Barchaga salom! TelePulse zamonaviy versiyasi tayyor bo‘ldi!',
      senderId: 'demo_user_3',
      createdAt: Date.now() - 60000,
      type: 'text'
    }
  },
  {
    id: 'chat_private_1',
    type: 'private',
    participants: ['demo_user_1'],
    unreadCount: {},
    typing: {},
    updatedAt: Date.now() - 120000,
    lastMessage: {
      text: 'Salom! TelePulse platformasiga xush kelibsiz!',
      senderId: 'demo_user_1',
      createdAt: Date.now() - 120000,
      type: 'text'
    }
  }
];

const DEFAULT_DEMO_MESSAGES = {
  'chat_group_1': [
    {
      id: 'msg_1',
      chatId: 'chat_group_1',
      senderId: 'demo_user_1',
      senderName: 'Alisher Navoiy',
      text: 'Assalomu alaykum va rahmatullohi va barakatuh! Barcha do‘stlarga salom!',
      type: 'text',
      seenBy: ['demo_user_1', 'demo_user_2', 'demo_user_3'],
      reactions: { '❤️': ['demo_user_2'] },
      createdAt: Date.now() - 3600000
    },
    {
      id: 'msg_2',
      chatId: 'chat_group_1',
      senderId: 'demo_user_2',
      senderName: 'Dilnoza Rahimova',
      text: 'Vaalaykum assalom! TelePulse me’morchiligi va dizayni juda zamonaviy chiqibdi! 🔥',
      type: 'text',
      seenBy: ['demo_user_1', 'demo_user_2', 'demo_user_3'],
      reactions: { '🔥': ['demo_user_1', 'demo_user_3'] },
      createdAt: Date.now() - 1800000
    },
    {
      id: 'msg_3',
      chatId: 'chat_group_1',
      senderId: 'demo_user_3',
      senderName: 'Jamshidbek IT',
      text: 'Barchaga salom! TelePulse zamonaviy versiyasi tayyor bo‘ldi!',
      type: 'text',
      seenBy: ['demo_user_1', 'demo_user_2', 'demo_user_3'],
      reactions: { '👍': ['demo_user_1'] },
      createdAt: Date.now() - 60000
    }
  ],
  'chat_private_1': [
    {
      id: 'msg_p1',
      chatId: 'chat_private_1',
      senderId: 'demo_user_1',
      senderName: 'Alisher Navoiy',
      text: 'Salom! TelePulse platformasiga xush kelibsiz! Har qanday savollaringiz bo‘lsa bemalol yozing.',
      type: 'text',
      seenBy: ['demo_user_1'],
      reactions: {},
      createdAt: Date.now() - 120000
    }
  ]
};

const DEFAULT_DEMO_STORIES = [
  {
    id: 'story_1',
    userId: 'demo_user_2',
    userName: 'Dilnoza Rahimova',
    userAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Dilnoza',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    caption: 'TelePulse 2.0 yangi shisha dizayni va Stories funksiyasi! ✨',
    createdAt: Date.now() - 3600000,
    viewers: []
  },
  {
    id: 'story_2',
    userId: 'demo_user_1',
    userName: 'Alisher Navoiy',
    userAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Navoiy',
    mediaUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80',
    caption: 'Tunning go‘zalligi va ijodiy ruh 🌌',
    createdAt: Date.now() - 7200000,
    viewers: []
  }
];

// ─── LocalStorage Helper Methods ──────────────────────────────────────────────
export function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveToStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

// ─── Initializer ──────────────────────────────────────────────────────────────
export function initStore() {
  if (!localStorage.getItem(STORE_KEY_USERS)) {
    saveToStorage(STORE_KEY_USERS, DEFAULT_DEMO_USERS);
  }
  if (!localStorage.getItem(STORE_KEY_CHATS)) {
    saveToStorage(STORE_KEY_CHATS, DEFAULT_DEMO_CHATS);
  }
  if (!localStorage.getItem(STORE_KEY_MESSAGES)) {
    saveToStorage(STORE_KEY_MESSAGES, DEFAULT_DEMO_MESSAGES);
  }
  if (!localStorage.getItem(STORE_KEY_STORIES)) {
    saveToStorage(STORE_KEY_STORIES, DEFAULT_DEMO_STORIES);
  }
}

initStore();

export function getLocalUsers() {
  return loadFromStorage(STORE_KEY_USERS, DEFAULT_DEMO_USERS);
}

export function saveLocalUsers(users) {
  saveToStorage(STORE_KEY_USERS, users);
}

export function getLocalChats() {
  return loadFromStorage(STORE_KEY_CHATS, DEFAULT_DEMO_CHATS);
}

export function saveLocalChats(chats) {
  saveToStorage(STORE_KEY_CHATS, chats);
}

export function getLocalMessages(chatId) {
  const all = loadFromStorage(STORE_KEY_MESSAGES, DEFAULT_DEMO_MESSAGES);
  return all[chatId] || [];
}

export function saveLocalMessages(chatId, messages) {
  const all = loadFromStorage(STORE_KEY_MESSAGES, DEFAULT_DEMO_MESSAGES);
  all[chatId] = messages;
  saveToStorage(STORE_KEY_MESSAGES, all);
}

export function getLocalStories() {
  return loadFromStorage(STORE_KEY_STORIES, DEFAULT_DEMO_STORIES);
}

export function saveLocalStories(stories) {
  saveToStorage(STORE_KEY_STORIES, stories);
}

export function getStoredCurrentUser() {
  return loadFromStorage(STORE_KEY_CURRENT_USER, null);
}

export function saveStoredCurrentUser(user) {
  saveToStorage(STORE_KEY_CURRENT_USER, user);
}
