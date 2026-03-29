"""
Enhanced email service — REPLACES backend/app/services/email_service.py

Additions:
- Email verification emails
- Organization invite emails
- Configurable templates
"""
import logging
import os
import smtplib
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://exquisite-art-production-f4c6.up.railway.app",
)


def _send_email_sync(to_email: str, subject: str, html_body: str) -> None:
    """Low-level synchronous email sender."""
    if not SMTP_HOST or not SMTP_USER:
        raise ValueError("SMTP not configured")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"CueForge <{SMTP_FROM}>"
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


def _wrap_template(content: str) -> str:
    """Wrap email content in a consistent CueForge template."""
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#2563eb">🎵 CueForge</h2>
        {content}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:11px">
            CueForge — Audio analysis &amp; cue points for DJs
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
    _send_email(to_email, "CueForge — Réinitialisation de ton mot de passe", html)


# ─── Email verification (NEW) ────────────────────────────────


def send_verification_email(to_email: str, token: str) -> None:
    """Send email verification link after registration."""
    verify_url = f"{FRONTEND_URL}/verify-email?token={token}"
    html = _wrap_template(f"""
        <p>Bienvenue sur CueForge ! 🎧</p>
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
    _send_email(to_email, "CueForge — Vérifie ton email", html)


# ─── Organization invite (NEW) ───────────────────────────────


def send_invite_email(to_email: str, org_name: str, inviter_name: str, token: str) -> None:
    """Send organization invite email."""
    invite_url = f"{FRONTEND_URL}/invite/{token}"
    html = _wrap_template(f"""
        <p><strong>{inviter_name}</strong> t'invite à rejoindre
           <strong>{org_name}</strong> sur CueForge.</p>
        <a href="{invite_url}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Rejoindre l'équipe
        </a>
        <p style="color:#888;font-size:13px">
            Cette invitation expire dans 7 jours.
        </p>
    """)
    _send_email(to_email, f"CueForge — Invitation à rejoindre {org_name}", html)


# ─── Welcome email (NEW) ───────────────────────────────────


def send_welcome_email(to_email: str, name: str) -> None:
    """Send welcome email after email verification."""
    html = _wrap_template(f"""
        <p>Hey {name} ! 🎉</p>
        <p>Ton compte CueForge est maintenant vérifié et prêt.</p>
        <p>Voici ce que tu peux faire :</p>
        <ul style="color:#555;line-height:1.8">
            <li>📤 Upload tes tracks pour analyse AI</li>
            <li>🎯 Génère des cue points automatiquement</li>
            <li>💾 Exporte vers Rekordbox, VirtualDJ, etc.</li>
        </ul>
        <a href="{FRONTEND_URL}" style="display:inline-block;margin:16px 0;padding:12px 24px;
           background:#2563eb;color:white;border-radius:8px;
           text-decoration:none;font-weight:bold">
            Ouvrir CueForge
        </a>
    """)
    _send_email(to_email, "Bienvenue sur CueForge ! 🎵", html)
