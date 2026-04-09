from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base


class PageConfig(Base):
    __tablename__ = "page_configs"

    id = Column(Integer, primary_key=True, index=True)
    page_name = Column(String(100), unique=True, nullable=False, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    label = Column(String(255), nullable=True)

    def __repr__(self):
        return f"<PageConfig {self.page_name} enabled={self.is_enabled}>"


# Default pages that can be toggled
DEFAULT_PAGES = [
    {"page_name": "pricing",   "label": "Page Tarification",                    "is_enabled": True},
    {"page_name": "cgu",       "label": "Conditions Générales d'Utilisation",   "is_enabled": True},
    {"page_name": "demo_mode", "label": "Mode Démo (dashboard vide = tracks fictifs)", "is_enabled": False},
]



class PlanFeature(Base):
    """Per-plan feature access configuration. Admin can toggle which modules each plan can access."""
    __tablename__ = "plan_features"

    id = Column(Integer, primary_key=True, index=True)
    plan_name = Column(String(50), nullable=False, index=True)  # free / pro / unlimited
    feature_name = Column(String(100), nullable=False)  # module identifier
    is_enabled = Column(Boolean, default=False, nullable=False)
    label = Column(String(255), nullable=True)  # display name
    display_mode = Column(String(20), default="locked", nullable=False)  # "hidden" ou "locked"

    def __repr__(self):
        return f"<PlanFeature {self.plan_name}:{self.feature_name} enabled={self.is_enabled}>"


# All features that can be gated per plan
# ⚠️ Les feature_name DOIVENT correspondre EXACTEMENT aux featureKey du frontend
# (Sidebar.tsx, DashboardV2.tsx TABS, FeatureGate wraps)
DEFAULT_PLAN_FEATURES = [
    # ── Pages / Sidebar ──
    {"feature_name": "stats",           "label": "Statistiques"},
    {"feature_name": "favorites",       "label": "Favoris"},
    {"feature_name": "set_builder",     "label": "Constructeur de set"},
    {"feature_name": "duplicates",      "label": "Doublons"},
    {"feature_name": "mix_compatible",  "label": "Mix compatible"},
    {"feature_name": "playlists",       "label": "Playlists"},
    {"feature_name": "smart_crates",    "label": "Bacs intelligents"},
    {"feature_name": "gig_prep",        "label": "Prepa Gig"},
    {"feature_name": "activity",        "label": "Historique"},
    {"feature_name": "dj_tools",        "label": "Outils DJ"},
    {"feature_name": "upload",          "label": "Upload"},
    {"feature_name": "export",          "label": "Export"},
    # ── Onglets analyse ──
    {"feature_name": "cue_generation",  "label": "Cue Points"},
    {"feature_name": "beatgrid",        "label": "Beatgrid"},
    {"feature_name": "mix_analysis",    "label": "Analyse Mix"},
    {"feature_name": "eq_analysis",     "label": "Analyse EQ"},
    {"feature_name": "fx_suggestions",  "label": "Suggestions FX"},
    {"feature_name": "stems",           "label": "Stems (Desktop)"},
    {"feature_name": "pro_stems",       "label": "Pro Stems (Séparation de stems Web)"},
    {"feature_name": "compare",         "label": "Comparer"},
]

# Default plan configs (what each plan gets by default)
ALL_FEATURES = [f["feature_name"] for f in DEFAULT_PLAN_FEATURES]

# Features désactivées globalement (visibles uniquement par les admins)
ADMIN_ONLY_FEATURES = {"pro_stems"}

DEFAULT_PLAN_CONFIGS = {
    "free": ["upload", "cue_generation", "playlists", "favorites", "activity"],
    "pro": [f for f in ALL_FEATURES if f not in ADMIN_ONLY_FEATURES],
    "unlimited": [f for f in ALL_FEATURES if f not in ADMIN_ONLY_FEATURES],
}


class FeatureLock(Base):
    """Verrouillage de code par feature.

    Quand is_locked=True, Claude ne doit PAS modifier le code de cette feature.
    Kevin active le verrou quand il considère qu'une feature est terminée et stable.
    """
    __tablename__ = "feature_locks"

    id = Column(Integer, primary_key=True, index=True)
    feature_name = Column(String(100), unique=True, nullable=False, index=True)
    label = Column(String(255), nullable=True)
    is_locked = Column(Boolean, default=False, nullable=False)
    locked_at = Column(DateTime, nullable=True)
    note = Column(String(500), nullable=True)  # raison du verrouillage

    def __repr__(self):
        return f"<FeatureLock {self.feature_name} locked={self.is_locked}>"
