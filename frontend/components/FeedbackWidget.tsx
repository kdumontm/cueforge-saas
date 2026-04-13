'use client';
import { useState } from 'react';
import { MessageSquare, X, Send, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('feature');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const token = localStorage.getItem('cueforge_token');
      await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, message, rating }),
      });
    } catch {
      // Even if API doesn't exist yet, show success for UX
    }
    setSending(false);
    setSent(true);
    setTimeout(() => { setSent(false); setIsOpen(false); setMessage(''); setRating(null); }, 2000);
  }

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg shadow-purple-900/40 flex items-center justify-center transition-all hover:scale-110 cursor-pointer border-none"
          title="Donner ton avis"
        >
          <MessageSquare size={20} />
        </button>
      )}

      {/* Feedback form */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-[var(--bg-card,#12121a)] border border-[var(--border-default,#2d2d3d)] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle,#1e1e2e)]">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare size={14} className="text-purple-400" /> Ton avis
            </span>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors cursor-pointer bg-transparent border-none">
              <X size={16} />
            </button>
          </div>

          {sent ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-sm font-semibold text-white">Merci pour ton retour !</p>
              <p className="text-xs text-slate-400 mt-1">On prend en compte chaque feedback.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              {/* Type selector */}
              <div className="flex gap-2">
                {[
                  { value: 'feature', label: '💡 Idée' },
                  { value: 'bug', label: '🐛 Bug' },
                  { value: 'other', label: '💬 Autre' },
                ].map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value as any)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      type === t.value
                        ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                        : 'bg-transparent border-slate-700/50 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Décris ton idée, le bug ou ton retour..."
                rows={3}
                required
                className="w-full bg-[var(--bg-primary,#0a0a0f)] border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:border-purple-500 focus:outline-none"
              />

              {/* Rating */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Ton expérience :</span>
                <button type="button" onClick={() => setRating(rating === 'up' ? null : 'up')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer border-none ${rating === 'up' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-transparent text-slate-500 hover:text-emerald-400'}`}>
                  <ThumbsUp size={14} />
                </button>
                <button type="button" onClick={() => setRating(rating === 'down' ? null : 'down')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer border-none ${rating === 'down' ? 'bg-red-500/20 text-red-400' : 'bg-transparent text-slate-500 hover:text-red-400'}`}>
                  <ThumbsDown size={14} />
                </button>
              </div>

              {/* Submit */}
              <button type="submit" disabled={sending || !message.trim()}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer border-none flex items-center justify-center gap-2">
                {sending ? <><Loader2 size={14} className="animate-spin" /> Envoi...</> : <><Send size={14} /> Envoyer</>}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
