# 🚂 Railway Deployment Guide

## Step-by-Step: Deploy on Railway (Free + Always On)

### Step 1: Create Railway Account

1. Go to: **https://railway.app**
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway to access your GitHub
4. ✅ Account created!

### Step 2: Create New Project

1. Click **"New Project"** (top right)
2. Select **"Deploy from GitHub repo"**
3. Find and select: `fh672275-a/restaurant-whatsapp-bot`
4. Click **"Deploy"**

### Step 3: Add Persistent Volume (IMPORTANT!)

This is needed so SQLite database + WhatsApp sessions persist:

1. In your project dashboard, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"** (skip this - we use SQLite)
3. Instead, click **"+ New"** → **"Volume"**
4. Settings:
   - **Mount Path:** `/data`
   - **Name:** `restaurant-data`
5. Click **"Add Volume"**

### Step 4: Configure Environment Variables

1. Click on your **web service** (the one running your app)
2. Go to **"Variables"** tab
3. Click **"New Variable"** and add:

| Key | Value |
|-----|-------|
| `SESSION_SECRET` | `your-random-secret-key-here-12345` |
| `NODE_ENV` | `production` |
| `RAILWAY_VOLUME_MOUNT_PATH` | `/data` |

4. Railway will auto-redeploy after adding variables

### Step 5: Wait for Deployment

- Railway will build your app (5-10 minutes)
- Watch the **"Deployments"** tab for build logs
- When you see `✅ System ready!`, you're done!

### Step 6: Get Your URL!

1. In your web service, go to **"Settings"** tab
2. Find **"Networking"** section
3. Click **"Generate Domain"**
4. Your URL will be: `https://restaurant-whatsapp-bot-production.up.railway.app`

---

## ✅ That's it! Your bot is live!

### Login:
- **Admin:** username `admin`, password `admin123`
- **Restaurant:** Sign up at `/signup`

### Features working:
- ✅ AI-powered WhatsApp bot (24/7)
- ✅ Restaurant self-registration
- ✅ All 13 dashboard pages
- ✅ Persistent database (won't reset on redeploy)
- ✅ WhatsApp sessions persist

---

## 🔧 Troubleshooting

### Build fails?
- Check build logs in Railway dashboard
- Make sure `package.json` is correct
- Railway auto-runs `npm install` then `node server.js`

### App crashes on start?
- Check runtime logs: **Settings → Logs**
- Verify environment variables are set
- Volume mount path must be `/data`

### WhatsApp disconnects?
- This is normal on first deploy
- Login to dashboard → WhatsApp page → Reconnect with QR

### Database resets?
- Make sure you added the Volume (Step 3)
- Volume must be mounted at `/data`

---

## 💰 Railway Pricing

- **Free Trial:** $5 credit (about 1-2 months)
- **Hobby Plan:** $5/month (after free credit)
- **Developer Plan:** Pay as you go

Your app uses minimal resources, so it should run on the cheapest plan.

---

## 📞 Need Help?

If deployment fails:
1. Check Railway build logs
2. Verify all environment variables
3. Make sure volume is mounted
4. Contact Railway support: https://railway.app/help
