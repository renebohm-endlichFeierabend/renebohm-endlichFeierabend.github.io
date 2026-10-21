import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Save, Check, Info, X, Trash2 } from 'lucide-react';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { UEBUNGEN } from '../../data/yoga/uebungen';
import { BLOECKE, TEMPO, type Tempo } from '../../data/yoga/bloecke';
import type { YogaFlow, YogaUebung } from '../../types';
import { baueSchritte, gesamtdauer, haltedauer, minuten, STANDARD_AUSWAHL } from './flow';
import YogaPlayer, { klangVorbereiten } from './YogaPlayer';

const LETZTE_AUSWAHL = 'yoga-letzte-auswahl';

function ladeLetzte(): { auswahl: string[]; tempo: Tempo } | null {
  try {
    const roh = localStorage.getItem(LETZTE_AUSWAHL);
    return roh ? JSON.parse(roh) : null;
  } catch {
    return null;
  }
}

export default function YogaFlowView() {
  const navigate = useNavigate();
  const { yogaFlows, setYogaFlows } = useStore();
  const letzte = ladeLetzte();
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set(letzte?.auswahl ?? STANDARD_AUSWAHL));
  const [tempo, setTempo] = useState<Tempo>(letzte?.tempo ?? 'normal');
  const [aktiverFlow, setAktiverFlow] = useState<string | null>(null);
  const [details, setDetails] = useState<YogaUebung | null>(null);
  const [speichernOffen, setSpeichernOffen] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [spielt, setSpielt] = useState(false);
  const [nachweise, setNachweise] = useState(false);

  const schritte = useMemo(() => baueSchritte(auswahl, tempo), [auswahl, tempo]);
  const dauer = gesamtdauer(schritte);

  function merke(neu: Set<string>, t: Tempo) {
    try { localStorage.setItem(LETZTE_AUSWAHL, JSON.stringify({ auswahl: [...neu], tempo: t })); } catch { /* egal */ }
  }

  function umschalten(id: string) {
    const neu = new Set(auswahl);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    setAuswahl(neu);
    setAktiverFlow(null);
    merke(neu, tempo);
  }

  function blockSetzen(block: string, an: boolean) {
    const neu = new Set(auswahl);
    for (const u of UEBUNGEN) if (u.block === block) { if (an) neu.add(u.id); else neu.delete(u.id); }
    setAuswahl(neu);
    setAktiverFlow(null);
    merke(neu, tempo);
  }

  function tempoSetzen(t: Tempo) {
    setTempo(t);
    merke(auswahl, t);
  }

  function flowLaden(f: YogaFlow) {
    const neu = new Set(f.uebungen);
    setAuswahl(neu);
    setTempo(f.tempo);
    setAktiverFlow(f.id);
    merke(neu, f.tempo);
  }

  function flowSpeichern() {
    const name = flowName.trim();
    if (!name) return;
    const vorhanden = yogaFlows.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const flow: YogaFlow = {
      id: vorhanden?.id ?? Date.now().toString(),
      name,
      uebungen: [...auswahl],
      tempo,
      erstellt: vorhanden?.erstellt ?? Date.now(),
      zuletzt: vorhanden?.zuletzt,
    };
    setYogaFlows(vorhanden ? yogaFlows.map((f) => (f.id === flow.id ? flow : f)) : [...yogaFlows, flow]);
    setAktiverFlow(flow.id);
    setSpeichernOffen(false);
    setFlowName('');
  }

  function flowLoeschen(f: YogaFlow) {
    if (!confirm(`Flow „${f.name}“ löschen?`)) return;
    setYogaFlows(yogaFlows.filter((x) => x.id !== f.id));
    if (aktiverFlow === f.id) setAktiverFlow(null);
  }

  function starten() {
    if (!schritte.length) return;
    klangVorbereiten();
    if (aktiverFlow) setYogaFlows(yogaFlows.map((f) => (f.id === aktiverFlow ? { ...f, zuletzt: Date.now() } : f)));
    setSpielt(true);
  }

  if (spielt) return <YogaPlayer schritte={schritte} onEnde={() => setSpielt(false)} />;

  return (
    <div className="pb-28">
      <Header title="Yoga-Flow" subtitle="Hatha – Haltungen in Ruhe halten" onBack={() => navigate('/')} />

      {yogaFlows.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Meine Flows</div>
          <div className="flex flex-wrap gap-2">
            {yogaFlows.map((f) => (
              <div key={f.id} className={`flex items-center rounded-full border text-sm ${aktiverFlow === f.id ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-white border-stone-200 text-stone-700'}`}>
                <button onClick={() => flowLaden(f)} className="pl-3 pr-2 py-1.5 min-h-[36px]">{f.name}</button>
                <button onClick={() => flowLoeschen(f)} aria-label={`${f.name} löschen`} className="pr-2.5 py-1.5 opacity-60">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-stone-200/60 rounded-xl mb-5">
        {(Object.keys(TEMPO) as Tempo[]).map((t) => (
          <button
            key={t}
            onClick={() => tempoSetzen(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[40px] ${tempo === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
          >
            {TEMPO[t].label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {BLOECKE.map((block) => {
          const uebungen = UEBUNGEN.filter((u) => u.block === block.name);
          const an = uebungen.filter((u) => auswahl.has(u.id)).length;
          return (
            <section key={block.name}>
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <h3 className="text-base font-medium text-stone-800">{block.name}</h3>
                  <p className="text-xs text-stone-500">{block.text}</p>
                </div>
                <button
                  onClick={() => blockSetzen(block.name, an < uebungen.length)}
                  className="text-xs text-stone-500 underline underline-offset-2 min-h-[32px] px-1"
                >
                  {an < uebungen.length ? 'alle' : 'keine'}
                </button>
              </div>
              <div className="space-y-2">
                {uebungen.map((u) => {
                  const gewaehlt = auswahl.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center gap-3 p-2 pr-3 rounded-2xl border transition ${gewaehlt ? 'bg-white border-stone-300' : 'bg-white/40 border-stone-200/60 opacity-60'}`}
                    >
                      <button onClick={() => setDetails(u)} className="relative flex-shrink-0" aria-label={`${u.name}: Details`}>
                        <img src={u.bild} alt="" loading="lazy" className="w-16 h-16 object-cover rounded-xl bg-stone-100" />
                        <Info size={14} className="absolute bottom-1 right-1 text-white drop-shadow" />
                      </button>
                      <button onClick={() => umschalten(u.id)} className="flex-1 min-w-0 text-left min-h-[56px]">
                        <div className="text-sm font-medium text-stone-800 truncate">{u.name}</div>
                        <div className="text-xs text-stone-500 truncate italic">{u.sanskrit}</div>
                        <div className="text-xs text-stone-400">
                          {haltedauer(u, tempo)} s{u.beidseitig ? ' je Seite' : ''}
                        </div>
                      </button>
                      <button
                        onClick={() => umschalten(u.id)}
                        aria-label={gewaehlt ? 'abwählen' : 'auswählen'}
                        className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${gewaehlt ? 'bg-stone-800 border-stone-800 text-stone-50' : 'border-stone-300'}`}
                      >
                        {gewaehlt && <Check size={15} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <button onClick={() => setNachweise(true)} className="mt-6 text-xs text-stone-400 underline underline-offset-2">
        Bildnachweise
      </button>

      {/* Leiste unten: Dauer, Speichern, Start */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#fafaf7]/95 backdrop-blur border-t border-stone-200" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-md mx-auto px-5 py-3 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-stone-800">{minuten(dauer)}</div>
            <div className="text-xs text-stone-500">{auswahl.size} Übungen</div>
          </div>
          <button
            onClick={() => setSpeichernOffen(true)}
            disabled={!auswahl.size}
            className="p-3 rounded-xl bg-stone-100 text-stone-700 disabled:opacity-40 min-h-[48px] min-w-[48px] flex items-center justify-center"
            aria-label="Flow speichern"
          >
            <Save size={18} />
          </button>
          <button
            onClick={starten}
            disabled={!schritte.length}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-800 text-stone-50 font-medium text-sm disabled:opacity-40 min-h-[48px]"
          >
            <Play size={18} fill="currentColor" />Starten
          </button>
        </div>
      </div>

      {speichernOffen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setSpeichernOffen(false)}>
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-medium text-stone-800">Flow speichern</div>
            <input
              autoFocus
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && flowSpeichern()}
              placeholder="z. B. Abends ruhig, Morgenkraft"
              className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
            />
            <p className="text-xs text-stone-500">Gleicher Name überschreibt den gespeicherten Flow.</p>
            <div className="flex gap-2">
              <button onClick={flowSpeichern} disabled={!flowName.trim()} className="flex-1 py-2.5 bg-stone-800 text-stone-50 rounded-xl text-sm font-medium disabled:opacity-40">
                Speichern
              </button>
              <button onClick={() => setSpeichernOffen(false)} className="px-4 py-2.5 text-stone-500 text-sm">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {details && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setDetails(null)}>
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-stone-100">
              <img src={details.bild} alt={details.name} className="w-full max-h-[50vh] object-contain" />
              <button onClick={() => setDetails(null)} className="absolute top-2 right-2 p-2 bg-white/80 rounded-full" aria-label="Schließen">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-2">
              <div className="text-lg font-medium text-stone-800">{details.name}</div>
              <div className="text-sm italic text-stone-500">{details.sanskrit} · {details.block}</div>
              <p className="text-sm text-stone-700 leading-relaxed">{details.anleitung}</p>
              <p className="text-[11px] text-stone-400">
                Foto: {details.quelle.urheber}, {details.quelle.lizenz}, Wikimedia Commons
              </p>
            </div>
          </div>
        </div>
      )}

      {nachweise && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setNachweise(false)}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="font-medium text-stone-800 mb-1">Bildnachweise</div>
            <p className="text-xs text-stone-500 mb-3">Alle Fotos stammen von Wikimedia Commons und stehen unter freien Lizenzen. Sie wurden verkleinert.</p>
            <ul className="space-y-1.5 text-xs text-stone-600">
              {UEBUNGEN.map((u) => (
                <li key={u.id}>
                  <span className="text-stone-800">{u.name}:</span>{' '}
                  <a href={u.quelle.seite} target="_blank" rel="noopener" className="underline">{u.quelle.urheber}</a>
                  {', '}
                  {u.quelle.lizenzUrl ? <a href={u.quelle.lizenzUrl} target="_blank" rel="noopener" className="underline">{u.quelle.lizenz}</a> : u.quelle.lizenz}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
