"use client";
import { useState, useEffect, useCallback } from "react";
import { Crosshair, Trash2, Edit3, Check, X } from "lucide-react";
import {
  Input, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface CuePoint {
  id: number;
  track_id: number;
  track_title?: string;
  track_artist?: string;
  user_id: number;
  user_email?: string;
  type: string;
  position: number;
  label?: string;
  color?: string;
  created_at: string;
}

interface EditingCuePoint {
  id: number;
  type: string;
  position: string;
  label: string;
  color: string;
}

export default function CuePointsPage() {
  const { toast } = useToast();
  const [cuePoints, setCuePoints] = useState<CuePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackSearch, setTrackSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCuePoint, setEditingCuePoint] = useState<EditingCuePoint | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCuePoints = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listCuePoints({
        skip,
        limit,
      });
      setCuePoints(res.cuepoints || []);
      setTotal(res.total || 0);
      toast("Points de repère chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, toast]);

  useEffect(() => {
    loadCuePoints();
  }, [loadCuePoints]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startEdit = (cp: CuePoint) => {
    setEditingId(cp.id);
    setEditingCuePoint({
      id: cp.id,
      type: cp.type,
      position: String(cp.position),
      label: cp.label || "",
      color: cp.color || "#6366f1",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingCuePoint(null);
  };

  const saveEdit = async () => {
    if (!editingCuePoint) return;
    try {
      await adminApi.updateCuePoint(editingCuePoint.id, {
        type: editingCuePoint.type,
        position: parseFloat(editingCuePoint.position),
        label: editingCuePoint.label || null,
        color: editingCuePoint.color || null,
      });
      toast("Point de repère mis à jour", "success");
      await loadCuePoints();
      cancelEdit();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteCuePoint(deletingId);
      toast("Point de repère supprimé", "success");
      await loadCuePoints();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const formatPosition = (pos: number) => {
    const mins = Math.floor(pos / 60);
    const secs = (pos % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, "0")}`;
  };

  const filteredCuePoints = trackSearch
    ? cuePoints.filter(
        (cp) =>
          cp.track_title?.toLowerCase().includes(trackSearch.toLowerCase()) ||
          cp.track_artist?.toLowerCase().includes(trackSearch.toLowerCase())
      )
    : cuePoints;

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <PageGuide
        id="cuepoints"
        icon={Crosshair}
        title="Gestion des points de repère"
        description="Consultez et gérez tous les cue points posés par les utilisateurs sur leurs pistes. Les cue points marquent des positions clés dans l'audio (drop, break, intro…)."
      />
      <SectionHeader
        title="Points de Repère"
        description={`Gérez les ${total} points de repère`}
      />

      {/* Filters */}
      <Card className="p-4 mb-6">
        <Input
          placeholder="Rechercher par titre ou artiste..."
          value={trackSearch}
          onChange={setTrackSearch}
          label="Recherche"
        />
      </Card>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : filteredCuePoints.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="Aucun point de repère"
          description="Aucun point de repère ne correspond à votre recherche"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {filteredCuePoints.map((cp) => (
            <Card key={cp.id} className="p-4">
              {editingId === cp.id && editingCuePoint ? (
                <div className="space-y-3">
                  <Input
                    label="Type"
                    value={editingCuePoint.type}
                    onChange={(v) =>
                      setEditingCuePoint({ ...editingCuePoint, type: v })
                    }
                  />
                  <Input
                    label="Position (secondes)"
                    type="number"
                    value={editingCuePoint.position}
                    onChange={(v) =>
                      setEditingCuePoint({ ...editingCuePoint, position: v })
                    }
                  />
                  <Input
                    label="Label"
                    value={editingCuePoint.label}
                    onChange={(v) =>
                      setEditingCuePoint({ ...editingCuePoint, label: v })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-text-secondary uppercase">Couleur</label>
                    <input
                      type="color"
                      value={editingCuePoint.color}
                      onChange={(e) =>
                        setEditingCuePoint({ ...editingCuePoint, color: e.target.value })
                      }
                      className="w-8 h-8 rounded-lg border border-border-default cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Btn variant="default" onClick={cancelEdit} small icon={X} className="flex-1">
                      Annuler
                    </Btn>
                    <Btn variant="primary" onClick={saveEdit} small icon={Check} className="flex-1">
                      Sauver
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary text-sm">{cp.track_title}</h3>
                      <p className="text-xs text-text-muted">{cp.track_artist}</p>
                    </div>
                    {cp.color && (
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cp.color }}
                      />
                    )}
                  </div>
                  <div className="space-y-2 text-xs mb-3">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Type:</span>
                      <Badge variant="default">{cp.type}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Position:</span>
                      <span className="text-text-secondary font-mono">{formatPosition(cp.position)}</span>
                    </div>
                    {cp.label && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Label:</span>
                        <span className="text-text-secondary">{cp.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Btn
                      variant="default"
                      onClick={() => startEdit(cp)}
                      small
                      icon={Edit3}
                      className="flex-1"
                    >
                      Éditer
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(cp.id)}
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Piste
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Position
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Label
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Couleur
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCuePoints.map((cp) => (
                <tr key={cp.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  {editingId === cp.id && editingCuePoint ? (
                    <>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <Input
                          value={editingCuePoint.type}
                          onChange={(v) =>
                            setEditingCuePoint({ ...editingCuePoint, type: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          value={editingCuePoint.position}
                          onChange={(v) =>
                            setEditingCuePoint({ ...editingCuePoint, position: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={editingCuePoint.label}
                          onChange={(v) =>
                            setEditingCuePoint({ ...editingCuePoint, label: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="color"
                          value={editingCuePoint.color}
                          onChange={(e) =>
                            setEditingCuePoint({ ...editingCuePoint, color: e.target.value })
                          }
                          className="w-8 h-8 rounded-lg border border-border-default"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn variant="default" onClick={cancelEdit} small icon={X} />
                          <Btn variant="primary" onClick={saveEdit} small icon={Check} />
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-medium text-text-primary">{cp.track_title}</p>
                          <p className="text-[10px] text-text-muted">{cp.track_artist}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="default">{cp.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs font-mono text-text-secondary">{formatPosition(cp.position)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-text-secondary">{cp.label || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {cp.color && (
                          <div
                            className="w-6 h-6 rounded-full mx-auto"
                            style={{ backgroundColor: cp.color }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={() => startEdit(cp)}
                            small
                            icon={Edit3}
                          />
                          <Btn
                            variant="danger"
                            onClick={() => setDeletingId(cp.id)}
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
        title="Supprimer le point de repère"
        message="Êtes-vous sûr de vouloir supprimer ce point de repère ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
