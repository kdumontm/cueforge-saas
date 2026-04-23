"""Router admin — Gestion des utilisateurs."""
import csv
import io
import logging
import os
import secrets
import string
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.track import Track
from app.middleware.admin import require_admin
from app.routers.admin.schemas import UserUpdate
from app.services import r2_service
from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-users"])


class BulkDeleteRequest(BaseModel):
    user_ids: List[int]


# Tables enfants à purger manuellement AVANT de supprimer le user.
#
# Problème SQLAlchemy ORM :
#   Beaucoup de relationships `User.<children>` existent sans `passive_deletes=True`.
#   Quand on fait `db.delete(user)`, SA émule un ON DELETE côté ORM et lance
#   `UPDATE <child> SET user_id=NULL WHERE user_id=:uid` — même si la FK SQL
#   a `ondelete="CASCADE"` ou est `nullable=False`. Résultat :
#   `NotNullViolation` sur les tables où user_id est NOT NULL (dj_sets,
#   subscriptions, webhooks, notifications, tags, activity_logs, favorites,
#   shared_links, api_keys, usage_logs, org_invites, referrals…).
#
# Fix : on exécute des DELETE SQL bruts en direct AVANT `db.delete(user)`,
# ce qui by-pass complètement la logique ORM cascade. Les tables CASCADE
# passent par le même chemin pour homogénéité (inoffensif : idempotent).
#
# Format : (nom_table, nom_colonne_fk).
_USER_CHILD_TABLES = [
    # Relations directes 1→N user.id
    ("hot_cues", "user_id"),
    ("playlist_tracks", None),  # pas de user_id direct, nettoyé via CASCADE sur playlists
    ("playlists", "user_id"),
    ("smart_crates", "user_id"),
    ("dj_set_tracks", None),  # CASCADE via dj_sets
    ("dj_sets", "user_id"),
    ("play_history", "user_id"),
    ("mashups", "user_id"),
    ("favorite_mashups", "user_id"),
    ("cue_templates", "user_id"),
    ("cue_presets", "user_id"),
    ("user_cue_preferences", "user_id"),
    ("cue_export_logs", "user_id"),
    ("cue_import_logs", "user_id"),
    ("cue_collaboration_notes", "user_id"),
    ("tags", "user_id"),
    ("activity_logs", "user_id"),
    ("favorites", "user_id"),
    ("webhooks", "user_id"),
    ("shared_links", "user_id"),
    ("notifications", "user_id"),
    ("push_subscriptions", "user_id"),
    ("api_keys", "user_id"),
    ("subscriptions", "user_id"),
    ("usage_logs", "user_id"),
    ("feedback", "user_id"),
    # Referrals : 2 colonnes FK séparées
    ("referrals", "referrer_id"),
    ("referrals", "referred_user_id"),
    # CMS : FK nullable, on met à NULL plutôt que DELETE (on ne veut pas perdre
    # du contenu à cause d'un user supprimé).
    # → traité en SET NULL plus bas.
]

# Tables où l'user apparaît comme FK mais qu'il faut NULLer plutôt que supprimer.
_USER_NULLIFY_TABLES = [
    ("pages", "updated_by"),
    ("sections", "created_by"),
    ("media_assets", "uploaded_by"),
    ("track_audits", "changed_by_user_id"),
]


