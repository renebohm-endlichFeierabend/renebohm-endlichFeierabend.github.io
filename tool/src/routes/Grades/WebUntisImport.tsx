import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Check } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { COCKPIT } from '../../data/serverSync';
import type { Class, Student } from '../../types';

// Schülerliste aus WebUntis übernehmen: im Cockpit direkt, sonst über den Code "LS1:" aus dem
// WebUntis-Knopf (Reiter „Schülerliste holen“). Legt eine Klasse an oder ergänzt eine vorhandene.
// Es wird nie jemand gelöscht; wer nur im Tool steht, wird nur angezeigt.

interface Kurs { lsId: number; klassen: string; gruppe: string; fach: string; fachname: string }
interface Liste { kurs: { klassen: string; fach: string; gruppe: string }; schueler: { nachname: string; vorname: string }[] }

const norm = (s: string) => s.toLowerCase().replace(/[(),.]/g, ' ').replace(/\s+/g, ' ').trim();
const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function vorschlagName(k: Liste['kurs']): string {
  const stufe = k.klassen === '11' ? 'EF' : k.klassen === '12' ? 'Q1' : k.klassen === '13' ? 'Q2' : k.klassen.replace(/^0/, '');
  return `${stufe} ${k.fach}`.trim();
}

function leseCode(text: string): Liste {
  const roh = text.trim().replace(/^LS1:/, '');
  const bin = atob(roh);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const j = JSON.parse(new TextDecoder().decode(bytes));
  if (j.v !== 1 || !Array.isArray(j.schueler)) throw new Error('format');
  return j;
}

