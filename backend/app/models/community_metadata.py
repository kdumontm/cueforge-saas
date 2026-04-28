"""
Metadata communautaire : enrichissements partagés entre users.

Quand un user corrige manuellement les infos d'un morceau (title, artist, album, genre,
artwork, etc.), on enregistre ces corrections indexées par l'empreinte chromaprint.

Les futurs uploads du même morceau (par n'importe quel user, même si fichier rencodé)
bénéficient automatiquement de ces corrections → pas besoin de re-corriger partout.

Système d'incentive : contributors_count track le nombre de users qui ont
contribué → on peut valoriser les contributeurs dans l'UI (badge, stats, etc.).
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Index, func

from app.database import Base


class CommunityMetadata(Base):
    __tablename__ = "community_metadata"

    id = Column(Integer, primary_key=True, index=True)

    # Clé primaire : MD5 de l'empreinte chromaprint (génération fpcalc de l'audio)
    # Même fichier rencodé (mp3 vs flac, 128 vs 320) → même chromaprint → même hash
    chromaprint_hash = Column(String(64), nullable=False, unique=True, index=True)

    # Référence cross-user : si on a pu matcher avec AcoustID/MB
    musicbrainz_id = Column(String(255), nullable=True, index=True)

    # Metadata enrichies (remplies par les users ou retrouvées via AcoustID/MB)
    title = Column(String(500), nullable=True)
    artist = Column(String(500), nullable=True)
    album = Column(String(500), nullable=True)
    genre = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    label = Column(String(255), nullable=True)

    # Corrections manuelles des users (optionnel, si track.bpm/key ont été modifiés)
    bpm_hint = Column(Float, nullable=True)  # BPM que l'user a corrigé manuellement
    key_hint = Column(String(20), nullable=True)  # Key/Camelot que l'user a corrigé

    # Artwork (résultat Spotify/iTunes fallback)
    artwork_url = Column(Text, nullable=True)

    # Incitement : combien de users ont contribué à cet enrichissement
    contributors_count = Column(Integer, default=1, nullable=False)
    genre_correction_count = Column(Integer, default=0, nullable=False)  # Nombre de corrections genre validées

    # Timestamps
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Index pour les filtres communs
    __table_args__ = (
        Index("ix_community_metadata_chromaprint", "chromaprint_hash"),
        Index("ix_community_metadata_mbid", "musicbrainz_id"),
        Index("ix_community_metadata_created", "created_at"),
    )
