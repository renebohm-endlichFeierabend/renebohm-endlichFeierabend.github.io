import { useState } from 'react';
import { useRef } from 'react';
import { Cloud, CloudOff, RefreshCw, LogOut, Check, Download, Upload, Server } from 'lucide-react';
import { COCKPIT } from '../../data/serverSync';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import { normalizeAppData } from '../../data/db';
import { requestGoogleToken, isTokenValid } from '../../data/auth';

export default function DriveSyncSettings() {
  const navigate = useNavigate();
  const { driveConfig, syncStatus, connectDrive, disconnectDrive, syncNow, settings, setSettings, saveData } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [clientId, setClientId] = useState(driveConfig?.clientId ?? '');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const isConnected = !!driveConfig && isTokenValid(driveConfig);

  const handleConnect = async () => {
    if (!clientId.trim()) { setError('Bitte Client-ID eingeben'); return; }
    setError('');
    setConnecting(true);
    try {
      const config = await requestGoogleToken(clientId.trim());
      await connectDrive(config);
    } catch (e) {
      setError(`Verbindung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Google Drive trennen? Lokale Daten bleiben erhalten.')) {
      await disconnectDrive();
      setClientId('');
    }
  };

  const exportBackup = () => {
    const s = useStore.getState();
    const data = normalizeAppData({
      version: s.version, lastModified: s.lastModified, classes: s.classes, todos: s.todos,
      videos: s.videos, meditationSessions: s.meditationSessions, plannedExams: s.plannedExams,
      feierabendLogs: s.feierabendLogs, yogaFlows: s.yogaFlows, settings: s.settings,
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lehrer-tool-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg('Backup heruntergeladen.');
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.classes) || !Array.isArray(parsed.todos)) {
        throw new Error('Datei ist kein Lehrer-Tool-Backup.');
      }
      const data = normalizeAppData(parsed);
      const stand = new Date(data.lastModified).toLocaleString('de-DE');
      if (!confirm(
        `Backup vom ${stand} einspielen?\n\n${data.classes.length} Klassen, ${data.todos.length} Aufgaben, ${data.videos.length} Videos.\n` +
        `ACHTUNG: Die aktuellen Daten auf diesem Gerät werden ersetzt.`
      )) return;
      await saveData(data);
      setBackupMsg('Backup eingespielt.');
    } catch (e) {
      setBackupMsg(`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const syncStatusLabel = {
    idle: null,
    syncing: 'Synchronisiert…',
    error: 'Sync-Fehler',
    offline: 'Offline',
  }[syncStatus];

  return (
    <div>
      <Header title="Einstellungen" onBack={() => navigate('/')} />

      <div className="space-y-4">
        {COCKPIT ? (
        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="flex items-center gap-3 mb-4">
            {syncStatus === 'error' || syncStatus === 'offline'
              ? <CloudOff size={24} className="text-red-500" />
              : <Server size={24} className="text-emerald-600" />}
            <div>
              <div className="font-medium text-stone-800">Gespeichert auf dem Server</div>
              <div className="text-xs text-stone-500">Handy und PC sehen denselben Stand. Kein Cloud-Abgleich.</div>
            </div>
            {syncStatusLabel && (
              <span className={`ml-auto text-xs ${syncStatus === 'error' ? 'text-red-500' : 'text-stone-400'}`}>
                {syncStatus === 'error' ? 'Server nicht erreichbar' : syncStatusLabel}
              </span>
            )}
          </div>
          <button
            onClick={() => syncNow()}
            disabled={syncStatus === 'syncing'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-stone-100 rounded-xl text-stone-700 text-sm font-medium disabled:opacity-40 min-h-[44px]"
          >
            <RefreshCw size={16} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
            Jetzt abgleichen
          </button>
        </div>
        ) : (
        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="flex items-center gap-3 mb-4">
            {isConnected ? <Cloud size={24} className="text-emerald-600" /> : <CloudOff size={24} className="text-stone-400" />}
            <div>
              <div className="font-medium text-stone-800">Google Drive Sync</div>
              {isConnected ? (
                <div className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check size={10} />Verbunden als {driveConfig?.userEmail}
                </div>
              ) : (
                <div className="text-xs text-stone-500">Nicht verbunden</div>
              )}
            </div>
            {syncStatusLabel && (
              <span className={`ml-auto text-xs ${syncStatus === 'error' ? 'text-red-500' : 'text-stone-400'}`}>
                {syncStatusLabel}
              </span>
            )}
          </div>

          {!isConnected ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">
                  Google OAuth Client-ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm font-mono"
                />
                <p className="text-xs text-stone-400 mt-1">
                  Einmalig einrichten – siehe SETUP.md im Repository.
                </p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                onClick={handleConnect}
                disabled={connecting || !clientId.trim()}
                className="w-full py-3 bg-stone-800 text-stone-50 rounded-xl font-medium text-sm disabled:opacity-40 min-h-[48px]"
              >
                {connecting ? 'Verbinde…' : 'Mit Google verbinden'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => syncNow()}
                disabled={syncStatus === 'syncing'}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-stone-100 rounded-xl text-stone-700 text-sm font-medium disabled:opacity-40 min-h-[44px]"
              >
                <RefreshCw size={16} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                Jetzt sync
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 rounded-xl text-red-700 text-sm font-medium min-h-[44px]"
              >
                <LogOut size={16} />Trennen
              </button>
            </div>
          )}
        </div>
        )}

        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="text-sm font-medium text-stone-800 mb-1">Zeugnisnote: Gewichtung</div>
          <p className="text-xs text-stone-500 mb-3">Anteil der sonstigen Mitarbeit (SoMi) an der Zeugnisnote. Gilt für alle Klassen.</p>
          <input
            type="range" min={0} max={100} step={5}
            value={settings.somiWeight}
            onChange={(e) => setSettings({ ...settings, somiWeight: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-stone-600 mt-1">
            <span>SoMi {settings.somiWeight} %</span>
            <span>Klausuren {100 - settings.somiWeight} %</span>
          </div>
        </div>

        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="text-sm font-medium text-stone-800 mb-1">Backup</div>
          <p className="text-xs text-stone-500 mb-3">Sichert alle Daten als Datei, unabhängig vom Abgleich. Das Backup enthält Schülernamen und Noten, bitte sicher aufbewahren.</p>
          <div className="flex gap-2">
            <button onClick={exportBackup} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-stone-100 rounded-xl text-stone-700 text-sm font-medium min-h-[44px]">
              <Download size={16} />Exportieren
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-stone-100 rounded-xl text-stone-700 text-sm font-medium min-h-[44px]">
              <Upload size={16} />Importieren
            </button>
            <input
              ref={fileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); }}
            />
          </div>
          {backupMsg && <p className="text-xs text-stone-500 mt-2">{backupMsg}</p>}
        </div>

        <div className="p-5 bg-white/60 rounded-2xl border border-stone-200/60">
          <div className="text-sm font-medium text-stone-700 mb-1">Über die App</div>
          <div className="text-xs text-stone-500 space-y-1">
            <p>Lehrer-Tool · Privates Werkzeug für René Bohm</p>
            {COCKPIT ? (
              <p>Daten liegen auf dem eigenen Server (Cockpit), dazu eine Kopie im Browser für kurze Ausfälle.</p>
            ) : (
              <>
                <p>Daten werden lokal im Browser (IndexedDB) gespeichert.</p>
                <p>Mit Google Drive Sync werden alle Geräte synchronisiert.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
