'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Music2, Share2, Copy, Clock, Eye, User, Disc3, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface SharedData {
  share_type: string;
  resource: any;
  owner_name: string;
  allow_copy: boolean;
  view_count: number;
  created_at: string;
}

export default function SharedPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/share/${token}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Lien expiré ou introuvable' : 'Erreur');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCopyToLibrary() {
    const authToken = localStorage.getItem('cueforge_token');
    if (!authToken) {
      window.location.href = `/login?redirect=/shared/${token}`;
      return;
    }
    setCopying(true);
    try {
      const res = await fetch(`${API_URL}/share/${token}/copy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Erreur de copie');
      setCopyDone(true);
    } catch {
      alert('Erreur lors de la copie');
    } finally {
      setCopying(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="text-center">
        <Share2 size={48} className="text-slate-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">{error}</h1>
        <p className="text-slate-400 text-sm mb-6">Ce lien de partage n'est plus disponible.</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 transition-colors inline-block">
          Retour à CueForge
        </Link>
      </div>
    </div>
  );

  const typeLabels: Record<string, string> = { playlist: 'Playlist', set: 'DJ Set', track: 'Track' };
  const typeIcons: Record<string, any> = { playlist: Disc3, set: Music2, track: Music2 };
  const TypeIcon = typeIcons[data?.share_type || 'track'];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-[#12121a]/90 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Music2 size={16} />
            </div>
            <span className="text-lg font-bold">CueForge</span>
          </Link>
          <Link href="/register" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Essayer gratuitement
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-[#12121a] border border-slate-800/60 rounded-2xl overflow-hidden">
          {/* Hero */}
          <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 px-8 py-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-purple-600/30 border border-purple-500/30 rounded-xl flex items-center justify-center">
                <TypeIcon size={24} className="text-purple-400" />
              </div>
              <div>
                <span className="px-2 py-0.5 bg-purple-600/20 border border-purple-500/30 rounded text-[10px] font-bold text-purple-400 uppercase">
                  {typeLabels[data?.share_type || 'track']}
                </span>
                <h1 className="text-2xl font-bold mt-1">{data?.resource?.name || data?.resource?.title || 'Sans titre'}</h1>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-1"><User size={13} /> {data?.owner_name || 'DJ'}</span>
              <span className="flex items-center gap-1"><Eye size={13} /> {data?.view_count} vue{(data?.view_count || 0) > 1 ? 's' : ''}</span>
              <span className="flex items-center gap-1"><Clock size={13} /> {new Date(data?.created_at || '').toLocaleDateString('fr-FR')}</span>
            </div>
          </div>

          {/* Tracks list */}
          <div className="p-6">
            {data?.resource?.tracks && data.resource.tracks.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  {data.resource.tracks.length} track{data.resource.tracks.length > 1 ? 's' : ''}
                </h3>
                {data.resource.tracks.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#0a0a0f] hover:bg-slate-800/30 transition-colors">
                    <span className="text-xs text-slate-500 w-6 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t.title || t.original_filename}</div>
                      <div className="text-xs text-slate-500">{t.artist || 'Artiste inconnu'}</div>
                    </div>
                    {t.bpm && <span className="text-xs text-slate-400 font-mono">{Math.round(t.bpm)} BPM</span>}
                    {t.key && <span className="text-xs text-blue-400 font-mono">{t.key}</span>}
                  </div>
                ))}
              </div>
            ) : data?.resource?.title ? (
              /* Single track */
              <div className="text-center py-6">
                <div className="text-lg font-bold">{data.resource.title}</div>
                <div className="text-slate-400">{data.resource.artist || 'Artiste inconnu'}</div>
                {data.resource.bpm && <div className="mt-2 text-sm text-slate-500">{Math.round(data.resource.bpm)} BPM • {data.resource.key || '?'}</div>}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">Contenu non disponible</div>
            )}
          </div>

          {/* Actions */}
          {data?.allow_copy && (
            <div className="px-6 py-4 border-t border-slate-800/60 flex justify-center">
              {copyDone ? (
                <div className="text-green-400 text-sm font-medium">✓ Copié dans ta bibliothèque !</div>
              ) : (
                <button onClick={handleCopyToLibrary} disabled={copying}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors cursor-pointer border-none">
                  <Copy size={16} /> {copying ? 'Copie en cours...' : 'Copier dans ma bibliothèque'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
