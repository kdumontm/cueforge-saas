'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

type NotifStatus = 'draft' | 'sent' | 'scheduled';
type NotifType = 'info' | 'warning' | 'success' | 'alert';
type TargetType = 'all' | 'segment' | 'user';

interface InAppNotification {
  id: number;
  title: string;
  body: string;
  type: NotifType;
  status: NotifStatus;
  target_type: TargetType;
  target_value?: string;
  created_at: string;
  sent_at?: string;
  scheduled_for?: string;
}

interface NotificationStats {
  total_sent: number;
  read_rate: number;
  click_rate: number;
}

interface AdminNotifFeed {
  id: string;
  title: string;
  sent_at: string;
  read_count: number;
  click_count: number;
}

export default function InAppNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [adminFeed, setAdminFeed] = useState<AdminNotifFeed[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotif, setNewNotif] = useState({
    title: '',
    body: '',
    type: 'info' as NotifType,
    target_type: 'all' as TargetType,
    target_value: '',
    scheduled_for: '',
  });

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const [notifsData, statsData, feedData] = await Promise.all([
        adminApi.getInAppNotifications(),
        adminApi.getInAppNotifStats(),
        adminApi.getAdminNotifFeed(),
      ]);

      setNotifications(notifsData.notifications || []);
      setStats(statsData);
      setAdminFeed(feedData.feed || []);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createNotification() {
    if (!newNotif.title.trim() || !newNotif.body.trim()) {
      alert('Titre et corps sont requis');
      return;
    }

    try {
      await adminApi.createInAppNotification(newNotif);
      setShowCreateModal(false);
      setNewNotif({
        title: '',
        body: '',
        type: 'info',
        target_type: 'all',
        target_value: '',
        scheduled_for: '',
      });
      fetchNotifications();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function sendNotification(id: number) {
    try {
      await adminApi.sendInAppNotification(id);
      fetchNotifications();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function deleteNotification(id: number) {
    try {
      await adminApi.deleteInAppNotification(id);
      fetchNotifications();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Notifications In-App</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded"
          >
            + Nouvelle Notification
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Total Envoyées</p>
              <p className="text-3xl font-bold text-white">{stats.total_sent}</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Taux de Lecture</p>
              <p className="text-3xl font-bold text-purple-400">{(stats.read_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Taux de Clic</p>
              <p className="text-3xl font-bold text-blue-400">{(stats.click_rate * 100).toFixed(1)}%</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Notifications List */}
          <div className="lg:col-span-2">
            <div className="bg-[#1a1a2e] rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Notifications</h2>

              {notifications.length === 0 ? (
                <p className="text-gray-400">Aucune notification.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map(notif => (
                    <div
                      key={notif.id}
                      className="bg-[#0a0a1a] rounded p-4 hover:bg-[#252540] transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              notif.type === 'alert' ? 'bg-red-900 text-red-200' :
                              notif.type === 'warning' ? 'bg-yellow-900 text-yellow-200' :
                              notif.type === 'success' ? 'bg-green-900 text-green-200' :
                              'bg-blue-900 text-blue-200'
                            }`}>
                              {notif.type.toUpperCase()}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              notif.status === 'draft' ? 'bg-gray-900 text-gray-200' :
                              notif.status === 'sent' ? 'bg-green-900 text-green-200' :
                              'bg-purple-900 text-purple-200'
                            }`}>
                              {notif.status === 'draft' ? 'Brouillon' : notif.status === 'sent' ? 'Envoyée' : 'Programmée'}
                            </span>
                          </div>
                          <p className="text-white font-bold">{notif.title}</p>
                          <p className="text-gray-400 text-sm mt-1">{notif.body}</p>
                          <p className="text-gray-500 text-xs mt-2">
                            À: {notif.target_type === 'all' ? 'Tous' : notif.target_type === 'segment' ? `Segment: ${notif.target_value}` : `Utilisateur: ${notif.target_value}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {notif.status === 'draft' && (
                            <button
                              onClick={() => sendNotification(notif.id)}
                              className="text-purple-400 hover:text-purple-300 text-sm"
                            >
                              Envoyer
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notif.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>

                      {notif.sent_at && (
                        <p className="text-gray-600 text-xs">
                          Envoyée: {new Date(notif.sent_at).toLocaleString('fr-FR')}
                        </p>
                      )}

                      {notif.scheduled_for && (
                        <p className="text-gray-600 text-xs">
                          Programmée pour: {new Date(notif.scheduled_for).toLocaleString('fr-FR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Admin Feed Sidebar */}
          <div className="bg-[#1a1a2e] rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Flux Récent</h2>

            {adminFeed.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucune notification récente.</p>
            ) : (
              <div className="space-y-3">
                {adminFeed.map(item => (
                  <div key={item.id} className="bg-[#0a0a1a] rounded p-3">
                    <p className="text-white text-sm font-medium truncate">{item.title}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      {new Date(item.sent_at).toLocaleString('fr-FR')}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-gray-400">👁️ {item.read_count}</span>
                      <span className="text-gray-400">🔗 {item.click_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#1a1a2e] border-b border-gray-700 p-6">
              <h3 className="text-xl font-bold text-white">Nouvelle Notification</h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Titre</label>
                <input
                  type="text"
                  value={newNotif.title}
                  onChange={e => setNewNotif({ ...newNotif, title: e.target.value })}
                  placeholder="Titre de la notification"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Corps du Message</label>
                <textarea
                  value={newNotif.body}
                  onChange={e => setNewNotif({ ...newNotif, body: e.target.value })}
                  rows={4}
                  placeholder="Contenu de la notification"
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Type</label>
                <select
                  value={newNotif.type}
                  onChange={e => setNewNotif({ ...newNotif, type: e.target.value as NotifType })}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="info">Info</option>
                  <option value="warning">Avertissement</option>
                  <option value="success">Succès</option>
                  <option value="alert">Alerte</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Destinataires</label>
                <select
                  value={newNotif.target_type}
                  onChange={e => setNewNotif({ ...newNotif, target_type: e.target.value as TargetType, target_value: '' })}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="all">Tous les Utilisateurs</option>
                  <option value="segment">Segment</option>
                  <option value="user">Utilisateur Spécifique</option>
                </select>
              </div>

              {(newNotif.target_type === 'segment' || newNotif.target_type === 'user') && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    {newNotif.target_type === 'segment' ? 'Nom du Segment' : 'ID Utilisateur'}
                  </label>
                  <input
                    type="text"
                    value={newNotif.target_value}
                    onChange={e => setNewNotif({ ...newNotif, target_value: e.target.value })}
                    placeholder={newNotif.target_type === 'segment' ? 'ex: pro_users' : 'ex: user_123'}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-sm mb-2">Programmer Pour (optionnel)</label>
                <input
                  type="datetime-local"
                  value={newNotif.scheduled_for}
                  onChange={e => setNewNotif({ ...newNotif, scheduled_for: e.target.value })}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded"
                >
                  Annuler
                </button>
                <button
                  onClick={createNotification}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded"
                >
                  {newNotif.scheduled_for ? 'Programmer' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
