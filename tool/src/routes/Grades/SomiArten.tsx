import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { SOMI_VORSCHLAEGE, basisLabel, artVon } from './somi';
import type { SomiArt } from '../../types';

// Welche sonstigen Leistungen gibt es in diesem Kurs, und wie stark zählen sie im SoMi-Schnitt?

export default function SomiArten() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();
  const cls = classes.find((c) => c.id === classId);
  const [arten, setArten] = useState<SomiArt[]>(() => cls?.somiArten ?? []);
  const [eigene, setEigene] = useState('');

  // Vorschläge: die üblichen Arten plus Bezeichnungen, die in diesem Kurs schon vorkommen
  const vorschlaege = useMemo(() => {
    const schon = new Set<string>();
    cls?.students.forEach((s) => (s.somiGrades ?? []).forEach((g) => schon.add(basisLabel(g.label))));
    return [...new Set([...schon, ...SOMI_VORSCHLAEGE])];
  }, [cls]);

  if (!cls) { navigate('/grades'); return null; }

  const hat = (n: string) => arten.some((a) => a.name.toLowerCase() === n.toLowerCase());
  const umschalten = (n: string) => setArten(hat(n) ? arten.filter((a) => a.name.toLowerCase() !== n.toLowerCase()) : [...arten, { name: n, gewicht: 50 }]);
  const summe = arten.reduce((a, x) => a + x.gewicht, 0);

  // Noten, die zu keiner gewählten Art passen (zählen dann mit mittlerem Gewicht)
  const ohneArt = new Set<string>();
  cls.students.forEach((s) => (s.somiGrades ?? []).forEach((g) => { if (arten.length && !artVon(g.label, arten)) ohneArt.add(basisLabel(g.label)); }));

  const speichern = () => {
    setClasses(classes.map((c) => (c.id === cls.id ? { ...c, somiArten: arten } : c)));
    navigate(`/grades/${cls.id}`);
  };

  return (
    <div>
      <Header title="Sonstige Leistungen" subtitle={`${cls.name} · Arten und Gewichtung`} onBack={() => navigate(`/grades/${cls.id}`)} />

      <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60 mb-4">
        <div className="text-sm font-medium text-stone-800 mb-1">Welche sonstigen Leistungen gibt es in diesem Kurs?</div>
        <p className="text-xs text-stone-500 mb-3">Antippen zum Auswählen. Eine Note zählt zu einer Art, wenn ihre Bezeichnung so beginnt (z. B. „Test 2“ zu „Test“).</p>
        <div className="flex flex-wrap gap-2">
          {vorschlaege.map((n) => (
            <button key={n} onClick={() => umschalten(n)}
              className={`px-3 py-1.5 rounded-full text-sm border min-h-[36px] ${hat(n) ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-white text-stone-600 border-stone-300'}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={eigene} onChange={(e) => setEigene(e.target.value)} placeholder="eigene Art, z. B. Lerntagebuch"
            onKeyDown={(e) => { if (e.key === 'Enter' && eigene.trim() && !hat(eigene.trim())) { setArten([...arten, { name: eigene.trim(), gewicht: 50 }]); setEigene(''); } }}
            className="flex-1 px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm" />
          <button onClick={() => { if (eigene.trim() && !hat(eigene.trim())) { setArten([...arten, { name: eigene.trim(), gewicht: 50 }]); setEigene(''); } }}
            className="px-3 rounded-lg bg-white border border-stone-300 text-stone-700"><Plus size={16} /></button>
        </div>
      </div>

      {arten.length > 0 && (
        <div className="p-4 bg-white/80 rounded-2xl border border-stone-200/60 mb-4 space-y-4">
          <div className="text-sm font-medium text-stone-800">Gewichtung im SoMi-Schnitt</div>
          {arten.map((a, i) => (
            <div key={a.name}>
              <div className="flex items-center justify-between text-sm">
                <span>{a.name}</span>
                <span className="flex items-center gap-2 text-stone-500">
                  {summe ? Math.round((a.gewicht / summe) * 100) : 0} %
                  <button onClick={() => umschalten(a.name)} className="p-1 text-stone-400"><X size={14} /></button>
                </span>
              </div>
              <input type="range" min={0} max={100} step={5} value={a.gewicht} className="w-full"
                onChange={(e) => setArten(arten.map((x, j) => (j === i ? { ...x, gewicht: Number(e.target.value) } : x)))} />
            </div>
          ))}
          <p className="text-xs text-stone-500">Die Prozentwerte sind die Anteile am SoMi-Schnitt. Fehlt bei einem Kind eine Art, verteilen sich die Anteile auf die übrigen. Beobachtungen aus dem Unterricht zählen innerhalb ihrer Art weiter halb.</p>
          {ohneArt.size > 0 && (
            <p className="text-xs text-amber-700">Passt zu keiner Art und zählt deshalb mit mittlerem Gewicht: {[...ohneArt].join('; ')}</p>
          )}
        </div>
      )}

      <button onClick={speichern} className="w-full p-4 rounded-2xl bg-stone-800 text-stone-50 min-h-[52px]">
        {arten.length ? 'Speichern' : 'Ohne Arten speichern (alle SoMi-Noten zählen gleich)'}
      </button>
    </div>
  );
}
