"""
KisanMind Report Compilation Agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deterministic template-based report generator.
NO LLM call — compiles structured agent outputs into
a clean bilingual markdown report instantly.
"""

import time

from models.state import KisanMindState


async def run_report_agent(state: KisanMindState) -> KisanMindState:
    """
    LangGraph node: Compile all agent results into a
    bilingual advisory report using templates (no LLM).
    """
    start = time.time()

    try:
        disease = state.get("disease_result")
        market = state.get("market_result")
        scheme = state.get("scheme_result")
        weather = state.get("weather_result")
        errors = state.get("errors") or {}
        crop_type = state.get("crop_type", "crop")
        location = state.get("location", "India")
        query = state.get("query", "")

        report = _build_report(query, crop_type, location, disease, market, scheme, weather, errors)

        # Generate PDF (best-effort)
        try:
            from utils.pdf_generator import generate_pdf
            generate_pdf(report, state.get("session_id", "unknown"))
        except Exception:
            pass

        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["report_agent"] = round(elapsed, 3)

        return {
            "final_report": report,
            "agent_times": agent_times,
        }

    except Exception as e:
        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["report_agent"] = round(elapsed, 3)
        errs = dict(state.get("errors") or {})
        errs["report_agent"] = str(e)

        return {
            "final_report": f"# KisanMind Report\n\nReport generation failed: {e}",
            "agent_times": agent_times,
            "errors": errs,
        }


def _build_report(query, crop_type, location, disease, market, scheme, weather, errors):
    """Build a clean bilingual markdown report from structured agent data."""

    sections = []

    # ── Header ──
    sections.append("# 🌾 KisanMind Advisory Report / किसानमाइंड सलाहकार रिपोर्ट\n")

    # ── Farmer Query ──
    sections.append("## Farmer Query / किसान का प्रश्न\n")
    sections.extend([
        f"- Crop / फसल: {crop_type}",
        f"- Location / स्थान: {location}",
    ])
    if query:
        sections.append(f"- Question / प्रश्न: {query}")
    sections.append("")

    # ── Disease Analysis ──
    sections.append("## 🔬 Crop Health Analysis / फसल स्वास्थ्य विश्लेषण\n")
    if disease:
        name = disease.get("disease_name", "Unknown")
        conf = disease.get("confidence_score", 0)
        area = disease.get("affected_area_percent", 0)
        sev = disease.get("severity", "unknown")
        treat = disease.get("treatment", "N/A")
        summary = disease.get("image_analysis_summary", "")

        sev_hi = {"low": "हल्का", "medium": "मध्यम", "high": "गंभीर"}.get(sev, sev)

        sections.extend([
            f"- Disease / रोग: {name}",
            f"- Confidence / विश्वास: {conf}%",
            f"- Affected Area / प्रभावित क्षेत्र: {area}%",
            f"- Severity / तीव्रता: {sev.capitalize()} ({sev_hi})",
            f"- Treatment / उपचार: {treat}",
        ])
        if summary:
            sections.append(f"\n*{summary}*")
    else:
        sections.append("No crop image was provided for disease analysis.")
        sections.append("कोई फसल की तस्वीर रोग विश्लेषण के लिए नहीं दी गई।")
    sections.append("")

    # ── Market Intelligence ──
    sections.append("## 📊 Market Intelligence / बाजार बुद्धिमत्ता\n")
    if market:
        price = market.get("current_price_per_quintal", "N/A")
        trend = market.get("price_trend", "N/A")
        mandi = market.get("best_mandi", "N/A")
        rec = market.get("recommendation", "N/A")
        pred = market.get("predicted_price_7d")
        pred_conf = market.get("prediction_confidence")

        trend_hi = {"up": "बढ़ रहा है ↑", "down": "गिर रहा है ↓", "stable": "स्थिर →"}.get(trend, trend)
        rec_hi = {"sell_now": "अभी बेचें", "wait": "इंतज़ार करें"}.get(rec, rec)

        sections.extend([
            f"- Current Price / वर्तमान भाव: ₹{price}/quintal",
            f"- Price Trend / भाव प्रवृत्ति: {trend.capitalize()} ({trend_hi})",
            f"- Best Mandi / सबसे अच्छी मंडी: {mandi}",
            f"- Recommendation / सलाह: {rec.replace('_', ' ').capitalize()} ({rec_hi})",
        ])
        if pred:
            sections.append(f"- 7-Day ML Prediction / 7 दिन का अनुमान: ₹{pred}/quintal")
        if pred_conf:
            sections.append(f"- Prediction Confidence: {pred_conf}%")
    else:
        sections.append("Market data is currently unavailable.")
        sections.append("बाज़ार डेटा वर्तमान में उपलब्ध नहीं है।")
    sections.append("")

    # ── Government Schemes ──
    sections.append("## 🏛️ Government Schemes / सरकारी योजनाएं\n")
    if scheme and scheme.get("eligible_schemes"):
        for s in scheme["eligible_schemes"]:
            sname = s.get("scheme_name", "Unknown")
            desc = s.get("description", "")
            elig = s.get("eligibility", "")
            steps = s.get("application_steps", "")
            source_url = s.get("source_url", "")

            sections.append(f"### {sname}")
            if desc:
                sections.append(f"- {desc}")
            if elig:
                sections.append(f"- Eligibility / पात्रता: {elig}")
            if steps:
                sections.append(f"- How to apply / आवेदन: {steps}")
            if source_url:
                sections.append(f"- Portal: {source_url}")
            sections.append("")
    else:
        sections.append("Scheme data is currently unavailable.")
        sections.append("योजना डेटा वर्तमान में उपलब्ध नहीं है।")
    sections.append("")

    # ── Weather Advisory ──
    sections.append("## 🌤️ Weather Advisory / मौसम सलाह\n")
    if weather:
        today = weather.get("today")
        if today:
            desc = today.get("description", "")
            tmin = today.get("temp_min_c", "")
            tmax = today.get("temp_max_c", "")
            hum = today.get("humidity_percent", "")
            rain = today.get("rain_probability_percent", "")
            wind = today.get("wind_speed_kmh", "")

            sections.append(f"### Today / आज: {desc}")
            sections.append(f"- Temperature / तापमान: {tmin}°C – {tmax}°C")
            sections.append(f"- Humidity / आर्द्रता: {hum}%")
            sections.append(f"- Rain Probability / वर्षा: {rain}%")
            if wind:
                sections.append(f"- Wind / हवा: {wind} km/h")

        forecast = weather.get("forecast_3d", [])
        if forecast:
            sections.append("\n### 3-Day Forecast / 3 दिन का पूर्वानुमान")
            for day in forecast:
                d = day.get("date", "")
                ddesc = day.get("description", "")
                dmin = day.get("temp_min_c", "")
                dmax = day.get("temp_max_c", "")
                drain = day.get("rain_probability_percent", "")
                sections.append(f"- {d}: {ddesc}, {dmin}–{dmax}°C, Rain {drain}%")

        spray = weather.get("spray_advisory", "")
        irr = weather.get("irrigation_recommendation", "")
        if spray:
            sections.append(f"\n- Spray Advisory / छिड़काव सलाह: {spray}")
        if irr:
            sections.append(f"- Irrigation / सिंचाई: {irr}")
    else:
        sections.append("Weather data is currently unavailable.")
        sections.append("मौसम डेटा वर्तमान में उपलब्ध नहीं है।")
    sections.append("")

    # ── Action Items ──
    sections.append("## 📋 Action Items / कार्य योजना\n")
    actions = _generate_action_items(disease, market, weather)
    for a in actions:
        sections.append(f"- {a}")
    sections.append("")

    # ── Footer ──
    sections.append("---")
    sections.append("*Report generated by KisanMind AI Advisory System*")

    # ── Errors ──
    if errors:
        sections.append("\n> **Note:** Some agents encountered errors. Data may be partial.")
        for agent, err in errors.items():
            sections.append(f"> - {agent}: {err}")

    return "\n".join(sections)


