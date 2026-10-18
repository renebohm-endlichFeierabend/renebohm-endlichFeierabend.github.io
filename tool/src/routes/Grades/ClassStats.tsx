import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import {
  getCurrentSchoolYear, getCurrentTerm, getTermData, formatGrade, gradeColorClass,
  roundToGrade, distributionOf, getExamGroups, avg,
} from './gradeUtils';

export default function ClassStats() {
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { classes, settings } = useStore();

  const cls = classes.find((c) => c.id === classId);
  if (!cls) { navigate('/grades'); return null; }

  const termKey = searchParams.get('term') ?? `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
  const [y, t] = termKey.split('-');

  const rows = cls.students.map((s) => ({ student: s, data: getTermData(s, termKey, settings.somiWeight) }));
  const withFinal = rows.filter((r) => r.data.finalGrade !== null);
  const finals = withFinal.map((r) => r.data.finalGrade as number);
  const classAvg = avg(finals);
  const somiClassAvg = avg(rows.map((r) => r.data.somiAvg).filter((v): v is number => v !== null));
  const examClassAvg = avg(rows.map((r) => r.data.examAvg).filter((v): v is number => v !== null));

  const dist = distributionOf(finals);
  const chartData = dist.map((count, i) => ({ note: String(i + 1), count }));
  const atRisk = withFinal.filter((r) => (r.data.finalGrade as number) >= 4.5);
  const examGroups = getExamGroups(cls.students, termKey);
  const missing = rows.length - withFinal.length;

  return (
    <div>
      <Header
        title="Statistik"
        subtitle={`${cls.name} · ${y} · ${t}. HJ`}
        onBack={() => navigate(`/grades/${cls.id}?term=${termKey}`)}
      />

      {withFinal.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">Noch keine Noten in diesem Halbjahr</div>
      ) : (
        <div className="space-y-4">
          <div className="p-6 bg-stone-800 text-stone-50 rounded-2xl text-center">
            <div className="text-xs uppercase tracking-widest text-stone-400 mb-2">Klassenschnitt (Zeugnisvorschlag)</div>
            <div className="text-5xl font-light font-display">{formatGrade(classAvg)}</div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-stone-700">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">SoMi Ø</div>
                <div className="text-xl font-light font-display">{formatGrade(somiClassAvg)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">Klausuren Ø</div>
                <div className="text-xl font-light font-display">{formatGrade(examClassAvg)}</div>
              </div>
            </div>
            <div className="text-[10px] text-stone-500 mt-3">
              Gewichtung SoMi {settings.somiWeight} % / Klausuren {100 - settings.somiWeight} % · {withFinal.length} von {rows.length} Schülern mit Noten
            </div>
          </div>

          <div className="bg-white/80 rounded-2xl border border-stone-200/60 p-4">
            <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Notenspiegel (gerundet)</div>
            <div className="h-44 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="note" tick={{ fontSize: 11, fill: '#78716c' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #d6d3d1' }}
                    formatter={(v) => [v, 'Schüler']}
                    labelFormatter={(l) => `Note ${l}`}
                  />
                  <Bar dataKey="count" fill="#57534e" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-stone-400 mt-2">Rundung auf ganze Noten, x,5 zur schlechteren Note.</p>
          </div>

          {atRisk.length > 0 && (
            <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
              <div className="text-xs uppercase tracking-wider text-red-700 mb-2">Gefährdet (Ø ab 4,5)</div>
              <div className="space-y-1">
                {atRisk.map((r) => (
                  <button
                    key={r.student.id}
                    onClick={() => navigate(`/grades/${cls.id}/student/${r.student.id}?term=${termKey}`)}
                    className="w-full flex justify-between text-sm text-red-800 min-h-[36px] items-center"
                  >
                    <span>{r.student.name}</span>
                    <span className="font-medium">{formatGrade(r.data.finalGrade)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {examGroups.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Klausuren</div>
              <div className="space-y-2">
                {examGroups.map((g) => (
                  <div key={g.key} className="p-4 bg-white/60 rounded-2xl border border-stone-200/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-800 truncate">{g.label}</div>
                        <div className="text-xs text-stone-500">
                          {new Date(g.date).toLocaleDateString('de-DE')} · {g.grades.length} Arbeiten
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-xl font-display text-lg ${gradeColorClass(g.avg)}`}>{formatGrade(g.avg)}</div>
                    </div>
                    <div className="grid grid-cols-6 gap-1 text-center">
                      {g.distribution.map((n, i) => (
                        <div key={i} className="bg-stone-50 rounded-lg py-1">
                          <div className="text-[10px] text-stone-400">Note {i + 1}</div>
                          <div className="text-sm font-medium text-stone-700">{n}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {missing > 0 && (
            <p className="text-xs text-stone-400 text-center">{missing} Schüler ohne Noten sind nicht eingerechnet.</p>
          )}
        </div>
      )}
    </div>
  );
}
