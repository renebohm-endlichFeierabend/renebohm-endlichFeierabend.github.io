import { useState } from 'react';
import { GraduationCap, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import type { Class } from '../../types';

export default function ClassesView() {
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');

  const addClass = () => {
    if (!name.trim()) return;
    const newClass: Class = {
      id: Date.now().toString(),
      name: name.trim(),
      students: [],
      createdAt: Date.now(),
    };
    setClasses([...classes, newClass]);
    setName('');
    setShowAdd(false);
  };

  const deleteClass = (id: string) => {
    if (confirm('Klasse wirklich löschen? Alle Daten gehen verloren.')) {
      setClasses(classes.filter((c) => c.id !== id));
    }
  };

  return (
    <div>
      <Header title="Noten" onBack={() => navigate('/')} />

      <div className="space-y-2 mb-4">
        {classes.length === 0 && !showAdd && (
          <div className="text-center py-12 text-stone-400">
            <GraduationCap size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Noch keine Klassen angelegt</p>
          </div>
        )}
        {classes.map((cls) => (
          <div key={cls.id} className="flex items-center gap-3 p-4 bg-white/60 rounded-2xl border border-stone-200/60">
            <button
              onClick={() => navigate(`/grades/${cls.id}`)}
              className="flex-1 flex items-center gap-3 text-left min-h-[44px]"
            >
              <div className="w-10 h-10 rounded-xl bg-stone-800 text-stone-50 flex items-center justify-center font-medium font-display flex-shrink-0">
                {cls.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800">{cls.name}</div>
                <div className="text-xs text-stone-500">{cls.students.length} Schüler</div>
              </div>
              <ChevronRight size={18} className="text-stone-400" />
            </button>
            <button
              onClick={() => deleteClass(cls.id)}
              className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="p-4 bg-white rounded-2xl border border-stone-300 space-y-3">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addClass()}
            placeholder="Klassenname (z.B. 8a)"
            className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
          />
          <div className="flex gap-2">
            <button onClick={addClass} className="flex-1 py-2 bg-stone-800 text-stone-50 rounded-lg font-medium text-sm">
              Hinzufügen
            </button>
            <button onClick={() => { setShowAdd(false); setName(''); }} className="px-4 py-2 text-stone-500 text-sm">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 min-h-[52px]"
        >
          <Plus size={18} /><span className="text-sm font-medium">Neue Klasse</span>
        </button>
      )}
    </div>
  );
}
