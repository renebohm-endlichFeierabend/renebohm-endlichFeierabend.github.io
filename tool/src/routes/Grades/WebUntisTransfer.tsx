import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Upload, AlertTriangle, Check, X } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm, weightedAvg, avg } from './gradeUtils';
import QuartalsendeBox from './QuartalsendeBox';
import { imZeitraum, zeitraumName, somiSchnitt, zuStufe, quartalsnote, notenwert, mitQuartalsnoten, klasseSomi, type Zeitraum } from './somi';
import type { Student } from '../../types';
import WebUntisAnmeldung from '../../components/WebUntisAnmeldung';
import { brauchtAnmeldung, wuKurse, wuMatrix, wuEintragen } from '../../data/webuntisApi';

// Noten aus dem Notenbuch nach WebUntis übertragen. Mit WebUntis spricht im Cockpit der Server
// (cockpit/webuntis.py), sonst die Brücke der Schule (relay/webuntis.php, siehe data/webuntisApi.ts).

import type { Kurs } from '../../data/webuntisApi';
interface UNote { id: number; examTypeId: number; examId: number; art: string; note: string; datum: string; text: string }
interface Pruefung { examId: number; name: string; datum: string; examTypeId: number; art: string }
interface USchueler { id: number; name: string; noten: UNote[] }
interface Matrix {
  lsId: number; schuljahr: string; darfAnlegen: boolean; darfAendern: boolean;
  notenarten: { id: number; name: string; kurz: string }[];
  pruefungen: Pruefung[];
  notenschluessel: { id: number; name: string; noten: { id: number; name: string }[] } | null;
  schueler: USchueler[];
}
interface Ergebnis { studentId: number; name: string; note: string; status: string; fehler?: string }

const norm = (s: string) => s.toLowerCase().replace(/[(),.]/g, ' ').replace(/\s+/g, ' ').trim();

/** "Nachname, Vorname" (Lehrertool) zu "Nachname Vorname" (WebUntis). */
function findeSchueler(name: string, liste: USchueler[]): USchueler | undefined {
  const n = norm(name);
  const exakt = liste.find((u) => norm(u.name) === n);
  if (exakt) return exakt;
  const [nach, vor = ''] = name.split(',').map((x) => norm(x));
  const kandidaten = liste.filter((u) => norm(u.name).startsWith(nach + ' ') && norm(u.name).includes(vor.split(' ')[0] ?? ''));
  return kandidaten.length === 1 ? kandidaten[0] : undefined;
}

const basisLabel = (l: string) => l.replace(/\s*\(.*\)\s*$/, '').trim();
const heute = () => new Date().toISOString().slice(0, 10);
const deDatum = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');


const SPEICHER_ZUORDNUNG = 'webuntis-kurs-zuordnung';

function ladeZuordnung(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SPEICHER_ZUORDNUNG) || '{}'); } catch { return {}; }
}

function rateKurs(klasse: string, kurse: Kurs[]): number | undefined {
  const n = klasse.toLowerCase();
  const jg = n.match(/\b(\d{1,2})([a-f])\b/);
  if (jg) {
    const k = `${jg[1].padStart(2, '0')}${jg[2]}`;
    const t = kurse.filter((x) => x.klassen.toLowerCase() === k);
    if (t.length === 1) return t[0].lsId;
  }
  const stufe = n.includes('q1') ? '12' : n.includes('q2') ? '13' : n.includes('ef') ? '11' : '';
  if (stufe) {
    const lk = n.includes('lk'), gk = n.includes('gk');
    const t = kurse.filter((x) => x.klassen === stufe && (lk ? /L\d/.test(x.fach) : gk ? /G\d/.test(x.fach) : true)
      && !x.fach.startsWith('P'));
    if (t.length === 1) return t[0].lsId;
  }
  return undefined;
}

type Quelle = { key: string; titel: string; wert: (s: Student) => { v: number | null; datum?: string; note?: string } };

