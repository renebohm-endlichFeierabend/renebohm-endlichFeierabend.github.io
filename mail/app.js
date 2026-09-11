"use strict";
/* ============================================================================
   Schulpost — PWA für Microsoft-365-Mail (Endlich Feierabend)

   Warum diese App überhaupt existiert: Ein Claude-Artifact darf per
   Content-Security-Policy keinen eigenen fetch ausführen und kommt nur über
   Connector-Tools nach außen — und der Microsoft-365-Connector kann nur lesen.
   Diese Seite läuft ohne diese Grenze und spricht Microsoft Graph direkt.

   Kein Secret im Spiel: Public Client mit Auth-Code-Flow + PKCE. Client-ID und
   Tenant sind öffentliche Kennungen. Tokens liegen im localStorage dieses
   Geräts (MSAL-Cache) und gehen an niemanden außer Microsoft.
   ========================================================================== */

/* ------------------------------- Helfer ---------------------------------- */
const $ = (s, r) => (r || document).querySelector(s);
function el(tag, props, ...kids){
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)){
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;              // nur eigene, feste Schnipsel
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}
const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const escHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtWann(iso){
  if (!iso) return "";
  const d = new Date(iso), n = new Date();
  const heute = d.toDateString() === n.toDateString();
  if (heute) return d.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
  const g = new Date(n.getTime() - 864e5);
  if (d.toDateString() === g.toDateString()) return "gestern";
  if (n - d < 6 * 864e5) return d.toLocaleDateString("de-DE", { weekday:"short" });
  return d.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit" });
}
const fmtVoll = iso => iso
  ? new Date(iso).toLocaleString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
  : "";
function htmlToText(html){
  if (!html) return "";
  let s = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "· ").replace(/<[^>]+>/g, "");
  const t = document.createElement("textarea"); t.innerHTML = s;
  return t.value.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function toast(text, art){
  const alt = $(".toast"); if (alt) alt.remove();
  const t = el("div", { class:"toast", "data-k":art || null, role:"status", text });
  document.body.append(t);
  setTimeout(() => t.remove(), art === "bad" ? 6500 : 3200);
}

/* ---------------------------- Konfiguration ------------------------------ */
const CKEY = "ef.schulpost.cfg.v1";
const CFG_STD = {
  clientId: "",
  authority: "https://login.microsoftonline.com/organizations",
  geteilteScopes: false,
  postfaecher: [],                 // [{mail, label}] freigegebene Postfächer
  loginArt: "redirect",            // redirect | popup
  redirectUri: "",                 // leer = aus der Adresse dieser Seite abgeleitet
  proxyUrl: "", proxyToken: "", proxyRolle: "standard",
  bilderLaden: false               // externe Bilder in HTML-Mails (Tracking-Pixel!)
};
let CFG = { ...CFG_STD };
function cfgLaden(){
  try { CFG = { ...CFG_STD, ...(JSON.parse(localStorage.getItem(CKEY) || "{}") || {}) }; }
  catch { CFG = { ...CFG_STD }; }
}
function cfgSpeichern(){ try { localStorage.setItem(CKEY, JSON.stringify(CFG)); } catch { toast("Einstellungen konnten nicht gespeichert werden.", "bad"); } }

/* ---------------------- Übergabe aus dem Cockpit --------------------------
   Das Feierabend-Cockpit kann Schulmail nicht senden. Es reicht darum einen
   fertigen Entwurf hierher weiter — als echte Antwort auf eine Nachricht, nicht
   als neue Mail, damit der Thread erhalten bleibt.
   Die Parameter werden SOFORT weggesichert: der MSAL-Redirect kehrt ohne sie
   zurück, und nach dem Login wären sie sonst verloren. */
const UKEY = "ef.schulpost.uebergabe";
(function uebergabeSichern(){
  try {
    const q = new URLSearchParams(location.search);
    if (!q.get("reply") && !q.get("compose")) return;
    sessionStorage.setItem(UKEY, JSON.stringify({
      reply:q.get("reply") || "", owner:q.get("owner") || "",
      to:q.get("to") || "", subject:q.get("subject") || "",
      body:q.get("body") || "", alle:q.get("alle") !== "0"
    }));
    history.replaceState(null, "", location.pathname);   // nicht bei jedem Neuladen erneut
  } catch {}
})();
function uebergabeHolen(){
  try {
    const roh = sessionStorage.getItem(UKEY);
    if (!roh) return null;
    sessionStorage.removeItem(UKEY);
    return JSON.parse(roh);
  } catch { return null; }
}

/** Die Redirect-URI, die in Azure als „Single-page application“ eingetragen sein muss.
    Überschreibbar, falls in Azure eine abweichende Schreibweise registriert ist —
    dann muss nicht Azure nachgeben, sondern die App passt sich an. */
const REDIRECT_STD = location.origin + location.pathname.replace(/index\.html$/i, "");
const redirectUri = () => (CFG.redirectUri || "").trim() || REDIRECT_STD;

const SCOPES_BASIS = ["User.Read", "Mail.ReadWrite", "Mail.Send"];
const SCOPES_GETEILT = ["Mail.ReadWrite.Shared", "Mail.Send.Shared"];
const scopes = () => CFG.geteilteScopes ? [...SCOPES_BASIS, ...SCOPES_GETEILT] : [...SCOPES_BASIS];

/* -------------------------------- Zustand -------------------------------- */
const ST = {
  view: "liste",            // liste | lesen | neu | einstellungen | setup
  app: null, konto: null,
  aktivesPostfach: null,    // null = eigenes Konto, sonst Adresse
  mails: [], laden: false, fehler: null,
  offen: null, offenLaden: false, htmlAnsicht: false,
  antwort: "", antwortAn: "alle", senden: false, entwerfen: false,
  neu: { an:"", cc:"", betreff:"", text:"" },
  initFehler: null
};

