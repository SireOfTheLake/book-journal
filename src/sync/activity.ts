// When the app counts as "in the background" for syncing: its window is hidden, or not the one you are using, or nothing has been touched for a while.
export const IDLE_MS = 10 * 60_000; // untouched for this long counts as background, even if the window is in front
export const BEAT_MS = 5 * 60_000; // how often an active app checks the cloud for changes

export interface Activity { hidden: boolean; focused: boolean; lastActivity: number; now: number }
export const isIdle = (a: Activity) => a.hidden || !a.focused || a.now - a.lastActivity >= IDLE_MS;

/** Watches the window. `onResume` is called when it goes from background back to being used. Returns a way to ask and a way to stop. */
export function watchActivity(onResume: () => void, win: Window = window, doc: Document = document, clock: () => number = Date.now): { isIdle(): boolean; stop(): void } {
  let focused = doc.hasFocus();
  let last = clock();
  const state = (): Activity => ({ hidden: doc.hidden, focused, lastActivity: last, now: clock() });
  let wasIdle = isIdle(state());
  const touch = () => {
    if (clock() - last >= IDLE_MS) wasIdle = true; // it sat untouched for a while
    last = clock();
    const idle = isIdle(state());
    if (wasIdle && !idle) onResume();
    wasIdle = idle;
  };
  const onFocus = () => { focused = true; touch(); };
  const onBlur = () => { focused = false; wasIdle = true; };
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
  for (const e of events) win.addEventListener(e, touch, { passive: true });
  win.addEventListener('focus', onFocus); win.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', touch);
  return {
    isIdle: () => isIdle(state()),
    stop() { for (const e of events) win.removeEventListener(e, touch); win.removeEventListener('focus', onFocus); win.removeEventListener('blur', onBlur); doc.removeEventListener('visibilitychange', touch); },
  };
}
