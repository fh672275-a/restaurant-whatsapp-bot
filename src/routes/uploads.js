/**
 * Bulk Menu Upload Routes
 * - CSV upload (parse rows)
 * - PDF upload (extract menu text, AI parses items)
 * - JSON upload (structured)
 * - Logo/Icon upload
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, generateId } = require('../db');
const config = require('../config');

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.pdf', '.json', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Auth middleware
function requireRestaurantAccess(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  if (req.session.user.type === 'restaurant') {
    req.restaurantId = req.session.user.id;
  } else if (req.session.user.type === 'super_admin' && (req.query.restaurant_id || req.body.restaurant_id)) {
    req.restaurantId = req.query.restaurant_id || req.body.restaurant_id;
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

/**
 * CSV Parser (simple, no external dep)
 */
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: 'CSV must have header + at least 1 row' };
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const items = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue;
    
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = values[idx] || '';
    });
    
    // Map common fields
    const name = item.name || item.item || item['item name'] || item.dish;
    const price = parseFloat(item.price || item.cost || item.rate || '0');
    const category = item.category || item.cat || item.type || '';
    const description = item.description || item.desc || item.details || '';
    
    if (name && !isNaN(price) && price > 0) {
      items.push({ name, price, category, description });
    }
  }
  
  return { items };
}

/**
 * Get or create category by name
 */
function getOrCreateCategory(restaurantId, categoryName) {
  if (!categoryName) return null;
  
  let cat = db.prepare('SELECT id FROM menu_categories WHERE restaurant_id = ? AND name = ?').get(restaurantId, categoryName);
  if (!cat) {
    const id = generateId('cat_');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM menu_categories WHERE restaurant_id = ?').get(restaurantId);
    db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)').run(id, restaurantId, categoryName, maxOrder.m + 1);
    cat = { id };
  }
  return cat.id;
}

/**
 * Bulk add menu items (used by CSV/JSON upload)
 */
function bulkAddMenuItems(restaurantId, items) {
  const results = { added: 0, failed: 0, errors: [] };
  
  const insertItem = db.prepare(`INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, is_available, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);
  
  const txn = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.name || !item.price || isNaN(item.price) || item.price <= 0) {
          results.failed++;
          results.errors.push(`Invalid: ${item.name || 'unknown'}`);
          continue;
        }
        
        const itemId = generateId('item_');
        const categoryId = item.category ? getOrCreateCategory(restaurantId, item.category) : null;
        const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM menu_items WHERE restaurant_id = ?').get(restaurantId);
        
        insertItem.run(itemId, restaurantId, categoryId, item.name, item.description || null, parseFloat(item.price), maxOrder.m + 1);
        results.added++;
      } catch (e) {
        results.failed++;
        results.errors.push(`${item.name}: ${e.message}`);
      }
    }
  });
  
  txn();
  return results;
}

// ============ CSV UPLOAD ============
router.post('/csv', requireRestaurantAccess, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const parsed = parseCSV(content);
    
    if (parsed.error) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: parsed.error });
    }
    
    if (parsed.items.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No valid items found in CSV' });
    }
    
    const results = bulkAddMenuItems(req.restaurantId, parsed.items);
    fs.unlinkSync(req.file.path); // cleanup
    
    res.json({
      success: true,
      added: results.added,
      failed: results.failed,
      errors: results.errors.slice(0, 10),
      message: `${results.added} items added successfully!${results.failed > 0 ? ` ${results.failed} failed.` : ''}`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ JSON UPLOAD ============
router.post('/json', requireRestaurantAccess, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const data = JSON.parse(content);
    
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.menu && Array.isArray(data.menu)) {
      items = data.menu;
    }
    
    if (items.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No items found in JSON' });
    }
    
    const results = bulkAddMenuItems(req.restaurantId, items);
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      added: results.added,
      failed: results.failed,
      message: `${results.added} items added!`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ PDF UPLOAD (AI Vision extraction) ============
router.post('/pdf', requireRestaurantAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const fs2 = require('fs');
    const path2 = require('path');
    
    // Read PDF file as base64 and use AI Vision (VLM) to extract menu items
    const pdfBuffer = fs2.readFileSync(req.file.path);
    const base64Pdf = pdfBuffer.toString('base64');
    
    // Use z-ai Vision API (VLM) - it can read PDF as image
    const ZAI = require('z-ai-web-dev-sdk').default;
    const zai = await ZAI.create();
    
    console.log('[PDF Upload] Sending to AI Vision for extraction...');
    
    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a menu parser. Extract ALL menu items from this restaurant menu PDF.
Return ONLY a valid JSON array (no markdown, no explanation). Format:
[{"name": "Item Name", "price": 100, "category": "Category", "description": "Description"}]

Rules:
- Extract every menu item with its price
- Price should be numeric only (no currency symbols like Rs, $, etc)
- If category not clear, use "Other"
- Description optional (empty string if not available)
- Look for: item names, prices, categories, descriptions
- Return ONLY the JSON array, nothing else`
            },
            {
              type: 'file_url',
              file_url: {
                url: `data:application/pdf;base64,${base64Pdf}`
              }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    });
    
    let aiResponse = completion.choices[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      fs2.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'AI could not extract items from PDF' });
    }
    
    // Clean markdown if present
    if (aiResponse.includes('```')) {
      aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    // Try to find JSON array in response
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      fs2.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No items found in PDF', rawResponse: aiResponse.substring(0, 200) });
    }
    
    const items = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(items) || items.length === 0) {
      fs2.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No valid items extracted from PDF' });
    }
    
    const results = bulkAddMenuItems(req.restaurantId, items);
    fs2.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      added: results.added,
      failed: results.failed,
      message: `${results.added} items extracted from PDF and added!${results.failed > 0 ? ` ${results.failed} failed.` : ''}`
    });
  } catch (e) {
    console.error('[PDF Upload] Error:', e.message);
    
    // Cleanup file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: `PDF processing failed: ${e.message}`,
      alternative: 'Please try CSV format or check if PDF is valid.'
    });
  }
});

