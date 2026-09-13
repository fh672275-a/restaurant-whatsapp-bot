# 🖥️ Restaurant WhatsApp Bot - Desktop App

Convert your web application into a native desktop app that installs on Windows, Mac, and Linux!

## 📥 Download & Install

### Windows
1. Download `Restaurant-WhatsApp-Bot-Setup-1.0.0.exe`
2. Double-click to run installer
3. Follow installation wizard
4. App will appear in Start Menu + Desktop shortcut
5. Launch "Restaurant Bot" from Start Menu

### Mac
1. Download `Restaurant-WhatsApp-Bot-1.0.0.dmg`
2. Open the DMG file
3. Drag "Restaurant Bot" to Applications folder
4. Launch from Applications (or Launchpad)

### Linux
1. Download `Restaurant-WhatsApp-Bot-1.0.0.AppImage`
2. Make executable: `chmod +x Restaurant-WhatsApp-Bot-1.0.0.AppImage`
3. Double-click to run
4. Or: `./Restaurant-WhatsApp-Bot-1.0.0.AppImage`

---

## 🔨 Build Desktop App from Source

### Prerequisites
- Node.js 18+ installed
- Git installed

### Step 1: Clone & Install
```bash
git clone https://github.com/fh672275-a/restaurant-whatsapp-bot.git
cd restaurant-whatsapp-bot
npm install
```

### Step 2: Build Native Modules
```bash
npm run build:sqlite
```

### Step 3: Build Desktop Installer
```bash
# For Windows (produces .exe installer)
npm run dist:win

# For Mac (produces .dmg)
npm run dist:mac

# For Linux (produces .AppImage + .deb)
npm run dist:linux

# For current platform
npm run dist
```

### Step 4: Find Installer
After build completes, installers will be in `dist/` folder:
- `dist/Restaurant-WhatsApp-Bot-Setup-1.0.0.exe` (Windows)
- `dist/Restaurant-WhatsApp-Bot-1.0.0.dmg` (Mac)
- `dist/Restaurant-WhatsApp-Bot-1.0.0.AppImage` (Linux)

---

## 🚀 Run in Development Mode

```bash
# Start Express server
npm start

# In another terminal, start Electron
npm run electron
```

---

## 🎯 Features

- ✅ Native desktop application (not browser-based)
- ✅ Auto-starts Express server on launch
- ✅ WhatsApp QR code scanning
- ✅ Full dashboard (13+ pages)
- ✅ AI-powered bot (z-ai-web-dev-sdk)
- ✅ Bulk menu upload (CSV/PDF/JSON)
- ✅ Marketing campaign generator
- ✅ Payment integration ready
- ✅ Offline data storage (SQLite)
- ✅ Auto-update support (can be added)
- ✅ Cross-platform (Windows/Mac/Linux)

---

## ⚙️ How It Works

1. **Electron** wraps the Node.js + Express app
2. On launch, Electron starts the Express server (port 3000)
3. Electron window opens pointing to `http://localhost:3000`
4. All data stored locally in app's data directory
5. WhatsApp sessions persist between launches

---

## 🔑 Default Login

- **Admin:** username `admin`, password `admin123`
- **Restaurant:** Sign up at `/signup` (or login with phone)

---

## 📁 File Structure

```
restaurant-whatsapp-bot/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Security bridge
│   └── assets/
│       └── icon.png     # App icon
├── server.js            # Express server
├── src/                 # Backend code
├── views/               # EJS templates
├── public/              # CSS/JS assets
├── package.json         # Build config
└── dist/                # Build output (after build)
```

---

## ❓ Troubleshooting

### App won't start?
- Check if port 3000 is free
- Run as Administrator (Windows)
- Check antivirus didn't block the app

### WhatsApp disconnects?
- Reconnect from WhatsApp page in app
- QR code re-scan may be needed after updates

### Database issues?
- App stores data in user data directory:
  - Windows: `%APPDATA%/restaurant-whatsapp-bot/`
  - Mac: `~/Library/Application Support/restaurant-whatsapp-bot/`
  - Linux: `~/.config/restaurant-whatsapp-bot/`

---

## 📦 Build Notes

- **Windows build** requires Windows or Wine
- **Mac build** requires macOS
- **Linux build** works on any platform
- Build size: ~150-200MB (includes Node.js runtime + Chromium)
- First build takes 5-10 minutes

---

## 🎉 That's It!

Your Restaurant WhatsApp Bot is now a native desktop app! Users can install it with one click, no technical knowledge required.

---

## 💡 Need Help?

- GitHub: https://github.com/fh672275-a/restaurant-whatsapp-bot
- Issues: Create an issue on GitHub
