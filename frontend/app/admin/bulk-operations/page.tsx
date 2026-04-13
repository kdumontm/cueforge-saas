'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

type BulkTab = 'users' | 'tracks' | 'emails';
type UserAction = 'activate' | 'deactivate' | 'delete' | 'change_plan' | 'add_tag';
type TrackAction = 'delete' | 'retag' | 'reanalyze' | 'export' | 'archive';

interface BulkJob {
  id: string;
  type: string;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  created_at: string;
  completed_at?: string;
}

export default function BulkOperationsPage() {
  const [tab, setTab] = useState<BulkTab>('users');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<BulkJob[]>([]);

  // Users
  const [userAction, setUserAction] = useState<UserAction>('activate');
  const [userInput, setUserInput] = useState('');
  const [userPlan, setUserPlan] = useState('pro');
  const [userTag, setUserTag] = useState('');

  // Tracks
  const [trackAction, setTrackAction] = useState<TrackAction>('delete');
  const [trackInput, setTrackInput] = useState('');

  // Emails
  const [recipients, setRecipients] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Load jobs
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchJobs() {
    try {
      const data = await adminApi.getBulkJobs();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Error loading jobs:', err);
    }
  }

  async function executeUserBulkAction() {
    if (!userInput.trim()) return;
    setLoading(true);
    try {
      await adminApi.bulkUserAction({
        action: userAction,
        user_ids: userInput.split('\n').filter(id => id.trim()),
        plan: userAction === 'change_plan' ? userPlan : undefined,
        tag: userAction === 'add_tag' ? userTag : undefined,
      });
      setUserInput('');
      setUserTag('');
      fetchJobs();
    } catch (err) {
      alert(`Erreur: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function executeTrackBulkAction() {
    if (!trackInput.trim()) return;
    setLoading(true);
    try {
      await adminApi.bulkTrackAction({
        action: trackAction,
        track_ids: trackInput.split('\n').filter(id => id.trim()),
      });
      setTrackInput('');
      fetchJobs();
    } catch (err) {
      alert(`Erreur: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function sendBulkEmails() {
    if (!recipients.trim() || !emailSubject.trim() || !emailBody.trim()) return;
    setLoading(true);
    try {
      await adminApi.bulkEmailSend({
        recipients: recipients.split('\n').filter(r => r.trim()),
        subject: emailSubject,
        body: emailBody,
      });
      setRecipients('');
      setEmailSubject('');
      setEmailBody('');
      fetchJobs();
    } catch (err) {
      alert(`Erreur: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  if (loading && jobs.length === 0) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Opérations en Masse</h1>

        {/* Tab buttons */}
        <div className="flex gap-3 mb-6">
          {(['users', 'tracks', 'emails'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                tab === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#252540]'
              }`}
            >
              {t === 'users' ? 'Utilisateurs' : t === 'tracks' ? 'Pistes' : 'Emails'}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Opérations Utilisateurs</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Action</label>
                <select
                  value={userAction}
                  onChange={e => setUserAction(e.target.value as UserAction)}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="activate">Activer</option>
                  <option value="deactivate">Désactiver</option>
                  <option value="delete">Supprimer</option>
                  <option value="change_plan">Changer le plan</option>
                  <option value="add_tag">Ajouter un tag</option>
                </select>
              </div>

              {userAction === 'change_plan' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Plan</label>
                  <select
                    value={userPlan}
                    onChange={e => setUserPlan(e.target.value)}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  >
                    <option value="free">Gratuit</option>
                    <option value="pro">Pro</option>
                    <option value="studio">Studio</option>
                  </select>
                </div>
              )}

              {userAction === 'add_tag' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Tag</label>
                  <input
                    type="text"
                    value={userTag}
                    onChange={e => setUserTag(e.target.value)}
                    placeholder="ex: vip, beta-tester"
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-sm mb-2">IDs Utilisateurs (un par ligne)</label>
                <textarea
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  rows={6}
                  placeholder="123&#10;456&#10;789"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 font-mono"
                />
              </div>

              <button
                onClick={executeUserBulkAction}
                disabled={!userInput.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 rounded"
              >
                Exécuter
              </button>
            </div>
          </div>
        )}

        {/* Tracks Tab */}
        {tab === 'tracks' && (
          <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Opérations Pistes</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Action</label>
                <select
                  value={trackAction}
                  onChange={e => setTrackAction(e.target.value as TrackAction)}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="delete">Supprimer</option>
                  <option value="retag">Reetiqueter</option>
                  <option value="reanalyze">Réanalyser</option>
                  <option value="export">Exporter</option>
                  <option value="archive">Archiver</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">IDs Pistes (un par ligne)</label>
                <textarea
                  value={trackInput}
                  onChange={e => setTrackInput(e.target.value)}
                  rows={6}
                  placeholder="track-001&#10;track-002&#10;track-003"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 font-mono"
                />
              </div>

              <button
                onClick={executeTrackBulkAction}
                disabled={!trackInput.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 rounded"
              >
                Exécuter
              </button>
            </div>
          </div>
        )}

        {/* Emails Tab */}
        {tab === 'emails' && (
          <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Envoi d'Emails en Masse</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Destinataires (un par ligne ou segment)</label>
                <textarea
                  value={recipients}
                  onChange={e => setRecipients(e.target.value)}
                  rows={4}
                  placeholder="user1@example.com&#10;user2@example.com"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Sujet</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Sujet de l'email"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Corps du Message</label>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={6}
                  placeholder="Contenu de l'email..."
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <button
                onClick={sendBulkEmails}
                disabled={!recipients.trim() || !emailSubject.trim() || !emailBody.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 rounded"
              >
                Envoyer
              </button>
            </div>
          </div>
        )}

        {/* Jobs List */}
        <div className="bg-[#1a1a2e] rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Historique des Tâches</h2>

          {jobs.length === 0 ? (
            <p className="text-gray-400">Aucune tâche.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className="bg-[#0a0a1a] rounded p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-medium">{job.type} - {job.action}</p>
                      <p className="text-gray-500 text-sm">{new Date(job.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      job.status === 'completed' ? 'bg-green-900 text-green-200' :
                      job.status === 'failed' ? 'bg-red-900 text-red-200' :
                      job.status === 'processing' ? 'bg-yellow-900 text-yellow-200' :
                      'bg-gray-900 text-gray-200'
                    }`}>
                      {job.status === 'processing' ? 'Traitement' : job.status === 'completed' ? 'Complété' : job.status === 'failed' ? 'Échoué' : 'En attente'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: `${(job.progress / job.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-gray-400 text-xs mt-2">{job.progress} / {job.total}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
