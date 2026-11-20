import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The Play Store package name. It can never change after the first upload.
  appId: 'com.axiagames.patangrush',
  appName: 'Patang Rush',
  webDir: 'dist',
  backgroundColor: '#4f8fcf',
  android: {
    // Release builds must not be debuggable from a desktop browser.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
