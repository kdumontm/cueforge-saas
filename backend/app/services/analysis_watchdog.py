"""
Watchdog : détecte les tracks bloqués en 'pending' ou 'analyzing' depuis trop longtemps.

Lancé au boot de l'app via lifespan, tourne en boucle toutes les 5 minutes.
"""
import os
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

WATCHDOG_INTERVAL_SEC = 300  # 5 min
PENDING_TIMEOUT_MIN = 30      # un track 'pending' depuis > 30 min est bloqué
ANALYZING_TIMEOUT_MIN = 30    # idem
MAX_ATTEMPTS = 3              # après 3 tentatives → failed

def run_watchdog_once():
    """Une passe du watchdog."""
    from app.database import SessionLocal
    from app.models.track import Track, TrackStatus
    db = SessionLocal()
    try:
        cutoff_pending = datetime.utcnow() - timedelta(minutes=PENDING_TIMEOUT_MIN)
        cutoff_analyzing = datetime.utcnow() - timedelta(minutes=ANALYZING_TIMEOUT_MIN)

        stuck_pending = db.query(Track).filter(
            Track.status == TrackStatus.pending,
            Track.created_at < cutoff_pending,
        ).all()

        stuck_analyzing = db.query(Track).filter(
            Track.status == TrackStatus.analyzing,
            Track.updated_at < cutoff_analyzing,
        ).all()

        all_stuck = stuck_pending + stuck_analyzing
        if not all_stuck:
            logger.debug("[WATCHDOG] aucun track bloqué")
            return

        logger.info(f"[WATCHDOG] {len(all_stuck)} tracks bloqués détectés")
        for t in all_stuck:
            attempts = (getattr(t, 'analysis_attempts', 0) or 0)
            if attempts >= MAX_ATTEMPTS:
                t.status = TrackStatus.failed
                t.error_message = f"Analyse abandonnée après {attempts} tentatives (timeout)."
                logger.warning(f"[WATCHDOG] track {t.id} failed définitif")
            else:
                t.status = TrackStatus.pending
                if hasattr(t, 'analysis_attempts'):
                    t.analysis_attempts = attempts + 1
                logger.info(f"[WATCHDOG] track {t.id} relancé (attempt {attempts + 1}/{MAX_ATTEMPTS})")
                try:
                    import threading
                    from app.routers.tracks import _run_analysis
                    threading.Thread(target=_run_analysis, args=(t.id,), daemon=True).start()
                except Exception as e:
                    logger.warning(f"[WATCHDOG] relance échouée: {e}")
            db.commit()
    except Exception as e:
        logger.error(f"[WATCHDOG] erreur: {e}")
    finally:
        db.close()

def watchdog_loop():
    """Boucle infinie, lancée dans un thread daemon."""
    if os.environ.get("CUEFORGE_WATCHDOG_DISABLE") == "1":
        logger.info("[WATCHDOG] désactivé")
        return
    logger.info(f"[WATCHDOG] démarré")
    while True:
        try:
            run_watchdog_once()
        except Exception as e:
            logger.error(f"[WATCHDOG] erreur boucle: {e}")
        time.sleep(WATCHDOG_INTERVAL_SEC)
