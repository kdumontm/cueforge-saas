from sqlalchemy import Column, Integer, String, Boolean
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
    # ── Sidebar items ──
    {"feature_name": "stats",           "label": "Statistiques"},
    {"feature_name": "favorites",       "label": "Favoris"},
    {"feature_name": "set_builder",     "label": "Set Builder"},
    {"feature_name": "duplicates",      "label": "Détection de doublons"},
    {"feature_name": "mix_compatible",  "label": "Mix Compatible"},
    {"feature_name": "playlists",       "label": "Playlists"},
    {"feature_name": "smart_crates",    "label": "Smart Crates"},
    {"feature_name": "gig_prep",        "label": "Préparation de set"},
    {"feature_name": "activity",        "label": "Historique d'activité"},
    {"feature_name": "dj_tools",        "label": "Outils DJ"},
    {"feature_name": "upload",          "label": "Upload de fichiers"},
    {"feature_name": "export",          "label": "Export"},
    # ── Dashboard tabs ──
    {"feature_name": "cue_generation",  "label": "Génération de cue points"},
    {"feature_name": "beatgrid",        "label": "Beatgrid"},
    {"feature_name": "mix_analysis",    "label": "Analyse de mix"},
    {"feature_name": "eq_analysis",     "label": "Analyse EQ"},
    {"feature_name": "fx_suggestions",  "label": "Suggestions FX"},
    {"feature_name": "stems",           "label": "Stems (Desktop)"},
    {"feature_name": "compare",         "label": "Comparer des pistes"},
]

# Default plan configs (what each plan gets by default)
ALL_FEATURES = [f["feature_name"] for f in DEFAULT_PLAN_FEATURES]
DEFAULT_PLAN_CONFIGS = {
    "free": ["upload", "cue_generation", "playlists", "favorites", "activity"],
    "pro": ALL_FEATURES.copy(),   # Pro = tout activé par défaut
    "unlimited": ALL_FEATURES.copy(),  # Unlimited = tout activé par défaut
}
