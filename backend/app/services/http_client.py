"""Client HTTP partagé avec connection pooling pour les APIs externes.

Fournit un singleton httpx.Client avec pooling optimisé pour réduire
la latence des appels aux services externes (Spotify, MusicBrainz, iTunes, etc).
"""
import httpx

# Client singleton avec connection pooling
_client = None


def get_http_client() -> httpx.Client:
    """Retourne le client HTTP singleton avec connection pooling.

    Returns:
        httpx.Client configuré avec:
        - Timeout: 10 secondes (global), 5 secondes (connexion)
        - Max connections: 20
        - Max keepalive connections: 10
        - Redirects suivis automatiquement
    """
    global _client
    if _client is None:
        _client = httpx.Client(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            follow_redirects=True,
        )
    return _client


def close_http_client():
    """Ferme et reinitialise le client HTTP singleton.

    À appeler à l'arrêt de l'application pour nettoyer les connexions.
    """
    global _client
    if _client:
        _client.close()
        _client = None
