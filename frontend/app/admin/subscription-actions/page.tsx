"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Edit, Tag, Pause, Play, Trash2, DollarSign, X, Check,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface SubscriptionInfo {
  id: number;
  user_id: number;
  user_email: string;
  current_plan: string;
  status: "active" | "paused" | "canceled";
  period_end: string;
  amount: number;
}

interface ActionHistory {
  id: number;
  action_type: string;
  timestamp: string;
  details: string;
}

const plans = ["free", "pro", "unlimited"];

export default function SubscriptionActionsPage() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [actionHistory, setActionHistory] = useState<ActionHistory[]>([]);

  // Modal states
  const [changePlanModal, setChangePlanModal] = useState(false);
  const [discountModal, setDiscountModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);

  // Form states
  const [selectedPlan, setSelectedPlan] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Search
  const handleSearch = async () => {
    if (!searchInput.trim()) {
      toast("Veuillez entrer un ID ou email", "error");
      return;
    }
    try {
      setLoading(true);
      // Assuming API returns subscription by email or user_id
      const res = await adminApi.listSubscriptions({
        search: searchInput,
        limit: 1,
      });
      const sub = res.subscriptions?.[0];
      if (!sub) {
        toast("Abonnement non trouvé", "error");
        return;
      }
      setSubscription(sub);
      // Load action history
      const historyRes = await adminApi.getUpgradeHistory({
        skip: 0,
        limit: 20,
      });
      setActionHistory(historyRes.items || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle change plan
  const handleChangePlan = async () => {
    if (!subscription || !selectedPlan) {
      toast("Sélectionnez un plan", "error");
      return;
    }
    try {
      setActionLoading(true);
      await adminApi.changeSubscriptionPlan(subscription.id, {
        new_plan: selectedPlan,
      });
      toast("Plan changé avec succès", "success");
      setChangePlanModal(false);
      handleSearch(); // Refresh
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle apply discount
  const handleApplyDiscount = async () => {
    if (!subscription || !discountValue) {
      toast("Entrez un montant ou un pourcentage", "error");
      return;
    }
    try {
      setActionLoading(true);
      await adminApi.applyDiscount(subscription.id, {
        type: discountType,
        value: parseFloat(discountValue),
      });
      toast("Remise appliquée", "success");
      setDiscountModal(false);
      handleSearch();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle pause
  const handlePause = async () => {
    if (!subscription) return;
    try {
      setActionLoading(true);
      await adminApi.pauseSubscription(subscription.id);
      toast("Abonnement mis en pause", "success");
      handleSearch();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle resume
  const handleResume = async () => {
    if (!subscription) return;
    try {
      setActionLoading(true);
      await adminApi.resumeSubscription(subscription.id);
      toast("Abonnement repris", "success");
      handleSearch();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    if (!subscription) return;
    try {
      setActionLoading(true);
      await adminApi.cancelSubscription(subscription.id, {
        reason: cancelReason,
      });
      toast("Abonnement annulé", "success");
      setCancelModal(false);
      handleSearch();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle refund
  const handleRefund = async () => {
    if (!subscription || !refundAmount) {
      toast("Entrez un montant de remboursement", "error");
      return;
    }
    try {
      setActionLoading(true);
      await adminApi.refundSubscription(subscription.id, {
        amount: parseFloat(refundAmount),
      });
      toast("Remboursement traité", "success");
      setRefundModal(false);
      handleSearch();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <PageWrapper>
      <SectionHeader
        title="Actions sur les abonnements"
        description="Modifier les plans, appliquer des remises, mettre en pause, annuler"
      />

      {/* Search Section */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="ID utilisateur ou email"
              value={searchInput}
              onChange={(v) => setSearchInput(v)}
              className="flex-1"
            />
            <Btn
              variant="primary"
              onClick={handleSearch}
              disabled={loading}
            >
              <Search className="w-4 h-4" /> Chercher
            </Btn>
          </div>
        </div>
      </Card>

      {!subscription ? (
        <Card>
          <div className="p-12 text-center">
            <p className="text-gray-400">Utilisez la recherche pour trouver un abonnement</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Subscription Info */}
          <Card>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white font-semibold text-lg">
                    {subscription.user_email}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    User ID: {subscription.user_id}
                  </p>
                </div>
                <Badge
                  variant={
                    subscription.status === "active"
                      ? "success"
                      : subscription.status === "paused"
                        ? "warning"
                        : "error"
                  }
                >
                  {subscription.status === "active" && "Actif"}
                  {subscription.status === "paused" && "En pause"}
                  {subscription.status === "canceled" && "Annulé"}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6 bg-[#0a0a1a] p-4 rounded">
                <div>
                  <p className="text-gray-400 text-sm">Plan actuel</p>
                  <p className="text-white font-semibold">{subscription.current_plan}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Montant</p>
                  <p className="text-white font-semibold">
                    €{subscription.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Fin de période</p>
                  <p className="text-white font-semibold">
                    {new Date(subscription.period_end).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => setChangePlanModal(true)}
                >
                  <Edit className="w-4 h-4" /> Changer le plan
                </Btn>
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() => setDiscountModal(true)}
                >
                  <Tag className="w-4 h-4" /> Appliquer remise
                </Btn>
                {subscription.status === "active" ? (
                  <Btn
                    variant="warning"
                    size="sm"
                    onClick={handlePause}
                    disabled={actionLoading}
                  >
                    <Pause className="w-4 h-4" /> Mettre en pause
                  </Btn>
                ) : (
                  <Btn
                    variant="success"
                    size="sm"
                    onClick={handleResume}
                    disabled={actionLoading}
                  >
                    <Play className="w-4 h-4" /> Reprendre
                  </Btn>
                )}
                {subscription.status !== "canceled" && (
                  <Btn
                    variant="error"
                    size="sm"
                    onClick={() => setCancelModal(true)}
                  >
                    <Trash2 className="w-4 h-4" /> Annuler
                  </Btn>
                )}
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() => setRefundModal(true)}
                >
                  <DollarSign className="w-4 h-4" /> Rembourser
                </Btn>
              </div>
            </div>
          </Card>

          {/* Action History */}
          <Card>
            <div className="p-6">
              <h3 className="text-white font-semibold mb-4">Historique des actions</h3>
              {actionHistory.length === 0 ? (
                <EmptyState
                  title="Aucune action"
                  description="Aucune action enregistrée pour cet utilisateur"
                />
              ) : (
                <div className="space-y-2">
                  {actionHistory.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                    >
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {action.action_type}
                        </p>
                        <p className="text-gray-400 text-sm">{action.details}</p>
                        <p className="text-gray-500 text-xs">
                          {new Date(action.timestamp).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Change Plan Modal */}
      {changePlanModal && subscription && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Changer le plan</h3>
                <button
                  onClick={() => setChangePlanModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Plan actuel: {subscription.current_plan}
                  </label>
                  <Select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                  >
                    <option value="">Sélectionner un nouveau plan...</option>
                    {plans
                      .filter((p) => p !== subscription.current_plan)
                      .map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setChangePlanModal(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={handleChangePlan}
                    disabled={actionLoading || !selectedPlan}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4" /> Changer
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Discount Modal */}
      {discountModal && subscription && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Appliquer une remise</h3>
                <button
                  onClick={() => setDiscountModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Type
                  </label>
                  <div className="flex gap-2">
                    {["percentage", "amount"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setDiscountType(type as any)}
                        className={`flex-1 px-3 py-2 rounded border text-sm transition-colors ${
                          discountType === type
                            ? "border-purple-600 bg-purple-600/20 text-purple-300"
                            : "border-gray-700 text-gray-400"
                        }`}
                      >
                        {type === "percentage" ? "%" : "€"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Montant
                  </label>
                  <Input
                    type="number"
                    value={discountValue}
                    onChange={(v) => setDiscountValue(v)}
                    placeholder="ex: 10"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setDiscountModal(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={handleApplyDiscount}
                    disabled={actionLoading || !discountValue}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4" /> Appliquer
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && subscription && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Annuler l'abonnement</h3>
                <button
                  onClick={() => setCancelModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Raison de l'annulation
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Motif..."
                    className="w-full bg-[#0a0a1a] text-white border border-gray-700 rounded px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setCancelModal(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="error"
                    onClick={handleCancel}
                    disabled={actionLoading}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4" /> Annuler l'abonnement
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Refund Modal */}
      {refundModal && subscription && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Rembourser</h3>
                <button
                  onClick={() => setRefundModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Montant du remboursement (€)
                  </label>
                  <Input
                    type="number"
                    value={refundAmount}
                    onChange={(v) => setRefundAmount(v)}
                    placeholder={String(subscription.amount.toFixed(2))}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setRefundModal(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={handleRefund}
                    disabled={actionLoading || !refundAmount}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4" /> Rembourser
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
