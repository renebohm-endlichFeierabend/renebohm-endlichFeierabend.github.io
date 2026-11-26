import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, Check, Bookmark } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm } from './gradeUtils';
import QuartalsendeBox from './QuartalsendeBox';
import { imZeitraum, zeitraumName, quartalsnote, type Zeitraum } from './somi';

// Übertragungscode für den WebUntis-Knopf (Lesezeichen). Der Knopf lädt webuntis-bruecke.js in die
// geöffnete WebUntis-Seite; dort wird der Code eingefügt und eingetragen. Läuft ohne Server.

const SKRIPT = 'https://renebohm-endlichfeierabend.github.io/tool/webuntis-bruecke.js';
const LESEZEICHEN = `javascript:(function(){var s=document.createElement('script');s.src='${SKRIPT}?t='+Date.now();document.body.appendChild(s);})()`;

function zuBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

export default function WebUntisCode() {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes } = useStore();
  const [zeitraum, setZeitraum] = useState<Zeitraum>((searchParams.get('zeitraum') as Zeitraum) || 'hj');
  const cls = classes.find((c) => c.id === classId);
  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const [kopiert, setKopiert] = useState<'' | 'code' | 'knopf'>('');
  const link = useRef<HTMLAnchorElement>(null);

  // javascript:-Adresse nicht über JSX setzen (React warnt davor), sondern direkt am Element
  useEffect(() => { link.current?.setAttribute('href', LESEZEICHEN); }, []);

  const code = useMemo(() => {
    if (!cls) return '';
    const drin = (g: Parameters<typeof imZeitraum>[0]) => imZeitraum(g, termKey, zeitraum, cls);
    const daten = {
      v: 1, klasse: cls.name, termKey, zeitraum: zeitraumName(termKey, zeitraum),
      somiArten: cls.somiArten ?? [],
      schueler: cls.students.map((s) => ({
        name: s.name,
        ...(zeitraum === 'q1' && quartalsnote(s, termKey) ? { quartalsnote: quartalsnote(s, termKey)!.note } : {}),
        noten: [
          ...(s.somiGrades ?? []).filter(drin).map((g) => ({ typ: 'somi', label: g.label, value: g.value, date: g.date, weight: g.weight })),
          ...(s.examGrades ?? []).filter(drin).map((g) => ({ typ: 'exam', label: g.label, value: g.value, date: g.date })),
        ],
      })),
    };
    return 'LT1:' + zuBase64(JSON.stringify(daten));
  }, [cls, termKey, zeitraum]);

  if (!cls) { navigate('/grades'); return null; }

  const kopiere = async (was: 'code' | 'knopf') => {
    try {
      await navigator.clipboard.writeText(was === 'code' ? code : LESEZEICHEN);
      setKopiert(was);
      setTimeout(() => setKopiert(''), 2500);
    } catch {
      window.prompt('Bitte kopieren:', was === 'code' ? code : LESEZEICHEN);
    }
  };

  const anzahl = cls.students.reduce((a, s) => a + [...(s.somiGrades ?? []), ...(s.examGrades ?? [])]
    .filter((g) => imZeitraum(g, termKey, zeitraum, cls)).length, 0);

  return (
    <div>
      <Header title="WebUntis-Code" subtitle={`${cls.name} · ${anzahl} Noten · ${zeitraumName(termKey, zeitraum)}`} onBack={() => navigate(`/grades/${cls.id}?term=${termKey}`)} />

      <div className="space-y-4">
        <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60">
          <div className="text-sm font-medium text-stone-800 mb-1">1. Code kopieren</div>
          <div className="grid grid-cols-3 gap-1 mb-3">
            {(['hj', 'q1', 'q2'] as Zeitraum[]).map((z) => (
              <button key={z} onClick={() => setZeitraum(z)}
                className={`p-2 rounded-lg border text-sm ${zeitraum === z ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-white border-stone-300 text-stone-700'}`}>
                {zeitraumName(termKey, z)}
              </button>
            ))}
          </div>
          {zeitraum !== 'hj' && <div className="mb-3"><QuartalsendeBox cls={cls} termKey={termKey} /></div>}
          <p className="text-xs text-stone-500 mb-3">Der Code enthält Namen und Noten dieser Klasse. Er bleibt auf deinem Gerät, bis du ihn in WebUntis einfügst.</p>
          <button onClick={() => kopiere('code')} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-stone-800 text-stone-50 min-h-[48px]">
            {kopiert === 'code' ? <><Check size={16} /> Kopiert</> : <><Copy size={16} /> Code kopieren</>}
          </button>
        </div>

        <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60">
          <div className="text-sm font-medium text-stone-800 mb-1">2. In WebUntis den Knopf antippen</div>
          <p className="text-xs text-stone-500">WebUntis öffnen und anmelden (irgendeine Seite), dann das Lesezeichen „Noten aus dem Notenbuch“ antippen, den Code einfügen, Kurs und Notenart wählen, Vorschau prüfen, eintragen.</p>
        </div>

        <details className="p-4 bg-white/80 rounded-2xl border border-stone-200/60">
          <summary className="text-sm font-medium text-stone-800 cursor-pointer flex items-center gap-2"><Bookmark size={16} /> Knopf einmalig einrichten</summary>
          <div className="mt-3 space-y-3 text-xs text-stone-600">
            <div>
              <b>Am PC oder Mac:</b> Diesen Knopf mit der Maus in die Lesezeichenleiste ziehen:
              <div className="mt-2">
                <a ref={link} onClick={(e) => e.preventDefault()} className="inline-block px-3 py-2 rounded-lg bg-orange-100 text-orange-800 font-medium border border-orange-200">Noten aus dem Notenbuch</a>
              </div>
            </div>
            <div>
              <b>Am iPad (Safari):</b> Irgendeine Seite als Lesezeichen sichern, Name „Noten aus dem Notenbuch“. Dann das Lesezeichen bearbeiten und als Adresse den kopierten Knopf-Text einsetzen.
              <button onClick={() => kopiere('knopf')} className="mt-2 w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white border border-stone-300 text-stone-700">
                {kopiert === 'knopf' ? <><Check size={14} /> Kopiert</> : <><Copy size={14} /> Knopf-Text kopieren</>}
              </button>
            </div>
            <p className="text-stone-400">Der Knopf nutzt deine WebUntis-Anmeldung und speichert nichts. Es sind inoffizielle Aufrufe der WebUntis-Oberfläche; ändert Untis sie, kann der Knopf ausfallen.</p>
          </div>
        </details>
      </div>
    </div>
  );
}
