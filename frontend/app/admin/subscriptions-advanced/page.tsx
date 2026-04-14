"use client";
import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock,
  RotateCcw, ChevronDown, ChevronUp, X,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, StatCard, TabBar,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface OverviewData {
  mrr: number;
  arr: number;
  churn_rate: number;
  ltv: number;
  growth_rate: number;
  active_subscriptions: number;
}

interface Trial {
  id: number;
  user_id: number;
  user_email: string;
  days_remaining: number;
  created_at: string;
  ends_at: string;
}

interface UpgradeAction {
  id: number;
  user_id: number;
  user_email: string;
  from_plan: string;
  to_plan: string;
  created_at: string;
}

interface DunningPayment {
  id: number;
  user_id: number;
  user_email: string;
  amount: number;
  attempts: number;
  last_attempt: string;
  next_retry: string;
}

interface RevenueForecast {
  month: string;
  predicted_mrr: number;
  confidence: number;
}

export default function SubscriptionsAdvancedPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Overview
  const [overview, setOverview] = useState<OverviewData | null>(null);

  // Trials
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [trialSkip, setTrialSkip] = useState(0);
  const [trialExtendModal, setTrialExtendModal] = useState<Trial | null>(null);
  const [trialExtendDays, setTrialExtendDays] = useState(7);

  // Actions
  const [upgradeHistory, setUpgradeHistory] = useState<UpgradeAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  // Dunning
  const [dunning, setDunning] = useState<DunningPayment[]>([]);
  const [dunningLoading, setDunningLoading] = useState(false);

  // Forecast
  const [forecast, setForecast] = useState<RevenueForecast[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Load overview
  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true);
        const data = await adminApi.getSubscriptionOverview();
        setOverview(data);
      } catch (err: any) {
        toast(`Erreur: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };
    loadOverview();
  }, [toast]);

  // Load trials
  const loadTrials = useCallback(async () => {
    try {
      setTrialsLoading(true);
      const data = await adminApi.getTrials({ skip: trialSkip, limit: 20 });
      setTrials(data.items || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setTrialsLoading(false);
    }
  }, [trialSkip, toast]);

  // Load upgrade history
  const loadUpgradeHistory = useCallback(async () => {
    try {
      setActionsLoading(true);
      const data = await adminApi.getUpgradeHistory({ skip: 0, limit: 20 });
      setUpgradeHistory(data.items || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionsLoading(false);
    }
  }, [toast]);

  // Load dunning
  const loadDunning = useCallback(async () => {
    try {
      setDunningLoading(true);
      const data = await adminApi.getDunning();
      setDunning(data.items || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setDunningLoading(false);
    }
  }, [toast]);

  // Load forecast
  const loadForecast = useCallback(async () => {
    try {
      setForecastLoading(true);
      const data = await adminApi.getRevenueForecast();
      setForecast(data.forecast || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setForecastLoading(false);
    }
  }, [toast]);

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === "trials") loadTrials();
    else if (activeTab === "actions") loadUpgradeHistory();
    else if (activeTab === "dunning") loadDunning();
    else if (activeTab === "forecast") loadForecast();
  }, [activeTab, loadTrials, loadUpgradeHistory, loadDunning, loadForecast]);

  // Handle extend trial
  const handleExtendTrial = async (trial: Trial) => {
    try {
      await adminApi.extendTrial(trial.id, { days: trialExtendDays });
      toast("Essai prolongé", "success");
      setTrialExtendModal(null);
      loadTrials();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle convert trial
  const handleConvertTrial = async (trialId: number) => {
    try {
      await adminApi.convertTrial(trialId);
      toast("Essai converti en abonnement", "success");
      loadTrials();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle retry dunning
  const handleRetryDunning = async (dunningId: number) => {
    try {
      await adminApi.retryDunning(dunningId);
      toast("Nouvelle tentative lancée", "success");
      loadDunning();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper>
      <SectionHeader
        title="Gestion avancée des abonnements"
        description="MRR, ARR, essais, actions, dunning, prévisions"
      />

      {/* Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={overview.growth_rate > 0 ? TrendingUp : TrendingDown}
            label="MRR"
            value={`€${overview.mrr.toLocaleString()}`}
            sub={overview.growth_rate > 0 ? "up" : "down"}
          />
          <StatCard
            icon={TrendingUp}
            label="ARR"
            value={`€${overview.arr.toLocaleString()}`}
            sub={overview.growth_rate > 0 ? "up" : "down"}
          />
          <StatCard
            icon={overview.churn_rate > 0.05 ? AlertCircle : CheckCircle}
            label="Taux churn"
            value={`${(overview.churn_rate * 100).toFixed(1)}%`}
            sub={overview.churn_rate > 0.05 ? "down" : "up"}
          />
          <StatCard
            icon={CheckCircle}
            label="LTV"
            value={`€${overview.ltv.toFixed(2)}`}
          />
          <StatCard
            icon={TrendingUp}
            label="Croissance"
            value={`${(overview.growth_rate * 100).toFixed(1)}%`}
            sub={overview.growth_rate > 0 ? "up" : "down"}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-gray-700">
          {["overview", "trials", "actions", "dunning", "forecast"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? "text-purple-400 border-b-2 border-purple-600"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab === "overview" && "Aperçu"}
              {tab === "trials" && "Essais"}
              {tab === "actions" && "Actions"}
              {tab === "dunning" && "Dunning"}
              {tab === "forecast" && "Prévisions"}
            </button>
          ))}
        </div>
      </div>

      {/* Trials Tab */}
      {activeTab === "trials" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Essais actifs</h3>
            {trialsLoading ? (
              <div className="text-gray-400 text-center py-4">Chargement...</div>
            ) : trials.length === 0 ? (
              <EmptyState title="Aucun essai" description="Tous les essais ont expiré ou ont été convertis" />
            ) : (
              <div className="space-y-2">
                {trials.map((trial) => (
                  <div
                    key={trial.id}
                    className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{trial.user_email}</p>
                      <p className="text-gray-400 text-sm">
                        {trial.days_remaining} jours restants
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Btn
                        variant="secondary"
                        size="sm"
                        onClick={() => setTrialExtendModal(trial)}
                      >
                        <Clock className="w-4 h-4" /> Prolonger
                      </Btn>
                      <Btn
                        variant="primary"
                        size="sm"
                        onClick={() => handleConvertTrial(trial.id)}
                      >
                        <CheckCircle className="w-4 h-4" /> Convertir
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Actions Tab */}
      {activeTab === "actions" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Historique des mises à jour</h3>
            {actionsLoading ? (
              <div className="text-gray-400 text-center py-4">Chargement...</div>
            ) : upgradeHistory.length === 0 ? (
              <EmptyState title="Aucune action" description="Aucun changement de plan enregistré" />
            ) : (
              <div className="space-y-2">
                {upgradeHistory.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{action.user_email}</p>
                      <p className="text-gray-400 text-sm">
                        {action.from_plan} → {action.to_plan}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {new Date(action.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <Badge variant="success">Terminée</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Dunning Tab */}
      {activeTab === "dunning" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Paiements échoués</h3>
            {dunningLoading ? (
              <div className="text-gray-400 text-center py-4">Chargement...</div>
            ) : dunning.length === 0 ? (
              <EmptyState title="Aucun paiement échoué" description="Tous les paiements sont à jour" />
            ) : (
              <div className="space-y-2">
                {dunning.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{payment.user_email}</p>
                      <p className="text-gray-400 text-sm">
                        €{payment.amount.toFixed(2)} • {payment.attempts} tentatives
                      </p>
                      <p className="text-gray-500 text-xs">
                        Prochaine tentative: {new Date(payment.next_retry).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={() => handleRetryDunning(payment.id)}
                    >
                      <RotateCcw className="w-4 h-4" /> Réessayer
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Forecast Tab */}
      {activeTab === "forecast" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Prévision des revenus</h3>
            {forecastLoading ? (
              <div className="text-gray-400 text-center py-4">Chargement...</div>
            ) : forecast.length === 0 ? (
              <EmptyState title="Aucune prévision" description="Données insuffisantes pour la prévision" />
            ) : (
              <div className="space-y-2">
                {forecast.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{item.month}</p>
                      <p className="text-gray-400 text-sm">
                        €{item.predicted_mrr.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="info">
                      {(item.confidence * 100).toFixed(0)}% confiance
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Extend Trial Modal */}
      {trialExtendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Prolonger l'essai</h3>
                <button
                  onClick={() => setTrialExtendModal(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Adresse email
                  </label>
                  <Input
                    type="text"
                    value={trialExtendModal.user_email}
                    onChange={() => {}}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Nombre de jours
                  </label>
                  <Input
                    type="number"
                    value={String(trialExtendDays)}
                    onChange={(v) => setTrialExtendDays(parseInt(v) || 0)}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setTrialExtendModal(null)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={() => handleExtendTrial(trialExtendModal)}
                    className="flex-1"
                  >
                    Prolonger
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
