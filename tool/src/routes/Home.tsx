import { GraduationCap, CheckSquare, Youtube, Timer, Settings, ChevronRight, Cloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';

interface ModuleCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  badge?: React.ReactNode;
}

function ModuleCard({ icon, title, subtitle, onClick, badge }: ModuleCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-5 rounded-2xl border bg-white/60 border-stone-200/60 text-stone-800 transition-all active:scale-[0.98] min-h-[80px]"
    >
      <div className="p-2.5 rounded-xl bg-stone-100 flex-shrink-0">{icon}</div>
      <div className="flex-1 text-left">
        <div className="font-medium font-display text-lg">{title}</div>
        <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      <ChevronRight size={18} className="text-stone-400 flex-shrink-0" />
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { classes, todos, videos, meditationSessions, driveConfig, syncStatus } = useStore();

  const openTodos = todos.filter((t) => !t.done).length;
  const totalMedMinutes = Math.round(meditationSessions.reduce((s, m) => s + m.durationSeconds, 0) / 60);

  return (
    <div className="space-y-3">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-stone-800 font-display">Hallo René</h1>
          <p className="text-stone-500 text-sm mt-1">Was möchtest du heute tun?</p>
        </div>
        <div className="flex items-center gap-2">
          {driveConfig && (
            <div className={`w-2 h-2 rounded-full mt-1 ${
              syncStatus === 'idle' ? 'bg-emerald-400' :
              syncStatus === 'syncing' ? 'bg-amber-400 animate-pulse' :
              syncStatus === 'error' ? 'bg-red-400' : 'bg-stone-300'
            }`} title={syncStatus} />
          )}
          <button onClick={() => navigate('/settings')} className="p-2 text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            {driveConfig ? <Cloud size={20} /> : <Settings size={20} />}
          </button>
        </div>
      </div>

      <ModuleCard
        icon={<GraduationCap size={22} className="text-stone-700" />}
        title="Noten"
        subtitle={`${classes.length} ${classes.length === 1 ? 'Klasse' : 'Klassen'}`}
        onClick={() => navigate('/grades')}
      />
      <ModuleCard
        icon={<CheckSquare size={22} className="text-stone-700" />}
        title="Aufgaben"
        subtitle={`${openTodos} offen`}
        onClick={() => navigate('/todos')}
        badge={openTodos > 0 ? (
          <div className="w-6 h-6 rounded-full bg-stone-800 text-stone-50 flex items-center justify-center text-xs font-medium">
            {openTodos > 99 ? '99+' : openTodos}
          </div>
        ) : undefined}
      />
      <ModuleCard
        icon={<Youtube size={22} className="text-stone-700" />}
        title="Videos"
        subtitle={`${videos.length} gespeichert`}
        onClick={() => navigate('/videos')}
      />
      <ModuleCard
        icon={<Timer size={22} className="text-stone-700" />}
        title="Meditation"
        subtitle={totalMedMinutes > 0 ? `${totalMedMinutes} Minuten gesamt` : 'Timer & Sitzungen'}
        onClick={() => navigate('/meditation')}
      />
    </div>
  );
}
