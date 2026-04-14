"""
Enhanced email service — REPLACES backend/app/services/email_service.py

Additions:
- Email verification emails
- Organization invite emails
- Configurable templates
- Async wrapper for non-blocking email sends
"""
import logging
import os
import smtplib
import threading
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from concurrent.futures import ThreadPoolExecutor

from app.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()
SMTP_HOST = _settings.SMTP_HOST or ""
SMTP_PORT = _settings.SMTP_PORT
SMTP_USER = _settings.SMTP_USER or ""
SMTP_PASSWORD = _settings.SMTP_PASSWORD or ""
SMTP_FROM = _settings.SMTP_FROM or SMTP_USER
FRONTEND_URL = _settings.FRONTEND_URL


def _send_email_sync(to_email: str, subject: str, html_body: str) -> None:
    """Low-level synchronous email sender."""
    if not SMTP_HOST or not SMTP_USER:
        raise ValueError("SMTP not configured")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"TrackCue <{SMTP_FROM}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())



def _send_email(to_email: str, subject: str, html_body: str) -> None:
    """Fire-and-forget email sender (runs in a background thread)."""
    def _worker():
        try:
            _send_email_sync(to_email, subject, html_body)
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to_email, exc)
    threading.Thread(target=_worker, daemon=True).start()


async def send_email_async(to_email: str, subject: str, html_body: str) -> None:
    """Async email sender — offloads blocking SMTP to thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as executor:
        await loop.run_in_executor(
            executor,
            _send_email_sync,
            to_email, subject, html_body
        )


def _wrap_template(content: str) -> str:
    """Wrap email content in a consistent TrackCue template."""
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#2563eb">🎵 TrackCue</h2>
        {content}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:11px">
            TrackCue — Audio analysis &amp; cue points for DJs
        </p>
    </div>
    """


# ─── Password reset (existing) ─────────────────────────────────


def send_reset_email(to_email: str, token: str) -> None:
    """Send password reset email."""
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    html = _wrap_template(f"""
        <p>Tu as demandé à réinitialiser ton mot de passe.</p>
        <a href="{reset_url}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Réinitialiser mon mot de passe
        </a>
        <p style="color:#888;font-size:13px">
            Ce lien expire dans 1 heure.<br>
            Si tu n'as pas fait cette demande, ignore cet email.
        </p>
    """)
    _send_email(to_email, "TrackCue — Réinitialisation de ton mot de passe", html)


# ─── Email verification (NEW) ────────────────────────────────


def send_verification_email(to_email: str, token: str) -> None:
    """Send email verification link after registration."""
    verify_url = f"{FRONTEND_URL}/verify-email?token={token}"
    html = _wrap_template(f"""
        <p>Bienvenue sur TrackCue ! 🎧</p>
        <p>Confirme ton adresse email pour activer ton compte.</p>
        <a href="{verify_url}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Vérifier mon email
        </a>
        <p style="color:#888;font-size:13px">
            Ce lien expire dans 24 heures.
        </p>
    """)
    _send_email(to_email, "TrackCue — Vérifie ton email", html)


# ─── Organization invite (NEW) ───────────────────────────────


def send_invite_email(to_email: str, org_name: str, inviter_name: str, token: str) -> None:
    """Send organization invite email."""
    invite_url = f"{FRONTEND_URL}/invite/{token}"
    html = _wrap_template(f"""
        <p><strong>{inviter_name}</strong> t'invite à rejoindre
           <strong>{org_name}</strong> sur TrackCue.</p>
        <a href="{invite_url}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Rejoindre l'équipe
        </a>
        <p style="color:#888;font-size:13px">
            Cette invitation expire dans 7 jours.
        </p>
    """)
    _send_email(to_email, f"TrackCue — Invitation à rejoindre {org_name}", html)


# ─── Welcome email (NEW) ───────────────────────────────────────