export default function WebUntisImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { classes, setClasses } = useStore();
  const [kurse, setKurse] = useState<Kurs[] | null>(null);
  const [lsId, setLsId] = useState('');
  const [liste, setListe] = useState<Liste | null>(null);
  const [codeText, setCodeText] = useState('');
  const [fehler, setFehler] = useState('');
  const [ziel, setZiel] = useState(searchParams.get('klasse') ?? 'neu');
  const [name, setName] = useState('');
  const [fertig, setFertig] = useState('');

  useEffect(() => {
    if (!COCKPIT) return;
    fetch('/api/webuntis/kurse', { credentials: 'same-origin' }).then((r) => r.json())
      .then((j) => (j.kurse ? setKurse(j.kurse) : setFehler(j.fehler || 'WebUntis nicht erreichbar')))
      .catch(() => setFehler('WebUntis nicht erreichbar'));
  }, []);

  useEffect(() => {
    if (!lsId || !kurse) return;
    const k = kurse.find((x) => x.lsId === Number(lsId));
    setFehler(''); setListe(null);
    fetch(`/api/webuntis/schueler/${lsId}`, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => {
      if (!j.schueler) { setFehler(j.fehler || 'Fehler'); return; }
      setListe({ kurs: { klassen: k?.klassen ?? '', fach: k?.fachname ?? '', gruppe: k?.gruppe ?? '' },
        schueler: j.schueler.filter((s: { austritt: string }) => !s.austritt) });
    }).catch(() => setFehler('WebUntis nicht erreichbar'));
  }, [lsId, kurse]);

  useEffect(() => {
    if (!codeText.trim()) return;
    try { setListe(leseCode(codeText)); setFehler(''); }
    catch { setFehler('Der Code ist unvollständig. Bitte in WebUntis neu kopieren.'); }
  }, [codeText]);

  useEffect(() => { if (liste) setName(vorschlagName(liste.kurs)); }, [liste]);

  const zielKlasse = classes.find((c) => c.id === ziel);
  const abgleich = useMemo(() => {
    if (!liste) return null;
    const vorhanden = new Set((zielKlasse?.students ?? []).map((s) => norm(s.name)));
    const wu = liste.schueler.map((s) => `${s.nachname}, ${s.vorname}`);
    const wuSet = new Set(wu.map(norm));
    return {
      neu: wu.filter((n) => !vorhanden.has(norm(n))),
      gleich: wu.filter((n) => vorhanden.has(norm(n))),
      nurTool: (zielKlasse?.students ?? []).filter((s) => !wuSet.has(norm(s.name))).map((s) => s.name),
    };
  }, [liste, zielKlasse]);

  const uebernehmen = () => {
    if (!liste || !abgleich) return;
    const neue: Student[] = abgleich.neu.map((n) => ({ id: neueId(), name: n, somiGrades: [], examGrades: [] }));
    const sortiere = (a: Student, b: Student) => a.name.localeCompare(b.name, 'de');
    if (ziel === 'neu') {
      if (!name.trim()) return;
      const k: Class = { id: Date.now().toString(), name: name.trim(), students: neue.sort(sortiere), createdAt: Date.now() };
      setClasses([...classes, k]);
      setFertig(`Klasse „${k.name}“ mit ${neue.length} Schülern angelegt.`);
      setTimeout(() => navigate(`/grades/${k.id}`), 900);
    } else if (zielKlasse) {
      setClasses(classes.map((c) => (c.id === zielKlasse.id ? { ...c, students: [...c.students, ...neue].sort(sortiere) } : c)));
      setFertig(`${neue.length} Schüler zu „${zielKlasse.name}“ hinzugefügt.`);
      setTimeout(() => navigate(`/grades/${zielKlasse.id}`), 900);
    }
  };

  return (
    <div>
      <Header title="Aus WebUntis" subtitle="Schülerliste übernehmen" onBack={() => navigate('/grades')} />
      {fehler && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{fehler}</div>}
      {fertig && <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm flex gap-2"><Check size={16} />{fertig}</div>}

      <div className="space-y-3 mb-4 p-4 bg-white/80 rounded-2xl border border-stone-200/60">
        {COCKPIT && (
          <label className="block text-xs text-stone-500">WebUntis-Kurs
            <select className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800" value={lsId} onChange={(e) => { setCodeText(''); setLsId(e.target.value); }}>
              <option value="">{kurse ? 'bitte wählen' : 'lädt…'}</option>
              {(kurse ?? []).map((k) => <option key={k.lsId} value={k.lsId}>{k.klassen} · {k.fachname} ({k.gruppe})</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs text-stone-500">{COCKPIT ? 'oder ' : ''}Code aus dem WebUntis-Knopf (Reiter „Schülerliste holen“)
          <textarea className="mt-1 w-full p-2 h-16 rounded-lg border border-stone-300 bg-white text-xs font-mono" value={codeText}
            onChange={(e) => { setLsId(''); setCodeText(e.target.value); }} placeholder="LS1:…" />
        </label>
      </div>

      {liste && abgleich && (
        <div className="space-y-3">
          <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60 space-y-3">
            <div className="text-sm text-stone-700">{liste.kurs.klassen} · {liste.kurs.fach}: {liste.schueler.length} Schüler in WebUntis</div>
            <label className="block text-xs text-stone-500">Übernehmen in
              <select className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800" value={ziel} onChange={(e) => setZiel(e.target.value)}>
                <option value="neu">neue Klasse</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} (ergänzen)</option>)}
              </select>
            </label>
            {ziel === 'neu' && (
              <label className="block text-xs text-stone-500">Name der Klasse
                <input className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
          </div>

          <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60 text-sm space-y-2">
            <div><b>{abgleich.neu.length}</b> neu{abgleich.neu.length ? ': ' : ''}<span className="text-stone-500 text-xs">{abgleich.neu.join('; ')}</span></div>
            {ziel !== 'neu' && <div><b>{abgleich.gleich.length}</b> schon in der Klasse</div>}
            {abgleich.nurTool.length > 0 && (
              <div className="text-amber-700 text-xs">Nur im Tool, nicht in WebUntis (bleiben stehen, bitte selbst prüfen): {abgleich.nurTool.join('; ')}</div>
            )}
          </div>

          <button onClick={uebernehmen} disabled={!!fertig || (ziel === 'neu' ? !name.trim() || !abgleich.neu.length : !abgleich.neu.length)}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-stone-800 text-stone-50 disabled:opacity-40 min-h-[56px]">
            <UserPlus size={18} /> {ziel === 'neu' ? 'Klasse anlegen' : `${abgleich.neu.length} Schüler hinzufügen`}
          </button>
        </div>
      )}
    </div>
  );
}
