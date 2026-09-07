/* Service Worker für die Schulpost-PWA.

   Zwei Regeln, und keine mehr:
   1. Nur die eigene App-Hülle wird zwischengespeichert.
   2. Alles, was mit Konto oder Mail zu tun hat, wird NIE angefasst — weder
      Microsoft Graph noch der Login noch der EF-Proxy. Diese Antworten haben in
      einem Cache nichts zu suchen.
*/
const VERSION = "schulpost-v1";
const HUELLE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/msal-browser.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt.
    await Promise.all(HUELLE.map(u => c.add(new Request(u, { cache:"reload" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const FREMD = /graph\.microsoft\.com|login\.microsoftonline\.com|login\.microsoft\.com|login\.windows\.net/i;

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                       // Senden nie abfangen
  const url = new URL(req.url);
  if (FREMD.test(url.host)) return;                       // Konto und Mail: Finger weg
  if (url.origin !== location.origin) return;             // Schriften und Fremdes: direkt ans Netz
  if (!url.pathname.startsWith(new URL("./", location.href).pathname)) return;

  const istHuelle = /\/(index\.html)?$|\.js$|\.webmanifest$|\.png$|\.svg$/i.test(url.pathname);
  if (!istHuelle) return;

  // Netz zuerst, Cache als Rückfall: so landen Updates, und offline startet die App trotzdem.
  e.respondWith((async () => {
    try {
      const frisch = await fetch(req);
      if (frisch && frisch.ok && frisch.type === "basic"){
        const c = await caches.open(VERSION);
        c.put(req, frisch.clone()).catch(() => {});
      }
      return frisch;
    } catch {
      const treffer = await caches.match(req, { ignoreSearch:true });
      if (treffer) return treffer;
      if (req.mode === "navigate"){
        const start = await caches.match("./index.html");
        if (start) return start;
      }
      return new Response("Offline und nichts im Zwischenspeicher.", {
        status:503, headers:{ "Content-Type":"text/plain; charset=utf-8" } });
    }
  })());
});
