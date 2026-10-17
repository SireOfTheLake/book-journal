// The update key lives in updater-pubkey.txt (the contents of book-journal.key.pub), not in tauri.conf.json,
// so copying new project files over yours can never replace it. This builds the extra Tauri settings for a build.
export function buildExtra({ pubkey, sign }) {
  const key = (pubkey ?? '').trim();
  if (sign && !key) throw new Error('updater-pubkey.txt is missing or empty. Put the contents of book-journal.key.pub in it (see UPDATES.md), then try again.');
  const extra = {};
  if (key) extra.plugins = { updater: { pubkey: key } };
  if (sign) extra.bundle = { createUpdaterArtifacts: true };
  return extra;
}
