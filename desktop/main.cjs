// RxMunshi for Windows. Serves the bundled static app from app://rxmunshi/
// (a real origin, so browser storage and cross-window sync work) and opens
// WhatsApp links in the system browser.
const { app, BrowserWindow, protocol, shell, Menu, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ORIGIN = 'app://rxmunshi';
const WEB = path.join(__dirname, 'web');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  const full = path.normalize(path.join(WEB, p));
  if (!full.startsWith(WEB)) return null; // no path traversal
  const tries = [full, path.join(full, 'index.html'), full + '.html'];
  for (const f of tries) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  return null;
}

function createWindow(route = '/today/', opts = {}) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'RxMunshi',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#eceae6',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    ...opts,
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(ORIGIN + route);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 440, height: 820, minWidth: 360, title: 'Patient phone', autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png') } };
    }
    if (/^https?:\/\/|^mailto:|^whatsapp:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId('in.rxmunshi.desktop');
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    const file = resolveFile(url.pathname) || resolveFile('/404.html');
    if (!file) return new Response('Not found', { status: 404 });
    const body = await fs.promises.readFile(file);
    return new Response(body, { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
  });
  // camera for the webcam bill scanner, microphone for voice
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'clipboard-sanitized-write'].includes(perm)));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'RxMunshi',
        submenu: [
          { label: 'Today', accelerator: 'Ctrl+D', click: () => BrowserWindow.getFocusedWindow()?.loadURL(ORIGIN + '/today/') },
          { label: 'Patient phone', click: () => createWindow('/phone/', { width: 440, height: 820, minWidth: 360 }) },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'togglefullscreen' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { type: 'separator' },
          {
            label: 'About RxMunshi',
            click: () =>
              dialog.showMessageBox({
                type: 'info',
                title: 'RxMunshi',
                message: `RxMunshi ${app.getVersion()}`,
                detail: 'Pharmacy back office with an approval-gated AI munshi.\nDemo mode: synthetic data, kept on this computer.\nB2B software only: never sells, stocks or delivers medicines.',
              }),
          },
          { role: 'quit' },
        ],
      },
    ]),
  );
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => app.quit());