def _purge_user_storage(user: User, db: Session) -> dict:
    """
    Supprime TOUS les fichiers audio (R2 + disque local) appartenant à un user,
    puis purge manuellement toutes les tables enfants qui référencent
    `users.id` avant que l'appelant ne supprime le user lui-même.

    On utilise du SQL brut (text) pour toutes les tables enfants afin de
    by-pass l'émulation cascade ORM de SQLAlchemy (voir _USER_CHILD_TABLES).
    """
    tracks = db.query(Track).filter(Track.user_id == user.id).all()
    r2_deleted = 0
    r2_errors = 0
    local_deleted = 0
    local_errors = 0

    for t in tracks:
        # 1. Supprimer l'objet R2 si présent
        if t.r2_key:
            try:
                ok = r2_service.delete_object(t.r2_key)
                if ok:
                    r2_deleted += 1
                else:
                    # R2 désactivé ou échec soft (déjà loggé par le service)
                    pass
            except Exception as e:
                logger.warning(f"[admin.delete_user] R2 delete {t.r2_key} failed: {e}")
                r2_errors += 1

        # 2. Supprimer le fichier local cache s'il existe encore
        if t.file_path:
            try:
                if os.path.exists(t.file_path):
                    os.remove(t.file_path)
                    local_deleted += 1
            except Exception as e:
                logger.warning(f"[admin.delete_user] Local delete {t.file_path} failed: {e}")
                local_errors += 1

    # 3. Purge SQL brute des tables enfants pour éviter le cascade-emu ORM.
    children_deleted = 0
    for tbl, col in _USER_CHILD_TABLES:
        if col is None:
            # Table sans FK directe user_id (nettoyée par CASCADE SQL)
            continue
        try:
            res = db.execute(
                text(f"DELETE FROM {tbl} WHERE {col} = :uid"),
                {"uid": user.id},
            )
            children_deleted += (res.rowcount or 0)
        except Exception as e:
            # Table peut ne pas exister (ex: feature activée sur un env, pas un autre).
            logger.warning(
                f"[admin.delete_user] purge {tbl}.{col} failed (table manquante ?): {e}"
            )

    # 4. Nullify les FK historiques/CMS qu'on veut conserver.
    for tbl, col in _USER_NULLIFY_TABLES:
        try:
            db.execute(
                text(f"UPDATE {tbl} SET {col} = NULL WHERE {col} = :uid"),
                {"uid": user.id},
            )
        except Exception as e:
            logger.warning(
                f"[admin.delete_user] nullify {tbl}.{col} failed (table manquante ?): {e}"
            )

    # 5. Cas orgs : si le user est owner d'orgs, on transfère la propriété au
    # 1er admin existant, sinon on détache (NULL). Les org_members et org_invites
    # liés au user lui-même ont déjà été purgés via _USER_CHILD_TABLES.
    try:
        # On NULL juste organizations.owner_id pour ce user — l'admin peut
        # ensuite ré-assigner ou supprimer l'org manuellement.
        # (owner_id est nullable=False au schéma ORM mais on force SQL brut.)
        # Si la contrainte NOT NULL bloque, on supprime l'org purement et simplement.
        res_transfer = db.execute(
            text("""
                UPDATE organizations
                SET owner_id = (
                    SELECT id FROM users
                    WHERE is_admin = TRUE AND id != :uid
                    ORDER BY id ASC
                    LIMIT 1
                )
                WHERE owner_id = :uid
            """),
            {"uid": user.id},
        )
        # Fallback : si aucun autre admin n'existe, transfert impossible → on delete l'org.
        if res_transfer.rowcount and res_transfer.rowcount > 0:
            logger.info(f"[admin.delete_user] transfert de {res_transfer.rowcount} org(s) owner_id={user.id} → nouvel admin")
    except Exception as e:
        logger.warning(f"[admin.delete_user] transfert orgs échoué, fallback delete: {e}")
        try:
            db.execute(
                text("DELETE FROM organizations WHERE owner_id = :uid"),
                {"uid": user.id},
            )
        except Exception as e2:
            logger.warning(f"[admin.delete_user] delete orgs fallback échoué: {e2}")

    # Nettoyage org_members du user (table sans __tablename__ connu, fallback silencieux)
    for tbl, col in [("organization_members", "user_id"), ("org_invites", "invited_by")]:
        try:
            db.execute(
                text(f"DELETE FROM {tbl} WHERE {col} = :uid"),
                {"uid": user.id},
            )
        except Exception as e:
            logger.debug(f"[admin.delete_user] purge {tbl} skip: {e}")

    # flush avant db.delete(user) pour que les DELETEs soient visibles dans la même tx.
    db.flush()

    return {
        "tracks": len(tracks),
        "r2_deleted": r2_deleted,
        "r2_errors": r2_errors,
        "local_deleted": local_deleted,
        "local_errors": local_errors,
        "children_deleted": children_deleted,
    }


