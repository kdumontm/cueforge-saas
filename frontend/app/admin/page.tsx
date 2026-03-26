// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAdminPages,
  togglePage,
  PageConfig,
} from "@/lib/api";

interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  subscription_plan: string;
  is_admin: boolean;
  tracks_today: number;
  created_at: string;
}

type Tab = "users" | "pages";

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pages, setPages] = useState<PageConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // User creation form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
    subscription_plan: "free",
    is_admin: false,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersData, pagesData] = await Promise.all([
        getAdminUsers(),
        getAdminPages(),
      ]);
      setUsers(usersData);
      setPages(pagesData);
    } catch (err: any) {
      setError(err.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePage(pageName: string, currentEnabled: boolean) {
    try {
      const updated = await togglePage(pageName, !currentEnabled);
      setPages((prev) =>
        prev.map((p) => (p.page_name === pageName ? updated : p))
      );
    } catch (err: any) {
      setError(err.message || "Failed to toggle page");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await createAdminUser(newUser);
      setUsers((prev) => [...prev, created]);
      setShowCreateUser(false);
      setNewUser({ email: "", name: "", password: "", subscription_plan: "free", is_admin: false });
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteAdminUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    }
  }

  async function handleToggleAdmin(user: AdminUser) {
    try {
      const updated = await updateAdminUser(user.id, { is_admin: !user.is_admin });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    }
  }

  async function handleChangePlan(userId: number, plan: string) {
    try {
      const updated = await updateAdminUser(userId, { subscription_plan: plan });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err: any) {
      setError(err.message || "Failed to update plan");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="text-gray-400 hover:text-white">
              ← Dashboard
            </button>
            <h1 className="text-xl font-bold">Administration</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "bg-purple-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Utilisateurs ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("pages")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "pages"
                ? "bg-purple-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Pages ({pages.length})
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2 rounded-lg">
            {error}
            <button onClick={() => setError("")} className="ml-2 underline">×</button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "pages" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Gestion des pages</h2>
              <p className="text-sm text-gray-400">Activez ou désactivez les pages du site</p>
            </div>
            <div className="grid gap-3">
              {pages.map((page) => (
                <div
                  key={page.page_name}
                  className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-6 py-4"
                >
                  <div>
                    <h3 className="font-medium">{page.label || page.page_name}</h3>
                    <p className="text-sm text-gray-400">/{page.page_name}</p>
                  </div>
                  <button
                    onClick={() => handleTogglePage(page.page_name, page.is_enabled)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      page.is_enabled ? "bg-green-500" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        page.is_enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Utilisateurs</h2>
              <button
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                + Nouvel utilisateur
              </button>
            </div>

            {showCreateUser && (
              <form onSubmit={handleCreateUser} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Nom</label>
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Plan</label>
                    <select
                      value={newUser.subscription_plan}
                      onChange={(e) => setNewUser({ ...newUser, subscription_plan: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newUser.is_admin}
                    onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-sm text-gray-400">Admin</label>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                    Créer
                  </button>
                  <button type="button" onClick={() => setShowCreateUser(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
                    Annuler
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
                    <th className="pb-3 pr-4">ID</th>
                    <th className="pb-3 pr-4">Nom</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Plan</th>
                    <th className="pb-3 pr-4">Admin</th>
                    <th className="pb-3 pr-4">Tracks/jour</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-3 pr-4 text-sm text-gray-400">{user.id}</td>
                      <td className="py-3 pr-4 text-sm">{user.name || "—"}</td>
                      <td className="py-3 pr-4 text-sm text-gray-300">{user.email}</td>
                      <td className="py-3 pr-4">
                        <select
                          value={user.subscription_plan}
                          onChange={(e) => handleChangePlan(user.id, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="unlimited">Unlimited</option>
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => handleToggleAdmin(user)}
                          className={`px-2 py-1 rounded text-xs ${
                            user.is_admin
                              ? "bg-purple-600/30 text-purple-300"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {user.is_admin ? "Admin" : "User"}
                        </button>
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-400">{user.tracks_today}</td>
                      <td className="py-3">
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
