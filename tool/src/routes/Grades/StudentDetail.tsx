import { useState } from 'react';
import { Trash2, TrendingUp, MessageCircle, FileText } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { getCurrentSchoolYear, getCurrentTerm, getTermData, formatGrade, gradeColorClass } from './gradeUtils';

type Tab = 'chart' | 'somi' | 'exams';

export default function StudentDetail() {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes, setClasses } = useStore();
  const [tab, setTab] = useState<Tab>('chart');

  const cls = classes.find((c) => c.id === classId);
  const student = cls?.students.find((s) => s.id === studentId);

  if (!cls || !student) { navigate(`/grades/${classId}`); return null; }

  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const data = getTermData(student, termKey);
  const [y, t] = termKey.split('-');

  const allGrades = [
    ...(student.somiGrades ?? []).filter((g) => g.termKey === termKey).map((g) => ({ ...g, type: 'SoMi' as const })),
    ...(student.examGrades ?? []).filter((g) => g.termKey === termKey).map((g) => ({ ...g, type: 'Klausur' as const })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const chartData = allGrades.map((g) => ({
    date: new Date(g.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    somi: g.type === 'SoMi' ? g.value : null,
    klausur: g.type === 'Klausur' ? g.value : null,
    label: g.label,
  }));

  const deleteGrade = (gradeId: string, type: 'somi' | 'exams') => {
    const field = type === 'somi' ? 'somiGrades' : 'examGrades';
    setClasses(classes.map((c) => c.id === cls.id ? {
      ...c,
      students: c.students.map((s) => s.id === student.id
        ? { ...s, [field]: (s[field] as typeof s.somiGrades).filter((g) => g.id !== gradeId) }
        : s),
    } : c));
  };

  const updateNotes = (notes: string) => {
    setClasses(classes.map((c) => c.id === cls.id ? {
      ...c,
      students: c.students.map((s) => s.id === student.id ? { ...s, notes } : s),
    } : c));
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'chart', label: 'Verlauf', icon: <TrendingUp size={14} /> },
    { key: 'somi', label: `SoMi (${data.somi.length})`, icon: <MessageCircle size={14} /> },
    { key: 'exams', label: `Klausuren (${data.exams.length})`, icon: <FileText size={14} /> },
  ];

  return (
    <div>
      <Header
        title={student.name}
        subtitle={`${cls.name} · ${y} · ${t}. HJ`}
        onBack={() => navigate(`/grades/${classId}?term=${termKey}`)}
      />

      {data.finalGrade !== null && (
        <div className="mb-6 p-6 bg-stone-800 text-stone-50 rounded-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Voraussichtliche Zeugnisnote</div>
          <div className="text-5xl font-light font-display">{formatGrade(data.finalGrade)}</div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-stone-700">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">SoMi Ø</div>
              <div className="text-xl font-light font-display">{formatGrade(data.somiAvg)}</div>
              <div className="text-[10px] text-stone-500">{data.somi.length} Einträge</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Klausuren Ø</div>
              <div className="text-xl font-light font-display">{formatGrade(data.examAvg)}</div>
              <div className="text-[10px] text-stone-500">{data.exams.length} Einträge</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-stone-200/60 rounded-xl mb-4">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium min-h-[40px] ${
              tab === tabItem.key ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'
            }`}
          >
            {tabItem.icon}{tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'chart' && (
        <div className="bg-white/80 rounded-2xl border border-stone-200/60 p-4 mb-4">
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm">Noch keine Noten in diesem Halbjahr</div>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Notenverlauf</div>
              <div className="h-64 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
                    <YAxis domain={[1, 6]} reversed ticks={[1, 2, 3, 4, 5, 6]} tick={{ fontSize: 10, fill: '#78716c' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #d6d3d1' }}
                      formatter={(value, name) =>
                        value != null ? [value, name === 'somi' ? 'SoMi' : 'Klausur'] : [null, '']
                      }
                    />
                    <ReferenceLine y={4} stroke="#dc2626" strokeDasharray="3 3" strokeOpacity={0.4} />
                    {data.finalGrade !== null && (
                      <ReferenceLine
                        y={data.finalGrade}
                        stroke="#1c1917"
                        strokeDasharray="5 5"
                        strokeOpacity={0.5}
                        label={{ value: 'Zeugnis', fontSize: 10, fill: '#57534e', position: 'right' }}
                      />
                    )}
                    <Line type="monotone" dataKey="somi" stroke="#0891b2" strokeWidth={2} dot={{ fill: '#0891b2', r: 5 }} connectNulls name="SoMi" />
                    <Line type="monotone" dataKey="klausur" stroke="#9333ea" strokeWidth={2} dot={{ fill: '#9333ea', r: 6 }} connectNulls name="Klausur" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center mt-3 text-xs">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-cyan-600" /><span className="text-stone-600">SoMi</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-purple-600" /><span className="text-stone-600">Klausur</span></div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'somi' && (
        <div className="space-y-2">
          {data.somi.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm">Keine SoMi-Noten</div>
          ) : data.somi.map((g) => (
            <div key={g.id} className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-stone-200/60">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-medium font-display flex-shrink-0 ${gradeColorClass(g.value)}`}>
                {g.value}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{g.label}</div>
                <div className="text-xs text-stone-500">{new Date(g.date).toLocaleDateString('de-DE')}</div>
              </div>
              <button onClick={() => deleteGrade(g.id, 'somi')} className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'exams' && (
        <div className="space-y-2">
          {data.exams.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm">Keine Klausuren</div>
          ) : data.exams.map((g) => (
            <div key={g.id} className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-stone-200/60">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-medium font-display flex-shrink-0 ${gradeColorClass(g.value)}`}>
                {g.value}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{g.label}</div>
                <div className="text-xs text-stone-500">{new Date(g.date).toLocaleDateString('de-DE')}</div>
              </div>
              <button onClick={() => deleteGrade(g.id, 'exams')} className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-2">Notizen (Elternsprechtag)</label>
        <textarea
          value={student.notes ?? ''}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Anmerkungen für das Elterngespräch…"
          rows={4}
          className="w-full px-3 py-2 bg-white/60 rounded-xl border border-stone-200 focus:outline-none focus:border-stone-400 text-sm text-stone-700 resize-none"
        />
      </div>
    </div>
  );
}
