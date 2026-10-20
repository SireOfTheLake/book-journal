// Settings live in the app_setting table. When devices sync, some settings should follow you everywhere
// and some belong to one device only. A setting nobody has classified stays on its own device, which is the safe default.
export type SettingScope = 'shared' | 'device';

/** Settings that sync: which optional features are switched on. */
export const SHARED_SETTING_PREFIXES = ['feature_'];
/** Settings that never leave the device. */
export const DEVICE_SETTINGS = [
  'theme',          // the look can differ between a desktop and a phone
  'journal_year',   // which year this device is showing
  'last_backup_at', // when this device last made a backup
];

export function settingScope(key: string): SettingScope {
  return SHARED_SETTING_PREFIXES.some((p) => key.startsWith(p)) ? 'shared' : 'device';
}
export const isSharedSetting = (key: string) => settingScope(key) === 'shared';
