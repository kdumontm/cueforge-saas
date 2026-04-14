'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

interface Permission {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  color: string;
  user_count: number;
  permission_count: number;
  permissions: string[];
  created_at: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    color: '#8b5cf6',
    permissions: [] as string[],
  });

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getRoles();
      setRoles(data);
    } catch (error) {
      console.error('Erreur chargement rôles:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const data = await adminApi.getPermissions();
      setPermissions(data);
    } catch (error) {
      console.error('Erreur chargement permissions:', error);
    }
  };

  const openCreateModal = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      display_name: '',
      description: '',
      color: '#8b5cf6',
      permissions: [],
    });
    setShowModal(true);
  };

  const openEditModal = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      display_name: role.display_name,
      description: role.description,
      color: role.color,
      permissions: role.permissions,
    });
    setShowModal(true);
  };

  const handleSaveRole = async () => {
    if (!formData.name || !formData.display_name) return;

    try {
      if (editingRole) {
        await adminApi.updateRole(editingRole.id, {
          name: formData.name,
          display_name: formData.display_name,
          description: formData.description,
          color: formData.color,
          permissions: formData.permissions,
        });
      } else {
        await adminApi.createRole({
          name: formData.name,
          display_name: formData.display_name,
          description: formData.description,
          color: formData.color,
          permissions: formData.permissions,
        });
      }

      setShowModal(false);
      setEditingRole(null);
      loadRoles();
    } catch (error) {
      console.error('Erreur sauvegarde rôle:', error);
    }
  };

  const handleDeleteRole = async (id: number) => {
    if (!confirm('Êtes-vous sûr? Cette action est irréversible.')) return;

    try {
      await adminApi.deleteRole(id);
      loadRoles();
    } catch (error) {
      console.error('Erreur suppression rôle:', error);
    }
  };

  const togglePermission = (permissionId: string) => {
    setFormData({
      ...formData,
      permissions: formData.permissions.includes(permissionId)
        ? formData.permissions.filter((p) => p !== permissionId)
        : [...formData.permissions, permissionId],
    });
  };

  const groupedPermissions = permissions.reduce(
    (acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>
  );

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Rôles (RBAC)</h1>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
          >
            Créer un rôle
          </button>
        </div>

        {/* Roles Grid */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : roles.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucun rôle pour le moment</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="bg-[#0a0a1a] rounded-lg p-6 border border-gray-700 hover:border-purple-600 transition"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: role.color }}
                  />
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">{role.display_name}</h3>
                    <p className="text-gray-400 text-xs">{role.name}</p>
                  </div>
                </div>

                <p className="text-gray-400 text-sm mb-4">{role.description}</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <span className="text-gray-400 text-xs">Utilisateurs</span>
                    <p className="text-xl font-bold">{role.user_count}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Permissions</span>
                    <p className="text-xl font-bold">{role.permission_count}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(role)}
                    className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDeleteRole(role.id)}
                    className="flex-1 px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-xs font-medium transition"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#0a0a1a] rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto border border-purple-600">
              <h2 className="text-xl font-bold mb-4">
                {editingRole ? 'Modifier le rôle' : 'Créer un rôle'}
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nom (identifiant)</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                      placeholder="Ex: admin"
                      disabled={!!editingRole}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Nom d'affichage</label>
                    <input
                      type="text"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({ ...formData, display_name: e.target.value })
                      }
                      className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                      placeholder="Ex: Administrateur"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 resize-none"
                    rows={2}
                    placeholder="Description du rôle..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Couleur</label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData({ ...formData, color: e.target.value })
                      }
                      className="w-12 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData({ ...formData, color: e.target.value })
                      }
                      className="flex-1 bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 text-sm"
                      placeholder="#8b5cf6"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Permissions</label>
                  <div className="space-y-4">
                    {Object.entries(groupedPermissions).map(([category, perms]) => (
                      <div key={category}>
                        <h4 className="text-sm font-semibold text-purple-400 mb-2">{category}</h4>
                        <div className="space-y-2 pl-2">
                          {perms.map((perm) => (
                            <label
                              key={perm.id}
                              className="flex items-start gap-3 cursor-pointer hover:bg-gray-800/30 p-2 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                                className="w-4 h-4 mt-0.5"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium">{perm.name}</div>
                                <div className="text-xs text-gray-400">{perm.description}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 rounded-lg font-medium hover:border-gray-500 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveRole}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
                >
                  {editingRole ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