/* ------------------------------ Anmeldung -------------------------------- */
async function msalStarten(){
  if (!CFG.clientId) return null;
  const conf = {
    auth: { clientId:CFG.clientId, authority:CFG.authority, redirectUri:redirectUri(), navigateToLoginRequestUrl:false },
    cache: { cacheLocation:"localStorage", storeAuthStateInCookie:false },
    system: { loggerOptions: { loggerCallback:() => {}, piiLoggingEnabled:false } }
  };
  if (typeof msal.createStandardPublicClientApplication === "function")
    return await msal.createStandardPublicClientApplication(conf);
  const app = new msal.PublicClientApplication(conf);
  if (typeof app.initialize === "function") await app.initialize();
  return app;
}
async function anmelden(){
  if (!ST.app) return;
  const req = { scopes:scopes(), prompt:"select_account" };
  try {
    if (CFG.loginArt === "popup"){
      const r = await ST.app.loginPopup(req);
      if (r && r.account){ ST.app.setActiveAccount(r.account); ST.konto = r.account; nachLogin(); }
    } else {
      await ST.app.loginRedirect(req);           // kehrt nicht zurück
    }
  } catch (e){ toast(authFehlerText(e), "bad"); }
}
async function abmelden(){
  if (!ST.app || !ST.konto) return;
  try { await ST.app.logoutRedirect({ account:ST.konto, postLogoutRedirectUri:redirectUri() }); }
  catch { ST.konto = null; render(); }
}
function authFehlerText(e){
  const c = (e && (e.errorCode || e.code)) || "";
  if (/AADSTS50011|redirect_uri|invalid_request/i.test(String(c) + String(e && e.errorMessage)))
    return "Azure kennt diese Redirect-URI nicht: " + redirectUri() +
           " \u2014 sie muss unter Authentifizierung als Plattform \u201eEinzelseitige Anwendung\u201c stehen, " +
           "zeichengenau samt Schr\u00e4gstrich am Ende. Ist in Azure eine andere Schreibweise eingetragen, " +
           "trag sie in den Einstellungen unter \u201eRedirect-URI\u201c ein.";
  if (/unauthorized_client|invalid_client/i.test(c)) return "Die Client-ID passt nicht zu dieser Authority.";
  if (/consent|interaction_required|login_required/i.test(c)) return "Die Anmeldung braucht eine Zustimmung — bitte erneut anmelden.";
  if (/user_cancelled|popup_window_error|popup_blocked/i.test(c)) return "Anmeldung abgebrochen oder Popup blockiert. Probiere die Redirect-Anmeldung.";
  return (e && (e.errorMessage || e.message)) || "Anmeldung fehlgeschlagen.";
}
/** Access-Token still holen; bei Bedarf interaktiv nachfassen. */
async function token(){
  if (!ST.app || !ST.konto) throw new GraphFehler(401, null, null);
  try {
    const r = await ST.app.acquireTokenSilent({ scopes:scopes(), account:ST.konto });
    return r.accessToken;
  } catch (e){
    if (e instanceof msal.InteractionRequiredAuthError || /interaction_required|login_required|consent_required/i.test(String(e && e.errorCode))){
      if (CFG.loginArt === "popup"){
        const r = await ST.app.acquireTokenPopup({ scopes:scopes(), account:ST.konto });
        return r.accessToken;
      }
      await ST.app.acquireTokenRedirect({ scopes:scopes(), account:ST.konto });
      throw new GraphFehler(401, null, null);
    }
    throw e;
  }
}

/* ----------------------------- Microsoft Graph ---------------------------- */
const GBASE = "https://graph.microsoft.com/v1.0";
const box = owner => owner ? `/users/${encodeURIComponent(owner)}` : "/me";

class GraphFehler extends Error {
  constructor(status, daten, retryAfter){
    super("Graph " + status);
    this.status = status; this.daten = daten; this.retryAfter = retryAfter;
    const e = daten && daten.error;
    this.gcode = (e && e.code) || ""; this.gmsg = (e && e.message) || "";
  }
  get text(){
    switch (this.status){
      case 401: return "Anmeldung abgelaufen — bitte neu anmelden.";
      case 403: return /shared|delegat|access is denied/i.test(this.gmsg) || /ErrorAccessDenied/i.test(this.gcode)
        ? "Keine Berechtigung für dieses Postfach. Nötig sind die Scopes Mail.ReadWrite.Shared und Mail.Send.Shared — und eine echte Delegation in Microsoft 365."
        : "Zugriff verweigert" + (this.gmsg ? ": " + this.gmsg : ".");
      case 404: return "Nicht gefunden — Postfach oder Nachricht existiert nicht (mehr).";
      case 429: return "Microsoft bremst gerade" + (this.retryAfter ? ` — in ${this.retryAfter} s erneut versuchen.` : ".");
      case 413: return "Nachricht zu groß.";
      default:
        if (this.status >= 500) return "Microsoft antwortet nicht (Fehler " + this.status + "). Später erneut.";
        return (this.gmsg || "Anfrage fehlgeschlagen") + ` (${this.status})`;
    }
  }
}
async function graph(pfad, opts){
  const o = opts || {};
  const t = await token();
  const kopf = { Authorization:"Bearer " + t };
  if (o.body) kopf["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(GBASE + pfad, { method:o.method || "GET", headers:kopf,
      body:o.body ? JSON.stringify(o.body) : undefined });
  } catch { throw new GraphFehler(0, null, null); }
  if (r.status === 204 || r.status === 202) return null;
  const rohtext = await r.text();
  let daten = null;
  if (rohtext){ try { daten = JSON.parse(rohtext); } catch { daten = { error:{ code:"parse", message:rohtext.slice(0, 300) } }; } }
  if (!r.ok) throw new GraphFehler(r.status, daten, r.headers.get("Retry-After"));
  return daten;
}
const empf = liste => String(liste || "").split(/[,;]/).map(s => s.trim()).filter(s => s.includes("@"))
  .map(a => ({ emailAddress:{ address:a } }));
