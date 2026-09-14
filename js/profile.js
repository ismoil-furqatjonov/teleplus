// TelePulse - User Profile & Settings Module
import {
  db,
  storage,
  doc,
  updateDoc,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  arrayUnion,
  arrayRemove
} from './firebase.js';
import { currentUser, userDocData } from './auth.js';

// Init theme from localStorage or user data
export function initTheme(themePreference) {
  const html = document.documentElement;
  const theme = themePreference || localStorage.getItem('telepulse_theme') || 'dark';
  html.setAttribute('data-theme', theme);
  localStorage.setItem('telepulse_theme', theme);

  const themeBtnIcon = document.querySelector('#theme-toggle-btn i');
  if (themeBtnIcon) {
    themeBtnIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

// Toggle Theme Handler
const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', async () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('telepulse_theme', newTheme);
    
    const themeBtnIcon = themeToggleBtn.querySelector('i');
    themeBtnIcon.className = newTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

    if (currentUser) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        theme: newTheme
      });
    }
  });
}

// Open Edit Profile Modal
const profileSummaryBtn = document.getElementById('current-user-profile-btn');
if (profileSummaryBtn) {
  profileSummaryBtn.addEventListener('click', () => {
    const modal = document.getElementById('modal-edit-profile');
    if (modal && userDocData) {
      document.getElementById('edit-display-name-input').value = userDocData.displayName || '';
      document.getElementById('edit-bio-input').value = userDocData.bio || '';
      document.getElementById('edit-profile-avatar-preview').src = userDocData.photoURL || '';
      modal.classList.add('active');
    }
  });
}

// Instant client-side image compression & optimization
export function compressImage(file, maxWidth = 320, maxHeight = 320, quality = 0.85) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve({ file, dataUrl: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
              type: 'image/webp',
              lastModified: Date.now()
            });
            const dataUrl = canvas.toDataURL('image/webp', quality);
            resolve({ file: compressedFile, dataUrl });
          } else {
            resolve({ file, dataUrl: e.target.result });
          }
        }, 'image/webp', quality);
      };
      img.onerror = () => resolve({ file, dataUrl: e.target.result });
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ file, dataUrl: null });
    reader.readAsDataURL(file);
  });
}

let pendingCompressedAvatar = null;

// Preview avatar on edit profile modal with instant compression
const editAvatarInput = document.getElementById('edit-profile-avatar-input');
if (editAvatarInput) {
  editAvatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const preview = document.getElementById('edit-profile-avatar-preview');
      if (preview) preview.style.opacity = '0.5';
      const result = await compressImage(file, 300, 300, 0.85);
      pendingCompressedAvatar = result;
      if (preview) {
        preview.src = result.dataUrl;
        preview.style.opacity = '1';
      }
    }
  });
}

// Save Profile Handler with instant local cache and fast upload
const saveProfileBtn = document.getElementById('btn-save-profile');
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    if (!currentUser) return;

    saveProfileBtn.disabled = true;
    saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda...';

    const newDisplayName = document.getElementById('edit-display-name-input').value.trim();
    const newBio = document.getElementById('edit-bio-input').value.trim();

    try {
      let photoURL = userDocData.photoURL;

      if (pendingCompressedAvatar) {
        // Instant optimistic cache in localStorage
        try {
          localStorage.setItem('telepulse_cached_avatar', pendingCompressedAvatar.dataUrl);
          localStorage.setItem(`telepulse_cached_avatar_${currentUser.uid}`, pendingCompressedAvatar.dataUrl);
        } catch (e) {}

        // Instant UI update
        const myAvatar = document.getElementById('my-avatar');
        if (myAvatar) myAvatar.src = pendingCompressedAvatar.dataUrl;

        // Ultra fast upload: ~25KB file instead of 5MB!
        const storageRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}.webp`);
        const uploadTask = await uploadBytesResumable(storageRef, pendingCompressedAvatar.file);
        photoURL = await getDownloadURL(uploadTask.ref);
      }

      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: newDisplayName,
        bio: newBio,
        photoURL: photoURL
      });

      // Update UI elements
      document.getElementById('my-display-name').textContent = newDisplayName;
      document.getElementById('my-avatar').src = photoURL;
      pendingCompressedAvatar = null;
      
      document.getElementById('modal-edit-profile').classList.remove('active');
    } catch (err) {
      alert("Profilni saqlashda xatolik: " + err.message);
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Saqlash';
    }
  });
}

// Pin / Unpin Chat Helper
export async function togglePinChat(chatId, isPinned) {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  if (isPinned) {
    await updateDoc(userRef, {
      pinnedChats: arrayRemove(chatId)
    });
  } else {
    await updateDoc(userRef, {
      pinnedChats: arrayUnion(chatId)
    });
  }
}
