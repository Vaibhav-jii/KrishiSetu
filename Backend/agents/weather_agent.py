"""
KisanMind Weather Agent
━━━━━━━━━━━━━━━━━━━━━━━
Fetches real-time weather from OpenWeatherMap API,
then uses get_llm() to generate natural language
spray advisories and irrigation recommendations.
"""

import json
import os
import time
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv

from models.state import KisanMindState, WeatherForecastDay, WeatherResult
from utils.llm_provider import get_llm

load_dotenv()

OWM_API_KEY = os.getenv("OPEN_WEATHERMAP_API_KEY") or os.getenv("OPENWEATHERMAP_API_KEY")
OWM_BASE = "https://api.openweathermap.org/data/2.5"


async def _fetch_weather(location: str) -> dict:
    """
    Call OpenWeatherMap for current weather + 5-day forecast.
    Location can be "City, State" format.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Current weather
        current_resp = await client.get(
            f"{OWM_BASE}/weather",
            params={"q": f"{location},IN", "appid": OWM_API_KEY, "units": "metric"},
        )
        current_data = current_resp.json()

        # 5-day / 3-hour forecast
        forecast_resp = await client.get(
            f"{OWM_BASE}/forecast",
            params={"q": f"{location},IN", "appid": OWM_API_KEY, "units": "metric"},
        )
        forecast_data = forecast_resp.json()

    return {"current": current_data, "forecast": forecast_data}


def _parse_current(data: dict) -> WeatherForecastDay:
    """Parse OWM current weather response into our model."""
    main = data.get("main", {})
    wind = data.get("wind", {})
    weather_desc = data.get("weather", [{}])[0].get("description", "N/A")
    rain = data.get("rain", {})
    rain_prob = 80.0 if rain else 10.0  # rough estimate from current data

    return WeatherForecastDay(
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        temp_c=round(main.get("temp", 0), 1),     # Actual current temperature
        temp_min_c=main.get("temp_min", 0),
        temp_max_c=main.get("temp_max", 0),
        humidity_percent=main.get("humidity", 0),
        wind_speed_kmh=round(wind.get("speed", 0) * 3.6, 1),  # m/s → km/h
        rain_probability_percent=rain_prob,
        description=weather_desc,
    )


def _parse_forecast_3d(data: dict) -> list[WeatherForecastDay]:
    """
    Parse OWM 5-day forecast into daily summaries for the next 3 days.
    OWM returns 3-hour intervals; we aggregate per day.
    """
    daily: dict[str, list[dict]] = {}
    for entry in data.get("list", []):
        dt = datetime.utcfromtimestamp(entry["dt"])
        day_key = dt.strftime("%Y-%m-%d")
        if day_key == datetime.utcnow().strftime("%Y-%m-%d"):
            continue  # skip today, we already have current
        daily.setdefault(day_key, []).append(entry)

    result = []
    for day_key in sorted(daily.keys())[:3]:
        entries = daily[day_key]
        temps = [e["main"]["temp"] for e in entries]
        humidities = [e["main"]["humidity"] for e in entries]
        winds = [e.get("wind", {}).get("speed", 0) * 3.6 for e in entries]
        rain_probs = [e.get("pop", 0) * 100 for e in entries]
        descs = [e["weather"][0]["description"] for e in entries if e.get("weather")]

        result.append(
            WeatherForecastDay(
                date=day_key,
                temp_min_c=round(min(temps), 1),
                temp_max_c=round(max(temps), 1),
                humidity_percent=round(sum(humidities) / len(humidities), 1),
                wind_speed_kmh=round(max(winds), 1),
                rain_probability_percent=round(max(rain_probs), 1),
                description=max(set(descs), key=descs.count) if descs else "N/A",
            )
        )

    return result


async def _generate_advisories(
    today: WeatherForecastDay,
    forecast: list[WeatherForecastDay],
    crop_type: str,
) -> tuple[str, str]:
    """Use LLM to generate spray advisory and irrigation recommendation."""
    llm = get_llm()

    weather_summary = json.dumps(
        {
            "today": today.model_dump(),
            "next_3_days": [f.model_dump() for f in forecast],
        },
        indent=2,
    )

    prompt = f"""You are an Indian agricultural weather advisor.
Given the weather data below for a farmer growing {crop_type}, provide:

1. SPRAY ADVISORY: Is it a good or bad time to spray pesticides today?
   Consider wind speed (>15 km/h = bad), rain probability (>40% = bad),
   and humidity. Be specific.

2. IRRIGATION RECOMMENDATION: Should the farmer irrigate today or wait?
   Consider rain forecast, soil moisture inference from humidity, temperature.

Weather Data:
{weather_summary}

Return a JSON with exactly two fields:
{{"spray_advisory": "your advisory text", "irrigation_recommendation": "your recommendation"}}
Return ONLY the JSON, no markdown fences.
"""

    response = await llm.ainvoke(prompt)
    raw = response.content.strip()

    # Strip markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
        return parsed.get("spray_advisory", ""), parsed.get("irrigation_recommendation", "")
    except json.JSONDecodeError:
        return raw, ""


async def run_weather_agent(state: KisanMindState) -> KisanMindState:
    """
    LangGraph node: Fetch weather and generate farming advisories.
    """
    start = time.time()

    location = state.get("location", "Delhi")
    crop_type = state.get("crop_type", "general crop")

    try:
        weather_data = await _fetch_weather(location)

        today = _parse_current(weather_data["current"])
        forecast_3d = _parse_forecast_3d(weather_data["forecast"])

        spray_adv, irrig_rec = await _generate_advisories(today, forecast_3d, crop_type)

        result = WeatherResult(
            today=today,
            forecast_3d=forecast_3d,
            spray_advisory=spray_adv,
            irrigation_recommendation=irrig_rec,
        )

        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["weather_agent"] = round(elapsed, 3)

        return {
            "weather_result": result.model_dump(),
            "agent_times": agent_times,
        }

    except Exception as e:
        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["weather_agent"] = round(elapsed, 3)
        errors = dict(state.get("errors") or {})
        errors["weather_agent"] = str(e)

        return {
            "weather_result": None,
            "agent_times": agent_times,
            "errors": errors,
        }
