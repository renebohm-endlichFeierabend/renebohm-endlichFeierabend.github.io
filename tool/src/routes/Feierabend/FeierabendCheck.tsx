import { useMemo, useState } from 'react';
import { Check, Moon, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { addDays, dueKey, startOfWeek, toDateKey } from '../../data/dates';
import type { FeierabendEntry, Todo } from '../../types';

const PRIO_ORDER = { high: 0, medium: 1, low: 2 } as const;

export default function FeierabendCheck() {
  const navigate = useNavigate();
  const { todos, setTodos, meditationSessions, feierabendLogs, setFeierabendLogs, saveData } = useStore();
  const today = toDateKey();
  const existing = feierabendLogs.find((l) => l.date === today);

  const [highlight, setHighlight] = useState(existing?.highlight ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [focus, setFocus] = useState<string[]>(existing?.tomorrowTodoIds ?? []);
  const [saved, setSaved] = useState(false);

  const todayStart = new Date(`${today}T00:00:00`).getTime();
  const doneToday = todos.filter((t) => t.done && t.doneAt !== null && t.doneAt >= todayStart);
  const open = todos.filter((t) => !t.done);
  const dueNow = open.filter((t) => { const k = dueKey(t.dueDate); return k !== null && k <= today; });

  const candidates = useMemo(() => [...open].sort((a, b) => {
    if (PRIO_ORDER[a.priority] !== PRIO_ORDER[b.priority]) return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  }), [open]);

  const postpone = (t: Todo) => {
    const tomorrow = toDateKey(addDays(new Date(), 1));
    const time = t.dueDate && !t.dueDate.endsWith('T23:59:00') ? t.dueDate.slice(10) : 'T23:59:00';
    setTodos(todos.map((x) => x.id === t.id ? { ...x, dueDate: `${tomorrow}${time}` } : x));
  };

  const complete = (t: Todo) => {
    setTodos(todos.map((x) => x.id === t.id ? { ...x, done: true, doneAt: Date.now() } : x));
  };

  const toggleFocus = (id: string) => {
    setFocus((f) => f.includes(id) ? f.filter((x) => x !== id) : f.length >= 3 ? f : [...f, id]);
  };

  const save = () => {
    const entry: FeierabendEntry = {
      id: existing?.id ?? Date.now().toString(),
      date: today,
      highlight: highlight.trim(),
      note: note.trim(),
      tomorrowTodoIds: focus,
    };
    setFeierabendLogs([entry, ...feierabendLogs.filter((l) => l.date !== today)]);
    setSaved(true);
  };

  // Wochenrückblick (Montag bis heute)
  const weekStart = startOfWeek();
  const weekStartMs = weekStart.getTime();
  const weekKey = toDateKey(weekStart);
  const week = {
    done: todos.filter((t) => t.done && t.doneAt !== null && t.doneAt >= weekStartMs).length,
    created: todos.filter((t) => t.createdAt >= weekStartMs).length,
    medMin: Math.round(
      meditationSessions.filter((s) => s.completedAt !== null && s.startedAt >= weekStartMs)
        .reduce((a, s) => a + s.durationSeconds, 0) / 60
    ),
    logs: feierabendLogs.filter((l) => l.date >= weekKey).sort((a, b) => a.date.localeCompare(b.date)),
  };

  return (
    <div className="space-y-5">
      <Header title="Feierabend-Check" subtitle={new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })} onBack={() => navigate('/')} />

      <section className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">1 · Heute geschafft</div>
        {doneToday.length === 0 ? (
          <p className="text-sm text-stone-400">Noch keine Aufgabe als erledigt markiert.</p>
        ) : (
          <ul className="space-y-1">
            {doneToday.map((t) => (
              <li key={t.id} className="text-sm text-stone-700 flex items-start gap-2"><Check size={14} className="text-emerald-600 mt-1 flex-shrink-0" />{t.text}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">2 · Noch fällig oder überfällig</div>
        {dueNow.length === 0 ? (
          <p className="text-sm text-stone-400">Nichts offen. Gut so.</p>
        ) : (
          <div className="space-y-2">
            {dueNow.map((t) => (
              <div key={t.id} className="p-3 bg-stone-50 rounded-xl">
                <div className="text-sm text-stone-800 mb-2">{t.text}</div>
                <div className="flex gap-2">
                  <button onClick={() => complete(t)} className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium min-h-[40px]">Erledigt</button>
                  <button onClick={() => postpone(t)} className="flex-1 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-medium min-h-[40px] flex items-center justify-center gap-1">
                    Auf morgen <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">3 · Was war heute gut?</div>
        <input
          type="text"
          value={highlight}
          onChange={(e) => { setHighlight(e.target.value); setSaved(false); }}
          placeholder="Ein Satz genügt"
          className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm"
        />
      </section>

      <section className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-stone-500">4 · Fokus für morgen</div>
          <div className="text-xs text-stone-400">{focus.length} / 3</div>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-stone-400">Keine offenen Aufgaben.</p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {candidates.map((t) => {
              const on = focus.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => { toggleFocus(t.id); setSaved(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left min-h-[44px] border ${on ? 'bg-stone-800 text-stone-50 border-stone-800' : 'bg-stone-50 text-stone-700 border-transparent'}`}
                >
                  <span className="text-sm flex-1">{t.text}</span>
                  {on && <Check size={14} />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">5 · Kopf frei machen (optional)</div>
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="Was geht dir noch durch den Kopf? Hier ablegen und loslassen."
          rows={3}
          className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm resize-none"
        />
      </section>

      <button onClick={save} className="w-full flex items-center justify-center gap-2 py-3 bg-stone-800 text-stone-50 rounded-2xl font-medium text-sm min-h-[52px]">
        <Moon size={16} />{saved ? 'Gespeichert – schönen Feierabend' : existing ? 'Aktualisieren' : 'Feierabend machen'}
      </button>

      <section className="p-4 bg-stone-100 rounded-2xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-stone-500 mb-3"><Sparkles size={14} />Diese Woche</div>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div><div className="text-2xl font-light font-display text-stone-800">{week.done}</div><div className="text-[10px] text-stone-500 uppercase tracking-wider">erledigt</div></div>
          <div><div className="text-2xl font-light font-display text-stone-800">{week.created}</div><div className="text-[10px] text-stone-500 uppercase tracking-wider">neu</div></div>
          <div><div className="text-2xl font-light font-display text-stone-800">{week.medMin}</div><div className="text-[10px] text-stone-500 uppercase tracking-wider">Min. Meditation</div></div>
        </div>
        {week.logs.length > 0 && (
          <ul className="space-y-1 pt-3 border-t border-stone-200">
            {week.logs.filter((l) => l.highlight).map((l) => (
              <li key={l.id} className="text-xs text-stone-600">
                <span className="text-stone-400">{new Date(`${l.date}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short' })}</span> · {l.highlight}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
