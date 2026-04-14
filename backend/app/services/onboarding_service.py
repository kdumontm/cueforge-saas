"""
Onboarding email sequence service.

Sends contextual emails based on user progress:
1. Welcome (immediate on register) — already handled by send_welcome_email
2. First upload tip (after first upload)
3. Analysis complete tip (after first analysis)
4. Upgrade nudge (3 days after register if still free)

Usage:
    from app.services.onboarding_service import send_first_upload_tip
    send_first_upload_tip("user@example.com", "My Track.mp3")
"""
import threading
from datetime import datetime, timedelta

from app.services.email_service import _send_email


def send_first_upload_tip(email: str, track_name: str) -> None:
    """Called after user's first successful upload.

    Args:
        email: User email address
        track_name: Name of the uploaded track
    """
    subject = "🎵 Ton premier track est prêt !"
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: white;">Ton premier track « {track_name} » est uploadé ! 🎉</h2>
        <p style="color: #cbd5e1;">Voici ce que tu peux faire maintenant :</p>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <ul style="margin: 0; color: #e2e8f0; line-height: 2;">
                <li><strong>🔍 Analyse automatique</strong> — BPM, clé, énergie détectés en quelques secondes</li>
                <li><strong>🎯 Cue points IA</strong> — Des repères générés automatiquement sur les drops et transitions</li>
                <li><strong>💾 Export Rekordbox</strong> — Importe directement dans ton logiciel DJ</li>
            </ul>
        </div>
        <div style="text-align: center; margin-top: 24px;">
            <a href="https://exquisite-art-production-f4c6.up.railway.app/dashboard" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Voir mon track →
            </a>
        </div>
    </div>
    """
    _send_email(email, subject, html)


def send_analysis_tip(email: str, bpm: float, key: str) -> None:
    """Called after user's first analysis completes.

    Args:
        email: User email address
        bpm: Detected BPM
        key: Detected musical key
    """
    subject = "🔍 Ton analyse est prête — voici les résultats"
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: white;">Analyse terminée !</h2>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 16px 0;">
            <p style="margin: 8px 0; color: #a855f7;"><strong>Résultats :</strong></p>
            <p style="margin: 8px 0; color: #e2e8f0;"><strong>BPM :</strong> {bpm:.1f}</p>
            <p style="margin: 8px 0; color: #e2e8f0;"><strong>Clé :</strong> {key}</p>
        </div>
        <p style="color: #cbd5e1;">💡 <strong>Astuce pro :</strong> Utilise le Set Builder pour trouver des tracks compatibles en clé et BPM pour des transitions parfaites.</p>
        <div style="text-align: center; margin-top: 24px;">
            <a href="https://exquisite-art-production-f4c6.up.railway.app/dashboard" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Explorer mes tracks →
            </a>
        </div>
    </div>
    """
    _send_email(email, subject, html)


def send_upgrade_nudge(email: str, name: str) -> None:
    """Called 3 days after registration if user is still on free plan.

    Args:
        email: User email address
        name: User's first name
    """
    subject = "🚀 Passe au niveau supérieur avec TrackCue Pro"
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: white;">Hey {name} 👋</h2>
        <p style="color: #cbd5e1;">Tu utilises TrackCue depuis quelques jours — voici ce que tu débloques avec <strong style="color: #a855f7;">Pro</strong> :</p>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <ul style="margin: 0; color: #e2e8f0; line-height: 2;">
                <li>🎯 <strong>50 analyses/jour</strong> (vs 5 en free)</li>
                <li>🔊 <strong>Export Serato + Traktor</strong> — tous les formats DJ</li>
                <li>🎵 <strong>Lookup Spotify</strong> — pochettes et genres auto</li>
                <li>📦 <strong>Export batch</strong> — toute ta bibliothèque en un clic</li>
                <li>⚡ <strong>Priorité d'analyse</strong> — résultats plus rapides</li>
            </ul>
        </div>
        <p style="color: #cbd5e1;">Profite d'une semaine gratuite pour tester Pro sans engagement.</p>
        <div style="text-align: center; margin-top: 24px;">
            <a href="https://exquisite-art-production-f4c6.up.railway.app/pricing" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Passer à Pro — 9,99€/mois →
            </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
            Pas intéressé ? <a href="https://exquisite-art-production-f4c6.up.railway.app/dashboard" style="color: #a855f7; text-decoration: none;">Retour au dashboard</a>
        </p>
    </div>
    """
    _send_email(email, subject, html)
