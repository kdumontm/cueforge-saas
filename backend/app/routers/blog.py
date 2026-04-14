"""
API Router — Blog

Endpoints pour la gestion des articles de blog publics.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database import get_db
from app.models import BlogPost, User
from app.middleware.auth import get_current_user
from app.schemas.blog_post import (
    BlogPostCreate,
    BlogPostUpdate,
    BlogPostResponse,
    BlogPostDetailResponse,
)

router = APIRouter(prefix="/api/v1/blog", tags=["blog"])

# In-memory cache for blog posts (10 min TTL)
_blog_cache: dict = {"posts": None, "timestamp": None, "ttl_seconds": 600}

# Default seed articles
DEFAULT_ARTICLES = [
    {
        "title": "Comment analyser vos tracks comme un pro",
        "slug": "analyser-tracks-comme-pro",
        "excerpt": "Découvrez les techniques essentielles pour analyser vos morceaux avec TrackCue et préparer vos sets comme un vrai professionnel.",
        "content": """# Comment analyser vos tracks comme un pro

Analyser vos tracks est une étape cruciale pour tout DJ moderne. Avec TrackCue, vous pouvez extraire automatiquement les informations essentielles de vos morceaux et préparer vos sets efficacement.

## Les étapes clés

### 1. Téléchargement et importation
Importez vos fichiers audio (MP3, WAV, FLAC) dans TrackCue. L'application détecte automatiquement le BPM, la tonalité et l'énergie de chaque morceau.

### 2. Identification du métadonnées
Utilisez le service d'identification automatique pour récupérer les informations depuis MusicBrainz, Spotify et iTunes. Cela vous permet de maintenir votre bibliothèque bien organisée.

### 3. Configuration des cue points
Placez vos cue points aux moments clés : intro, drop, breakdown, outro. Utilisez les templates prédéfinis pour standardiser votre workflow.

### 4. Tagging et organisation
Ajoutez des tags personnalisés et des notes pour retrouver rapidement vos tracks pendant vos sets.

## Pro tips

- Utilisez l'auto-analyse pour gagner du temps sur les grandes bibliothèques
- Créez des templates personnalisés adaptés à votre style musical
- Synchronisez vos données avec votre logiciel DJ préféré

Commencez dès maintenant et optimisez votre préparation de sets!
""",
        "author": "TrackCue Team",
        "cover_image_url": None,
        "tags": ["tutoriel", "analyse", "tips"],
        "published": True,
        "published_at": datetime.utcnow(),
    },
    {
        "title": "Les 10 erreurs de préparation de set les plus courantes",
        "slug": "erreurs-preparation-set",
        "excerpt": "Évitez les pièges courants lors de la préparation de votre set. Découvrez les erreurs que font les DJs débutants et comment les corriger.",
        "content": """# Les 10 erreurs de préparation de set les plus courantes

Même les DJs expérimentés font des erreurs lors de la préparation de leurs sets. Voici les 10 pièges les plus courants et comment les éviter.

## 1. Ne pas analyser complètement le track
Ne pas vérifier le BPM, la tonalité et la structure d'un morceau peut conduire à des transitions ratées lors du set.

## 2. Ignorer les transitions harmoniques
Vérifiez toujours la tonalité de vos morceaux pour des transitions fluides et naturelles.

## 3. Trop de morceaux similaires
Variez les tempos et les styles pour maintenir l'intérêt du public.

## 4. Placer mal les cue points
Les cue points mal placés rendent les transitions difficiles. Placez-les aux points clés : intro, drop, breakdown.

## 5. Négliger le timing
Assurez-vous que chaque morceau a le temps suffisant pour se développer avant la transition.

## 6. Pas de backup plans
Ayez toujours plusieurs versions d'un morceau et des alternatives prêtes.

## 7. Négliger l'énergie du set
Construisez progressivement l'énergie — n'allez pas trop vite au début.

## 8. Ignorer le public
Lisez la salle et adaptez votre set en fonction de la réaction du public.

## 9. Pas de test avant le set
Testez toujours votre setup et vos transitions avant le vrai set.

## 10. Oublier l'enregistrement
Enregistrez votre set pour l'analyser et vous améliorer ensuite.

Évitez ces erreurs et vos sets seront beaucoup plus fluides et professionnels!
""",
        "author": "TrackCue Team",
        "cover_image_url": None,
        "tags": ["tips", "dj-technique", "set-preparation"],
        "published": True,
        "published_at": datetime.utcnow(),
    },
    {
        "title": "Nouveautés TrackCue v2 : tout ce qui change",
        "slug": "trackcue-v2-nouveautes",
        "excerpt": "TrackCue version 2 est là! Découvrez les nouvelles fonctionnalités, les améliorations de performance et tout ce que nous avons changé.",
        "content": """# Nouveautés TrackCue v2 : tout ce qui change

Nous sommes heureux d'annoncer le lancement de **TrackCue v2**, la version la plus ambitieuse à ce jour. Voici un aperçu des changements majeurs.

## Interface redessinée

La nouvelle interface est plus claire, plus rapide et plus intuitive. Nous avons écouté vos retours pour créer une expérience vraiment exceptionnelle.

## Virtual scrolling pour les grandes bibliothèques

Analysez maintenant jusqu'à des milliers de tracks sans ralentissement. Le virtual scrolling optimise les performances sur les listes géantes.

## Templates de cue points

Créez une fois, réutilisez partout. Les templates vous permettent de standardiser vos configurations et gagner des heures de travail.

