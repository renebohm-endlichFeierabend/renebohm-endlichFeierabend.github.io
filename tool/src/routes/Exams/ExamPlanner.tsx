import { useState } from 'react';
import { Plus, Trash2, CalendarClock, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { addDays, dayDiff, relativeDay, toDateKey } from '../../data/dates';
import type { PlannedExam, Todo } from '../../types';

export default function ExamPlanner() {
  const navigate = useNavigate();
  const { classes, plannedExams, setPlannedExams, todos, setTodos, saveData } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [correctionDue, setCorrectionDue] = useState('');
  const [createTodo, setCreateTodo] = useState(true);

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Klasse gelöscht';

  const upcoming = plannedExams.filter((e) => dayDiff(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const past = plannedExams.filter((e) => dayDiff(e.date) < 0).sort((a, b) => b.date.localeCompare(a.date));

  const onDateChange = (v: string) => {
    setDate(v);
    // Vorschlag: Korrektur zwei Wochen nach der Arbeit, solange nichts anderes gewählt wurde
    if (v && !correctionDue) setCorrectionDue(toDateKey(addDays(new Date(`${v}T00:00:00`), 14)));
  };

  const reset = () => {
    setShowAdd(false); setTitle(''); setDate(''); setCorrectionDue(''); setCreateTodo(true);
  };

  const add = () => {
    if (!title.trim() || !date || !classId) return;
    const id = Date.now().toString();
    const exam: PlannedExam = {
      id, classId, title: title.trim(), date,
      correctionDue: correctionDue || null,
    };
    let newTodos = todos;
    if (createTodo && correctionDue) {
      const todo: Todo = {
        id: `${id}-korrektur`,
        text: `Korrektur: ${exam.title} (${className(classId)})`,
        category: 'school',
        priority: 'high',
        dueDate: `${correctionDue}T23:59:00`,
        withReminder: false,
        done: false,
        doneAt: null,
        createdAt: Date.now(),
        source: `exam:${id}`,
      };
      exam.todoId = todo.id;
      newTodos = [todo, ...todos];
    }
    // ein einziger Schreibvorgang, damit Plan und Aufgabe nicht auseinanderlaufen
    saveData({ plannedExams: [...plannedExams, exam], todos: newTodos });
    reset();
  };

  const remove = (e: PlannedExam) => {
    if (!confirm(`„${e.title}“ löschen?${e.todoId ? '\nEine noch offene Korrektur-Aufgabe wird ebenfalls entfernt.' : ''}`)) return;
    const linked = e.todoId ? todos.find((t) => t.id === e.todoId) : undefined;
    saveData({
      plannedExams: plannedExams.filter((x) => x.id !== e.id),
      todos: linked && !linked.done ? todos.filter((t) => t.id !== linked.id) : todos,
    });
  };

  const card = (e: PlannedExam, dim = false) => {
    const todo = e.todoId ? todos.find((t) => t.id === e.todoId) : undefined;
    return (
      <div key={e.id} className={`flex items-start gap-3 p-4 bg-white/60 rounded-2xl border border-stone-200/60 ${dim ? 'opacity-60' : ''}`}>
        <div className="p-2 rounded-xl bg-stone-100 flex-shrink-0"><CalendarClock size={18} className="text-stone-700" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-stone-800">{e.title}</div>
          <div className="text-xs text-stone-500">{className(e.classId)} · {relativeDay(e.date)} ({new Date(`${e.date}T00:00:00`).toLocaleDateString('de-DE')})</div>
          {e.correctionDue && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${todo?.done ? 'text-emerald-600' : 'text-stone-500'}`}>
              <ClipboardCheck size={12} />
              Korrektur bis {new Date(`${e.correctionDue}T00:00:00`).toLocaleDateString('de-DE')}
              {todo?.done ? ' · erledigt' : ''}
            </div>
          )}
        </div>
        <button onClick={() => remove(e)} className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <Header title="Klassenarbeiten" subtitle="Termine & Korrekturfristen" onBack={() => navigate('/')} />

      {classes.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">Lege zuerst unter „Noten“ eine Klasse an.</div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {upcoming.length === 0 && !showAdd && (
              <div className="text-center py-10 text-stone-400 text-sm">Keine anstehenden Arbeiten</div>
            )}
            {upcoming.map((e) => card(e))}
          </div>

          {showAdd ? (
            <div className="p-4 bg-white rounded-2xl border border-stone-300 space-y-3 mb-6">
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-sm min-h-[44px]"
              >
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bezeichnung (z. B. 2. Klassenarbeit)"
                className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Termin</label>
                  <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Korrektur bis</label>
                  <input type="date" value={correctionDue} onChange={(e) => setCorrectionDue(e.target.value)} className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200 min-h-[48px]">
                <input type="checkbox" checked={createTodo} onChange={(e) => setCreateTodo(e.target.checked)} disabled={!correctionDue} />
                <span className="text-sm text-stone-700">Korrektur als Aufgabe anlegen</span>
              </label>
              <div className="flex gap-2">
                <button onClick={add} disabled={!title.trim() || !date || !classId} className="flex-1 py-2 bg-stone-800 text-stone-50 rounded-lg font-medium text-sm disabled:opacity-40 min-h-[44px]">
                  Hinzufügen
                </button>
                <button onClick={reset} className="px-4 py-2 text-stone-500 text-sm">Abbrechen</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 min-h-[52px] mb-6">
              <Plus size={18} /><span className="text-sm font-medium">Arbeit planen</span>
            </button>
          )}

          {past.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Vergangen</div>
              <div className="space-y-2">{past.map((e) => card(e, true))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
