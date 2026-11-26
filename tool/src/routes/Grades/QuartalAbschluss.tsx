import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Lock, Upload, Copy } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm } from './gradeUtils';
import { SKALA, endeText, imZeitraum, klasseSomi, mitQuartalsnoten, quartalsnote, zeitraumName, zuStufe } from './somi';

// Quartal 1 bzw. 3 abschließen: je Schüler den SoMi-Schnitt des Quartals zeigen, die Note vorschlagen,
// die Lehrkraft entscheidet (Grenzfälle, pädagogische Abweichung). Gespeichert wird die entschiedene
// Note; sie geht danach nach WebUntis. Das Quartalsende wird dabei gesetzt, falls noch offen.

export default function QuartalAbschluss() {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();
  const cls = classes.find((c) => c.id === classId);
  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const name = zeitraumName(termKey, 'q1');
  const ende = cls?.quartalsende?.[termKey];

  const zeilen = useMemo(() => {
    if (!cls) return [];
    return cls.students.map((s) => {
      const schnitt = klasseSomi(s, cls, (g) => imZeitraum(g, termKey, 'q1', cls));
      return { s, schnitt, vorschlag: schnitt != null ? zuStufe(schnitt) : null, gespeichert: quartalsnote(s, termKey) };
    });
  }, [cls, termKey]);

  const [wahl, setWahl] = useState<Record<string, string>>(() =>
    Object.fromEntries(zeilen.map((z) => [z.s.id, z.gespeichert?.note ?? z.vorschlag?.note ?? ''])));
  const [gespeichert, setGespeichert] = useState(false);

  if (!cls) { navigate('/grades'); return null; }

  const offen = zeilen.filter((z) => z.vorschlag?.wahl && !wahl[z.s.id]);
  const abweichend = zeilen.filter((z) => wahl[z.s.id] && z.vorschlag?.note && wahl[z.s.id] !== z.vorschlag.note);
  const mitNote = zeilen.filter((z) => wahl[z.s.id]);
  const schonAbgeschlossen = zeilen.some((z) => z.gespeichert);

  const speichern = () => {
    if (offen.length && !window.confirm(`${offen.length} Grenzfälle sind noch nicht entschieden und bekommen keine Note. Trotzdem speichern?`)) return;
    const noten = Object.fromEntries(zeilen.map((z) => [z.s.id, { note: wahl[z.s.id] ?? '', schnitt: z.schnitt }]));
    setClasses(classes.map((c) => {
      if (c.id !== cls.id) return c;
      const neu = mitQuartalsnoten(c, termKey, noten);
      return ende ? neu : { ...neu, quartalsende: { ...(neu.quartalsende ?? {}), [termKey]: new Date().toISOString() } };
    }));
    setGespeichert(true);
  };

  return (
    <div>
      <Header title={`${name} abschließen`} subtitle={cls.name} onBack={() => navigate(`/grades/${cls.id}?term=${termKey}`)} />

      <div className="mb-4 p-4 bg-white/80 rounded-2xl border border-stone-200/60 text-xs text-stone-600 space-y-1">
        <div>Gezählt werden die SoMi-Noten bis zum Quartalsende: <b className="text-stone-800">{ende ? endeText(ende) : 'noch offen, wird beim Speichern auf jetzt gesetzt'}</b>.</div>
        <div>Der Vorschlag ist die nächste Notenstufe. Du entscheidest je Schüler; gespeichert wird deine Note, nicht der Schnitt.</div>
        {schonAbgeschlossen && <div className="text-amber-800">Dieses Quartal ist schon abgeschlossen. Änderungen überschreiben die gespeicherten Noten.</div>}
      </div>

      {gespeichert ? (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex gap-2">
            <Check size={18} className="shrink-0" />
            <span>{mitNote.length} Quartalsnoten gespeichert{abweichend.length ? `, davon ${abweichend.length} abweichend vom Vorschlag` : ''}.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => navigate(`/grades/${cls.id}/webuntis?term=${termKey}&zeitraum=q1`)}
              className="flex items-center justify-center gap-2 p-3 bg-stone-800 text-stone-50 rounded-2xl min-h-[48px]">
              <Upload size={16} /><span className="text-xs font-medium">Nach WebUntis</span>
            </button>
            <button onClick={() => navigate(`/grades/${cls.id}/webuntis-code?term=${termKey}&zeitraum=q1`)}
              className="flex items-center justify-center gap-2 p-3 bg-white border border-stone-200 text-stone-700 rounded-2xl min-h-[48px]">
              <Copy size={16} /><span className="text-xs font-medium">WebUntis-Code</span>
            </button>
          </div>
          <button onClick={() => navigate(`/grades/${cls.id}?term=${termKey}`)} className="w-full p-3 text-sm text-stone-500">Zur Klasse</button>
        </div>
      ) : (
        <>
          <div className="space-y-1 mb-28">
            {zeilen.map((z) => {
              const w = wahl[z.s.id] ?? '';
              const anders = w && z.vorschlag?.note && w !== z.vorschlag.note;
              return (
                <div key={z.s.id} className={`flex items-center gap-2 p-2 rounded-xl border ${w ? 'bg-white border-stone-300' : 'bg-stone-50 border-stone-200/60'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{z.s.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">
                      SoMi {z.schnitt != null ? z.schnitt.toFixed(2).replace('.', ',') : '– keine Noten'}
                      {z.vorschlag?.note && <> · Vorschlag {z.vorschlag.note}</>}
                      {z.vorschlag?.wahl && !w && <span className="text-amber-700"> · genau dazwischen, bitte entscheiden</span>}
                      {anders && <span className="text-sky-700"> · abweichend</span>}
                      {z.gespeichert && <span className="text-stone-400"> · gespeichert {z.gespeichert.note}</span>}
                    </div>
                  </div>
                  {z.vorschlag?.wahl && z.vorschlag.wahl.map((n) => (
                    <button key={n} onClick={() => setWahl({ ...wahl, [z.s.id]: n })}
                      className={`px-2.5 py-1.5 rounded-lg border text-sm ${w === n ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>{n}</button>
                  ))}
                  <select className="p-1.5 rounded-lg border border-stone-300 bg-white text-sm" value={w}
                    onChange={(e) => setWahl({ ...wahl, [z.s.id]: e.target.value })}>
                    <option value="">–</option>
                    {SKALA.map(([, n]) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-stone-100 via-stone-100/95 to-transparent">
            <button onClick={speichern} disabled={!mitNote.length}
              className="w-full max-w-xl mx-auto flex items-center justify-center gap-2 p-4 rounded-2xl bg-stone-800 text-stone-50 disabled:opacity-40 min-h-[56px]">
              <Lock size={18} /> {name} abschließen · {mitNote.length} {mitNote.length === 1 ? 'Note' : 'Noten'} speichern
            </button>
            {offen.length > 0 && <div className="text-center text-[11px] text-amber-800 mt-1">{offen.length} Grenzfälle noch offen</div>}
          </div>
        </>
      )}
    </div>
  );
}
