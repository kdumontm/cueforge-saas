"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMyProfile, updateMyProfile, UserProfile } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("cueforge_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await getMyProfile();
      setProfile(data);
      setName(data.name || "");
      setEmail(data.email);
    } catch (err: any) {
      setMessage({ type: "error", text: "Impossible de charger le profil" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    try {
      const updateData: any = {};
      if (name !== (profile?.name || "")) updateData.name = name;
      if (email !== profile?.email) updateData.email = email;

      if (Object.keys(updateData).length === 0) {
        setMessage({ type: "info", text: "Aucune modification" });
        setSaving(false);
        return;
      }

      const updated = await updateMyProfile(updateData);
      setProfile(updated);
      setMessage({ type: "success", text: "Profil mis à jour !" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erreur lors de la mise à jour" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Les mots de passe ne correspondent pas" });
      setSaving(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Le mot de passe doit contenir au moins 6 caractères" });
      setSaving(false);
      return;
    }

    try {
      await updateMyProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ type: "success", text: "Mot de passe modifié !" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erreur lors du changement de mot de passe" });
    } finally {
      setSaving(false);
    }
  }

  const planLabels: Record<string, string> = {
    free: "Free — 5 morceaux/jour",
    pro: "Pro — 20 morceaux/jour",
    unlimited: "App Desktop — Illimité",
  };

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
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")} className="text-gray-400 hover:text-white">
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold">Paramètres</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {message.text && (
          <div
            className={`px-4 py-3 rounded-lg border ${
              message.type === "success"
                ? "bg-green-500/20 border-green-500/50 text-green-300"
                : message.type === "error"
                ? "bg-red-500/20 border-red-500/50 text-red-300"
                : "bg-blue-500/20 border-blue-500/50 text-blue-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Subscription Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Abonnement</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">
                {planLabels[profile?.subscription_plan || "free"] || profile?.subscription_plan}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Pour changer d'abonnement, consultez la page tarification.
              </p>
            </div>
            <button
              onClick={() => router.push("/pricing")}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Voir les plans
            </button>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Informations personnelles</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>

        {/* Password Form */}
        <form onSubmit={handleChangePassword} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Changer le mot de passe</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe actuel</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium"
          >
            {saving ? "Modification..." : "Changer le mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
