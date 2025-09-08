// Sample main-process side of a plugin
module.exports.activate = function(ctx) {
  ctx.log('activating');

  // Add a simple menu item under Help
  try {
    const template = ctx.Menu.getApplicationMenu()?.items?.map(mi => mi);
    if (template) {
      const help = template.find(i => /help/i.test(i.label || ''));
      const insertInto = help || template[template.length - 1];
      if (insertInto && insertInto.submenu) {
        insertInto.submenu.append(new ctx.Menu.MenuItem({
          label: 'Say Hello (Sample Plugin)',
          click: () => {
            const win = ctx.BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send('sample-hello', { msg: 'Hello from plugin!' });
          }
        }));
        ctx.Menu.setApplicationMenu(ctx.Menu.getApplicationMenu());
      }
    }
  } catch (e) { ctx.warn('menu injection skipped', e); }

  // Simple IPC example
  ctx.registerIPC('sample-hello:ping', async () => ({ pong: true }));

  // Optional: intercept a request (no-op demo)
  ctx.registerWebRequest({ urls: ['*://*/*'] }, (details) => {
    // Could cancel or redirect here, but we let it pass through
    return { cancel: false };
  });

  // Context menu contribution example
  ctx.contributeContextMenu?.((template, params, sender) => {
    template.push({ type: 'separator' });
    template.push({
      label: 'Sample: Greet Console',
      click: () => {
        try { (sender.hostWebContents || sender).executeJavaScript("console.log('[Sample Plugin] Hello from context menu')"); } catch {}
      }
    });
  });
};
