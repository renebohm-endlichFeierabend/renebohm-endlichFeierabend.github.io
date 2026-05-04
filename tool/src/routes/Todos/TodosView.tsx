import { useState } from 'react';
import { Plus, Trash2, Check, CheckSquare, Calendar, Bell, School, Briefcase, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import type { Todo } from '../../types';

type Category = 'school' | 'business';
type Filter = 'open' | 'done';
type Priority = 'high' | 'medium' | 'low';

function priorityStyle(p: Priority) {
  if (p === 'high') return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' };
  if (p === 'medium') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  return { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200', dot: 'bg-stone-400' };
}

function formatDue(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(date);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const hasTime = !iso.endsWith('T23:59:00');
  const timeStr = hasTime ? ` · ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : '';
  let label: string;
  if (diffDays < 0) label = `Überfällig${timeStr}`;
  else if (diffDays === 0) label = `Heute${timeStr}`;
  else if (diffDays === 1) label = `Morgen${timeStr}`;
  else if (diffDays < 7) label = `In ${diffDays} Tagen${timeStr}`;
  else label = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + timeStr;
  return { label, overdue: diffDays < 0 };
}

export default function TodosView() {
  const navigate = useNavigate();
  const { todos, setTodos } = useStore();
  const [category, setCategory] = useState<Category>('school');
  const [filter, setFilter] = useState<Filter>('open');
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [withReminder, setWithReminder] = useState(false);

  const filtered = todos
    .filter((t) => t.category === category && (filter === 'open' ? !t.done : t.done))
    .sort((a, b) => {
      const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });

  const openCount = todos.filter((t) => t.category === category && !t.done).length;
  const doneCount = todos.filter((t) => t.category === category && t.done).length;

  const addTodo = () => {
    if (!newText.trim()) return;
    const dueDate = newDate
      ? newTime ? `${newDate}T${newTime}:00` : `${newDate}T23:59:00`
      : null;
    const todo: Todo = {
      id: Date.now().toString(),
      text: newText.trim(),
      category,
      priority: newPriority,
      dueDate,
      withReminder: withReminder && !!dueDate,
      done: false,
      doneAt: null,
      createdAt: Date.now(),
    };
    if (withReminder && dueDate) scheduleNotification(todo);
    setTodos([todo, ...todos]);
    setNewText(''); setNewDate(''); setNewTime('');
    setNewPriority('medium'); setWithReminder(false); setShowAdd(false);
  };

  const scheduleNotification = async (todo: Todo) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return;
    const delay = new Date(todo.dueDate!).getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => new Notification('Lehrer-Tool', { body: todo.text, icon: '/icon-192.png' }), delay);
    }
  };

  const toggleDone = (id: string) => {
    setTodos(todos.map((t) => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t));
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((t) => t.id !== id));
  };

  return (
    <div>
      <Header title="Aufgaben" onBack={() => navigate('/')} />

      <div className="flex gap-1 p-1 bg-stone-200/60 rounded-xl mb-4">
        <button
          onClick={() => setCategory('school')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium min-h-[44px] ${category === 'school' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
        >
          <School size={16} />Schule
        </button>
        <button
          onClick={() => setCategory('business')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium min-h-[44px] ${category === 'business' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
        >
          <Briefcase size={16} />Business
        </button>
      </div>

      <div className="flex gap-2 mb-4 text-xs items-center">
        <button
          onClick={() => setFilter('open')}
          className={`px-3 py-1.5 rounded-full min-h-[32px] ${filter === 'open' ? 'bg-stone-800 text-stone-50' : 'bg-white border border-stone-200 text-stone-600'}`}
        >
          Offen ({openCount})
        </button>
        <button
          onClick={() => setFilter('done')}
          className={`px-3 py-1.5 rounded-full min-h-[32px] ${filter === 'done' ? 'bg-stone-800 text-stone-50' : 'bg-white border border-stone-200 text-stone-600'}`}
        >
          Erledigt ({doneCount})
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {filtered.length === 0 && !showAdd && (
          <div className="text-center py-12 text-stone-400">
            <CheckSquare size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{filter === 'open' ? 'Keine offenen Aufgaben' : 'Noch nichts erledigt'}</p>
          </div>
        )}
        {filtered.map((todo) => {
          const ps = priorityStyle(todo.priority);
          const due = formatDue(todo.dueDate);
          return (
            <div key={todo.id} className={`flex items-start gap-3 p-3 bg-white/60 rounded-2xl border border-stone-200/60 ${todo.done ? 'opacity-60' : ''}`}>
              <button onClick={() => toggleDone(todo.id)} className="pt-0.5 flex-shrink-0 min-h-[44px] min-w-[32px] flex items-start justify-center">
                {todo.done ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center mt-0.5">
                    <Check size={14} className="text-white" />
                  </div>
                ) : (
                  <div className={`w-6 h-6 rounded-full border-2 ${ps.border} flex items-center justify-center mt-0.5`}>
                    <div className={`w-2 h-2 rounded-full ${ps.dot}`} />
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm text-stone-800 ${todo.done ? 'line-through' : ''}`}>{todo.text}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${ps.bg} ${ps.text} font-medium uppercase tracking-wider`}>
                    {todo.priority === 'high' ? 'Hoch' : todo.priority === 'medium' ? 'Mittel' : 'Niedrig'}
                  </span>
                  {due && (
                    <span className={`text-[10px] flex items-center gap-1 ${due.overdue && !todo.done ? 'text-red-600 font-medium' : 'text-stone-500'}`}>
                      <Calendar size={10} />{due.label}
                    </span>
                  )}
                  {todo.withReminder && <Bell size={10} className="text-stone-400" />}
                </div>
              </div>
              <button onClick={() => deleteTodo(todo.id)} className="p-1 text-stone-400 flex-shrink-0 min-h-[44px] min-w-[32px] flex items-start justify-center pt-1.5">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {showAdd ? (
        <div className="p-4 bg-white rounded-2xl border border-stone-300 space-y-3">
          <input
            type="text"
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="Was ist zu tun?"
            className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
          />
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-2">Priorität</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { val: 'high' as Priority, label: 'Hoch', color: 'bg-red-50 text-red-700 border-red-200' },
                { val: 'medium' as Priority, label: 'Mittel', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                { val: 'low' as Priority, label: 'Niedrig', color: 'bg-stone-50 text-stone-600 border-stone-200' },
              ]).map((p) => (
                <button
                  key={p.val}
                  onClick={() => setNewPriority(p.val)}
                  className={`py-2 rounded-lg border-2 text-xs font-medium transition-all min-h-[40px] ${newPriority === p.val ? p.color : 'border-transparent bg-stone-50 text-stone-400'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-2">Fällig (optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm" />
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} disabled={!newDate} className="px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm disabled:opacity-40" />
            </div>
          </div>
          {newDate && newTime && (
            <button onClick={() => setWithReminder(!withReminder)} className="w-full flex items-center gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200 min-h-[52px]">
              {withReminder ? <Check size={16} className="text-emerald-600" /> : <Square size={16} className="text-stone-400" />}
              <Bell size={14} className="text-stone-600" />
              <span className="text-sm text-stone-700">Erinnerung zur Fälligkeit</span>
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={addTodo} disabled={!newText.trim()} className="flex-1 py-2 bg-stone-800 text-stone-50 rounded-lg font-medium text-sm disabled:opacity-40 min-h-[44px]">
              Hinzufügen
            </button>
            <button onClick={() => { setShowAdd(false); setNewText(''); setNewDate(''); setNewTime(''); setWithReminder(false); }} className="px-4 py-2 text-stone-500 text-sm">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 min-h-[52px]">
          <Plus size={18} /><span className="text-sm font-medium">Neue Aufgabe</span>
        </button>
      )}
    </div>
  );
}
