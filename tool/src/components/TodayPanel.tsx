import { AlertCircle, CalendarClock, Flame, Moon, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { addDays, dayDiff, dueKey, relativeDay, toDateKey } from '../data/dates';

/** Meditationstage in Folge; zählt auch, wenn heute noch nicht meditiert wurde, aber gestern. */
function meditationStreak(starts: number[]): number {
  const days = new Set(starts.map((ms) => toDateKey(new Date(ms))));
  let cursor = new Date();
  if (!days.has(toDateKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(toDateKey(cursor))) { n += 1; cursor = addDays(cursor, -1); }
  return n;
}

export default function TodayPanel() {
  const navigate = useNavigate();
  const { todos, plannedExams, classes, feierabendLogs, meditationSessions } = useStore();
  const today = toDateKey();

  const open = todos.filter((t) => !t.done);
  const dueNow = open
    .filter((t) => { const k = dueKey(t.dueDate); return k !== null && k <= today; })
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  const lastLog = [...feierabendLogs].filter((l) => l.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const focusTodos = lastLog && dayDiff(lastLog.date) >= -4
    ? lastLog.tomorrowTodoIds.map((id) => open.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t)
    : [];

  const exams = plannedExams
    .filter((e) => { const d = dayDiff(e.date); return d >= 0 && d <= 14; })
    .sort((a, b) => a.date.localeCompare(b.date));

  const streak = meditationStreak(meditationSessions.filter((s) => s.completedAt !== null).map((s) => s.startedAt));
  const doneTodayLog = feierabendLogs.some((l) => l.date === today);
  const showFeierabend = !doneTodayLog && new Date().getHours() >= 14;

  const empty = dueNow.length === 0 && focusTodos.length === 0 && exams.length === 0 && streak === 0 && !showFeierabend;
  if (empty) return null;

  return (
    <div className="mb-5 space-y-3">
      <div className="text-xs uppercase tracking-wider text-stone-500">Heute</div>

      {focusTodos.length > 0 && (
        <div className="p-4 bg-stone-800 text-stone-50 rounded-2xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-stone-400 mb-2"><Target size={14} />Dein Fokus von gestern Abend</div>
          <ul className="space-y-1">{focusTodos.map((t) => <li key={t.id} className="text-sm">• {t.text}</li>)}</ul>
        </div>
      )}

      {dueNow.length > 0 && (
        <button onClick={() => navigate('/todos')} className="w-full text-left p-4 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-red-600 mb-2"><AlertCircle size={14} />Fällig oder überfällig ({dueNow.length})</div>
          <ul className="space-y-1">
            {dueNow.slice(0, 4).map((t) => (
              <li key={t.id} className="text-sm text-stone-800 flex justify-between gap-2">
                <span className="truncate">{t.text}</span>
                <span className="text-xs text-stone-500 flex-shrink-0">{relativeDay(dueKey(t.dueDate)!)}</span>
              </li>
            ))}
          </ul>
          {dueNow.length > 4 && <div className="text-xs text-stone-400 mt-1">+ {dueNow.length - 4} weitere</div>}
        </button>
      )}

      {exams.length > 0 && (
        <button onClick={() => navigate('/exams')} className="w-full text-left p-4 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-stone-500 mb-2"><CalendarClock size={14} />Klassenarbeiten (14 Tage)</div>
          <ul className="space-y-1">
            {exams.slice(0, 3).map((e) => (
              <li key={e.id} className="text-sm text-stone-800 flex justify-between gap-2">
                <span className="truncate">{e.title} · {classes.find((c) => c.id === e.classId)?.name ?? '–'}</span>
                <span className="text-xs text-stone-500 flex-shrink-0">{relativeDay(e.date)}</span>
              </li>
            ))}
          </ul>
        </button>
      )}

      <div className="flex gap-2">
        {streak > 0 && (
          <button onClick={() => navigate('/meditation')} className="flex-1 flex items-center gap-2 p-3 bg-white/60 rounded-2xl border border-stone-200/60 min-h-[48px]">
            <Flame size={16} className="text-amber-600" />
            <span className="text-sm text-stone-700">{streak} {streak === 1 ? 'Tag' : 'Tage'} in Folge</span>
          </button>
        )}
        {showFeierabend && (
          <button onClick={() => navigate('/feierabend')} className="flex-1 flex items-center gap-2 p-3 bg-white/60 rounded-2xl border border-stone-200/60 min-h-[48px]">
            <Moon size={16} className="text-stone-600" />
            <span className="text-sm text-stone-700">Feierabend-Check</span>
          </button>
        )}
      </div>
    </div>
  );
}
