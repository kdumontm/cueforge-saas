"""
Observability Service — Points 871-900
Logging structuré, tracing distribué, métriques, SLO, alertes, anomalies.
"""

import json
import logging
import math
import statistics
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

import structlog


class MetricType(Enum):
    """Types de métriques"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"


@dataclass
class TraceContext:
    """Contexte de trace distribuée"""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    tags: Dict[str, Any] = field(default_factory=dict)
    start_time: datetime = field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None

    @property
    def duration_ms(self) -> float:
        """Durée en ms"""
        if self.end_time:
            return (self.end_time - self.start_time).total_seconds() * 1000
        return 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convertir en dict"""
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "duration_ms": self.duration_ms,
            "tags": self.tags,
        }


@dataclass
class Metric:
    """Métrique enregistrée"""
    name: str
    type: MetricType
    value: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    labels: Dict[str, str] = field(default_factory=dict)
    unit: str = ""


@dataclass
class ErrorEvent:
    """Événement d'erreur"""
    error_type: str
    message: str
    trace_context: TraceContext
    timestamp: datetime = field(default_factory=datetime.utcnow)
    stack_trace: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    severity: str = "error"  # error, warning, critical


@dataclass
class SLODefinition:
    """Définition d'un SLO"""
    name: str
    metric: str
    target: float
    unit: str
    window_minutes: int = 30
    description: str = ""


@dataclass
class AlertRule:
    """Règle d'alerte"""
    name: str
    metric: str
    threshold: float
    comparison: str  # >, <, ==, >=, <=
    duration_minutes: int = 5
    severity: str = "warning"  # warning, critical


