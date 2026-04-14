"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, ListMusic,
} from "lucide-react";
import {
  Input, Btn, Card, PageWrapper, SectionHeader, LoadingScreen, EmptyState, useToast, StatCard, PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Playlist {
  id: number;
  name: string;
  user_id: number;
  user_email: string;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export default function PlaylistsPage() {
  const { toast } = useToast();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const loadPlaylists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listPlaylists({
        search: search || undefined,
        skip,
        limit,
      });
      setPlaylists(res.playlists || []);
      setTotal(res.total || 0);
      toast("Listes de lecture chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [search]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
        id="playlists"
        icon={ListMusic}
        title="Gestion des playlists"
        description="Consultez toutes les playlists créées par les utilisateurs de TrackCue. Vous pouvez voir le nombre de pistes et la date de création de chaque playlist."
      />
      <SectionHeader
        title="Listes de Lecture"
        description={`Gérez les ${total} listes de lecture`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={ListMusic} label="Total" value={total} color="#8b5cf6" />
        <StatCard
          icon={ListMusic}
          label="Avg. Pistes"
          value={
            playlists.length > 0
              ? Math.round(
                  playlists.reduce((sum, p) => sum + p.track_count, 0) /
                    playlists.length
                )
              : 0
          }
          color="#ec4899"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadPlaylists();
              }}
              small
              icon={Search}
            >
              Rechercher
            </Btn>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="Aucune liste de lecture trouvée"
          description={search ? "Modifiez les filtres" : "Aucune liste de lecture"}
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {playlists.map((playlist) => (
            <Card key={playlist.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">
                    {playlist.name}
                  </h3>
                  <p className="text-xs text-text-muted">{playlist.user_email}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Pistes:</span>
                  <span className="text-text-secondary">
                    {playlist.track_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Créée:</span>
                  <span className="text-text-secondary">
                    {formatDate(playlist.created_at)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Modifiée:</span>
                  <span className="text-text-secondary">
                    {formatDate(playlist.updated_at)}
                  </span>
                </div>
              </div>
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
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Pistes
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Créée
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Modifiée
                </th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((playlist) => (
                <tr
                  key={playlist.id}
                  className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">
                      {playlist.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">
                      {playlist.user_email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs font-semibold text-text-primary">
                      {playlist.track_count}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(playlist.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(playlist.updated_at)}
                    </p>
                  </td>
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
    </PageWrapper>
  );
}
