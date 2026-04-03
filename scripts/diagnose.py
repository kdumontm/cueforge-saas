#!/usr/bin/env python3
"""
CueForge — Diagnostic local du codebase
Usage: python3 scripts/diagnose.py [--url https://app.railway.app] [--key DIAGNOSTICS_KEY]

Sans --url  : analyse statique du codebase seulement
Avec --url  : analyse statique + appel à l'endpoint /diagnostics distant
"""

import os
import sys
import ast
import json
import argparse
import importlib
from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend" / "app"
FRONTEND = ROOT / "frontend"

OK   = "✅"
WARN = "⚠️ "
FAIL = "❌"
INFO = "ℹ️ "

issues: List[Tuple[str, str, str]] = []   # (level, section, message)


def ok(section, msg):   print(f"  {OK}  {msg}");   issues.append(("ok",   section, msg))
def warn(section, msg): print(f"  {WARN} {msg}");   issues.append(("warn", section, msg))
def fail(section, msg): print(f"  {FAIL} {msg}");   issues.append(("fail", section, msg))
def info(section, msg): print(f"  {INFO} {msg}")


# ─── 1. Structure des fichiers clés ──────────────────────────────────────────

def check_key_files():
    print("\n📁  Fichiers clés")
    key_files = [
        BACKEND / "main.py",
        BACKEND / "database.py",
        BACKEND / "models" / "track.py",
        BACKEND / "models" / "user.py",
        BACKEND / "routers" / "tracks.py",
        BACKEND / "routers" / "diagnostics.py",
        BACKEND / "services" / "metadata_service.py",
        BACKEND / "services" / "audio_analysis.py",
        BACKEND / "schemas" / "track.py",
        FRONTEND / "lib" / "api.ts",
        FRONTEND / "app" / "dashboard" / "DashboardV2.tsx",
        FRONTEND / "components" / "MetadataEnrichModal.tsx",
        FRONTEND / "components" / "tracks" / "TrackRow.tsx",
    ]
    for f in key_files:
        rel = f.relative_to(ROOT)
        if f.exists():
            size = f.stat().st_size
            ok("files", f"{rel}  ({size:,} octets)")
        else:
            fail("files", f"{rel}  MANQUANT")


# ─── 2. Cohérence modèle ↔ schéma ────────────────────────────────────────────

def _get_column_names(filepath: Path) -> List[str]:
    """Extract Column(...) attribute names from a SQLAlchemy model file."""
    cols = []
    try:
        src = filepath.read_text()
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, ast.AnnAssign):
                        # annotated assignment (modern style)
                        if isinstance(item.target, ast.Name):
                            cols.append(item.target.id)
                    elif isinstance(item, ast.Assign):
                        for t in item.targets:
                            if isinstance(t, ast.Name):
                                # only keep if rhs is a Column() call
                                if isinstance(item.value, ast.Call):
                                    func = item.value.func
                                    name = (func.id if isinstance(func, ast.Name)
                                            else func.attr if isinstance(func, ast.Attribute) else "")
                                    if "Column" in name or "relationship" in name:
                                        cols.append(t.id)
    except Exception as e:
        warn("schema", f"Parse error sur {filepath.name}: {e}")
    return cols


def check_model_schema_sync():
    print("\n🔗  Cohérence modèle ↔ schéma ↔ API")

    # Champs importants à vérifier dans Track model
    track_model = BACKEND / "models" / "track.py"
    track_schema = BACKEND / "schemas" / "track.py"
    track_router = BACKEND / "routers" / "tracks.py"

    important_fields = ["title", "artist", "album", "genre", "label", "year",
                        "artwork_url", "spotify_id", "spotify_url", "rating",
                        "tags", "comment", "bpm", "key"]

    if not track_model.exists() or not track_schema.exists():
        fail("schema", "Fichiers modèle/schéma manquants")
        return

    model_src  = track_model.read_text()
    schema_src = track_schema.read_text()
    router_src = track_router.read_text() if track_router.exists() else ""

    for field in important_fields:
        in_model  = field in model_src
        in_schema = field in schema_src
        in_router = field in router_src

        if in_model and in_schema:
            ok("schema", f"'{field}' → modèle ✓  schéma ✓")
        elif in_model and not in_schema:
            warn("schema", f"'{field}' → modèle ✓  schéma ✗  (champ non exposé dans l'API)")
        elif not in_model and in_schema:
            fail("schema", f"'{field}' → modèle ✗  schéma ✓  (MISMATCH — schéma expose un champ inexistant)")
        else:
            warn("schema", f"'{field}' → absent du modèle ET du schéma")


# ─── 3. Imports manquants dans les services ───────────────────────────────────

def check_service_imports():
    print("\n📦  Imports des services metadata")
    svc = BACKEND / "services" / "metadata_service.py"
    if not svc.exists():
        fail("imports", "metadata_service.py manquant"); return

    src = svc.read_text()
    fns = ["search_musicbrainz_by_text", "lookup_musicbrainz", "lookup_acoustid",
           "fingerprint_file", "search_spotify", "search_itunes", "get_lastfm_genre"]

    for fn in fns:
        if f"def {fn}" in src:
            ok("imports", f"{fn}() définie dans metadata_service")
        else:
            fail("imports", f"{fn}() MANQUANTE dans metadata_service")

    # Vérifie que tracks.py importe bien search_itunes
    router_src = (BACKEND / "routers" / "tracks.py").read_text()
    if "search_itunes" in router_src:
        ok("imports", "tracks.py importe search_itunes ✓")
    else:
        fail("imports", "tracks.py n'importe PAS search_itunes")


