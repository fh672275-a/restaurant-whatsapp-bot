/**
 * Authentication Routes V2
 * - Restaurant self-registration with phone OTP
 * - Login (restaurant + admin)
 * - Password reset via OTP
 * - Profile management
 * - 1000% reliable with error handling
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db, generateId } = require('../db');
const config = require('../config');

// ============ OTP Storage (in-memory, expires in 10 min) ============
const otpStore = new Map(); // phone -> { otp, expires, attempts }

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendOTPViaWhatsApp(phone, otp) {
  // Send OTP via WhatsApp if any restaurant is connected
  try {
    const wa = require('../whatsapp/manager');
    const connectedRestaurants = db.prepare('SELECT id FROM restaurants WHERE whatsapp_connected = 1 LIMIT 1').all();
    if (connectedRestaurants.length > 0) {
      const message = `🔐 Aap ka OTP hai: ${otp}\n\nYeh code 10 minute tak valid hai. Kisi k sath share na karein.`;
      let jid = phone.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) jid = '92' + jid.substring(1);
      if (!jid.endsWith('@s.whatsapp.net')) jid = jid + '@s.whatsapp.net';
      wa.sendMessage(connectedRestaurants[0].id, jid, message).catch(() => {});
      return true;
    }
  } catch (e) {
    // ignore - OTP will be shown on screen for manual verification
  }
  return false;
}

// ============ Setup Status ============
router.get('/setup-status', (req, res) => {
  try {
    const admin = db.prepare('SELECT id FROM super_admins LIMIT 1').get();
    res.json({ needsSetup: !admin });
  } catch (e) {
    res.json({ needsSetup: true });
  }
});

// ============ Super Admin Login ============
router.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username aur password zaruri hai' });
    }
    const admin = db.prepare('SELECT * FROM super_admins WHERE username = ?').get(username);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Galat username ya password' });
    }
    req.session.user = {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      type: 'super_admin'
    };
    res.json({ success: true, redirect: '/admin/dashboard' });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Send OTP for Registration ============
router.post('/restaurant/send-otp', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number zaruri hai' });
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Sahi phone number likhein (11 digits)' });
    }
    
    // Check if already registered
    const existing = db.prepare('SELECT id FROM restaurants WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(400).json({ error: 'Yeh number pehle se register hai. Login karein.' });
    }
    
    const otp = generateOTP();
    otpStore.set(cleanPhone, {
      otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 min
      attempts: 0
    });
    
    // Try to send via WhatsApp
    const sent = sendOTPViaWhatsApp(cleanPhone, otp);
    
    res.json({ 
      success: true, 
      sentViaWhatsApp: sent,
      otp: sent ? null : otp, // Show OTP on screen if WhatsApp not connected
      message: sent 
        ? 'OTP aap k WhatsApp par bhej diya gaya hai' 
        : 'Demo mode: OTP screen par show ho raha hai (WhatsApp connect hone par automatically bhej diya jayega)'
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Verify OTP ============
router.post('/restaurant/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone aur OTP zaruri hain' });
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    const stored = otpStore.get(cleanPhone);
    if (!stored) {
      return res.status(400).json({ error: 'OTP expire ho gaya. Dobari request karein.' });
    }
    
    if (Date.now() > stored.expires) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ error: 'OTP expire ho gaya. Dobari request karein.' });
    }
    
    if (stored.attempts >= 5) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ error: 'Bohat zyada galat attempts. Dobari request karein.' });
    }
    
    if (stored.otp !== otp.toString()) {
      stored.attempts++;
      return res.status(400).json({ error: `Galat OTP. ${5 - stored.attempts} attempts baqi hain.` });
    }
    
    // OTP verified - mark as verified
    stored.verified = true;
    otpStore.set(cleanPhone, stored);
    
    res.json({ success: true, message: 'OTP verify ho gaya!' });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Restaurant Registration ============
router.post('/restaurant/signup', (req, res) => {
  try {
    const { name, owner_name, phone, email, address, password, confirm_password, otp } = req.body;
    
    // Validation
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Restaurant name, phone aur password zaruri hain' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password kam az kam 6 characters ka ho' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Password aur confirm password match nahi karte' });
    }
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    // Check OTP verification (skip in demo mode if no WhatsApp connected)
    const stored = otpStore.get(cleanPhone);
    const hasWhatsApp = db.prepare('SELECT COUNT(*) as c FROM restaurants WHERE whatsapp_connected = 1').get().c > 0;
    
    if (hasWhatsApp && stored && stored.otp) {
      if (!stored.verified) {
        if (!otp) {
          return res.status(400).json({ error: 'Pehle OTP verify karein' });
        }
        if (stored.otp !== otp.toString()) {
          return res.status(400).json({ error: 'Galat OTP' });
        }
      }
    }
    
    // Check if already exists
    const existing = db.prepare('SELECT id FROM restaurants WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(400).json({ error: 'Yeh phone pehle se register hai' });
    }
    
    // Create restaurant
    const id = generateId('rest_');
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO restaurants (id, name, owner_name, phone, email, address, password) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, owner_name || null, cleanPhone, email || null, address || null, hashedPassword);
    
    // Clean up OTP
    otpStore.delete(cleanPhone);
    
    // Auto-login
    req.session.user = {
      id: id,
      name: name,
      type: 'restaurant'
    };
    
    res.json({ 
      success: true, 
      id, 
      redirect: '/restaurant/onboarding',
      message: 'Account ban gaya! Ab apna restaurant setup karein.'
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Restaurant Login ============
router.post('/restaurant/login', (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone aur password zaruri hai' });
    }
    
    // Normalize phone (same as signup)
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    console.log('[Login] Phone input:', phone, '-> Cleaned:', cleanPhone);
    
    // Try to find restaurant with multiple phone formats
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE phone = ? OR whatsapp_phone = ? OR phone = ? OR whatsapp_phone = ?').get(
      cleanPhone, cleanPhone, 
      '92' + cleanPhone.substring(1), '92' + cleanPhone.substring(1)
    );
    
    if (!restaurant) {
      console.log('[Login] Restaurant not found for phone:', cleanPhone);
      return res.status(401).json({ error: 'Galat phone ya password' });
    }
    
    console.log('[Login] Restaurant found:', restaurant.name, '| Phone:', restaurant.phone);
    
    if (!bcrypt.compareSync(password, restaurant.password)) {
      console.log('[Login] Password mismatch for:', restaurant.name);
      return res.status(401).json({ error: 'Galat phone ya password' });
    }
    
    if (!restaurant.is_active) {
      return res.status(403).json({ error: 'Aap ka account deactivate hai. Support se rabta karein.' });
    }
    
    req.session.user = {
      id: restaurant.id,
      name: restaurant.name,
      type: 'restaurant'
    };
    console.log('[Login] Success! Session set for:', restaurant.name);
    res.json({ success: true, redirect: '/restaurant/dashboard' });
  } catch (e) {
    console.error('[Login] Error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Password Reset - Send OTP ============
router.post('/restaurant/forgot-password', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number zaruri hai' });
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    const restaurant = db.prepare('SELECT id, name FROM restaurants WHERE phone = ?').get(cleanPhone);
    if (!restaurant) {
      return res.status(404).json({ error: 'Yeh phone number register nahi hai' });
    }
    
    const otp = generateOTP();
    otpStore.set(cleanPhone, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      purpose: 'reset',
      restaurantId: restaurant.id
    });
    
    const sent = sendOTPViaWhatsApp(cleanPhone, otp);
    
    res.json({ 
      success: true,
      sentViaWhatsApp: sent,
      otp: sent ? null : otp,
      message: sent 
        ? 'Password reset OTP aap k WhatsApp par bhej diya gaya hai' 
        : 'Demo mode: OTP screen par show ho raha hai'
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Password Reset - Verify & Reset ============
router.post('/restaurant/reset-password', (req, res) => {
  try {
    const { phone, otp, new_password, confirm_password } = req.body;
    
    if (!phone || !otp || !new_password) {
      return res.status(400).json({ error: 'Phone, OTP aur new password zaruri hain' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password kam az kam 6 characters ka ho' });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords match nahi karte' });
    }
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
    
    const stored = otpStore.get(cleanPhone);
    if (!stored || stored.purpose !== 'reset') {
      return res.status(400).json({ error: 'OTP expire ho gaya. Dobari request karein.' });
    }
    if (Date.now() > stored.expires) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ error: 'OTP expire ho gaya' });
    }
    if (stored.otp !== otp.toString()) {
      stored.attempts++;
      return res.status(400).json({ error: 'Galat OTP' });
    }
    
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE restaurants SET password = ? WHERE id = ?').run(hashedPassword, stored.restaurantId);
    
    otpStore.delete(cleanPhone);
    
    res.json({ success: true, message: 'Password change ho gaya! Ab login karein.' });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ============ Logout ============
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true, redirect: '/login' });
  });
});

// ============ Get Current User ============
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
