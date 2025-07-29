/**
 * Browser Customization System
 * Allows users to customize themes, colors, and layouts non-destructively
 */

class BrowserCustomizer {
  constructor() {
    this.defaultTheme = {
      name: 'Default',
      colors: {
        bg: '#121418',
        darkBlue: '#0B1C2B',
        darkPurple: '#1B1035',
        primary: '#7B2EFF',
        accent: '#00C6FF',
        text: '#E0E0E0'
      },
      layout: 'centered',
      showLogo: true,
      customTitle: 'Nebula Browser',
      gradient: 'linear-gradient(145deg, #121418 0%, #1B1035 100%)'
    };

    this.predefinedThemes = {
      default: this.defaultTheme,
      ocean: {
        name: 'Ocean',
        colors: {
          bg: '#1a365d',
          darkBlue: '#2a4365',
          darkPurple: '#2c5282',
          primary: '#3182ce',
          accent: '#00d9ff',
          text: '#e2e8f0'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1a365d 0%, #2c5282 100%)'
      },
      forest: {
        name: 'Forest',
        colors: {
          bg: '#1a202c',
          darkBlue: '#2d3748',
          darkPurple: '#4a5568',
          primary: '#68d391',
          accent: '#9ae6b4',
          text: '#f7fafc'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1a202c 0%, #2d3748 100%)'
      },
      sunset: {
        name: 'Sunset',
        colors: {
          bg: '#744210',
          darkBlue: '#975a16',
          darkPurple: '#c05621',
          primary: '#ed8936',
          accent: '#fbb040',
          text: '#fffaf0'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #744210 0%, #c05621 100%)'
      },
      cyberpunk: {
        name: 'Cyberpunk Neon',
        colors: {
          bg: '#0a0a0a',
          darkBlue: '#1a0520',
          darkPurple: '#2a0a3a',
          primary: '#ff0080',
          accent: '#00ffff',
          text: '#ffffff'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0a0a0a 0%, #2a0a3a 50%, #1a0520 100%)'
      },
      'midnight-rose': {
        name: 'Midnight Rose',
        colors: {
          bg: '#1c1820',
          darkBlue: '#2d2433',
          darkPurple: '#3d3046',
          primary: '#d4af37',
          accent: '#ffd700',
          text: '#f5f5dc'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1c1820 0%, #3d3046 100%)'
      },
      'arctic-ice': {
        name: 'Arctic Ice',
        colors: {
          bg: '#f0f8ff',
          darkBlue: '#e6f3ff',
          darkPurple: '#d1e7ff',
          primary: '#4169e1',
          accent: '#87ceeb',
          text: '#2f4f4f'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #f0f8ff 0%, #d1e7ff 100%)'
      },
      'cherry-blossom': {
        name: 'Cherry Blossom',
        colors: {
          bg: '#fff5f8',
          darkBlue: '#ffe4e8',
          darkPurple: '#ffd4db',
          primary: '#ff69b4',
          accent: '#ffb6c1',
          text: '#8b4513'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #fff5f8 0%, #ffd4db 100%)'
      },
      'cosmic-purple': {
        name: 'Cosmic Purple',
        colors: {
          bg: '#0f0524',
          darkBlue: '#1a0b3d',
          darkPurple: '#2d1b69',
          primary: '#8a2be2',
          accent: '#da70d6',
          text: '#e6e6fa'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0f0524 0%, #2d1b69 50%, #4b0082 100%)'
      },
      'emerald-dream': {
        name: 'Emerald Dream',
        colors: {
          bg: '#0d2818',
          darkBlue: '#1a3a2e',
          darkPurple: '#2d5a44',
          primary: '#50c878',
          accent: '#98fb98',
          text: '#f0fff0'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0d2818 0%, #2d5a44 100%)'
      },
      'mocha-coffee': {
        name: 'Mocha Coffee',
        colors: {
          bg: '#3c2414',
          darkBlue: '#4a2c1a',
          darkPurple: '#5d3a26',
          primary: '#d2691e',
          accent: '#daa520',
          text: '#faf0e6'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #3c2414 0%, #5d3a26 100%)'
      },
      'lavender-fields': {
        name: 'Lavender Fields',
        colors: {
          bg: '#f8f4ff',
          darkBlue: '#ede4ff',
          darkPurple: '#e6d8ff',
          primary: '#9370db',
          accent: '#dda0dd',
          text: '#4b0082'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #f8f4ff 0%, #e6d8ff 100%)'
      }
    };

    this.currentTheme = this.loadTheme();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadCurrentTheme();
    this.updatePreview();
  }

  setupEventListeners() {
    // Theme preset buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const themeName = e.currentTarget.dataset.theme;
        this.applyPredefinedTheme(themeName);
      });
    });

    // Color inputs
    const colorInputs = ['bg-color', 'gradient-color', 'accent-color', 'secondary-color', 'text-color'];
    colorInputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('input', (e) => {
          this.updateColorFromInput(inputId, e.target.value);
        });
      }
    });

    // Layout options
    document.querySelectorAll('input[name="layout"]').forEach(input => {
      input.addEventListener('change', (e) => {
        this.currentTheme.layout = e.target.value;
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
      });
    });

    // Logo options
    const showLogoInput = document.getElementById('show-logo');
    if (showLogoInput) {
      showLogoInput.addEventListener('change', (e) => {
        this.currentTheme.showLogo = e.target.checked;
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
      });
    }

    const customTitleInput = document.getElementById('custom-title');
    if (customTitleInput) {
      customTitleInput.addEventListener('input', (e) => {
        this.currentTheme.customTitle = e.target.value || 'Nebula Browser';
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
      });
    }

    // Theme management buttons
    this.setupThemeManagementButtons();
  }

  setupThemeManagementButtons() {
    const saveBtn = document.getElementById('save-custom-theme');
    const exportBtn = document.getElementById('export-theme');
    const importBtn = document.getElementById('import-theme');
    const resetBtn = document.getElementById('reset-to-default');
    const fileInput = document.getElementById('theme-file-input');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCustomTheme());
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportTheme());
    }

    if (importBtn) {
      importBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.importTheme(e));
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetToDefault());
    }
  }

  updateColorFromInput(inputId, color) {
    const colorMap = {
      'bg-color': 'bg',
      'gradient-color': 'darkPurple',
      'accent-color': 'primary',
      'secondary-color': 'accent',
      'text-color': 'text'
    };

    const colorKey = colorMap[inputId];
    if (colorKey) {
      this.currentTheme.colors[colorKey] = color;
      
      // Update gradient for background or gradient changes
      if (colorKey === 'bg' || colorKey === 'darkPurple') {
        this.currentTheme.gradient = `linear-gradient(145deg, ${this.currentTheme.colors.bg} 0%, ${this.currentTheme.colors.darkPurple} 100%)`;
      }

      this.saveTheme();
      this.updatePreview();
      this.applyThemeToPages();
    }
  }

  applyPredefinedTheme(themeName) {
    if (this.predefinedThemes[themeName]) {
      this.currentTheme = { ...this.predefinedThemes[themeName] };
      this.saveTheme();
      this.loadCurrentTheme();
      this.updatePreview();
      this.applyThemeToCurrentPage();
      this.applyThemeToPages();
      this.updateThemeButtons(themeName);
    }
  }

  updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add('active');
      }
    });
  }

  loadCurrentTheme() {
    // Update color inputs
    document.getElementById('bg-color').value = this.currentTheme.colors.bg;
    document.getElementById('gradient-color').value = this.currentTheme.colors.darkPurple;
    document.getElementById('accent-color').value = this.currentTheme.colors.primary;
    document.getElementById('secondary-color').value = this.currentTheme.colors.accent;
    document.getElementById('text-color').value = this.currentTheme.colors.text;

    // Update layout radio
    const layoutInput = document.querySelector(`input[name="layout"][value="${this.currentTheme.layout}"]`);
    if (layoutInput) layoutInput.checked = true;

    // Update logo options
    document.getElementById('show-logo').checked = this.currentTheme.showLogo;
    document.getElementById('custom-title').value = this.currentTheme.customTitle;
  }

  updatePreview() {
    const preview = document.getElementById('preview-container');
    const previewHome = preview.querySelector('.preview-home');
    const previewLogo = preview.querySelector('.preview-logo');

    // Apply colors to preview
    previewHome.style.background = this.currentTheme.gradient;
    previewLogo.style.color = this.currentTheme.colors.primary;
    previewLogo.textContent = this.currentTheme.showLogo ? 
      `🌌 ${this.currentTheme.customTitle}` : this.currentTheme.customTitle;

    // Update CSS custom properties for live preview
    this.applyThemeToCurrentPage();
  }

  applyThemeToCurrentPage() {
    const root = document.documentElement;
    root.style.setProperty('--bg', this.currentTheme.colors.bg);
    root.style.setProperty('--dark-blue', this.currentTheme.colors.darkBlue);
    root.style.setProperty('--dark-purple', this.currentTheme.colors.darkPurple);
    root.style.setProperty('--primary', this.currentTheme.colors.primary);
    root.style.setProperty('--accent', this.currentTheme.colors.accent);
    root.style.setProperty('--text', this.currentTheme.colors.text);

    // Apply gradient to body if it exists
    const body = document.body;
    if (body && this.currentTheme.gradient) {
      body.style.background = this.currentTheme.gradient;
      console.log('[THEME] Applied gradient:', this.currentTheme.gradient);
    }
  }

  applyThemeToPages() {
    // This will be called to apply theme to home.html and other pages
    // We'll store the theme and let other pages load it
    this.saveTheme();
    
    // If we have access to other windows/frames, apply there too
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'theme-update',
          theme: this.currentTheme
        }, '*');
      }
    } catch (e) {
      console.log('Could not send theme update to parent window');
    }
  }

  saveCustomTheme() {
    const themeName = prompt('Enter a name for your custom theme:', 'My Custom Theme');
    if (themeName) {
      const customThemes = this.getCustomThemes();
      customThemes[themeName.toLowerCase().replace(/\s+/g, '-')] = {
        ...this.currentTheme,
        name: themeName
      };
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      
      // Show success message
      this.showMessage('Custom theme saved successfully!', 'success');
    }
  }

  exportTheme() {
    const themeData = {
      ...this.currentTheme,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(themeData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nebula-theme-${themeData.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showMessage('Theme exported successfully!', 'success');
  }

  importTheme(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const themeData = JSON.parse(e.target.result);
        
        // Validate theme structure
        if (this.validateTheme(themeData)) {
          this.currentTheme = themeData;
          this.saveTheme();
          this.loadCurrentTheme();
          this.updatePreview();
          this.applyThemeToCurrentPage();
          this.applyThemeToPages();
          this.showMessage('Theme imported successfully!', 'success');
        } else {
          this.showMessage('Invalid theme file format.', 'error');
        }
      } catch (error) {
        this.showMessage('Error reading theme file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  validateTheme(theme) {
    return theme && 
           theme.colors && 
           theme.colors.bg && 
           theme.colors.primary && 
           theme.colors.accent && 
           theme.colors.text;
  }

  resetToDefault() {
    if (confirm('Are you sure you want to reset to the default theme? This will lose your current customizations.')) {
      this.currentTheme = { ...this.defaultTheme };
      this.saveTheme();
      this.loadCurrentTheme();
      this.updatePreview();
      this.applyThemeToCurrentPage();
      this.applyThemeToPages();
      this.updateThemeButtons('default');
      this.showMessage('Theme reset to default.', 'success');
    }
  }

  saveTheme() {
    localStorage.setItem('currentTheme', JSON.stringify(this.currentTheme));
  }

  loadTheme() {
    const savedTheme = localStorage.getItem('currentTheme');
    return savedTheme ? JSON.parse(savedTheme) : { ...this.defaultTheme };
  }

  getCustomThemes() {
    const customThemes = localStorage.getItem('customThemes');
    return customThemes ? JSON.parse(customThemes) : {};
  }

  showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#e53e3e' : '#4299e1'};
    `;

    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }, 3000);
  }

  // Static method to apply theme to any page
  static applyThemeToPage() {
    const savedTheme = localStorage.getItem('currentTheme');
    if (savedTheme) {
      const theme = JSON.parse(savedTheme);
      const root = document.documentElement;
      
      root.style.setProperty('--bg', theme.colors.bg);
      root.style.setProperty('--dark-blue', theme.colors.darkBlue);
      root.style.setProperty('--dark-purple', theme.colors.darkPurple);
      root.style.setProperty('--primary', theme.colors.primary);
      root.style.setProperty('--accent', theme.colors.accent);
      root.style.setProperty('--text', theme.colors.text);

      // Apply gradient to body if it exists
      const body = document.body;
      if (body && theme.gradient) {
        body.style.background = theme.gradient;
        console.log('[THEME] Applied gradient from storage:', theme.gradient);
      }

      return theme;
    }
    return null;
  }
}

// Auto-initialize on settings page
if (window.location.pathname.includes('settings.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    window.browserCustomizer = new BrowserCustomizer();
  });
}

// Add keyframe animations for messages
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);
