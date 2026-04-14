"""
Admin routers — Back-office API pour TrackCue.

Chaque sous-module gère un domaine isolé :
  settings    → Config globale du site
  pages       → CRUD pages
  sections    → CRUD sections (dans une page)
  components  → CRUD composants (dans une section)
  media       → Upload / gestion des médias
  features    → Feature flags par plan + verrous
  users       → Gestion des utilisateurs
  public      → Endpoints publics du site (pas admin)
  dashboard   → Stats admin
"""
