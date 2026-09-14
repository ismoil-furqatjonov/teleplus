// TelePulse - Group Chat Management Module
import {
  db,
  storage,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from './firebase.js';
import { currentUser } from './auth.js';

let selectedGroupMembers = new Set();

// Populate users list in New Group Modal
export async function loadGroupMemberSelectionList() {
  const container = document.getElementById('group-members-select-list');
  if (!container || !currentUser) return;

  container.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:10px;">Foydalanuvchilar yuklanmoqda...</div>';

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    container.innerHTML = '';
    selectedGroupMembers.clear();

    usersSnap.forEach((userDoc) => {
      const uData = userDoc.data();
      if (uData.uid === currentUser.uid) return; // Skip self

      const item = document.createElement('div');
      item.className = 'user-select-item';
      item.dataset.uid = uData.uid;

      item.innerHTML = `
        <img class="user-avatar" style="width:36px; height:36px;" src="${uData.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}" alt="">
        <div style="flex: 1;">
          <div style="font-weight:600; font-size:14px;">${uData.displayName}</div>
          <div style="font-size:12px; color:var(--text-muted);">@${uData.username}</div>
        </div>
        <input type="checkbox" style="accent-color: var(--accent-color); transform: scale(1.2);">
      `;

      item.addEventListener('click', () => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          selectedGroupMembers.add(uData.uid);
          item.classList.add('selected');
        } else {
          selectedGroupMembers.delete(uData.uid);
          item.classList.remove('selected');
        }
      });

      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger-color); font-size:13px;">Xatolik: ${err.message}</div>`;
  }
}

// Group Avatar File Preview
const groupAvatarInput = document.getElementById('group-avatar-input');
if (groupAvatarInput) {
  groupAvatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        document.getElementById('group-avatar-preview').src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

// Create Group Submit Handler
const submitCreateGroupBtn = document.getElementById('btn-submit-create-group');
if (submitCreateGroupBtn) {
  submitCreateGroupBtn.addEventListener('click', async () => {
    if (!currentUser) return;

    const groupName = document.getElementById('group-name-input').value.trim();
    const groupDesc = document.getElementById('group-desc-input').value.trim();
    const avatarFile = groupAvatarInput ? groupAvatarInput.files[0] : null;

    if (!groupName) {
      alert("Iltimos, guruh nomini kiriting!");
      return;
    }

    submitCreateGroupBtn.disabled = true;
    submitCreateGroupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yaratilmoqda...';

    try {
      let groupAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupName)}`;
      if (avatarFile) {
        const storageRef = ref(storage, `group_avatars/${Date.now()}_${avatarFile.name}`);
        const uploadTask = await uploadBytesResumable(storageRef, avatarFile);
        groupAvatar = await getDownloadURL(uploadTask.ref);
      }

      const participants = [currentUser.uid, ...Array.from(selectedGroupMembers)];
      const unreadCount = {};
      const typing = {};
      participants.forEach(uid => {
        unreadCount[uid] = 0;
        typing[uid] = false;
      });

      const newGroupRef = await addDoc(collection(db, 'chats'), {
        type: 'group',
        groupName: groupName,
        groupAvatar: groupAvatar,
        groupDescription: groupDesc || "Guruh tavsifi mavjud emas.",
        ownerId: currentUser.uid,
        admins: [currentUser.uid],
        participants: participants,
        unreadCount: unreadCount,
        typing: typing,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: {
          text: `Guruh "${groupName}" yaratildi`,
          senderId: currentUser.uid,
          createdAt: new Date(),
          type: 'text'
        }
      });

      document.getElementById('modal-new-group').classList.remove('active');
      document.getElementById('group-name-input').value = '';
      document.getElementById('group-desc-input').value = '';

      // Open newly created group chat
      if (window.openChatById) {
        window.openChatById(newGroupRef.id);
      }
    } catch (err) {
      alert("Guruh yaratishda xatolik: " + err.message);
    } finally {
      submitCreateGroupBtn.disabled = false;
      submitCreateGroupBtn.innerHTML = '<i class="fa-solid fa-check"></i> Guruhni Yaratish';
    }
  });
}

// Group Admin & Member Actions
export async function promoteToAdmin(chatId, targetUid) {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    admins: arrayUnion(targetUid)
  });
}

export async function removeMemberFromGroup(chatId, targetUid) {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    participants: arrayRemove(targetUid),
    admins: arrayRemove(targetUid)
  });
}

export async function leaveGroup(chatId) {
  if (!currentUser) return;
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    participants: arrayRemove(currentUser.uid),
    admins: arrayRemove(currentUser.uid)
  });
}
