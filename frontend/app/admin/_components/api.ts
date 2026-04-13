/**
 * Admin API Client — CueForge Back-office
 * Centralise tous les appels API admin.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cueforge_token");
}

export async function api<T = any>(path: string, opts: any = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const adminApi = {
  // Dashboard
  dashboard: () => api("/admin/dashboard"),

  // Settings
  getSettings: () => api("/admin/settings"),
  updateSettings: (data: any) => api("/admin/settings", { method: "PUT", body: data }),

  // Page Configs (toggles on/off)
  listPageConfigs: () => api("/admin/settings/pages"),
  createPageConfig: (data: any) => api("/admin/settings/pages", { method: "POST", body: data }),
  togglePageConfig: (pageName: string, data: any) => api(`/admin/settings/pages/${pageName}`, { method: "PATCH", body: data }),
  deletePageConfig: (pageName: string) => api(`/admin/settings/pages/${pageName}`, { method: "DELETE" }),

  // Pages (CMS)
  listPages: () => api("/admin/pages"),
  getPage: (id: number) => api(`/admin/pages/${id}`),
  createPage: (data: any) => api("/admin/pages", { method: "POST", body: data }),
  updatePage: (id: number, data: any) => api(`/admin/pages/${id}`, { method: "PUT", body: data }),
  deletePage: (id: number) => api(`/admin/pages/${id}`, { method: "DELETE" }),
  publishPage: (id: number) => api(`/admin/pages/${id}/publish`, { method: "PUT" }),

  // Sections
  listSections: (pageId: number) => api(`/admin/pages/${pageId}/sections`),
  createSection: (data: any) => api("/admin/sections", { method: "POST", body: data }),
  updateSection: (id: number, data: any) => api(`/admin/sections/${id}`, { method: "PUT", body: data }),
  deleteSection: (id: number) => api(`/admin/sections/${id}`, { method: "DELETE" }),
  reorderSections: (orders: any) => api("/admin/sections/reorder", { method: "PUT", body: orders }),

  // Components
  createComponent: (data: any) => api("/admin/components", { method: "POST", body: data }),
  updateComponent: (id: number, data: any) => api(`/admin/components/${id}`, { method: "PUT", body: data }),
  deleteComponent: (id: number) => api(`/admin/components/${id}`, { method: "DELETE" }),
  reorderComponents: (orders: any) => api("/admin/components/reorder", { method: "PUT", body: orders }),

  // Media
  listMedia: (cat?: string) => api(`/admin/media${cat ? `?category=${cat}` : ""}`),
  uploadMedia: (file: File, category?: string, altText?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    return api(`/admin/media?category=${category || "general"}${altText ? `&alt_text=${encodeURIComponent(altText)}` : ""}`, { method: "POST", body: fd });
  },
  updateMedia: (id: number, data: any) => api(`/admin/media/${id}`, { method: "PUT", body: data }),
  deleteMedia: (id: number) => api(`/admin/media/${id}`, { method: "DELETE" }),

  // Features
  listFeatures: (plan?: string) => api(`/admin/features${plan ? `?plan=${plan}` : ""}`),
  createFeature: (data: any) => api("/admin/features", { method: "POST", body: data }),
  updateFeature: (id: number, data: any) => api(`/admin/features/${id}`, { method: "PUT", body: data }),
  deleteFeature: (id: number) => api(`/admin/features/${id}`, { method: "DELETE" }),
  bulkToggleFeatures: (planName: string, isEnabled: boolean) =>
    api(`/admin/features/plan/${planName}`, { method: "PATCH", body: { is_enabled: isEnabled } }),
  bulkSetDisplayMode: (planName: string, displayMode: 'hidden' | 'locked') =>
    api(`/admin/features/plan/${planName}/display-mode`, { method: "PATCH", body: { display_mode: displayMode } }),

  // Feature Locks (verrouillage du code)
  listFeatureLocks: () => api("/admin/feature-locks"),
  toggleFeatureLock: (featureName: string) =>
    api(`/admin/feature-locks/${featureName}`, { method: "PATCH" }),

  // Users
  listUsers: (params?: { search?: string; plan?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.plan) q.set("plan", params.plan);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/users?${q.toString()}`);
  },
  getUser: (id: number) => api(`/admin/users/${id}`),
  updateUser: (id: number, data: any) => api(`/admin/users/${id}`, { method: "PUT", body: data }),
  deleteUser: (id: number) => api(`/admin/users/${id}`, { method: "DELETE" }),

  // Activity Logs
  listActivityLogs: (params?: { limit?: number; skip?: number; action?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.action) q.set("action", params.action);
    return api(`/admin/activity?${q.toString()}`);
  },

  // Navigation
  getNavigation: () => api("/admin/navigation"),
  updateNavigation: (data: any) => api("/admin/navigation", { method: "PUT", body: data }),

  // Tracks
  listTracks: (params?: { search?: string; status?: string; skip?: number; limit?: number; sort?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.sort) q.set("sort", params.sort);
    return api(`/admin/tracks?${q.toString()}`);
  },
  getTrack: (id: number) => api(`/admin/tracks/${id}`),
  updateTrack: (id: number, data: any) => api(`/admin/tracks/${id}`, { method: "PUT", body: data }),
  deleteTrack: (id: number) => api(`/admin/tracks/${id}`, { method: "DELETE" }),
  bulkDeleteTracks: (ids: number[]) => api(`/admin/tracks/bulk-delete`, { method: "POST", body: { ids } }),
  bulkUpdateTracks: (ids: number[], field: string, value: any) =>
    api(`/admin/tracks/bulk-update`, { method: "POST", body: { ids, field, value } }),
  retryAnalysis: (id: number) => api(`/admin/tracks/retry-analysis/${id}`, { method: "POST" }),
  retryAllFailed: () => api(`/admin/tracks/retry-all-failed`, { method: "POST" }),
  exportTracks: () => `${API_BASE}/admin/tracks/export`,

  // Subscriptions
  listSubscriptions: (params?: { search?: string; plan?: string; status?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.plan) q.set("plan", params.plan);
    if (params?.status) q.set("status", params.status);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/subscriptions?${q.toString()}`);
  },
  subscriptionStats: () => api("/admin/subscriptions/stats"),

  // Health
  getHealth: () => api("/admin/health"),
  getDbStats: () => api("/admin/health/db"),

  // DB Browser
  listDbTables: () => api("/admin/db/tables"),
  browseTable: (name: string, params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/db/tables/${name}?${q.toString()}`);
  },
  getTableSchema: (name: string) => api(`/admin/db/tables/${name}/schema`),

  // Playlists
  listPlaylists: (params?: { search?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/playlists?${q.toString()}`);
  },

  // DJ Sets
  listDjSets: (params?: { search?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/djsets?${q.toString()}`);
  },

  // Organizations
  listOrganizations: (params?: { search?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/organizations?${q.toString()}`);
  },

  // Export
  exportEntity: (entity: string) => `${API_BASE}/admin/export/${entity}`,

  // Enhanced Users
  advancedListUsers: (params?: { search?: string; plan?: string; status?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.plan) q.set("plan", params.plan);
    if (params?.status) q.set("status", params.status);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/users?${q.toString()}`);
  },
  bulkUserActionLegacy: (action: string, userIds: number[], params?: any) =>
    api(`/admin/users/bulk-action`, { method: "POST", body: { action, user_ids: userIds, ...params } }),
  resetUserPassword: (id: number) => api(`/admin/users/${id}/reset-password`, { method: "POST" }),
  forceVerifyUser: (id: number) => api(`/admin/users/${id}/force-verify`, { method: "POST" }),
  forceLogoutUser: (id: number) => api(`/admin/users/${id}/force-logout`, { method: "POST" }),
  createUser: (data: any) => api("/admin/users/create", { method: "POST", body: data }),
  exportUsers: () => `${API_BASE}/admin/users/export`,

  // Feedback
  listFeedbacks: (params?: { type?: string; status?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.status) q.set("status", params.status);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/feedbacks?${q.toString()}`);
  },
  updateFeedback: (id: number, data: any) => api(`/admin/feedbacks/${id}`, { method: "PATCH", body: data }),
  deleteFeedback: (id: number) => api(`/admin/feedbacks/${id}`, { method: "DELETE" }),
  feedbackStats: () => api("/admin/feedbacks/stats"),

  // Activity Logs
  listActivityLogsEnhanced: (params?: { action?: string; user_id?: number; skip?: number; limit?: number; search?: string; date_from?: string; date_to?: string }) => {
    const q = new URLSearchParams();
    if (params?.action) q.set("action", params.action);
    if (params?.user_id) q.set("user_id", String(params.user_id));
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.search) q.set("search", params.search);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    return api(`/admin/activity?${q.toString()}`);
  },
  activityStats: () => api("/admin/activity/stats"),

  // Notifications
  listNotifications: (params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/notifications?${q.toString()}`);
  },
  broadcastNotification: (data: any) => api("/admin/notifications/broadcast", { method: "POST", body: data }),
  sendNotification: (userIds: number[], data: any) => api("/admin/notifications/send", { method: "POST", body: { user_ids: userIds, ...data } }),
  deleteNotification: (id: number) => api(`/admin/notifications/${id}`, { method: "DELETE" }),

  // Cue Points
  listCuePoints: (params?: { track_id?: number; user_id?: number; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.track_id) q.set("track_id", String(params.track_id));
    if (params?.user_id) q.set("user_id", String(params.user_id));
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/cuepoints?${q.toString()}`);
  },
  updateCuePoint: (id: number, data: any) => api(`/admin/cuepoints/${id}`, { method: "PUT", body: data }),
  deleteCuePoint: (id: number) => api(`/admin/cuepoints/${id}`, { method: "DELETE" }),

  // Tags
  listTags: () => api("/admin/tags"),
  createTag: (data: any) => api("/admin/tags", { method: "POST", body: data }),
  updateTag: (id: number, data: any) => api(`/admin/tags/${id}`, { method: "PUT", body: data }),
  deleteTag: (id: number) => api(`/admin/tags/${id}`, { method: "DELETE" }),
  mergeTags: (sourceIds: number[], targetId: number) =>
    api("/admin/tags/merge", { method: "POST", body: { source_ids: sourceIds, target_id: targetId } }),

  // Blog
  listBlogPosts: (params?: { status?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/blog?${q.toString()}`);
  },
  getBlogPost: (id: number) => api(`/admin/blog/${id}`),
  createBlogPost: (data: any) => api("/admin/blog", { method: "POST", body: data }),
  updateBlogPost: (id: number, data: any) => api(`/admin/blog/${id}`, { method: "PUT", body: data }),
  deleteBlogPost: (id: number) => api(`/admin/blog/${id}`, { method: "DELETE" }),
  toggleBlogPublish: (id: number) => api(`/admin/blog/${id}/publish`, { method: "PATCH" }),

  // API Keys
  listApiKeys: () => api("/admin/apikeys"),
  revokeApiKey: (id: number) => api(`/admin/apikeys/${id}/revoke`, { method: "POST" }),

  // Webhooks
  listWebhooks: () => api("/admin/webhooks"),
  deleteWebhook: (id: number) => api(`/admin/webhooks/${id}`, { method: "DELETE" }),
  testWebhook: (id: number) => api(`/admin/webhooks/${id}/test`, { method: "POST" }),

  // Referrals
  listReferrals: (params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/referrals?${q.toString()}`);
  },
  referralStats: () => api("/admin/referrals/stats"),

  // Shared Links
  listSharedLinks: (params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/shared-links?${q.toString()}`);
  },
  deleteSharedLink: (id: number) => api(`/admin/shared-links/${id}`, { method: "DELETE" }),

  // Favorites
  listFavorites: (params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/favorites?${q.toString()}`);
  },
  topFavorites: () => api("/admin/favorites/top"),

  // Play History
  listPlayHistory: (params?: { user_id?: number; track_id?: number; skip?: number; limit?: number; date_from?: string; date_to?: string }) => {
    const q = new URLSearchParams();
    if (params?.user_id) q.set("user_id", String(params.user_id));
    if (params?.track_id) q.set("track_id", String(params.track_id));
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    return api(`/admin/play-history?${q.toString()}`);
  },
  topPlayed: () => api("/admin/play-history/top"),

  // Analyses
  listAnalyses: (params?: { status?: string; track_id?: number; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.track_id) q.set("track_id", String(params.track_id));
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/analyses?${q.toString()}`);
  },
  analysisStats: () => api("/admin/analyses/stats"),

  // Smart Crates
  listSmartCrates: (params?: { skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/smart-crates?${q.toString()}`);
  },

  // ═══════════════ EMAIL TEMPLATES ═══════════════
  listEmailTemplates: (p?: any) => {
    const q = new URLSearchParams();
    if (p?.skip) q.set("skip", String(p.skip));
    if (p?.limit) q.set("limit", String(p.limit));
    if (p?.category) q.set("category", p.category);
    if (p?.is_active !== undefined) q.set("is_active", String(p.is_active));
    if (p?.search) q.set("search", p.search);
    return api(`/admin/email-templates?${q}`);
  },
  createEmailTemplate: (d: any) => api("/admin/email-templates", { method: "POST", body: d }),
  getEmailTemplate: (id: number) => api(`/admin/email-templates/${id}`),
  updateEmailTemplate: (id: number, d: any) => api(`/admin/email-templates/${id}`, { method: "PUT", body: d }),
  deleteEmailTemplate: (id: number) => api(`/admin/email-templates/${id}`, { method: "DELETE" }),
  duplicateEmailTemplate: (id: number) => api(`/admin/email-templates/${id}/duplicate`, { method: "POST" }),
  previewEmailTemplate: (id: number) => api(`/admin/email-templates/${id}/preview`, { method: "POST" }),
  sendTestEmail: (id: number, email: string) => api(`/admin/email-templates/${id}/send-test?recipient=${encodeURIComponent(email)}`, { method: "POST" }),
  emailSendHistory: (p?: any) => {
    const q = new URLSearchParams();
    if (p?.skip) q.set("skip", String(p.skip));
    if (p?.template_id) q.set("template_id", String(p.template_id));
    if (p?.status) q.set("status", p.status);
    return api(`/admin/email-send-history?${q}`);
  },
  emailStats: () => api("/admin/email-stats"),

  // ═══════════════ DRIP CAMPAIGNS ═══════════════
  listDripCampaigns: (p?: any) => api(`/admin/drip-campaigns?skip=${p?.skip||0}&limit=${p?.limit||50}`),
  createDripCampaign: (d: any) => api("/admin/drip-campaigns", { method: "POST", body: d }),
  getDripCampaign: (id: number) => api(`/admin/drip-campaigns/${id}`),
  updateDripCampaign: (id: number, d: any) => api(`/admin/drip-campaigns/${id}`, { method: "PUT", body: d }),
  deleteDripCampaign: (id: number) => api(`/admin/drip-campaigns/${id}`, { method: "DELETE" }),
  dripCampaignStats: (id: number) => api(`/admin/drip-campaigns/${id}/stats`),
  duplicateDripCampaign: (id: number) => api(`/admin/drip-campaigns/${id}/duplicate`, { method: "POST" }),
  listDripTriggers: () => api("/admin/drip-triggers"),

  // ═══════════════ PRICING PLANS ═══════════════
  listPricingPlans: () => api("/admin/pricing-plans"),
  createPricingPlan: (d: any) => api("/admin/pricing-plans", { method: "POST", body: d }),
  getPricingPlan: (id: number) => api(`/admin/pricing-plans/${id}`),
  updatePricingPlan: (id: number, d: any) => api(`/admin/pricing-plans/${id}`, { method: "PUT", body: d }),
  deletePricingPlan: (id: number) => api(`/admin/pricing-plans/${id}`, { method: "DELETE" }),
  reorderPricingPlans: (order: number[]) => api("/admin/pricing-plans/reorder", { method: "POST", body: order }),

  // ═══════════════ COUPONS ═══════════════
  listCoupons: (p?: any) => api(`/admin/coupons?skip=${p?.skip||0}&limit=${p?.limit||50}${p?.is_active !== undefined ? '&is_active='+p.is_active : ''}`),
  createCoupon: (d: any) => api("/admin/coupons", { method: "POST", body: d }),
  updateCoupon: (id: number, d: any) => api(`/admin/coupons/${id}`, { method: "PUT", body: d }),
  deleteCoupon: (id: number) => api(`/admin/coupons/${id}`, { method: "DELETE" }),

  // ═══════════════ INVOICES ═══════════════
  listInvoices: (p?: any) => {
    const q = new URLSearchParams();
    if (p?.skip) q.set("skip", String(p.skip));
    if (p?.limit) q.set("limit", String(p.limit));
    if (p?.user_id) q.set("user_id", String(p.user_id));
    if (p?.status) q.set("status", p.status);
    return api(`/admin/invoices?${q}`);
  },
  getInvoice: (id: number) => api(`/admin/invoices/${id}`),
  refundInvoice: (id: number, amount?: number) => api(`/admin/invoices/${id}/refund${amount ? '?amount='+amount : ''}`, { method: "POST" }),
  invoiceStats: () => api("/admin/invoices/stats/summary"),

  // ═══════════════ REVENUE ═══════════════
  revenueOverview: () => api("/admin/revenue/overview"),
  mrrHistory: (months?: number) => api(`/admin/revenue/mrr-history?months=${months||12}`),
  cohortAnalysis: () => api("/admin/revenue/cohort-analysis"),
  trialConversion: () => api("/admin/revenue/trial-conversion"),
  revenueBreakdown: () => api("/admin/revenue/new-expansion-churn"),

  // ═══════════════ SECURITY ═══════════════
  getAuthConfig: () => api("/admin/security/auth-config"),
  updateAuthConfig: (d: any) => api("/admin/security/auth-config", { method: "PUT", body: d }),
  getOAuthProviders: () => api("/admin/security/oauth-providers"),
  updateOAuthProviders: (d: any) => api("/admin/security/oauth-providers", { method: "PUT", body: d }),
  getRateLimitConfig: () => api("/admin/security/rate-limits"),
  updateRateLimitConfig: (d: any) => api("/admin/security/rate-limits", { method: "PUT", body: d }),
  getCorsConfig: () => api("/admin/security/cors"),
  updateCorsConfig: (d: any) => api("/admin/security/cors", { method: "PUT", body: d }),
  listIpRules: () => api("/admin/security/ip-rules"),
  createIpRule: (d: any) => api("/admin/security/ip-rules", { method: "POST", body: d }),
  deleteIpRule: (id: number) => api(`/admin/security/ip-rules/${id}`, { method: "DELETE" }),
  listActiveSessions: (p?: any) => api(`/admin/security/sessions?skip=${p?.skip||0}&limit=${p?.limit||50}`),
  forceLogoutSession: (id: number) => api(`/admin/security/sessions/${id}/logout`, { method: "POST" }),
  getCaptchaConfig: () => api("/admin/security/captcha"),
  updateCaptchaConfig: (d: any) => api("/admin/security/captcha", { method: "PUT", body: d }),
  get2FAConfig: () => api("/admin/security/2fa-config"),
  update2FAConfig: (d: any) => api("/admin/security/2fa-config", { method: "PUT", body: d }),
  securityAuditLog: (p?: any) => {
    const q = new URLSearchParams();
    if (p?.skip) q.set("skip", String(p.skip));
    if (p?.event_type) q.set("event_type", p.event_type);
    return api(`/admin/security/audit-log?${q}`);
  },

  // ═══════════════ BACKUPS ═══════════════
  listBackups: () => api("/admin/backups"),
  createBackup: () => api("/admin/backups", { method: "POST" }),
  getBackupConfig: () => api("/admin/backups/config"),
  updateBackupConfig: (d: any) => api("/admin/backups/config", { method: "PUT", body: d }),

  // ═══════════════ IMPORT DJ ═══════════════
  importDJ: (source: string, data: FormData) => api(`/admin/import-dj/${source}`, { method: "POST", body: data }),
  listImportHistory: () => api("/admin/import-dj/history"),
  getImportStatus: (id: number) => api(`/admin/import-dj/${id}/status`),
  getImportMappingConfig: () => api("/admin/import-dj/mapping-config"),
  updateImportMappingConfig: (d: any) => api("/admin/import-dj/mapping-config", { method: "PUT", body: d }),

  // ═══════════════ ONBOARDING ═══════════════
  listOnboardingSteps: () => api("/admin/onboarding/steps"),
  createOnboardingStep: (d: any) => api("/admin/onboarding/steps", { method: "POST", body: d }),
  updateOnboardingStep: (id: number, d: any) => api(`/admin/onboarding/steps/${id}`, { method: "PUT", body: d }),
  deleteOnboardingStep: (id: number) => api(`/admin/onboarding/steps/${id}`, { method: "DELETE" }),
  reorderOnboardingSteps: (order: number[]) => api("/admin/onboarding/steps/reorder", { method: "POST", body: order }),
  onboardingFunnelStats: () => api("/admin/onboarding/funnel-stats"),

  // ═══════════════ CMS AVANCÉ ═══════════════
  listPageTemplates: () => api("/admin/cms/page-templates"),
  createPageTemplate: (d: any) => api("/admin/cms/page-templates", { method: "POST", body: d }),
  updatePageTemplate: (id: number, d: any) => api(`/admin/cms/page-templates/${id}`, { method: "PUT", body: d }),
  deletePageTemplate: (id: number) => api(`/admin/cms/page-templates/${id}`, { method: "DELETE" }),
  duplicatePageTemplate: (id: number) => api(`/admin/cms/page-templates/${id}/duplicate`, { method: "POST" }),
  listLandingPages: (p?: any) => api(`/admin/cms/landing-pages?skip=${p?.skip||0}&limit=${p?.limit||50}${p?.search ? '&search='+p.search : ''}`),
  duplicateLandingPage: (id: number) => api(`/admin/cms/landing-pages/${id}/duplicate`, { method: "POST" }),
  listPageVersions: (pageId: number) => api(`/admin/cms/pages/${pageId}/versions`),
  createPageVersion: (pageId: number, note?: string) => api(`/admin/cms/pages/${pageId}/versions${note ? '?note='+encodeURIComponent(note) : ''}`, { method: "POST" }),
  restorePageVersion: (pageId: number, versionId: number) => api(`/admin/cms/pages/${pageId}/versions/${versionId}/restore`, { method: "POST" }),
  listVisibilityRules: (p?: any) => api(`/admin/cms/visibility-rules${p?.target_type ? '?target_type='+p.target_type : ''}`),
  createVisibilityRule: (d: any) => api("/admin/cms/visibility-rules", { method: "POST", body: d }),
  deleteVisibilityRule: (id: number) => api(`/admin/cms/visibility-rules/${id}`, { method: "DELETE" }),
  listContentBlocks: () => api("/admin/cms/content-blocks"),
  updateContentBlock: (id: number, d: any) => api(`/admin/cms/content-blocks/${id}`, { method: "PUT", body: d }),
  updatePageSeo: (pageId: number, d: any) => api(`/admin/cms/pages/${pageId}/seo`, { method: "PUT", body: d }),
  getSitemapConfig: () => api("/admin/cms/sitemap-config"),

  // ═══════════════ THEME ═══════════════
  getThemeConfig: () => api("/admin/theme/config"),
  updateThemeConfig: (d: any) => api("/admin/theme/config", { method: "PUT", body: d }),
  getButtonStyles: () => api("/admin/theme/button-styles"),
  updateButtonStyles: (d: any) => api("/admin/theme/button-styles", { method: "PUT", body: d }),
  getCardStyles: () => api("/admin/theme/card-styles"),
  updateCardStyles: (d: any) => api("/admin/theme/card-styles", { method: "PUT", body: d }),
  getAnimationConfig: () => api("/admin/theme/animation-config"),
  updateAnimationConfig: (d: any) => api("/admin/theme/animation-config", { method: "PUT", body: d }),
  getBreakpoints: () => api("/admin/theme/responsive-breakpoints"),
  updateBreakpoints: (d: any) => api("/admin/theme/responsive-breakpoints", { method: "PUT", body: d }),
  getDarkMode: () => api("/admin/theme/dark-mode"),
  updateDarkMode: (d: any) => api("/admin/theme/dark-mode", { method: "PUT", body: d }),
  getCssOverrides: () => api("/admin/theme/css-overrides"),
  updateCssOverrides: (css: string) => api("/admin/theme/css-overrides?css=" + encodeURIComponent(css), { method: "PUT" }),
  listThemePresets: () => api("/admin/theme/presets"),
  createThemePreset: (d: any) => api("/admin/theme/presets", { method: "POST", body: d }),
  deleteThemePreset: (id: number) => api(`/admin/theme/presets/${id}`, { method: "DELETE" }),
  applyThemePreset: (id: number) => api(`/admin/theme/presets/${id}/apply`, { method: "POST" }),
  exportTheme: () => api("/admin/theme/export"),
  importTheme: (d: any) => api("/admin/theme/import", { method: "POST", body: d }),

  // ═══════════════ AUTOMATION ═══════════════
  listAutomationTriggers: () => api("/admin/automation/triggers"),
  listAutomationActions: () => api("/admin/automation/actions"),
  listAutomationRules: (p?: any) => api(`/admin/automation/rules?skip=${p?.skip||0}&limit=${p?.limit||50}${p?.is_active !== undefined ? '&is_active='+p.is_active : ''}`),
  createAutomationRule: (d: any) => api("/admin/automation/rules", { method: "POST", body: d }),
  getAutomationRule: (id: number) => api(`/admin/automation/rules/${id}`),
  updateAutomationRule: (id: number, d: any) => api(`/admin/automation/rules/${id}`, { method: "PUT", body: d }),
  deleteAutomationRule: (id: number) => api(`/admin/automation/rules/${id}`, { method: "DELETE" }),
  toggleAutomationRule: (id: number) => api(`/admin/automation/rules/${id}/toggle`, { method: "POST" }),
  testAutomationRule: (id: number) => api(`/admin/automation/rules/${id}/test`, { method: "POST" }),
  duplicateAutomationRule: (id: number) => api(`/admin/automation/rules/${id}/duplicate`, { method: "POST" }),
  listAutomationLogs: (p?: any) => api(`/admin/automation/logs?skip=${p?.skip||0}&limit=${p?.limit||100}${p?.rule_id ? '&rule_id='+p.rule_id : ''}`),

  // ═══════════════ GAMIFICATION ═══════════════
  listBadges: () => api("/admin/gamification/badges"),
  createBadge: (d: any) => api("/admin/gamification/badges", { method: "POST", body: d }),
  updateBadge: (id: number, d: any) => api(`/admin/gamification/badges/${id}`, { method: "PUT", body: d }),
  deleteBadge: (id: number) => api(`/admin/gamification/badges/${id}`, { method: "DELETE" }),
  awardBadge: (badgeId: number, userId: number) => api(`/admin/gamification/badges/${badgeId}/award?user_id=${userId}`, { method: "POST" }),
  revokeBadge: (badgeId: number, userId: number) => api(`/admin/gamification/badges/${badgeId}/revoke/${userId}`, { method: "DELETE" }),
  getPointsConfig: () => api("/admin/gamification/points-config"),
  updatePointsConfig: (d: any) => api("/admin/gamification/points-config", { method: "PUT", body: d }),
  getStreakConfig: () => api("/admin/gamification/streak-config"),
  updateStreakConfig: (d: any) => api("/admin/gamification/streak-config", { method: "PUT", body: d }),
  getLeaderboard: (limit?: number) => api(`/admin/gamification/leaderboard?limit=${limit||20}`),
  getUserGamification: (userId: number) => api(`/admin/gamification/users/${userId}`),

  // ═══════════════ SEGMENTS ═══════════════
  listSegments: (p?: any) => api(`/admin/segments?skip=${p?.skip||0}&limit=${p?.limit||50}`),
  createSegment: (d: any) => api("/admin/segments", { method: "POST", body: d }),
  getSegment: (id: number) => api(`/admin/segments/${id}`),
  updateSegment: (id: number, d: any) => api(`/admin/segments/${id}`, { method: "PUT", body: d }),
  deleteSegment: (id: number) => api(`/admin/segments/${id}`, { method: "DELETE" }),
  refreshSegment: (id: number) => api(`/admin/segments/${id}/refresh`, { method: "POST" }),
  segmentMembers: (id: number) => api(`/admin/segments/${id}/members`),
  segmentOperators: () => api("/admin/segments/operators"),
  segmentFields: () => api("/admin/segments/available-fields"),

  // ═══════════════ FORMULAIRES ═══════════════
  listForms: (p?: any) => api(`/admin/forms?skip=${p?.skip||0}&limit=${p?.limit||50}${p?.form_type ? '&form_type='+p.form_type : ''}`),
  createForm: (d: any) => api("/admin/forms", { method: "POST", body: d }),
  getForm: (id: number) => api(`/admin/forms/${id}`),
  updateForm: (id: number, d: any) => api(`/admin/forms/${id}`, { method: "PUT", body: d }),
  deleteForm: (id: number) => api(`/admin/forms/${id}`, { method: "DELETE" }),
  duplicateForm: (id: number) => api(`/admin/forms/${id}/duplicate`, { method: "POST" }),
  formResponses: (id: number) => api(`/admin/forms/${id}/responses`),
  formStats: (id: number) => api(`/admin/forms/${id}/stats`),
  formFieldTypes: () => api("/admin/forms/field-types"),

  // ═══════════════ CHANGELOG ═══════════════
  listChangelog: (p?: any) => api(`/admin/changelog?skip=${p?.skip||0}&limit=${p?.limit||50}${p?.category ? '&category='+p.category : ''}`),
  createChangelog: (d: any) => api("/admin/changelog", { method: "POST", body: d }),
  updateChangelog: (id: number, d: any) => api(`/admin/changelog/${id}`, { method: "PUT", body: d }),
  deleteChangelog: (id: number) => api(`/admin/changelog/${id}`, { method: "DELETE" }),
  publishChangelog: (id: number) => api(`/admin/changelog/${id}/publish`, { method: "POST" }),

  // ═══════════════ STATUS PAGE ═══════════════
  listStatusServices: () => api("/admin/status-page/services"),
  createStatusService: (d: any) => api("/admin/status-page/services", { method: "POST", body: d }),
  updateStatusService: (id: number, d: any) => api(`/admin/status-page/services/${id}`, { method: "PUT", body: d }),
  deleteStatusService: (id: number) => api(`/admin/status-page/services/${id}`, { method: "DELETE" }),
  statusOverview: () => api("/admin/status-page/overview"),
  listIncidents: () => api("/admin/status-page/incidents"),
  createIncident: (d: any) => api("/admin/status-page/incidents", { method: "POST", body: d }),
  updateIncident: (id: number, d: any) => api(`/admin/status-page/incidents/${id}`, { method: "PUT", body: d }),
  addIncidentUpdate: (id: number, msg: string, status?: string) => api(`/admin/status-page/incidents/${id}/update?message=${encodeURIComponent(msg)}${status ? '&status='+status : ''}`, { method: "POST" }),

  // ═══════════════ WHITE LABEL ═══════════════
  getWhiteLabel: () => api("/admin/white-label/config"),
  updateWhiteLabel: (d: any) => api("/admin/white-label/config", { method: "PUT", body: d }),

  // ═══════════════ PWA ═══════════════
  getPwaConfig: () => api("/admin/pwa/config"),
  updatePwaConfig: (d: any) => api("/admin/pwa/config", { method: "PUT", body: d }),

  // ═══════════════ ACCESSIBILITÉ ═══════════════
  getAccessibility: () => api("/admin/accessibility/config"),
  updateAccessibility: (d: any) => api("/admin/accessibility/config", { method: "PUT", body: d }),

  // ═══════════════ DESKTOP ═══════════════
  getDesktopConfig: () => api("/admin/desktop/config"),
  updateDesktopConfig: (d: any) => api("/admin/desktop/config", { method: "PUT", body: d }),

  // ═══════════════ ENVIRONMENTS & FLAGS ═══════════════
  getEnvironments: () => api("/admin/environments"),
  updateEnvironments: (d: any) => api("/admin/environments", { method: "PUT", body: d }),
  getFeatureFlags: () => api("/admin/feature-flags"),
  updateFeatureFlags: (d: any) => api("/admin/feature-flags", { method: "PUT", body: d }),
  toggleFeatureFlag: (name: string) => api(`/admin/feature-flags/${name}/toggle`, { method: "PUT" }),

  // ═══════════════ CHURN PREVENTION ═══════════════
  getChurnConfig: () => api("/admin/churn/config"),
  updateChurnConfig: (d: any) => api("/admin/churn/config", { method: "PUT", body: d }),
  listAtRiskUsers: () => api("/admin/churn/at-risk"),
  computeChurnRisks: () => api("/admin/churn/compute", { method: "POST" }),
  updateChurnStatus: (id: number, status: string) => api(`/admin/churn/${id}/status?status=${status}`, { method: "PUT" }),
  churnStats: () => api("/admin/churn/stats"),

  // ═══════════════ DATA CLEANUP ═══════════════
  listCleanupJobs: () => api("/admin/data-cleanup/jobs"),
  runCleanup: (type: string) => api(`/admin/data-cleanup/run?job_type=${type}`, { method: "POST" }),
  availableCleanups: () => api("/admin/data-cleanup/available"),
  storageStats: () => api("/admin/data-cleanup/storage-stats"),

  // ═══════════════ NOTIFICATIONS CONFIG ═══════════════
  getNotifConfig: () => api("/admin/notifications/config"),
  updateNotifConfig: (d: any) => api("/admin/notifications/config", { method: "PUT", body: d }),

  // ═══════════════ SEO GLOBAL ═══════════════
  getGlobalSeo: () => api("/admin/seo/global"),
  updateGlobalSeo: (d: any) => api("/admin/seo/global", { method: "PUT", body: d }),

  // ═══════════════ LEGAL ═══════════════
  getLegalConfig: () => api("/admin/legal/config"),
  updateLegalConfig: (d: any) => api("/admin/legal/config", { method: "PUT", body: d }),

  // ═══════════════ INTEGRATIONS ═══════════════
  getIntegrations: () => api("/admin/integrations"),
  updateIntegrations: (d: any) => api("/admin/integrations", { method: "PUT", body: d }),
  updateIntegration: (provider: string, d: any) => api(`/admin/integrations/${provider}`, { method: "PUT", body: d }),

  // ═══════════════ A/B TESTING ═══════════════
  getABTests: (params?: any) => api("/admin/ab-tests", { params }),
  createABTest: (d: any) => api("/admin/ab-tests", { method: "POST", body: d }),
  getABTest: (id: number) => api(`/admin/ab-tests/${id}`),
  updateABTest: (id: number, d: any) => api(`/admin/ab-tests/${id}`, { method: "PUT", body: d }),
  deleteABTest: (id: number) => api(`/admin/ab-tests/${id}`, { method: "DELETE" }),
  startABTest: (id: number) => api(`/admin/ab-tests/${id}/start`, { method: "POST" }),
  stopABTest: (id: number) => api(`/admin/ab-tests/${id}/stop`, { method: "POST" }),
  pauseABTest: (id: number) => api(`/admin/ab-tests/${id}/pause`, { method: "POST" }),
  getABTestResults: (id: number) => api(`/admin/ab-tests/${id}/results`),
  duplicateABTest: (id: number) => api(`/admin/ab-tests/${id}/duplicate`, { method: "POST" }),
  getABTestsOverview: () => api("/admin/ab-tests/stats/overview"),

  // ═══════════════ HEATMAPS ═══════════════
  getHeatmaps: (params?: any) => api("/admin/heatmaps", { params }),
  createHeatmap: (d: any) => api("/admin/heatmaps", { method: "POST", body: d }),
  updateHeatmap: (id: number, d: any) => api(`/admin/heatmaps/${id}`, { method: "PUT", body: d }),
  deleteHeatmap: (id: number) => api(`/admin/heatmaps/${id}`, { method: "DELETE" }),
  getHeatmapData: (id: number, params?: any) => api(`/admin/heatmaps/${id}/data`, { params }),
  getHeatmapTypes: () => api("/admin/heatmaps/types"),

  // ═══════════════ SESSION RECORDINGS ═══════════════
  getSessionRecordings: (params?: any) => api("/admin/session-recordings", { params }),
  getSessionRecording: (id: number) => api(`/admin/session-recordings/${id}`),
  updateSessionRecording: (id: number, d: any) => api(`/admin/session-recordings/${id}`, { method: "PUT", body: d }),
  deleteSessionRecording: (id: number) => api(`/admin/session-recordings/${id}`, { method: "DELETE" }),
  getRecordingsOverview: () => api("/admin/session-recordings/stats/overview"),
  getRecordingConfig: () => api("/admin/session-recordings/config"),
  updateRecordingConfig: (d: any) => api("/admin/session-recordings/config", { method: "PUT", body: d }),

  // ═══════════════ EMAIL WORKFLOWS ═══════════════
  getEmailWorkflows: (params?: any) => api("/admin/email-workflows", { params }),
  createEmailWorkflow: (d: any) => api("/admin/email-workflows", { method: "POST", body: d }),
  getEmailWorkflow: (id: number) => api(`/admin/email-workflows/${id}`),
  updateEmailWorkflow: (id: number, d: any) => api(`/admin/email-workflows/${id}`, { method: "PUT", body: d }),
  deleteEmailWorkflow: (id: number) => api(`/admin/email-workflows/${id}`, { method: "DELETE" }),
  activateEmailWorkflow: (id: number) => api(`/admin/email-workflows/${id}/activate`, { method: "POST" }),
  pauseEmailWorkflow: (id: number) => api(`/admin/email-workflows/${id}/pause`, { method: "POST" }),
  duplicateEmailWorkflow: (id: number) => api(`/admin/email-workflows/${id}/duplicate`, { method: "POST" }),
  getWorkflowEnrollments: (id: number, params?: any) => api(`/admin/email-workflows/${id}/enrollments`, { params }),
  getWorkflowStats: (id: number) => api(`/admin/email-workflows/${id}/stats`),
  getWorkflowNodeTypes: () => api("/admin/email-workflows/node-types"),
  getWorkflowTriggerTypes: () => api("/admin/email-workflows/trigger-types"),

  // ═══════════════ RBAC ROLES ═══════════════
  getRoles: (params?: any) => api("/admin/roles", { params }),
  createRole: (d: any) => api("/admin/roles", { method: "POST", body: d }),
  getRole: (id: number) => api(`/admin/roles/${id}`),
  updateRole: (id: number, d: any) => api(`/admin/roles/${id}`, { method: "PUT", body: d }),
  deleteRole: (id: number) => api(`/admin/roles/${id}`, { method: "DELETE" }),
  getRoleUsers: (id: number) => api(`/admin/roles/${id}/users`),
  assignRole: (roleId: number, userId: number) => api(`/admin/roles/${roleId}/users`, { method: "POST", body: { user_id: userId } }),
  revokeRole: (roleId: number, userId: number) => api(`/admin/roles/${roleId}/users/${userId}`, { method: "DELETE" }),
  getPermissions: () => api("/admin/permissions"),

  // ═══════════════ AUDIT TRAIL ═══════════════
  getAuditLogs: (params?: any) => api("/admin/audit-logs", { params }),
  getAuditLog: (id: number) => api(`/admin/audit-logs/${id}`),
  getAuditStats: () => api("/admin/audit-logs/stats/overview"),
  getAuditActions: () => api("/admin/audit-logs/actions"),
  getAuditResourceTypes: () => api("/admin/audit-logs/resource-types"),
  exportAuditLogs: (params?: any) => api("/admin/audit-logs/export", { params }),
  cleanupAuditLogs: (days: number) => api(`/admin/audit-logs/cleanup?days=${days}`, { method: "DELETE" }),

  // ═══════════════ I18N ═══════════════
  getLocales: () => api("/admin/locales"),
  createLocale: (d: any) => api("/admin/locales", { method: "POST", body: d }),
  updateLocale: (id: number, d: any) => api(`/admin/locales/${id}`, { method: "PUT", body: d }),
  deleteLocale: (id: number) => api(`/admin/locales/${id}`, { method: "DELETE" }),
  setDefaultLocale: (id: number) => api(`/admin/locales/${id}/set-default`, { method: "POST" }),
  getTranslations: (params?: any) => api("/admin/translations", { params }),
  createTranslation: (d: any) => api("/admin/translations", { method: "POST", body: d }),
  updateTranslation: (id: number, d: any) => api(`/admin/translations/${id}`, { method: "PUT", body: d }),
  deleteTranslation: (id: number) => api(`/admin/translations/${id}`, { method: "DELETE" }),
  bulkUpdateTranslations: (d: any) => api("/admin/translations/bulk", { method: "POST", body: d }),
  exportTranslations: (locale: string) => api(`/admin/translations/export/${locale}`),
  importTranslations: (d: any) => api("/admin/translations/import", { method: "POST", body: d }),
  getTranslationNamespaces: () => api("/admin/translations/namespaces"),
  getTranslationStats: () => api("/admin/translations/stats"),

  // ═══════════════ FILE MANAGER ═══════════════
  getFiles: (params?: any) => api("/admin/files", { params }),
  createFile: (d: any) => api("/admin/files", { method: "POST", body: d }),
  updateFile: (id: number, d: any) => api(`/admin/files/${id}`, { method: "PUT", body: d }),
  deleteFile: (id: number) => api(`/admin/files/${id}`, { method: "DELETE" }),
  bulkDeleteFiles: (ids: number[]) => api("/admin/files/bulk-delete", { method: "POST", body: { ids } }),
  moveFile: (id: number, folder: string) => api(`/admin/files/${id}/move`, { method: "POST", body: { folder } }),
  getFileFolders: () => api("/admin/files/folders"),
  getFileStats: () => api("/admin/files/stats"),
  getCDNConfig: () => api("/admin/cdn/config"),
  updateCDNConfig: (d: any) => api("/admin/cdn/config", { method: "PUT", body: d }),
  purgeCDN: (urls?: string[]) => api("/admin/cdn/purge", { method: "POST", body: { urls } }),

  // ═══════════════ CRON JOBS ═══════════════
  getCronJobs: (params?: any) => api("/admin/cron-jobs", { params }),
  createCronJob: (d: any) => api("/admin/cron-jobs", { method: "POST", body: d }),
  updateCronJob: (id: number, d: any) => api(`/admin/cron-jobs/${id}`, { method: "PUT", body: d }),
  deleteCronJob: (id: number) => api(`/admin/cron-jobs/${id}`, { method: "DELETE" }),
  runCronJob: (id: number) => api(`/admin/cron-jobs/${id}/run`, { method: "POST" }),
  toggleCronJob: (id: number) => api(`/admin/cron-jobs/${id}/toggle`, { method: "POST" }),
  getCronJobLogs: (id: number) => api(`/admin/cron-jobs/${id}/logs`),
  getCronStats: () => api("/admin/cron-jobs/stats"),

  // ═══════════════ QUEUES ═══════════════
  getQueues: () => api("/admin/queues"),
  getQueueJobs: (params?: any) => api("/admin/queues/jobs", { params }),
  retryQueueJob: (id: number) => api(`/admin/queues/jobs/${id}/retry`, { method: "POST" }),
  deleteQueueJob: (id: number) => api(`/admin/queues/jobs/${id}`, { method: "DELETE" }),
  purgeDeadJobs: () => api("/admin/queues/purge-dead", { method: "POST" }),
  getQueueStats: () => api("/admin/queues/stats"),

  // ═══════════════ DASHBOARD WIDGETS ═══════════════
  getDashboardWidgets: () => api("/admin/dashboard-widgets"),
  createDashboardWidget: (d: any) => api("/admin/dashboard-widgets", { method: "POST", body: d }),
  updateDashboardWidget: (id: number, d: any) => api(`/admin/dashboard-widgets/${id}`, { method: "PUT", body: d }),
  deleteDashboardWidget: (id: number) => api(`/admin/dashboard-widgets/${id}`, { method: "DELETE" }),
  updateDashboardLayout: (widgets: any[]) => api("/admin/dashboard-widgets/layout", { method: "PUT", body: { widgets } }),
  resetDashboardLayout: () => api("/admin/dashboard-widgets/reset", { method: "POST" }),
  getWidgetTypes: () => api("/admin/dashboard-widgets/types"),

  // ═══════════════ PUSH NOTIFICATIONS ═══════════════
  getPushNotifications: (params?: any) => api("/admin/push-notifications", { params }),
  createPushNotification: (d: any) => api("/admin/push-notifications", { method: "POST", body: d }),
  updatePushNotification: (id: number, d: any) => api(`/admin/push-notifications/${id}`, { method: "PUT", body: d }),
  deletePushNotification: (id: number) => api(`/admin/push-notifications/${id}`, { method: "DELETE" }),
  sendPushNotification: (id: number) => api(`/admin/push-notifications/${id}/send`, { method: "POST" }),
  getPushStats: () => api("/admin/push-notifications/stats"),
  getPushConfig: () => api("/admin/push-notifications/config"),
  updatePushConfig: (d: any) => api("/admin/push-notifications/config", { method: "PUT", body: d }),

  // ═══════════════ SMS TEMPLATES ═══════════════
  getSMSTemplates: (params?: any) => api("/admin/sms-templates", { params }),
  createSMSTemplate: (d: any) => api("/admin/sms-templates", { method: "POST", body: d }),
  updateSMSTemplate: (id: number, d: any) => api(`/admin/sms-templates/${id}`, { method: "PUT", body: d }),
  deleteSMSTemplate: (id: number) => api(`/admin/sms-templates/${id}`, { method: "DELETE" }),

  // ═══════════════ SCHEDULED REPORTS ═══════════════
  getScheduledReports: (params?: any) => api("/admin/scheduled-reports", { params }),
  createScheduledReport: (d: any) => api("/admin/scheduled-reports", { method: "POST", body: d }),
  updateScheduledReport: (id: number, d: any) => api(`/admin/scheduled-reports/${id}`, { method: "PUT", body: d }),
  deleteScheduledReport: (id: number) => api(`/admin/scheduled-reports/${id}`, { method: "DELETE" }),
  generateReport: (id: number) => api(`/admin/scheduled-reports/${id}/generate`, { method: "POST" }),
  generateAdhocReport: (d: any) => api("/admin/reports/generate-now", { method: "POST", body: d }),
  getReportGenerations: () => api("/admin/reports/generations"),
  getReportTypes: () => api("/admin/reports/types"),

  // ═══════════════ IMPERSONATION ═══════════════
  startImpersonation: (userId: number, reason?: string) => api(`/admin/impersonate/${userId}`, { method: "POST", body: { reason } }),
  endImpersonation: (id: number) => api(`/admin/impersonate/${id}/end`, { method: "POST" }),
  getImpersonationLogs: () => api("/admin/impersonation-logs"),

  // ═══════════════ API USAGE ═══════════════
  getAPIUsage: (params?: any) => api("/admin/api-usage", { params }),
  getAPIUsageStats: () => api("/admin/api-usage/stats"),
  getAPIRateLimits: () => api("/admin/api-usage/rate-limits"),
  updateAPIRateLimits: (d: any) => api("/admin/api-usage/rate-limits", { method: "PUT", body: d }),

  // ═══════════════ REAL-TIME DASHBOARD ═══════════════
  getRealtimeStats: () => api("/admin/realtime/stats"),
  getRealtimeEvents: (params?: any) => api("/admin/realtime/events", { params }),
  getRealtimeConnections: () => api("/admin/realtime/connections"),
  getRealtimeGeographic: () => api("/admin/realtime/geographic"),

  // ═══════════════ FUNNEL ANALYSIS ═══════════════
  getFunnels: (params?: any) => api("/admin/funnels", { params }),
  getFunnel: (id: number) => api(`/admin/funnels/${id}`),
  createFunnel: (d: any) => api("/admin/funnels", { method: "POST", body: d }),
  updateFunnel: (id: number, d: any) => api(`/admin/funnels/${id}`, { method: "PUT", body: d }),
  deleteFunnel: (id: number) => api(`/admin/funnels/${id}`, { method: "DELETE" }),
  getFunnelResults: (id: number) => api(`/admin/funnels/${id}/results`),
  duplicateFunnel: (id: number) => api(`/admin/funnels/${id}/duplicate`, { method: "POST" }),
  getFunnelTemplates: () => api("/admin/funnels/templates"),

  // ═══════════════ COHORT ANALYSIS ═══════════════
  getCohorts: (params?: any) => api("/admin/cohorts", { params }),
  getCohort: (id: number) => api(`/admin/cohorts/${id}`),
  createCohort: (d: any) => api("/admin/cohorts", { method: "POST", body: d }),
  updateCohort: (id: number, d: any) => api(`/admin/cohorts/${id}`, { method: "PUT", body: d }),
  deleteCohort: (id: number) => api(`/admin/cohorts/${id}`, { method: "DELETE" }),
  getCohortResults: (id: number) => api(`/admin/cohorts/${id}/results`),
  getCohortPresets: () => api("/admin/cohorts/presets"),

  // ═══════════════ EVENT TRACKING ═══════════════
  getTrackedEvents: (params?: any) => api("/admin/events", { params }),
  getEventStats: () => api("/admin/events/stats"),
  getEventDefinitions: (params?: any) => api("/admin/events/definitions", { params }),
  getEventDefinition: (id: number) => api(`/admin/events/definitions/${id}`),
  createEventDefinition: (d: any) => api("/admin/events/definitions", { method: "POST", body: d }),
  updateEventDefinition: (id: number, d: any) => api(`/admin/events/definitions/${id}`, { method: "PUT", body: d }),
  deleteEventDefinition: (id: number) => api(`/admin/events/definitions/${id}`, { method: "DELETE" }),
  exportEvents: (d: any) => api("/admin/events/export", { method: "POST", body: d }),

  // ═══════════════ USER JOURNEYS ═══════════════
  getJourneys: (params?: any) => api("/admin/journeys", { params }),
  getJourney: (id: number) => api(`/admin/journeys/${id}`),
  createJourney: (d: any) => api("/admin/journeys", { method: "POST", body: d }),
  updateJourney: (id: number, d: any) => api(`/admin/journeys/${id}`, { method: "PUT", body: d }),
  deleteJourney: (id: number) => api(`/admin/journeys/${id}`, { method: "DELETE" }),
  getJourneyStats: (id: number) => api(`/admin/journeys/${id}/stats`),
  getJourneyUsers: (id: number) => api(`/admin/journeys/${id}/users`),

  // ═══════════════ CUSTOM REPORTS ═══════════════
  getCustomReports: (params?: any) => api("/admin/custom-reports", { params }),
  getCustomReport: (id: number) => api(`/admin/custom-reports/${id}`),
  createCustomReport: (d: any) => api("/admin/custom-reports", { method: "POST", body: d }),
  updateCustomReport: (id: number, d: any) => api(`/admin/custom-reports/${id}`, { method: "PUT", body: d }),
  deleteCustomReport: (id: number) => api(`/admin/custom-reports/${id}`, { method: "DELETE" }),
  runCustomReport: (id: number) => api(`/admin/custom-reports/${id}/run`, { method: "POST" }),
  scheduleCustomReport: (id: number, d: any) => api(`/admin/custom-reports/${id}/schedule`, { method: "POST", body: d }),

  // ═══════════════ BULK OPERATIONS ═══════════════
  bulkUserAction: (d: any) => api("/admin/bulk/users/action", { method: "POST", body: d }),
  bulkTrackAction: (d: any) => api("/admin/bulk/tracks/action", { method: "POST", body: d }),
  bulkEmailSend: (d: any) => api("/admin/bulk/emails/send", { method: "POST", body: d }),
  getBulkJobs: (params?: any) => api("/admin/bulk/jobs", { params }),
  getBulkJob: (id: number) => api(`/admin/bulk/jobs/${id}`),
  cancelBulkJob: (id: number) => api(`/admin/bulk/jobs/${id}`, { method: "DELETE" }),

  // ═══════════════ IMPORT / EXPORT ═══════════════
  importData: (d: any) => api("/admin/import-export/import", { method: "POST", body: d }),
  exportData: (type: string, params?: any) => api(`/admin/import-export/export/${type}`, { params }),
  getImportExportJobs: () => api("/admin/import-export/jobs"),
  getImportTemplates: () => api("/admin/import-export/templates"),
  getFieldMappings: () => api("/admin/import-export/mappings"),
  saveFieldMapping: (d: any) => api("/admin/import-export/mappings", { method: "POST", body: d }),

  // ═══════════════ ADVANCED SEARCH ═══════════════
  globalSearch: (d: any) => api("/admin/search/global", { method: "POST", body: d }),
  getRecentSearches: () => api("/admin/search/recent"),
  saveSearch: (d: any) => api("/admin/search/save", { method: "POST", body: d }),
  getSavedSearches: () => api("/admin/search/saved"),
  deleteSavedSearch: (id: number) => api(`/admin/search/saved/${id}`, { method: "DELETE" }),

  // ═══════════════ SYSTEM MONITORING ═══════════════
  getSystemMetrics: () => api("/admin/monitoring/system"),
  getDatabaseMetrics: () => api("/admin/monitoring/database"),
  getCacheMetrics: () => api("/admin/monitoring/cache"),
  getServicesStatus: () => api("/admin/monitoring/services"),
  getMetricsHistory: (params?: any) => api("/admin/monitoring/history", { params }),
  getActiveAlerts: () => api("/admin/monitoring/alerts"),
  getAlertRules: () => api("/admin/monitoring/alert-rules"),
  createAlertRule: (d: any) => api("/admin/monitoring/alert-rules", { method: "POST", body: d }),
  updateAlertRule: (id: number, d: any) => api(`/admin/monitoring/alert-rules/${id}`, { method: "PUT", body: d }),
  deleteAlertRule: (id: number) => api(`/admin/monitoring/alert-rules/${id}`, { method: "DELETE" }),

  // ═══════════════ ERROR TRACKING ═══════════════
  getErrors: (params?: any) => api("/admin/errors", { params }),
  getError: (id: number) => api(`/admin/errors/${id}`),
  getErrorStats: () => api("/admin/errors/stats"),
  resolveError: (id: number) => api(`/admin/errors/${id}/resolve`, { method: "POST" }),
  ignoreError: (id: number) => api(`/admin/errors/${id}/ignore`, { method: "POST" }),
  getErrorGroups: () => api("/admin/errors/groups"),

  // ═══════════════ PERFORMANCE ═══════════════
  getEndpointPerformance: () => api("/admin/performance/endpoints"),
  getSlowQueries: () => api("/admin/performance/database-queries"),
  getPerformanceOverview: () => api("/admin/performance/overview"),
  startProfiler: () => api("/admin/performance/profiler/start", { method: "POST" }),
  stopProfiler: () => api("/admin/performance/profiler/stop", { method: "POST" }),
  getProfilerResults: () => api("/admin/performance/profiler/results"),

  // ═══════════════ IN-APP NOTIFICATIONS ═══════════════
  getInAppNotifications: (params?: any) => api("/admin/in-app-notifications", { params }),
  getInAppNotification: (id: number) => api(`/admin/in-app-notifications/${id}`),
  createInAppNotification: (d: any) => api("/admin/in-app-notifications", { method: "POST", body: d }),
  updateInAppNotification: (id: number, d: any) => api(`/admin/in-app-notifications/${id}`, { method: "PUT", body: d }),
  deleteInAppNotification: (id: number) => api(`/admin/in-app-notifications/${id}`, { method: "DELETE" }),
  sendInAppNotification: (id: number) => api(`/admin/in-app-notifications/${id}/send`, { method: "POST" }),
  getInAppNotifStats: () => api("/admin/in-app-notifications/stats"),
  getAdminNotifFeed: () => api("/admin/in-app-notifications/feed"),

  // ═══════════════ ADVANCED SUBSCRIPTIONS ═══════════════
  getSubscriptionOverview: () => api("/admin/subscriptions-adv/overview"),
  getTrials: (params?: any) => api("/admin/subscriptions-adv/trials", { params }),
  extendTrial: (id: number, d: any) => api(`/admin/subscriptions-adv/trials/${id}/extend`, { method: "POST", body: d }),
  convertTrial: (id: number) => api(`/admin/subscriptions-adv/trials/${id}/convert`, { method: "POST" }),
  getUpgradeHistory: (params?: any) => api("/admin/subscriptions-adv/upgrades", { params }),
  changeSubscriptionPlan: (id: number, d: any) => api(`/admin/subscriptions-adv/${id}/change-plan`, { method: "POST", body: d }),
  applyDiscount: (id: number, d: any) => api(`/admin/subscriptions-adv/${id}/apply-discount`, { method: "POST", body: d }),
  pauseSubscription: (id: number) => api(`/admin/subscriptions-adv/${id}/pause`, { method: "POST" }),
  resumeSubscription: (id: number) => api(`/admin/subscriptions-adv/${id}/resume`, { method: "POST" }),
  cancelSubscription: (id: number, d: any) => api(`/admin/subscriptions-adv/${id}/cancel`, { method: "POST", body: d }),
  refundSubscription: (id: number, d: any) => api(`/admin/subscriptions-adv/${id}/refund`, { method: "POST", body: d }),
  getDunning: () => api("/admin/subscriptions-adv/dunning"),
  retryDunning: (id: number) => api(`/admin/subscriptions-adv/dunning/${id}/retry`, { method: "POST" }),
  getRevenueForecast: () => api("/admin/subscriptions-adv/revenue-forecast"),

  // ═══════════════ USER TIMELINE ═══════════════
  getUserTimeline: (userId: number, params?: any) => api(`/admin/user-timeline/${userId}`, { params }),
  getUserTimelineStats: (userId: number) => api(`/admin/user-timeline/${userId}/stats`),
  getUserSessions: (userId: number) => api(`/admin/user-timeline/${userId}/sessions`),
  addUserNote: (userId: number, d: any) => api(`/admin/user-timeline/${userId}/note`, { method: "POST", body: d }),
  getUserNotes: (userId: number) => api(`/admin/user-timeline/${userId}/notes`),
  getUserTags: (userId: number) => api(`/admin/user-timeline/${userId}/tags`),
  updateUserTags: (userId: number, d: any) => api(`/admin/user-timeline/${userId}/tags`, { method: "POST", body: d }),

  // ═══════════════ MULTI-ENVIRONMENT ═══════════════
  getEnvironments: () => api("/admin/environments"),
  getEnvironment: (id: number) => api(`/admin/environments/${id}`),
  createEnvironment: (d: any) => api("/admin/environments", { method: "POST", body: d }),
  updateEnvironment: (id: number, d: any) => api(`/admin/environments/${id}`, { method: "PUT", body: d }),
  deleteEnvironment: (id: number) => api(`/admin/environments/${id}`, { method: "DELETE" }),
  getEnvironmentStatus: (id: number) => api(`/admin/environments/${id}/status`),
  syncEnvironment: (id: number, d: any) => api(`/admin/environments/${id}/sync`, { method: "POST", body: d }),
  deployEnvironment: (id: number) => api(`/admin/environments/${id}/deploy`, { method: "POST" }),
  getEnvVariables: (id: number) => api(`/admin/environments/${id}/variables`),
  updateEnvVariables: (id: number, d: any) => api(`/admin/environments/${id}/variables`, { method: "PUT", body: d }),
  compareEnvironments: (params: any) => api("/admin/environments/compare", { params }),

  // ═══════════════ WEBHOOK TESTING ═══════════════
  getWebhookEndpoints: () => api("/admin/webhook-testing/endpoints"),
  testWebhook: (d: any) => api("/admin/webhook-testing/test", { method: "POST", body: d }),
  getWebhookLogs: (params?: any) => api("/admin/webhook-testing/logs", { params }),
  getWebhookLogDetail: (id: number) => api(`/admin/webhook-testing/logs/${id}`),
  replayWebhook: (id: number) => api(`/admin/webhook-testing/logs/${id}/replay`, { method: "POST" }),
  getWebhookEvents: () => api("/admin/webhook-testing/events"),

  // ═══════════════ ADMIN PREFERENCES ═══════════════
  getAdminPreferences: () => api("/admin/preferences"),
  updateAdminPreferences: (d: any) => api("/admin/preferences", { method: "PUT", body: d }),
  getAdminShortcuts: () => api("/admin/preferences/shortcuts"),
  updateAdminShortcuts: (d: any) => api("/admin/preferences/shortcuts", { method: "PUT", body: d }),
};
