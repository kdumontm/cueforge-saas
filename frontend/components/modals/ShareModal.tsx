'use client';
import { useState } from 'react';
import { Share2, Copy, Check, X, Clock, Users } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareType: 'playlist' | 'set' | 'track';
  resourceId: number;
  resourceName: string;
}

export default function ShareModal({ isOpen, onClose, shareType, resourceId, resourceName }: ShareModalProps) {
  const [allowCopy, setAllowCopy] = useState(false);
  const [expiration, setExpiration] = useState<number | null>(null); // hours or null for never
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleShare() {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('trackcue_token');
      const res = await fetch(`${API_URL}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          share_type: shareType,
          resource_id: resourceId,
          allow_copy: allowCopy,
          expires_hours: expiration,
        }),
      });
      if (!res.ok) throw new Error('Erreur de partage');
      const data = await res.json();
      setShareUrl(`${window.location.origin}/shared/${data.share_token}`);
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const typeLabels = { playlist: 'Playlist', set: 'Set', track: 'Track' };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-blue-400" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Partager</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-[var(--text-secondary)]">
            {typeLabels[shareType]} : <span className="font-semibold text-[var(--text-primary)]">{resourceName}</span>
          </div>

          {!shareUrl ? (
            <>
              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={allowCopy} onChange={e => setAllowCopy(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-primary)] accent-blue-500" />
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                      <Users size={13} /> Autoriser la copie
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">Les destinataires pourront copier dans leur bibliothèque</p>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    <Clock size={10} className="inline mr-1" /> Expiration
                  </label>
                  <select value={expiration ?? ''} onChange={e => setExpiration(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                    <option value="">Jamais</option>
                    <option value="24">24 heures</option>
                    <option value="168">7 jours</option>
                    <option value="720">30 jours</option>
                  </select>
                </div>
              </div>

              {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

              <button onClick={handleShare} disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all cursor-pointer border-none">
                {loading ? 'Création du lien...' : 'Créer le lien de partage'}
              </button>
            </>
          ) : (
            <>
              {/* Share link result */}
              <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl p-3">
                <p className="text-xs text-[var(--text-muted)] mb-1.5">Lien de partage :</p>
                <div className="flex items-center gap-2">
                  <input type="text" value={shareUrl} readOnly
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] border-none outline-none font-mono" />
                  <button onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer border-none transition-colors">
                    {copied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier</>}
                  </button>
                </div>
              </div>
              <button onClick={onClose}
                className="w-full py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] font-medium rounded-xl text-sm transition-colors cursor-pointer border-none">
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
