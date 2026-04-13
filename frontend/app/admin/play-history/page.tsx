"use client";
import { useState, useEffect, useCallback } from "react";
import { History, TrendingUp } from "lucide-react";
import {
  Input, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, TabBar,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface PlayHistory {
  id: number;
  user_id: number;
  user_email?: string;
  track_id: number;
  track_title?: string;
  track_artist?: string;
  played_at: string;
}

interface TopPlayed {
  track_id: number;
  track_title: string;
  track_artist: string;
  play_count: number;
}

export default function PlayHistoryPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [history, setHistory] = useState<PlayHistory[]>([]);
  const [topPlayed, setTopPlayed] = useState<TopPlayed[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === "all") {
        const res = await adminApi.listPlayHistory({
          skip,
          limit,
        });
        setHistory(res.play_history || []);
        setTotal(res.total || 0);
      } else {
        const res = await adminApi.topPlayed();
        setTopPlayed(res.top_played || []);
        setTotal(res.total || 0);
      }
      toast("Données chargées", "success");
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
    loadData();
  }, [loadData]);

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredHistory = search
    ? history.filter(
        (h) =>
          h.track_title?.toLowerCase().includes(search.toLowerCase()) ||
          h.track_artist?.toLowerCase().includes(search.toLowerCase()) ||
          h.user_email?.toLowerCase().includes(search.toLowerCase())
      )
    : history;

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Historique de Lecture"
        description={`Consultez les ${total} lectures`}
      />

      {/* Tabs */}
      <TabBar
        tabs={[
          { id: "all", label: "Historique complet", icon: History },
          { id: "top", label: "Les plus écoutées", icon: TrendingUp },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Search for all tab */}
      {tab === "all" && (
        <Card className="p-4 mb-6">
          <Input
            placeholder="Rechercher par piste, artiste ou utilisateur..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
        </Card>
      )}

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : tab === "all" && filteredHistory.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucune lecture"
          description="Aucune lecture n'a été enregistrée"
        />
      ) : tab === "top" && topPlayed.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Aucune lecture"
          description="Aucune lecture n'a été enregistrée"
        />
      ) : tab === "all" ? isMobile ? (
        // Mobile cards - history
        <div className="space-y-3">
          {filteredHistory.map((ph) => (
            <Card key={ph.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary text-sm">{ph.track_title}</h3>
                  <p className="text-xs text-text-muted">{ph.track_artist}</p>
                  <p className="text-xs text-text-secondary mt-1">{ph.user_email}</p>
                  <p className="text-xs text-text-muted mt-1">{formatDate(ph.played_at)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop table - history
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
              {filteredHistory.map((ph) => (
                <tr key={ph.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{ph.track_title}</p>
                      <p className="text-[10px] text-text-muted">{ph.track_artist}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{ph.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(ph.played_at)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : isMobile ? (
        // Mobile cards - top played
        <div className="space-y-3">
          {topPlayed.map((tp, idx) => (
            <Card key={tp.track_id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <Badge variant="default">#{idx + 1}</Badge>
                  <h3 className="font-semibold text-text-primary text-sm mt-2">{tp.track_title}</h3>
                  <p className="text-xs text-text-muted">{tp.track_artist}</p>
                  <p className="text-xs text-text-secondary mt-1">{tp.play_count} écoutes</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop table - top played
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
                  Écoutes
                </th>
              </tr>
            </thead>
            <tbody>
              {topPlayed.map((tp, idx) => (
                <tr key={tp.track_id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-center">
                    <Badge variant="default">#{idx + 1}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{tp.track_title}</p>
                      <p className="text-[10px] text-text-muted">{tp.track_artist}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary font-mono">{tp.play_count}</p>
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
