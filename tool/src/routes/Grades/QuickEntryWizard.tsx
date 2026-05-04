import { useState } from 'react';
import { X, SkipForward, Check } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm, GRADE_BUTTONS, btnGradeColor } from './gradeUtils';
import type { Grade } from '../../types';

interface QuickEntryWizardProps {
  type: 'somi' | 'exam';
}

export default function QuickEntryWizard({ type }: QuickEntryWizardProps) {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();

  const cls = classes.find((c) => c.id === classId);
  const [step, setStep] = useState<'label' | 'grading'>('label');
  const [label, setLabel] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entered, setEntered] = useState<Record<string, number>>({});
  const [customGrade, setCustomGrade] = useState('');

  if (!cls) { navigate(`/grades/${classId}`); return null; }

  const isExam = type === 'exam';
  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const students = cls.students;
  const currentStudent = students[currentIndex];
  const isLast = currentIndex === students.length - 1;
  const progress = students.length > 0 ? ((currentIndex + 1) / students.length) * 100 : 0;

  const selectGrade = (value: number) => {
    const updated = { ...entered, [currentStudent.id]: value };
    setEntered(updated);
    setCustomGrade('');
    if (isLast) finishEntry(updated);
    else setCurrentIndex(currentIndex + 1);
  };

  const skip = () => {
    if (isLast) finishEntry(entered);
    else setCurrentIndex(currentIndex + 1);
  };

  const back = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const finishEntry = (gradesMap: Record<string, number>) => {
    const date = new Date().toISOString();
    const field = isExam ? 'examGrades' : 'somiGrades';
    const defaultLabel = isExam ? 'Klausur' : 'Mündlich';
    const updated = classes.map((c) => {
      if (c.id !== cls.id) return c;
      return {
        ...c,
        students: c.students.map((s) => {
          if (gradesMap[s.id] === undefined) return s;
          const newGrade: Grade = {
            id: `${Date.now()}-${s.id}`,
            value: gradesMap[s.id],
            label: label.trim() || defaultLabel,
            date,
            termKey,
          };
          return { ...s, [field]: [newGrade, ...(s[field] ?? [])] };
        }),
      };
    });
    setClasses(updated);
    navigate(`/grades/${classId}?term=${termKey}`);
  };

  const cancel = () => {
    if (Object.keys(entered).length > 0 && !confirm('Eingabe abbrechen?')) return;
    navigate(`/grades/${classId}?term=${termKey}`);
  };

  if (step === 'label') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/grades/${classId}?term=${termKey}`)} className="p-2 -ml-2 text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
          <h2 className="text-2xl font-light text-stone-800 font-display">
            {isExam ? 'Klausur eintragen' : 'SoMi-Tagesnote'}
          </h2>
        </div>
        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60 mb-4">
          <label className="block text-xs uppercase tracking-wider text-stone-500 mb-2">Bezeichnung</label>
          <input
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && label.trim() && setStep('grading')}
            placeholder={isExam ? 'z.B. Klausur 1' : 'z.B. Stunde 15.11.'}
            className="w-full px-3 py-3 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
          />
          <p className="text-xs text-stone-500 mt-3">
            {isExam
              ? 'Schüler die gefehlt haben einfach überspringen'
              : `Wird für alle ${students.length} Schüler verwendet`}
          </p>
        </div>
        <button
          onClick={() => setStep('grading')}
          disabled={!label.trim()}
          className="w-full py-3 bg-stone-800 text-stone-50 rounded-2xl font-medium text-sm disabled:opacity-40 min-h-[52px]"
        >
          Los geht's →
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={cancel} className="p-2 -ml-2 text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <X size={20} />
        </button>
        <div className="text-xs text-stone-500">{currentIndex + 1} / {students.length}</div>
      </div>

      <div className="h-1.5 bg-stone-200 rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-stone-800 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="text-center mb-6">
        <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">{label}</div>
        <h2 className="text-3xl font-light text-stone-800 font-display">{currentStudent.name}</h2>
        {entered[currentStudent.id] !== undefined && (
          <div className="mt-2 inline-block px-3 py-1 bg-stone-200 rounded-full text-xs text-stone-600">
            Eingetragen: {entered[currentStudent.id]}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {GRADE_BUTTONS.map((g) => (
          <button
            key={g.display}
            onClick={() => selectGrade(g.value)}
            className={`py-5 rounded-2xl border-2 font-medium text-2xl font-display active:scale-95 transition-transform ${btnGradeColor(g.value)}`}
          >
            {g.display}
          </button>
        ))}
      </div>

      {isExam && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            inputMode="decimal"
            value={customGrade}
            onChange={(e) => setCustomGrade(e.target.value)}
            placeholder="Eigene Note (z.B. 2.4)"
            className="flex-1 px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm"
          />
          <button
            onClick={() => {
              const v = parseFloat(customGrade.replace(',', '.'));
              if (!isNaN(v) && v >= 1 && v <= 6) selectGrade(v);
              else alert('Bitte Note zwischen 1 und 6 eingeben');
            }}
            className="px-4 py-2 bg-stone-700 text-stone-50 rounded-lg text-sm font-medium min-h-[44px]"
          >
            OK
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={back}
          disabled={currentIndex === 0}
          className="flex-1 py-3 bg-white border border-stone-200 rounded-2xl text-sm font-medium text-stone-700 disabled:opacity-40 min-h-[52px]"
        >
          ← Zurück
        </button>
        <button
          onClick={skip}
          className="flex-1 flex items-center justify-center gap-1 py-3 bg-white border border-stone-200 rounded-2xl text-sm font-medium text-stone-700 min-h-[52px]"
        >
          <SkipForward size={14} />Überspringen
        </button>
      </div>

      {isLast && Object.keys(entered).length > 0 && (
        <button
          onClick={() => finishEntry(entered)}
          className="w-full mt-3 py-3 bg-emerald-600 text-white rounded-2xl font-medium text-sm min-h-[52px]"
        >
          <Check size={16} className="inline mr-1" />
          Alle speichern ({Object.keys(entered).length})
        </button>
      )}
    </div>
  );
}
