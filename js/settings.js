// TelePulse - Multi-Tab Settings & Privacy Module
import { currentUser, userDocData } from './auth.js';
import { initTheme } from './profile.js';

export function initSettingsModule() {
  const modal = document.getElementById('modal-settings');
  const openBtn = document.getElementById('btn-open-settings');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      populateSettingsValues();
      if (modal) modal.classList.add('active');
    });
  }

  // Tab switching inside Settings modal
  document.querySelectorAll('.settings-tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-item').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-section-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.section;
      const targetPanel = document.getElementById(`settings-sec-${targetId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Appearance Theme Selectors
  document.querySelectorAll('.theme-option-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-option-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const chosenTheme = card.dataset.theme;
      initTheme(chosenTheme);
      if (window.showToast) window.showToast(`Mavzu ${chosenTheme === 'dark' ? 'Tungi (Dark)' : 'Kungi (Light)'} rejimga o'tkazildi`, 'info');
    });
  });

  // Sound Notification Toggle Listener
  const soundToggle = document.getElementById('setting-sound-toggle');
  if (soundToggle) {
    soundToggle.addEventListener('change', (e) => {
      localStorage.setItem('telepulse_sound_enabled', e.target.checked ? 'true' : 'false');
      if (window.showToast) window.showToast(`Ovozli bildirishnomalar ${e.target.checked ? 'yoqildi' : 'o\'chirildi'}`, 'info');
    });
  }
}

function populateSettingsValues() {
  if (userDocData || currentUser) {
    const nameEl = document.getElementById('setting-profile-name');
    const unameEl = document.getElementById('setting-profile-username');
    const emailEl = document.getElementById('setting-profile-email');
    const avatarEl = document.getElementById('setting-profile-avatar');

    if (nameEl) nameEl.textContent = userDocData?.displayName || currentUser?.displayName || 'Foydalanuvchi';
    if (unameEl) unameEl.textContent = `@${userDocData?.username || currentUser?.email?.split('@')[0] || 'user'}`;
    if (emailEl) emailEl.textContent = currentUser?.email || 'email@telepulse.app';
    if (avatarEl) avatarEl.src = userDocData?.photoURL || currentUser?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=Me';
  }

  const soundToggle = document.getElementById('setting-sound-toggle');
  if (soundToggle) {
    soundToggle.checked = localStorage.getItem('telepulse_sound_enabled') !== 'false';
  }
}

// 2FA Security Demo Action
export function toggle2FADemo() {
  const statusEl = document.getElementById('2fa-status-text');
  const btn = document.getElementById('btn-toggle-2fa');
  if (!statusEl || !btn) return;

  const isActive = btn.dataset.active === 'true';
  if (isActive) {
    btn.dataset.active = 'false';
    btn.textContent = 'Yoqish';
    btn.className = 'btn-primary';
    statusEl.textContent = 'O\'chirilgan';
    statusEl.style.color = 'var(--text-muted)';
    if (window.showToast) window.showToast("2-bosqichli tasdiqlash o'chirildi", "warning");
  } else {
    btn.dataset.active = 'true';
    btn.textContent = 'O\'chirish';
    btn.className = 'btn-secondary';
    statusEl.textContent = 'Faol (SMS / Telegram Auth Code)';
    statusEl.style.color = 'var(--success-color)';
    if (window.showToast) window.showToast("2-bosqichli tasdiqlash faollashtirildi! 🔒", "success");
  }
}

window.toggle2FADemo = toggle2FADemo;
