// Settings live in the app_setting table. When devices sync, some settings should follow you everywhere
// and some belong to one device only. A setting nobody has classified stays on its own device, which is the safe default.
export type SettingScope = 'shared' | 'device';

/** Settings that sync: which optional features are switched on. */
export const DEVICE_SETTING_PREFIXES = ['sync_'];
export const SHARED_SETTING_PREFIXES = ['feature_', 'boardgame_']; // boardgame_: the board game's boards
/** Settings that never leave the device. */
export const DEVICE_SETTINGS = [
  'theme',          // the look can differ between a desktop and a phone
  'journal_year',   // which year this device is showing
  'last_backup_at', // when this device last made a backup
  'fix_bingo_five_colors', // this device has tidied the Bingo board colors (a fixed shuffle, so every device gets the same result)
];

export function settingScope(key: string): SettingScope {
  return SHARED_SETTING_PREFIXES.some((p) => key.startsWith(p)) ? 'shared' : 'device';
}
export const isSharedSetting = (key: string) => settingScope(key) === 'shared';
