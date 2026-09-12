/**
 * Authentication Routes
 * Handles super admin and restaurant login/logout
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db } = require('../db');
const config = require('../config');

// Check if any super admin exists (for setup)
router.get('/setup-status', (req, res) => {
  const admin = db.prepare('SELECT id FROM super_admins LIMIT 1').get();
  res.json({ needsSetup: !admin });
});

// Super Admin Login
router.post('/admin/login', (req, res) => {
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
});

// Restaurant Login
router.post('/restaurant/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone aur password zaruri hai' });
  }
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE phone = ? OR whatsapp_phone = ?').get(cleanPhone, cleanPhone);
  if (!restaurant || !bcrypt.compareSync(password, restaurant.password)) {
    return res.status(401).json({ error: 'Galat phone ya password' });
  }
  if (!restaurant.is_active) {
    return res.status(403).json({ error: 'Aap ka account deactivate hai. Admin se rabta karein.' });
  }
  req.session.user = {
    id: restaurant.id,
    name: restaurant.name,
    type: 'restaurant'
  };
  res.json({ success: true, redirect: '/restaurant/dashboard' });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true, redirect: '/login' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
