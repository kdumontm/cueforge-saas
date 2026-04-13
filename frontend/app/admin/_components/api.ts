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
  bulkUserAction: (action: string, userIds: number[], params?: any) =>
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
};
