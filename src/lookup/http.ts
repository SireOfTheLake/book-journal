export type Fetcher = (url: string) => Promise<Response>;

// Fetches a web address. Inside the app this goes through the app's own download component, because a web
// page is not allowed to read answers from other sites. In a plain browser (or a test) it uses the normal fetch.
export const appFetch: Fetcher = async (url) => {
  const inApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const get = inApp ? (await import('@tauri-apps/plugin-http')).fetch : globalThis.fetch.bind(globalThis);
  return get(url);
};
