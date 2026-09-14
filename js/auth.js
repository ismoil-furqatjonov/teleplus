// TelePulse - Auth & User Session Management
import {
  auth,
  db,
  storage,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from './firebase.js';

// Auth state exported as a Promise — boshqa modullar auth tayyor bo'lguncha kutadi
let _resolveAuthReady;
export const authReady = new Promise(resolve => { _resolveAuthReady = resolve; });

export let currentUser = null;
export let userDocData = null;

// Instant avatar cache recovery before waiting for Firebase
try {
  const cachedAvatar = localStorage.getItem('telepulse_cached_avatar');
  const myAvatar = document.getElementById('my-avatar');
  if (cachedAvatar && myAvatar) {
    myAvatar.src = cachedAvatar;
  }
} catch (e) {}

// ─── Auth State Observer ────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const currentPath = window.location.pathname;
  const isAuthPage = currentPath.includes('login.html') || currentPath.includes('register.html');

  if (user) {
    currentUser = user;

    // Firestore user doc ni yukla
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      userDocData = userSnap.data();
      if (userDocData.photoURL) {
        try {
          localStorage.setItem('telepulse_cached_avatar', userDocData.photoURL);
          localStorage.setItem(`telepulse_cached_avatar_${user.uid}`, userDocData.photoURL);
        } catch (e) {}
      }
      // Online qil
      await updateDoc(userRef, { online: true, lastSeen: serverTimestamp() });
    } else {
      // user doc yo'q — auth page ga qaytarish
      if (!isAuthPage) {
        window.location.href = 'login.html';
        return;
      }
    }

    // Auth tayyor signal
    _resolveAuthReady({ user: currentUser, userData: userDocData });

    if (isAuthPage) {
      window.location.href = 'index.html';
    } else {
      // App init
      if (window.onTelePulseAuthReady) {
        window.onTelePulseAuthReady(currentUser, userDocData);
      }
    }
  } else {
    currentUser = null;
    userDocData = null;
    _resolveAuthReady(null);

    if (!isAuthPage) {
      window.location.href = 'login.html';
    }
  }
});

// Online/Offline holat
window.addEventListener('beforeunload', () => {
  if (currentUser) {
    navigator.sendBeacon('/noop'); // wake keepalive
    const userRef = doc(db, 'users', currentUser.uid);
    updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  }
});

document.addEventListener('visibilitychange', async () => {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  try {
    await updateDoc(userRef, {
      online: !document.hidden,
      lastSeen: serverTimestamp()
    });
  } catch (e) {}
});

// ─── Register ───────────────────────────────────────────────────────────────
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');

  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => { avatarPreview.src = evt.target.result; };
        reader.readAsDataURL(file);
      }
    });
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    const errorAlert = document.getElementById('error-alert');
    errorAlert.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yaratilmoqda...';

    const displayName = document.getElementById('reg-display-name').value.trim();
    const usernameRaw = document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const bio = document.getElementById('reg-bio').value.trim() || "Salom, men TelePulse foydalanuvchisiman!";
    const avatarFile = avatarInput ? avatarInput.files[0] : null;

    try {
      if (usernameRaw.length < 3) throw new Error("Username kamida 3 ta belgi bo'lishi kerak!");

      // Unique username tekshirish
      const q = query(collection(db, 'users'), where('username', '==', usernameRaw));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) throw new Error(`@${usernameRaw} username allaqachon band!`);

      // Auth user yaratish
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Avatar yuklash
      let photoURL = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;
      if (avatarFile) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        const snap = await uploadBytesResumable(storageRef, avatarFile);
        photoURL = await getDownloadURL(snap.ref);
      }

      await updateProfile(user, { displayName, photoURL });

      // Firestore user doc saqlash
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        username: usernameRaw,
        displayName,
        email,
        photoURL,
        bio,
        online: true,
        lastSeen: serverTimestamp(),
        theme: 'dark',
        pinnedChats: [],
        createdAt: serverTimestamp()
      });

      window.location.href = 'index.html';
    } catch (err) {
      let msg = err.message || "Xatolik yuz berdi.";
      if (msg.includes('email-already-in-use')) msg = "Bu email allaqachon ro'yxatdan o'tgan!";
      if (msg.includes('weak-password')) msg = "Parol kamida 6 ta belgi bo'lishi kerak!";
      errorAlert.textContent = msg;
      errorAlert.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = "<i class='fa-solid fa-user-plus'></i> Ro'yxatdan O'tish";
    }
  });
}

// ─── Login ───────────────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    const errorAlert = document.getElementById('error-alert');
    errorAlert.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kirilmoqda...';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'index.html';
    } catch (err) {
      errorAlert.textContent = "Email yoki parol noto'g'ri!";
      errorAlert.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = "<i class='fa-solid fa-right-to-bracket'></i> Tizimga Kirish";
    }
  });
}

// ─── Logout ──────────────────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (!confirm("Tizimdan chiqmoqchimisiz?")) return;
    try {
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          online: false,
          lastSeen: serverTimestamp()
        });
      }
      await signOut(auth);
    } catch (e) {}
    window.location.href = 'login.html';
  });
}

// ─── Login page QR Code ───────────────────────────────────────────────────────
const showLoginQrBtn = document.getElementById('btn-show-login-qr');
if (showLoginQrBtn) {
  showLoginQrBtn.addEventListener('click', () => {
    const box = document.getElementById('login-qr-box');
    const qrImg = document.getElementById('login-qr-img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.href)}`;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
}
