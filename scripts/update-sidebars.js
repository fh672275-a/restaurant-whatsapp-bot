// Update sidebar in all restaurant views
const fs = require('fs');
const path = require('path');

const viewsDir = '/home/z/my-project/views';
const newSidebar = `      <nav class="sidebar-nav">
        <a href="/restaurant/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
        <a href="/restaurant/orders"><i class="fas fa-shopping-bag"></i> Orders</a>
        <a href="/restaurant/menu"><i class="fas fa-utensils"></i> Menu</a>
        <a href="/restaurant/deals"><i class="fas fa-tags"></i> Deals</a>
        <a href="/restaurant/hours"><i class="fas fa-clock"></i> Hours</a>
        <a href="/restaurant/delivery"><i class="fas fa-truck"></i> Delivery Areas</a>
        <a href="/restaurant/customers"><i class="fas fa-users"></i> Customers</a>
        <a href="/restaurant/feedback"><i class="fas fa-star"></i> Feedback</a>
        <a href="/restaurant/broadcasts"><i class="fas fa-bullhorn"></i> Broadcasts</a>
        <a href="/restaurant/reservations"><i class="fas fa-calendar-check"></i> Reservations</a>
        <a href="/restaurant/analytics"><i class="fas fa-chart-bar"></i> Analytics</a>
        <a href="/restaurant/whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        <a href="/restaurant/settings"><i class="fas fa-cog"></i> Settings</a>
        <a href="/logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
      </nav>`;

const files = ['restaurant-orders.ejs', 'restaurant-menu.ejs', 'restaurant-whatsapp.ejs', 'restaurant-settings.ejs'];

files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Match the nav block (with or without class="active" on different items)
  const navRegex = /<nav class="sidebar-nav">[\s\S]*?<\/nav>/;
  
  // Preserve active class based on file
  let sidebar = newSidebar;
  if (file === 'restaurant-orders.ejs') {
    sidebar = sidebar.replace('href="/restaurant/orders"><i class="fas fa-shopping-bag"', 'href="/restaurant/orders" class="active"><i class="fas fa-shopping-bag"');
  } else if (file === 'restaurant-menu.ejs') {
    sidebar = sidebar.replace('href="/restaurant/menu"><i class="fas fa-utensils"', 'href="/restaurant/menu" class="active"><i class="fas fa-utensils"');
  } else if (file === 'restaurant-whatsapp.ejs') {
    sidebar = sidebar.replace('href="/restaurant/whatsapp"><i class="fab fa-whatsapp"', 'href="/restaurant/whatsapp" class="active"><i class="fab fa-whatsapp"');
  } else if (file === 'restaurant-settings.ejs') {
    sidebar = sidebar.replace('href="/restaurant/settings"><i class="fas fa-cog"', 'href="/restaurant/settings" class="active"><i class="fas fa-cog"');
  }
  
  content = content.replace(navRegex, sidebar);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Updated:', file);
});
