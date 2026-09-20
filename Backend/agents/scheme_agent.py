"""
KisanMind Government Scheme Agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Uses Tavily to search PM-KISAN, PM Fasal Bima Yojana,
and state-specific agricultural schemes relevant to
the farmer's crop, state, and situation.
"""

import json
import os
import re
import time

from dotenv import load_dotenv
from tavily import TavilyClient

from models.state import KisanMindState, SchemeInfo, SchemeResult
from utils.llm_provider import get_llm

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# Static, known-good portals — don't let search+LLM gamble on these.
KNOWN_SCHEMES = {
    "PM-KISAN": "https://pmkisan.gov.in",
    "PM FASAL BIMA YOJANA": "https://pmfby.gov.in",
    "PMFBY": "https://pmfby.gov.in",
    "SOIL HEALTH CARD": "https://soilhealth.dac.gov.in",
    "KISAN CREDIT CARD": "https://www.myscheme.gov.in",
    "KCC": "https://www.myscheme.gov.in",
}

# Tavily results whose URL/title look like documents, not application portals.
DOC_LIKE_PATTERN = re.compile(
    r"\.pdf($|\?)|guideline|brochure|circular|notification|beneficiary[- ]list",
    re.IGNORECASE,
)


def _extract_sources(tavily_results: dict) -> list[dict]:
    """Pull a clean {title, url} list out of raw Tavily results,
    filtering out obvious PDFs/guidelines/brochures."""
    sources = []
    for r in tavily_results.get("results", []):
        url = r.get("url", "")
        title = r.get("title", "")
        if DOC_LIKE_PATTERN.search(url) or DOC_LIKE_PATTERN.search(title):
            continue
        if url:
            sources.append({"title": title, "url": url})
    return sources


async def _search_schemes(crop_type: str, location: str, query: str) -> dict:
    """Use Tavily to search for relevant government agricultural schemes.
    Returns the raw parsed dict (not a JSON string) so we can pull clean
    sources out of it before ever showing it to the LLM."""
    client = TavilyClient(api_key=TAVILY_API_KEY)

    search_query = (
        f"Indian government agricultural schemes for {crop_type} farmers "
        f"in {location} state PM-KISAN PM Fasal Bima Yojana 2024 2025 "
        f"eligibility how to apply {query}"
    )

    try:
        results = client.search(
            query=search_query,
            search_depth="advanced",
            max_results=7,
            include_answer=True,
        )
        return results
    except Exception as e:
        return {"error": str(e), "results": []}


async def run_scheme_agent(state: KisanMindState) -> KisanMindState:
    """
    LangGraph node: Find eligible government schemes.
    """
    start = time.time()

    crop_type = state.get("crop_type", "general")
    location = state.get("location", "India")
    user_query = state.get("query", "")

    try:
        tavily_results = await _search_schemes(crop_type, location, user_query)
        sources = _extract_sources(tavily_results)
        valid_urls = {s["url"] for s in sources}

        llm = get_llm()

        prompt = f"""You are an expert on Indian government agricultural schemes and subsidies.
A farmer growing {crop_type} in {location} is asking: "{user_query}"

Below is a list of titles and URLs found via search. Use them ONLY to identify
which schemes are relevant and to pick the right source_url for each.

Available sources (title -> url):
{json.dumps(sources, indent=2)}

Search summary (for context on eligibility/steps, NOT for URLs):
{json.dumps(tavily_results.get("answer", ""), default=str)}

Return a JSON with exactly this structure:
{{
  "eligible_schemes": [
    {{
      "scheme_name": "name of the scheme",
      "description": "brief 1-2 line description",
      "eligibility": "who is eligible",
      "application_steps": "step by step how to apply",
      "deadline": "deadline if known, else null",
      "source_url": "must be copied EXACTLY from the Available sources list above, or null if none apply"
    }}
  ],
  "total_found": <number>,
  "state_specific": true/false
}}

Rules:
- Always include PM-KISAN and PM Fasal Bima Yojana if relevant
- Include state-specific schemes for {location}
- application_steps should be actionable (e.g., "Visit nearest CSC center", "Apply on pmkisan.gov.in")
- source_url must be copied character-for-character from the Available sources list, or null
- Never invent, guess, or modify a URL
- Return ONLY the JSON, no markdown fences
"""

        response = await llm.ainvoke(prompt)
        raw = response.content.strip()

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw)
            if match:
                parsed = json.loads(match.group())
            else:
                raise ValueError(f"No valid JSON in scheme response: {raw[:200]}")

        schemes = []
        for s in parsed.get("eligible_schemes", []):
            name_key = s.get("scheme_name", "").strip().upper()
            known_url = KNOWN_SCHEMES.get(name_key)
            llm_url = s.get("source_url")

            # Validation layer — code decides, not the LLM.
            if known_url:
                source_url = known_url
                confidence = "high"
            elif llm_url in valid_urls:
                source_url = llm_url
                confidence = "medium"
            else:
                source_url = None
                confidence = "low"

            schemes.append(
                SchemeInfo(
                    scheme_name=s.get("scheme_name", ""),
                    description=s.get("description", ""),
                    eligibility=s.get("eligibility", ""),
                    application_steps=s.get("application_steps", ""),
                    deadline=s.get("deadline"),
                    source_url=source_url,
                    confidence=confidence,
                )
            )

        result = SchemeResult(
            eligible_schemes=schemes,
            total_found=parsed.get("total_found", len(schemes)),
            state_specific=parsed.get("state_specific", False),
        )

        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["scheme_agent"] = round(elapsed, 3)

        return {
            "scheme_result": result.model_dump(),
            "agent_times": agent_times,
        }

    except Exception as e:
        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["scheme_agent"] = round(elapsed, 3)
        errors = dict(state.get("errors") or {})
        errors["scheme_agent"] = str(e)

        return {
            "scheme_result": None,
            "agent_times": agent_times,
            "errors": errors,
        }