# ─── 4. Incohérences frontend ↔ backend ──────────────────────────────────────

def check_frontend_api():
    print("\n🌐  Cohérence frontend ↔ backend")

    api_ts = FRONTEND / "lib" / "api.ts"
    if not api_ts.exists():
        fail("frontend", "api.ts manquant"); return

    api_src = api_ts.read_text()

    # Vérifie que updateTrackMetadata pointe vers la bonne URL
    if "/tracks/${trackId}`" in api_src and "metadata`" not in api_src.split("updateTrackMetadata")[1][:200]:
        ok("frontend", "updateTrackMetadata → PATCH /tracks/:id ✓")
    elif "/tracks/${trackId}/metadata`" in api_src:
        fail("frontend", "updateTrackMetadata → PATCH /tracks/:id/metadata (URL incorrecte !)")
    else:
        warn("frontend", "updateTrackMetadata URL non détectée")

    # Vérifie que IdentifyResult a label
    if "label?" in api_src or "label:" in api_src:
        if "IdentifyResult" in api_src:
            # check if label is inside IdentifyResult block
            block = api_src.split("IdentifyResult")[1][:200]
            if "label" in block:
                ok("frontend", "IdentifyResult inclut label ✓")
            else:
                warn("frontend", "IdentifyResult n'inclut pas label")
    else:
        warn("frontend", "label absent de api.ts")

    # Vérifie toDisplayTrack lit t.genre
    dashboard = FRONTEND / "app" / "dashboard" / "DashboardV2.tsx"
    if dashboard.exists():
        d_src = dashboard.read_text()
        if "t.genre || analysis.genre" in d_src:
            ok("frontend", "toDisplayTrack : genre = t.genre || analysis.genre ✓")
        elif "analysis.genre" in d_src and "t.genre" not in d_src:
            fail("frontend", "toDisplayTrack lit analysis.genre uniquement — t.genre ignoré")
        else:
            ok("frontend", "toDisplayTrack : genre OK")


# ─── 5. Vérification auto-save désactivé ─────────────────────────────────────

def check_no_autosave():
    print("\n💾  Politique de sauvegarde")
    router_src = (BACKEND / "routers" / "tracks.py").read_text()

    if "_save_identify_result" in router_src:
        fail("autosave", "_save_identify_result encore présente — risque d'écraser sans accord utilisateur")
    else:
        ok("autosave", "Pas d'auto-save dans /identify — sauvegarde uniquement via PATCH /tracks/:id ✓")

    if "db.commit()" in router_src:
        # Count occurrences
        count = router_src.count("db.commit()")
        info("autosave", f"{count} db.commit() dans tracks.py (normal s'ils sont dans des routes PATCH/POST)")


# ─── 6. Appel endpoint distant ────────────────────────────────────────────────

def check_remote(url: str, key: str):
    import urllib.request
    print(f"\n🔌  Endpoint distant : {url}/api/v1/diagnostics")
    try:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/api/v1/diagnostics",
            headers={"X-Diagnostics-Key": key}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())

        print(f"\n  Status global : {'✅ ok' if data['status'] == 'ok' else '⚠️  dégradé'}")
        print(f"  Durée totale  : {data['total_ms']} ms")

        if data["failing"]:
            print(f"\n  {FAIL} Services en échec : {', '.join(data['failing'])}")

        for name, check in data["checks"].items():
            icon = OK if check["ok"] else FAIL
            print(f"\n  {icon} [{name}]  {check['ms']} ms")
            detail = check["detail"]
            if isinstance(detail, dict):
                for k, v in detail.items():
                    print(f"       {k}: {v}")
            else:
                print(f"       {detail}")

    except Exception as e:
        print(f"  {FAIL} Impossible de joindre le serveur : {e}")


# ─── 7. Résumé ───────────────────────────────────────────────────────────────

def print_summary():
    print("\n" + "=" * 60)
    fails  = [i for i in issues if i[0] == "fail"]
    warns  = [i for i in issues if i[0] == "warn"]
    oks    = [i for i in issues if i[0] == "ok"]
    print(f"  {OK}  {len(oks)} checks OK")
    print(f"  {WARN} {len(warns)} avertissements")
    print(f"  {FAIL} {len(fails)} erreurs")
    if fails:
        print(f"\n  Erreurs à corriger :")
        for _, section, msg in fails:
            print(f"    • [{section}] {msg}")
    print("=" * 60)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CueForge diagnostic")
    parser.add_argument("--url", help="URL Railway (ex: https://monapp.railway.app)")
    parser.add_argument("--key", help="DIAGNOSTICS_KEY")
    args = parser.parse_args()

    print("=" * 60)
    print("  CueForge — Diagnostic codebase")
    print("=" * 60)

    check_key_files()
    check_model_schema_sync()
    check_service_imports()
    check_frontend_api()
    check_no_autosave()

    if args.url and args.key:
        check_remote(args.url, args.key)
    elif args.url or args.key:
        print(f"\n  {WARN} --url et --key requis ensemble pour le diagnostic distant")

    print_summary()
