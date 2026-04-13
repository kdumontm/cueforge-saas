"""
Circuit Breaker pattern for external service resilience.

Protects CueForge from cascading failures when external services
(Spotify, MusicBrainz, iTunes, AcoustID, Discogs, Last.fm) fail.

States:
- CLOSED: normal operation, requests pass through
- OPEN: service failing, requests fail fast with fallback
- HALF_OPEN: testing if service recovered, single request allowed

Configuration per service:
- failure_threshold: 5 consecutive failures → OPEN
- reset_timeout: 60s in HALF_OPEN state before retry
- timeout_per_request: 10s (external services)
"""
import time
import logging
from enum import Enum
from typing import Dict, Optional, Callable, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker state machine."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Single service circuit breaker with state management."""

    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        reset_timeout: int = 60,
    ):
        """
        Args:
            service_name: Name of external service (e.g. 'spotify', 'musicbrainz')
            failure_threshold: Consecutive failures before OPEN
            reset_timeout: Seconds to wait in HALF_OPEN before retry
        """
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.half_open_attempts = 0

    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with circuit breaker protection.
        Returns (result, success) tuple.
        """
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
                self.half_open_attempts = 0
                logger.info(f"[CB] {self.service_name} → HALF_OPEN, testing recovery")
            else:
                logger.debug(f"[CB] {self.service_name} OPEN, failing fast")
                return None, False

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result, True
        except Exception as e:
            self._on_failure()
            logger.debug(f"[CB] {self.service_name} failed: {e}")
            return None, False

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to retry OPEN circuit."""
        if not self.last_failure_time:
            return False
        elapsed = (datetime.now() - self.last_failure_time).total_seconds()
        return elapsed >= self.reset_timeout

    def _on_success(self) -> None:
        """Handle successful request."""
        if self.state == CircuitState.HALF_OPEN:
            self.failure_count = 0
            self.state = CircuitState.CLOSED
            logger.info(f"[CB] {self.service_name} recovered → CLOSED")
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0

    def _on_failure(self) -> None:
        """Handle failed request."""
        self.failure_count += 1
        self.last_failure_time = datetime.now()

        if self.state == CircuitState.HALF_OPEN:
            # Fail immediately back to OPEN
            self.state = CircuitState.OPEN
            logger.warning(f"[CB] {self.service_name} HALF_OPEN→OPEN (still failing)")
        elif self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(
                f"[CB] {self.service_name} threshold reached ({self.failure_count}) → OPEN"
            )

    def is_open(self) -> bool:
        """Check if circuit is open (failing fast)."""
        if self.state == CircuitState.OPEN and self._should_attempt_reset():
            self.state = CircuitState.HALF_OPEN
        return self.state == CircuitState.OPEN

    def get_status(self) -> Dict[str, Any]:
        """Return circuit status for monitoring."""
        return {
            "service": self.service_name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "threshold": self.failure_threshold,
        }


# Global registry of circuit breakers per service
_breakers: Dict[str, CircuitBreaker] = {}

# Services that need circuit breakers
EXTERNAL_SERVICES = [
    "acoustid",
    "musicbrainz",
    "spotify",
    "itunes",
    "discogs",
    "lastfm",
]


def get_breaker(service_name: str) -> CircuitBreaker:
    """Get or create a circuit breaker for a service."""
    if service_name not in _breakers:
        _breakers[service_name] = CircuitBreaker(
            service_name,
            failure_threshold=5,
            reset_timeout=60,
        )
    return _breakers[service_name]


def get_all_breakers() -> Dict[str, Dict[str, Any]]:
    """Get status of all circuit breakers."""
    return {
        name: breaker.get_status()
        for name, breaker in _breakers.items()
    }


def reset_all_breakers() -> None:
    """Reset all circuit breakers to CLOSED (for testing)."""
    for breaker in _breakers.values():
        breaker.state = CircuitState.CLOSED
        breaker.failure_count = 0
        breaker.last_failure_time = None
    logger.info("[CB] All circuit breakers reset to CLOSED")


def reset_breaker(service_name: str) -> None:
    """Reset a single circuit breaker."""
    if service_name in _breakers:
        breaker = _breakers[service_name]
        breaker.state = CircuitState.CLOSED
        breaker.failure_count = 0
        breaker.last_failure_time = None
        logger.info(f"[CB] {service_name} reset to CLOSED")
