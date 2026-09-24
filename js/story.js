// TelePulse - 24-Hour Stories Management Module
import { getLocalStories, saveLocalStories } from './store.js';
import { authReady, currentUser, userDocData } from './auth.js';

let activeStoryIndex = 0;
let currentStoriesList = [];
let storyTimer = null;

export function initStoriesBar() {
  const container = document.getElementById('stories-container');
  if (!container) return;

  const stories = getLocalStories();
  const now = Date.now();
  // 24h filter (86,400,000 ms)
  currentStoriesList = stories.filter(s => (now - s.createdAt) < 86400000);

  container.innerHTML = '';

  // 1. "Add Story" item for current user
  const myAvatar = userDocData?.photoURL || currentUser?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=Me';
  const addStoryEl = document.createElement('div');
  addStoryEl.className = 'story-item add-story';
  addStoryEl.title = 'Yangi Story qo\'shish';
  addStoryEl.innerHTML = `
    <div class="story-avatar-wrapper add">
      <img src="${myAvatar}" alt="My avatar" class="story-avatar">
      <div class="story-add-badge"><i class="fa-solid fa-plus"></i></div>
    </div>
    <span class="story-name">Sizniki</span>
  `;
  addStoryEl.addEventListener('click', () => {
    const modal = document.getElementById('modal-create-story');
    if (modal) modal.classList.add('active');
  });
  container.appendChild(addStoryEl);

  // 2. Render friends' stories
  currentStoriesList.forEach((story, idx) => {
    const isViewed = (story.viewers || []).includes(currentUser?.uid);
    const storyEl = document.createElement('div');
    storyEl.className = `story-item ${isViewed ? 'viewed' : 'unviewed'}`;
    storyEl.title = story.userName;
    storyEl.innerHTML = `
      <div class="story-avatar-wrapper">
        <img src="${story.userAvatar}" alt="${story.userName}" class="story-avatar">
      </div>
      <span class="story-name">${escapeHTML(story.userName.split(' ')[0])}</span>
    `;
    storyEl.addEventListener('click', () => openStoryViewer(idx));
    container.appendChild(storyEl);
  });
}

// ─── Open Story Viewer ───────────────────────────────────────────────────────
export function openStoryViewer(index) {
  if (!currentStoriesList || currentStoriesList.length === 0) return;
  activeStoryIndex = index;
  const modal = document.getElementById('modal-story-viewer');
  if (!modal) return;

  modal.classList.add('active');
  renderCurrentStory();
}

function renderCurrentStory() {
  const story = currentStoriesList[activeStoryIndex];
  if (!story) {
    closeStoryViewer();
    return;
  }

  const avatar = document.getElementById('story-view-avatar');
  const name = document.getElementById('story-view-name');
  const time = document.getElementById('story-view-time');
  const img = document.getElementById('story-view-media');
  const caption = document.getElementById('story-view-caption');
  const progressBar = document.getElementById('story-progress-bar-fill');

  if (avatar) avatar.src = story.userAvatar;
  if (name) name.textContent = story.userName;
  if (time) time.textContent = formatStoryTime(story.createdAt);
  if (img) img.src = story.mediaUrl;
  if (caption) {
    caption.textContent = story.caption || '';
    caption.style.display = story.caption ? 'block' : 'none';
  }

  // Mark viewed
  if (currentUser && !(story.viewers || []).includes(currentUser.uid)) {
    story.viewers = [...(story.viewers || []), currentUser.uid];
    saveLocalStories(currentStoriesList);
    initStoriesBar();
  }

  // Progress bar animation
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    setTimeout(() => {
      progressBar.style.transition = 'width 5s linear';
      progressBar.style.width = '100%';
    }, 50);
  }

  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => {
    if (activeStoryIndex < currentStoriesList.length - 1) {
      activeStoryIndex++;
      renderCurrentStory();
    } else {
      closeStoryViewer();
    }
  }, 5000);
}

export function closeStoryViewer() {
  clearTimeout(storyTimer);
  const modal = document.getElementById('modal-story-viewer');
  if (modal) modal.classList.remove('active');
}

// Controls
document.getElementById('btn-story-close')?.addEventListener('click', closeStoryViewer);
document.getElementById('btn-story-prev')?.addEventListener('click', () => {
  if (activeStoryIndex > 0) {
    activeStoryIndex--;
    renderCurrentStory();
  }
});
document.getElementById('btn-story-next')?.addEventListener('click', () => {
  if (activeStoryIndex < currentStoriesList.length - 1) {
    activeStoryIndex++;
    renderCurrentStory();
  } else {
    closeStoryViewer();
  }
});

// ─── Create Story Submission ─────────────────────────────────────────────────
const storyFormBtn = document.getElementById('btn-submit-story');
if (storyFormBtn) {
  const fileInput = document.getElementById('story-file-input');
  const preview = document.getElementById('story-preview-img');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && preview) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          preview.src = evt.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  storyFormBtn.addEventListener('click', () => {
    const captionInput = document.getElementById('story-caption-input');
    const caption = captionInput ? captionInput.value.trim() : '';
    const file = fileInput ? fileInput.files[0] : null;

    let mediaUrl = preview && preview.src && preview.style.display !== 'none' ? preview.src : '';
    if (!mediaUrl) {
      mediaUrl = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800&q=80';
    }

    const newStory = {
      id: `story_${Date.now()}`,
      userId: currentUser?.uid || 'guest',
      userName: userDocData?.displayName || currentUser?.displayName || 'Men',
      userAvatar: userDocData?.photoURL || currentUser?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=Me',
      mediaUrl,
      caption,
      createdAt: Date.now(),
      viewers: []
    };

    const stories = getLocalStories();
    stories.unshift(newStory);
    saveLocalStories(stories);

    document.getElementById('modal-create-story')?.classList.remove('active');
    if (captionInput) captionInput.value = '';
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (fileInput) fileInput.value = '';

    if (window.showToast) window.showToast("Story muvaffaqiyatli joylandi! ✨", "success");
    initStoriesBar();
  });
}

function formatStoryTime(timestamp) {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'Hozirgina';
  if (diffMinutes < 60) return `${diffMinutes} daqiqa oldin`;
  const hours = Math.floor(diffMinutes / 60);
  return `${hours} soat oldin`;
}

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
