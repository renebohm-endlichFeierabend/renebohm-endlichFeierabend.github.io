import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { anmelden } from '../data/webuntisApi';

// Anmeldung an der WebUntis-Brücke der Schule (nur öffentliche Fassung). Die Zugangsdaten bleiben im
// Arbeitsspeicher dieses Tabs; beim Neuladen fragt die Seite wieder.
export default function WebUntisAnmeldung({ onFertig, kompakt = false }: { onFertig: () => void; kompakt?: boolean }) {
  const [benutzer, setBenutzer] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const senden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benutzer.trim() || !passwort) return;
    setLaeuft(true); setFehler('');
    try {
      await anmelden(benutzer, passwort);
      setPasswort('');
      onFertig();
    } catch (err) {
      setFehler(String((err as Error).message || err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <form onSubmit={senden} className={`space-y-3 ${kompakt ? '' : 'mb-4'} p-4 bg-white/80 rounded-2xl border border-stone-200/60`}>
      <p className="text-sm font-medium text-stone-700 flex items-center gap-2"><LogIn size={16} />Bei WebUntis anmelden</p>
      {fehler && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{fehler}</div>}
      <label className="block text-xs text-stone-500">WebUntis-Benutzername
        <input className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800"
          autoComplete="username" autoCapitalize="none" value={benutzer} onChange={(e) => setBenutzer(e.target.value)} />
      </label>
      <label className="block text-xs text-stone-500">Passwort
        <input type="password" className="mt-1 w-full p-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800"
          autoComplete="current-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} />
      </label>
      <button type="submit" disabled={laeuft || !benutzer.trim() || !passwort}
        className="w-full p-3 rounded-xl bg-stone-800 text-white text-sm font-medium disabled:opacity-50 min-h-[44px]">
        {laeuft ? 'Prüfe…' : 'Anmelden'}
      </button>
      <p className="text-[11px] leading-snug text-stone-500 flex gap-2"><ShieldCheck size={14} className="shrink-0 mt-0.5" />
        Benutzername und Passwort bleiben nur in diesem Tab und gehen über die Brücke der Schule (lfs-muelhausen.de)
        direkt an WebUntis. Dort wird nichts gespeichert. Deine Noten bleiben in diesem Browser.</p>
    </form>
  );
}
