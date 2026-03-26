'use client';

import React, { useEffect, useState } from 'react';
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
} from '@/lib/api';
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  unlimited: 'Unlimited',
};

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  pro: 'bg-blue-100 text-blue-700',
  unlimited: 'bg-purple-100 text-purple-700',
};

// ─── Create/Edit Modal ────────────────────────────────────────────────────────

interface UserModalProps {
  user: AdminUser | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ user, onClose, onSaved }: UserModalProps) {
  const isEdit = user !== null;
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro' | 'unlimited'>(
    (user?.subscription_plan as 'free' | 'pro' | 'unlimited') ?? 'free'
  );
  const [isAdmin, setIsAdmin] = useState(user?.is_admin ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        const payload: UpdateUserPayload = {};
        if (email !== user.email) payload.email = email;
        if (name !== (user.name ?? '')) payload.name = name;
        if (password) payload.password = password;
        if (plan !== user.subscription_plan) payload.subscription_plan = plan;
        if (isAdmin !== user.is_admin) payload.is_admin = isAdmin;
        await adminUpdateUser(user.id, payload);
      } else {
        if (!password) { setError('Password is required'); setLoading(false); return; }
        const payload: CreateUserPayload = { email, password, name: name || undefined, subscription_plan: plan, is_admin: isAdmin };
        await adminCreateUser(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Account' : 'Create Account'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="user@example.com"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name / Username</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="John Doe"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {isEdit && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!isEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder={isEdit ? '••••••••' : 'New password'}
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
            <select
              value={plan}
              onChange={e => setPlan(e.target.value as 'free' | 'pro' | 'unlimited')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>

          {/* Admin toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsAdmin(!isAdmin)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdmin ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">Admin account</span>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (<><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving...</>) : isEdit ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
interface DeleteModalProps { user: AdminUser; onClose: () => void; onDeleted: () => void; }
function DeleteModal({ user, onClose, onDeleted }: DeleteModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleDelete = async () => {
    setLoading(true); setError('');
    try { await adminDeleteUser(user.id); onDeleted(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Account</h2>
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete <strong>{user.email}</strong>? This action cannot be undone.</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400">{loading ? 'Deleting...' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [createModal, setCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const loadUsers = async () => {
    setLoading(true); setError('');
    try { const data = await adminListUsers(); setUsers(data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load users'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPlan = filterPlan === 'all' || u.subscription_plan === filterPlan;
    const matchRole = filterRole === 'all' || (filterRole === 'admin' && u.is_admin) || (filterRole === 'user' && !u.is_admin);
    return matchSearch && matchPlan && matchRole;
  });
  const stats = { total: users.length, admins: users.filter(u => u.is_admin).length, pro: users.filter(u => u.subscription_plan === 'pro').length, unlimited: users.filter(u => u.subscription_plan === 'unlimited').length };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Admin Panel</h1><p className="text-sm text-gray-500">Manage all CueForge accounts</p></div>
        <button onClick={() => setCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Account
        </button>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[{label:'Total Users',value:stats.total,color:'text-gray-900'},{label:'Admins',value:stats.admins,color:'text-blue-600'},{label:'Pro',value:stats.pro,color:'text-indigo-600'},{label:'Unlimited',value:stats.unlimited,color:'text-purple-600'}].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4"><p className="text-sm text-gray-500">{s.label}</p><p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p></div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="all">All Plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="unlimited">Unlimited</option></select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm"><option value="all">All Roles</option><option value="admin">Admins only</option><option value="user">Users only</option></select>
          <button onClick={loadUsers} className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">Refresh</button>
        </div>
        {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No accounts found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>{['ID','Name / Email','Plan','Role','Tracks today','Created','Actions'].map(h => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-500">#{u.id}</td>
                      <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{u.name || '—'}</p><p className="text-xs text-gray-500">{u.email}</p></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[u.subscription_plan]}`}>{PLAN_LABELS[u.subscription_plan]}</span></td>
                      <td className="px-4 py-3">{u.is_admin ? (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Admin</span>) : (<span className="text-xs text-gray-500">User</span>)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{u.tracks_today}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditUser(u)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteUser(u)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-4 text-right">{filtered.length} of {users.length} accounts shown</p>
      </div>
      {createModal && <UserModal user={null} onClose={() => setCreateModal(false)} onSaved={loadUsers} />}
      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSaved={loadUsers} />}
      {deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onDeleted={loadUsers} />}
    </div>
  );
}
