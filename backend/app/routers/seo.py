"""
SEO endpoints for TrackCue.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
import io
from datetime import datetime
from app.database import get_db
from app.models import BlogPost

router = APIRouter(prefix="/api/v1/seo", tags=["seo"])


@router.get("/og-image")
async def get_og_image(
    title: str = "TrackCue",
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
  <text x="600" y="600" font-family="Arial, sans-serif" font-size="18" fill="#64748b" text-anchor="middle">trackcue.app</text>
</svg>'''

    return FileResponse(
        io.BytesIO(svg_content.encode()),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"}
    )


@router.get("/sitemap.xml")
async def get_sitemap(db: Session = Depends(get_db)):
    """
    Generate dynamic sitemap from published blog posts in database.
    Includes static pages and all published articles.
    """
    # Static pages
    static_urls = [
        {"loc": "https://trackcue.app/", "lastmod": datetime.utcnow().isoformat(), "priority": "1.0"},
        {"loc": "https://trackcue.app/features", "lastmod": datetime.utcnow().isoformat(), "priority": "0.9"},
        {"loc": "https://trackcue.app/blog", "lastmod": datetime.utcnow().isoformat(), "priority": "0.8"},
        {"loc": "https://trackcue.app/pricing", "lastmod": datetime.utcnow().isoformat(), "priority": "0.8"},
    ]

    # Fetch all published blog posts from database
    posts = db.query(BlogPost).filter(BlogPost.published == True).all()
    blog_urls = [
        {
            "loc": f"https://trackcue.app/blog/{post.slug}",
            "lastmod": (post.published_at or post.created_at).isoformat() if hasattr(post, 'published_at') else datetime.utcnow().isoformat(),
            "priority": "0.7"
        }
        for post in posts
    ]

    # Build XML sitemap
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

    for url in static_urls + blog_urls:
        xml += f'  <url>\n'
        xml += f'    <loc>{url["loc"]}</loc>\n'
        xml += f'    <lastmod>{url["lastmod"]}</lastmod>\n'
        xml += f'    <priority>{url["priority"]}</priority>\n'
        xml += f'  </url>\n'

    xml += '</urlset>'

    return Response(content=xml, media_type="application/xml")