## Pages de blog intégrées

Lisez nos derniers articles et guides directement dans l'app. Restez informé des meilleures pratiques.

## Meilleure intégration des services

Nous avons amélioré l'intégration avec Spotify, MusicBrainz et iTunes pour une identification plus précise.

## Performance

v2 est 3x plus rapide. Grâce aux optimisations du backend et du frontend, l'analyse et le tri sont instantanés.

## Quoi de neuf ensuite?

Nous travaillons sur :
- L'intégration Rekordbox native
- L'IA pour les suggestions de transition
- Les stats avancées de vos sets

Merci pour votre confiance et vos retours!
""",
        "author": "TrackCue Team",
        "cover_image_url": None,
        "tags": ["release-notes", "announcement", "v2"],
        "published": True,
        "published_at": datetime.utcnow(),
    },
]


def ensure_default_articles(db: Session):
    """Crée les articles par défaut s'ils n'existent pas."""
    for article_data in DEFAULT_ARTICLES:
        existing = db.query(BlogPost).filter(
            BlogPost.slug == article_data["slug"]
        ).first()
        if not existing:
            new_article = BlogPost(
                title=article_data["title"],
                slug=article_data["slug"],
                excerpt=article_data.get("excerpt"),
                content=article_data["content"],
                author=article_data.get("author"),
                cover_image_url=article_data.get("cover_image_url"),
                tags=article_data.get("tags", []),
                published=article_data.get("published", False),
                published_at=article_data.get("published_at"),
            )
            db.add(new_article)
    db.commit()


@router.get("", response_model=List[BlogPostResponse])
async def list_blog_posts(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    tag: str = Query(None),
):
    """
    Lister les articles de blog publiés (sans authentification).
    Pagination et filtrage par tag optionnel.
    Utilise cache en mémoire avec TTL de 10 minutes.
    """
    ensure_default_articles(db)

    # Check cache validity (10 min TTL)
    now = datetime.utcnow()
    cache_valid = (
        _blog_cache["posts"] is not None and
        _blog_cache["timestamp"] is not None and
        (now - _blog_cache["timestamp"]).total_seconds() < _blog_cache["ttl_seconds"]
    )

    if cache_valid:
        all_posts = _blog_cache["posts"]
    else:
        # Fetch from DB and cache
        all_posts = db.query(BlogPost).filter(BlogPost.published == True).order_by(
            BlogPost.published_at.desc()
        ).all()
        _blog_cache["posts"] = all_posts
        _blog_cache["timestamp"] = now

    # Filter by tag if specified
    if tag:
        filtered_posts = [p for p in all_posts if p.tags and tag in p.tags]
    else:
        filtered_posts = all_posts

    # Apply pagination
    paginated = filtered_posts[skip:skip + limit]
    return [BlogPostResponse.from_orm(p) for p in paginated]


@router.get("/{slug}", response_model=BlogPostDetailResponse)
async def get_blog_post(
    slug: str,
    db: Session = Depends(get_db),
):
    """Récupérer un article complet par son slug (sans authentification)."""
    post = db.query(BlogPost).filter(
        BlogPost.slug == slug,
        BlogPost.published == True,
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    return BlogPostDetailResponse.from_orm(post)


@router.post("", response_model=BlogPostResponse, status_code=status.HTTP_201_CREATED)
async def create_blog_post(
    post_data: BlogPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Créer un nouvel article (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Accès refusé — admin requis")

    # Vérifier l'unicité du slug
    existing = db.query(BlogPost).filter(BlogPost.slug == post_data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce slug existe déjà")

    new_post = BlogPost(
        title=post_data.title,
        slug=post_data.slug,
        excerpt=post_data.excerpt,
        content=post_data.content,
        author=post_data.author,
        cover_image_url=post_data.cover_image_url,
        tags=post_data.tags,
        published=post_data.published,
        published_at=post_data.published_at,
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    # Invalidate cache
    _blog_cache["posts"] = None
    _blog_cache["timestamp"] = None

    return BlogPostResponse.from_orm(new_post)


@router.put("/{slug}", response_model=BlogPostResponse)
async def update_blog_post(
    slug: str,
    post_data: BlogPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mettre à jour un article (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Accès refusé — admin requis")

    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    # Mettre à jour les champs
    if post_data.title:
        post.title = post_data.title
    if post_data.slug and post_data.slug != slug:
        # Vérifier l'unicité du nouveau slug
        existing = db.query(BlogPost).filter(BlogPost.slug == post_data.slug).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ce slug existe déjà")
        post.slug = post_data.slug
    if post_data.excerpt is not None:
        post.excerpt = post_data.excerpt
    if post_data.content:
        post.content = post_data.content
    if post_data.author is not None:
        post.author = post_data.author
    if post_data.cover_image_url is not None:
        post.cover_image_url = post_data.cover_image_url
    if post_data.tags is not None:
        post.tags = post_data.tags
    if post_data.published is not None:
        post.published = post_data.published
    if post_data.published_at is not None:
        post.published_at = post_data.published_at

    db.commit()
    db.refresh(post)

    # Invalidate cache
    _blog_cache["posts"] = None
    _blog_cache["timestamp"] = None

    return BlogPostResponse.from_orm(post)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blog_post(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un article (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Accès refusé — admin requis")

    post = db.query(BlogPost).filter(BlogPost.slug == slug).first()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    db.delete(post)
    db.commit()

    # Invalidate cache
    _blog_cache["posts"] = None
    _blog_cache["timestamp"] = None
