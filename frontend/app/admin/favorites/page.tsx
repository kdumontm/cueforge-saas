"use client";
import { useState, useEffect, useCallback } from "react";
import { Heart, TrendingUp } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, TabBar,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Favorite {
  id: number;
  user_id: number;
  user_email?: string;
  track_id: number;
  track_title?: string;
  track_artist?: string;
  created_at: string;
}

interface TopFavorite {
  track_id: number;
  track_title: string;
  track_artist: string;
  favorite_count: number;
}

export default function FavoritesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [topFavorites, setTopFavorites] = useState<TopFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === "all") {
        const res = await adminApi.listFavorites({ skip, limit });
        setFavorites(res.favorites || []);
        setTotal(res.total || 0);
      } else {
        const res = await adminApi.topFavorites();
        setTopFavorites(res.top_favorites || []);
        setTotal(res.total || 0);
      }
      toast("Favoris chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [tab, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [tab]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

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
      <SectionHeader
        title="Favoris"
        description={`Gérez les ${total} favoris`}
      />

      {/* Tabs */}
      <TabBar
        tabs={[
          { id: "all", label: "Tous les favoris", icon: Heart },
          { id: "top", label: "Top favoris", icon: TrendingUp },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : tab === "all" && favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Aucun favori"
          description="Aucun favori n'a été créé"
        />
      ) : tab === "top" && topFavorites.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Aucun favori"
          description="Aucun favori n'a été créé"
        />
      ) : tab === "all" ? isMobile ? (
        // Mobile cards - all favorites
        <div className="space-y-3">
          {favorites.map((fav) => (
            <Card key={fav.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary text-sm">{fav.track_title}</h3>
                  <p className="text-xs text-text-muted">{fav.track_artist}</p>
                  <p className="text-xs text-text-muted mt-1">{fav.user_email}</p>
                  <p className="text-xs text-text-muted mt-1">{formatDate(fav.created_at)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop table - all favorites
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Piste
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {favorites.map((fav) => (
                <tr key={fav.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{fav.track_title}</p>
                      <p className="text-[10px] text-text-muted">{fav.track_artist}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{fav.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(fav.created_at)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : isMobile ? (
        // Mobile cards - top favorites
        <div className="space-y-3">
          {topFavorites.map((top, idx) => (
            <Card key={top.track_id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <Badge variant="default">#{idx + 1}</Badge>
                  <h3 className="font-semibold text-text-primary text-sm mt-2">{top.track_title}</h3>
                  <p className="text-xs text-text-muted">{top.track_artist}</p>
                  <p className="text-xs text-text-secondary mt-1">{top.favorite_count} favoris</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop table - top favorites
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase w-12">
                  #
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Piste
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Favoris
                </th>
              </tr>
            </thead>
            <tbody>
              {topFavorites.map((top, idx) => (
                <tr key={top.track_id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-center">
                    <Badge variant="default">#{idx + 1}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{top.track_title}</p>
                      <p className="text-[10px] text-text-muted">{top.track_artist}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary font-mono">{top.favorite_count}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {pages > 1 && tab === "all" && (
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
