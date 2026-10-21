import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, X, Volume2, VolumeX } from 'lucide-react';
import { UEBERGANG_SEKUNDEN } from '../../data/yoga/bloecke';
import { gesamtdauer, minuten, type Schritt } from './flow';

type Phase = 'uebergang' | 'halten' | 'fertig';

const STIMME_AN = 'yoga-stimme';

// Ein AudioContext für die ganze Sitzung. Er muss in einer Nutzeraktion entstehen (Start-Knopf),
// sonst bleibt er auf dem Handy stumm.
let klang: AudioContext | null = null;

/** Im Klick auf „Starten“ aufrufen: entsperrt Ton und Sprachausgabe. */
export function klangVorbereiten() {
  try {
    klang = klang ?? new AudioContext();
    void klang.resume();
  } catch { /* ohne Ton weiter */ }
  try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* ohne Stimme */ }
}

function gong(tief = false) {
  if (!klang) return;
  try {
    const t = klang.currentTime;
    for (const [f, laut] of [[tief ? 196 : 262, 0.35], [tief ? 392 : 524, 0.12]] as const) {
      const osc = klang.createOscillator();
      const gain = klang.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(laut, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      osc.connect(gain).connect(klang.destination);
      osc.start(t);
      osc.stop(t + 3.6);
    }
  } catch { /* egal */ }
}

function sprich(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.9;
    const de = s.getVoices().find((v) => v.lang.startsWith('de'));
    if (de) u.voice = de;
    s.speak(u);
  } catch { /* egal */ }
}

function ersterSatz(text: string) {
  const m = text.match(/^[^.!?]+[.!?]/);
  return m ? m[0] : text;
}

