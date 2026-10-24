"use strict";
(() => {
  // src/domain/entities.ts
  var NAMED = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "\u2013",
    mdash: "\u2014",
    hellip: "\u2026",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    eacute: "\xE9",
    egrave: "\xE8",
    agrave: "\xE0",
    aacute: "\xE1",
    uuml: "\xFC",
    ouml: "\xF6",
    auml: "\xE4",
    ntilde: "\xF1",
    ccedil: "\xE7",
    iacute: "\xED",
    oacute: "\xF3",
    uacute: "\xFA"
  };
  var fromCode = (n) => {
    try {
      return n > 0 && n <= 1114111 ? String.fromCodePoint(n) : "";
    } catch {
      return "";
    }
  };
  function decodeEntities(s) {
    if (!s.includes("&")) return s;
    return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g, (all, dec, hex, name) => {
      if (dec) return fromCode(Number(dec)) || all;
      if (hex) return fromCode(parseInt(hex, 16)) || all;
      return NAMED[name] ?? NAMED[String(name).toLowerCase()] ?? all;
    });
  }

  // src/clip/dom.ts
  var clean = (s) => decodeEntities((s ?? "").replace(/\s+/g, " ").trim()).replace(/\s+/g, " ").trim();
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
  function validIsbn(v) {
    const t = typeof v === "string" ? v.replace(/[\s-]/g, "") : "";
    return /^(\d{9}[\dXx]|\d{13})$/.test(t) ? t.toUpperCase() : void 0;
  }
  function deepAll(root, selector) {
    const out = Array.from(root.querySelectorAll(selector));
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const inner = el.shadowRoot ?? (el instanceof HTMLTemplateElement ? el.content : null);
      if (inner) out.push(...deepAll(inner, selector));
    }
    return out;
  }

  // src/clip/sites/audible.ts
  var slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function fromAudible(doc, url) {
    const ld = jsonLd(doc);
    const book = ldOfType(ld, "Audiobook") ?? ldOfType(ld, "Book");
    const product = ldOfType(ld, "Product");
    const title = clean(book?.name) || clean(doc.querySelector("h1")?.textContent) || clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));
    if (!title) return null;
    const pinned = (kind) => Array.from(new Set(deepAll(doc, "a[href]").filter((a) => new RegExp(`_pin_${kind}_`).test(a.getAttribute("href") ?? "")).map((a) => clean(a.textContent)).filter(Boolean)));
    const authors = names(book?.author).length ? names(book?.author) : pinned("author");
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
    const description2 = book?.description ? htmlToText(doc, String(book.description)).replace(/\n*Contains mature content\.[^\n]*$/i, "").trim() : void 0;
    return {
      v: 1,
      site: "audible",
      url: url.split("?")[0],
      title,
      authors,
      narrators: names(book?.readBy).length ? names(book?.readBy) : pinned("narrator"),
      ...parsed ? { series: parsed.series, seriesPosition: parsed.position } : {},
      published: toIsoDate(book?.datePublished),
      publisher: clean(book?.publisher) || void 0,
      asin: asin || void 0,
      format: "audio",
      audioSeconds: isoDuration(book?.duration),
      description: description2,
      // no cover: Audible's are square, so they would always be squished
      tags,
      authorLinks: Object.keys(authorLinks).length ? authorLinks : void 0
    };
  }

  // src/clip/sites/goodreads.ts
  var text = (doc, sel) => clean(doc.querySelector(sel)?.textContent);
  function goodreadsDescription(doc) {
    const box = doc.querySelector('[data-testid="description"]');
    if (!box) return void 0;
    const copy = box.cloneNode(true);
    copy.querySelectorAll('button, [role="button"], .Button, .Button__container, .TruncatedContent__gradient, [data-testid="contentToggle"]').forEach((el) => el.remove());
    const blurb = copy.querySelector(".Formatted") ?? copy;
    const text2 = htmlToText(doc, blurb.innerHTML).replace(/\s*(?:\.\.\.|…)?\s*\b(?:show more|show less|read more)\s*$/i, "").trim();
    return text2 || void 0;
  }
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
    const description2 = goodreadsDescription(doc) ?? (metaContent(doc, "og:description") ?? void 0);
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
      description: description2,
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
    if (!tags.some((t) => t.name.toLowerCase() === "romance")) tags.unshift({ name: "Romance", hint: "genre" });
    const box = doc.querySelector("#book-description");
    let description2;
    if (box) {
      const copy = box.cloneNode(true);
      copy.querySelectorAll("script, style, .book-cover-container, .dropdown, a").forEach((n) => n.remove());
      const lines = (copy.innerHTML.replace(/<\/p>|<br\s*\/?>/gi, "\n") + "").split("\n").map((l) => clean(htmlToText(doc, l))).filter(Boolean);
      const stop = lines.findIndex((l) => /^Rated '/.test(l) || /^steam\/spice\/heat level/i.test(l) || /^more$/i.test(l));
      description2 = (stop === -1 ? lines : lines.slice(0, stop)).join("\n\n") || void 0;
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
      description: description2,
      cover: clean(book?.image) || void 0,
      tags
    };
  }

  // src/clip/sites/storygraph.ts
  var MOODS = /* @__PURE__ */ new Set(["adventurous", "challenging", "dark", "emotional", "funny", "hopeful", "informative", "inspiring", "lighthearted", "mysterious", "reflective", "relaxing", "sad", "tense"]);
  var PACES = /* @__PURE__ */ new Set(["slow-paced", "medium-paced", "fast-paced"]);
  function editionRow(doc, label) {
    for (const row of Array.from(doc.querySelectorAll(".edition-info p"))) {
      const head = clean(row.querySelector(".font-semibold")?.textContent).replace(/:$/, "").toLowerCase();
      if (head === label.toLowerCase()) return clean(row.textContent.replace(row.querySelector(".font-semibold")?.textContent ?? "", "")) || void 0;
    }
    return void 0;
  }
  function description(doc) {
    for (const s of Array.from(doc.querySelectorAll("script"))) {
      const code = s.textContent ?? "";
      if (!code.includes("read-more-btn")) continue;
      const m = /Description<\\?\/h4><div class=\\?["']trix-content[^"']*\\?["']><div>([\s\S]*?)<\\?\/div><\/div>/.exec(code);
      if (m) {
        const text2 = htmlToText(doc, m[1].replace(/\\\//g, "/").replace(/\\(['"])/g, "$1"));
        if (text2) return text2;
      }
    }
    for (const h of Array.from(doc.querySelectorAll("h4, h3"))) {
      if (clean(h.textContent).toLowerCase() !== "description") continue;
      const body = h.parentElement?.querySelector(".trix-content");
      if (body) return htmlToText(doc, body.innerHTML);
    }
    return void 0;
  }
  function fromStoryGraph(doc, url) {
    const head = doc.querySelector(".book-title-author-and-series") ?? doc.body;
    const title = clean(head.querySelector("h3, h1")?.textContent) || clean(doc.querySelector("h1, h3")?.textContent) || clean((metaContent(doc, "og:title") ?? doc.title).replace(/\s*\|.*$/, "").replace(/\s+by\s+.*$/i, ""));
    if (!title) return null;
    const authors = Array.from(new Set(Array.from(head.querySelectorAll('a[href*="/authors/"]')).map((a) => clean(a.textContent)).filter(Boolean)));
    const seriesA = head.querySelector('a[href*="/series/"]');
    const position = /#\s*([\d.]+)/.exec(clean(head.querySelector('a[href*="/series/"] + a')?.textContent) || clean(seriesA?.parentElement?.textContent))?.[1];
    const pages = /(\d[\d,]*)\s+pages/i.exec(clean(doc.querySelector(".toggle-edition-info-link")?.textContent))?.[1];
    const formatWord = (editionRow(doc, "Format") ?? "").toLowerCase();
    const format = /audio/.test(formatWord) ? "audio" : /digital|ebook|kindle/.test(formatWord) ? "ebook" : /paperback|hardcover|physical|book/.test(formatWord) ? "physical" : void 0;
    const editionDate = toIsoDate(editionRow(doc, "Edition Pub Date") ?? editionRow(doc, "Edition Publication Date"));
    const firstYear = /first pub\s+(\d{4})/i.exec(clean(doc.body.textContent))?.[1];
    const published = editionDate && (!firstYear || editionDate.startsWith(firstYear)) ? editionDate : firstYear ?? editionDate;
    const tags = [];
    const seen = /* @__PURE__ */ new Set();
    for (const el of Array.from(doc.querySelectorAll(".book-page-tag-section > span"))) {
      const name = clean(el.textContent).toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      tags.push({ name, hint: MOODS.has(name) ? "mood" : PACES.has(name) ? "pace" : "genre" });
    }
    return {
      v: 1,
      site: "storygraph",
      url: url.split("?")[0],
      title,
      authors,
      ...seriesA ? { series: clean(seriesA.textContent).replace(/\s*#[\d.]+\s*$/, ""), seriesPosition: position ? Number(position) : void 0 } : {},
      pages: pages ? Number(pages.replace(/,/g, "")) : void 0,
      published,
      publisher: editionRow(doc, "Publisher"),
      isbn: validIsbn(editionRow(doc, "ISBN/UID")),
      format,
      description: description(doc),
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
