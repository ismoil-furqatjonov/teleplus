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

import {
  getLocalUsers,
  saveLocalUsers,
  getStoredCurrentUser,
  saveStoredCurrentUser
} from './store.js';

let _resolveAuthReady;
export const authReady = new Promise(resolve => { _resolveAuthReady = resolve; });

export let currentUser = null;
export let userDocData = null;

// Recover cached user session instantly
try {
  const cachedUser = getStoredCurrentUser();
  if (cachedUser) {
    currentUser = { uid: cachedUser.uid, displayName: cachedUser.displayName, email: cachedUser.email, photoURL: cachedUser.photoURL };
    userDocData = cachedUser;
  }
} catch (e) {}

// ─── Firebase Auth Observer with Local Fallback ──────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const currentPath = window.location.pathname;
  const isAuthPage = currentPath.includes('login.html') || currentPath.includes('register.html');

  if (user) {
    currentUser = user;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        userDocData = userSnap.data();
        saveStoredCurrentUser(userDocData);
        await updateDoc(userRef, { online: true, lastSeen: serverTimestamp() }).catch(() => {});
      } else {
        // Fallback or legacy user doc creation
        userDocData = {
          uid: user.uid,
          username: user.email ? user.email.split('@')[0] : 'user',
          displayName: user.displayName || 'Foydalanuvchi',
          email: user.email,
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
          bio: 'Salom, men TelePulse foydalanuvchisiman!',
          online: true,
          lastSeen: Date.now(),
          joinedDate: new Date().toISOString().split('T')[0]
        };
        saveStoredCurrentUser(userDocData);
      }
    } catch (e) {
      // Firebase unreachable: load from stored demo user
      if (!userDocData) {
        const localUsers = getLocalUsers();
        userDocData = localUsers.find(u => u.email === user.email) || localUsers[0];
        saveStoredCurrentUser(userDocData);
      }
    }

    _resolveAuthReady({ user: currentUser, userData: userDocData });

    if (isAuthPage) {
      window.location.href = 'index.html';
    } else {
      if (window.onTelePulseAuthReady) {
        window.onTelePulseAuthReady(currentUser, userDocData);
      }
    }
  } else {
    // Check if offline/demo session exists in localStorage
    const storedUser = getStoredCurrentUser();
    if (storedUser) {
      currentUser = { uid: storedUser.uid, displayName: storedUser.displayName, email: storedUser.email, photoURL: storedUser.photoURL };
      userDocData = storedUser;
      _resolveAuthReady({ user: currentUser, userData: userDocData });

      if (isAuthPage) {
        window.location.href = 'index.html';
      } else {
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
  }
});

// ─── Register Form ────────────────────────────────────────────────────────────
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');

  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && avatarPreview) {
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
    if (errorAlert) errorAlert.style.display = 'none';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yaratilmoqda...';

    const displayName = document.getElementById('reg-display-name').value.trim();
    const usernameRaw = document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password')?.value;
    const bio = document.getElementById('reg-bio').value.trim() || "Salom, men TelePulse foydalanuvchisiman!";
    const avatarFile = avatarInput ? avatarInput.files[0] : null;

    try {
      if (usernameRaw.length < 3) throw new Error("Username kamida 3 ta belgi bo'lishi kerak!");
      if (password !== confirmPassword) throw new Error("Kiritilgan parollar bir-biriga mos kelmadi!");

      let photoURL = avatarPreview ? avatarPreview.src : `https://api.dicebear.com/7.x/bottts/svg?seed=${Date.now()}`;

      // Try Firebase signup first
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (avatarFile) {
          try {
            const storageRef = ref(storage, `avatars/${user.uid}`);
            const snap = await uploadBytesResumable(storageRef, avatarFile);
            photoURL = await getDownloadURL(snap.ref);
          } catch (e) {}
        }

        await updateProfile(user, { displayName, photoURL }).catch(() => {});

        const uDoc = {
          uid: user.uid,
          username: usernameRaw,
          displayName,
          email,
          photoURL,
          bio,
          online: true,
          lastSeen: serverTimestamp(),
          joinedDate: new Date().toISOString().split('T')[0],
          theme: 'dark',
          pinnedChats: []
        };

        await setDoc(doc(db, 'users', user.uid), uDoc).catch(() => {});
        saveStoredCurrentUser(uDoc);

      } catch (fbErr) {
        // Fallback to local demo signup if offline or firebase fails
        const mockUid = `user_local_${Date.now()}`;
        const uDoc = {
          uid: mockUid,
          username: usernameRaw,
          displayName,
          email,
          photoURL,
          bio,
          online: true,
          lastSeen: Date.now(),
          joinedDate: new Date().toISOString().split('T')[0],
          theme: 'dark',
          pinnedChats: []
        };
        const localUsers = getLocalUsers();
        localUsers.push(uDoc);
        saveLocalUsers(localUsers);
        saveStoredCurrentUser(uDoc);
      }

      window.location.href = 'index.html';
    } catch (err) {
      let msg = err.message || "Xatolik yuz berdi.";
      if (msg.includes('email-already-in-use')) msg = "Bu email allaqachon ro'yxatdan o'tgan!";
      if (msg.includes('weak-password')) msg = "Parol kamida 6 ta belgi bo'lishi kerak!";
      if (errorAlert) {
        errorAlert.textContent = msg;
        errorAlert.style.display = 'block';
      }
      btn.disabled = false;
      btn.innerHTML = "<i class='fa-solid fa-user-plus'></i> Ro'yxatdan O'tish";
    }
  });
}

