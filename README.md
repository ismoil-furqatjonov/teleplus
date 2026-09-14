# TelePulse - Telegram Uslubidagi Real-time Chat Web-Ilovasi

TelePulse — bu **HTML5, CSS3, Vanilla JavaScript** hamda **Firebase (Authentication, Firestore, Storage)** texnologiyalaridan foydalanib yaratilgan, Telegram Web/Desktop tajribasiga ega zamonaviy va tezkor real-time chat ilovasi.

---

## 🚀 ASOSIY FUNKSIYALAR

1. **Kirish va Ro'yxatdan O'tish**:
   * Email va parol orqali ro'yxatdan o'tish
   * Unikal `@username` tekshiruvi (Firestore real-time query)
   * Profil rasmi va Bio
   * Session Guard (Avtorizatsiyadan o'tmagan foydalanuvchilar chatga kira olmaydi)
   * Online/Offline holat va oxirgi ko'rilgan vaqt (Last seen)

2. **Real-time Private Chat**:
   * Username bo'yicha foydalanuvchini izlab muloqot boshlash
   * Real-vaqt rejimida matn, emoji, rasm, video va fayllarni yuborish
   * MediaRecorder API yordamida **Ovozli xabarlar (Voice Messages)** yozish hamda yuborish
   * Typing... (Suhbatdosh yozmoqda...) indikatori
   * Xabar yuborilgan (✓) va o'qilgan (✓✓) maqomi
   * Xabarga **Javob berish (Reply)** va **Yo'naltirish (Forward)**
   * Xabarni **Tahrirlash (Edit)** va **O'chirish (Delete for me / Delete for everyone)**
   * **Reaksiyalar (Message Reactions)**: 👍 ❤️ 😂 🔥 😮 😢 🎉

3. **Guruh Chatlari (Group Chat)**:
   * Guruh nomi, rasmi, tavsifi va a'zolarni tanlab yangi guruh yaratish
   * Guruh a'zolari ro'yxati, Admin va Owner ma'murligi
   * Admin tayinlash va a'zolarni chiqarish (Kick)
   * Guruhdan chiqish (Leave group)

4. **Telegram Premium Imkoniyatlari (Barcha foydalanuvchilarga Bepul)**:
   * Oltin rangdagi Premium nishon (⭐ PREMIUM Badge)
   * Maxsus Telegram Animated Emoji Popover va Custom Reactions
   * Mavzular sozlamasi (Dark Mode / Light Mode)

5. **Responsiv Dizayn va Xabarnomalar**:
   * Desktop, planshet va mobil telefonlarga moslashuvchan responsive interfeys
   * Web Notifications API va Web Audio API (Ovoz effektlari)

---

## 🛠️ FIREBASE SOZLAMALARI (0-dan Bosqichma-bosqich)

Ilovani ishga tushirishdan oldin Firebase loyihasini sozlashingiz kerak:

### 1-bosqich: Firebase Loyiha Yaratish
1. [Firebase Console](https://console.firebase.google.com/) sahifasiga kiring.
2. **"Add project"** tugmasini bosing va loyihaga nom bering (masalan, `TelePulse-App`).

### 2-bosqich: Firebase Authentication-ni yoqish
1. Chap menyudan **Build > Authentication** bo'limiga o'ting.
2. **"Get Started"** tugmasini bosing.
3. Sign-in method ichidan **Email/Password**-ni tanlang va **Enable** qilib saqlang.

### 3-bosqich: Cloud Firestore-ni yoqish
1. Menyudan **Build > Firestore Database** bo'limiga o'ting.
2. **"Create database"** tugmasini bosing.
3. Test mode yoki Production mode-da ma'lumotlar bazasini yarating.
4. **Rules** bo mezoniga o'tib, loyihadagi `firestore.rules` fayli ichidagi qoidalarni nusxalab qo'ying va **Publish** bosing.

### 4-bosqich: Firebase Storage-ni yoqish
1. Menyudan **Build > Storage** bo'limiga o'ting.
2. **"Get Started"** bosing va saqlang.
3. **Rules** tabiga loyihadagi `storage.rules` fayli qoidalarini qo'ying va **Publish** bosing.

### 5-bosqich: API Kalitlarni Kodga Joylashtirish
1. Firebase Console bosh sahifasida **Web icon `</>`** tugmasini bosing va ilovani ro'yxatdan o'tkazing.
2. Berilgan `firebaseConfig` obyektini nusxalang.
3. Loyihadagi **`js/firebase.js`** faylini oching va `const firebaseConfig = { ... }` joyiga o'z kalitlaringizni joylashtiring.

---

## 💻 LOKAL TARMOQDA VA BARCHA QURILMALARDA ISHGA TUSHIRISH

Endi loyihani bir xil Wi-Fi tarmog'idagi barcha telefonlar, planshetlar va noutbuklar uchun osongina ulashishingiz mumkin!

### 1-usul: 1-Click Bat Script (Windows)
1. Papkadagi **`start-server.bat`** fayli ustiga 2 marta bosing.
2. Konsolda kompyuteringizning lokal IP manzili chiqadi (Masalan: `http://192.168.1.100:8000/login.html`).
3. Kompyuter brauzerida `http://localhost:8000/login.html` ni oching.
4. Boshqa telefonlar va kompyuterlar ushbu IP ssilkani brauzerda ochib kirishi yoki chat ichidagi **QR kod** tugmasini bosing va telefon kamerasi bilan skanerlang!

### 2-usul: Node.js Terminal orqali
```bash
node server.js
```

### 3-usul: Python HTTP Server
```bash
python -m http.server 8000
```

---

## 📁 LOYIHA TUZILISHI

```
├── index.html           # Asosiy Chat Workspace
├── login.html           # Tizimga kirish sahifasi
├── register.html        # Ro'yxatdan o'tish sahifasi
├── css/
│   └── style.css        # Telegram Web dizayni va barcha modullar uchun CSS
├── js/
│   ├── firebase.js      # Firebase SDK modul konfiguratsiyasi
│   ├── auth.js          # Auth mantiqi, login/register va status guard
│   ├── chat.js          # Real-time chat, typing, reactions, edit/delete engine
│   ├── group.js         # Guruhlar yaratish va a'zolarni boshqarish
│   ├── profile.js       # Profilni tahrirlash, username va mavzu sozlamasi
│   └── app.js           # UI mantiqi, voice recorder va popoverlar
├── firestore.rules      # Firestore ma'lumotlar bazasi xavfsizlik qoidalari
├── storage.rules        # Firebase Storage xavfsizlik qoidalari
└── README.md            # Loyiha hujjatlari
```

Tayyor! Endi siz TelePulse chat ilovasidan to'liq foydalanishingiz mumkin!