export default function WebUntisTransfer() {
  const [angemeldet, setAngemeldet] = useState(!brauchtAnmeldung());
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  if (!angemeldet) {
    return (
      <div>
        <Header title="Nach WebUntis" subtitle="Anmeldung" onBack={() => navigate(`/grades/${classId}`)} />
        <WebUntisAnmeldung onFertig={() => setAngemeldet(true)} />
      </div>
    );
  }
  return <Uebertragen />;
}

function Uebertragen() {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();
  const [zeitraum, setZeitraum] = useState<Zeitraum>((searchParams.get('zeitraum') as Zeitraum) || 'hj');
  const cls = classes.find((c) => c.id === classId);
  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;

  const [kurse, setKurse] = useState<Kurs[] | null>(null);
  const [lsId, setLsId] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [quelleKey, setQuelleKey] = useState('');
  const [ziel, setZiel] = useState(''); // 'p:<examId>' angelegte Prüfung, 'a:<examTypeId>' freie Notenart
  const [datum, setDatum] = useState(heute());
  const [text, setText] = useState('');
  const [wahl, setWahl] = useState<Record<string, { an: boolean; note: string }>>({});
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[] | null>(null);
  const [sendet, setSendet] = useState(false);

  // Quellen: je Notenbezeichnung (Zusätze in Klammern zusammengefasst) und der SoMi-Schnitt
  const quellen: Quelle[] = useMemo(() => {
    if (!cls) return [];
    const aus: Quelle[] = [];
    // Abgeschlossenes Quartal: die entschiedene Note, nicht der Schnitt
    if (zeitraum === 'q1' && cls.students.some((s) => quartalsnote(s, termKey))) {
      aus.push({ key: 'quartal', titel: `SoMi ${zeitraumName(termKey, 'q1')} (abgeschlossen, deine Noten)`, wert: (s) => {
        const q = quartalsnote(s, termKey);
        return q ? { v: notenwert(q.note) ?? q.schnitt, note: q.note } : { v: null };
      } });
    }
    const drin = (g: { termKey: string; date: string; label: string; value: number }) => imZeitraum(g as never, termKey, zeitraum, cls);
    const somiLabels = new Set<string>(), examLabels = new Set<string>();
    for (const s of cls.students) {
      for (const g of s.somiGrades ?? []) if (drin(g)) somiLabels.add(basisLabel(g.label));
      for (const g of s.examGrades ?? []) if (drin(g)) examLabels.add(basisLabel(g.label));
    }
    const mitDatum = (gs: { value: number; date: string; weight?: number }[]) => {
      const tage = [...new Set(gs.map((g) => g.date.slice(0, 10)))];
      return { v: gs.length ? weightedAvg(gs) : null, datum: tage.length === 1 ? tage[0] : undefined };
    };
    for (const l of [...somiLabels].sort()) {
      aus.push({ key: `somi:${l}`, titel: `SoMi: ${l}`, wert: (s) => mitDatum((s.somiGrades ?? []).filter((g) => drin(g) && basisLabel(g.label) === l)) });
    }
    for (const l of [...examLabels].sort()) {
      aus.push({ key: `exam:${l}`, titel: `Klausur: ${l}`, wert: (s) => {
        const gs = (s.examGrades ?? []).filter((g) => drin(g) && basisLabel(g.label) === l);
        const tage = [...new Set(gs.map((g) => g.date.slice(0, 10)))];
        return { v: avg(gs.map((g) => g.value)), datum: tage.length === 1 ? tage[0] : undefined };
      } });
    }
    if (somiLabels.size) {
      aus.push({ key: 'somi-schnitt', titel: `SoMi-Schnitt ${zeitraumName(termKey, zeitraum)}${cls.somiArten?.length ? ' (gewichtet)' : ''}`, wert: (s) => ({ v: somiSchnitt((s.somiGrades ?? []).filter(drin), cls.somiArten) }) });
    }
    return aus;
  }, [cls, termKey, zeitraum]);

  const quelle = quellen.find((q) => q.key === quelleKey);
  useEffect(() => {
    if (quellen.some((q) => q.key === 'quartal') && (!quelleKey || !quellen.some((q) => q.key === quelleKey))) setQuelleKey('quartal');
  }, [quellen]); // eslint-disable-line react-hooks/exhaustive-deps
  const pruefung = ziel.startsWith('p:') ? matrix?.pruefungen.find((p) => p.examId === Number(ziel.slice(2))) : undefined;
  const artId: number | null = pruefung ? pruefung.examTypeId : ziel.startsWith('a:') ? Number(ziel.slice(2)) : null;

  useEffect(() => {
    wuKurse()
      .then((j) => {
        setKurse(j.kurse);
        if (cls) {
          const gemerkt = ladeZuordnung()[cls.id];
          const id = j.kurse.some((k) => k.lsId === gemerkt) ? gemerkt : rateKurs(cls.name, j.kurse);
          if (id) setLsId(id);
        }
      })
      .catch((e) => setFehler(String(e.message || e)));
  }, [cls]);

  const ladeMatrix = (id: number) => {
    setLaedt(true); setFehler(''); setErgebnisse(null);
    wuMatrix<Matrix>(id)
      .then((m) => setMatrix(m))
      .catch((e) => { setMatrix(null); setFehler(String(e.message || e)); })
      .finally(() => setLaedt(false));
  };

  useEffect(() => {
    if (lsId == null) return;
    if (cls) {
      const z = ladeZuordnung(); z[cls.id] = lsId;
      try { localStorage.setItem(SPEICHER_ZUORDNUNG, JSON.stringify(z)); } catch { /* egal */ }
    }
    ladeMatrix(lsId);
  }, [lsId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zeilen der Vorschau
  const zeilen = useMemo(() => {
    if (!cls || !matrix || !quelle) return [];
    return cls.students.map((s) => {
      const u = findeSchueler(s.name, matrix.schueler);
      const { v, datum: d, note } = quelle.wert(s);
      const vorschlag = note ? { note, wahl: null } : v != null ? zuStufe(v) : null;
      const vorhanden = !u || artId == null ? []
        : pruefung ? u.noten.filter((n) => n.examId === pruefung.examId)
        : u.noten.filter((n) => n.examTypeId === artId && !n.examId);
      return { s, u, v, d, vorschlag, vorhanden };
    });
  }, [cls, matrix, quelle, artId, pruefung]);

  // Vorbelegung, wenn sich Quelle oder Notenart ändern
  useEffect(() => {
    const w: Record<string, { an: boolean; note: string }> = {};
    for (const z of zeilen) {
      const gleich = z.vorschlag?.note && z.vorhanden.some((n) => n.note === z.vorschlag!.note);
      w[z.s.id] = { an: !!(z.u && z.vorschlag?.note && !gleich && z.vorhanden.length === 0), note: z.vorschlag?.note ?? '' };
    }
    setWahl(w);
    const tage = [...new Set(zeilen.map((z) => z.d).filter(Boolean))];
    setDatum(pruefung ? pruefung.datum : tage.length === 1 ? (tage[0] as string) : heute());
  }, [zeilen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cls) { navigate('/grades'); return null; }

  const ausgewaehlt = zeilen.filter((z) => z.u && wahl[z.s.id]?.an && wahl[z.s.id]?.note);
  const art = matrix?.notenarten.find((a) => a.id === artId);
  const zielName = pruefung ? `${pruefung.name} (${art?.name ?? pruefung.art})` : art?.name;

  const senden = async () => {
    if (!matrix || artId == null || !ausgewaehlt.length) return;
    const aendern = ausgewaehlt.filter((z) => z.vorhanden.length > 0).length;
    const frage = `${ausgewaehlt.length} Noten als „${zielName}“ mit Datum ${deDatum(datum)} in WebUntis eintragen` +
      (aendern ? ` (davon ${aendern}, die dort schon eine Note dieser Art haben: wird überschrieben)` : '') + '?';
    if (!window.confirm(frage)) return;
    setSendet(true); setFehler('');
    try {
      const eintraege = ausgewaehlt.map((z) => ({
        studentId: z.u!.id, examTypeId: artId, examId: pruefung ? pruefung.examId : -1, note: wahl[z.s.id].note, datum, text,
        gradeId: z.vorhanden.length === 1 ? z.vorhanden[0].id : -1,
      }));
      const j = await wuEintragen<{ ergebnisse: Ergebnis[] }>(matrix.lsId, eintraege);
      setErgebnisse(j.ergebnisse);
      // SoMi-Note für Quartal 1 bzw. 3 übertragen: damit endet das Quartal, wenn kein Datum gesetzt ist
      // und die übertragenen Noten gelten als entschiedene Quartalsnoten (gespeichert im Notenbuch)
      if (j.ergebnisse.some((e) => e.status === 'ok') && /^SoMi\s*[13]\./i.test(art?.name ?? '')) {
        const ok = new Set(j.ergebnisse.filter((e) => e.status === 'ok').map((e) => e.studentId));
        const noten = Object.fromEntries(ausgewaehlt.filter((z) => ok.has(z.u!.id)).map((z) => [z.s.id, {
          note: wahl[z.s.id].note, schnitt: klasseSomi(z.s, cls, (g) => imZeitraum(g, termKey, 'q1', cls)) }]));
        setClasses(classes.map((c) => {
          if (c.id !== cls.id) return c;
          const neu = mitQuartalsnoten(c, termKey, noten);
          return c.quartalsende?.[termKey] ? neu : { ...neu, quartalsende: { ...(neu.quartalsende ?? {}), [termKey]: new Date().toISOString() } };
        }));
      }
      ladeMatrix(matrix.lsId);
    } catch (e) {
      setFehler(String((e as Error).message || e));
    } finally {
      setSendet(false);
    }
  };

  const ohneZuordnung = zeilen.filter((z) => !z.u);

  return (
    <div>
      <Header title="Nach WebUntis" subtitle={`${cls.name} · Noten eintragen`} onBack={() => navigate(`/grades/${cls.id}?term=${termKey}`)} />

      {fehler && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{fehler}</div>}

      <div className="space-y-3 mb-4 p-4 bg-white/80 rounded-2xl border border-stone-200/60">
        <label className="block text-xs text-stone-500">WebUntis-Kurs
          <select className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800"
            value={lsId ?? ''} onChange={(e) => setLsId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{kurse ? 'bitte wählen' : 'lädt…'}</option>
            {(kurse ?? []).map((k) => <option key={k.lsId} value={k.lsId}>{k.klassen} · {k.fachname} ({k.gruppe})</option>)}
          </select>
        </label>

        <div className="text-xs text-stone-500">Zeitraum
          <div className="mt-1 grid grid-cols-3 gap-1">
            {(['hj', 'q1', 'q2'] as Zeitraum[]).map((z) => (
              <button key={z} onClick={() => setZeitraum(z)}
                className={`p-2 rounded-lg border text-sm ${zeitraum === z ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-white border-stone-300 text-stone-700'}`}>
                {zeitraumName(termKey, z)}
              </button>
            ))}
          </div>
          {zeitraum !== 'hj' && <div className="mt-2"><QuartalsendeBox cls={cls} termKey={termKey} /></div>}
        </div>

        <label className="block text-xs text-stone-500">Was übertragen (aus dem Notenbuch)
          <select className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800"
            value={quelleKey} onChange={(e) => setQuelleKey(e.target.value)}>
            <option value="">bitte wählen</option>
            {quellen.map((q) => <option key={q.key} value={q.key}>{q.titel}</option>)}
          </select>
        </label>

        <label className="block text-xs text-stone-500">Wohin in WebUntis
          <select className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800"
            value={ziel} onChange={(e) => setZiel(e.target.value)} disabled={!matrix}>
            <option value="">{matrix ? 'bitte wählen' : laedt ? 'lädt…' : 'erst Kurs wählen'}</option>
            {matrix && matrix.pruefungen.length > 0 && (
              <optgroup label="Angelegte Prüfungen">
                {matrix.pruefungen.map((p) => <option key={p.examId} value={`p:${p.examId}`}>{p.name} · {deDatum(p.datum)} ({p.art})</option>)}
              </optgroup>
            )}
            <optgroup label="Note eintragen mit Notenart">
              {(matrix?.notenarten ?? []).map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
            </optgroup>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-stone-500">Datum
            <input type="date" className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm disabled:bg-stone-100" value={datum} disabled={!!pruefung} onChange={(e) => setDatum(e.target.value)} />
          </label>
          <label className="block text-xs text-stone-500">Text (optional)
            <input type="text" maxLength={200} className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Erklärvideo" />
          </label>
        </div>
      </div>

      {ergebnisse && (
        <div className="mb-4 p-4 rounded-2xl border border-stone-200 bg-white/80 text-sm">
          <div className="font-medium mb-2">
            {ergebnisse.filter((e) => e.status === 'ok').length} von {ergebnisse.length} eingetragen und in WebUntis nachgeprüft
          </div>
          {ergebnisse.filter((e) => e.status !== 'ok').map((e) => (
            <div key={e.studentId} className="text-red-700 text-xs">{e.name}: {e.fehler}</div>
          ))}
        </div>
      )}

      {quelle && matrix && artId != null && (
        <>
          {ohneZuordnung.length > 0 && (
            <div className="mb-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-xs flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>In WebUntis nicht gefunden: {ohneZuordnung.map((z) => z.s.name).join('; ')}</span>
            </div>
          )}
          <div className="space-y-1 mb-24">
            {zeilen.map((z) => {
              const w = wahl[z.s.id] ?? { an: false, note: '' };
              const vorhandenText = z.vorhanden.map((n) => `${n.note} (${deDatum(n.datum)})`).join(', ');
              return (
                <div key={z.s.id} className={`flex items-center gap-2 p-2 rounded-xl border ${w.an ? 'bg-white border-stone-300' : 'bg-stone-50 border-stone-200/60 text-stone-400'}`}>
                  <input type="checkbox" className="w-5 h-5" checked={w.an} disabled={!z.u || !w.note}
                    onChange={(e) => setWahl({ ...wahl, [z.s.id]: { ...w, an: e.target.checked } })} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{z.s.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">
                      Notenbuch {z.v != null ? z.v.toFixed(2) : '–'}
                      {z.vorschlag?.wahl && !w.note && <span className="text-amber-700"> · genau dazwischen, bitte entscheiden</span>}
                      {vorhandenText && <span className="text-sky-700"> · WebUntis hat: {vorhandenText}</span>}
                    </div>
                  </div>
                  {z.u && z.vorschlag?.wahl && z.vorschlag.wahl.map((n) => (
                    <button key={n} onClick={() => setWahl({ ...wahl, [z.s.id]: { an: true, note: n } })}
                      className={`px-2.5 py-1.5 rounded-lg border text-sm ${w.note === n ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>{n}</button>
                  ))}
                  <select className="p-1.5 rounded-lg border border-stone-300 bg-white text-sm" value={w.note} disabled={!z.u}
                    onChange={(e) => setWahl({ ...wahl, [z.s.id]: { an: !!e.target.value, note: e.target.value } })}>
                    <option value="">–</option>
                    {(matrix.notenschluessel?.noten ?? []).map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-stone-100 via-stone-100/95 to-transparent">
            <button onClick={senden} disabled={sendet || !ausgewaehlt.length || !matrix.darfAnlegen}
              className="w-full max-w-xl mx-auto flex items-center justify-center gap-2 p-4 rounded-2xl bg-stone-800 text-stone-50 disabled:opacity-40 min-h-[56px]">
              {sendet ? 'Trägt ein…' : <><Upload size={18} /> {ausgewaehlt.length} Noten in WebUntis eintragen</>}
            </button>
          </div>
        </>
      )}

      {!quelle && matrix && (
        <div className="text-xs text-stone-500 p-2 flex gap-2"><Check size={14} />Verbunden mit WebUntis · {matrix.schueler.length} Schüler · Schuljahr {matrix.schuljahr}</div>
      )}
      {!matrix && !laedt && !fehler && lsId == null && kurse && (
        <div className="text-xs text-stone-500 p-2 flex gap-2"><X size={14} />Kein passender Kurs erkannt, bitte oben wählen.</div>
      )}
    </div>
  );
}
