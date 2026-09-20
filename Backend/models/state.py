"""
KisanMind Shared State
━━━━━━━━━━━━━━━━━━━━━
Pydantic-validated state that flows through every LangGraph node.
Each agent reads from and writes to this single TypedDict so
LangGraph can checkpoint, serialize, and parallelize cleanly.
"""

from __future__ import annotations

import operator
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ──────────────────────────────────────────────
# Pydantic models for structured agent outputs
# ──────────────────────────────────────────────

class DiseaseResult(BaseModel):
    """Output of the Disease Detection Agent (Gemini Vision)."""
    disease_name: str = Field(..., description="Identified disease name")
    confidence_score: float = Field(..., ge=0, le=100, description="Confidence %")
    affected_area_percent: float = Field(..., ge=0, le=100, description="Estimated affected area %")
    severity: str = Field(..., pattern="^(low|medium|high)$", description="Severity level")
    treatment: str = Field(..., description="Treatment recommendation with pesticide name & dosage (ml/acre)")
    image_analysis_summary: str = Field(default="", description="Brief description of what was seen in the image")


class MarketResult(BaseModel):
    """Output of the Market Intelligence Agent."""
    current_price_per_quintal: float = Field(..., description="Current mandi price ₹/quintal")
    price_trend: str = Field(..., pattern="^(up|down|stable)$", description="Price trend direction")
    best_mandi: str = Field(..., description="Best nearby mandi name")
    recommendation: str = Field(..., description="sell_now / wait")
    predicted_price_7d: Optional[float] = Field(None, description="ML-predicted price in 7 days")
    prediction_confidence: Optional[float] = Field(None, ge=0, le=100, description="Prediction confidence %")
    data_source: str = Field(default="tavily", description="Where the price data came from")


class SchemeInfo(BaseModel):
    """A single government scheme."""
    scheme_name: str
    description: str
    eligibility: str = ""
    application_steps: str = ""
    deadline: Optional[str] = None
    source_url: Optional[str] = None
    confidence: Literal["high", "medium", "low"] = "low"


class SchemeResult(BaseModel):
    """Output of the Government Scheme Agent."""
    eligible_schemes: list[SchemeInfo] = Field(default_factory=list)
    total_found: int = 0
    state_specific: bool = False


class WeatherForecastDay(BaseModel):
    """Weather for a single day."""
    date: str
    temp_c: Optional[float] = None          # Actual current temperature (today only)
    temp_min_c: float
    temp_max_c: float
    humidity_percent: float
    wind_speed_kmh: float
    rain_probability_percent: float
    description: str


class WeatherResult(BaseModel):
    """Output of the Weather Agent."""
    today: Optional[WeatherForecastDay] = None
    forecast_3d: list[WeatherForecastDay] = Field(default_factory=list)
    spray_advisory: str = Field(default="", description="good / bad time to spray, with reason")
    irrigation_recommendation: str = Field(default="", description="Irrigation advice based on weather")


# ──────────────────────────────────────────────
# LangGraph TypedDict State
# ──────────────────────────────────────────────

class KisanMindState(TypedDict, total=False):
    """
    Central state that flows through the LangGraph pipeline.

    Using TypedDict (not Pydantic BaseModel) because LangGraph
    requires TypedDict for its StateGraph. Individual agent
    outputs are validated via Pydantic models above before
    being stored into this dict.
    """

    # ── User Inputs ──
    query: str
    crop_type: str
    location: str
    image_base64: Optional[str]

    # ── Agent Outputs ──
    disease_result: Optional[dict[str, Any]]
    market_result: Optional[dict[str, Any]]
    scheme_result: Optional[dict[str, Any]]
    weather_result: Optional[dict[str, Any]]

    # ── Final Output ──
    final_report: Optional[str]

    # ── Performance Metrics ──
    execution_time_parallel: Optional[float]
    execution_time_sequential: Optional[float]
    agent_times: Annotated[dict[str, float], operator.ior]  # individual agent timings

    # ── Session Metadata ──
    session_id: str
    timestamp: str  # ISO format string (JSON-serializable)

    # ── Error Tracking ──
    errors: Annotated[dict[str, str], operator.ior]  # agent_name -> error message


def create_initial_state(
    query: str,
    crop_type: str,
    location: str,
    image_base64: Optional[str] = None,
    session_id: Optional[str] = None,
) -> KisanMindState:
    """
    Factory function to create a properly initialized state dict.
    Guarantees all required fields are present with safe defaults.
    """
    return KisanMindState(
        query=query,
        crop_type=crop_type,
        location=location,
        image_base64=image_base64,
        disease_result=None,
        market_result=None,
        scheme_result=None,
        weather_result=None,
        final_report=None,
        execution_time_parallel=None,
        execution_time_sequential=None,
        agent_times={},
        session_id=session_id or str(uuid.uuid4()),
        timestamp=datetime.utcnow().isoformat(),
        errors={},
    )
