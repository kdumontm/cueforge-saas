# CueForge — App Mac

Application de bureau pour macOS qui wrape le site CueForge avec des fonctionnalités natives.

## Fonctionnalités

- **Drag & Drop** : Glissez des fichiers audio depuis le Finder directement dans l'app
- **Notifications macOS** : Alertes natives quand l'analyse d'un track est terminée
- **Menu bar** : Accès rapide via l'icône dans la barre de menu
- **Dock** : Badge avec le nombre de tracks en cours d'analyse
- **Mode hybride** : Fonctionne en ligne, avec page offline quand pas de réseau
- **Raccourcis clavier** : Cmd+1/2/3 pour naviguer rapidement

## Développement

```bash
cd desktop
npm install
npm start
```

## Build

```bash
# Générer le .dmg
npm run build:dmg

# Générer le .zip
npm run build:zip
```

## Icônes

```bash
# Générer les SVG de base
node scripts/generate-icons.js

# Puis convertir en .icns (macOS uniquement)
# Voir scripts/generate-icons.js pour les instructions
```
