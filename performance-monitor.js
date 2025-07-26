// performance-monitor.js - Monitor and optimize browser performance
const { app } = require('electron');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      memoryUsage: [],
      cpuUsage: [],
      loadTimes: []
    };
    this.startTime = Date.now();
  }

  // Monitor memory usage
  trackMemory() {
    const usage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });

    // Keep only last 100 measurements
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage.shift();
    }
  }

  // Monitor CPU usage
  trackCPU() {
    const usage = process.cpuUsage();
    this.metrics.cpuUsage.push({
      timestamp: Date.now(),
      user: usage.user,
      system: usage.system
    });

    if (this.metrics.cpuUsage.length > 100) {
      this.metrics.cpuUsage.shift();
    }
  }

  // Track page load times
  trackLoadTime(url, loadTime) {
    this.metrics.loadTimes.push({
      timestamp: Date.now(),
      url,
      loadTime
    });

    if (this.metrics.loadTimes.length > 50) {
      this.metrics.loadTimes.shift();
    }
  }

  // Get performance report
  getReport() {
    const memAvg = this.metrics.memoryUsage.length > 0 
      ? this.metrics.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / this.metrics.memoryUsage.length
      : 0;

    const avgLoadTime = this.metrics.loadTimes.length > 0
      ? this.metrics.loadTimes.reduce((sum, l) => sum + l.loadTime, 0) / this.metrics.loadTimes.length
      : 0;

    return {
      uptime: Date.now() - this.startTime,
      averageMemoryUsage: Math.round(memAvg / 1024 / 1024), // MB
      averageLoadTime: Math.round(avgLoadTime),
      totalPageLoads: this.metrics.loadTimes.length
    };
  }

  // Start monitoring
  start() {
    // Monitor every 30 seconds
    setInterval(() => {
      this.trackMemory();
      this.trackCPU();
    }, 30000);

    // Log performance report every 5 minutes
    setInterval(() => {
      const report = this.getReport();
      console.log('Performance Report:', report);
    }, 5 * 60 * 1000);
  }

  // Force garbage collection if available
  forceGC() {
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }
  }
}

module.exports = PerformanceMonitor;
