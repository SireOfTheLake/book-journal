"use strict";
(() => {
  // src/clip/link.ts
  var CLIP_SCHEME = "bookjournal://";
  var MAX_LINK = 14e3;
  var toBase64Url = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  function encodeClip(clip) {
    let c = { ...clip };
    const make = () => `${CLIP_SCHEME}add?d=${toBase64Url(JSON.stringify(c))}`;
    let link = make();
    while (link.length > MAX_LINK && (c.description?.length ?? 0) > 400) {
      c = { ...c, description: `${c.description.slice(0, Math.floor(c.description.length * 0.7)).trim()}...` };
      link = make();
    }
    while (link.length > MAX_LINK && c.tags.length > 5) {
      c = { ...c, tags: c.tags.slice(0, -3) };
      link = make();
    }
    return link;
  }

  // src/clip/types.ts
  var SITE_NAME = { goodreads: "Goodreads", storygraph: "StoryGraph", audible: "Audible", romanceio: "Romance.io" };

  // src/clip/extract.ts
  function siteOf(url) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (/(^|\.)audible\.[a-z.]+$/.test(host)) return /\/pd\//.test(url) ? "audible" : null;
    if (/(^|\.)goodreads\.com$/.test(host)) return /\/book\/show\//.test(url) ? "goodreads" : null;
    if (/(^|\.)thestorygraph\.com$/.test(host)) return /\/books\//.test(url) ? "storygraph" : null;
    if (/(^|\.)romance\.io$/.test(host)) return /\/books\//.test(url) ? "romanceio" : null;
    return null;
  }

  // extension/src/popup.ts
  var app = document.getElementById("app");
  var el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    const { class: cls, ...rest } = props;
    if (cls) e.className = String(cls);
    Object.assign(e, rest);
    e.append(...kids);
    return e;
  };
  var say = (text, cls = "muted") => {
    app.replaceChildren(el("h1", {}, "ADD TO BOOK JOURNAL"), el("p", { class: cls }, text));
  };
  function duration(s) {
    const h = Math.floor(s / 3600);
    const m = Math.round(s % 3600 / 60);
    return `${h} h ${m} min`;
  }
  function show(clip) {
    const facts = [
      clip.authors.join(", "),
      clip.series ? `${clip.series}${clip.seriesPosition !== void 0 ? ` #${clip.seriesPosition}` : ""}` : "",
      clip.pages ? `${clip.pages} pages` : "",
      clip.audioSeconds ? duration(clip.audioSeconds) : "",
      clip.heat !== void 0 ? `Heat ${clip.heat}/5` : "",
      clip.tags.length ? `${clip.tags.length} tags` : "",
      clip.narrators?.length ? `Narrated by ${clip.narrators.join(", ")}` : ""
    ].filter(Boolean);
    const img = el("img", { alt: "" });
    if (clip.cover) img.src = clip.cover;
    else img.style.visibility = "hidden";
    const status = el("p", { class: "note" }, `Found on ${SITE_NAME[clip.site]}. Book Journal opens with the details filled in for you to check.`);
    const go = el("button", { class: "go", type: "button" }, "Add to Book Journal");
    go.onclick = () => {
      const a = el("a", { href: encodeClip(clip) });
      document.body.append(a);
      a.click();
      a.remove();
      status.textContent = 'Opening Book Journal... If Chrome asks, choose Open (tick "always allow" to skip the question next time).';
    };
    const copy = el("button", { type: "button" }, "Copy what was found");
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(clip, null, 2));
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Could not copy";
      }
    };
    app.replaceChildren(
      el("h1", {}, "ADD TO BOOK JOURNAL"),
      el("div", { class: "card" }, img, el("div", {}, el("div", { class: "t" }, clip.title), el("div", { class: "facts" }, facts.join(" \xB7 ")))),
      el("div", { class: "row" }, go, copy),
      status
    );
  }
  async function main() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return say("Open a book page first.");
    if (!siteOf(tab.url)) return say("Open a book page on Goodreads, StoryGraph, Audible or Romance.io, then click this button again.");
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["page.js"] });
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__bookJournalClip ?? null });
      const clip = res?.result;
      if (!clip) return say("This page loaded, but I could not find a book on it. Try again once the page has finished loading.", "err");
      show(clip);
    } catch (e) {
      say(`Could not read this page: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
  }
  void main();
})();
