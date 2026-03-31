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

    def __repr__(self):
        return f"<PlanFeature {self.plan_name}:{self.feature_name} enabled={self.is_enabled}>"


# All features that can be gated per plan
DEFAULT_PLAN_FEATURES = [
    # Core modules
    {"feature_name": "analysis", "label": "Audio Analysis (BPM, Key, Energy)"},
    {"feature_name": "cue_points", "label": "Cue Points Detection"},
    {"feature_name": "waveform", "label": "Waveform Display"},
    {"feature_name": "eq", "label": "EQ Module"},
    {"feature_name": "fx", "label": "FX Module"},
    {"feature_name": "mix", "label": "Mix Compatibility"},
    {"feature_name": "camelot_wheel", "label": "Camelot Wheel"},
    {"feature_name": "playlists", "label": "Playlists"},
    {"feature_name": "history", "label": "History"},
    {"feature_name": "stats", "label": "Statistics"},
    # Export
    {"feature_name": "rekordbox_export", "label": "Rekordbox XML Export"},
    # Advanced
    {"feature_name": "batch_analysis", "label": "Batch Analysis"},
    {"feature_name": "genre_detection", "label": "Genre Detection"},
    {"feature_name": "watch_folder", "label": "Watch Folder"},
]

# Default plan configs (what each plan gets by default)
DEFAULT_PLAN_CONFIGS = {
    "free": ["analysis", "cue_points", "waveform", "playlists", "history"],
    "pro": ["analysis", "cue_points", "waveform", "eq", "fx", "mix", "camelot_wheel", "playlists", "history", "stats", "rekordbox_export", "genre_detection"],
    "unlimited": ["analysis", "cue_points", "waveform", "eq", "fx", "mix", "camelot_wheel", "playlists", "history", "stats", "rekordbox_export", "batch_analysis", "genre_detection", "watch_folder"],
}