const adrVon = m => (m && m.from && m.from.emailAddress) || (m && m.sender && m.sender.emailAddress) || {};

/* --------------------------------- Laden --------------------------------- */
const SELECT_LISTE = "id,subject,from,sender,receivedDateTime,bodyPreview,isRead,hasAttachments,webLink";
async function mailsLaden(){
  if (!ST.konto) return;
  ST.laden = true; ST.fehler = null; render();
  try {
    const p = `${box(ST.aktivesPostfach)}/mailFolders/inbox/messages` +
      `?$select=${SELECT_LISTE}&$top=25&$orderby=${encodeURIComponent("receivedDateTime desc")}`;
    const d = await graph(p);
    ST.mails = (d && d.value) || [];
  } catch (e){
    ST.mails = [];
    ST.fehler = e instanceof GraphFehler ? e : new GraphFehler(0, null, null);
  }
  ST.laden = false; render();
}
async function mailOeffnen(m){
  ST.view = "lesen"; ST.offen = { ...m }; ST.offenLaden = true;
  ST.antwort = ""; ST.htmlAnsicht = false; render();
  try {
    const d = await graph(`${box(ST.aktivesPostfach)}/messages/${encodeURIComponent(m.id)}` +
      `?$select=id,subject,from,sender,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,webLink`);
    ST.offen = { ...m, ...d };
    if (!m.isRead){
      graph(`${box(ST.aktivesPostfach)}/messages/${encodeURIComponent(m.id)}`, { method:"PATCH", body:{ isRead:true } })
        .then(() => { const x = ST.mails.find(y => y.id === m.id); if (x) x.isRead = true; })
        .catch(() => {});
    }
  } catch (e){ ST.offen.fehler = e; }
  ST.offenLaden = false; render();
}

/* -------------------------------- Senden --------------------------------- */
/** Antwort über createReply → Text voranstellen (Zitat bleibt) → senden oder als Entwurf lassen. */
async function antwortAbschicken(nurEntwurf){
  const m = ST.offen; if (!m || !ST.antwort.trim()) return;
  ST.senden = true; render();
  const sc = box(ST.aktivesPostfach);
  const aktion = ST.antwortAn === "alle" ? "createReplyAll" : "createReply";
  try {
    const entwurf = await graph(`${sc}/messages/${encodeURIComponent(m.id)}/${aktion}`, { method:"POST" });
    if (!entwurf || !entwurf.id) throw new GraphFehler(0, null, null);
    const meinText = `<div style="font-family:Aptos,Calibri,sans-serif;font-size:11pt">` +
      escHtml(ST.antwort).replace(/\n/g, "<br>") + `</div><br>`;
    const zitat = (entwurf.body && entwurf.body.content) || "";
    await graph(`${sc}/messages/${encodeURIComponent(entwurf.id)}`, {
      method:"PATCH", body:{ body:{ contentType:"HTML", content:meinText + zitat } } });
    if (nurEntwurf){
      toast("Entwurf liegt in Outlook.");
    } else {
      await graph(`${sc}/messages/${encodeURIComponent(entwurf.id)}/send`, { method:"POST" });
      toast("Gesendet.");
      ST.antwort = ""; ST.view = "liste"; mailsLaden();
    }
  } catch (e){ toast(e instanceof GraphFehler ? e.text : "Senden fehlgeschlagen.", "bad"); }
  ST.senden = false; render();
}
async function neueMailSenden(nurEntwurf){
  const n = ST.neu;
  const an = empf(n.an);
  if (!an.length){ toast("Mindestens eine gültige Empfängeradresse angeben.", "bad"); return; }
  ST.senden = true; render();
  const sc = box(ST.aktivesPostfach);
  const nachricht = {
    subject: n.betreff || "(kein Betreff)",
    body: { contentType:"HTML", content:`<div style="font-family:Aptos,Calibri,sans-serif;font-size:11pt">` +
      escHtml(n.text).replace(/\n/g, "<br>") + `</div>` },
    toRecipients: an,
    ccRecipients: empf(n.cc)
  };
  try {
    if (nurEntwurf){
      await graph(`${sc}/messages`, { method:"POST", body:nachricht });
      toast("Entwurf liegt in Outlook.");
    } else {
      await graph(`${sc}/sendMail`, { method:"POST", body:{ message:nachricht, saveToSentItems:true } });
      toast("Gesendet.");
      ST.neu = { an:"", cc:"", betreff:"", text:"" }; ST.view = "liste"; mailsLaden();
    }
  } catch (e){ toast(e instanceof GraphFehler ? e.text : "Senden fehlgeschlagen.", "bad"); }
  ST.senden = false; render();
}

