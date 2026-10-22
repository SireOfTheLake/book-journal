"use strict";
(() => {
  // src/clip/dom.ts
  var clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  function htmlToText(doc, html) {
    const box = doc.createElement("div");
    box.innerHTML = html.replace(/<\/p>|<br\s*\/?>|<\/div>/gi, "\n\n").replace(/<\/li>/gi, "\n");
    return (box.textContent ?? "").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function metaContent(doc, key) {
    const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return clean(el?.getAttribute("content")) || null;
  }
  function jsonLd(doc) {
    const out = [];
    const visit = (v) => {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") {
        out.push(v);
        if ("@graph" in v) visit(v["@graph"]);
      }
    };
    for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        visit(JSON.parse(s.textContent ?? ""));
      } catch {
      }
    }
    return out;
  }
  var ldOfType = (items, type) => items.find((o) => [o["@type"]].flat().includes(type));
  var names = (v) => [v].flat().map((x) => typeof x === "string" ? x : x?.name ?? "").map(clean).filter(Boolean);
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function toIsoDate(text2) {
    const t = clean(text2);
    if (!t) return void 0;
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(t);
    if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
    if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    m = /\b(\d{4})\b/.exec(t);
    return m ? m[1] : void 0;
  }
  function isoDuration(text2) {
    const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/.exec(String(text2 ?? ""));
    if (!m) return void 0;
    const s = (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
    return s > 0 ? s : void 0;
  }
  function parseSeries(text2) {
    const t = clean(text2).replace(/^\(|\)$/g, "");
    if (!t) return null;
    const m = /^(.*?)[\s,]*(?:#|,?\s*Book\s+|,?\s*Vol(?:ume|\.)?\s+)([\d.]+)\s*$/i.exec(t);
    if (m && m[1].trim()) {
      const n = Number(m[2].replace(/\.$/, ""));
      return { series: m[1].trim(), position: Number.isFinite(n) ? n : void 0 };
    }
    return { series: t };
  }
  var absolute = (href, base) => {
    if (!href) return void 0;
    try {
      return new URL(href, base).toString();
    } catch {
      return void 0;
    }
  };
  function pageText(doc) {
    const out = [];
    const walker = doc.createTreeWalker(
      doc.body,
      4
      /* NodeFilter.SHOW_TEXT */
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = (n.parentElement?.tagName ?? "").toLowerCase();
      if (parent === "script" || parent === "style" || parent === "noscript") continue;
      const t = (n.textContent ?? "").trim();
      if (t) out.push(t);
    }
    return out.join(" ").replace(/\s+/g, " ");
  }

  // src/clip/sites/audible.ts
  var slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function fromAudible(doc, url) {
    const ld = jsonLd(doc);
    const book = ldOfType(ld, "Audiobook") ?? ldOfType(ld, "Book");
    const product = ldOfType(ld, "Product");
    const title = clean(book?.name) || clean(doc.querySelector("h1")?.textContent) || clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));
    if (!title) return null;
    const authors = names(book?.author);
    const sub = clean(doc.querySelector('h2[slot="subtitle"]')?.textContent);
    const seriesLink = Array.from(doc.querySelectorAll('a[href*="/series/"]')).find((a) => clean(a.textContent));
    const parsed = parseSeries(sub) ?? parseSeries(seriesLink?.textContent);
    const authorLinks = {};
    for (const a of authors) {
      const link = Array.from(doc.querySelectorAll('a[href*="/author/"]')).find((el) => slug(clean(el.textContent)) === slug(a) && /\/author\/[^/?]+\/[A-Z0-9]{8,}/.test(el.getAttribute("href") ?? ""));
      const href = absolute(link?.getAttribute("href"), url);
      if (href) authorLinks[a] = href.split("?")[0];
    }
    const crumbs = ldOfType(ld, "BreadcrumbList");
    const tags = [];
    for (const it of crumbs?.itemListElement ?? []) {
      const n = clean(it.item?.name);
      if (n && (it.position ?? 2) > 1) tags.push({ name: n, hint: "genre" });
    }
    const asin = clean(product?.productID) || /\/pd\/[^/]+\/([A-Z0-9]{10})/.exec(url)?.[1];
    const description = book?.description ? htmlToText(doc, String(book.description)).replace(/\n*Contains mature content\.[^\n]*$/i, "").trim() : void 0;
    return {
      v: 1,
      site: "audible",
      url: url.split("?")[0],
      title,
      authors,
      narrators: names(book?.readBy),
      ...parsed ? { series: parsed.series, seriesPosition: parsed.position } : {},
      published: toIsoDate(book?.datePublished),
      publisher: clean(book?.publisher) || void 0,
      asin: asin || void 0,
      format: "audio",
      audioSeconds: isoDuration(book?.duration),
      description,
      cover: clean(book?.image ?? product?.image) || void 0,
      tags,
      authorLinks: Object.keys(authorLinks).length ? authorLinks : void 0
    };
  }

  // src/clip/sites/goodreads.ts
  var text = (doc, sel) => clean(doc.querySelector(sel)?.textContent);
  function fromGoodreads(doc, url) {
    const ldBook = ldOfType(jsonLd(doc), "Book");
    const ogTitle = metaContent(doc, "og:title");
    const heading = text(doc, '[data-testid="bookTitle"]') || text(doc, "h1");
    let title = heading || clean(String(ldBook?.name ?? "")) || ogTitle || "";
    let parsed = null;
    const sm = /^(.*?)\s*\(([^()]*#[\d.]+)\)\s*$/.exec(ogTitle ?? "");
    if (sm) {
      parsed = parseSeries(sm[2]);
      if (!heading) title = clean(sm[1]);
    }
    const seriesEl = text(doc, '.BookPageTitleSection__title h3 a, h3.Text__italic a, [aria-label^="Book "][aria-label*=" series"]');
    if (!parsed && seriesEl) parsed = parseSeries(seriesEl);
    if (!title) return null;
    const authors = [];
    for (const c of Array.from(doc.querySelectorAll('.ContributorLinkWrapper, [data-testid="contributor-link"], .ContributorLink'))) {
      const name = clean(c.querySelector('.ContributorLink__name, [data-testid="name"]')?.textContent);
      const role = clean(c.querySelector('.ContributorLink__role, [data-testid="role"]')?.textContent).toLowerCase();
      if (name && (!role || /author/.test(role)) && !authors.includes(name)) authors.push(name);
    }
    if (!authors.length) authors.push(...names(ldBook?.author));
    const body = pageText(doc);
    const pagesText = text(doc, '[data-testid="pagesFormat"]') || body;
    const pages = /(\d[\d,]*)\s+pages/i.exec(pagesText)?.[1];
    const pubText = text(doc, '[data-testid="publicationInfo"]') || /First published[^.]{0,40}\d{4}/i.exec(body)?.[0] || "";
    const tags = [];
    for (const a of Array.from(doc.querySelectorAll('[data-testid="genresList"] a, .BookPageMetadataSection__genreButton a'))) {
      const name = clean(a.textContent);
      if (name && !tags.some((t) => t.name === name)) tags.push({ name });
    }
    const descEl = doc.querySelector('[data-testid="description"]');
    const description = descEl ? htmlToText(doc, descEl.innerHTML) : metaContent(doc, "og:description") ?? void 0;
    const format = /audio/i.test(pagesText) ? "audio" : /kindle|ebook|digital/i.test(pagesText) ? "ebook" : /hardcover|paperback|mass market/i.test(pagesText) ? "physical" : void 0;
    return {
      v: 1,
      site: "goodreads",
      url: url.split("?")[0],
      title,
      authors,
      ...parsed ? { series: parsed.series, seriesPosition: parsed.position } : {},
      pages: pages ? Number(pages.replace(/,/g, "")) : void 0,
      published: toIsoDate(pubText),
      format,
      isbn: /ISBN[^0-9]{0,10}(97[89]\d{10}|\d{9}[\dXx])/.exec(body)?.[1],
      description,
      cover: metaContent(doc, "og:image") ?? void 0,
      tags
    };
  }

  // src/clip/sites/romanceio.ts
  var SKIP_GROUPS = /* @__PURE__ */ new Set(["geography", "format"]);
  function fromRomanceIo(doc, url) {
    const book = ldOfType(jsonLd(doc), "Book");
    const decode = (s) => htmlToText(doc, s);
    const rawName = decode(String(book?.name ?? "")) || clean(doc.querySelector("h1")?.textContent);
    if (!rawName) return null;
    const sm = /^(.*?)\s*\(([^()]*#[\d.]+)\)\s*$/.exec(rawName);
    const title = clean(sm ? sm[1] : rawName);
    const parsed = sm ? parseSeries(sm[2]) : null;
    const flames = doc.querySelectorAll(".steam-rating .icon-fire").length;
    const heatLabel = clean(doc.querySelector(".steam-rating")?.nextSibling?.textContent);
    const stats = clean(doc.querySelector(".book-stats-scnd")?.textContent);
    const pages = /(\d[\d,]*)\s+pages/i.exec(stats)?.[1];
    const tags = [];
    for (const ul of Array.from(doc.querySelectorAll("ul.topic-tags"))) {
      const group = clean(ul.querySelector(".tabitem-sub")?.textContent).toLowerCase();
      if (SKIP_GROUPS.has(group)) continue;
      for (const li of Array.from(ul.querySelectorAll("li.tagged-topic"))) {
        const name = clean(li.querySelector("a.topic")?.textContent);
        if (!name) continue;
        const votes = Number(clean(li.querySelector(".count")?.textContent));
        tags.push({ name, votes: Number.isFinite(votes) && votes > 0 ? votes : void 0 });
      }
    }
    const box = doc.querySelector("#book-description");
    let description;
    if (box) {
      const copy = box.cloneNode(true);
      copy.querySelectorAll("script, style, .book-cover-container, .dropdown, a").forEach((n) => n.remove());
      const lines = (copy.innerHTML.replace(/<\/p>|<br\s*\/?>/gi, "\n") + "").split("\n").map((l) => clean(htmlToText(doc, l))).filter(Boolean);
      const stop = lines.findIndex((l) => /^Rated '/.test(l) || /^steam\/spice\/heat level/i.test(l) || /^more$/i.test(l));
      description = (stop === -1 ? lines : lines.slice(0, stop)).join("\n\n") || void 0;
    }
    return {
      v: 1,
      site: "romanceio",
      url: url.split("?")[0],
      title,
      authors: names(book?.author),
      ...parsed ? { series: parsed.series, seriesPosition: parsed.position } : {},
      pages: pages ? Number(pages.replace(/,/g, "")) : void 0,
      published: toIsoDate(String(book?.datePublished ?? "") || stats),
      heat: flames > 0 ? flames : void 0,
      heatLabel: heatLabel || void 0,
      description,
      cover: clean(book?.image) || void 0,
      tags
    };
  }

  // src/clip/sites/storygraph.ts
  var MOODS = /* @__PURE__ */ new Set(["adventurous", "challenging", "dark", "emotional", "funny", "hopeful", "informative", "inspiring", "lighthearted", "mysterious", "reflective", "relaxing", "sad", "tense"]);
  var PACES = /* @__PURE__ */ new Set(["slow-paced", "medium-paced", "fast-paced"]);
  function fromStoryGraph(doc, url) {
    const head = doc.querySelector(".book-title-author-and-series, .book-page-info, main") ?? doc.body;
    const title = clean(head.querySelector("h3, h1")?.childNodes[0]?.textContent) || clean(doc.querySelector("h1, h3")?.textContent) || clean((metaContent(doc, "og:title") ?? doc.title).replace(/\s*\|.*$/, "").replace(/\s+by\s+.*$/i, ""));
    if (!title) return null;
    const authors = Array.from(new Set(Array.from(head.querySelectorAll('a[href^="/authors/"], a[href*="thestorygraph.com/authors/"]')).map((a) => clean(a.textContent)).filter(Boolean)));
    const seriesA = head.querySelector('a[href^="/series/"], a[href*="/series/"]');
    const seriesText = clean(seriesA?.parentElement?.textContent) || clean(seriesA?.textContent);
    const sPos = /#\s*([\d.]+)/.exec(seriesText)?.[1];
    const parsed = seriesA ? { series: clean(seriesA.textContent).replace(/\s*#[\d.]+\s*$/, ""), position: sPos ? Number(sPos) : void 0 } : parseSeries(null);
    const body = pageText(doc);
    const pages = /(\d[\d,]*)\s+pages/i.exec(body)?.[1];
    const isbn = /ISBN\/UID:\s*([0-9Xx-]{10,17})/.exec(body)?.[1]?.replace(/-/g, "");
    const publisher = /Publisher:\s*(.+?)(?=\s+(?:First published|Edition|Format|Language|ISBN|Digital|Paperback|Hardcover)|$)/.exec(body)?.[1];
    const edition = /Edition (?:publication )?date:?\s*([0-9A-Za-z ,]+?\d{4})/i.exec(body)?.[1];
    const first = /First published\s+(?:in\s+)?([0-9A-Za-z ,]*\d{4})/i.exec(body)?.[1];
    const format = /Audio/i.test(body.slice(0, 4e3)) && /audiobook|audio/i.test(doc.querySelector(".edition-info")?.textContent ?? "") ? "audio" : /Digital|ebook|Kindle/i.test(doc.querySelector(".edition-info")?.textContent ?? "") ? "ebook" : void 0;
    const tags = [];
    const seen = /* @__PURE__ */ new Set();
    for (const el of Array.from(doc.querySelectorAll("span, a, div"))) {
      if (el.children.length > 0) continue;
      const t = clean(el.textContent).toLowerCase();
      if (seen.has(t)) continue;
      if (MOODS.has(t)) {
        seen.add(t);
        tags.push({ name: t, hint: "mood" });
      } else if (PACES.has(t)) {
        seen.add(t);
        tags.push({ name: t, hint: "pace" });
      }
    }
    for (const a of Array.from(doc.querySelectorAll('a[href*="/browse?"], a[href*="/browse/"]'))) {
      const t = clean(a.textContent).toLowerCase();
      if (t && !seen.has(t) && t.length < 40) {
        seen.add(t);
        tags.push({ name: t, hint: "genre" });
      }
    }
    const desc = doc.querySelector('.blurb-pane, .book-page-description, [class*="description"]');
    return {
      v: 1,
      site: "storygraph",
      url: url.split("?")[0],
      title,
      authors,
      ...parsed ? { series: parsed.series, seriesPosition: parsed.position } : {},
      pages: pages ? Number(pages.replace(/,/g, "")) : void 0,
      published: toIsoDate(edition) ?? toIsoDate(first),
      publisher: publisher ? clean(publisher) : void 0,
      isbn,
      format,
      description: desc ? htmlToText(doc, desc.innerHTML) : metaContent(doc, "og:description") ?? void 0,
      cover: metaContent(doc, "og:image") ?? void 0,
      tags
    };
  }

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
  function extractClip(doc, url) {
    const site = siteOf(url);
    if (!site) return null;
    const clip = { audible: fromAudible, goodreads: fromGoodreads, romanceio: fromRomanceIo, storygraph: fromStoryGraph }[site](doc, url);
    if (!clip) return null;
    for (const k of Object.keys(clip)) {
      const v = clip[k];
      if (v === void 0 || v === "" || Array.isArray(v) && !v.length && k !== "authors" && k !== "tags") delete clip[k];
    }
    return clip;
  }

  // extension/src/page.ts
  window.__bookJournalClip = extractClip(document, location.href);
})();
