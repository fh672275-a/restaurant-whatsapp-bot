# Deploy Restaurant WhatsApp Bot

3 free hosting options available. **Render.com** recommended (easiest).

## Quick Deploy (5 minutes)

### Step 1: Push to GitHub

```bash
cd /home/z/my-project
git init
git add .
git commit -m "Restaurant WhatsApp Bot - Production Ready"

# Create repo on GitHub first: https://github.com/new
git remote add origin https://github.com/YOUR_USERNAME/restaurant-whatsapp-bot.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Render.com

1. Go to: **https://render.com** → Sign up with GitHub
2. **New +** → **Web Service**
3. Connect your GitHub repository
4. Settings:
   - Name: `restaurant-whatsapp-bot`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: **Free**
5. Environment Variables:
   - `SESSION_SECRET` = (any random string)
   - `NODE_ENV` = `production`
6. Click **Create Web Service**

### Step 3: Add PostgreSQL Database

1. **New +** → **PostgreSQL**
   - Name: `restaurant-bot-db`
   - Plan: **Free**
2. After creation, copy **Internal Database URL**
3. Go back to Web Service → **Environment**
4. Add: `DATABASE_URL` = (paste URL)
5. **Manual Deploy** → **Clear build cache & deploy**

### Step 4: Get Your URL!

Render gives you: `https://restaurant-whatsapp-bot.onrender.com`

This is your **PERMANENT** public URL!

---

## Login Credentials (after deploy)

- **Admin:** username `admin`, password `admin123`
- **Restaurant:** First create a restaurant from admin panel

---

## Alternative: Railway.app

1. Go to **https://railway.app** → Sign up with GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Add PostgreSQL: **New** → **Database** → **PostgreSQL**
4. `DATABASE_URL` auto-set ho jayega
5. Deploy!

URL: `https://restaurant-whatsapp-bot.up.railway.app`

---

## Important Notes

⚠️ **Render Free Tier:**
- App sleeps after 15 min of inactivity
- Wakes up on request (5-10 sec delay)
- Use **UptimeRobot** (free) to keep awake: monitor `https://your-app.onrender.com/login` every 5 min

⚠️ **WhatsApp Sessions:**
- Render free has no persistent disk
- App restart hone par WhatsApp reconnect ho jayega (QR rescan nahi chahiye)
- Lekin agar DB reset ho to QR rescan karna parega

⚠️ **PostgreSQL Free (Render):**
- 90 days free, then database deleted
- Backup regularly!
- Or use **Neon** (https://neon.tech) - free forever PostgreSQL

---

## Need PostgreSQL Setup?

This app supports both SQLite (local) and PostgreSQL (cloud). When `DATABASE_URL` env var is set, app uses PostgreSQL automatically.

For detailed guide, see **DEPLOYMENT.md**
