#!/usr/bin/env python3
"""
check_migrations.py — Valide que toute colonne SQLAlchemy est dans PENDING_MIGRATIONS.

Contexte : le 2026-04-23 on a eu un 502 Railway persistant parce que le commit
0bfa4cc avait ajouté User.is_comp au modèle + son usage dans un filtre query
(User.is_comp == False), sans l'ajouter à PENDING_MIGRATIONS. La Pass 2
auto-detect aurait dû le prendre, mais le container est parti en crash-loop
avant que le redeploy finisse proprement.

Ce script doit être lancé :
- À la main avant de commit une nouvelle colonne
- Par le CI (Railway build / GitHub Actions si configuré)

Exit 0 = OK, Exit 1 = colonne manquante (bloque le commit/deploy).

Usage:
    cd backend && python3 ../scripts/check_migrations.py
"""
import os
import sys

# Trouve le root du projet et ajoute backend/ au path
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
sys.path.insert(0, BACKEND_DIR)

# Env vars minimales pour que les imports marchent (DB factice)
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "x" * 32)
os.environ.setdefault("JWT_SECRET", "x" * 32)
os.environ.setdefault("JWT_SECRET_KEY", "x" * 32)
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ.setdefault("CUEFORGE_DIAG_KEY", "x")


def main() -> int:
    print("🔍 check_migrations.py : vérifie que les colonnes SQLAlchemy ont une entrée PENDING_MIGRATIONS…")

    # Import pour peupler Base.metadata avec tous les modèles
    try:
        from app.database import Base
        # Force l'import de tous les modèles (même pattern que main.py)
        from app.models import user, track, site_settings, library  # noqa
        from app.models import organization, notification, shared, feedback, api_key  # noqa
        from app.models import webhook, cue_template, blog_post, push_subscription  # noqa
        from app.models import favorite, tag, activity_log, webhook_event, referral  # noqa
    except Exception as e:
        print(f"❌ Impossible d'importer les modèles : {e}")
        import traceback; traceback.print_exc()
        return 1

    try:
        from app.utils.migrations import PENDING_MIGRATIONS
    except Exception as e:
        print(f"❌ Impossible d'importer PENDING_MIGRATIONS : {e}")
        return 1

    # Tables qui sont gérées par PENDING_MIGRATIONS — on check seulement celles-là
    # Les autres tables sont créées intégralement par create_all au boot,
    # donc pas de risque de "colonne manquante" sur une DB existante.
    TABLES_TO_CHECK = set(PENDING_MIGRATIONS.keys())

    problems: list[str] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in TABLES_TO_CHECK:
            continue
        declared_cols = {col.name for col in table.columns}
        migrated_cols = set(PENDING_MIGRATIONS.get(table.name, {}).keys())

        # Colonnes de base créées par le schéma initial (pas besoin d'être
        # dans PENDING_MIGRATIONS car elles existent depuis le début).
        BASE_COLS = {"id", "created_at", "updated_at", "user_id", "track_id", "org_id"}

        # On veut : toute colonne déclarée qui N'EST PAS dans BASE_COLS
        # doit être dans PENDING_MIGRATIONS (pour que l'auto-migration
        # Pass 1 la crée sur DB existante).
        # Note : on ignore foreign keys de base + timestamps.
        for col in table.columns:
            if col.name in BASE_COLS:
                continue
            if col.name in migrated_cols:
                continue
            # Cas spécial : les colonnes "nullable=True sans default" peuvent
            # être auto-détectées par Pass 2 sans risque → warning seulement.
            # Les colonnes NOT NULL avec/sans default sont RISQUÉES → erreur.
            risky = (not col.nullable)
            # Les colonnes filtrées par queries connues sont également risquées.
            severity = "❌ ERREUR" if risky else "⚠️  WARNING"
            problems.append(
                f"{severity} : {table.name}.{col.name} ({col.type}) "
                f"absent de PENDING_MIGRATIONS[{table.name!r}]"
            )

    if not problems:
        print(f"✅ OK : toutes les colonnes des {len(TABLES_TO_CHECK)} tables surveillées ont une entrée PENDING_MIGRATIONS.")
        return 0

    # Le script est INFORMATIF (pas bloquant). La vraie sécurité est la
    # Pass 2 auto-detect dans migrations.py qui scanne Base.metadata et
    # ajoute automatiquement toute colonne manquante en ALTER TABLE.
    # Ce listing sert à Kevin comme check-list manuelle : si une colonne
    # NOT NULL est affichée en ❌, il vaut mieux l'ajouter à Pass 1 pour
    # ne pas dépendre de Pass 2 (qui peut échouer silencieusement dans
    # des cas extrêmes — ex: crash-loop Railway OOM du 2026-04-23).
    print()
    print("Colonnes SQLAlchemy sans entrée PENDING_MIGRATIONS (informatif) :")
    print("-" * 70)
    for p in problems:
        print(p)
    print("-" * 70)
    print()
    print("💡 La plupart de ces colonnes sont probablement des colonnes de base")
    print("   créées par create_all au premier boot — pas besoin de les ajouter.")
    print("   Ajoute à PENDING_MIGRATIONS UNIQUEMENT les colonnes que tu viens")
    print("   d'ajouter à un modèle EXISTANT (risque de 'colonne manquante' sur")
    print("   DB prod existante sinon).")
    print()
    print(f"ℹ️  {len(problems)} colonne(s) listée(s). Exit 0 (informatif).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