function uhr(sek: number) {
  const m = Math.floor(sek / 60);
  const s = sek % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}`;
}

interface Props {
  schritte: Schritt[];
  onEnde: () => void;
}

export default function YogaPlayer({ schritte, onEnde }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('uebergang');
  const [rest, setRest] = useState(UEBERGANG_SEKUNDEN + 2);
  const [pause, setPause] = useState(false);
  const [stimme, setStimme] = useState(() => {
    try { return localStorage.getItem(STIMME_AN) !== '0'; } catch { return true; }
  });
  const sperre = useRef<WakeLockSentinel | null>(null);
  const start = useRef(Date.now());

  const schritt = schritte[index];
  const naechster = schritte[index + 1];
  const gesamt = gesamtdauer(schritte);

  // Bildschirm anlassen, wo der Browser es erlaubt (nur über https oder als installierte App).
  useEffect(() => {
    (async () => {
      try { sperre.current = await navigator.wakeLock?.request('screen'); } catch { /* nicht verfügbar */ }
    })();
    return () => { void sperre.current?.release(); window.speechSynthesis?.cancel(); };
  }, []);

  const ansage = useCallback((i: number) => {
    const s = schritte[i];
    if (!s || !stimme) return;
    const seite = s.seite ? `, ${s.seite === 'rechts' ? 'rechte' : 'linke'} Seite` : '';
    const zweite = s.seite === 'links' && schritte[i - 1]?.uebung.id === s.uebung.id;
    sprich(zweite ? `Seitenwechsel. ${s.uebung.name}${seite}.` : `${s.uebung.name}${seite}. ${ersterSatz(s.uebung.anleitung)}`);
  }, [schritte, stimme]);

  // Ansage beim Beginn jedes Übergangs.
  useEffect(() => {
    if (phase === 'uebergang') ansage(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase]);

  // Takt: eine Sekunde, wechselt zwischen Übergang und Halten.
  useEffect(() => {
    if (pause || phase === 'fertig') return;
    const t = setInterval(() => setRest((r) => r - 1), 1000);
    return () => clearInterval(t);
  }, [pause, phase]);

  useEffect(() => {
    if (rest > 0 || phase === 'fertig') return;
    if (phase === 'uebergang') {
      gong();
      setPhase('halten');
      setRest(schritt.sekunden);
    } else if (index + 1 < schritte.length) {
      setIndex(index + 1);
      setPhase('uebergang');
      setRest(UEBERGANG_SEKUNDEN);
    } else {
      gong(true);
      if (stimme) sprich('Namasté. Bleib noch einen Moment liegen.');
      setPhase('fertig');
    }
  }, [rest, phase, index, schritt, schritte.length, stimme]);

  function springe(i: number) {
    if (i < 0 || i >= schritte.length) return;
    setIndex(i);
    setPhase('uebergang');
    setRest(UEBERGANG_SEKUNDEN);
  }

  function stimmeUmschalten() {
    const neu = !stimme;
    setStimme(neu);
    if (!neu) window.speechSynthesis?.cancel();
    try { localStorage.setItem(STIMME_AN, neu ? '1' : '0'); } catch { /* egal */ }
  }

  // Fortschritt über den ganzen Flow
  const vorbei = schritte.slice(0, index).reduce((s, x) => s + x.sekunden + UEBERGANG_SEKUNDEN, 0)
    + (phase === 'uebergang' ? UEBERGANG_SEKUNDEN - rest : UEBERGANG_SEKUNDEN + (schritt?.sekunden ?? 0) - rest);
  const anteil = phase === 'fertig' ? 1 : Math.min(1, Math.max(0, vorbei / gesamt));
  const phasenDauer = phase === 'uebergang' ? UEBERGANG_SEKUNDEN : schritt?.sekunden ?? 1;
  const ring = phase === 'fertig' ? 1 : Math.max(0, rest) / phasenDauer;

  if (phase === 'fertig') {
    const min = Math.max(1, Math.round((Date.now() - start.current) / 60000));
    return (
      <div className="fixed inset-0 z-50 bg-[#1c1917] text-stone-100 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-4xl font-light font-display mb-3">Namasté</div>
        <p className="text-stone-400 mb-1">{schritte.length} Haltungen · {min} Min.</p>
        <p className="text-stone-500 text-sm mb-10">Bleib noch einen Moment, bevor du aufstehst.</p>
        <button onClick={onEnde} className="px-6 py-3 rounded-xl bg-stone-100 text-stone-900 font-medium min-h-[48px]">Fertig</button>
      </div>
    );
  }

  const r = 34;
  const umfang = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-50 bg-[#1c1917] text-stone-100 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="h-1 bg-stone-800">
        <div className="h-full bg-stone-300 transition-all duration-1000" style={{ width: `${anteil * 100}%` }} />
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-xs text-stone-400">
        <button onClick={onEnde} className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center" aria-label="Beenden"><X size={20} /></button>
        <span className="uppercase tracking-wider">{schritt.uebung.block} · {index + 1}/{schritte.length}</span>
        <button onClick={stimmeUmschalten} className="p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-end" aria-label={stimme ? 'Ansage aus' : 'Ansage an'}>
          {stimme ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 px-4 flex items-center justify-center">
        <img key={schritt.uebung.id} src={schritt.uebung.bild} alt={schritt.uebung.name}
          className={`max-h-full max-w-full object-contain rounded-2xl bg-white ${schritt.seite === 'links' ? '-scale-x-100' : ''}`} />
      </div>

      <div className="max-w-md w-full mx-auto px-5 pt-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r={r} fill="none" stroke="#44403c" strokeWidth="5" />
              <circle cx="40" cy="40" r={r} fill="none" stroke={phase === 'halten' ? '#e7e5e4' : '#a8a29e'} strokeWidth="5"
                strokeLinecap="round" strokeDasharray={umfang} strokeDashoffset={umfang * (1 - ring)}
                style={{ transition: 'stroke-dashoffset 1s linear' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xl tabular-nums font-light">{uhr(Math.max(0, rest))}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-stone-400">
              {phase === 'uebergang' ? 'Komm in die Haltung' : 'Halten und atmen'}
            </div>
            <div className="text-2xl font-light font-display leading-tight">{schritt.uebung.name}</div>
            <div className="text-sm text-stone-400 italic">
              {schritt.uebung.sanskrit}{schritt.seite ? ` · ${schritt.seite === 'rechts' ? 'rechte' : 'linke'} Seite` : ''}
            </div>
          </div>
        </div>
        <p className="text-sm text-stone-300 leading-relaxed mt-3">{schritt.uebung.anleitung}</p>
        <p className="text-xs text-stone-500 mt-2 truncate">
          {naechster ? `Danach: ${naechster.uebung.name}${naechster.seite && naechster.uebung.id === schritt.uebung.id ? ' (andere Seite)' : ''}` : 'Danach: Ende'}
          {' · '}noch {minuten(gesamt - vorbei)}
        </p>
      </div>

      <div className="flex items-center justify-center gap-6 pb-6 pt-2">
        <button onClick={() => springe(index - 1)} disabled={index === 0} className="p-3 text-stone-300 disabled:opacity-30 min-h-[52px] min-w-[52px] flex items-center justify-center" aria-label="Zurück">
          <SkipBack size={24} />
        </button>
        <button onClick={() => setPause(!pause)} className="w-16 h-16 rounded-full bg-stone-100 text-stone-900 flex items-center justify-center" aria-label={pause ? 'Weiter' : 'Pause'}>
          {pause ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
        </button>
        <button onClick={() => springe(index + 1)} disabled={index + 1 >= schritte.length} className="p-3 text-stone-300 disabled:opacity-30 min-h-[52px] min-w-[52px] flex items-center justify-center" aria-label="Überspringen">
          <SkipForward size={24} />
        </button>
      </div>
    </div>
  );
}
