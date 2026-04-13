"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Plus, Trash2, Edit3, Check, X, AlertTriangle,
  Loader, Mail, User, Calendar, LogIn, Shield,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, Toggle, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface User {
  id: number;
  name: string;
  email: string;
  subscription_plan: "free" | "pro" | "unlimited";
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  avatar_url: string | null;
  tracks_today: number;
  organization_id: number | null;
}

interface EditingUser {
  id: number;
  name: string;
  email: string;
  subscription_plan: "free" | "pro" | "unlimited";
  is_admin: boolean;
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // ─── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listUsers({
        search: search || undefined,
        plan: planFilter === "all" ? undefined : planFilter,
        skip,
        limit,
      });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      toast("Utilisateurs chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, skip, limit, toast]);

  // ─── Auto-load on mount & filter change ───────────────────────────────────────
  useEffect(() => {
    setSkip(0); // reset pagination when filter/search changes
  }, [search, planFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ─── Responsive ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Edit user ────────────────────────────────────────────────────────────────
  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditingUser({
      id: user.id,
      name: user.name,
      email: user.email,
      subscription_plan: user.subscription_plan,
      is_admin: user.is_admin,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingUser(null);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    try {
      await adminApi.updateUser(editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        subscription_plan: editingUser.subscription_plan,
        is_admin: editingUser.is_admin,
      });
      toast("Utilisateur mis à jour", "success");
      await loadUsers();
      cancelEdit();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // ─── Delete user ──────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteUser(deletingId);
      toast("Utilisateur supprimé", "success");
      await loadUsers();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const getPlanBadgeVariant = (plan: string): "default" | "purple" | "pink" => {
    switch (plan) {
      case "pro":
        return "purple";
      case "unlimited":
        return "pink";
      default:
        return "default";
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatLastLogin = (date: string | null) => {
    if (!date) return "Jamais";
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ─── Paginate ─────────────────────────────────────────────────────────────────
  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <PageWrapper>
      <PageGuide
        id="users"
        icon={User}
        title="Gestion des utilisateurs"
        description="Consultez et gérez tous les comptes utilisateurs de CueForge. Vous pouvez modifier les plans d'abonnement, promouvoir en admin, et suivre l'activité de chaque utilisateur."
        steps={[
          { text: "Recherchez un utilisateur par nom ou email" },
          { text: "Filtrez par plan d'abonnement (Free, Pro, Unlimited)" },
          { text: "Cliquez sur l'icône crayon pour modifier un utilisateur" },
        ]}
      />
      <SectionHeader
        title="Utilisateurs"
        description={`Gérez les ${total} utilisateurs de CueForge`}
      />

      {/* Filters & Search */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <Select
            label="Plan d'abonnement"
            value={planFilter}
            onChange={setPlanFilter}
            options={[
              { value: "all", label: "Tous les plans" },
              { value: "free", label: "Free" },
              { value: "pro", label: "Pro" },
              { value: "unlimited", label: "Unlimited" },
            ]}
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadUsers();
              }}
              small
              icon={Search}
            >
              Rechercher
            </Btn>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-3">
          <div className="text-[11px] font-semibold text-text-muted uppercase">Total</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{total}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold text-text-muted uppercase">Vérifiés</div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {users.filter((u) => u.email_verified).length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold text-text-muted uppercase">Admins</div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {users.filter((u) => u.is_admin).length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold text-text-muted uppercase">Pro+</div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {users.filter((u) => u.subscription_plan !== "free").length}
          </div>
        </Card>
      </div>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur trouvé"
          description={search || planFilter !== "all" ? "Modifiez les filtres" : "Aucun utilisateur"}
        />
      ) : isMobile ? (
        // ─── MOBILE CARDS ─────────────────────────────────────────────────────────────
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id} className="p-4">
              {editingId === user.id && editingUser ? (
                // Edit mode
                <div className="space-y-3">
                  <Input
                    label="Nom"
                    value={editingUser.name}
                    onChange={(v) =>
                      setEditingUser({ ...editingUser, name: v })
                    }
                  />
                  <Input
                    label="Email"
                    value={editingUser.email}
                    onChange={(v) =>
                      setEditingUser({ ...editingUser, email: v })
                    }
                  />
                  <Select
                    label="Plan"
                    value={editingUser.subscription_plan}
                    onChange={(v) =>
                      setEditingUser({
                        ...editingUser,
                        subscription_plan: v as any,
                      })
                    }
                    options={[
                      { value: "free", label: "Free" },
                      { value: "pro", label: "Pro" },
                      { value: "unlimited", label: "Unlimited" },
                    ]}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-secondary">
                      Admin
                    </span>
                    <Toggle
                      on={editingUser.is_admin}
                      onToggle={() =>
                        setEditingUser({
                          ...editingUser,
                          is_admin: !editingUser.is_admin,
                        })
                      }
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Btn
                      variant="default"
                      onClick={cancelEdit}
                      small
                      icon={X}
                      className="flex-1"
                    >
                      Annuler
                    </Btn>
                    <Btn
                      variant="primary"
                      onClick={saveEdit}
                      small
                      icon={Check}
                      className="flex-1"
                    >
                      Sauver
                    </Btn>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-text-primary">{user.name}</h3>
                      <p className="text-xs text-text-muted">{user.email}</p>
                    </div>
                    {user.is_admin && (
                      <Shield size={14} className="text-amber-400" />
                    )}
                  </div>

                  <div className="space-y-2 text-xs mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Plan:</span>
                      <Badge variant={getPlanBadgeVariant(user.subscription_plan)}>
                        {user.subscription_plan.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Vérifié:</span>
                      <span className="text-text-secondary">
                        {user.email_verified ? "✓" : "✗"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Créé:</span>
                      <span className="text-text-secondary">
                        {formatDate(user.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Dernier login:</span>
                      <span className="text-text-secondary">
                        {formatLastLogin(user.last_login_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Btn
                      variant="default"
                      onClick={() => startEdit(user)}
                      small
                      icon={Edit3}
                      className="flex-1"
                    >
                      Éditer
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(user.id)}
                      small
                      icon={Trash2}
                      className="flex-1"
                    >
                      Supprimer
                    </Btn>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      ) : (
        // ─── DESKTOP TABLE ────────────────────────────────────────────────────────────
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Avatar / Nom
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Admin
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Vérifié
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Inscription
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  {editingId === user.id && editingUser ? (
                    // Edit inline row
                    <>
                      <td className="px-4 py-3">
                        <Input
                          value={editingUser.name}
                          onChange={(v) =>
                            setEditingUser({ ...editingUser, name: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={editingUser.email}
                          onChange={(v) =>
                            setEditingUser({ ...editingUser, email: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={editingUser.subscription_plan}
                          onChange={(v) =>
                            setEditingUser({
                              ...editingUser,
                              subscription_plan: v as any,
                            })
                          }
                          options={[
                            { value: "free", label: "Free" },
                            { value: "pro", label: "Pro" },
                            { value: "unlimited", label: "Unlimited" },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Toggle
                          on={editingUser.is_admin}
                          onToggle={() =>
                            setEditingUser({
                              ...editingUser,
                              is_admin: !editingUser.is_admin,
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={cancelEdit}
                            small
                            icon={X}
                          />
                          <Btn
                            variant="primary"
                            onClick={saveEdit}
                            small
                            icon={Check}
                          />
                        </div>
                      </td>
                    </>
                  ) : (
                    // View row
                    <>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.name}
                              className="w-8 h-8 rounded-full bg-bg-elevated"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center">
                              <User size={14} className="text-text-muted" />
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-xs font-medium text-text-primary">
                              {user.name}
                            </p>
                            <p className="text-[10px] text-text-muted">
                              {user.tracks_today} tracks aujourd'hui
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-secondary">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getPlanBadgeVariant(user.subscription_plan)}>
                          {user.subscription_plan.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.is_admin && (
                          <Shield
                            size={14}
                            className="text-amber-400 mx-auto"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium text-text-secondary">
                          {user.email_verified ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-muted">
                          {formatDate(user.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={() => startEdit(user)}
                            small
                            icon={Edit3}
                          />
                          <Btn
                            variant="danger"
                            onClick={() => setDeletingId(user.id)}
                            small
                            icon={Trash2}
                          />
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-text-muted">
            Page {currentPage} sur {pages}
          </div>
          <div className="flex gap-2">
            <Btn
              variant="default"
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              small
            >
              Précédent
            </Btn>
            <Btn
              variant="default"
              onClick={() => setSkip(skip + limit)}
              disabled={currentPage >= pages}
              small
            >
              Suivant
            </Btn>
          </div>
        </div>
      )}

      {/* Delete modal */}
      <ConfirmModal
        open={deletingId !== null}
        title="Supprimer l'utilisateur"
        message={`Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.`}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
