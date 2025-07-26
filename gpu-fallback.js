// gpu-fallback.js - GPU error handling and fallback system
const { app } = require('electron');

class GPUFallback {
  constructor() {
    this.gpuEnabled = true;
    this.fallbackLevel = 0;
    this.maxFallbacks = 3;
  }

  // Apply progressive GPU fallbacks
  applyFallback(level = 0) {
    console.log(`Applying GPU fallback level ${level}`);
    
    switch (level) {
      case 0:
        // Level 0: Conservative GPU settings (already applied in main.js)
        break;
        
      case 1:
        // Level 1: Disable hardware acceleration for some features
        app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
        app.commandLine.appendSwitch('disable-accelerated-jpeg-decoding');
        break;
        
      case 2:
        // Level 2: Software rendering only
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('disable-gpu-compositing');
        this.gpuEnabled = false;
        break;
        
      case 3:
        // Level 3: Most conservative settings
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('disable-gpu-compositing');
        app.commandLine.appendSwitch('disable-software-rasterizer');
        app.commandLine.appendSwitch('disable-2d-canvas-image-chromium');
        this.gpuEnabled = false;
        break;
        
      default:
        console.warn('Maximum fallback level reached');
    }
    
    this.fallbackLevel = level;
  }

  // Check if GPU is working properly
  async checkGPUStatus() {
    try {
      const gpuInfo = app.getGPUFeatureStatus();
      
      // Check for critical GPU failures
      const criticalFeatures = ['gpu_compositing', 'webgl', 'webgl2'];
      const failures = criticalFeatures.filter(feature => 
        gpuInfo[feature] && gpuInfo[feature].includes('disabled')
      );
      
      if (failures.length > 0) {
        console.warn('GPU features disabled:', failures);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('GPU status check failed:', err);
      return false;
    }
  }

  // Handle GPU process crashes
  setupCrashHandling() {
    let crashCount = 0;
    
    app.on('gpu-process-crashed', (event, killed) => {
      crashCount++;
      console.error(`GPU process crashed (count: ${crashCount}), killed: ${killed}`);
      
      if (crashCount >= 3 && this.fallbackLevel < this.maxFallbacks) {
        console.log('Too many GPU crashes, applying fallback...');
        this.applyFallback(this.fallbackLevel + 1);
        
        // Restart the app if needed
        if (!killed) {
          setTimeout(() => {
            app.relaunch();
            app.exit();
          }, 1000);
        }
      }
    });
  }

  // Get current GPU status
  getStatus() {
    return {
      gpuEnabled: this.gpuEnabled,
      fallbackLevel: this.fallbackLevel,
      isHardwareAccelerated: this.fallbackLevel < 2
    };
  }
}

module.exports = GPUFallback;