def _generate_action_items(disease, market, weather):
    """Generate 3-5 actionable bullet points from agent data."""
    items = []

    if disease:
        name = disease.get("disease_name", "")
        sev = disease.get("severity", "")
        treat = disease.get("treatment", "")
        if name and name.lower() not in ("healthy", "unable to determine"):
            items.append(f"Apply treatment immediately: {treat}")
            if sev == "high":
                items.append("Severity is HIGH — inspect all nearby plants and isolate affected area")
            elif sev == "medium":
                items.append("Monitor treated plants after 5-7 days for improvement")
        elif name and name.lower() == "healthy":
            items.append("Crop is healthy — continue regular maintenance and monitoring")

    if market:
        rec = market.get("recommendation", "")
        price = market.get("current_price_per_quintal", "")
        mandi = market.get("best_mandi", "")
        if rec == "sell_now" and mandi:
            items.append(f"Consider selling at {mandi} (current price ₹{price}/quintal)")
        elif rec == "wait":
            items.append("Hold your produce — prices expected to improve in 7 days")

    if weather:
        spray = weather.get("spray_advisory", "")
        rain = 0
        today = weather.get("today")
        if today:
            rain = today.get("rain_probability_percent", 0)
        if rain and rain > 60:
            items.append("Heavy rain expected — postpone spraying and ensure proper drainage")
        elif spray and "good" in spray.lower():
            items.append("Good weather for spraying — apply pesticides today if needed")

    if not items:
        items.append("Review the detailed sections above and plan accordingly")
        items.append("Consult your local KVK (Krishi Vigyan Kendra) for personalized guidance")

    return items
