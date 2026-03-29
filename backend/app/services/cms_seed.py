"""
CMS Seeds — Données initiales pour le back-office.

Crée les pages par défaut (landing, pricing, features),
les sections avec leur contenu, et les feature flags.
À appeler au premier démarrage ou via une commande admin.
"""
import json
from sqlalchemy.orm import Session

from app.models.cms import (
    SiteSettings, Page, Section, Component,
)
from app.models.site_settings import PlanFeature, DEFAULT_PLAN_FEATURES, DEFAULT_PLAN_CONFIGS


def seed_site_settings(db: Session) -> SiteSettings:
    """Crée les settings par défaut si absentes."""
    existing = db.query(SiteSettings).first()
    if existing:
        return existing

    settings = SiteSettings(
        id=1,
        site_name="CueForge",
        tagline="AI-Powered Cue Points for DJs",
        primary_color="#6366f1",
        secondary_color="#8b5cf6",
        accent_color="#06b6d4",
        background_color="#0f172a",
        text_color="#f8fafc",
        font_family="Inter",
        meta_title="CueForge — Smart Cue Points for DJs",
        meta_description="Analysez vos morceaux avec l'IA et générez des cue points intelligents pour Rekordbox, Serato et VirtualDJ.",
        footer_text="© 2026 CueForge. All rights reserved.",
    )
    db.add(settings)
    db.flush()
    return settings


def seed_landing_page(db: Session, admin_id: int = None) -> Page:
    """Crée la page Landing avec ses sections."""
    existing = db.query(Page).filter(Page.slug == "landing").first()
    if existing:
        return existing

    page = Page(
        name="Page d'accueil",
        slug="landing",
        title="CueForge — Smart Cue Points for DJs",
        is_published=True,
        is_system=True,
        sort_order=0,
        show_in_nav=False,
        layout="full-width",
        created_by=admin_id,
    )
    db.add(page)
    db.flush()

    # ── Hero Section ──
    hero = Section(
        page_id=page.id,
        name="Hero",
        section_type="hero",
        sort_order=0,
        settings_json=json.dumps({
            "title": "Des cue points intelligents pour chaque morceau",
            "subtitle": "Analysez votre musique avec l'IA et préparez vos sets en quelques minutes.",
            "cta_text": "Commencer gratuitement",
            "cta_url": "/register",
            "cta_secondary_text": "Voir une démo",
            "cta_secondary_url": "#features",
        }),
    )
    db.add(hero)
    db.flush()

    # Composants du hero
    db.add(Component(
        section_id=hero.id,
        component_type="heading",
        sort_order=0,
        content_json=json.dumps({
            "text": "Des cue points intelligents pour chaque morceau",
            "level": "h1",
            "align": "center",
        }),
    ))
    db.add(Component(
        section_id=hero.id,
        component_type="text",
        sort_order=1,
        content_json=json.dumps({
            "text": "Analysez votre musique avec l'IA et préparez vos sets en quelques minutes.",
            "align": "center",
            "size": "xl",
        }),
    ))
    db.add(Component(
        section_id=hero.id,
        component_type="button",
        sort_order=2,
        content_json=json.dumps({
            "label": "Commencer gratuitement",
            "href": "/register",
            "variant": "primary",
            "size": "lg",
        }),
    ))

    # ── Features Section ──
    features = Section(
        page_id=page.id,
        name="Fonctionnalités",
        section_type="features",
        sort_order=1,
        settings_json=json.dumps({
            "title": "Tout ce dont vous avez besoin",
            "subtitle": "Des outils puissants pour préparer vos DJ sets",
            "columns": 3,
        }),
    )
    db.add(features)
    db.flush()

    feature_items = [
        {"icon": "music", "title": "Analyse audio IA", "description": "BPM, tonalité, énergie, drops — tout est détecté automatiquement."},
        {"icon": "target", "title": "Cue points intelligents", "description": "Memory cues et hot cues positionnés au bon moment, automatiquement."},
        {"icon": "download", "title": "Export Rekordbox", "description": "Exportez vos cue points directement en XML compatible Rekordbox."},
        {"icon": "zap", "title": "Analyse rapide", "description": "Analysez des centaines de morceaux en quelques minutes."},
        {"icon": "palette", "title": "Couleurs personnalisables", "description": "Choisissez les couleurs de vos cue points selon vos préférences."},
        {"icon": "users", "title": "Collaboration", "description": "Partagez vos analyses avec votre équipe ou votre label."},
    ]
    for i, item in enumerate(feature_items):
        db.add(Component(
            section_id=features.id,
            component_type="feature-item",
            sort_order=i,
            grid_column="col-span-4",
            content_json=json.dumps(item),
        ))

    # ── CTA Section ──
    cta = Section(
        page_id=page.id,
        name="Call to Action",
        section_type="cta",
        sort_order=2,
        background_color="#1e1b4b",
        settings_json=json.dumps({
            "title": "Prêt à transformer vos DJ sets ?",
            "subtitle": "Commencez gratuitement — pas de carte de crédit nécessaire.",
            "cta_text": "Créer un compte",
            "cta_url": "/register",
        }),
    )
    db.add(cta)

    db.flush()
    return page


