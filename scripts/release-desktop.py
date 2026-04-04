#!/usr/bin/env python3
"""
Script de release automatique pour CueForge Desktop.

Usage :
  python3 scripts/release-desktop.py              # auto-bump patch (2.8.0 → 2.8.1)
  python3 scripts/release-desktop.py minor         # bump minor (2.8.0 → 2.9.0)
  python3 scripts/release-desktop.py major         # bump major (2.8.0 → 3.0.0)
  python3 scripts/release-desktop.py 3.1.0         # version exacte

Ce script :
1. Bumpe la version dans desktop/package.json
2. Commit et push sur main
3. Le CI GitHub Actions détecte le push dans desktop/** et build automatiquement
4. electron-builder publie les .dmg/.exe sur GitHub Releases
5. L'app desktop détecte la nouvelle version via electron-updater → popup
6. Le backend fetch la release GitHub → site web à jour

Zéro intervention manuelle après l'exécution de ce script.
"""

import json
import subprocess
import sys
import os


def get_repo_root():
    """Trouver la racine du repo git."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def read_version(package_path):
    """Lire la version actuelle depuis package.json."""
    with open(package_path, "r") as f:
        data = json.load(f)
    return data["version"]


def bump_version(current: str, bump_type: str) -> str:
    """Calculer la nouvelle version."""
    parts = current.split(".")
    if len(parts) != 3:
        raise ValueError(f"Version invalide : {current}")

    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])

    if bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    elif bump_type == "major":
        return f"{major + 1}.0.0"
    else:
        # Version exacte fournie
        return bump_type


def write_version(package_path, new_version):
    """Écrire la nouvelle version dans package.json."""
    with open(package_path, "r") as f:
        data = json.load(f)

    data["version"] = new_version

    with open(package_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def run(cmd, cwd=None):
    """Exécuter une commande shell."""
    print(f"  → {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ Erreur : {result.stderr.strip()}")
        sys.exit(1)
    return result.stdout.strip()


def main():
    # Déterminer le type de bump
    bump_type = sys.argv[1] if len(sys.argv) > 1 else "patch"

    # Valider
    valid_types = ["patch", "minor", "major"]
    if bump_type not in valid_types:
        # Vérifier si c'est une version exacte (X.Y.Z)
        parts = bump_type.split(".")
        if len(parts) != 3 or not all(p.isdigit() for p in parts):
            print(f"✗ Usage : {sys.argv[0]} [patch|minor|major|X.Y.Z]")
            sys.exit(1)

    # Trouver les fichiers
    repo_root = get_repo_root()
    package_path = os.path.join(repo_root, "desktop", "package.json")

    if not os.path.exists(package_path):
        print("✗ desktop/package.json introuvable")
        sys.exit(1)

    # Lire la version actuelle
    current = read_version(package_path)
    new_version = bump_version(current, bump_type)

    print(f"\n🔖 CueForge Desktop Release")
    print(f"  Version actuelle : {current}")
    print(f"  Nouvelle version : {new_version}")
    print()

    # Écrire la nouvelle version
    print("1️⃣  Bump version dans desktop/package.json")
    write_version(package_path, new_version)

    # Commit
    print("\n2️⃣  Commit")
    run(["git", "add", "desktop/package.json"], cwd=repo_root)
    run(["git", "commit", "-m", f"🔖 release desktop v{new_version}"], cwd=repo_root)

    # Push
    print("\n3️⃣  Push sur main")
    run(["git", "push", "origin", "main"], cwd=repo_root)

    print(f"\n✅ Release v{new_version} lancée !")
    print()
    print("Le CI va maintenant :")
    print(f"  → Builder macOS (.dmg) + Windows (.exe)")
    print(f"  → Publier sur GitHub Releases v{new_version}")
    print(f"  → L'app desktop proposera la mise à jour automatiquement")
    print(f"  → Le site web affichera v{new_version} dans ~5 min")
    print()
    print(f"Suivre le build : https://github.com/kdumontm/cueforge-saas/actions")


if __name__ == "__main__":
    main()