// ─── Login Form ───────────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  // Password view toggle
  const togglePassBtn = document.getElementById('toggle-login-password');
  const passInput = document.getElementById('login-password');
  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', () => {
      const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passInput.setAttribute('type', type);
      togglePassBtn.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });
  }

  // Demo Login Button
  const demoLoginBtn = document.getElementById('btn-demo-login');
  if (demoLoginBtn) {
    demoLoginBtn.addEventListener('click', () => {
      const localUsers = getLocalUsers();
      const demoUser = localUsers[0];
      saveStoredCurrentUser(demoUser);
      window.location.href = 'index.html';
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    const errorAlert = document.getElementById('error-alert');
    if (errorAlert) errorAlert.style.display = 'none';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kirilmoqda...';

    const loginInput = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      let emailToAuth = loginInput;
      if (!loginInput.includes('@')) {
        // Look up email by username in local/firebase
        const localUsers = getLocalUsers();
        const found = localUsers.find(u => u.username.toLowerCase() === loginInput.toLowerCase());
        if (found) emailToAuth = found.email;
        else emailToAuth = `${loginInput.toLowerCase()}@telepulse.app`;
      }

      try {
        await signInWithEmailAndPassword(auth, emailToAuth, password);
      } catch (fbErr) {
        // Fallback match with local users database
        const localUsers = getLocalUsers();
        const matched = localUsers.find(u => u.email.toLowerCase() === emailToAuth.toLowerCase() || u.username.toLowerCase() === loginInput.toLowerCase());
        if (matched) {
          saveStoredCurrentUser(matched);
        } else {
          // If totally empty, login with demo user
          saveStoredCurrentUser(localUsers[0]);
        }
      }

      window.location.href = 'index.html';
    } catch (err) {
      if (errorAlert) {
        errorAlert.textContent = "Email/Username yoki parol noto'g'ri!";
        errorAlert.style.display = 'block';
      }
      btn.disabled = false;
      btn.innerHTML = "<i class='fa-solid fa-right-to-bracket'></i> Tizimga Kirish";
    }
  });
}

// ─── Logout Confirmation Dialog ───────────────────────────────────────────────
export function confirmLogout() {
  const modal = document.getElementById('modal-logout-confirm');
  if (modal) {
    modal.classList.add('active');
  } else {
    if (confirm("TelePulse tizimidan chiqishni tasdiqlaysizmi?")) {
      executeLogout();
    }
  }
}

export async function executeLogout() {
  try {
    if (currentUser && currentUser.uid) {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    }
    await signOut(auth).catch(() => {});
  } catch (e) {}
  localStorage.removeItem('telepulse_current_user_v2');
  window.location.href = 'login.html';
}

window.confirmLogout = confirmLogout;
window.executeLogout = executeLogout;

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', confirmLogout);
}

// QR Code Login Modal
const showLoginQrBtn = document.getElementById('btn-show-login-qr');
if (showLoginQrBtn) {
  showLoginQrBtn.addEventListener('click', () => {
    const box = document.getElementById('login-qr-box');
    const qrImg = document.getElementById('login-qr-img');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.href)}`;
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
}