def seed_pricing_page(db: Session, admin_id: int = None) -> Page:
    """Crée la page Pricing."""
    existing = db.query(Page).filter(Page.slug == "pricing").first()
    if existing:
        return existing

    page = Page(
        name="Tarifs",
        slug="pricing",
        title="Tarifs — CueForge",
        is_published=True,
        is_system=True,
        sort_order=1,
        show_in_nav=True,
        nav_label="Tarifs",
        layout="default",
        created_by=admin_id,
    )
    db.add(page)
    db.flush()

    # ── Pricing Header ──
    header = Section(
        page_id=page.id,
        name="En-tête Pricing",
        section_type="hero",
        sort_order=0,
        settings_json=json.dumps({
            "title": "Choisissez votre plan",
            "subtitle": "De l'amateur au professionnel, un plan pour chaque DJ.",
        }),
    )
    db.add(header)
    db.flush()

    # ── Pricing Cards ──
    cards = Section(
        page_id=page.id,
        name="Plans",
        section_type="pricing",
        sort_order=1,
        settings_json=json.dumps({"columns": 3}),
    )
    db.add(cards)
    db.flush()

    plans = [
        {
            "name": "Free",
            "price": "0",
            "period": "pour toujours",
            "features": ["5 morceaux/jour", "8 cue points max", "Export Rekordbox", "Analyse IA de base"],
            "cta_text": "Commencer",
            "cta_url": "/register",
            "highlighted": False,
        },
        {
            "name": "Pro",
            "price": "9.99",
            "period": "/mois",
            "features": ["50 morceaux/jour", "64 cue points max", "Tous les exports", "Lookup Spotify", "Export en lot", "Analyse prioritaire"],
            "cta_text": "Passer Pro",
            "cta_url": "/register?plan=pro",
            "highlighted": True,
        },
        {
            "name": "Enterprise",
            "price": "29.99",
            "period": "/mois",
            "features": ["500 morceaux/jour", "128 cue points max", "Accès API", "50 membres", "500 GB stockage", "Support prioritaire"],
            "cta_text": "Contacter",
            "cta_url": "/contact",
            "highlighted": False,
        },
    ]
    for i, plan in enumerate(plans):
        db.add(Component(
            section_id=cards.id,
            component_type="pricing-card",
            sort_order=i,
            grid_column="col-span-4",
            content_json=json.dumps(plan),
        ))

    db.flush()
    return page


def seed_plan_features(db: Session) -> list[PlanFeature]:
    """Crée les feature flags par défaut en utilisant DEFAULT_PLAN_CONFIGS de site_settings.py."""
    existing = db.query(PlanFeature).count()
    if existing > 0:
        return db.query(PlanFeature).all()

    # Utilise les configs existantes de site_settings.py
    features = []
    feature_labels = {f["feature_name"]: f["label"] for f in DEFAULT_PLAN_FEATURES}

    for plan_name, enabled_features in DEFAULT_PLAN_CONFIGS.items():
        for feature_name in enabled_features:
            features.append(PlanFeature(
                plan_name=plan_name,
                feature_name=feature_name,
                is_enabled=True,
                label=feature_labels.get(feature_name, feature_name),
            ))

    db.add_all(features)
    db.flush()
    return features


def seed_all(db: Session, admin_id: int = None):
    """
    Lance tous les seeds. Appeler au démarrage de l'app.

    Usage dans main.py :
        from app.services.cms_seed import seed_all
        @app.on_event("startup")
        async def startup():
            db = SessionLocal()
            try:
                seed_all(db, admin_id=1)
                db.commit()
            finally:
                db.close()
    """
    seed_site_settings(db)
    seed_landing_page(db, admin_id)
    seed_pricing_page(db, admin_id)
    seed_plan_features(db)
    db.commit()
