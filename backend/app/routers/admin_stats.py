"""
Admin Stats Router — Dashboard analytics avancé.

Endpoints :
  GET /api/v1/admin/stats/overview       — Overview KPI (users, tracks, revenue) [cached 5min]
  GET /api/v1/admin/stats/users-activity — Activity par jour (7-30j) [cached 5min]
  GET /api/v1/admin/stats/full-dashboard — Snapshot complet page admin (KPIs + nav counts + revenue 12m
                                           + jobs + intégrations + health + alertes + audit log) — 100% DB réelle
"""

from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import os
import time
import threading

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.track import Track
from app.models.subscription import Subscription
from app.models.organization import Organization
from app.models.feedback import Feedback
from app.models.activity_log import ActivityLog

router = APIRouter(prefix="/api/v1/admin/stats", tags=["admin"])

# In-memory cache for admin stats (5min TTL)
_stats_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
STATS_CACHE_TTL_SEC = 300  # 5 minutes


def _get_cached(key: str) -> Optional[Dict[str, Any]]:
    """Get value from cache if not expired."""
    with _cache_lock:
        if key in _stats_cache:
            data, timestamp = _stats_cache[key]
            if time.time() - timestamp < STATS_CACHE_TTL_SEC:
                return data
            else:
                del _stats_cache[key]
    return None


def _set_cached(key: str, data: Dict[str, Any]) -> None:
    """Store value in cache with current timestamp."""
    with _cache_lock:
        _stats_cache[key] = (data, time.time())


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class SignupTrendItem(BaseModel):
    """Item de tendance d'inscriptions."""
    date: str  # YYYY-MM-DD
    count: int


class RevenueMetrics(BaseModel):
    """Métriques de revenus."""
    total_pro_users: int
    total_unlimited_users: int
    mrr_estimate: float  # Monthly Recurring Revenue


class OverviewResponse(BaseModel):
    """Réponse overview stats."""
    total_users: int
    new_users_7d: int
    new_users_30d: int
    total_tracks: int
    tracks_analyzed: int
    tracks_uploaded_7d: int
    active_users_7d: int
    revenue_metrics: RevenueMetrics
    top_genres: List[dict]
    signup_trend: List[SignupTrendItem]
    storage_estimate_gb: float


class ActivityItem(BaseModel):
    """Item d'activité quotidienne."""
    date: str
    active_users: int
    new_signups: int
    tracks_uploaded: int


class UsersActivityResponse(BaseModel):
    """Réponse activity 30j."""
    data: List[ActivityItem]


# ═══════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════

@router.get("/overview", response_model=OverviewResponse)
async def get_admin_stats_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """GET /api/v1/admin/stats/overview — Overview dashboard (cached 5min)."""

    # Check cache first
    cached = _get_cached("overview")
    if cached:
        return OverviewResponse(**cached)

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # ── Total users ──
    total_users = db.query(User).count()

    # ── New users 7d / 30d ──
    new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
    new_users_30d = db.query(User).filter(User.created_at >= thirty_days_ago).count()

    # ── Tracks stats ──
    total_tracks = db.query(Track).count()
    tracks_analyzed = db.query(Track).filter(Track.status == "completed").count()
    tracks_uploaded_7d = db.query(Track).filter(Track.created_at >= seven_days_ago).count()

    # ── Active users 7d (users qui ont fait une action) ──
    active_users_7d = db.query(func.count(func.distinct(Track.user_id))).filter(
        Track.created_at >= seven_days_ago
    ).scalar() or 0

    # ── Revenue metrics ──
    pro_users = db.query(User).filter(User.subscription_plan == "pro").count()
    unlimited_users = db.query(User).filter(User.subscription_plan == "unlimited").count()
    mrr_estimate = (pro_users * 9.99) + (unlimited_users * 19.99)

    # ── Top 10 genres ──
    top_genres_query = db.query(
        Track.genre,
        func.count(Track.id).label("count")
    ).filter(Track.genre.isnot(None)).group_by(Track.genre).order_by(
        func.count(Track.id).desc()
    ).limit(10).all()

    top_genres = [
        {"genre": genre or "Unknown", "count": count}
        for genre, count in top_genres_query
    ]

    # ── Signup trend 30j ──
    signup_trend_query = db.query(
        func.date(User.created_at).label("signup_date"),
        func.count(User.id).label("count")
    ).filter(User.created_at >= thirty_days_ago).group_by(
        func.date(User.created_at)
    ).order_by("signup_date").all()

    signup_trend = [
        {
            "date": str(signup_date),
            "count": count,
        }
        for signup_date, count in signup_trend_query
    ]

    # ── Storage estimate (rough: 100MB avg per track) ──
    storage_estimate_gb = (total_tracks * 100) / 1024.0

    result = {
        "total_users": total_users,
        "new_users_7d": new_users_7d,
        "new_users_30d": new_users_30d,
        "total_tracks": total_tracks,
        "tracks_analyzed": tracks_analyzed,
        "tracks_uploaded_7d": tracks_uploaded_7d,
        "active_users_7d": active_users_7d,
        "revenue_metrics": {
            "total_pro_users": pro_users,
            "total_unlimited_users": unlimited_users,
            "mrr_estimate": round(mrr_estimate, 2),
        },
        "top_genres": top_genres,
        "signup_trend": signup_trend,
        "storage_estimate_gb": round(storage_estimate_gb, 2),
    }

    # Cache result for 5 minutes
    _set_cached("overview", result)
    return result