/* ------------------ Entwurfshilfe über den EF-Proxy (optional) ------------ */
async function entwurfVorschlagen(art){
  if (!CFG.proxyUrl || !CFG.proxyToken){ toast("Entwurfshilfe ist nicht eingerichtet (Einstellungen).", "bad"); return; }
  const m = ST.offen; if (!m) return;
  ST.entwerfen = true; render();
  const original = htmlToText((m.body && m.body.content) || m.bodyPreview || "").slice(0, 5000);
  const ziel = art === "kurz"
    ? "Formuliere eine sehr kurze, freundliche Zusage oder Bestätigung (2 bis 3 Sätze)."
    : "Formuliere eine vollständige, sachliche Antwort. So kurz wie möglich, so konkret wie nötig.";
  try {
    const r = await fetch(CFG.proxyUrl.replace(/\/+$/, "") + "/v1/chat/completions", {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:"Bearer " + CFG.proxyToken },
      body: JSON.stringify({
        model: "ef-proxy/" + (CFG.proxyRolle || "standard"),
        stream: false,
        messages: [
          { role:"system", content:
            "Du schreibst im Namen einer Lehrkraft an einem Gymnasium in NRW E-Mail-Antworten auf Deutsch. " +
            "Ton: kollegial, direkt, ehrlich, ohne Floskeln, ohne Hype, ohne Emojis. Keine erfundenen Zusagen, " +
            "Termine oder Zahlen — offene Punkte als Frage formulieren. Gib nur den Mailtext aus, " +
            "ohne Betreffzeile." },
          { role:"user", content:`${ziel}\n\nBetreff: ${m.subject || ""}\nVon: ${adrVon(m).address || ""}\n\nNachricht:\n${original}` }
        ]
      })
    });
    const txt = await r.text();
    let d = null; try { d = txt ? JSON.parse(txt) : null; } catch {}
    if (!r.ok){
      const msg = (d && (d.detail || d.message || (d.error && d.error.message))) || `Proxy antwortet mit ${r.status}`;
      toast(String(msg).slice(0, 200), "bad");
    } else {
      const inhalt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (inhalt){ ST.antwort = String(inhalt).trim(); toast("Entwurf eingefügt — bitte prüfen."); }
      else toast("Der Proxy hat keinen Text geliefert.", "bad");
    }
  } catch { toast("Proxy nicht erreichbar.", "bad"); }
  ST.entwerfen = false; render();
}

/* ------------------------------- Oberfläche ------------------------------ */
function render(){
  const app = clear($("#app"));
  const acc = $("#acc");
  acc.textContent = ST.konto ? (ST.konto.username || "") : "";
  $("#btnReload").classList.toggle("hide", !ST.konto || ST.view === "einstellungen" || ST.view === "setup");
  const alteBar = $(".bar"); if (alteBar) alteBar.remove();
  const alterFab = $(".fab"); if (alterFab) alterFab.remove();

  if (ST.initFehler){ app.append(vInitFehler()); return; }
  if (!CFG.clientId){ app.append(vSetup()); return; }
  if (ST.view === "einstellungen"){ app.append(vEinstellungen()); return; }
  if (!ST.konto){ app.append(vLogin()); return; }

  if (ST.view === "lesen") app.append(vLesen());
  else if (ST.view === "neu") app.append(vNeu());
  else app.append(vListe());
}
function notiz(art, marke, ...inhalt){
  return el("div", { class:"note", "data-k":art }, el("span", { class:"note__b", text:marke }), el("div", null, ...inhalt));
}
function vInitFehler(){
  return el("div", { class:"stack" },
    el("h1", { text:"Start fehlgeschlagen" }),
    notiz("warn", "Fehler", el("div", { text:ST.initFehler })),
    el("button", { class:"btn btn--ghost", onclick:() => location.reload(), text:"Neu laden" }));
}

/* -- Ersteinrichtung -- */
function vSetup(){
  const cid = el("input", { type:"text", inputmode:"text", autocapitalize:"off", autocomplete:"off",
    placeholder:"00000000-0000-0000-0000-000000000000", value:CFG.clientId });
  const auth = el("input", { type:"text", autocapitalize:"off", autocomplete:"off", value:CFG.authority });
  const shared = el("input", { type:"checkbox", checked:CFG.geteilteScopes });
  return el("div", { class:"stack" },
    el("div", null, el("div", { class:"eyebrow", text:"Ersteinrichtung" }), el("h1", { text:"Schulpost verbinden" }),
      el("p", { class:"lede", text:"Einmalig die Kennungen deiner Azure-App eintragen. Ein Secret gibt es hier nicht — dieser Client arbeitet mit PKCE." })),

    notiz("info", "Azure", el("div", { html:"Trage in der App-Registrierung unter <b>Authentifizierung</b> eine Plattform <b>„Single-page application“</b> mit genau dieser Redirect-URI ein:" }),
      el("div", { class:"mono", style:"margin-top:8px; overflow-wrap:anywhere; font-size:12.5px", text:redirectUri() }),
      el("div", { style:"margin-top:9px" },
        el("button", { class:"btn btn--ghost btn--sm", onclick:async () => {
          try { await navigator.clipboard.writeText(redirectUri()); toast("Redirect-URI kopiert."); }
          catch { toast("Kopieren nicht erlaubt — Text markieren.", "bad"); }
        }, text:"Redirect-URI kopieren" }))),

    el("div", { class:"card card--pad stack" },
      el("label", { class:"fld" }, "Application (client) ID", cid),
      el("label", { class:"fld" }, "Authority", auth),
      el("div", { class:"small", text:"Für einen reinen Schul-Tenant ist „…/organizations“ passend, alternativ die konkrete Tenant-ID." }),
      el("label", { class:"switch" }, shared,
        el("span", { html:"Freigegebene Postfächer nutzen (fordert zusätzlich <code>Mail.ReadWrite.Shared</code> und <code>Mail.Send.Shared</code> an)" })),
      el("button", { class:"btn", onclick:async () => {
        const v = cid.value.trim();
        if (!/^[0-9a-f-]{30,40}$/i.test(v)){ toast("Die Client-ID sieht nicht wie eine GUID aus.", "bad"); return; }
        CFG.clientId = v; CFG.authority = auth.value.trim() || CFG_STD.authority;
        CFG.geteilteScopes = shared.checked; cfgSpeichern();
        await start(true);
      }, text:"Speichern und anmelden" })),

    notiz("law", "Datenschutz", el("div", { text:"Diese Seite ist ein Client, kein Server: Mails laufen direkt zwischen deinem Gerät und Microsoft. Es gibt keinen Zwischenspeicher bei mir und keine Weitergabe an Dritte." })));
}

