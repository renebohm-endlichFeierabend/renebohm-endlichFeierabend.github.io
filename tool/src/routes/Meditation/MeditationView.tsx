import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Play, Square, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import type { MeditationSession } from '../../types';

type Screen = 'setup' | 'session' | 'done' | 'stats';

const PRESETS = [5, 10, 15, 20, 30];

function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const acquire = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
    }
  }, []);
  const release = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);
  return { acquire, release };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function playBell() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(432, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 2);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 3);
  } catch { /* ignore */ }
}

export default function MeditationView() {
  const navigate = useNavigate();
  const { meditationSessions, setMeditationSessions } = useStore();
  const [screen, setScreen] = useState<Screen>('setup');
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState(10);
  const [intervalMinutes, setIntervalMinutes] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [sessionStart, setSessionStart] = useState(0);
  const [breathPhase, setBreathPhase] = useState<'ein' | 'halten' | 'aus'>('ein');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breathRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { acquire: wakeLockAcquire, release: wakeLockRelease } = useWakeLock();

  const startSession = (minutes: number) => {
    const seconds = minutes * 60;
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setSessionStart(Date.now());
    setScreen('session');
    wakeLockAcquire();
    playBell();

    let nextBell = intervalMinutes > 0 ? intervalMinutes * 60 : 0;
    let elapsed = 0;

    intervalRef.current = setInterval(() => {
      elapsed += 1;
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          endSession(seconds);
          return 0;
        }
        if (nextBell > 0 && elapsed >= nextBell) {
          playBell();
          nextBell += intervalMinutes * 60;
        }
        return r - 1;
      });
    }, 1000);

    let phase = 0;
    breathRef.current = setInterval(() => {
      phase = (phase + 1) % 3;
      setBreathPhase(phase === 0 ? 'ein' : phase === 1 ? 'halten' : 'aus');
    }, 4000);
  };

  const endSession = useCallback((duration: number) => {
    wakeLockRelease();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (breathRef.current) clearInterval(breathRef.current);
    playBell();
    const session: MeditationSession = {
      id: Date.now().toString(),
      durationSeconds: duration,
      type: 'silent',
      startedAt: sessionStart,
      completedAt: Date.now(),
    };
    setMeditationSessions([session, ...meditationSessions]);
    setScreen('done');
  }, [sessionStart, meditationSessions, setMeditationSessions, wakeLockRelease]);

  const stopSession = () => {
    if (!confirm('Sitzung abbrechen?')) return;
    wakeLockRelease();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (breathRef.current) clearInterval(breathRef.current);
    const elapsed = totalSeconds - remaining;
    if (elapsed > 30) {
      const session: MeditationSession = {
        id: Date.now().toString(),
        durationSeconds: elapsed,
        type: 'silent',
        startedAt: sessionStart,
        completedAt: null,
      };
      setMeditationSessions([session, ...meditationSessions]);
    }
    setScreen('setup');
  };

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (breathRef.current) clearInterval(breathRef.current);
    wakeLockRelease();
  }, [wakeLockRelease]);

  const totalMinutes = Math.round(meditationSessions.reduce((s, m) => s + m.durationSeconds, 0) / 60);
  const completedSessions = meditationSessions.filter((s) => s.completedAt !== null).length;

  const streakDays = (() => {
    const days = new Set(meditationSessions.map((s) => new Date(s.startedAt).toDateString()));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toDateString())) streak++;
      else if (i > 0) break;
    }
    return streak;
  })();

  if (screen === 'session') {
    const progress = totalSeconds > 0 ? (remaining / totalSeconds) : 1;
    const circumference = 2 * Math.PI * 90;
    const strokeDashoffset = circumference * (1 - progress);
    const breathLabel = breathPhase === 'ein' ? 'Einatmen' : breathPhase === 'halten' ? 'Halten' : 'Ausatmen';
    const breathScale = breathPhase === 'ein' ? 'scale-110' : breathPhase === 'halten' ? 'scale-110' : 'scale-90';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-900 text-stone-50 px-5">
        <div className="relative w-52 h-52 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#44403c" strokeWidth="6" />
            <circle
              cx="100" cy="100" r="90" fill="none"
              stroke="#e7e5e4" strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`w-16 h-16 rounded-full bg-stone-700/50 transition-transform duration-[4000ms] ${breathScale}`} />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-4xl font-light font-display">{formatTime(remaining)}</div>
          </div>
        </div>

        <p className="text-stone-400 text-sm mb-12 tracking-widest uppercase">{breathLabel}</p>

        <button
          onClick={stopSession}
          className="flex items-center gap-2 px-8 py-4 bg-stone-700 rounded-2xl text-stone-200 min-h-[52px]"
        >
          <Square size={18} />Stopp
        </button>
      </div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <Timer size={36} className="text-emerald-600" />
        </div>
        <h2 className="text-3xl font-light font-display text-stone-800 mb-2">Sitzung abgeschlossen</h2>
        <p className="text-stone-500 text-sm mb-8">Gut gemacht. Nimm dir einen Moment.</p>
        <button
          onClick={() => setScreen('setup')}
          className="px-8 py-4 bg-stone-800 text-stone-50 rounded-2xl font-medium min-h-[52px]"
        >
          Zurück
        </button>
      </div>
    );
  }

  if (screen === 'stats') {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const label = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const minutes = meditationSessions
        .filter((s) => new Date(s.startedAt).toDateString() === d.toDateString())
        .reduce((sum, s) => sum + Math.round(s.durationSeconds / 60), 0);
      return { label, minutes };
    });

    return (
      <div>
        <Header title="Meditationsstatistik" onBack={() => setScreen('setup')} />
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Gesamt', value: `${totalMinutes} Min`, sub: 'aller Zeiten' },
            { label: 'Sitzungen', value: completedSessions.toString(), sub: 'abgeschlossen' },
            { label: 'Streak', value: `${streakDays}`, sub: streakDays === 1 ? 'Tag' : 'Tage' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/60 rounded-2xl border border-stone-200/60 p-4 text-center">
              <div className="text-2xl font-light font-display text-stone-800">{stat.value}</div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-white/60 rounded-2xl border border-stone-200/60 p-4 mb-4">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Letzte 7 Tage (Minuten)</div>
          <div className="flex items-end gap-1.5 h-24">
            {last7.map((d) => {
              const maxMin = Math.max(...last7.map((x) => x.minutes), 1);
              const height = d.minutes > 0 ? Math.max((d.minutes / maxMin) * 80, 8) : 4;
              return (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all ${d.minutes > 0 ? 'bg-stone-700' : 'bg-stone-200'}`}
                    style={{ height: `${height}px` }}
                  />
                  <span className="text-[9px] text-stone-400">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          {meditationSessions.slice(0, 10).map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-stone-200/60">
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                <Timer size={16} className="text-stone-500" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-stone-800">{Math.round(s.durationSeconds / 60)} Minuten</div>
                <div className="text-xs text-stone-500">{new Date(s.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              {s.completedAt === null && <span className="text-[10px] text-stone-400">Abgebrochen</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Meditation"
        onBack={() => navigate('/')}
        action={
          <button onClick={() => setScreen('stats')} className="p-2 text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <BarChart2 size={20} />
          </button>
        }
      />

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Dauer wählen</div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => { setSelectedMinutes(m); setCustomMinutes(''); }}
              className={`py-4 rounded-2xl font-medium text-sm font-display transition-all min-h-[64px] ${
                selectedMinutes === m && !customMinutes
                  ? 'bg-stone-800 text-stone-50'
                  : 'bg-white/60 border border-stone-200 text-stone-700'
              }`}
            >
              {m}'
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={customMinutes}
            onChange={(e) => { setCustomMinutes(e.target.value); if (e.target.value) setSelectedMinutes(parseInt(e.target.value) || 10); }}
            placeholder="Eigene Minuten"
            min={1}
            max={120}
            className="flex-1 px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm"
          />
        </div>
      </div>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Intervallglocken (optional)</div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 5, 10, 15].map((m) => (
            <button
              key={m}
              onClick={() => setIntervalMinutes(m)}
              className={`py-3 rounded-xl text-xs font-medium min-h-[48px] ${
                intervalMinutes === m ? 'bg-stone-800 text-stone-50' : 'bg-white/60 border border-stone-200 text-stone-600'
              }`}
            >
              {m === 0 ? 'Keine' : `Alle ${m}'`}
            </button>
          ))}
        </div>
      </div>

      {totalMinutes > 0 && (
        <div className="bg-stone-100 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Timer size={20} className="text-stone-500" />
          <div>
            <div className="text-sm font-medium text-stone-700">{totalMinutes} Minuten meditiert</div>
            <div className="text-xs text-stone-500">{streakDays} {streakDays === 1 ? 'Tag' : 'Tage'} Streak</div>
          </div>
        </div>
      )}

      <button
        onClick={() => startSession(customMinutes ? parseInt(customMinutes) || selectedMinutes : selectedMinutes)}
        className="w-full flex items-center justify-center gap-2 py-4 bg-stone-800 text-stone-50 rounded-2xl font-medium text-lg font-display min-h-[64px]"
      >
        <Play size={20} />Starten
      </button>
    </div>
  );
}
