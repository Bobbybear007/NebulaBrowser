/* Markdown Bundle for Nebot Page */
(function(){
  try {
    // Try to load libraries if available in Node context
    if (typeof require !== 'undefined') {
      const marked = require('marked');
      const createDOMPurify = require('dompurify');
      const { JSDOM } = require('jsdom');
      
      // Create a DOM window for DOMPurify if needed
      let DOMPurify;
      if (typeof window !== 'undefined') {
        DOMPurify = createDOMPurify(window);
      } else {
        const window = new JSDOM('').window;
        DOMPurify = createDOMPurify(window);
      }
      
      // Configure marked
      marked.setOptions({
        breaks: true,
        highlight: function(code, lang) {
          if (window.hljs && lang && window.hljs.getLanguage(lang)) {
            try {
              return window.hljs.highlight(code, { language: lang }).value;
            } catch (e) {}
          }
          return code;
        }
      });
      
      // Expose to global scope
      window.marked = marked;
      window.DOMPurify = DOMPurify;
      
    } else {
      console.warn('[Markdown Bundle] require() not available, libraries may not be loaded');
    }
  } catch (e) {
    console.error('[Markdown Bundle] Error loading libraries:', e);
    
    // Fallback: simple markdown-like parsing
    window.marked = {
      parse: function(md) {
        if (!md) return '';
        
        // Basic markdown parsing
        return md
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/\n/g, '<br>');
      }
    };
    
    window.DOMPurify = {
      sanitize: function(html) {
        // Basic sanitization - strip script tags
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    };
  }
})();
