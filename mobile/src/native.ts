import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';

/** True inside the Android app; false when the game runs in a desktop browser during development. */
export const isNative = Capacitor.isNativePlatform();

/** A short buzz for game moments. Silently does nothing where vibration isn't available. */
export function buzz(kind: 'star' | 'crash') {
  if (isNative) {
    const style = kind === 'crash' ? ImpactStyle.Heavy : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => undefined);
    return;
  }
  try {
    navigator.vibrate?.(kind === 'crash' ? [80, 40, 160] : 15);
  } catch {
    // Not supported.
  }
}

/** Full-screen play, the Android back button, and pausing when the app goes to the background. */
export function setupNative(handlers: { onBack(): void; onPause(): void }) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handlers.onPause();
  });
  if (!isNative) return;
  StatusBar.hide().catch(() => undefined);
  App.addListener('backButton', () => handlers.onBack());
  App.addListener('pause', () => handlers.onPause());
}

export function exitApp() {
  if (isNative) App.exitApp().catch(() => undefined);
}
