// Nebot plugin - main process side
// Responsibilities:
// - Persist chat sessions under the plugin directory (JSON files)
// - IPC handlers for CRUD + streaming chat completions via Ollama HTTP API
// - Add a Help menu item to toggle the chat panel in the renderer

const fs = require('fs');
const path = require('path');

/**
 * A tiny JSON store stored in pluginDir/chats
 */
function ensureDirSync(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function readJSONSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

function writeJSONSafe(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports.activate = function(ctx) {
  console.log('[Nebot] Plugin activate called with ctx:', ctx);
  const pluginId = 'ollama-chat';
  const pluginDir = ctx.paths?.pluginDir || ctx.paths?.appPath || process.cwd();
  const userPlugins = path.join(ctx.paths?.userData || pluginDir, 'plugins');
  // Prefer saving under userData/plugins/<id> to ensure write access
  const dataRoot = pluginDir.startsWith(userPlugins)
    ? pluginDir
    : path.join(userPlugins, pluginId);
  ensureDirSync(dataRoot);
  const chatsDir = path.join(dataRoot, 'chats');
  ensureDirSync(chatsDir);

  // Simple settings (host/model) stored alongside chats
  const settingsPath = path.join(dataRoot, 'settings.json');
  ensureDirSync(path.dirname(settingsPath));
  const defaultSettings = {
    ollamaBaseUrl: 'http://localhost:11434',
    model: 'gpt-oss:20b',
    systemPrompt: 'You are Nebot, the embedded chat assistant inside the Nebula browser. Be friendly, confident, and a bit playful. Prefer clear, descriptive answers with brief reasoning when helpful, and include short examples when it aids understanding. Keep responses concise by default; expand only if asked. Stay safe and do not claim capabilities you lack.'
  };
  const loadSettings = () => readJSONSafe(settingsPath, defaultSettings);
  const saveSettings = (s) => writeJSONSafe(settingsPath, { ...defaultSettings, ...s });

  async function generateTitleIfNeeded(senderWebContents, chatPath) {
    try {
      const chat = readJSONSafe(chatPath, null);
      if (!chat) return;
      const needsTitle = !chat.title || /^new chat/i.test(chat.title) || /^chat \d|^chat \d{1,2}:\d{2}/i.test(chat.title);
      if (!needsTitle) return;
      if (!Array.isArray(chat.messages) || chat.messages.length < 2) return; // need at least user+assistant
      const firstUser = chat.messages.find(m => m.role === 'user');
      const firstAssistant = chat.messages.find(m => m.role === 'assistant');
      if (!firstUser || !firstAssistant) return;

      const userText = String(firstUser.content || '').slice(0, 400);
      const asstText = String(firstAssistant.content || '').slice(0, 400);
      const { ollamaBaseUrl } = loadSettings();
      const model = 'gpt-oss:20b';
      const prompt = `Create a concise, descriptive chat title (4-8 words) for this conversation. Use Title Case. No quotes. No trailing punctuation.\n\nUser: ${userText}\nAssistant: ${asstText}\n\nTitle:`;
      const url = `${ollamaBaseUrl.replace(/\/$/, '')}/api/generate`;
      let resp;
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false })
        });
      } catch {
        return; // no network/title
      }
      if (!resp.ok) return;
      let data;
      try { data = await resp.json(); } catch { return; }
      let title = (data && typeof data.response === 'string') ? data.response.trim() : '';
      if (!title) return;
      // Sanitize: single line, strip quotes
      title = title.split('\n')[0].replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
      // Clamp length
      if (title.length > 80) title = title.slice(0, 77) + '…';
      if (!title) return;

      const latest = readJSONSafe(chatPath, null);
      if (!latest) return;
      latest.title = title;
      latest.updatedAt = Date.now();
      writeJSONSafe(chatPath, latest);
      try { senderWebContents?.send('ollama-chat:chat-updated', { id: latest.id, title }); } catch {}
    } catch {}
  }

  // IPC: list chats
  ctx.registerIPC(`${pluginId}:list-chats`, async () => {
    const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.json'));
    const chats = files.map(f => {
      const p = path.join(chatsDir, f);
      const j = readJSONSafe(p, null);
      return j ? { id: j.id, title: j.title, updatedAt: j.updatedAt } : null;
    }).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { chats };
  });

  // IPC: get chat
  ctx.registerIPC(`${pluginId}:get-chat`, async (_e, { id }) => {
    const p = path.join(chatsDir, `${id}.json`);
    const chat = readJSONSafe(p, null);
    if (!chat) return { error: 'not_found' };
    return { chat };
  });

  // IPC: create chat
  ctx.registerIPC(`${pluginId}:create-chat`, async (_e, { title }) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const chat = { id, title: title || 'New chat', createdAt: now, updatedAt: now, messages: [] };
    writeJSONSafe(path.join(chatsDir, `${id}.json`), chat);
    return { chat };
  });

  // IPC: delete chat
  ctx.registerIPC(`${pluginId}:delete-chat`, async (_e, { id }) => {
    try { fs.unlinkSync(path.join(chatsDir, `${id}.json`)); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
  });

  // IPC: update settings
  ctx.registerIPC(`${pluginId}:get-settings`, async () => ({ settings: loadSettings() }));
  ctx.registerIPC(`${pluginId}:set-settings`, async (_e, s) => {
    // Enforce fixed model regardless of input
    const next = { ...s, model: 'gpt-oss:20b' };
    saveSettings(next);
    return { settings: loadSettings() };
  });

  // IPC: append user message and request model completion (streamed)
  // Renderer will send: { id, content }
  // We append the user message to the chat file, then call Ollama chat API with full history.
  ctx.registerIPC(`${pluginId}:send`, async (event, { id, content }) => {
    const p = path.join(chatsDir, `${id}.json`);
    const chat = readJSONSafe(p, null);
    if (!chat) return { error: 'not_found' };

    chat.messages.push({ role: 'user', content, timestamp: Date.now() });
    chat.updatedAt = Date.now();
    writeJSONSafe(p, chat);

    // Build payload for Ollama
  const { ollamaBaseUrl, systemPrompt } = loadSettings();
  const model = 'gpt-oss:20b';
  const fixedIdentity = 'System: You are Nebot, a plugin running inside the Nebula browser. Adopt a helpful, engaging tone. Describe your answers clearly and briefly explain your reasoning when useful. Use concise formatting and small examples. Avoid unsafe content and be honest about limitations.';
  const messages = [ { role: 'system', content: fixedIdentity } ];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    for (const m of chat.messages) messages.push({ role: m.role, content: m.content });

  // Stream back tokens to the same renderer that invoked this call
  const senderWebContents = (event && (event.sender?.hostWebContents || event.sender)) || ctx.BrowserWindow.getFocusedWindow()?.webContents;
  const channel = `${pluginId}:stream:${id}`;

    // Use global fetch available in recent Electron or node:http as fallback
    const url = `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true })
      });
    } catch (e) {
      ctx.error('Failed to reach Ollama', e);
      try { senderWebContents?.send(channel, { type: 'error', message: 'Failed to reach Ollama server' }); } catch {}
      return { error: 'network' };
    }

    if (!resp.ok || !resp.body) {
      try { senderWebContents?.send(channel, { type: 'error', message: `Bad response: ${resp.status}` }); } catch {}
      return { error: `bad_response:${resp.status}` };
    }

    // Stream NDJSON lines with proper boundary handling; treat message.content/response as delta tokens
    const reader = resp.body.getReader();
    let assistant = '';
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += Buffer.from(value).toString('utf8');
        while (true) {
          const idx = buf.indexOf('\n');
          if (idx === -1) break;
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            if (j.done) {
              // Some servers send a final done object
              try { senderWebContents?.send(channel, { type: 'done' }); } catch {}
              continue;
            }
            let delta = '';
            if (j && j.message && typeof j.message.content === 'string') {
              delta = j.message.content; // chat endpoint streams deltas
              assistant += delta;
            } else if (typeof j.response === 'string') {
              delta = j.response; // generate endpoint style
              assistant += delta;
            }
            if (delta) {
              try { senderWebContents?.send(channel, { type: 'token', token: delta }); } catch {}
            }
          } catch (e) {
            // ignore malformed partials
          }
        }
      }
      // flush leftover (may be a final JSON object without trailing newline)
      const line = buf.trim();
      if (line) {
        try {
          const j = JSON.parse(line);
          if (!j.done) {
            let delta = '';
            if (j && j.message && typeof j.message.content === 'string') {
              delta = j.message.content; assistant += delta;
            } else if (typeof j.response === 'string') {
              delta = j.response; assistant += delta;
            }
            if (delta) {
              try { senderWebContents?.send(channel, { type: 'token', token: delta }); } catch {}
            }
          }
        } catch {}
      }
    } catch (e) {
      ctx.warn('stream interrupted', e);
    }

    // Persist assistant message
    const persisted = readJSONSafe(p, chat);
    persisted.messages.push({ role: 'assistant', content: assistant, timestamp: Date.now() });
    persisted.updatedAt = Date.now();
    writeJSONSafe(p, persisted);

  try { senderWebContents?.send(channel, { type: 'done' }); } catch {}
  // Fire-and-forget title generation if this is the first assistant response
  try { generateTitleIfNeeded(senderWebContents, p); } catch {}
    return { ok: true };
  });

  // Add Help menu toggle
  try {
    const template = ctx.Menu.getApplicationMenu()?.items?.map(mi => mi);
    if (template) {
      const help = template.find(i => /help/i.test(i.label || ''));
      const insertInto = help || template[template.length - 1];
      if (insertInto && insertInto.submenu) {
        insertInto.submenu.append(new ctx.Menu.MenuItem({
          label: 'Toggle Nebot',
          click: () => {
            const win = ctx.BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send(`${pluginId}:toggle`);
          }
        }));
        ctx.Menu.setApplicationMenu(ctx.Menu.getApplicationMenu());
      }
    }
  } catch (e) { ctx.warn('menu injection skipped', e); }

  // Bounce renderer-triggered toggles back to the same sender
  try {
    ctx.ipcMain.on(`${pluginId}:toggle`, (e) => {
      try { (e.sender.hostWebContents || e.sender).send(`${pluginId}:toggle`); } catch {}
    });
  } catch {}

  // Contribute to right-click context menu
  try {
    ctx.contributeContextMenu?.((template, params, sender) => {
      try { template.push({ type: 'separator' }); } catch {}
      template.push({
  label: 'Toggle Nebot',
        click: () => {
          try { (sender.hostWebContents || sender).send(`${pluginId}:toggle`); } catch {}
        }
      });
    });
  } catch (e) { ctx.warn('context menu contrib failed', e); }

  // Register dedicated internal page (browser://nebot) served from plugin directory
  try {
    console.log('[Nebot] Registering page with path:', path.join(ctx.paths.pluginDir, 'page.html'));
    ctx.registerRendererPage?.({ id: 'nebot', html: path.join(ctx.paths.pluginDir, 'page.html') });
  } catch (e) { ctx.warn('page registration failed', e); }
};
