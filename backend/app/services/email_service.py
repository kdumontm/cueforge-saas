import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://exquisite-art-production-f4c6.up.railway.app")

def send_reset_email(to_email: str, token: str) -> None:
    """Send password reset email."""
    if not SMTP_HOST or not SMTP_USER:
        raise ValueError("SMTP not configured")

    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "CueForge — Réinitialisation de ton mot de passe"
    msg["From"] = f"CueForge <{SMTP_FROM}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#2563eb">🎵 CueForge</h2>
      <p>Tu as demandé à réinitialiser ton mot de passe.</p>
      <a href="{reset_url}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;
                background:#2563eb;color:white;border-radius:8px;
                text-decoration:none;font-weight:bold">
        Réinitialiser mon mot de passe
      </a>
      <p style="color:#888;font-size:13px">
        Ce lien expire dans 1 heure.<br>
        Si tu n'as pas fait cette demande, ignore cet email.
      </p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())