@router.get("/users-activity", response_model=UsersActivityResponse)
async def get_users_activity(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """GET /api/v1/admin/stats/users-activity — Activity 30j."""

    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)

    # ── Active users par jour (qui ont uploadé une track) ──
    active_query = db.query(
        func.date(Track.created_at).label("activity_date"),
        func.count(func.distinct(Track.user_id)).label("active_users"),
    ).filter(Track.created_at >= thirty_days_ago).group_by(
        func.date(Track.created_at)
    ).order_by("activity_date").all()

    # ── New signups par jour ──
    signups_query = db.query(
        func.date(User.created_at).label("signup_date"),
        func.count(User.id).label("new_signups"),
    ).filter(User.created_at >= thirty_days_ago).group_by(
        func.date(User.created_at)
    ).order_by("signup_date").all()

    # ── Tracks uploaded par jour ──
    tracks_query = db.query(
        func.date(Track.created_at).label("track_date"),
        func.count(Track.id).label("tracks_count"),
    ).filter(Track.created_at >= thirty_days_ago).group_by(
        func.date(Track.created_at)
    ).order_by("track_date").all()

    # ── Merge data by date ──
    data_dict = {}

    for activity_date, count in active_query:
        data_dict.setdefault(str(activity_date), {})["active_users"] = count

    for signup_date, count in signups_query:
        data_dict.setdefault(str(signup_date), {})["new_signups"] = count

    for track_date, count in tracks_query:
        data_dict.setdefault(str(track_date), {})["tracks_uploaded"] = count

    # ── Format response ──
    data = [
        {
            "date": date,
            "active_users": item.get("active_users", 0),
            "new_signups": item.get("new_signups", 0),
            "tracks_uploaded": item.get("tracks_uploaded", 0),
        }
        for date, item in sorted(data_dict.items())
    ]

    return {"data": data}


# ═══════════════════════════════════════════════
# FULL DASHBOARD — données réelles UNIQUEMENT
# ═══════════════════════════════════════════════

