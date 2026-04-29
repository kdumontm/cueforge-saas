"""Service de notifications multi-canal — étape 11 du pipeline d'analyse.

Canaux supportés:
- IN-APP: toujours envoyé (Notification table)
- WEB PUSH: si user.notification_push_enabled (défaut True), placeholder VAPID
- EMAIL: si user.notification_email_enabled (défaut False, opt-in), placeholder
- WEBHOOK: si user.notification_webhook_url configuré (pro)

Toutes les fonctions sont best-effort. Aucune ne raise.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def send_in_app(db, user_id: int, title: str, message: str, link: Optional[str] = None, type_: str = "analysis_complete"):
    """Notif in-app — toujours envoyée."""
    try:
        from app.models.notification import Notification
        notif = Notification(
            user_id=user_id,
            type=type_,
            title=title,
            message=message,
            link=link,
        )
        db.add(notif)
        db.flush()
        return notif.id
    except Exception as e:
        logger.warning(f"[NOTIF-IN-APP] échec user={user_id}: {e}")
        return None


def send_web_push(user_id: int, title: str, message: str, link: Optional[str] = None) -> bool:
    """Web push — placeholder, log seulement (à brancher quand VAPID configuré)."""
    try:
        logger.info(f"[PUSH] user={user_id} title='{title[:40]}' (placeholder, à brancher VAPID)")
        return True
    except Exception:
        return False


def send_email(user_email: str, user_id: int, title: str, message: str, link: Optional[str] = None) -> bool:
    """Email — placeholder, log seulement (à brancher quand provider email configuré)."""
    try:
        logger.info(f"[EMAIL] to={user_email} user={user_id} title='{title[:40]}' (placeholder)")
        return True
    except Exception:
        return False


def send_webhook(webhook_url: str, payload: Dict[str, Any]) -> bool:
    """POST le payload au webhook configuré par le user (pro feature)."""
    if not webhook_url or not webhook_url.startswith("https://"):
        return False
    try:
        import requests
        resp = requests.post(webhook_url, json=payload, timeout=10)
        ok = resp.status_code < 400
        logger.info(f"[WEBHOOK] {'OK' if ok else 'FAIL'} status={resp.status_code} url={webhook_url[:60]}")
        return ok
    except Exception as e:
        logger.warning(f"[WEBHOOK] échec url={webhook_url[:60]}: {e}")
        return False


def notify_analysis_complete(db, user, track, track_stats: Optional[Dict[str, Any]] = None) -> None:
    """
    Notification multi-canal à la fin d'une analyse.

    Respecte les préférences user:
    - in-app TOUJOURS
    - push si notification_push_enabled (défaut True)
    - email si notification_email_enabled (défaut False, opt-in)
    - webhook si notification_webhook_url configuré (pro)

    Inclut stats récap (BPM, key, n_cues) et suggestions morceaux similaires.
    """
    try:
        # Stats récap pour le titre/message (idée C)
        bpm = (track_stats or {}).get("bpm")
        key = (track_stats or {}).get("key")
        n_cues = (track_stats or {}).get("n_cues") or 0

        details = []
        if bpm:
            try:
                details.append(f"{int(float(bpm))} BPM")
            except (TypeError, ValueError):
                pass
        if key:
            details.append(str(key))
        if n_cues:
            details.append(f"{n_cues} cues")
        details_str = " · ".join(details)

        track_name = (
            getattr(track, "title", None)
            or getattr(track, "original_filename", None)
            or f"Track #{getattr(track, 'id', '?')}"
        )

        title = "Track prêt"
        message = f"« {track_name} » est dispo dans ta library."
        if details_str:
            message += f"\n{details_str}"

        # Suggestions morceaux similaires (idée D, depuis étape 10)
        try:
            from app.models.track_analysis import TrackAnalysis
            import json as _json_d
            analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
            if analysis and getattr(analysis, "compatible_tracks", None):
                compat = analysis.compatible_tracks
                if isinstance(compat, str):
                    try:
                        compat = _json_d.loads(compat or "[]")
                    except Exception:
                        compat = []
                if compat and len(compat) >= 1:
                    top = compat[:3]
                    titles = ", ".join((c.get("title") or "?")[:30] for c in top if isinstance(c, dict))
                    if titles:
                        message += f"\n💡 S'enchaîne avec : {titles}"
        except Exception:
            pass

        link = f"/dashboard?track={getattr(track, 'id', '')}"

        # 1) IN-APP (toujours)
        send_in_app(db, user.id, title, message, link=link)

        # 2) PUSH (default activé)
        push_pref = getattr(user, "notification_push_enabled", True)
        if push_pref is not False:
            send_web_push(user.id, title, message, link=link)

        # 3) EMAIL (opt-in seulement)
        email_pref = getattr(user, "notification_email_enabled", False)
        user_email = getattr(user, "email", None)
        if email_pref and user_email:
            send_email(user_email, user.id, title, message, link=link)

        # 4) WEBHOOK (pro feature, si configuré)
        webhook_url = getattr(user, "notification_webhook_url", None)
        if webhook_url:
            payload = {
                "event": "analysis_complete",
                "user_id": user.id,
                "track": {
                    "id": getattr(track, "id", None),
                    "title": getattr(track, "title", None),
                    "artist": getattr(track, "artist", None),
                    "album": getattr(track, "album", None),
                    "genre": getattr(track, "genre", None),
                    "bpm": bpm,
                    "key": key,
                    "duration_ms": (track_stats or {}).get("duration_ms"),
                    "n_cues": n_cues,
                },
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            send_webhook(webhook_url, payload)
    except Exception as e:
        logger.warning(f"[NOTIFY-COMPLETE] échec user={getattr(user, 'id', '?')}: {e}")
