/* Nebot dedicated page logic */
(function(){
  console.log('[Nebot Page] Starting initialization...');
  console.log('[Nebot Page] window.ollamaChat:', window.ollamaChat);
  console.log('[Nebot Page] window.electronAPI:', window.electronAPI);
  
  // Try multiple ways to access the API
  let api = window.ollamaChat;
  
  // If not available directly, try accessing through electronAPI
  if (!api && window.electronAPI) {
    console.log('[Nebot Page] Creating proxy API using electronAPI...');
    // Create a proxy API that uses IPC directly
    api = {
      listChats: () => {
        console.log('[Nebot Page] Calling listChats via IPC...');
        return window.electronAPI.invoke('ollama-chat:list-chats');
      },
      getChat: (id) => {
        console.log('[Nebot Page] Calling getChat via IPC...', id);
        return window.electronAPI.invoke('ollama-chat:get-chat', { id });
      },
      createChat: (title) => {
        console.log('[Nebot Page] Calling createChat via IPC...', title);
        return window.electronAPI.invoke('ollama-chat:create-chat', { title });
      },
      deleteChat: (id) => {
        console.log('[Nebot Page] Calling deleteChat via IPC...', id);
        return window.electronAPI.invoke('ollama-chat:delete-chat', { id });
      },
      getSettings: () => {
        console.log('[Nebot Page] Calling getSettings via IPC...');
        return window.electronAPI.invoke('ollama-chat:get-settings');
      },
      setSettings: (s) => {
        console.log('[Nebot Page] Calling setSettings via IPC...', s);
        return window.electronAPI.invoke('ollama-chat:set-settings', s);
      },
      send: (id, content) => {
        console.log('[Nebot Page] Calling send via IPC...', id, content);
        return window.electronAPI.invoke('ollama-chat:send', { id, content });
      },
    };
  }
  
  if(!api){
    document.body.innerHTML = '<div style="padding:20px;font-family:system-ui;background:#12141c;color:#e6e8ef;"><h2>Nebot Plugin API Not Available</h2><p>The Nebot plugin may be disabled or not properly loaded.</p><p>Try:</p><ul><li>Check that the plugin is enabled in settings</li><li>Restart the browser</li><li>Use the floating panel instead (Ctrl+Shift+O)</li></ul></div>';
    return;
  }
  
  console.log('[Nebot Page] API available, proceeding with initialization...');

  const els = {
    chatList: document.getElementById('chat-list'),
    messages: document.getElementById('messages'),
    input: document.getElementById('input'),
    newChat: document.getElementById('new-chat'),
    form: document.getElementById('composer'),
    send: document.getElementById('send'),
    settingsBtn: document.getElementById('settings-btn')
  };

  const state = { chats: [], currentId: null };

  function h(tag, attrs={}, ...children){
    const el = document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){
      if(k==='class') el.className=v; else if(k==='onclick') el.addEventListener('click',v); else if(v!=null) el.setAttribute(k,v);
    }
    for(const c of children){ if(c==null) continue; el.appendChild(typeof c==='string'?document.createTextNode(c):c);} return el;
  }

  function formatTime(ts){ try { return new Date(ts).toLocaleString(); } catch { return ''; } }

  async function refreshList(){
    console.log('[Nebot Page] refreshList called...');
    try {
      const result = await api.listChats();
      console.log('[Nebot Page] listChats result:', result);
      state.chats = result.chats || [];
      renderChatList();
    } catch (e) {
      console.error('[Nebot Page] refreshList error:', e);
    }
  }

  function renderChatList(){
    els.chatList.innerHTML='';
    state.chats.forEach(c => {
      const li = h('li',{class:'chat-item'+(c.id===state.currentId?' active':'')});
      li.appendChild(h('div',{class:'chat-title'}, c.title||'Untitled'));
      li.appendChild(h('button',{class:'delete-btn',title:'Delete',onclick:(e)=>{e.stopPropagation();deleteChat(c.id);}},'✕'));
      li.onclick=()=>openChat(c.id);
      els.chatList.appendChild(li);
    });
    if(!state.chats.length){
      els.chatList.appendChild(h('div',{class:'empty'},'No chats yet. Start one below.'));}
  }

  async function openChat(id){
    console.log('[Nebot Page] openChat called with id:', id);
    state.currentId=id;
    try {
      const result = await api.getChat(id);
      console.log('[Nebot Page] getChat result:', result);
      if(result.error){ 
        console.error('[Nebot Page] Error getting chat:', result.error);
        return; 
      }
      renderMessages(result.chat);
      renderChatList();
      subscribeStream(id);
    } catch (e) {
      console.error('[Nebot Page] openChat error:', e);
    }
  }

  async function newChat(){
    const { chat } = await api.createChat('New chat');
    await refreshList();
    await openChat(chat.id);
  }

  async function deleteChat(id){
    await api.deleteChat(id);
    await refreshList();
    if(state.currentId===id){ state.currentId=state.chats[0]?.id||null; if(state.currentId) openChat(state.currentId); else els.messages.innerHTML=''; }
  }

  function mdEscape(s){ return (s||'').replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])); }
  
  function renderMarkdown(md){
    if(!md) return '';
    
    // Check if libraries are loaded
    if(window.marked && window.DOMPurify){
      try {
        // Configure marked if not already done
        if(!window.marked.configured) {
          window.marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
            highlight: function(code, lang) {
              if (window.hljs && lang && window.hljs.getLanguage(lang)) {
                try {
                  return window.hljs.highlight(code, { language: lang }).value;
                } catch (e) {
                  console.warn('Highlight.js error:', e);
                }
              }
              // Try auto-detection
              if (window.hljs) {
                try {
                  return window.hljs.highlightAuto(code).value;
                } catch (e) {
                  console.warn('Highlight.js auto error:', e);
                }
              }
              return code;
            }
          });
          window.marked.configured = true;
        }
        
        const raw = window.marked.parse(md);
        return window.DOMPurify.sanitize(raw, { 
          ADD_ATTR: ['target', 'rel', 'class'],
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'title']
        });
      } catch (e) {
        console.error('Markdown parsing error:', e);
        return mdEscape(md);
      }
    }
    
    // Fallback: basic markdown-like parsing
    console.warn('Markdown libraries not loaded, using fallback parsing');
    return md
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.*)$/, '<p>$1</p>');
  }

  function renderMessages(chat){
    els.messages.innerHTML='';
    if(!chat){ return; }
    chat.messages.forEach(m=>{
      const div = h('div',{class:'msg '+m.role});
      div.innerHTML = '<div class="markdown">'+renderMarkdown(m.content)+'</div>';
      
      // Enhance links for security
      div.querySelectorAll('a[href]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
      
      els.messages.appendChild(div);
    });
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // Typing animation state
  let typingQueue = [];
  let isTyping = false;
  let typingSpeed = 25; // milliseconds per character (base speed)
  let typingEnabled = true; // can be toggled in settings
  let currentCharIndex = 0; // track position for exponential speed-up
  
  function calculateTypingDelay(charIndex, totalLength, baseSpeed) {
    // For short messages (< 50 chars), use normal speed
    if (totalLength < 50) {
      return baseSpeed;
    }
    
    // For longer messages, start normal and speed up exponentially
    const progress = charIndex / totalLength;
    
    // Speed up factor: starts at 1x, goes to 10x at the end
    // Using exponential curve: 1 + 9 * (progress^2)
    const speedMultiplier = 1 + 9 * Math.pow(progress, 2);
    
    // Calculate delay (lower = faster)
    const delay = Math.max(baseSpeed / speedMultiplier, 5); // minimum 5ms delay
    
    return delay;
  }

  function startTypingAnimation(element) {
    console.log('[Nebot Page] startTypingAnimation called, queue length:', typingQueue.length);
    if (isTyping || typingQueue.length === 0) return;
    
    isTyping = true;
    currentCharIndex = 0;
    const totalLength = typingQueue.length;
    element.classList.add('typing');
    console.log('[Nebot Page] Starting typing animation with', totalLength, 'characters (exponential speed-up enabled)');
    
    function typeNext() {
      if (typingQueue.length === 0) {
        isTyping = false;
        currentCharIndex = 0;
        element.classList.remove('typing');
        console.log('[Nebot Page] Typing animation completed');
        return;
      }
      
      const char = typingQueue.shift();
      element.textContent += char;
      els.messages.scrollTop = els.messages.scrollHeight;
      
      // Calculate dynamic delay based on position
      const delay = calculateTypingDelay(currentCharIndex, totalLength, typingSpeed);
      currentCharIndex++;
      
      // Log speed changes for debugging
      if (currentCharIndex % 20 === 0) {
        console.log(`[Nebot Page] Char ${currentCharIndex}/${totalLength}, delay: ${delay.toFixed(1)}ms`);
      }
      
      setTimeout(typeNext, delay);
    }
    
    typeNext();
  }

  function subscribeStream(id){
    const channel = 'ollama-chat:stream:' + id;
    console.log('[Nebot Page] Subscribing to stream channel:', channel);
    
    // Reset typing state for new stream
    typingQueue = [];
    isTyping = false;
    
    // Remove any existing listeners for this channel
    if (window.electronAPI && window.electronAPI.removeListener) {
      window.electronAPI.removeListener(channel, handleStreamPayload);
    }
    
    function handleStreamPayload(...args) {
      // Handle both (event, payload) and (payload) argument patterns
      const payload = args.length > 1 ? args[1] : args[0];
      console.log('[Nebot Page] Stream payload received:', payload);
      
      if(!els.messages) return;
      if(payload.type==='token'){
        let last = els.messages.querySelector('.msg.assistant.streaming');
        if(!last){ 
          last = h('div',{class:'msg assistant streaming'}); 
          els.messages.appendChild(last); 
          last.innerHTML='<div class="markdown"></div>'; 
          console.log('[Nebot Page] Created new streaming message element');
        }
        const md = last.querySelector('.markdown');
        
        if (typingEnabled) {
          // Add tokens to typing queue instead of directly appending
          console.log('[Nebot Page] Adding token to queue:', payload.token);
          for (const char of payload.token) {
            typingQueue.push(char);
          }
          console.log('[Nebot Page] Queue length now:', typingQueue.length);
          
          // Start typing animation if not already running
          if (!isTyping) {
            console.log('[Nebot Page] Starting typing animation...');
            startTypingAnimation(md);
          }
        } else {
          // Direct append if typing is disabled
          console.log('[Nebot Page] Typing disabled, appending directly:', payload.token);
          md.textContent += payload.token;
        }
      } else if(payload.type==='done') {
        console.log('[Nebot Page] Stream done, finalizing message');
        const last = els.messages.querySelector('.msg.assistant.streaming');
        if(last){
          const mdEl = last.querySelector('.markdown');
          
          // Wait for typing animation to complete before rendering markdown
          const waitForTyping = () => {
            if (typingEnabled && (isTyping || typingQueue.length > 0)) {
              setTimeout(waitForTyping, 50);
              return;
            }
            
            // Now render the markdown
            mdEl.innerHTML = renderMarkdown(mdEl.textContent);
            
            // Enhance links for security
            last.querySelectorAll('a[href]').forEach(a => {
              a.setAttribute('target', '_blank');
              a.setAttribute('rel', 'noopener noreferrer');
            });
            
            last.classList.remove('streaming');
          };
          
          waitForTyping();
        }
      } else if(payload.type==='error') {
        console.error('[Nebot Page] Stream error:', payload.message);
      }
      els.messages.scrollTop = els.messages.scrollHeight;
    }
    
    if (window.electronAPI && window.electronAPI.on) {
      console.log('[Nebot Page] Setting up stream listener via electronAPI');
      window.electronAPI.on(channel, handleStreamPayload);
    } else {
      console.warn('[Nebot Page] electronAPI.on not available for stream subscription');
    }
  }

  async function sendMessage(e){
    e.preventDefault();
    console.log('[Nebot Page] sendMessage called...');
    const content = els.input.value.trim();
    if(!content) return;
    if(!state.currentId){
      console.log('[Nebot Page] Creating new chat...');
      const result = await api.createChat('New chat');
      console.log('[Nebot Page] createChat result:', result);
      await refreshList();
      state.currentId = result.chat.id;
    }
    const userDiv = h('div',{class:'msg user'}); userDiv.textContent=content; els.messages.appendChild(userDiv);
    els.input.value='';
    els.messages.scrollTop = els.messages.scrollHeight;
    
    // Subscribe to stream BEFORE sending
    subscribeStream(state.currentId);
    
    console.log('[Nebot Page] Sending message...', state.currentId, content);
    try {
      const result = await api.send(state.currentId, content);
      console.log('[Nebot Page] send result:', result);
      
      // If no streaming response appears after 2 seconds, reload the chat to show the full response
      setTimeout(async () => {
        if (!els.messages.querySelector('.msg.assistant.streaming')) {
          console.log('[Nebot Page] No streaming response detected, reloading chat...');
          const result = await api.getChat(state.currentId);
          if (result.chat && result.chat.messages) {
            const lastMessage = result.chat.messages[result.chat.messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              console.log('[Nebot Page] Found new assistant message, simulating typing animation...');
              
              // Create a streaming message element
              const assistantDiv = h('div',{class:'msg assistant streaming'}); 
              assistantDiv.innerHTML='<div class="markdown"></div>'; 
              els.messages.appendChild(assistantDiv);
              const md = assistantDiv.querySelector('.markdown');
              
              // Simulate typing animation with the full response
              if (typingEnabled) {
                typingQueue = [];
                for (const char of lastMessage.content) {
                  typingQueue.push(char);
                }
                console.log('[Nebot Page] Simulating typing for', typingQueue.length, 'characters with exponential speed-up');
                startTypingAnimation(md);
                
                // Calculate estimated duration with exponential speed-up
                const estimatedDuration = lastMessage.content.length < 50 
                  ? lastMessage.content.length * typingSpeed 
                  : Math.min(lastMessage.content.length * typingSpeed * 0.3, 8000); // Cap at 8 seconds
                
                // Wait for typing to complete, then render markdown
                setTimeout(() => {
                  assistantDiv.classList.remove('streaming');
                  md.innerHTML = renderMarkdown(md.textContent);
                  assistantDiv.querySelectorAll('a[href]').forEach(a => {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                  });
                }, estimatedDuration + 1000);
              } else {
                // No typing animation, just show the message
                md.textContent = lastMessage.content;
                assistantDiv.classList.remove('streaming');
                md.innerHTML = renderMarkdown(md.textContent);
                assistantDiv.querySelectorAll('a[href]').forEach(a => {
                  a.setAttribute('target', '_blank');
                  a.setAttribute('rel', 'noopener noreferrer');
                });
              }
            } else {
              // Fallback to full reload
              await openChat(state.currentId);
            }
          }
        }
      }, 2000);
      
      refreshList();
    } catch (e) {
      console.error('[Nebot Page] sendMessage error:', e);
    }
  }

  async function openSettings(){
    const { settings } = await api.getSettings();
    const modal = h('div',{class:'settings-modal'},
      h('div',{class:'settings-card'},
        h('h2',{},'Nebot Settings'),
        h('div',{},
          h('label',{},'Ollama Base URL'),
          h('input',{id:'set-base',value:settings.ollamaBaseUrl||'http://localhost:11434'})
        ),
        h('div',{},
          h('label',{},'System Prompt'),
          h('textarea',{id:'set-sys'}, settings.systemPrompt||'')
        ),
        h('div',{},
          h('label',{},'Typing Animation'),
          h('div',{style:'display:flex;align-items:center;gap:8px;margin-top:6px;'},
            h('input',{type:'checkbox',id:'set-typing',checked:settings.typingEnabled!==false}),
            h('span',{style:'font-size:13px;'},'Enable typing animation for responses')
          )
        ),
        h('div',{},
          h('label',{},'Typing Speed (characters per second)'),
          h('input',{type:'range',id:'set-speed',min:'10',max:'200',value:settings.typingSpeed||40,style:'margin-top:6px;'}),
          h('span',{id:'speed-display',style:'font-size:12px;color:var(--muted);margin-top:4px;display:block;'},(settings.typingSpeed||40)+' chars/sec'),
          h('div',{style:'font-size:11px;color:var(--muted);margin-top:4px;line-height:1.4;'},'💡 Long messages automatically speed up exponentially (1x → 10x) to prevent tedious waiting')
        ),
        h('div',{class:'settings-actions'},
          h('button',{onclick:()=>modal.remove()},'Cancel'),
          h('button',{class:'primary',onclick:async()=>{
            const next = { 
              ollamaBaseUrl: modal.querySelector('#set-base').value.trim(), 
              systemPrompt: modal.querySelector('#set-sys').value,
              typingEnabled: modal.querySelector('#set-typing').checked,
              typingSpeed: parseInt(modal.querySelector('#set-speed').value)
            };
            // Update local settings
            typingEnabled = next.typingEnabled;
            typingSpeed = 1000 / next.typingSpeed; // convert chars/sec to ms per char
            
            await api.setSettings(next); 
            modal.remove();
          }},'Save')
        )
      )
    );
    
    // Update speed display when slider changes
    const speedSlider = modal.querySelector('#set-speed');
    const speedDisplay = modal.querySelector('#speed-display');
    speedSlider.addEventListener('input', () => {
      speedDisplay.textContent = speedSlider.value + ' chars/sec';
    });
    
    document.body.appendChild(modal);
  }

  els.newChat.addEventListener('click', newChat);
  els.form.addEventListener('submit', sendMessage);
  els.settingsBtn.addEventListener('click', openSettings);

  // Add a test button for debugging typing animation
  const createTestButton = () => {
    const testBtn = h('button', {
      style: 'position:fixed;top:10px;right:10px;z-index:9999;background:#7b61ff;color:white;padding:8px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;',
      onclick: () => {
        console.log('[Nebot Page] Test button clicked');
        const testDiv = h('div',{class:'msg assistant streaming'}); 
        testDiv.innerHTML='<div class="markdown"></div>'; 
        els.messages.appendChild(testDiv);
        const md = testDiv.querySelector('.markdown');
        
        // Simulate a longer response to test exponential speed-up
        const testResponse = "🤖 Hello! This is a test response to verify the typing animation is working correctly with exponential speed-up. It should start at normal speed but get progressively faster as the message gets longer. This is especially useful for very long responses that would otherwise take forever to type out. The speed increase follows an exponential curve, starting at 1x normal speed and reaching up to 10x speed by the end of the message. This ensures that short messages still feel natural while long messages don't become tedious to wait for. You can adjust the base speed in settings, and the acceleration will scale accordingly!";
        typingQueue = [];
        for (const char of testResponse) {
          typingQueue.push(char);
        }
        console.log('[Nebot Page] Test queue populated with', typingQueue.length, 'characters (will demonstrate speed-up)');
        startTypingAnimation(md);
        
        setTimeout(() => {
          if (testDiv.classList.contains('streaming')) {
            testDiv.classList.remove('streaming');
            md.innerHTML = renderMarkdown(md.textContent);
          }
        }, 8000); // Longer timeout since we don't know exact duration with variable speed
      }
    }, 'Test Typing ⚡');
    document.body.appendChild(testBtn);
  };

  // Always show test button for now to verify typing animation
  createTestButton();

  // Auto grow textarea
  els.input.addEventListener('input', ()=>{ els.input.style.height='auto'; els.input.style.height=Math.min(200, els.input.scrollHeight)+'px'; });

  // Load settings and initialize
  async function initializeSettings() {
    try {
      const { settings } = await api.getSettings();
      typingEnabled = settings.typingEnabled !== false; // default to true
      typingSpeed = settings.typingSpeed ? (1000 / settings.typingSpeed) : 25; // convert chars/sec to ms per char, default 40 chars/sec
      console.log('[Nebot Page] Loaded settings - typing enabled:', typingEnabled, 'speed:', typingSpeed + 'ms per char');
    } catch (e) {
      console.warn('[Nebot Page] Could not load settings, using defaults:', e);
    }
  }

  initializeSettings().then(() => {
    refreshList().then(()=>{ if(state.chats[0]) openChat(state.chats[0].id); });
  });
})();
