"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Trash2, Edit3, Check, X, AlertTriangle, Music, Download, RotateCcw,
  ChevronUp, ChevronDown,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, StatCard, PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Track {
  id: number;
  title: string;
  artist: string;
  genre: string | null;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  status: "pending" | "analyzing" | "completed" | "failed";
  rating: number | null;
  user_id: number;
  created_at: string;
}

interface EditingTrack {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: string;
  energy: string;
}

export default function TracksPage() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState("date");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ pending: 0, analyzing: 0, completed: 0, failed: 0 });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTrack, setEditingTrack] = useState<EditingTrack | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Load tracks
  const loadTracks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listTracks({
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        skip,
        limit,
        sort: sortBy,
      });
      setTracks(res.tracks || []);
      setTotal(res.total || 0);
      // Calculate stats
      if (res.tracks) {
        const s = { pending: 0, analyzing: 0, completed: 0, failed: 0 };
        res.tracks.forEach((t: Track) => {
          if (t.status === "pending") s.pending++;
          else if (t.status === "analyzing") s.analyzing++;
          else if (t.status === "completed") s.completed++;
          else if (t.status === "failed") s.failed++;
        });
        setStats(s);
      }
      toast("Pistes chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, skip, limit, sortBy, toast]);

  useEffect(() => {
    setSkip(0);
  }, [search, statusFilter, sortBy]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startEdit = (track: Track) => {
    setEditingId(track.id);
    setEditingTrack({
      id: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre || "",
      bpm: track.bpm ? String(track.bpm) : "",
      energy: track.energy ? String(track.energy) : "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTrack(null);
  };

  const saveEdit = async () => {
    if (!editingTrack) return;
    try {
      await adminApi.updateTrack(editingTrack.id, {
        title: editingTrack.title,
        artist: editingTrack.artist,
        genre: editingTrack.genre || null,
        bpm: editingTrack.bpm ? parseInt(editingTrack.bpm) : null,
        energy: editingTrack.energy ? parseFloat(editingTrack.energy) : null,
      });
      toast("Piste mise à jour", "success");
      await loadTracks();
      cancelEdit();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteTrack(deletingId);
      toast("Piste supprimée", "success");
      await loadTracks();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await adminApi.bulkDeleteTracks(selectedIds);
      toast(`${selectedIds.length} pistes supprimées`, "success");
      setSelectedIds([]);
      await loadTracks();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const retryOne = async (id: number) => {
    try {
      setRetrying(true);
      await adminApi.retryAnalysis(id);
      toast("Analyse relancée", "success");
      await loadTracks();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setRetrying(false);
    }
  };

  const retryAllFailed = async () => {
    try {
      setRetrying(true);
      await adminApi.retryAllFailed();
      toast("Toutes les analyses échouées ont été relancées", "success");
      await loadTracks();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setRetrying(false);
    }
  };

  const getStatusVariant = (status: string): "default" | "success" | "error" | "info" => {
    switch (status) {
      case "completed":
        return "success";
      case "analyzing":
        return "info";
      case "failed":
        return "error";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "En attente";
      case "analyzing":
        return "En cours";
      case "completed":
        return "Terminé";
      case "failed":
        return "Erreur";
      default:
        return status;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <PageGuide
        id="tracks"
        icon={Music}
        title="Gestion des pistes musicales"
        description="Visualisez toutes les pistes audio uploadées par les utilisateurs. Suivez le statut d'analyse (en attente, en cours, terminé, échoué) et gérez les métadonnées."
      />
      <SectionHeader
        title="Pistes Musicales"
        description={`Gérez les ${total} pistes de TrackCue`}
        actions={
          <div className="flex gap-2">
            <Btn
              variant="warning"
              onClick={retryAllFailed}
              disabled={stats.failed === 0 || retrying}
              loading={retrying}
              icon={RotateCcw}
              small
            >
              Relancer les échoués
            </Btn>
            <a href={adminApi.exportTracks()} target="_blank" rel="noopener noreferrer">
              <Btn variant="default" icon={Download} small>
                Exporter CSV
              </Btn>
            </a>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Music} label="Total" value={total} color="#6366f1" />
        <StatCard icon={AlertTriangle} label="En attente" value={stats.pending} color="#eab308" />
        <StatCard icon={RotateCcw} label="En cours" value={stats.analyzing} color="#3b82f6" />
        <StatCard
          icon={Check}
          label="Terminées"
          value={stats.completed}
          color="#10b981"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Rechercher par titre ou artiste..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <Select
            label="Statut"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Tous les statuts" },
              { value: "pending", label: "En attente" },
              { value: "analyzing", label: "En cours" },
              { value: "completed", label: "Terminé" },
              { value: "failed", label: "Erreur" },
            ]}
          />
          <Select
            label="Tri"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "date", label: "Date (récent)" },
              { value: "title", label: "Titre" },
              { value: "artist", label: "Artiste" },
              { value: "bpm", label: "BPM" },
            ]}
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadTracks();
              }}
              small
              icon={Search}
            >
              Rechercher
            </Btn>
          </div>
        </div>
      </Card>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <Card className="p-4 mb-6 bg-accent/5 border-accent/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.length} piste(s) sélectionnée(s)
            </span>
            <div className="flex gap-2">
              <Btn
                variant="danger"
                onClick={bulkDelete}
                small
                icon={Trash2}
              >
                Supprimer
              </Btn>
              <Btn
                variant="default"
                onClick={() => setSelectedIds([])}
                small
              >
                Annuler
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={Music}
          title="Aucune piste trouvée"
          description={search || statusFilter !== "all" ? "Modifiez les filtres" : "Aucune piste"}
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {tracks.map((track) => (
            <Card key={track.id} className="p-4">
              {editingId === track.id && editingTrack ? (
                <div className="space-y-3">
                  <Input
                    label="Titre"
                    value={editingTrack.title}
                    onChange={(v) =>
                      setEditingTrack({ ...editingTrack, title: v })
                    }
                  />
                  <Input
                    label="Artiste"
                    value={editingTrack.artist}
                    onChange={(v) =>
                      setEditingTrack({ ...editingTrack, artist: v })
                    }
                  />
                  <Input
                    label="Genre"
                    value={editingTrack.genre}
                    onChange={(v) =>
                      setEditingTrack({ ...editingTrack, genre: v })
                    }
                  />
                  <Input
                    label="BPM"
                    type="number"
                    value={editingTrack.bpm}
                    onChange={(v) =>
                      setEditingTrack({ ...editingTrack, bpm: v })
                    }
                  />
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
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary">{track.title}</h3>
                      <p className="text-xs text-text-muted">{track.artist}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(track.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, track.id]);
                        } else {
                          setSelectedIds(selectedIds.filter((id) => id !== track.id));
                        }
                      }}
                      className="ml-2"
                    />
                  </div>

                  <div className="space-y-2 text-xs mb-3">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Statut:</span>
                      <Badge variant={getStatusVariant(track.status)}>
                        {getStatusLabel(track.status)}
                      </Badge>
                    </div>
                    {track.genre && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Genre:</span>
                        <span className="text-text-secondary">{track.genre}</span>
                      </div>
                    )}
                    {track.bpm && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">BPM:</span>
                        <span className="text-text-secondary">{track.bpm}</span>
                      </div>
                    )}
                    {track.key && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Clé:</span>
                        <span className="text-text-secondary">{track.key}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Btn
                      variant="default"
                      onClick={() => startEdit(track)}
                      small
                      icon={Edit3}
                      className="flex-1"
                    >
                      Éditer
                    </Btn>
                    {track.status === "failed" && (
                      <Btn
                        variant="warning"
                        onClick={() => retryOne(track.id)}
                        small
                        icon={RotateCcw}
                        className="flex-1"
                        disabled={retrying}
                      >
                        Relancer
                      </Btn>
                    )}
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(track.id)}
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
        // Desktop table
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase w-6">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === tracks.length && tracks.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(tracks.map((t) => t.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Titre / Artiste
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Genre
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  BPM
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Clé
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Énergie
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  {editingId === track.id && editingTrack ? (
                    <>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <Input
                          value={editingTrack.title}
                          onChange={(v) =>
                            setEditingTrack({ ...editingTrack, title: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={editingTrack.genre}
                          onChange={(v) =>
                            setEditingTrack({ ...editingTrack, genre: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          value={editingTrack.bpm}
                          onChange={(v) =>
                            setEditingTrack({ ...editingTrack, bpm: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
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
                    <>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(track.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, track.id]);
                            } else {
                              setSelectedIds(selectedIds.filter((id) => id !== track.id));
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-medium text-text-primary">
                            {track.title}
                          </p>
                          <p className="text-[10px] text-text-muted">
                            {track.artist}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-secondary">
                          {track.genre || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs text-text-secondary">
                          {track.bpm || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs text-text-secondary font-mono">
                          {track.key || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getStatusVariant(track.status)}>
                          {getStatusLabel(track.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs text-text-secondary">
                          {track.energy ? track.energy.toFixed(1) : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-muted">
                          {formatDate(track.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={() => startEdit(track)}
                            small
                            icon={Edit3}
                          />
                          {track.status === "failed" && (
                            <Btn
                              variant="warning"
                              onClick={() => retryOne(track.id)}
                              small
                              icon={RotateCcw}
                              disabled={retrying}
                            />
                          )}
                          <Btn
                            variant="danger"
                            onClick={() => setDeletingId(track.id)}
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
        title="Supprimer la piste"
        message="Êtes-vous sûr de vouloir supprimer cette piste ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
