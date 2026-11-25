import { useState } from 'react';
import { MessageCircle, FileText, Plus, Trash2, ChevronRight, BarChart3, Upload, Copy } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm, getTermData, formatGrade, gradeColorClass, roundToGrade } from './gradeUtils';
import type { Student } from '../../types';
import { somiQuartale } from './somi';

export default function ClassOverview() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { classes, setClasses, settings } = useStore();

  const cls = classes.find((c) => c.id === classId);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentName, setStudentName] = useState('');

  if (!cls) { navigate('/grades'); return null; }

  const defaultTermKey = `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const activeTermKey = searchParams.get('term') ?? defaultTermKey;

  const allTermKeys = new Set([activeTermKey]);
  cls.students.forEach((s) => {
    [...(s.somiGrades ?? []), ...(s.examGrades ?? [])].forEach((g) => {
      if (g.termKey) allTermKeys.add(g.termKey);
    });
  });
  const sortedTerms = Array.from(allTermKeys).sort().reverse();

  const addStudent = () => {
    if (!studentName.trim()) return;
    const newStudent: Student = {
      id: Date.now().toString(),
      name: studentName.trim(),
      somiGrades: [],
      examGrades: [],
    };
    setClasses(classes.map((c) => c.id === cls.id ? { ...c, students: [...c.students, newStudent] } : c));
    setStudentName('');
    setShowAddStudent(false);
  };

  const deleteStudent = (sid: string) => {
    if (confirm('Schüler wirklich löschen?')) {
      setClasses(classes.map((c) => c.id === cls.id ? { ...c, students: c.students.filter((s) => s.id !== sid) } : c));
    }
  };

  const setTerm = (tk: string) => setSearchParams({ term: tk });

  return (
    <div>
      <Header
        title={cls.name}
        subtitle={`${cls.students.length} Schüler`}
        onBack={() => navigate('/grades')}
      />

      <div className="mb-4">
        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-2">Halbjahr</label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sortedTerms.map((tk) => {
            const parts = tk.split('-');
            const year = parts[0];
            const term = parts[1];
            const isActive = tk === activeTermKey;
            return (
              <button
                key={tk}
                onClick={() => setTerm(tk)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium min-h-[36px] ${
                  isActive ? 'bg-stone-800 text-stone-50' : 'bg-white border border-stone-200 text-stone-600'
                }`}
              >
                {year} · {term}. HJ
              </button>
            );
          })}
        </div>
      </div>

      {cls.students.length > 0 && !cls.somiArten && (
        <button onClick={() => navigate(`/grades/${cls.id}/somi`)}
          className="w-full text-left p-4 mb-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          <div className="text-sm font-medium">Sonstige Leistungen festlegen</div>
          <div className="text-xs mt-1">Welche Arten gibt es in diesem Kurs (Test, Mitarbeit, Video …) und wie stark zählen sie im SoMi-Schnitt?</div>
        </button>
      )}

      {cls.students.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => navigate(`/grades/${cls.id}/quick-somi?term=${activeTermKey}`)}
            className="flex flex-col items-center gap-1 p-4 bg-stone-800 text-stone-50 rounded-2xl min-h-[72px]"
          >
            <MessageCircle size={20} />
            <span className="text-xs font-medium">SoMi-Tag</span>
          </button>
          <button
            onClick={() => navigate(`/grades/${cls.id}/add-exam?term=${activeTermKey}`)}
            className="flex flex-col items-center gap-1 p-4 bg-white border border-stone-300 text-stone-700 rounded-2xl min-h-[72px]"
          >
            <FileText size={20} />
            <span className="text-xs font-medium">Klausur</span>
          </button>
        </div>
      )}

      {cls.students.length > 0 && (
        <button
          onClick={() => navigate(`/grades/${cls.id}/stats?term=${activeTermKey}`)}
          className="w-full flex items-center justify-center gap-2 p-3 mb-4 bg-white border border-stone-200 text-stone-700 rounded-2xl min-h-[48px]"
        >
          <BarChart3 size={16} /><span className="text-xs font-medium">Statistik &amp; Notenspiegel</span>
        </button>
      )}

      {cls.somiArten && cls.somiArten.length > 0 && (
        <button onClick={() => navigate(`/grades/${cls.id}/somi`)} className="w-full text-xs text-stone-500 mb-3 underline-offset-2 hover:underline">
          SoMi: {cls.somiArten.map((a) => a.name).join(', ')} · Gewichtung ändern
        </button>
      )}

      {cls.students.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(
            <button
              onClick={() => navigate(`/grades/${cls.id}/webuntis?term=${activeTermKey}`)}
              className="flex items-center justify-center gap-2 p-3 bg-white border border-stone-200 text-stone-700 rounded-2xl min-h-[48px]"
            >
              <Upload size={16} /><span className="text-xs font-medium">Nach WebUntis</span>
            </button>
          )}
          <button
            onClick={() => navigate(`/grades/${cls.id}/webuntis-code?term=${activeTermKey}`)}
            className="flex items-center justify-center gap-2 p-3 bg-white border border-stone-200 text-stone-700 rounded-2xl min-h-[48px]"
          >
            <Copy size={16} /><span className="text-xs font-medium">WebUntis-Code</span>
          </button>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {cls.students.length === 0 && !showAddStudent && (
          <div className="text-center py-12 text-stone-400">
            <p className="text-sm">Noch keine Schüler</p>
          </div>
        )}
        {cls.students.map((student) => {
          const data = getTermData(student, activeTermKey, settings.somiWeight, cls.somiArten);
          return (
            <div key={student.id} className="flex items-center gap-2 p-4 bg-white/60 rounded-2xl border border-stone-200/60">
              <button
                onClick={() => navigate(`/grades/${cls.id}/student/${student.id}?term=${activeTermKey}`)}
                className="flex-1 flex items-center gap-3 text-left min-w-0 min-h-[44px]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-800 truncate">{student.name}</div>
                  <div className="text-xs text-stone-500 flex gap-2">
                    <span>SoMi: {formatGrade(data.somiAvg)}</span>
                    <span>·</span>
                    <span>Kl: {formatGrade(data.examAvg)}</span>
                  </div>
                  {somiQuartale(student, cls, activeTermKey).length > 0 && (
                    <div className="text-xs text-cyan-700 flex flex-wrap gap-x-2" aria-label="SoMi-Quartalsnoten">
                      {somiQuartale(student, cls, activeTermKey).map((q) => (
                        <span key={q.zeitraum}>SoMi {q.name.replace('Quartal ', 'Q')}: {formatGrade(q.wert)} ({q.stufe})</span>
                      ))}
                    </div>
                  )}
                </div>
                {data.finalGrade !== null && (
                  <div className={`px-3 py-2 rounded-xl flex-shrink-0 ${gradeColorClass(data.finalGrade)}`}>
                    <div className="text-lg font-medium leading-none font-display">{formatGrade(data.finalGrade)}</div>
                    <div className="text-[9px] uppercase tracking-wider mt-0.5">Vorschlag {roundToGrade(data.finalGrade)}</div>
                  </div>
                )}
                <ChevronRight size={14} className="text-stone-400 flex-shrink-0" />
              </button>
              <button
                onClick={() => deleteStudent(student.id)}
                className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {showAddStudent ? (
        <div className="p-4 bg-white rounded-2xl border border-stone-300 space-y-3">
          <input
            type="text"
            autoFocus
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStudent()}
            placeholder="Name des Schülers"
            className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
          />
          <div className="flex gap-2">
            <button onClick={addStudent} className="flex-1 py-2 bg-stone-800 text-stone-50 rounded-lg font-medium text-sm">
              Hinzufügen
            </button>
            <button onClick={() => { setShowAddStudent(false); setStudentName(''); }} className="px-4 py-2 text-stone-500 text-sm">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddStudent(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 min-h-[52px]"
        >
          <Plus size={18} /><span className="text-sm font-medium">Schüler hinzufügen</span>
        </button>
      )}
    </div>
  );
}
