"""
KisanMind Disease Detection Agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Uses Gemini Vision API directly (NOT the LLM wrapper) to
analyze crop images and identify diseases with structured output.
"""

import json
import os
import time

import google.genai as genai
from dotenv import load_dotenv

from models.state import DiseaseResult, KisanMindState

load_dotenv()

# Configure Gemini Vision — always uses Gemini regardless of LLM_PROVIDER
_client = None

def get_genai_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or LLM_API_KEY environment variable is missing.")
        _client = genai.Client(api_key=api_key)
    return _client


def _build_disease_prompt(crop_type: str, location: str, query: str) -> str:
    """Build a context-aware disease detection prompt."""
    return f"""You are an expert agricultural plant pathologist AI for Indian farming.

The farmer is growing **{crop_type}** in **{location}**.
Farmer's question: "{query}"

Analyze the provided crop image carefully and return a JSON object with exactly these fields:

{{
  "disease_name": "exact name of the disease or 'Healthy' if no disease",
  "confidence_score": <number 0-100>,
  "affected_area_percent": <number 0-100, estimated % of visible plant affected>,
  "severity": "low" | "medium" | "high",
  "treatment": "specific treatment with pesticide name and dosage in ml per acre",
  "image_analysis_summary": "2-3 sentence description of what you see in the image"
}}

Rules:
- Be specific about pesticide names commonly available in India (e.g., Mancozeb, Carbendazim, Imidacloprid)
- Dosage must be in ml per acre or grams per acre
- Consider diseases that are common for {crop_type} in {location} when making your diagnosis
- If the image is unclear or not a crop, set disease_name to "Unable to determine" and confidence to 0
- Return ONLY the JSON, no markdown fences, no extra text
"""


async def run_disease_agent(state: KisanMindState) -> KisanMindState:
    """
    LangGraph node: Analyze crop image via Gemini Vision.
    Writes disease_result into state. If no image provided,
    gracefully returns null result.
    """
    start = time.time()

    crop_type = state.get("crop_type", "crop")
    location = state.get("location", "India")
    query = state.get("query", "")
    image_b64 = state.get("image_base64")
    if not image_b64:
        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["disease_agent"] = round(elapsed, 3)
        return {
            "disease_result": None,
            "agent_times": agent_times,
        }

    try:
        # Build context-aware prompt
        prompt = _build_disease_prompt(crop_type, location, query)

        # Build multimodal content for Gemini Vision (new SDK)
        image_part = genai.types.Part.from_bytes(
            data=__import__("base64").b64decode(image_b64),
            mime_type="image/jpeg",
        )

        # Image MUST come first for Gemini Vision to process it correctly
        response = get_genai_client().models.generate_content(
            model=os.getenv("GEMINI_VISION_MODEL", "gemini-2.5-flash"),
            contents=[image_part, prompt],
            config=genai.types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=1024,
                thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "disease_name": {"type": "string"},
                        "confidence_score": {"type": "number"},
                        "affected_area_percent": {"type": "number"},
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "treatment": {"type": "string"},
                        "image_analysis_summary": {"type": "string"},
                    },
                    "required": ["disease_name", "confidence_score", "affected_area_percent", "severity", "treatment", "image_analysis_summary"],
                },
            ),
        )

        print(f"🔬 Disease agent raw response length: {len(response.text)} chars")

        raw_text = response.text.strip()

        # Strip markdown fences if the model wraps them
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text.rsplit("```", 1)[0]
        raw_text = raw_text.strip()

        # Robust JSON extraction — find the first { ... } block
        parsed = None
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            import re
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                parsed = json.loads(match.group())
            else:
                raise ValueError(f"No valid JSON found in response: {raw_text[:200]}")

        result = DiseaseResult(**parsed)

        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["disease_agent"] = round(elapsed, 3)

        return {
            "disease_result": result.model_dump(),
            "agent_times": agent_times,
        }

    except Exception as e:
        elapsed = time.time() - start
        agent_times = dict(state.get("agent_times") or {})
        agent_times["disease_agent"] = round(elapsed, 3)
        errors = dict(state.get("errors") or {})
        errors["disease_agent"] = str(e)

        return {
            "disease_result": None,
            "agent_times": agent_times,
            "errors": errors,
        }
