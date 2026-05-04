import { useState } from 'react';
import { Plus, Trash2, Youtube, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useStore } from '../../data/store';
import type { Video } from '../../types';

type Category = 'alle' | 'yoga' | 'meditation' | 'andere';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'yoga', label: 'Yoga' },
  { key: 'meditation', label: 'Meditation' },
  { key: 'andere', label: 'Andere' },
];

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function fetchOEmbed(url: string): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title ?? '', thumbnail: data.thumbnail_url ?? '' };
  } catch {
    return null;
  }
}

export default function VideosView() {
  const navigate = useNavigate();
  const { videos, setVideos } = useStore();
  const [categoryFilter, setCategoryFilter] = useState<Category>('alle');
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'yoga' | 'meditation' | 'andere'>('yoga');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [manualTitle, setManualTitle] = useState(false);

  const filtered = videos.filter((v) => categoryFilter === 'alle' || v.category === categoryFilter);

  const handleUrlBlur = async () => {
    if (!newUrl.trim() || manualTitle) return;
    setLoadingMeta(true);
    const meta = await fetchOEmbed(newUrl.trim());
    if (meta) {
      setNewTitle(meta.title);
    } else {
      setManualTitle(true);
    }
    setLoadingMeta(false);
  };

  const addVideo = async () => {
    if (!newUrl.trim() || !newTitle.trim()) return;
    const ytId = getYouTubeId(newUrl.trim());
    const thumbnail = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : undefined;
    const video: Video = {
      id: Date.now().toString(),
      url: newUrl.trim(),
      title: newTitle.trim(),
      category: newCategory,
      thumbnail,
      watchedCount: 0,
      addedAt: Date.now(),
    };
    setVideos([video, ...videos]);
    setNewUrl(''); setNewTitle(''); setNewCategory('yoga');
    setManualTitle(false); setShowAdd(false);
  };

  const openVideo = (video: Video) => {
    setVideos(videos.map((v) => v.id === video.id
      ? { ...v, watchedCount: v.watchedCount + 1, lastWatched: Date.now() }
      : v
    ));
    window.open(video.url, '_blank');
  };

  const deleteVideo = (id: string) => {
    setVideos(videos.filter((v) => v.id !== id));
  };

  const formatLastWatched = (ts?: number) => {
    if (!ts) return null;
    const d = new Date(ts);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div>
      <Header title="Videos" onBack={() => navigate('/')} />

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategoryFilter(c.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium min-h-[36px] ${
              categoryFilter === c.key ? 'bg-stone-800 text-stone-50' : 'bg-white border border-stone-200 text-stone-600'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 mb-4">
        {filtered.length === 0 && !showAdd && (
          <div className="text-center py-12 text-stone-400">
            <Youtube size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Noch keine Videos gespeichert</p>
          </div>
        )}
        {filtered.map((video) => (
          <div key={video.id} className="bg-white/60 rounded-2xl border border-stone-200/60 overflow-hidden">
            <button onClick={() => openVideo(video)} className="w-full flex items-center gap-3 p-3 text-left min-h-[72px]">
              {video.thumbnail ? (
                <img src={video.thumbnail} alt={video.title} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
              ) : (
                <div className="w-20 h-14 bg-stone-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Youtube size={20} className="text-stone-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 line-clamp-2">{video.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 capitalize">{video.category}</span>
                  {video.watchedCount > 0 && (
                    <span className="text-[10px] text-stone-400">{video.watchedCount}× · {formatLastWatched(video.lastWatched)}</span>
                  )}
                </div>
              </div>
              <ExternalLink size={14} className="text-stone-400 flex-shrink-0" />
            </button>
            <div className="flex justify-end px-3 pb-2">
              <button onClick={() => deleteVideo(video.id)} className="p-1.5 text-stone-400 min-h-[36px] min-w-[36px] flex items-center justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="p-4 bg-white rounded-2xl border border-stone-300 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">YouTube-URL</label>
            <input
              type="url"
              autoFocus
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">
              Titel {loadingMeta && <span className="text-stone-400 normal-case">(wird geladen…)</span>}
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titel des Videos"
              className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Kategorie</label>
            <div className="grid grid-cols-3 gap-2">
              {(['yoga', 'meditation', 'andere'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNewCategory(cat)}
                  className={`py-2 rounded-lg border-2 text-xs font-medium transition-all min-h-[40px] capitalize ${
                    newCategory === cat ? 'border-stone-800 bg-stone-800 text-stone-50' : 'border-stone-200 bg-stone-50 text-stone-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addVideo} disabled={!newUrl.trim() || !newTitle.trim()} className="flex-1 py-2 bg-stone-800 text-stone-50 rounded-lg font-medium text-sm disabled:opacity-40 min-h-[44px]">
              Hinzufügen
            </button>
            <button onClick={() => { setShowAdd(false); setNewUrl(''); setNewTitle(''); setManualTitle(false); }} className="px-4 py-2 text-stone-500 text-sm">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 min-h-[52px]">
          <Plus size={18} /><span className="text-sm font-medium">Video hinzufügen</span>
        </button>
      )}
    </div>
  );
}
