import { useStore } from '../../data/store';
import { endeText } from './somi';
import type { Class } from '../../types';

/** Ende des ersten Quartals einer Klasse im Halbjahr: anzeigen, jetzt setzen, Datum wählen, zurücksetzen. */
export default function QuartalsendeBox({ cls, termKey }: { cls: Class; termKey: string }) {
  const { classes, setClasses } = useStore();
  const hj = termKey.split('-')[1];
  const q = hj === '2' ? 3 : 1;
  const ende = cls.quartalsende?.[termKey];
  const setze = (wert: string | null) => {
    const neu = { ...(cls.quartalsende ?? {}) };
    if (wert) neu[termKey] = wert; else delete neu[termKey];
    setClasses(classes.map((c) => (c.id === cls.id ? { ...c, quartalsende: neu } : c)));
  };
  return (
    <div className="text-xs text-stone-500 p-3 rounded-xl bg-stone-50 border border-stone-200">
      <div>Quartal {q} endet: <b className="text-stone-700">{endeText(ende)}</b></div>
      <div className="text-[11px] mt-0.5">{ende ? 'Noten danach zählen zu Quartal ' + (q + 1) + '.' : `Alles zählt zu Quartal ${q}, bis die SoMi-Note für Quartal ${q} eingetragen ist oder du ein Datum setzt.`}</div>
      <div className="flex flex-wrap gap-2 mt-2 items-center">
        <button onClick={() => setze(new Date().toISOString())} className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700">Jetzt abschließen</button>
        <input type="date" value={ende ? ende.slice(0, 10) : ''} onChange={(e) => setze(e.target.value || null)}
          className="px-2 py-1 rounded-lg border border-stone-300 bg-white text-stone-700" />
        {ende && <button onClick={() => setze(null)} className="px-2 py-1.5 text-stone-500 underline">zurücksetzen</button>}
      </div>
    </div>
  );
}