/* -- Anmeldung -- */
function vLogin(){
  return el("div", { class:"stack" },
    el("div", null, el("div", { class:"eyebrow", text:"Angemeldet bleiben" }), el("h1", { text:"Mit Microsoft anmelden" }),
      el("p", { class:"lede", text:"Danach bleibt die Anmeldung auf diesem Gerät erhalten — auch wenn du die App vom Homescreen startest." })),
    el("button", { class:"btn btn--block", onclick:anmelden, text:"Anmelden" }),
    el("div", { class:"row" },
      el("button", { class:"btn btn--ghost btn--sm", onclick:() => { ST.view = "einstellungen"; render(); }, text:"Einstellungen" }),
      el("span", { class:"small", text:CFG.loginArt === "popup" ? "Popup-Anmeldung" : "Weiterleitung" })),
    notiz("info", "Scopes", el("div", { text:"Angefordert werden: " + scopes().join(", ") + "." })));
}

/* -- Posteingang -- */
function vListe(){
  const w = el("div", { class:"stack" });
  const faecher = [{ mail:null, label:"Eigenes" }, ...(CFG.postfaecher || [])];
  if (faecher.length > 1) w.append(el("div", { class:"tabs" }, ...faecher.map(f =>
    el("button", { "aria-current":String((ST.aktivesPostfach || null) === (f.mail || null)),
      onclick:() => { ST.aktivesPostfach = f.mail || null; mailsLaden(); }, text:f.label || f.mail }))));

  if (ST.laden){
    w.append(el("div", { class:"list" }, ...Array.from({ length:6 }, () =>
      el("div", { class:"mail" }, el("div", { class:"mail__m" },
        el("div", { class:"skel", style:"width:34%;height:10px" }),
        el("div", { class:"skel", style:"width:72%" }))))));
  } else if (ST.fehler){
    w.append(notiz("warn", "Fehler", el("div", { text:ST.fehler.text }),
      ST.fehler.status === 401
        ? el("div", { style:"margin-top:9px" }, el("button", { class:"btn btn--sm", onclick:anmelden, text:"Neu anmelden" }))
        : el("div", { style:"margin-top:9px" }, el("button", { class:"btn btn--ghost btn--sm", onclick:mailsLaden, text:"Erneut versuchen" }))));
  } else if (!ST.mails.length){
    w.append(el("div", { class:"empty", text:"Posteingang leer." }));
  } else {
    const ungelesen = ST.mails.filter(m => !m.isRead).length;
    w.append(el("div", { class:"row", style:"justify-content:space-between" },
      el("span", { class:"eyebrow", text:(ST.aktivesPostfach || ST.konto.username || "Posteingang") }),
      ungelesen ? el("span", { class:"chip", "data-tone":"amber", text:ungelesen + " neu" }) : null));
    w.append(el("div", { class:"list" }, ...ST.mails.map(m => {
      const a = adrVon(m);
      return el("button", { class:"mail", "data-unread":m.isRead ? "0" : "1", onclick:() => mailOeffnen(m) },
        el("div", { class:"mail__m" },
          el("div", { class:"mail__f", text:a.name || a.address || "" }),
          el("div", { class:"mail__s", text:m.subject || "(kein Betreff)" }),
          m.bodyPreview ? el("div", { class:"mail__p", text:String(m.bodyPreview).replace(/\s+/g, " ").slice(0, 200) }) : null),
        el("div", { class:"mail__d" }, fmtWann(m.receivedDateTime),
          m.hasAttachments ? el("div", { style:"margin-top:3px", text:"📎" }) : null));
    })));
  }
  document.body.append(el("button", { class:"fab", "aria-label":"Neue Nachricht", title:"Neue Nachricht",
    onclick:() => { ST.view = "neu"; render(); }, text:"✎" }));
  return w;
}

