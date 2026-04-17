# Activer Redis sur Railway — CueForge

Redis est déjà intégré côté code (`cache_service.py` avec fallback L1 mémoire → L2 Redis).
Il suffit de brancher le service sur Railway pour débloquer le cache L2 partagé entre workers.

## Pourquoi

- Cache applicatif (analyses, identifications AcoustID/MusicBrainz/iTunes/Spotify, sessions, rate-limits)
- Partagé entre tous les workers → bien plus rapide quand le même morceau est demandé 2 fois
- Évite de ré-appeler les APIs externes (coûteux + rate-limités)
- Aujourd'hui : uniquement L1 mémoire par worker (perdu à chaque redéploiement)

## Activer Redis en 3 clics

1. Ouvrir le projet Railway : <https://railway.app>
2. Dans le projet CueForge → **New** → **Database** → **Add Redis**
3. Railway crée automatiquement la variable `REDIS_URL` et la binde au service backend

Le code détecte `REDIS_URL` au démarrage (`app/services/cache_service.py`) et bascule L2 dès
que la connexion s'établit. Rien d'autre à faire.

## Vérification après activation

```bash
# Attendre le redéploiement (~3 min), puis :
curl https://<ton-app>.up.railway.app/health
# → devrait afficher "redis": "connected" si tout est OK
```

Ou depuis les logs Railway : chercher `cache_service` / `Redis connected`.

## Variables à NE PAS définir manuellement

- `REDIS_URL` : Railway l'injecte automatiquement, ne pas le faire à la main
- Tous les autres paramètres de cache ont des valeurs par défaut correctes

## Coût

Railway Redis en plan hobby : ~5$ / mois. Pour un backend API qui fait 500+ req/min,
le gain en latence + la baisse des appels aux APIs externes rentabilisent immédiatement.

## Impact mesuré attendu

- `/tracks/{id}/analysis` : ~200ms → ~20ms sur hits (×10)
- `/identify` AcoustID : ~800ms → ~30ms sur hits (×25, et évite rate-limit)
- Latence p95 globale : -30 à -50% sur les endpoints en lecture
