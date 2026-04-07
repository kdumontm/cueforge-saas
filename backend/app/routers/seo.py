"""
SEO endpoints for CueForge.
"""
from fastapi import APIRouter
from fastapi.responses import FileResponse
import io
from PIL import Image, ImageDraw, ImageFont

router = APIRouter(prefix="/api/v1/seo", tags=["seo"])


@router.get("/og-image")
async def get_og_image(
    title: str = "CueForge",
    description: str = "Analyse audio pour DJs",
):
    """
    Generate an OpenGraph image dynamically or return a placeholder.
    For now, returns a simple SVG placeholder.
    """
    # Create a simple SVG OpenGraph image
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#grad)"/>

  <!-- Logo / Branding -->
  <circle cx="100" cy="80" r="40" fill="#a855f7"/>
  <text x="100" y="95" font-family="Arial, sans-serif" font-size="28" fill="white" text-anchor="middle" font-weight="bold">♫</text>

  <!-- Title -->
  <text x="150" y="60" font-family="Arial, sans-serif" font-size="48" fill="white" font-weight="bold">{title}</text>

  <!-- Description -->
  <text x="150" y="110" font-family="Arial, sans-serif" font-size="28" fill="#a0aec0">{description}</text>

  <!-- Footer -->
  <text x="600" y="600" font-family="Arial, sans-serif" font-size="18" fill="#64748b" text-anchor="middle">cueforge.app</text>
</svg>'''

    return FileResponse(
        io.BytesIO(svg_content.encode()),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"}
    )
