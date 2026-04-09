"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Btn,
  Card,
  Badge,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";
import { Lock, Unlock, ShieldCheck, ShieldAlert } from "lucide-react";

interface FeatureLockItem {
  id: number;
  feature_name: string;
  label: string;
  is_locked: boolean;
  locked_at: string | null;
  note: string | null;
}

export default function FeatureLocksPage() {
  const { toast } = useToast();
  const [locks, setLocks] = useState<FeatureLockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyNames, setBusyNames] = useState<Set<string>>(new Set());

  const loadLocks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listFeatureLocks();
      setLocks(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLocks();
  }, [loadLocks]);

  async function toggleLock(lock: FeatureLockItem) {
    const newLocked = !lock.is_locked;
    // Optimistic
    setLocks((prev) =>
      prev.map((l) =>
        l.feature_name === lock.feature_name
          ? { ...l, is_locked: newLocked, locked_at: newLocked ? new Date().toISOString() : null }
          : l
      )
    );
    setBusyNames((prev) => new Set([...prev, lock.feature_name]));

    try {
      await adminApi.toggleFeatureLock(lock.feature_name);
      toast(
        newLocked
          ? `🔒 ${lock.label} verrouillé — Claude ne touchera plus au code`
          : `🔓 ${lock.label} déverrouillé — Claude peut modifier le code`,
        "success"
      );
    } catch (err: any) {
      // Rollback
      setLocks((prev) =>
        prev.map((l) =>
          l.feature_name === lock.feature_name ? { ...l, is_locked: lock.is_locked, locked_at: lock.locked_at } : l
        )
      );
      toast(err.message || "Erreur", "error");
    } finally {
      setBusyNames((prev) => {
        const s = new Set(prev);
        s.delete(lock.feature_name);
        return s;
      });
    }
  }

  const lockedCount = locks.filter((l) => l.is_locked).length;
  const unlockedCount = locks.filter((l) => !l.is_locked).length;

  return (
    <PageWrapper>
      <SectionHeader
        title="Verrouillage des features"
        description="Verrouillez une feature pour empêcher Claude de modifier son code. Déverrouillez-la quand vous voulez qu'il y travaille."
      />

      {/* Stats */}
      <div className="flex gap-4 mb-6">
        <Card className="px-4 py-3 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-2xl font-bold text-emerald-400">{lockedCount}</p>
            <p className="text-xs text-text-muted">Verrouillées</p>
          </div>
        </Card>
        <Card className="px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-2xl font-bold text-amber-400">{unlockedCount}</p>
            <p className="text-xs text-text-muted">Ouvertes</p>
          </div>
        </Card>
      </div>

      {loading ? (
        <LoadingScreen />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {locks.map((lock) => {
            const isBusy = busyNames.has(lock.feature_name);
            return (
              <Card
                key={lock.feature_name}
                className={`p-4 transition-all border-2 ${
                  lock.is_locked
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                } ${isBusy ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {lock.label || lock.feature_name}
                    </p>
                    <p className="text-xs text-text-muted font-mono mt-0.5">
                      {lock.feature_name}
                    </p>
                    {lock.is_locked && lock.locked_at && (
                      <p className="text-xs text-emerald-400 mt-2">
                        Verrouillé le {new Date(lock.locked_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>

                  <Btn
                    small
                    variant={lock.is_locked ? "success" : "warning"}
                    icon={lock.is_locked ? Lock : Unlock}
                    onClick={() => !isBusy && toggleLock(lock)}
                    disabled={isBusy}
                  >
                    {lock.is_locked ? "Verrouillé" : "Ouvert"}
                  </Btn>
                </div>

                {/* Status bar */}
                <div className={`mt-3 h-1 rounded-full ${lock.is_locked ? "bg-emerald-500" : "bg-amber-500"}`} />
              </Card>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
