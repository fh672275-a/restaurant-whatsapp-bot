# 🚀 Restaurant WhatsApp Bot - Deployment Guide

Is project ko free hosting par deploy karne k liye 3 options hain. Sab se asaan option pehle diya gaya hai.

---

## ✅ Option 1: Render.com (RECOMMENDED - Easiest)

Render.com free tier deta hai jisme:
- ✅ Free Web Service (sleeps after 15 min inactivity, but wakes up on request)
- ✅ Free PostgreSQL database (90 days, then needs recreation)
- ✅ WebSocket support (Socket.io works)
- ✅ Auto-deploy from GitHub

### Steps:

#### Step 1: GitHub par code push karein

```bash
# Git initialize (agar nahi kiya)
cd /home/z/my-project
git init
git add .
git commit -m "Initial commit - Restaurant WhatsApp Bot"

# GitHub par naya repository banayein
# https://github.com/new
# Name: restaurant-whatsapp-bot
# Private rakhein (recommended)

# Push karein
git remote add origin https://github.com/YOUR_USERNAME/restaurant-whatsapp-bot.git
git branch -M main
git push -u origin main
```

#### Step 2: Render.com par deploy

1. **https://render.com** par ja kar **Sign Up** karein (GitHub se)
2. **New +** → **Web Service** select karein
3. Apna GitHub repository connect karein
4. Settings:
   - **Name:** `restaurant-whatsapp-bot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. **Environment Variables** add karein:
   - `SESSION_SECRET` = `any-random-string-here`
   - `NODE_ENV` = `production`
6. **Create Web Service** dabayein
7. 5-10 minute wait karein (build + deploy)

#### Step 3: PostgreSQL Database setup

1. Render dashboard par **New +** → **PostgreSQL**
2. Settings:
   - **Name:** `restaurant-bot-db`
   - **Database:** `restaurant_bot`
   - **User:** `restaurant_user`
   - **Plan:** `Free`
3. **Create Database** dabayein
4. Database banne k baad, **Connections** tab se **Internal Database URL** copy karein
5. Wapas web service mein ja kar **Environment** tab kholain
6. Add Environment Variable:
   - `DATABASE_URL` = `wahan paste karein jo URL copy ki thi`
7. **Manual Deploy** → **Clear build cache & deploy** karein

#### Step 4: Access karein

- Render aap ko ek URL dega: `https://restaurant-whatsapp-bot.onrender.com`
- Yeh URL permanent hai aur hamesha accessible!

---

## ✅ Option 2: Railway.app

Railway $5 free credit deta hai jo 1-2 mahine chalega.

### Steps:

1. **https://railway.app** par sign up karein (GitHub se)
2. **New Project** → **Deploy from GitHub repo**
3. Repository select karein
4. Railway automatically detect kar lega (Node.js)
5. **Variables** tab mein add karein:
   - `SESSION_SECRET` = `random-string`
   - `DATABASE_URL` = (Railway PostgreSQL plugin se)
6. **PostgreSQL** add karne k liye: **New** → **Database** → **PostgreSQL**
7. Variables mein `DATABASE_URL` automatically set ho jayega
8. **Deploy** dabayein
9. URL mil jayega: `https://restaurant-whatsapp-bot.up.railway.app`

---

## ✅ Option 3: Fly.io (Free with persistent storage)

Fly.io 3 free VMs deta hai aur persistent volume support karta hai (SQLite bhi kaam karega).

### Steps:

1. **https://fly.io** par sign up karein
2. **flyctl** CLI install karein:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
3. Login:
   ```bash
   flyctl auth login
   ```
4. Deploy:
   ```bash
   cd /home/z/my-project
   flyctl launch
   ```
5. Setup:
   - App name: `restaurant-whatsapp-bot`
   - Region: nearest
   - PostgreSQL: Yes
   - Deploy: Yes
6. URL mil jayega: `https://restaurant-whatsapp-bot.fly.dev`

---

## ⚠️ Important Notes

### 1. WhatsApp Session Persistence
Cloud hosting par WhatsApp sessions persistent nahi hongi (kyunki free tier disk nahi deta). Solution:
- **Fly.io** use karein (free persistent volume)
- Ya **Render paid plan** ($7/month) lein

### 2. Free Tier Limitations
- **Render Free:** 15 min baad sleep, request par wake (5-10 sec delay)
- **Railway:** $5 free credit, phir paid
- **Fly.io:** 3 free VMs, hamesha on

### 3. Keep Render Awake (Free)
Render free service ko awake rakhne k liye:
- **UptimeRobot** (https://uptimerobot.com) par free account banayein
- HTTP monitor add karein: `https://your-app.onrender.com/login`
- 5 min interval set karein

---

## 🔧 Post-Deployment Setup

Deploy hone k baad:

1. **Apni app ka URL open karein** (e.g., `https://restaurant-whatsapp-bot.onrender.com`)
2. **Admin login** karein:
   - Username: `admin`
   - Password: `admin123`
3. **Restaurant add karein** (Admin panel se)
4. **Restaurant login** karein
5. **Menu** add karein (ya sample seed karein)
6. **WhatsApp Connect** page par ja kar QR scan karein
7. **Test message** bhejein!

---

## 🆘 Troubleshooting

### Build Failed?
- Check `package.json` mein sab dependencies correct hain
- Node version >=18 required

### Database Connection Error?
- `DATABASE_URL` environment variable sahi set karein
- PostgreSQL URL format: `postgresql://user:pass@host:port/db`

### WhatsApp Disconnects?
- Cloud hosting par sessions restart hote hain
- Baar baar QR scan karna parega
- Solution: Fly.io use karein (persistent volume)

### App Sleeps (Render Free)?
- UptimeRobot se ping setup karein
- Ya paid plan lein ($7/month)

---

## 📞 Need Help?

Agar deployment mein masla ho to:
1. Build logs check karein (Render/Railway dashboard)
2. Runtime logs check karein
3. Environment variables sahi set hain ya nahi verify karein

**Recommended:** Render.com se shuru karein (easiest + free + reliable)
