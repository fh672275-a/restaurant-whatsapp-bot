# 🚀 Free Deployment Guide (Netlify Alternatives)

Netlify par yeh app deploy nahi ho sakti (technical limitations ki waja se). Yeh 3 free alternatives hain jo is app k liye perfect hain.

---

## 🥇 Option 1: KOYEB (RECOMMENDED - Best Free)

Koyeb free tier mein hamesha-on apps support karta hai!

### Steps:

1. **https://www.koyeb.com** par jayein
2. **Sign up with GitHub** (asani ho jayegi)
3. Email verify karein
4. Dashboard par **Create Service** par click karein
5. **GitHub** select karein
6. Apna repo select karein: `fh672275-a/restaurant-whatsapp-bot`
7. Settings:
   - **Service Name:** `restaurant-whatsapp-bot`
   - **Branch:** `main`
   - **Builder:** `Buildpack` (or Dockerfile)
   - **Build Command:** `npm install`
   - **Run Command:** `node server.js`
   - **Port:** `3000`
   - **Instance Type:** `Free`
8. **Environment Variables** add karein:
   - `SESSION_SECRET` = `my-secret-key-12345`
   - `NODE_ENV` = `production`
9. **Deploy** par click karein
10. 5-10 min wait karein

**URL mil jayega:** `https://restaurant-whatsapp-bot-xxx.koyeb.app`

---

## 🥈 Option 2: FLY.IO (Free + Persistent Storage)

Fly.io 3 free VMs deta hai aur persistent volume support karta hai (SQLite bhi kaam karta hai).

### Steps:

1. **https://fly.io** par jayein aur **Sign up** karein
2. Credit card verify karein (charges nahi hote, sirf verification)
3. Apne computer par **flyctl** install karein:
   - **Mac:** `brew install flyctl`
   - **Linux/Windows (PowerShell):** `iwr https://fly.io/install.ps1 -useb | iex`
4. Terminal par login:
   ```bash
   flyctl auth login
   ```
5. Project directory mein ja kar deploy:
   ```bash
   cd restaurant-whatsapp-bot
   flyctl deploy
   ```
6. App ban jaye to volume create karein:
   ```bash
   flyctl volumes create restaurant_data --region sin --size 1
   ```
7. Database setup (optional - PostgreSQL):
   ```bash
   flyctl postgres create
   ```
8. Environment variable set karein:
   ```bash
   flyctl secrets set SESSION_SECRET="your-secret-here"
   ```
9. Final deploy:
   ```bash
   flyctl deploy
   ```

**URL mil jayega:** `https://restaurant-whatsapp-bot.fly.dev`

### Important Notes:
- `fly.toml` file already push ho chuki hai GitHub par
- 512MB RAM, shared CPU
- Singapore region (nearest to Pakistan/India)
- Persistent volume: WhatsApp sessions preserved!

---

## 🥉 Option 3: RENDER.COM (FREE - But Sleeps)

Bhai, Render.com **free** hai - sirf 15 min inactivity k baad sleep ho jata hai, request par 5-10 sec mein wake ho jata hai.

### Steps:

1. **https://render.com** par jayein
2. **Sign up with GitHub**
3. **New +** → **Web Service**
4. Apna repo select karein: `fh672275-a/restaurant-whatsapp-bot`
5. Settings:
   - **Name:** `restaurant-whatsapp-bot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
6. **Environment Variables:**
   - `SESSION_SECRET` = `any-random-string`
   - `NODE_ENV` = `production`
7. **Create Web Service**
8. **PostgreSQL Database add karein:**
   - **New +** → **PostgreSQL** → **Free**
   - **Internal Database URL** copy karein
   - Web service mein environment variable add karein: `DATABASE_URL`
9. **Manual Deploy**

**URL mil jayega:** `https://restaurant-whatsapp-bot.onrender.com`

### Keep Awake (Free):
- **https://uptimerobot.com** par free account banayein
- HTTP monitor add karein: `https://your-app.onrender.com/login`
- 5 min interval set karein
- App hamesha awake rahega!

---

## 📊 Comparison Table

| Feature | Koyeb | Fly.io | Render Free |
|---------|-------|--------|-------------|
| **Cost** | Free | Free | Free |
| **Always On** | ✅ Yes | ✅ Yes | ❌ Sleeps 15 min |
| **Persistent Storage** | ✅ Yes | ✅ Yes (volume) | ❌ No |
| **WebSocket** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Setup Difficulty** | Easy | Medium | Easy |
| **Setup Time** | 5 min | 15 min | 10 min |
| **Best For** | Beginners | Developers | Quick testing |

---

## 🎯 My Recommendation:

**Koyeb** use karein - sab se asaan, free, aur always-on!

Agar Koyeb par masla ho to **Fly.io** try karein.

---

## ⚠️ Common Issues:

### 1. Build Failed?
- Check logs (platform dashboard)
- Ensure `package.json` mein sab dependencies hain
- Node version >=18 required

### 2. WhatsApp Disconnects?
- Free tiers mein restart ho sakta hai
- Solution: Fly.io (persistent volume) use karein

### 3. Database Reset?
- Free PostgreSQL tiers mein data delete ho sakta hai
- Solution: Regular backups lein
- Ya SQLite use karein (Fly.io k sath)

### 4. App Sleeps (Render)?
- UptimeRobot (free) se ping setup karein
- 5 min interval: `https://your-app.onrender.com/login`

---

## 📞 Need Help?

Agar deployment mein koi masla ho to mujhe batayein:
- Konsa platform use kar rahe hain?
- Kya error aa raha hai?
- Konsa step par atke hain?

Main guide kar dunga!
