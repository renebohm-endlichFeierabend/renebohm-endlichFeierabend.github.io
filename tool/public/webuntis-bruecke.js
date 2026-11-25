/* WebUntis-Brücke des Feierabend-Notenbuchs (Lesezeichen-Knopf).
 *
 * Läuft auf einer geöffneten WebUntis-Seite der Lehrkraft und nutzt deren Anmeldung. Es werden keine
 * Zugangsdaten gespeichert oder versendet; außer WebUntis selbst wird nichts aufgerufen.
 * Ablauf: Übertragungscode aus dem Notenbuch einfügen → Kurs, Quelle, Ziel wählen → Vorschau →
 * eintragen → Kontrolle an der Notenmatrix.
 *
 * Benutzt werden die Aufrufe der WebUntis-Oberfläche (keine offizielle Schnittstelle, Stand 11/2026):
 * lessonlist.do, api/classreg/gradesmatrix/{meta,data}, api/classreg/grade/gradeEditor/meta,
 * POST api/classreg/grade/grade (wie der Dialog „Note eintragen“).
 */
(function () {
  'use strict';
  if (window.__lehrertoolBruecke) { window.__lehrertoolBruecke.zeigen(); return; }
  if (!/\.webuntis\.com$/.test(location.hostname)) {
    alert('Bitte zuerst WebUntis öffnen und anmelden, dann den Knopf antippen.');
    return;
  }

  const BASIS = location.origin + '/WebUntis';
  const SKALA = [[0.7, '1+'], [1, '1'], [1.3, '1-'], [1.7, '2+'], [2, '2'], [2.3, '2-'], [2.7, '3+'], [3, '3'],
    [3.3, '3-'], [3.7, '4+'], [4, '4'], [4.3, '4-'], [4.7, '5+'], [5, '5'], [5.3, '5-'], [6, '6']];
  let csrf = '', tenant = '';

  // ---------------------------------------------------------------- WebUntis
  async function vorbereiten() {
    const r = await fetch(BASIS + '/embedded.do?showSidebar=false', { credentials: 'same-origin' });
    const t = await r.text();
    const m = t.match(/"csrfToken":"([^"]+)"/);
    if (!m) throw new Error('Nicht in WebUntis angemeldet. Bitte erst anmelden.');
    csrf = m[1];
    const tn = t.match(/"tenantId":"?(\d+)/);
    tenant = tn ? tn[1] : '';
  }
  function kopf(schreibend) {
    const h = { Accept: 'application/json' };
    if (tenant) h['Tenant-Id'] = tenant;
    if (schreibend) { h['Content-Type'] = 'application/json'; h['X-CSRF-TOKEN'] = csrf; }
    return h;
  }
  async function api(methode, pfad, params, body) {
    const url = new URL(BASIS + '/' + pfad);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url, { method: methode, credentials: 'same-origin', headers: kopf(methode !== 'GET'),
      body: body ? JSON.stringify(body) : undefined });
    let j = null;
    try { j = await r.json(); } catch (e) { /* kein JSON */ }
    if (!r.ok || !j || j.errors) {
      const f = j && (j.errors || j.errorMessage);
      throw new Error('WebUntis meldet einen Fehler' + (f ? ': ' + JSON.stringify(f).slice(0, 200) : ' (' + r.status + ')'));
    }
    return j.data !== undefined ? j.data : j;
  }
  async function kurse() {
    const r = await fetch(BASIS + '/lessonlist.do?my=true', { credentials: 'same-origin' });
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const aus = [];
    doc.querySelectorAll('tr').forEach((tr) => {
      const m = tr.innerHTML.match(/lessonstudentlist\?lsid=(\d+)/);
      if (!m) return;
      const zellen = [...tr.children].map((td) => {
        const c = td.cloneNode(true); c.querySelectorAll('tooltip,script').forEach((x) => x.remove());
        return c.textContent.replace(/\s+/g, ' ').trim();
      });
      const tipps = [...tr.querySelectorAll('tooltip')].map((x) => x.textContent.trim());
      if (zellen.length < 6 || zellen[2] !== 'Unterricht') return;
      const klassen = tipps[0] || zellen[3];
      if (!klassen || klassen.length > 20 || zellen[5] === 'AUFSICHT') return;
      aus.push({ lsId: +m[1], klassen, gruppe: zellen[4], fach: zellen[5], fachname: tipps[1] || zellen[5] });
    });
    return aus;
  }
  async function schuelerliste(lsId) {
    const d = new Date(), heute = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const r = await fetch(`${BASIS}/lessonstudentlist.do?lsid=${lsId}&startDate=${heute}`, { credentials: 'same-origin' });
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const kopf = [...doc.querySelectorAll('th')].map((x) => x.textContent.trim());
    const iN = kopf.indexOf('Familienname'), iV = kopf.indexOf('Vorname'), iA = kopf.indexOf('Austrittsdatum');
    if (iN < 0 || iV < 0) throw new Error('Schülerliste hat ein unbekanntes Format.');
    const aus = [];
    doc.querySelectorAll('tr').forEach((tr) => {
      const m = tr.innerHTML.match(/studentId=(\d+)/);
      const z = [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
      if (!m || z.length <= Math.max(iN, iV)) return;
      aus.push({ nachname: z[iN], vorname: z[iV], austritt: iA >= 0 ? z[iA] : '' });
    });
    return aus;
  }
  const isoDatum = (n) => { const s = String(n || ''); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
  async function matrix(lsId) {
    const meta = await api('GET', 'api/classreg/gradesmatrix/meta', { lessonId: lsId });
    const daten = await api('GET', 'api/classreg/gradesmatrix/data', { lsId, schoolyearOrSemesterId: meta.schoolyear.id });
    const rows = daten.rows || [];
    if (!rows.length) throw new Error('Der Kurs hat keine Schüler.');
    const ed = await api('GET', 'api/classreg/grade/gradeEditor/meta',
      { lessonId: lsId, studentId: rows[0].student.id, examId: -1, gradeId: -1, periodId: -1 });
    const schemata = ed.markSchemata || [];
    const schema = schemata.find((x) => x.id === ed.defaultMarkSchemaId) || schemata[0];
    return {
      lsId, darfAnlegen: !!meta.canCreateGrade,
      arten: (ed.examTypes || []).map((e) => ({ id: e.id, name: e.longname || e.name })),
      pruefungen: (daten.gradeColumns || []).filter((c) => c.exam).map((c) => ({ examId: c.exam.id, name: c.exam.name,
        datum: isoDatum(c.exam.date), examTypeId: c.examType.id, art: c.examType.longname || c.examType.name })),
      schema: schema ? { id: schema.id, noten: schema.marks.map((m) => ({ id: m.id, name: m.name })) } : null,
      schueler: rows.map((r) => ({ id: r.student.id, name: r.student.name,
        noten: Object.values(r.grades || {}).map((g) => ({ id: g.id, examTypeId: g.examTypeId,
          examId: (g.exam && g.exam.id) || g.examId || 0, note: g.mark.name, datum: isoDatum(g.date) })) })),
    };
  }

  // ---------------------------------------------------------------- Lehrer-Tool-Daten
  function leseCode(text) {
    const roh = text.trim().replace(/^LT1:/, '');
    let j;
    try { j = JSON.parse(decodeURIComponent(escape(atob(roh)))); } catch (e) { throw new Error('Der Code ist unvollständig. Bitte im Notenbuch neu kopieren.'); }
    if (j.v !== 1 || !Array.isArray(j.schueler)) throw new Error('Unbekanntes Code-Format.');
    return j;
  }
  const basisLabel = (l) => l.replace(/\s*\(.*\)\s*$/, '').trim();
  function quellen(code) {
    const somi = new Set(), exam = new Set();
    code.schueler.forEach((s) => s.noten.forEach((g) => (g.typ === 'exam' ? exam : somi).add(basisLabel(g.label))));
    const schnitt = (gs) => {
      const w = gs.reduce((a, g) => a + (g.weight ?? 1), 0);
      return w ? gs.reduce((a, g) => a + g.value * (g.weight ?? 1), 0) / w : null;
    };
    const eintagig = (gs) => { const t = [...new Set(gs.map((g) => g.date.slice(0, 10)))]; return t.length === 1 ? t[0] : ''; };
    // SoMi-Arten des Kurses: erst Schnitt je Art, dann nach Gewicht (wie im Notenbuch)
    const arten = Array.isArray(code.somiArten) ? code.somiArten : [];
    const n2 = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const artVon = (l) => { const t = arten.filter((a) => n2(l).startsWith(n2(a.name))).sort((a, b) => b.name.length - a.name.length); return t.length ? t[0].name : null; };
    const somiSchnitt = (gs) => {
      if (!gs.length) return null;
      if (!arten.length) return schnitt(gs);
      const mittel = arten.reduce((a, x) => a + x.gewicht, 0) / arten.length;
      const grp = new Map();
      gs.forEach((g) => { const k = artVon(g.label) || '?' + basisLabel(g.label); grp.set(k, [...(grp.get(k) || []), g]); });
      let su = 0, wi = 0;
      grp.forEach((l, k) => { const w = k.startsWith('?') ? mittel : arten.find((a) => a.name === k).gewicht; const v = schnitt(l); if (v != null && w > 0) { su += v * w; wi += w; } });
      return wi ? su / wi : null;
    };
    const q = [];
    [...somi].sort().forEach((l) => q.push({ key: 's:' + l, titel: 'SoMi: ' + l, wert: (s) => {
      const gs = s.noten.filter((g) => g.typ !== 'exam' && basisLabel(g.label) === l); return { v: schnitt(gs), d: eintagig(gs) }; } }));
    [...exam].sort().forEach((l) => q.push({ key: 'e:' + l, titel: 'Klausur: ' + l, wert: (s) => {
      const gs = s.noten.filter((g) => g.typ === 'exam' && basisLabel(g.label) === l);
      return { v: gs.length ? gs.reduce((a, g) => a + g.value, 0) / gs.length : null, d: eintagig(gs) }; } }));
    if (somi.size) q.push({ key: 'schnitt', titel: 'SoMi-Schnitt ' + (code.zeitraum || '') + (arten.length ? ' (gewichtet)' : ''), wert: (s) => ({ v: somiSchnitt(s.noten.filter((g) => g.typ !== 'exam')), d: '' }) });
    return q;
  }
  // Nächste Stufe; liegt der Wert genau zwischen zwei Stufen, entscheidet die Lehrkraft (wahl).
  function zuNote(v) {
    const s = [...SKALA].sort((a, b) => Math.abs(a[0] - v) - Math.abs(b[0] - v));
    if (Math.abs(Math.abs(s[0][0] - v) - Math.abs(s[1][0] - v)) < 1e-6) {
      const [a, b] = s[0][0] < s[1][0] ? [s[0], s[1]] : [s[1], s[0]];
      return { note: '', wahl: [a[1], b[1]] };
    }
    return { note: s[0][1], wahl: null };
  }
  const norm = (s) => s.toLowerCase().replace(/[(),.]/g, ' ').replace(/\s+/g, ' ').trim();
  function finde(name, liste) {
    const n = norm(name);
    const ex = liste.find((u) => norm(u.name) === n);
    if (ex) return ex;
    const [nach, vor = ''] = name.split(',').map(norm);
    const k = liste.filter((u) => norm(u.name).startsWith(nach + ' ') && norm(u.name).includes(vor.split(' ')[0] || ''));
    return k.length === 1 ? k[0] : null;
  }
  const de = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
  const heute = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- Oberfläche
  const wirt = document.createElement('div');
  wirt.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
  const root = wirt.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    .h{position:fixed;inset:0;background:rgba(22,26,23,.45);display:flex;justify-content:center;align-items:flex-start;overflow:auto;font:15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917}
    .k{background:#faf9f7;margin:16px;border-radius:16px;max-width:640px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:16px 16px 90px}
    h1{font:600 18px system-ui,sans-serif;margin:0 0 4px}
    p.u{margin:0 0 12px;color:#57534e;font-size:13px}
    label{display:block;font-size:12px;color:#57534e;margin:10px 0 0}
    select,input,textarea{width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #d6d3d1;border-radius:10px;background:#fff;font:inherit;color:#1c1917}
    textarea{height:70px;font:12px ui-monospace,monospace}
    .z{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e7e5e4;border-radius:10px;margin-top:4px;background:#fff}
    .z.aus{background:#f5f5f4;color:#a8a29e}
    .z .n{flex:1;min-width:0}.z .n b{font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .z .n small{font-size:11px;color:#78716c}.z select{width:auto;margin:0;padding:6px}
    .z input[type=checkbox]{width:20px;height:20px;margin:0}
    .w{color:#b45309}.c{color:#0369a1}
    button.g{padding:6px 9px;font-size:14px;background:#fffbeb;border:1px solid #fcd34d;color:#78350f;border-radius:8px}button.g.an{background:#1c1917;color:#fafaf9;border-color:#1c1917}
    .f{background:#fef2f2;color:#b91c1c;padding:10px;border-radius:10px;margin-top:10px;font-size:13px}
    .ok{background:#ecfdf5;color:#047857;padding:10px;border-radius:10px;margin-top:10px;font-size:13px}
    .zwei{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .leiste{position:fixed;left:0;right:0;bottom:0;padding:12px;display:flex;gap:8px;justify-content:center;background:linear-gradient(transparent,#faf9f7 40%)}
    button{font:600 15px system-ui,sans-serif;border:0;border-radius:12px;padding:13px 18px;cursor:pointer}
    .p{background:#1c1917;color:#fafaf9;flex:1;max-width:460px}.p:disabled{opacity:.4}
    .s{background:#e7e5e4;color:#1c1917}
    .tabs{display:flex;gap:6px;margin-bottom:6px}.t{flex:1;background:#e7e5e4;color:#57534e;padding:9px;font-size:14px}.t.an{background:#1c1917;color:#fafaf9}
  </style>
  <div class="h"><div class="k">
    <h1>Feierabend-Notenbuch ↔ WebUntis</h1>
    <p class="u">Läuft mit deiner WebUntis-Anmeldung. Es wird nichts gespeichert und nichts außer WebUntis aufgerufen.</p>
    <div class="tabs"><button class="t an" id="tabNoten">Noten eintragen</button><button class="t" id="tabListe">Schülerliste holen</button></div>
    <div id="liste-modus" hidden>
      <label>WebUntis-Kurs<select id="lkurs"><option>lädt…</option></select></label>
      <div id="lmeldung"></div>
      <button class="p" id="lkopie" style="width:100%;margin-top:12px" disabled>Schülerliste kopieren</button>
      <p class="u" style="margin-top:8px">Danach im Notenbuch unter Noten → „Aus WebUntis“ einfügen.</p>
    </div>
    <div id="noten-modus">
    <label>Übertragungscode aus dem Notenbuch<textarea id="code" placeholder="LT1:…"></textarea></label>
    <div id="schritt2" hidden>
      <label>WebUntis-Kurs<select id="kurs"></select></label>
      <label>Was übertragen<select id="quelle"></select></label>
      <label>Wohin in WebUntis<select id="ziel"></select></label>
      <div class="zwei"><label>Datum<input type="date" id="datum"></label><label>Text (optional)<input id="text" maxlength="200"></label></div>
    </div>
    <div id="meldung"></div>
    <div id="liste"></div>
    </div>
  </div></div>
  <div class="leiste"><button class="s" id="zu">Schließen</button><button class="p" id="los" disabled>Eintragen</button></div>`;
  const $ = (id) => root.getElementById(id);

  let code = null, kursListe = [], M = null, Q = [], zeilen = [];
  const meldung = (html, art) => { $('meldung').innerHTML = html ? `<div class="${art || 'f'}">${html}</div>` : ''; };

  function zielInfo() {
    const z = $('ziel').value;
    if (!M || !z) return null;
    if (z.startsWith('p:')) { const p = M.pruefungen.find((x) => x.examId === +z.slice(2)); return p && { examId: p.examId, examTypeId: p.examTypeId, datum: p.datum, name: `${p.name} (${p.art})` }; }
    const a = M.arten.find((x) => x.id === +z.slice(2));
    return a && { examId: -1, examTypeId: a.id, datum: null, name: a.name };
  }

  function vorschau() {
    const q = Q.find((x) => x.key === $('quelle').value), z = zielInfo();
    $('liste').innerHTML = '';
    zeilen = [];
    $('datum').disabled = !!(z && z.examId > 0);
    if (!q || !z || !M) { knopf(); return; }
    const tage = new Set();
    code.schueler.forEach((s) => {
      const u = finde(s.name, M.schueler);
      const { v, d } = q.wert(s);
      if (d) tage.add(d);
      const vs = v != null ? zuNote(v) : null;
      const vorh = !u ? [] : z.examId > 0 ? u.noten.filter((n) => n.examId === z.examId) : u.noten.filter((n) => n.examTypeId === z.examTypeId && !n.examId);
      const gleich = vs && vs.note && vorh.some((n) => n.note === vs.note);
      zeilen.push({ s, u, v, vs, vorh, an: !!(u && vs && vs.note && !gleich && !vorh.length), note: vs ? vs.note : '' });
    });
    $('datum').value = z.examId > 0 ? z.datum : (tage.size === 1 ? [...tage][0] : ($('datum').value || heute()));
    const noten = (M.schema ? M.schema.noten : []).map((m) => m.name);
    const fehlend = zeilen.filter((x) => !x.u).map((x) => x.s.name);
    if (fehlend.length) meldung('In WebUntis nicht gefunden: ' + esc(fehlend.join('; ')), 'f'); else meldung('');
    zeilen.forEach((x, i) => {
      const el = document.createElement('div');
      el.className = 'z' + (x.an ? '' : ' aus');
      el.innerHTML = `<input type="checkbox" ${x.an ? 'checked' : ''} ${!x.u || !x.note ? 'disabled' : ''}>
        <div class="n"><b>${esc(x.s.name)}</b><small>Notenbuch ${x.v != null ? x.v.toFixed(2) : '–'}${x.vs && x.vs.wahl ? ' · <span class="w">genau dazwischen, bitte entscheiden</span>' : ''}${x.vorh.length ? ' · <span class="c">WebUntis hat: ' + esc(x.vorh.map((n) => `${n.note} (${de(n.datum)})`).join(', ')) + '</span>' : ''}</small></div>
        ${x.u && x.vs && x.vs.wahl ? x.vs.wahl.map((n) => `<button class="g" data-n="${n}">${n}</button>`).join('') : ''}
        <select ${x.u ? '' : 'disabled'}><option value="">–</option>${noten.map((n) => `<option ${n === x.note ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      el.querySelector('input').onchange = (e) => { x.an = e.target.checked; el.className = 'z' + (x.an ? '' : ' aus'); knopf(); };
      el.querySelectorAll('button.g').forEach((bt) => { bt.onclick = () => { x.note = bt.dataset.n; x.an = true; el.querySelector('select').value = x.note; el.querySelector('input').checked = true; el.querySelector('input').disabled = false; el.className = 'z'; el.querySelectorAll('button.g').forEach((o) => o.classList.toggle('an', o === bt)); knopf(); }; });
      el.querySelector('select').onchange = (e) => { x.note = e.target.value; x.an = !!x.note; el.querySelector('input').checked = x.an; el.className = 'z' + (x.an ? '' : ' aus'); knopf(); };
      $('liste').appendChild(el);
    });
    knopf();
  }
  function knopf() {
    const n = zeilen.filter((x) => x.an && x.u && x.note).length;
    $('los').disabled = !n || !(M && M.darfAnlegen);
    $('los').textContent = n ? `${n} Noten in WebUntis eintragen` : 'Eintragen';
  }

  async function ladeKurs() {
    M = null; $('ziel').innerHTML = '<option>lädt…</option>'; vorschau();
    try {
      M = await matrix(+$('kurs').value);
      $('ziel').innerHTML = '<option value="">bitte wählen</option>' +
        (M.pruefungen.length ? '<optgroup label="Angelegte Prüfungen">' + M.pruefungen.map((p) => `<option value="p:${p.examId}">${esc(p.name)} · ${de(p.datum)} (${esc(p.art)})</option>`).join('') + '</optgroup>' : '') +
        '<optgroup label="Note eintragen mit Notenart">' + M.arten.map((a) => `<option value="a:${a.id}">${esc(a.name)}</option>`).join('') + '</optgroup>';
    } catch (e) { meldung(esc(e.message)); }
    vorschau();
  }

  function rateKurs(name) {
    const n = name.toLowerCase();
    const jg = n.match(/\b(\d{1,2})([a-f])\b/);
    if (jg) { const k = jg[1].padStart(2, '0') + jg[2]; const t = kursListe.filter((x) => x.klassen.toLowerCase() === k); if (t.length === 1) return t[0].lsId; }
    const st = n.includes('q1') ? '12' : n.includes('q2') ? '13' : n.includes('ef') ? '11' : '';
    if (st) {
      const lk = n.includes('lk'), gk = n.includes('gk');
      const t = kursListe.filter((x) => x.klassen === st && !x.fach.startsWith('P') && (lk ? /L\d/.test(x.fach) : gk ? /G\d/.test(x.fach) : true));
      if (t.length === 1) return t[0].lsId;
    }
    return null;
  }

  $('code').addEventListener('input', async () => {
    try {
      code = leseCode($('code').value);
    } catch (e) { if ($('code').value.trim()) meldung(esc(e.message)); return; }
    meldung('');
    try {
      await vorbereiten();
      kursListe = await kurse();
    } catch (e) { meldung(esc(e.message)); return; }
    Q = quellen(code);
    $('quelle').innerHTML = '<option value="">bitte wählen</option>' + Q.map((q) => `<option value="${esc(q.key)}">${esc(q.titel)}</option>`).join('');
    $('kurs').innerHTML = kursListe.map((k) => `<option value="${k.lsId}">${esc(k.klassen)} · ${esc(k.fachname)} (${esc(k.gruppe)})</option>`).join('');
    const geraten = rateKurs(code.klasse || '');
    if (geraten) $('kurs').value = geraten;
    $('schritt2').hidden = false;
    $('code').style.height = '36px';
    ladeKurs();
  });
  $('kurs').onchange = ladeKurs;
  $('quelle').onchange = vorschau;
  $('ziel').onchange = vorschau;
  $('zu').onclick = () => { wirt.remove(); };

  $('los').onclick = async () => {
    const z = zielInfo(), datum = $('datum').value, text = $('text').value;
    const auswahl = zeilen.filter((x) => x.an && x.u && x.note);
    if (!z || !auswahl.length || !datum) return;
    const ueber = auswahl.filter((x) => x.vorh.length).length;
    if (!confirm(`${auswahl.length} Noten als „${z.name}“ mit Datum ${de(datum)} in WebUntis eintragen?` + (ueber ? `\n${ueber} davon haben dort schon eine Note dieser Art (wird überschrieben).` : ''))) return;
    $('los').disabled = true; $('los').textContent = 'Trägt ein…';
    const marks = Object.fromEntries((M.schema ? M.schema.noten : []).map((m) => [m.name, m.id]));
    const fehler = [];
    try { await vorbereiten(); } catch (e) { meldung(esc(e.message)); return; }
    for (const x of auswahl) {
      try {
        await api('POST', 'api/classreg/grade/grade', null, {
          periodId: -1, gradeId: x.vorh.length === 1 ? x.vorh[0].id : -1, studentId: x.u.id, lessonId: M.lsId,
          examId: z.examId, examTypeId: z.examTypeId, markSchemaId: M.schema.id, markId: marks[x.note],
          text, date: +datum.replace(/-/g, ''),
        });
      } catch (e) { fehler.push(`${x.s.name}: ${e.message}`); }
    }
    // Kontrolle: Matrix neu lesen (die Antwort von WebUntis allein ist nicht verlässlich)
    let ok = 0;
    try {
      const neu = await matrix(M.lsId);
      for (const x of auswahl) {
        const u = neu.schueler.find((s) => s.id === x.u.id);
        const da = u && u.noten.some((n) => n.note === x.note && n.examTypeId === z.examTypeId &&
          (z.examId > 0 ? n.examId === z.examId : n.datum === datum));
        if (da) ok++; else if (!fehler.some((f) => f.startsWith(x.s.name))) fehler.push(`${x.s.name}: nach dem Speichern nicht gefunden`);
      }
      M = neu;
    } catch (e) { fehler.push('Kontrolle nicht möglich: ' + e.message); }
    vorschau();
    meldung(`${ok} von ${auswahl.length} eingetragen und in WebUntis nachgeprüft.` + (fehler.length ? '<br>' + fehler.map(esc).join('<br>') : ''), fehler.length ? 'f' : 'ok');
  };

  // ---------------------------------------------------------------- Schülerliste holen
  let listeCode = '';
  async function ladeListe() {
    $('lkopie').disabled = true; listeCode = '';
    const k = kursListe.find((x) => x.lsId === +$('lkurs').value);
    if (!k) return;
    try {
      const sch = (await schuelerliste(k.lsId)).filter((x) => !x.austritt);
      const daten = { v: 1, kurs: { klassen: k.klassen, fach: k.fachname, gruppe: k.gruppe },
        schueler: sch.map((x) => ({ nachname: x.nachname, vorname: x.vorname })) };
      listeCode = 'LS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(daten))));
      $('lmeldung').innerHTML = `<div class="ok">${sch.length} Schülerinnen und Schüler gefunden.</div>`;
      $('lkopie').disabled = false;
    } catch (e) { $('lmeldung').innerHTML = `<div class="f">${esc(e.message)}</div>`; }
  }
  async function zeigeListe() {
    $('tabListe').classList.add('an'); $('tabNoten').classList.remove('an');
    $('liste-modus').hidden = false; $('noten-modus').hidden = true; $('los').style.display = 'none';
    try {
      await vorbereiten();
      if (!kursListe.length) kursListe = await kurse();
      $('lkurs').innerHTML = kursListe.map((k) => `<option value="${k.lsId}">${esc(k.klassen)} · ${esc(k.fachname)} (${esc(k.gruppe)})</option>`).join('');
      ladeListe();
    } catch (e) { $('lmeldung').innerHTML = `<div class="f">${esc(e.message)}</div>`; }
  }
  $('tabListe').onclick = zeigeListe;
  $('tabNoten').onclick = () => {
    $('tabNoten').classList.add('an'); $('tabListe').classList.remove('an');
    $('liste-modus').hidden = true; $('noten-modus').hidden = false; $('los').style.display = '';
  };
  $('lkurs').onchange = ladeListe;
  $('lkopie').onclick = async () => {
    try { await navigator.clipboard.writeText(listeCode); $('lkopie').textContent = 'Kopiert ✓'; }
    catch (e) { window.prompt('Bitte kopieren:', listeCode); }
    setTimeout(() => { $('lkopie').textContent = 'Schülerliste kopieren'; }, 2500);
  };

  document.body.appendChild(wirt);
  window.__lehrertoolBruecke = { zeigen: () => { if (!wirt.isConnected) document.body.appendChild(wirt); } };
  setTimeout(() => $('code').focus(), 50);
})();