@router.get("/users")
async def list_users(
    search: Optional[str] = None,
    plan: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste les utilisateurs avec filtres et pagination."""
    query = db.query(User).order_by(User.created_at.desc())

    if search:
        query = query.filter(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )
    if plan:
        query = query.filter(User.subscription_plan == plan)

    total = query.count()
    users = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "subscription_plan": u.subscription_plan,
                "is_admin": u.is_admin,
                "email_verified": u.email_verified,
                "oauth_provider": u.oauth_provider,
                "organization_id": u.organization_id,
                "org_role": u.org_role,
                "tracks_today": u.tracks_today,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


# IMPORTANT: Cette route DOIT être déclarée avant /users/{user_id} sinon FastAPI
# essaie de parser "export" comme un int et renvoie 422.
# QA 2026-04-21: fix pour shadowing de admin_extended.export_users par ce router.
@router.get("/users/export")
async def export_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Export tous les utilisateurs en CSV."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "email", "name", "subscription_plan", "is_admin",
        "email_verified", "oauth_provider", "organization_id", "org_role",
        "tracks_today", "last_login_at", "created_at",
    ])
    for u in users:
        writer.writerow([
            u.id,
            u.email,
            u.name or "",
            u.subscription_plan or "",
            u.is_admin,
            u.email_verified,
            u.oauth_provider or "",
            u.organization_id or "",
            u.org_role or "",
            u.tracks_today or 0,
            u.last_login_at.isoformat() if u.last_login_at else "",
            u.created_at.isoformat() if u.created_at else "",
        ])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"},
    )


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Récupère les détails d'un utilisateur."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "subscription_plan": user.subscription_plan,
        "is_admin": user.is_admin,
        "email_verified": user.email_verified,
        "oauth_provider": user.oauth_provider,
        "organization_id": user.organization_id,
        "org_role": user.org_role,
        "avatar_url": user.avatar_url,
        "tracks_today": user.tracks_today,
        "last_track_date": user.last_track_date.isoformat() if user.last_track_date else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un utilisateur (plan, rôle admin, etc.)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    update_data = data.model_dump(exclude_unset=True)

    if "is_admin" in update_data and user.id == admin.id and not update_data["is_admin"]:
        raise HTTPException(
            status_code=400,
            detail="Impossible de retirer vos propres droits admin",
        )

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return {"message": f"Utilisateur {user.email} mis à jour"}


def _generate_temp_password(length: int = 14) -> str:
    """Génère un mdp temporaire respectant la policy auth.py :
    1+ majuscule, 1+ minuscule, 1+ chiffre, 1+ caractère spécial.

    On force au moins 1 char de chaque catégorie puis on complète avec
    le pool complet et on shuffle — garantie de satisfaire la policy.
    """
    # La policy exige au moins un caractère spécial — on utilise ceux listés
    # dans auth_service (safe pour URL / shell si l'admin doit le lire / taper).
    specials = "!@#$%^&*-_=+?"
    alphabet = string.ascii_letters + string.digits + specials
    # 1 de chaque catégorie obligatoire + reste random
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(specials),
    ]
    remaining = [secrets.choice(alphabet) for _ in range(length - len(required))]
    pw_chars = required + remaining
    # Shuffle cryptographique (SystemRandom = os.urandom derrière)
    import random as _r
    _r.SystemRandom().shuffle(pw_chars)
    return "".join(pw_chars)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Génère un mot de passe temporaire pour le user ciblé et le hash en DB.
    Retourne le mdp en clair à l'admin UNE SEULE FOIS — il ne sera plus
    jamais affiché ensuite. L'admin doit le transmettre au user (email
    privé, autre canal sécurisé…).

    Side-effects :
    - user.password_hash = hash(nouveau_mdp)
    - commit DB
    - log informatif (sans le mdp)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Garde-fou : on autorise à reset son propre mdp (utile en cas de
    # compromission), mais on log spécifiquement.
    if user.id == admin.id:
        logger.warning(f"[admin.reset_password] admin {admin.email} reset son propre mdp")

    new_password = _generate_temp_password()
    user.password_hash = hash_password(new_password)
    db.commit()
    logger.info(f"[admin.reset_password] admin={admin.email} → user={user.email} mdp reset OK")

    return {
        "new_password": new_password,
        "message": f"Mot de passe réinitialisé pour {user.email}. Transmets-le au user en privé — il ne sera plus affiché.",
    }


# IMPORTANT: Cette route DOIT être déclarée avant /users/{user_id} (DELETE)
# sinon FastAPI essaie de parser "bulk-delete" comme un int et renvoie 422.
@router.post("/users/bulk-delete")
async def bulk_delete_users(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Supprime plusieurs utilisateurs d'un coup.
    Pour chaque user: supprime tous ses tracks + fichiers R2 + fichiers locaux,
    puis supprime le user (les rows DB liées sont nettoyées par CASCADE SQL).
    """
    ids = list({int(i) for i in payload.user_ids if i})
    if not ids:
        raise HTTPException(status_code=400, detail="Aucun user_id fourni")

    if admin.id in ids:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer votre propre compte",
        )

    users = db.query(User).filter(User.id.in_(ids)).all()
    found_ids = {u.id for u in users}
    missing = [i for i in ids if i not in found_ids]

    deleted = []
    errors = []
    total_tracks = 0
    total_r2 = 0
    total_local = 0

    for user in users:
        try:
            stats = _purge_user_storage(user, db)
            total_tracks += stats["tracks"]
            total_r2 += stats["r2_deleted"]
            total_local += stats["local_deleted"]
            email = user.email
            uid = user.id
            db.delete(user)
            db.commit()
            deleted.append({"id": uid, "email": email, **stats})
        except Exception as e:
            db.rollback()
            logger.exception(f"[admin.bulk_delete] user={user.id} failed")
            errors.append({"id": user.id, "email": user.email, "error": str(e)})

    return {
        "requested": len(ids),
        "deleted_count": len(deleted),
        "deleted": deleted,
        "tracks_deleted": total_tracks,
        "r2_deleted": total_r2,
        "local_deleted": total_local,
        "not_found": missing,
        "errors": errors,
        "message": f"{len(deleted)}/{len(ids)} utilisateurs supprimés · {total_tracks} tracks · {total_r2} fichiers R2",
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Supprime un utilisateur + TOUS ses tracks/sons (R2 + disque local)
    + toutes les rows liées (cues, sets, favoris, tags…) via CASCADE SQL.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")

    email = user.email
    stats = _purge_user_storage(user, db)

    db.delete(user)
    db.commit()

    return {
        "message": f"Utilisateur {email} supprimé · {stats['tracks']} tracks · {stats['r2_deleted']} fichiers R2",
        **stats,
    }
