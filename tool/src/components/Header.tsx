import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  action?: React.ReactNode;
}

export default function Header({ title, subtitle, onBack, action }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button onClick={onBack} className="p-2 -ml-2 text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
        <ArrowLeft size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-light text-stone-800 truncate font-display">{title}</h2>
        {subtitle && <p className="text-xs text-stone-500 truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