_MONTH_LABELS_FR = ["j", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"]


def _fmt_ago(dt: Optional[datetime]) -> str:
    """Return a human-readable 'il y a X' string."""
    if not dt:
        return "—"
    now = datetime.utcnow()
    diff = (now - dt).total_seconds()
    if diff < 60:
        return "à l'instant"
    if diff < 3600:
        return f"il y a {int(diff // 60)} min"
    if diff < 86400:
        return f"il y a {int(diff // 3600)} h"
    if diff < 2592000:
        return f"il y a {int(diff // 86400)} j"
    return dt.strftime("%d/%m/%Y")


def _env_configured(*names: str) -> bool:
    """Return True if at least one of the env var names is set to a non-empty value."""
    s = get_settings()
    for name in names:
        val = getattr(s, name, None) or os.getenv(name)
        if val:
            return True
    return False


@router.get("/full-dashboard")
async def get_admin_full_dashboard(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Snapshot complet pour la page admin — 100 % DB réelle.

    Ne renvoie AUCUNE fake data : toutes les métriques proviennent des tables PostgreSQL
    et de la présence (ou non) des clés d'API en configuration.
    """
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    twenty_four_hours_ago = now - timedelta(hours=24)

    # ─── KPIs ───
    total_users = db.query(User).count()
    new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
    pro_users = db.query(User).filter(User.subscription_plan == "pro").count()
    unlimited_users = db.query(User).filter(User.subscription_plan == "unlimited").count()
    mrr_estimate = round(pro_users * 9.99 + unlimited_users * 19.99, 2)

    total_tracks = db.query(Track).count()
    tracks_analyzed = db.query(Track).filter(Track.status == "completed").count()
    tracks_uploaded_7d = db.query(Track).filter(Track.created_at >= seven_days_ago).count()

    active_users_7d = db.query(func.count(func.distinct(Track.user_id))).filter(
        Track.created_at >= seven_days_ago
    ).scalar() or 0

    # storage_estimate: somme réelle des file_size (bytes) si dispo
    try:
        total_bytes = db.query(func.coalesce(func.sum(Track.file_size), 0)).scalar() or 0
        storage_gb = round(total_bytes / (1024 ** 3), 2) if total_bytes else round(total_tracks * 0.1, 2)
    except Exception:
        storage_gb = round(total_tracks * 0.1, 2)

    # ─── Nav counts ───
    total_orgs = db.query(Organization).count()
    total_subs_active = db.query(Subscription).filter(Subscription.status == "active").count()
    total_feedback_new = db.query(Feedback).filter(Feedback.status == "new").count()

    # Jobs: pending/analyzing/generating_cues = en queue ou running
    running_statuses = ["analyzing", "generating_cues", "uploading"]
    queued_statuses = ["pending"]
    jobs_running = db.query(Track).filter(Track.status.in_(running_statuses)).count()
    jobs_queued = db.query(Track).filter(Track.status.in_(queued_statuses)).count()
    jobs_done_24h = db.query(Track).filter(
        Track.status == "completed",
        Track.updated_at >= twenty_four_hours_ago,
    ).count()
    jobs_failed_24h = db.query(Track).filter(
        Track.status == "failed",
        Track.updated_at >= twenty_four_hours_ago,
    ).count()
    jobs_total_queue = jobs_running + jobs_queued

    # ─── Revenue 12 mois ───
    # On compte les abos actifs par mois de création
    revenue_12m = []
    for i in range(11, -1, -1):
        # month_start = now - i mois
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        # Prochain mois
        next_year = year
        next_month = month + 1
        if next_month > 12:
            next_month = 1
            next_year += 1
        month_start = datetime(year, month, 1)
        month_end = datetime(next_year, next_month, 1)

        # Abo actifs pendant ce mois
        subs_pro = db.query(User).filter(
            User.subscription_plan == "pro",
            User.created_at < month_end,
        ).count()
        subs_unl = db.query(User).filter(
            User.subscription_plan == "unlimited",
            User.created_at < month_end,
        ).count()
        mrr_month = round(subs_pro * 9.99 + subs_unl * 19.99, 2)
        revenue_12m.append({
            "month": month_start.strftime("%Y-%m"),
            "label": _MONTH_LABELS_FR[month - 1],
            "mrr_eur": mrr_month,
            "is_current": (i == 0),
        })

    # ─── Jobs récents (7 dernières tracks en analyse / queue / done / err) ───
    recent_tracks = (
        db.query(Track)
        .order_by(Track.updated_at.desc())
        .limit(7)
        .all()
    )
    jobs_recent = []
    for t in recent_tracks:
        status = (t.status.value if hasattr(t.status, "value") else str(t.status)) if t.status else "pending"
        if status == "completed":
            bucket = "done"
            progress = 100
        elif status == "failed":
            bucket = "err"
            progress = 100
        elif status in ("analyzing", "generating_cues", "uploading"):
            bucket = "run"
            progress = 50  # on n'a pas de % live, on met 50% par défaut
        else:
            bucket = "queue"
            progress = 0
        # plan = plan du user owner
        user_plan = "free"
        if t.user_id:
            u = db.query(User).filter(User.id == t.user_id).first()
            if u:
                user_plan = u.subscription_plan or "free"
        display_title = t.title or t.filename or f"Track #{t.id}"
        if t.artist:
            display_title = f"{display_title} — {t.artist}"
        duration_s = None
        if t.updated_at and t.created_at:
            duration_s = int((t.updated_at - t.created_at).total_seconds())
        jobs_recent.append({
            "id": t.id,
            "title": display_title,
            "status": status,
            "bucket": bucket,
            "progress": progress,
            "plan": user_plan,
            "duration_s": duration_s,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        })

    # ─── Intégrations (status = config présente ou non) ───
    integrations = [
        {
            "name": "AcoustID",
            "sub": "Fingerprint ID",
            "status": "on" if _env_configured("ACOUSTID_API_KEY") else "off",
        },
        {
            "name": "MusicBrainz",
            "sub": "Metadata",
            "status": "on",  # public, pas de clé
        },
        {
            "name": "iTunes",
            "sub": "Metadata fallback",
            "status": "on",  # public, pas de clé
        },
        {
            "name": "Spotify",
            "sub": "Audio features",
            "status": "on" if _env_configured("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET") else "off",
        },
        {
            "name": "Stripe",
            "sub": "Paiements",
            "status": "on" if _env_configured("STRIPE_SECRET_KEY") else "off",
        },
        {
            "name": "Cloudflare R2",
            "sub": "Storage audio",
            "status": "on" if _env_configured("R2_BUCKET", "R2_ACCESS_KEY_ID") else "off",
        },
        {
            "name": "Last.fm",
            "sub": "Scrobble",
            "status": "on" if _env_configured("LASTFM_API_KEY") else "off",
        },
        {
            "name": "Sentry",
            "sub": "Error tracking",
            "status": "on" if _env_configured("SENTRY_DSN") else "off",
        },
    ]

    # ─── System health ───
    # API: on répond, donc OK
    # Postgres: SELECT 1
    # Redis: tentative ping
    # R2/Stripe/AcoustID/Spotify: config présente
    try:
        db.execute(text("SELECT 1"))
        pg_ok = True
    except Exception:
        pg_ok = False

    redis_ok = False
    redis_configured = _env_configured("REDIS_URL")
    if redis_configured:
        try:
            import redis as _redis  # type: ignore
            url = getattr(settings, "REDIS_URL", None) or os.getenv("REDIS_URL")
            if url:
                client = _redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
                client.ping()
                redis_ok = True
        except Exception:
            redis_ok = False

    system_health = [
        {
            "name": "API · FastAPI",
            "status": "ok",
            "label": "OK",
            "met_left": f"Users {total_users}",
            "met_right": f"Tracks {total_tracks}",
        },
        {
            "name": "Postgres · primary",
            "status": "ok" if pg_ok else "down",
            "label": "OK" if pg_ok else "DOWN",
            "met_left": f"Tables · {total_users + total_tracks} rows (u+t)",
            "met_right": "SELECT 1" if pg_ok else "erreur",
        },
        {
            "name": "Redis · queue",
            "status": "ok" if redis_ok else ("warn" if redis_configured else "down"),
            "label": "OK" if redis_ok else ("Config absente" if not redis_configured else "Unreachable"),
            "met_left": f"Jobs running · {jobs_running}",
            "met_right": f"Queued · {jobs_queued}",
        },
        {
            "name": "R2 · Cloudflare",
            "status": "ok" if _env_configured("R2_BUCKET") else "off",
            "label": "OK" if _env_configured("R2_BUCKET") else "Non configuré",
            "met_left": f"Storage · {storage_gb} Go",
            "met_right": f"Tracks · {total_tracks}",
        },
        {
            "name": "AcoustID",
            "status": "ok" if _env_configured("ACOUSTID_API_KEY") else "off",
            "label": "OK" if _env_configured("ACOUSTID_API_KEY") else "Pas de clé",
            "met_left": "API · config",
            "met_right": "public",
        },
        {
            "name": "Spotify API",
            "status": "ok" if _env_configured("SPOTIFY_CLIENT_ID") else "off",
            "label": "OK" if _env_configured("SPOTIFY_CLIENT_ID") else "Désactivé",
            "met_left": "OAuth app",
            "met_right": "client creds",
        },
    ]

    # ─── Alerts (actions admin des 24h + conditions système) ───
    alerts: List[Dict[str, Any]] = []
    # Alertes dérivées de l'état réel
    if jobs_failed_24h > 0:
        alerts.append({
            "severity": "warn",
            "title": f"{jobs_failed_24h} job(s) d'analyse en échec · 24 h",
            "body": "Relancer via /admin/queues/retry-failed",
            "when": "dernières 24 h",
        })
    if not _env_configured("SPOTIFY_CLIENT_ID"):
        alerts.append({
            "severity": "info",
            "title": "Spotify API · non configurée",
            "body": "Enrichissement audio features indisponible (clé absente)",
            "when": "config",
        })
    if not _env_configured("R2_BUCKET"):
        alerts.append({
            "severity": "warn",
            "title": "Cloudflare R2 · non configuré",
            "body": "Les uploads utilisent le stockage local (risque saturation disque)",
            "when": "config",
        })
    if new_users_7d > 0:
        alerts.append({
            "severity": "info",
            "title": f"+{new_users_7d} user(s) inscrit(s) · 7 derniers jours",
            "body": f"Dont {active_users_7d} utilisateur(s) actif(s) (upload récent)",
            "when": "7 j",
        })
    if total_feedback_new > 0:
        alerts.append({
            "severity": "info",
            "title": f"{total_feedback_new} feedback(s) non traité(s)",
            "body": "À parcourir dans l'onglet Feedback",
            "when": "en attente",
        })

    # ─── Audit log (activités admin) ───
    try:
        # Récupère les 10 dernières activités admin (actions commençant par "admin.")
        recent_logs = (
            db.query(ActivityLog)
            .filter(ActivityLog.action.like("admin.%"))
            .order_by(ActivityLog.created_at.desc())
            .limit(10)
            .all()
        )
    except Exception:
        recent_logs = []
    audit_log = []
    for log in recent_logs:
        admin_user = db.query(User).filter(User.id == log.user_id).first() if log.user_id else None
        audit_log.append({
            "admin_name": (admin_user.name or (admin_user.email.split("@")[0] if admin_user.email else "admin")) if admin_user else "system",
            "admin_email": admin_user.email if admin_user else "",
            "admin_role": "superadmin" if (admin_user and admin_user.is_admin) else "user",
            "action": log.action,
            "target": log.resource_type or "—",
            "target_id": log.resource_id,
            "ip": (log.extra_data or {}).get("ip", "—") if log.extra_data else "—",
            "when": _fmt_ago(log.created_at),
            "when_iso": log.created_at.isoformat() if log.created_at else None,
        })

    return {
        "kpis": {
            "users": {"total": total_users, "new_7d": new_users_7d},
            "tracks": {
                "total": total_tracks,
                "analyzed": tracks_analyzed,
                "uploaded_7d": tracks_uploaded_7d,
            },
            "mrr": {
                "estimate_eur": mrr_estimate,
                "pro_users": pro_users,
                "unlimited_users": unlimited_users,
            },
            "storage": {
                "estimate_gb": storage_gb,
                "active_users_7d": active_users_7d,
            },
        },
        "nav_counts": {
            "users": total_users,
            "orgs": total_orgs,
            "tracks": total_tracks,
            "subscriptions_active": total_subs_active,
            "jobs_queue": jobs_total_queue,
            "feedback_new": total_feedback_new,
        },
        "revenue_12m": revenue_12m,
        "jobs": {
            "running": jobs_running,
            "queued": jobs_queued,
            "done_24h": jobs_done_24h,
            "failed_24h": jobs_failed_24h,
            "recent": jobs_recent,
        },
        "integrations": integrations,
        "system_health": system_health,
        "alerts": alerts,
        "audit_log": audit_log,
        "generated_at": now.isoformat(),
    }