def send_welcome_email(to_email: str, name: str) -> None:
    """Send welcome email after email verification."""
    html = _wrap_template(f"""
        <p>Hey {name} ! 🎉</p>
        <p>Ton compte TrackCue est maintenant vérifié et prêt.</p>
        <p>Voici ce que tu peux faire :</p>
        <ul style="color:#555;line-height:1.8">
            <li>📤 Upload tes tracks pour analyse AI</li>
            <li>🎯 Génère des cue points automatiquement</li>
            <li>💾 Exporte vers Rekordbox, VirtualDJ, etc.</li>
        </ul>
        <a href="{FRONTEND_URL}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Ouvrir TrackCue
        </a>
    """)
    _send_email(to_email, "Bienvenue sur TrackCue ! 🎵", html)


# ─── Analysis complete (NEW) ────────────────────────────────────


def send_analysis_complete_email(to_email: str, track_name: str) -> None:
    """Send email when track analysis completes."""
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: white;">🔍 Analyse terminée !</h2>
        <p>Ton track <strong>« {track_name} »</strong> a été analysé avec succès.</p>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 8px 0; color: #a855f7;"><strong>Les résultats sont maintenant disponibles :</strong></p>
            <ul style="margin: 12px 0; color: #e2e8f0; line-height: 1.8;">
                <li>🎵 BPM et clé détectés</li>
                <li>⚡ Énergie et dynamique analysées</li>
                <li>🎯 Cue points générés automatiquement</li>
            </ul>
        </div>
        <p style="color: #cbd5e1;">💡 <strong>Astuce pro :</strong> Utilise le Set Builder pour trouver des tracks compatibles en clé et BPM pour des transitions parfaites.</p>
        <div style="text-align: center; margin-top: 24px;">
            <a href="{FRONTEND_URL}/dashboard" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Voir l'analyse →
            </a>
        </div>
    </div>
    """
    _send_email(to_email, f"🎵 {track_name} — Analyse terminée", html)


# ─── Payment failed (NEW) ──────────────────────────────────────


def send_payment_failed_email(to_email: str, plan_name: str) -> None:
    """Send email when Stripe payment fails."""
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: #f87171;">⚠️ Paiement échoué</h2>
        <p>Nous n'avons pas pu traiter ton paiement pour le plan <strong>{plan_name}</strong>.</p>
        <div style="background: #1a1a2e; border-left: 4px solid #f87171; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #fca5a5;"><strong>Action requise</strong></p>
            <p style="margin: 8px 0; color: #e2e8f0;">Mets à jour tes informations de paiement pour continuer à profiter de TrackCue.</p>
        </div>
        <div style="text-align: center; margin-top: 24px;">
            <a href="{FRONTEND_URL}/billing" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Mettre à jour mon paiement →
            </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
            Si tu as des questions, <a href="mailto:support@trackcue.com" style="color: #a855f7; text-decoration: none;">contacte notre support</a>.
        </p>
    </div>
    """
    _send_email(to_email, "⚠️ Paiement échoué — Action requise", html)


# ─── Upgrade email (NEW) ───────────────────────────────────────


def send_upgrade_email(to_email: str, plan_name: str) -> None:
    """Send email when user upgrades their plan."""
    html = f"""
    <div style="font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a855f7; margin: 0;">TrackCue</h1>
        </div>
        <h2 style="color: white;">🚀 Bienvenue sur {plan_name} !</h2>
        <p>Ton upgrade est activé. Voici ce que tu peux maintenant utiliser :</p>
        <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <ul style="margin: 0; color: #e2e8f0; line-height: 2;">
                <li>✅ Analyses illimitées pour ce mois</li>
                <li>✅ Export vers Serato, Traktor, VirtualDJ</li>
                <li>✅ Lookup Spotify (pochettes & genres)</li>
                <li>✅ Export batch — toute ta bibliothèque</li>
                <li>✅ Support prioritaire</li>
            </ul>
        </div>
        <p style="color: #cbd5e1;">Merci de supporter TrackCue ! 🎉 Profite bien de ton nouveau plan.</p>
        <div style="text-align: center; margin-top: 24px;">
            <a href="{FRONTEND_URL}/dashboard" style="background: linear-gradient(135deg, #a855f7, #ec4899); color: white; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Accéder au dashboard →
            </a>
        </div>
    </div>
    """
    _send_email(to_email, f"🚀 Bienvenue sur le plan {plan_name} !", html)
