#!/bin/bash
# ─── TrackCue — Script de release automatique ────────────────────────────────
# Usage : ./scripts/release.sh <patch|minor|major> "Description de la release"
#
# Ce script :
#   1. Bump la version dans desktop/package.json
#   2. Met à jour le fallback dans backend/app/routers/downloads.py
#   3. Commit + tag + push (déclenche le workflow GitHub Actions)
#   4. Crée la release GitHub avec les notes
#
# Le workflow build-desktop.yml se charge de builder les .dmg/.exe et
# les attacher automatiquement à la release.

set -euo pipefail

BUMP_TYPE="${1:-patch}"
DESCRIPTION="${2:-Release automatique}"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "❌ Usage : $0 <patch|minor|major> \"Description\""
    exit 1
fi

cd "$(git rev-parse --show-toplevel)"

# ── Lire la version actuelle ──────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('./desktop/package.json').version")
echo "📦 Version actuelle : $CURRENT_VERSION"

# ── Calculer la nouvelle version ──────────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case $BUMP_TYPE in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "🚀 Nouvelle version : $NEW_VERSION"

# ── Bump desktop/package.json ─────────────────────────────────────────────────
cd desktop
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
cd ..
echo "✅ desktop/package.json → v$NEW_VERSION"

# ── Mettre à jour le fallback dans downloads.py ───────────────────────────────
sed -i.bak "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$NEW_VERSION\"/" backend/app/routers/downloads.py
sed -i.bak "s|/download/v[0-9]*\.[0-9]*\.[0-9]*/TrackCue-[0-9]*\.[0-9]*\.[0-9]*|/download/v${NEW_VERSION}/TrackCue-${NEW_VERSION}|g" backend/app/routers/downloads.py
rm -f backend/app/routers/downloads.py.bak
echo "✅ downloads.py fallback → v$NEW_VERSION"

# ── Commit + tag + push ───────────────────────────────────────────────────────
git add desktop/package.json backend/app/routers/downloads.py
git commit -m "release: v$NEW_VERSION — $DESCRIPTION"
git tag -a "v$NEW_VERSION" -m "$DESCRIPTION"
git push origin main --tags
echo "✅ Commit + tag v$NEW_VERSION pushé"

# ── Créer la release GitHub ───────────────────────────────────────────────────
if command -v gh &> /dev/null; then
    gh release create "v$NEW_VERSION" \
        --title "TrackCue v$NEW_VERSION" \
        --notes "$DESCRIPTION" \
        --latest
    echo "✅ Release GitHub créée : v$NEW_VERSION"
    echo "⏳ Le workflow build-desktop.yml va builder les .dmg/.exe automatiquement"
else
    echo "⚠️  gh CLI non disponible — release GitHub à créer manuellement"
    echo "   gh release create v$NEW_VERSION --title 'TrackCue v$NEW_VERSION' --notes '$DESCRIPTION'"
fi

echo ""
echo "🎉 Release v$NEW_VERSION terminée !"
echo "   → GitHub : https://github.com/kdumontm/cueforge-saas/releases/tag/v$NEW_VERSION"