// ============ LOGO/ICON UPLOAD ============
router.post('/logo', requireRestaurantAccess, upload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Move file to permanent location
    const ext = path.extname(req.file.originalname);
    const logoPath = path.join('uploads', `logo_${req.restaurantId}${ext}`);
    const fullLogoPath = path.join(__dirname, '..', '..', 'data', logoPath);
    
    // Move from temp to permanent
    fs.renameSync(req.file.path, fullLogoPath);
    
    // Update restaurant
    db.prepare('UPDATE restaurants SET logo_url = ? WHERE id = ?').run(`/data/${logoPath}`, req.restaurantId);
    
    res.json({
      success: true,
      logoUrl: `/data/${logoPath}`,
      message: 'Logo uploaded successfully!'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ DOWNLOAD CSV TEMPLATE ============
router.get('/template/csv', requireRestaurantAccess, (req, res) => {
  const csv = `name,price,category,description
Chicken Biryani,280,Biryani,Aromatic basmati rice with tender chicken
Zinger Burger,350,Burgers,Crispy chicken fillet with special sauce
Chicken Tikka,380,BBQ,Marinated grilled chicken
Coca Cola 1.5L,130,Beverages,Chilled bottle`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=menu-template.csv');
  res.send(csv);
});

// ============ EXPORT MENU AS CSV ============
router.get('/export/csv', requireRestaurantAccess, (req, res) => {
  try {
    const items = db.prepare(`
      SELECT mi.name, mi.price, mc.name as category, mi.description
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mi.restaurant_id = ?
      ORDER BY mc.sort_order, mi.sort_order
    `).all(req.restaurantId);
    
    let csv = 'name,price,category,description\n';
    items.forEach(item => {
      const desc = (item.description || '').replace(/,/g, ';');
      csv += `"${item.name}",${item.price},"${item.category || ''}","${desc}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=menu-export.csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ BULK DELETE ALL ITEMS ============
router.delete('/bulk-delete', requireRestaurantAccess, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM menu_items WHERE restaurant_id = ?').run(req.restaurantId);
    res.json({
      success: true,
      deleted: result.changes,
      message: `${result.changes} items deleted`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