class ObservabilityService:
    """Service d'observabilité (Points 871-900)"""

    def __init__(self):
        self.trace_contexts: Dict[str, TraceContext] = {}
        self.metrics: List[Metric] = []
        self.error_events: List[ErrorEvent] = []
        self.slo_definitions: Dict[str, SLODefinition] = {}
        self.alert_rules: List[AlertRule] = []
        self.alert_history: List[Dict[str, Any]] = []
        self.anomaly_detections: List[Dict[str, Any]] = []
        self.metric_aggregations: Dict[str, List[float]] = defaultdict(list)
        self.structured_logger = self._setup_structured_logging()

    def setup_structured_logging(self) -> structlog.PrintLogger:
        """
        Points 873: Logging JSON structuré avec context
        Retourne le logger structuré
        """
        return self.structured_logger

    def _setup_structured_logging(self) -> structlog.PrintLogger:
        """Configure structlog avec JSON output"""
        structlog.configure(
            processors=[
                structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
                structlog.processors.JSONRenderer(),
            ],
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
        )
        return structlog.get_logger()

    def create_trace_context(
        self,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
        tags: Optional[Dict[str, Any]] = None,
    ) -> TraceContext:
        """
        Points 874: Context de trace distribuée (trace_id, span_id)
        Retourne TraceContext créé
        """
        trace_id = trace_id or str(uuid.uuid4())
        span_id = str(uuid.uuid4())

        context = TraceContext(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            tags=tags or {},
        )

        self.trace_contexts[span_id] = context

        self.structured_logger.info(
            "trace_started",
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
        )

        return context

    def record_metric(
        self,
        name: str,
        value: float,
        metric_type: MetricType = MetricType.GAUGE,
        labels: Optional[Dict[str, str]] = None,
        unit: str = "",
    ) -> None:
        """
        Points 875: Enregistrement de métriques custom (counter, gauge, histogram)
        """
        metric = Metric(
            name=name,
            type=metric_type,
            value=value,
            labels=labels or {},
            unit=unit,
        )

        self.metrics.append(metric)

        # Agrégation pour calculs futurs
        self.metric_aggregations[name].append(value)

        # Limiter la taille de l'agrégation en mémoire
        if len(self.metric_aggregations[name]) > 10000:
            self.metric_aggregations[name] = self.metric_aggregations[name][-5000:]

        self.structured_logger.info(
            "metric_recorded",
            metric_name=name,
            value=value,
            type=metric_type.value,
        )

    def track_error(
        self,
        error: Exception,
        trace_context: Optional[TraceContext] = None,
        context: Optional[Dict[str, Any]] = None,
        severity: str = "error",
    ) -> None:
        """
        Points 876: Tracking d'erreur avec context complet (Sentry-compatible)
        """
        if trace_context is None:
            trace_context = self.create_trace_context()

        import traceback
        stack_trace = traceback.format_exc()

        error_event = ErrorEvent(
            error_type=type(error).__name__,
            message=str(error),
            trace_context=trace_context,
            stack_trace=stack_trace,
            context=context or {},
            severity=severity,
        )

        self.error_events.append(error_event)

        # Log structuré (Sentry-compatible)
        self.structured_logger.error(
            "error_tracked",
            error_type=error_event.error_type,
            message=error_event.message,
            trace_id=trace_context.trace_id,
            span_id=trace_context.span_id,
            severity=severity,
            context=context,
        )

    def define_slo(
        self,
        name: str,
        metric: str,
        target: float,
        unit: str = "ms",
        window_minutes: int = 30,
        description: str = "",
    ) -> SLODefinition:
        """
        Points 877: Définition de SLO (ex: p95 < 30s pour l'analyse)
        Retourne la SLODefinition créée
        """
        slo = SLODefinition(
            name=name,
            metric=metric,
            target=target,
            unit=unit,
            window_minutes=window_minutes,
            description=description,
        )

        self.slo_definitions[name] = slo

        self.structured_logger.info(
            "slo_defined",
            slo_name=name,
            target=target,
            unit=unit,
        )

        return slo

    def check_slo_compliance(self, slo_name: str) -> Dict[str, Any]:
        """
        Points 878: Vérification de conformité SLO
        Retourne dict avec compliance status
        """
        if slo_name not in self.slo_definitions:
            return {"error": f"SLO {slo_name} not found"}

        slo = self.slo_definitions[slo_name]
        metric_values = self.metric_aggregations.get(slo.metric, [])

        if not metric_values:
            return {
                "slo_name": slo_name,
                "status": "unknown",
                "reason": "No metrics recorded",
            }

        # Calculer le percentile (p95 par défaut)
        if "p95" in slo.metric:
            sorted_values = sorted(metric_values)
            p95_index = int(len(sorted_values) * 0.95)
            actual_value = sorted_values[p95_index] if p95_index < len(sorted_values) else 0
        else:
            actual_value = statistics.mean(metric_values)

        is_compliant = actual_value <= slo.target
        compliance_pct = (actual_value / slo.target * 100) if slo.target > 0 else 0

        return {
            "slo_name": slo_name,
            "target": slo.target,
            "actual": actual_value,
            "compliant": is_compliant,
            "compliance_percentage": compliance_pct,
            "sample_count": len(metric_values),
        }

    def create_dashboard_config(self) -> Dict[str, Any]:
        """
        Points 879: Config de dashboard monitoring auto-générée
        Retourne dict avec config Grafana/Datadog-compatible
        """
        dashboard = {
            "title": "CueForge Monitoring Dashboard",
            "panels": [],
            "refresh": "30s",
            "time": {"from": "now-1h", "to": "now"},
        }

        # Panel 1: Error Rate
        dashboard["panels"].append({
            "title": "Error Rate (%)",
            "targets": [{"expr": 'rate(errors_total[5m]) / rate(requests_total[5m])'}],
            "alert": {
                "rule": "error_rate > 5%",
                "severity": "critical",
            },
        })

        # Panel 2: P95 Latency
        dashboard["panels"].append({
            "title": "P95 Latency (ms)",
            "targets": [{"expr": 'histogram_quantile(0.95, latency_ms)'}],
            "alert": {
                "rule": "p95_latency > 60000",
                "severity": "warning",
            },
        })

        # Panel 3: Throughput
        dashboard["panels"].append({
            "title": "Throughput (req/s)",
            "targets": [{"expr": 'rate(requests_total[1m])'}],
        })

        # Panel 4: SLO Compliance
        for slo_name in self.slo_definitions:
            compliance = self.check_slo_compliance(slo_name)
            dashboard["panels"].append({
                "title": f"SLO: {slo_name}",
                "value": compliance.get("compliance_percentage", 0),
            })

        self.structured_logger.info(
            "dashboard_config_created",
            panel_count=len(dashboard["panels"]),
        )

        return dashboard

    def detect_anomalies(
        self,
        metric_name: str,
        z_score_threshold: float = 3.0,
    ) -> List[Dict[str, Any]]:
        """
        Points 880: Détection d'anomalies sur les métriques (z-score)
        Retourne liste des anomalies détectées
        """
        values = self.metric_aggregations.get(metric_name, [])

        if len(values) < 5:  # Besoin min 5 points
            return []

        mean = statistics.mean(values)
        stdev = statistics.stdev(values) if len(values) > 1 else 0

        if stdev == 0:
            return []

        anomalies = []

        for i, value in enumerate(values[-10:]):  # Vérifier les 10 derniers
            z_score = abs((value - mean) / stdev)

            if z_score > z_score_threshold:
                anomaly = {
                    "metric": metric_name,
                    "timestamp": datetime.utcnow().isoformat(),
                    "value": value,
                    "mean": mean,
                    "z_score": z_score,
                    "severity": "critical" if z_score > 5 else "warning",
                }

                anomalies.append(anomaly)
                self.anomaly_detections.append(anomaly)

                self.structured_logger.warning(
                    "anomaly_detected",
                    metric=metric_name,
                    value=value,
                    z_score=z_score,
                )

        return anomalies

    def alert_on_threshold(
        self,
        metric_name: str,
        threshold: float,
        comparison: str = ">",
        duration_minutes: int = 5,
        severity: str = "warning",
    ) -> Optional[Dict[str, Any]]:
        """
        Points 881: Alertes sur seuils (error rate > 5%, latency p95 > 60s)
        Retourne l'alerte si déclenchée, None sinon
        """
        values = self.metric_aggregations.get(metric_name, [])

        if not values:
            return None

        # Prendre les valeurs des dernières 'duration_minutes' secondes
        recent_values = values[-100:]  # Simplifié

        # Évaluer la condition
        mean_value = statistics.mean(recent_values)

        trigger_alert = False

        if comparison == ">" and mean_value > threshold:
            trigger_alert = True
        elif comparison == "<" and mean_value < threshold:
            trigger_alert = True
        elif comparison == ">=" and mean_value >= threshold:
            trigger_alert = True
        elif comparison == "<=" and mean_value <= threshold:
            trigger_alert = True
        elif comparison == "==" and mean_value == threshold:
            trigger_alert = True

        if trigger_alert:
            alert = {
                "name": f"{metric_name}_threshold",
                "metric": metric_name,
                "threshold": threshold,
                "actual_value": mean_value,
                "severity": severity,
                "timestamp": datetime.utcnow().isoformat(),
            }

            self.alert_history.append(alert)

            self.structured_logger.warning(
                "alert_triggered",
                metric=metric_name,
                threshold=threshold,
                actual_value=mean_value,
                severity=severity,
            )

            return alert

        return None

    def correlate_logs_traces_metrics(
        self,
        trace_id: str,
    ) -> Dict[str, Any]:
        """
        Points 882: Corrélation logs ↔ traces ↔ métriques
        Retourne correlation report pour un trace_id
        """
        # Trouver les traces avec ce trace_id
        related_traces = [
            ctx for ctx in self.trace_contexts.values()
            if ctx.trace_id == trace_id
        ]

        # Trouver les erreurs avec ce trace_id
        related_errors = [
            err for err in self.error_events
            if err.trace_context.trace_id == trace_id
        ]

        # Trouver les métriques (par timestamp proximity)
        if related_traces:
            start_time = min(t.start_time for t in related_traces)
            end_time = max(t.end_time or datetime.utcnow() for t in related_traces)

            related_metrics = [
                m for m in self.metrics
                if start_time <= m.timestamp <= end_time
            ]
        else:
            related_metrics = []

        correlation_report = {
            "trace_id": trace_id,
            "traces": [t.to_dict() for t in related_traces],
            "errors": [
                {
                    "type": e.error_type,
                    "message": e.message,
                    "severity": e.severity,
                    "timestamp": e.timestamp.isoformat(),
                }
                for e in related_errors
            ],
            "metrics": [
                {
                    "name": m.name,
                    "value": m.value,
                    "timestamp": m.timestamp.isoformat(),
                }
                for m in related_metrics
            ],
            "summary": {
                "total_traces": len(related_traces),
                "total_errors": len(related_errors),
                "total_metrics": len(related_metrics),
                "has_errors": len(related_errors) > 0,
            },
        }

        self.structured_logger.info(
            "correlation_generated",
            trace_id=trace_id,
            error_count=len(related_errors),
        )

        return correlation_report

    def end_trace(self, span_id: str) -> Optional[TraceContext]:
        """Terminer une trace et la retourner"""
        if span_id not in self.trace_contexts:
            return None

        context = self.trace_contexts[span_id]
        context.end_time = datetime.utcnow()

        self.structured_logger.info(
            "trace_ended",
            span_id=span_id,
            duration_ms=context.duration_ms,
        )

        return context

    def get_observability_summary(self) -> Dict[str, Any]:
        """Retourne un résumé global d'observabilité"""
        total_metrics = len(self.metrics)
        total_errors = len(self.error_events)
        active_traces = len([
            ctx for ctx in self.trace_contexts.values()
            if ctx.end_time is None
        ])

        recent_alerts = self.alert_history[-10:]

        return {
            "metrics_recorded": total_metrics,
            "errors_tracked": total_errors,
            "active_traces": active_traces,
            "slos_defined": len(self.slo_definitions),
            "recent_alerts": recent_alerts,
            "anomalies_detected": len(self.anomaly_detections),
        }
