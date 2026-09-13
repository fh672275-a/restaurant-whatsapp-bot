/**
 * Electron Main Process
 * 
 * Starts the Express server inside Electron, then opens a browser window.
 */

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let serverStarted = false;
let serverPort = 3000;

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/login`, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 302);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServer(serverPort)) {
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function startServer() {
  if (await checkServer(serverPort)) {
    console.log('Server already running on port', serverPort);
    serverStarted = true;
    return true;
  }
  
  console.log('Starting Express server...');
  try {
    const serverPath = path.join(__dirname, '..', 'server.js');
    require(serverPath);
    console.log('Server started, waiting for it to be ready...');
    
    const ready = await waitForServer();
    if (ready) {
      console.log('Server is ready!');
      serverStarted = true;
      return true;
    } else {
      console.error('Server failed to start within timeout');
      return false;
    }
  } catch (e) {
    console.error('Failed to start server:', e.message);
    return false;
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Restaurant WhatsApp Bot',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    backgroundColor: '#075E54'
  });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.loadURL(`data:text/html,<html><body style="background:#075E54;color:white;font-family:Arial;text-align:center;padding-top:200px;margin:0;height:100vh;"><h1 style="margin:0;">Restaurant Bot</h1><p style="margin-top:20px;font-size:18px;">Server start ho raha hai, please wait...</p><p style="font-size:14px;opacity:0.7;margin-top:40px;">Loading...</p></body></html>`);
  });
  
  const serverReady = await startServer();
  
  if (serverReady) {
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.loadURL(`http://localhost:${serverPort}/login`);
        mainWindow.setTitle('Restaurant WhatsApp Bot');
      }
    }, 2000);
  } else {
    mainWindow.loadURL(`data:text/html,<html><body style="background:#c81e2c;color:white;font-family:Arial;text-align:center;padding-top:200px;margin:0;height:100vh;"><h1>Server Failed!</h1><p>Server start nahi ho saka. App restart karein.</p></body></html>`);
  }
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Restaurant WhatsApp Bot',
              detail: 'Version 1.0.0\n\nAI-Powered Restaurant Management System\n\nLogin:\nAdmin: admin / admin123'
            });
          }
        },
        {
          label: 'Open Dashboard',
          click: () => {
            if (mainWindow) {
              mainWindow.loadURL(`http://localhost:${serverPort}/login`);
            }
          }
        },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com/fh672275-a/restaurant-whatsapp-bot');
          }
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  await createWindow();
  createMenu();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('Cleaning up...');
  try {
    const { db } = require(path.join(__dirname, '..', 'src', 'db'));
    if (db && db.open) {
      db.close();
    }
  } catch (e) {}
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

ipcMain.handle('get-app-version', () => app.getVersion());