/* -- Lesen und antworten -- */
function vLesen(){
  const m = ST.offen || {};
  const a = adrVon(m);
  const w = el("div", { class:"stack" });

  w.append(el("button", { class:"btn btn--ghost btn--sm", style:"align-self:flex-start",
    onclick:() => { ST.view = "liste"; ST.offen = null; render(); }, text:"‹ Posteingang" }));

  w.append(el("div", null,
    el("h1", { style:"font-size:20px", text:m.subject || "(kein Betreff)" }),
    el("div", { class:"metaline", style:"margin-top:7px" },
      el("span", { class:"mono", text:a.address || "" }),
      el("span", { text:fmtVoll(m.receivedDateTime) }),
      ST.aktivesPostfach ? el("span", { class:"chip", "data-tone":"ink", text:ST.aktivesPostfach }) : null)));

  if (m.fehler) w.append(notiz("warn", "Fehler", el("div", { text:m.fehler instanceof GraphFehler ? m.fehler.text : "Nachricht konnte nicht geladen werden." })));

  if (ST.offenLaden){
    w.append(el("div", { class:"stack" }, el("div", { class:"skel", style:"width:90%" }),
      el("div", { class:"skel", style:"width:75%" }), el("div", { class:"skel", style:"width:82%" })));
  } else {
    const hatHtml = m.body && String(m.body.contentType).toLowerCase() === "html" && m.body.content;
    w.append(el("div", { class:"row", style:"justify-content:space-between" },
      el("span", { class:"eyebrow", text:"Nachricht" }),
      hatHtml ? el("button", { class:"btn btn--ghost btn--sm",
        onclick:() => { ST.htmlAnsicht = !ST.htmlAnsicht; render(); },
        text:ST.htmlAnsicht ? "Als Text" : "Formatiert" }) : null));
    if (hatHtml && ST.htmlAnsicht) w.append(htmlRahmen(m.body.content));
    else w.append(el("pre", { class:"body-text",
      text:htmlToText((m.body && m.body.content) || "") || m.bodyPreview || "(kein Textinhalt)" }));
    if (hatHtml && ST.htmlAnsicht && !CFG.bilderLaden)
      w.append(el("div", { class:"small", text:"Externe Bilder sind blockiert (Tracking-Pixel). Umschaltbar in den Einstellungen." }));
    if (m.hasAttachments) w.append(el("div", { class:"small", text:"Diese Nachricht hat Anhänge — die zeigt diese App noch nicht. Über „In Outlook öffnen“ kommst du dran." }));
  }

  // Antwortfeld
  const ta = el("textarea", { rows:"7", placeholder:"Antwort schreiben …",
    oninput:e => { ST.antwort = e.target.value; } });
  ta.value = ST.antwort;
  const anAlle = el("select", { onchange:e => { ST.antwortAn = e.target.value; } },
    el("option", { value:"alle", text:"Allen antworten", selected:ST.antwortAn === "alle" }),
    el("option", { value:"absender", text:"Nur dem Absender", selected:ST.antwortAn === "absender" }));

  w.append(el("div", { class:"card card--pad stack" },
    el("div", { class:"row", style:"justify-content:space-between" },
      el("span", { class:"eyebrow", text:"Antwort" }), anAlle),
    ta,
    CFG.proxyUrl && CFG.proxyToken ? el("div", { class:"row" },
      el("button", { class:"btn btn--ghost btn--sm", disabled:ST.entwerfen,
        onclick:() => entwurfVorschlagen("normal"), text:ST.entwerfen ? "Formuliert …" : "Entwurf vorschlagen" }),
      el("button", { class:"btn btn--ghost btn--sm", disabled:ST.entwerfen,
        onclick:() => entwurfVorschlagen("kurz"), text:"Kurz zusagen" })) : null,
    CFG.proxyUrl && CFG.proxyToken
      ? el("div", { class:"small", text:"Die Entwurfshilfe schickt den Mailtext an deinen EF-Proxy (Mistral AI, Frankreich). Bei Schülerdaten vorher anonymisieren." })
      : null,
    m.webLink ? el("a", { class:"small", href:m.webLink, target:"_blank", rel:"noopener", text:"In Outlook Web öffnen" }) : null));

  document.body.append(el("div", { class:"bar" },
    el("button", { class:"btn", disabled:ST.senden || !ST.antwort.trim(), onclick:() => antwortAbschicken(false) },
      ST.senden ? el("span", { class:"spin" }) : null, ST.senden ? "Sendet" : "Senden"),
    el("button", { class:"btn btn--ghost", disabled:ST.senden || !ST.antwort.trim(),
      onclick:() => antwortAbschicken(true), text:"Als Entwurf" })));
  return w;
}
/** HTML-Mail in einem Sandkasten-iframe ohne Skripte anzeigen. */
function htmlRahmen(inhalt){
  const csp = CFG.bilderLaden
    ? "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:;"
    : "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;";
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style>html,body{margin:0;padding:12px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1B2430;background:#fff;overflow-wrap:anywhere}` +
    `img{max-width:100%;height:auto}table{max-width:100%}a{color:#0D3A6B}</style></head><body>${inhalt}</body></html>`;
  const f = el("iframe", { class:"body-html", sandbox:"", loading:"lazy", title:"Nachrichteninhalt", referrerpolicy:"no-referrer" });
  f.srcdoc = doc;
  return f;
}

/* -- Neue Nachricht -- */
function vNeu(){
  const n = ST.neu;
  const an = el("input", { type:"text", inputmode:"email", autocapitalize:"off", placeholder:"empfaenger@lfsm.de", value:n.an,
    oninput:e => { n.an = e.target.value; } });
  const cc = el("input", { type:"text", inputmode:"email", autocapitalize:"off", placeholder:"optional", value:n.cc,
    oninput:e => { n.cc = e.target.value; } });
  const be = el("input", { type:"text", placeholder:"Betreff", value:n.betreff, oninput:e => { n.betreff = e.target.value; } });
  const tx = el("textarea", { rows:"9", placeholder:"Text …", oninput:e => { n.text = e.target.value; } });
  tx.value = n.text;

  document.body.append(el("div", { class:"bar" },
    el("button", { class:"btn", disabled:ST.senden, onclick:() => neueMailSenden(false) },
      ST.senden ? el("span", { class:"spin" }) : null, ST.senden ? "Sendet" : "Senden"),
    el("button", { class:"btn btn--ghost", disabled:ST.senden, onclick:() => neueMailSenden(true), text:"Als Entwurf" })));

  return el("div", { class:"stack" },
    el("button", { class:"btn btn--ghost btn--sm", style:"align-self:flex-start",
      onclick:() => { ST.view = "liste"; render(); }, text:"‹ Abbrechen" }),
    el("div", null, el("div", { class:"eyebrow", text:"Absender: " + (ST.aktivesPostfach || ST.konto.username || "") }),
      el("h1", { style:"font-size:20px", text:"Neue Nachricht" })),
    ST.aktivesPostfach ? notiz("info", "Absender",
      el("div", { text:"Wird aus dem freigegebenen Postfach " + ST.aktivesPostfach + " gesendet. Das braucht Mail.Send.Shared und eine Delegation." })) : null,
    el("div", { class:"card card--pad stack" },
      el("label", { class:"fld" }, "An", an),
      el("label", { class:"fld" }, "Cc", cc),
      el("label", { class:"fld" }, "Betreff", be),
      el("label", { class:"fld" }, "Text", tx)));
}

/* -- Einstellungen -- */
function vEinstellungen(){
  const w = el("div", { class:"stack" });
  w.append(el("button", { class:"btn btn--ghost btn--sm", style:"align-self:flex-start",
    onclick:() => { ST.view = "liste"; render(); }, text:"‹ Zurück" }));
  w.append(el("div", null, el("div", { class:"eyebrow", text:"Konfiguration" }), el("h1", { text:"Einstellungen" })));

  // Konto
  w.append(el("div", { class:"card card--pad stack" },
    el("span", { class:"eyebrow", text:"Konto" }),
    el("div", { class:"mono", style:"font-size:13px; overflow-wrap:anywhere", text:ST.konto ? ST.konto.username : "nicht angemeldet" }),
    el("div", { class:"row" },
      ST.konto ? el("button", { class:"btn btn--danger btn--sm", onclick:abmelden, text:"Abmelden" })
               : el("button", { class:"btn btn--sm", onclick:anmelden, text:"Anmelden" }))));

  // Azure
  const cid = el("input", { type:"text", autocapitalize:"off", autocomplete:"off", value:CFG.clientId });
  const auth = el("input", { type:"text", autocapitalize:"off", autocomplete:"off", value:CFG.authority });
  const shared = el("input", { type:"checkbox", checked:CFG.geteilteScopes });
  const art = el("select", null,
    el("option", { value:"redirect", text:"Weiterleitung (empfohlen)", selected:CFG.loginArt === "redirect" }),
    el("option", { value:"popup", text:"Popup", selected:CFG.loginArt === "popup" }));
  const rdi = el("input", { type:"text", autocapitalize:"off", autocomplete:"off",
    placeholder:REDIRECT_STD, value:CFG.redirectUri || "" });
  w.append(el("div", { class:"card card--pad stack" },
    el("span", { class:"eyebrow", text:"Azure-App" }),
    el("label", { class:"fld" }, "Application (client) ID", cid),
    el("label", { class:"fld" }, "Authority", auth),
    el("label", { class:"fld" }, "Redirect-URI", rdi,
      el("span", { class:"small", style:"font-weight:400",
        text:"Leer lassen: wird aus der Adresse dieser Seite abgeleitet. Nur ausf\u00fcllen, wenn in Azure eine abweichende Schreibweise steht." })),
    el("label", { class:"fld" }, "Anmeldeart", art),
    el("label", { class:"switch" }, shared, el("span", { html:"Freigegebene Postfächer nutzen (<code>*.Shared</code>-Scopes)" })),
    el("div", { class:"small", style:"overflow-wrap:anywhere" }, "Redirect-URI für Azure: ", el("span", { class:"mono", text:redirectUri() })),
    el("button", { class:"btn btn--sm", onclick:async () => {
      const neuClient = cid.value.trim() !== CFG.clientId || auth.value.trim() !== CFG.authority
        || rdi.value.trim() !== (CFG.redirectUri || "");
      CFG.clientId = cid.value.trim(); CFG.authority = auth.value.trim() || CFG_STD.authority;
      CFG.redirectUri = rdi.value.trim();
      CFG.geteilteScopes = shared.checked; CFG.loginArt = art.value; cfgSpeichern();
      toast("Gespeichert.");
      if (neuClient) await start(true); else render();
    }, text:"Speichern" })));

  // Freigegebene Postfächer
  const pm = el("input", { type:"email", inputmode:"email", autocapitalize:"off", placeholder:"postfach@lfsm.de" });
  const pl = el("input", { type:"text", placeholder:"Bezeichnung (optional)" });
  w.append(el("div", { class:"card card--pad stack" },
    el("span", { class:"eyebrow", text:"Freigegebene Postfächer" }),
    (CFG.postfaecher || []).length
      ? el("div", { class:"row" }, ...CFG.postfaecher.map(p =>
          el("span", { class:"chip", "data-tone":"ink" }, p.label || p.mail,
            el("button", { style:"background:none;border:0;color:inherit;font-weight:700;cursor:pointer;padding:0 0 0 5px",
              "aria-label":`${p.label || p.mail} entfernen`,
              onclick:() => { CFG.postfaecher = CFG.postfaecher.filter(x => x.mail !== p.mail); cfgSpeichern();
                if (ST.aktivesPostfach === p.mail) ST.aktivesPostfach = null; render(); }, text:"×" }))))
      : el("div", { class:"small", text:"Keins hinterlegt — nur das eigene Postfach." }),
    el("label", { class:"fld" }, "Adresse", pm),
    el("label", { class:"fld" }, "Bezeichnung", pl),
    el("button", { class:"btn btn--sm", onclick:() => {
      const a = pm.value.trim().toLowerCase();
      if (!a.includes("@")){ toast("Bitte eine vollständige Adresse.", "bad"); return; }
      if ((CFG.postfaecher || []).some(x => x.mail === a)){ toast("Steht schon in der Liste.", "bad"); return; }
      CFG.postfaecher = [...(CFG.postfaecher || []), { mail:a, label:pl.value.trim() || a }];
      cfgSpeichern(); pm.value = ""; pl.value = "";
      if (!CFG.geteilteScopes) toast("Aktiviere oben die *.Shared-Scopes, sonst verweigert Microsoft den Zugriff.", "bad");
      else render();
    }, text:"Hinzufügen" })));

  // Entwurfshilfe
  const pu = el("input", { type:"url", inputmode:"url", autocapitalize:"off", placeholder:"https://…", value:CFG.proxyUrl });
  const pt = el("input", { type:"password", autocomplete:"off", placeholder:"Login-Token", value:CFG.proxyToken });
  const pr = el("select", null, ...["standard", "aufgaben", "leicht", "tool_ketten"].map(r =>
    el("option", { value:r, text:r, selected:CFG.proxyRolle === r })));
  w.append(el("div", { class:"card card--pad stack" },
    el("span", { class:"eyebrow", text:"Entwurfshilfe (optional)" }),
    el("div", { class:"small", text:"Nutzt den EF-Proxy aus Lehrer-KI. Ohne Eintrag bleibt die Funktion aus." }),
    el("label", { class:"fld" }, "Proxy-URL", pu),
    el("label", { class:"fld" }, "Login-Token", pt),
    el("label", { class:"fld" }, "Rolle", pr),
    el("button", { class:"btn btn--sm", onclick:() => {
      CFG.proxyUrl = pu.value.trim(); CFG.proxyToken = pt.value.trim(); CFG.proxyRolle = pr.value;
      cfgSpeichern(); toast("Gespeichert."); render();
    }, text:"Speichern" })));

  // Anzeige
  const bilder = el("input", { type:"checkbox", checked:CFG.bilderLaden });
  w.append(el("div", { class:"card card--pad stack" },
    el("span", { class:"eyebrow", text:"Anzeige" }),
    el("label", { class:"switch" }, bilder,
      el("span", { text:"Externe Bilder in HTML-Mails laden. Aus heißt: Tracking-Pixel bleiben blind." })),
    el("button", { class:"btn btn--sm", onclick:() => { CFG.bilderLaden = bilder.checked; cfgSpeichern(); toast("Gespeichert."); render(); }, text:"Speichern" })));

  w.append(notiz("info", "Version", el("div", { text:"MSAL " + (msal.version || "?") + " · Graph v1.0 · Redirect: " + redirectUri() })));
  w.append(el("button", { class:"btn btn--danger", onclick:() => {
    if (!confirm("Alle Einstellungen dieses Geräts löschen? Die Anmeldung bleibt bestehen, bis du dich abmeldest.")) return;
    try { localStorage.removeItem(CKEY); } catch {}
    cfgLaden(); toast("Zurückgesetzt."); ST.view = "liste"; render();
  }, text:"Einstellungen zurücksetzen" }));
  return w;
}

/* --------------------------------- Start --------------------------------- */
function nachLogin(){ ST.view = "liste"; mailsLaden(); uebergabeAnwenden(); }

async function start(neuAufbauen){
  cfgLaden();
  if (!CFG.clientId){ render(); return; }
  try {
    if (!ST.app || neuAufbauen) ST.app = await msalStarten();
  } catch (e){ ST.initFehler = authFehlerText(e); render(); return; }
  if (!ST.app){ render(); return; }
  try {
    const r = await ST.app.handleRedirectPromise();
    if (r && r.account) ST.app.setActiveAccount(r.account);
  } catch (e){ toast(authFehlerText(e), "bad"); }
  const konten = ST.app.getAllAccounts();
  ST.konto = ST.app.getActiveAccount() || konten[0] || null;
  if (ST.konto && !ST.app.getActiveAccount()) ST.app.setActiveAccount(ST.konto);
  render();
  if (ST.konto){ mailsLaden(); uebergabeAnwenden(); }
}

/** Einen aus dem Cockpit übergebenen Entwurf öffnen. */
async function uebergabeAnwenden(){
  const u = uebergabeHolen();
  if (!u) return;
  if (u.owner && (CFG.postfaecher || []).some(p => p.mail === u.owner)) ST.aktivesPostfach = u.owner;
  if (u.reply){
    ST.view = "lesen"; ST.offenLaden = true;
    ST.offen = { id:u.reply, subject:u.subject || "", receivedDateTime:null };
    ST.antwort = u.body || ""; ST.antwortAn = u.alle ? "alle" : "absender";
    render();
    try {
      const d = await graph(`${box(ST.aktivesPostfach)}/messages/${encodeURIComponent(u.reply)}` +
        `?$select=id,subject,from,sender,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,webLink`);
      ST.offen = { ...d };
    } catch (e){
      ST.offen.fehler = e instanceof GraphFehler ? e : new GraphFehler(0, null, null);
    }
    ST.offenLaden = false;
    toast(u.body ? "Entwurf aus dem Cockpit übernommen — bitte prüfen." : "Nachricht geöffnet.");
    render();
  } else {
    ST.view = "neu";
    ST.neu = { an:u.to || "", cc:"", betreff:u.subject || "", text:u.body || "" };
    render();
    toast("Entwurf aus dem Cockpit übernommen — bitte prüfen.");
  }
}

$("#btnSet").addEventListener("click", () => {
  ST.view = ST.view === "einstellungen" ? "liste" : "einstellungen"; render();
});
$("#btnReload").addEventListener("click", () => {
  if (ST.view === "lesen" && ST.offen) mailOeffnen(ST.offen); else mailsLaden();
});
window.addEventListener("keydown", e => {
  if (e.key === "Escape" && (ST.view === "lesen" || ST.view === "neu")){ ST.view = "liste"; render(); }
});

start(false);

if ("serviceWorker" in navigator)
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
