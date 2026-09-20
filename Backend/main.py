"""
KrishiSetu FastAPI Backend
━━━━━━━━━━━━━━━━━━━━━━━━━
Production-grade AgriTech AI advisory system for Indian farmers.
Multi-agent system using LangGraph with parallel execution.

Endpoints:
  POST /advisory    — Run full advisory pipeline
  GET  /history/{session_id} — Past reports from ChromaDB
  GET  /health      — System status
"""

import time
import hashlib
import json
from typing import Optional, Union
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

load_dotenv()

import os
from graph.pipeline import run_pipeline
from memory.long_term import get_history, save_report, search_similar
from models.state import create_initial_state
from utils.image_handler import upload_to_base64, validate_image_size
from utils.llm_provider import get_llm, get_provider_info, extract_text_content
from utils.pdf_generator import generate_pdf
from utils.supabase_client import get_supabase
from utils.email_client import send_email

# ──────────────────────────────────────────────
# App Setup
# ──────────────────────────────────────────────

app = FastAPI(
    title="KrishiSetu API",
    description="AI-powered agricultural advisory system for Indian farmers",
    version="1.0.0",
)

# CORS — open for frontend connection later
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# POST /advisory
# ──────────────────────────────────────────────

@app.post("/advisory")
async def create_advisory(
    query: str = Form(..., description="Farmer's question in Hindi or English"),
    crop_type: str = Form(..., description="Type of crop (e.g., wheat, rice, cotton)"),
    location: str = Form(..., description="Location (city or state)"),
    image: Optional[UploadFile] = File(None, description="Optional crop image for disease detection"),
    user_id: Optional[int] = Form(None, description="Supabase user ID"),
):
    """
    Run the full KrishiSetu multi-agent advisory pipeline.

    Accepts multipart form data with optional crop image.
    Returns complete advisory report with disease analysis,
    market intelligence, government schemes, and weather advisory.
    """
    try:
        # Convert image to base64 if provided
        image_b64 = None
        if image and image.filename:
            image_b64 = await upload_to_base64(image)
            if image_b64 and not validate_image_size(image_b64):
                raise HTTPException(status_code=413, detail="Image exceeds 10MB limit")

        # Build initial state
        state = create_initial_state(
            query=query,
            crop_type=crop_type,
            location=location,
            image_base64=image_b64,
        )

        # Run the LangGraph pipeline
        result = await run_pipeline(state)

        # Save report to long-term memory (ChromaDB)
        if result.get("final_report"):
            try:
                save_report(
                    report=result["final_report"],
                    metadata={
                        "session_id": result.get("session_id", ""),
                        "crop": crop_type,
                        "location": location,
                        "query": query,
                    },
                )
            except Exception:
                pass  # Non-critical: don't fail the request if ChromaDB save fails

            # Also save to Supabase (cloud persistence)
            try:
                sb = get_supabase()
                sb.table("reports").insert({
                    "session_id": result.get("session_id", ""),
                    "crop": crop_type,
                    "location": location,
                    "query": query,
                    "report_markdown": result["final_report"],
                    "execution_time": result.get("execution_time_parallel"),
                    "user_id": user_id,
                    "created_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception:
                pass  # Non-critical

        # Build response
        return {
            "success": True,
            "session_id": result.get("session_id"),
            "timestamp": result.get("timestamp"),
            "crop_type": crop_type,
            "location": location,
            "query": query,
            "disease_result": result.get("disease_result"),
            "market_result": result.get("market_result"),
            "scheme_result": result.get("scheme_result"),
            "weather_result": result.get("weather_result"),
            "final_report": result.get("final_report"),
            "execution_time_parallel": result.get("execution_time_parallel"),
            "execution_time_sequential": result.get("execution_time_sequential"),
            "agent_times": result.get("agent_times"),
            "errors": result.get("errors") if result.get("errors") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


# ──────────────────────────────────────────────
# POST /advisory/pdf
# ──────────────────────────────────────────────

@app.post("/advisory/pdf")
async def download_advisory_pdf(
    session_id: str = Form(..., description="Session ID"),
    report: str = Form(..., description="Full markdown report content")
):
    """
    Generate and download a PDF version of the advisory report.
    """
    try:
        filepath = generate_pdf(report, session_id)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="PDF generation failed")
        return FileResponse(
            path=filepath,
            filename=f"krishisetu_report_{session_id[:8]}.pdf",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")


# ──────────────────────────────────────────────
# GET /history/{session_id}
# ──────────────────────────────────────────────

@app.get("/history/all")
async def get_all_session_history(user_id: Optional[Union[int, str]] = None):
    """
    Retrieve past advisory reports from the SQLite database.
    If user_id is provided, retrieves user's reports plus unassigned reports.
    If user_id is None, retrieves all stored reports.
    Falls back to ChromaDB only if the table is empty.
    """
    from memory.long_term import get_all_history
    try:
        sb = get_supabase()
        if user_id:
            try:
                uid = int(user_id)
            except Exception:
                uid = user_id
            res = sb.table("reports").select("*").is_null_or_eq("user_id", uid).order("created_at", desc=True).limit(50).execute()
        else:
            res = sb.table("reports").select("*").order("created_at", desc=True).limit(50).execute()

        rows = res.data or []
        history = []
        for row in rows:
            history.append({
                "id": row.get("session_id"),
                "document": row.get("report_markdown"),
                "metadata": {
                    "session_id": row.get("session_id"),
                    "crop": row.get("crop"),
                    "location": row.get("location"),
                    "query": row.get("query"),
                    "saved_at": row.get("created_at")
                }
            })

        # Fallback to global ChromaDB if SQLite had 0 reports
        if not history:
            history = get_all_history(limit=50)

        return {
            "success": True,
            "total_reports": len(history),
            "reports": history,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"History retrieval failed: {str(e)}")


@app.get("/history/{session_id}")
async def get_session_history(session_id: str):
    """
    Retrieve past advisory report for a session from SQLite, falling back to ChromaDB.
    """
    try:
        sb = get_supabase()
        res = sb.table("reports").select("*").eq("session_id", session_id).execute()
        if res.data:
            history = [{
                "id": row.get("session_id"),
                "document": row.get("report_markdown"),
                "metadata": {
                    "session_id": row.get("session_id"),
                    "crop": row.get("crop"),
                    "location": row.get("location"),
                    "query": row.get("query"),
                    "saved_at": row.get("created_at")
                }
            } for row in res.data]
        else:
            history = get_history(session_id)
        return {
            "success": True,
            "session_id": session_id,
            "total_reports": len(history),
            "reports": history,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"History retrieval failed: {str(e)}")



# ──────────────────────────────────────────────
# GET /search
# ──────────────────────────────────────────────

@app.get("/search")
async def search_reports(q: str, limit: int = 5):
    """
    Semantic search across all stored advisory reports.
    """
    try:
        results = search_similar(q, n_results=limit)
        return {
            "success": True,
            "query": q,
            "total_results": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /stats
# ──────────────────────────────────────────────

@app.get("/stats")
@app.head("/stats")
async def get_stats():
    """
    Get live platform statistics from Supabase.
    """
    try:
        sb = get_supabase()
        # Real user count from Supabase
        users_res = sb.table("users").select("id", count="exact").execute()
        user_count = users_res.count or 0
        
        # Real report count from Supabase
        reports_res = sb.table("reports").select("id", count="exact").execute()
        report_count = reports_res.count or 0
        
        return {
            "success": True,
            "registered_farmers": f"{user_count:,}",
            "reports_this_month": str(report_count),
            "benefits_disbursed": "₹18.4L"  # Mocked until transactions are added
        }
    except Exception as e:
        return {
            "success": True,
            "registered_farmers": "0",
            "reports_this_month": "0",
            "benefits_disbursed": "₹0"
        }


# ──────────────────────────────────────────────
# Admin Auth & Dashboard (Supabase)
# ──────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/admin-login")
async def admin_login(req: AdminLoginRequest):
    """
    Authenticate an admin against the 'admins' Supabase table.
    """
    try:
        sb = get_supabase()
        res = sb.table("admins").select("*").eq("email", req.email).execute()
        if not res.data:
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        
        admin = res.data[0]
        stored_hash = admin.get("password_hash", "")
        input_hash = hashlib.sha256(req.password.encode()).hexdigest()
        
        if stored_hash != input_hash:
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        
        return {
            "success": True,
            "admin": {
                "id": admin["id"],
                "name": admin.get("name", "Admin"),
                "email": admin["email"],
                "role": admin.get("role", "admin"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin login failed: {str(e)}")


@app.get("/admin/dashboard")
async def admin_dashboard():
    """
    Admin dashboard data — real stats, all reports, and location distribution.
    """
    try:
        sb = get_supabase()
        
        # Stats
        users_res = sb.table("users").select("id", count="exact").execute()
        total_farmers = users_res.count or 0
        
        reports_res = sb.table("reports").select("id", count="exact").execute()
        total_reports = reports_res.count or 0
        
        # All reports with user info
        all_reports_res = sb.table("reports").select("*").order("created_at", desc=True).limit(100).execute()
        
        # Get user names for the reports
        user_ids = list(set([r.get("user_id") for r in (all_reports_res.data or []) if r.get("user_id")]))
        user_map = {}
        if user_ids:
            users_data = sb.table("users").select("id, name, city").in_("id", user_ids).execute()
            for u in (users_data.data or []):
                user_map[u["id"]] = {"name": u.get("name", "Unknown"), "city": u.get("city", "")}
        
        reports = []
        import re
        
        for r in (all_reports_res.data or []):
            uid = r.get("user_id")
            user_info = user_map.get(uid, {"name": "Unknown", "city": ""})
            
            markdown = r.get("report_markdown", "")
            disease_match = re.search(r"Disease / रोग:\s*(.+)", markdown)
            disease = disease_match.group(1).strip() if disease_match else "Unknown"
            
            severity_match = re.search(r"Severity / तीव्रता:\s*(.+)", markdown)
            severity = "Low"
            if severity_match:
                sev_text = severity_match.group(1).lower()
                if "high" in sev_text: severity = "High"
                elif "medium" in sev_text: severity = "Medium"

            reports.append({
                "session_id": r.get("session_id", ""),
                "crop": r.get("crop", ""),
                "location": r.get("location", ""),
                "query": r.get("query", ""),
                "created_at": r.get("created_at", ""),
                "user_name": user_info["name"],
                "user_city": user_info["city"],
                "disease": disease,
                "severity": severity
            })
        
        # Location distribution from reports
        location_counts: dict = {}
        for r in reports:
            loc = r.get("location", "").strip()
            if loc:
                location_counts[loc] = location_counts.get(loc, 0) + 1
        
        location_distribution = [
            {"location": loc, "count": count}
            for loc, count in sorted(location_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        
        return {
            "success": True,
            "stats": {
                "total_farmers": total_farmers,
                "total_reports": total_reports,
            },
            "reports": reports,
            "location_distribution": location_distribution,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin dashboard failed: {str(e)}")


# ──────────────────────────────────────────────
# Auth Endpoints (Supabase)
# ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    city: str
    email: str
    password: str
    phone: str = ""
    land_owned: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str


class OTPLoginRequest(BaseModel):
    phone: str
    otp: str

class UpdateProfileRequest(BaseModel):
    user_id: Union[int, str]
    name: str
    city: str
    state: str
    land_owned: float


@app.post("/auth/register")
async def register_user(req: RegisterRequest):
    """
    Register a new farmer in Supabase.
    """
    try:
        sb = get_supabase()
        # Hash password (simple sha256 for demo — use bcrypt in production)
        pw_hash = hashlib.sha256(req.password.encode()).hexdigest()
        
        # Check if user already exists
        existing = sb.table("users").select("id").eq("email", req.email).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=409, detail="User already exists with this email")
        
        # Insert user
        result = sb.table("users").insert({
            "name": req.name,
            "city": req.city,
            "email": req.email,
            "password_hash": pw_hash,
            "phone": req.phone,
            "land_owned": req.land_owned,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
        
        user = result.data[0] if result.data else {}
        
        return {
            "success": True,
            "message": "Registration successful",
            "user": {
                "id": user.get("id"),
                "name": req.name,
                "city": req.city,
                "phone": req.phone,
                "land_owned": req.land_owned,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """
    Mock forgot password. Generates a new temporary password and updates the DB.
    In production, this would send an email with a reset link.
    """
    try:
        sb = get_supabase()
        
        # Check if user exists
        result = sb.table("users").select("id").eq("email", req.email).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="No account found with this email")
            
        user_id = result.data[0]["id"]
        
        # Generate a temporary password
        import random
        import string
        temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        
        # Hash new password
        pw_hash = hashlib.sha256(temp_password.encode()).hexdigest()
        
        # Update user
        sb.table("users").update({"password_hash": pw_hash}).eq("id", user_id).execute()
        
        # Send actual email
        subject = "Your KrishiSetu Temporary Password"
        body = f"Hello,\n\nYour temporary password is: {temp_password}\n\nPlease login and change it from the Settings page immediately.\n\nThanks,\nKrishiSetu Team"
        
        send_email(to_email=req.email, subject=subject, body=body)
        
        return {
            "success": True,
            "message": "A temporary password has been sent to your email",
            "temp_password": temp_password # Include this for easy testing in the demo
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forgot password failed: {str(e)}")



@app.post("/auth/login")
async def login_user(req: LoginRequest):
    """
    Login a farmer by email/ID + password.
    """
    try:
        sb = get_supabase()
        pw_hash = hashlib.sha256(req.password.encode()).hexdigest()
        
        result = sb.table("users").select("*").eq("email", req.email).eq("password_hash", pw_hash).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        user = result.data[0]
        return {
            "success": True,
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "city": user.get("city"),
                "phone": user.get("phone"),
                "land_owned": user.get("land_owned"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

class ClerkSyncRequest(BaseModel):
    email: str
    name: str | None = None
    phone: str | None = None
    city: str | None = None
    land_owned: str | None = None

@app.post("/auth/clerk-sync")
async def clerk_sync(req: ClerkSyncRequest):
    """
    Sync a Clerk user (OAuth or Email) into the Supabase users table
    so the rest of the application (reports, etc.) can function correctly.
    """
    try:
        sb = get_supabase()
        # Check if user exists
        existing = sb.table("users").select("*").eq("email", req.email).execute()
        
        if existing.data and len(existing.data) > 0:
            user = existing.data[0]
        else:
            # Create dummy user since Clerk handles auth
            import random
            import string
            dummy_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
            pw_hash = hashlib.sha256(dummy_password.encode()).hexdigest()
            
            result = sb.table("users").insert({
                "name": req.name or "Farmer",
                "email": req.email,
                "city": req.city or "",
                "phone": req.phone or "",
                "land_owned": req.land_owned or "",
                "password_hash": pw_hash,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
            user = result.data[0] if result.data else {}

        return {
            "success": True,
            "message": "Sync successful",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "city": user.get("city"),
                "phone": user.get("phone"),
                "land_owned": user.get("land_owned"),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")



@app.post("/auth/otp-login")
async def otp_login(req: OTPLoginRequest):
    """
    Mock OTP login — accepts 123456 as valid OTP.
    In production, integrate Twilio/Supabase Auth.
    """
    if req.otp != "123456":
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    try:
        sb = get_supabase()
        result = sb.table("users").select("*").eq("phone", req.phone).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="No account found with this phone number. Please register first.")
        
        user = result.data[0]
        return {
            "success": True,
            "message": "OTP verified",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "city": user.get("city"),
                "phone": user.get("phone"),
                "land_owned": user.get("land_owned"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OTP login failed: {str(e)}")


@app.post("/auth/update")
async def update_profile(req: UpdateProfileRequest):
    """
    Update farmer profile in Supabase.
    """
    try:
        sb = get_supabase()
        
        # We need to map state into city if we don't have a state column.
        # But wait, looking at register, it only takes city and land_owned.
        # Let's just update name, city, land_owned.
        
        result = sb.table("users").update({
            "name": req.name,
            "city": req.city,
            "land_owned": req.land_owned
        }).eq("id", req.user_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="User not found")
            
        user = result.data[0]
        return {
            "success": True,
            "message": "Profile updated successfully",
            "user": {
                "id": user.get("id"),
                "name": user.get("name"),
                "city": user.get("city"),
                "phone": user.get("phone"),
                "land_owned": user.get("land_owned"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile update failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /health
# ──────────────────────────────────────────────

@app.get("/health")
@app.head("/health")
async def health_check():
    """
    System health check — returns active LLM provider
    and service status.
    """
    provider_info = get_provider_info()

    return {
        "status": "healthy",
        "service": "KrishiSetu API",
        "version": "1.0.0",
        "llm_provider": provider_info,
    }


# ──────────────────────────────────────────────
# GET /settings/model — Current LLM info
# ──────────────────────────────────────────────

@app.get("/settings/model")
async def get_model_settings():
    """
    Return current LLM provider, model name, and available providers.
    """
    from utils.llm_provider import get_manager
    manager = get_manager()
    return {
        "success": True,
        **manager.get_provider_info(),
    }


# ──────────────────────────────────────────────
# POST /settings/model — Switch LLM at runtime
# ──────────────────────────────────────────────

@app.post("/settings/model")
async def switch_model(
    provider: str = Form(..., description="LLM provider: gemini, groq, ollama, openrouter, openai"),
    model_name: str = Form(None, description="Optional model name override"),
):
    """
    Hot-swap the active LLM provider and model at runtime.
    Takes effect immediately for all subsequent agent calls.
    """
    from utils.llm_provider import get_manager
    manager = get_manager()

    try:
        info = manager.switch_provider(provider, model_name or None)
        return {
            "success": True,
            "message": f"Switched to {info['provider']} / {info['model']}",
            **info,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ──────────────────────────────────────────────
# GET /weather — Standalone live weather
# ──────────────────────────────────────────────

@app.get("/weather")
async def get_weather(location: str = "Delhi"):
    """
    Fetch real-time weather from OpenWeatherMap for a location.
    Returns current conditions + 3-day forecast.
    No LLM call — fast response (<2s).
    """
    from agents.weather_agent import _fetch_weather, _parse_current, _parse_forecast_3d

    try:
        weather_data = await _fetch_weather(location)

        # Check for API error, fallback to Delhi
        if weather_data["current"].get("cod") != 200:
            weather_data = await _fetch_weather("Delhi")
            if weather_data["current"].get("cod") != 200:
                raise HTTPException(
                    status_code=404,
                    detail=f"Weather data temporarily unavailable."
                )

        today = _parse_current(weather_data["current"])
        forecast_3d = _parse_forecast_3d(weather_data["forecast"])

        return {
            "success": True,
            "location": location,
            "today": today.model_dump(),
            "forecast_3d": [f.model_dump() for f in forecast_3d],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather fetch failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /schemes — Standalone scheme search
# ──────────────────────────────────────────────

@app.get("/schemes")
async def get_schemes(crop: str = "wheat", location: str = "Maharashtra"):
    """
    Search for eligible government agricultural schemes
    using Tavily + LLM synthesis.
    """
    from agents.scheme_agent import _search_schemes
    from models.state import SchemeInfo, SchemeResult
    import json

    try:
        search_results = await _search_schemes(crop, location, "")

        llm = get_llm()

        prompt = f"""You are an expert on Indian government agricultural schemes and subsidies.
A farmer growing {crop} in {location} is looking for eligible schemes.

Based on the search results below, identify ALL eligible government schemes.

Search Results:
{search_results}

Return a JSON with exactly this structure:
{{
  "eligible_schemes": [
    {{
      "scheme_name": "name of the scheme",
      "description": "brief 1-2 line description",
      "eligibility": "who is eligible",
      "application_steps": "step by step how to apply",
      "deadline": "deadline if known, else null",
      "link": "official URL if available, else null"
    }}
  ],
  "total_found": <number>,
  "state_specific": true/false
}}

Rules:
- Always include PM-KISAN and PM Fasal Bima Yojana if relevant
- Include state-specific schemes for {location}
- Return ONLY the JSON, no markdown fences
"""
        response = await llm.ainvoke(prompt)
        raw = extract_text_content(response.content)

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

        parsed = json.loads(raw)
        result = SchemeResult(
            eligible_schemes=[SchemeInfo(**s) for s in parsed.get("eligible_schemes", [])],
            total_found=parsed.get("total_found", 0),
            state_specific=parsed.get("state_specific", False),
        )

        return {
            "success": True,
            "crop": crop,
            "location": location,
            "scheme_result": result.model_dump(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheme search failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /predict — Standalone ML price prediction
# ──────────────────────────────────────────────

@app.get("/predict")
async def get_prediction(
    crop: str = "tomato",
    state: str = "Maharashtra",
    month: int = 6,
    last_price: float = 2500.0,
):
    """
    Get XGBoost 7-day crop price prediction.
    Uses the trained price_model.pkl directly.
    """
    from models.price_predictor import predict

    try:
        result = predict(crop=crop, state=state, month=month, last_price=last_price)

        if result.get("error"):
            raise HTTPException(status_code=500, detail=f"Prediction error: {result['error']}")

        return {
            "success": True,
            "crop": crop,
            "state": state,
            "month": month,
            "last_price": last_price,
            "prediction": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /voice/greet — Voice greeting TTS
# ──────────────────────────────────────────────

@app.get("/voice/greet")
async def voice_greet(lang: str = "en"):
    """
    Generate a TTS greeting audio for the voice assistant.
    Returns base64 audio and greeting text.
    """
    import httpx

    sarvam_key = os.getenv("SARVAM_API_KEY")

    greetings = {
        "hi": "नमस्ते! मैं कृषिसेतु हूँ। बताइए, मैं आपकी क्या मदद कर सकता हूँ?",
        "en": "Hello! I am KrishiSetu, your farming assistant. How can I help you today?",
    }
    greeting_text = greetings.get(lang, greetings["en"])

    audio_base64 = ""
    if sarvam_key:
        try:
            async with httpx.AsyncClient() as client:
                tts_payload = {
                    "text": greeting_text,
                    "speaker": "priya",
                    "model": "bulbul:v3",
                    "target_language_code": "hi-IN" if lang == "hi" else "en-IN",
                }
                tts_headers = {
                    "api-subscription-key": sarvam_key,
                    "Content-Type": "application/json",
                }
                tts_response = await client.post(
                    "https://api.sarvam.ai/text-to-speech",
                    json=tts_payload,
                    headers=tts_headers,
                    timeout=30.0,
                )
                if tts_response.status_code == 200:
                    audios = tts_response.json().get("audios", [])
                    audio_base64 = audios[0] if audios else ""
                else:
                    print(f"Sarvam TTS greeting failed: {tts_response.text}")
        except Exception as e:
            print(f"Sarvam TTS greeting error: {str(e)}")


    return {
        "success": True,
        "greeting_text": greeting_text,
        "audio_response": audio_base64,
    }


# ──────────────────────────────────────────────
# POST /voice/chat — Voice-to-voice RAG chat
# ──────────────────────────────────────────────

@app.post("/voice/chat")
async def voice_chat(
    session_id: str = Form(..., description="Session ID"),
    lang: str = Form("en", description="Language code: hi or en"),
    audio: Optional[UploadFile] = File(None, description="Optional recorded audio file"),
    text: Optional[str] = Form(None, description="Optional text query fallback"),
    page_context: Optional[str] = Form(None, description="Current page context from the frontend"),
):
    """
    RAG voice-to-voice chat endpoint using Sarvam AI Indic STT/TTS.
    """
    import httpx
    import base64
    from memory.long_term import get_history, search_similar
    from models.price_predictor import predict
    
    # 1. Transcription (Sarvam STT)
    query_text = ""
    sarvam_key = os.getenv("SARVAM_API_KEY")
    
    if audio and hasattr(audio, "filename") and audio.filename:
        try:
            # Read uploaded audio content
            audio_content = await audio.read()
            if len(audio_content) > 200:
                fname = audio.filename or "voice_query.webm"
                ctype = audio.content_type or "audio/webm"
                if "webm" in ctype and not fname.endswith(".webm"):
                    fname = "audio.webm"
                elif "mp4" in ctype and not fname.endswith(".mp4"):
                    fname = "audio.mp4"
                elif "wav" in ctype and not fname.endswith(".wav"):
                    fname = "audio.wav"
                elif "." not in fname:
                    fname += ".webm"
                
                # Call Sarvam STT REST API
                async with httpx.AsyncClient() as client:
                    files = {"file": (fname, audio_content, ctype)}
                    data = {"model": "saaras:v3", "mode": "transcribe"}
                    headers = {"api-subscription-key": sarvam_key}
                    
                    response = await client.post(
                        "https://api.sarvam.ai/speech-to-text",
                        files=files,
                        data=data,
                        headers=headers,
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        query_text = response.json().get("transcript", "").strip()
                    else:
                        print(f"⚠️ Sarvam STT failed with {response.status_code}: {response.text}")
        except Exception as e:
            print(f"⚠️ Sarvam STT connection error: {e}")

    # Fallback to text query if STT did not produce words
    if not query_text and text:
        query_text = text.strip()
        
    if not query_text:
        fallback_msg = (
            "I didn't catch that clearly. Please try speaking again or type your question."
            if lang == "en"
            else "मुझे आपकी आवाज़ साफ़ नहीं आई। कृपया दोबारा बोलें या अपना सवाल लिखें।"
        )
        # Synthesize voice response for fallback message so assistant responds audibly
        fallback_audio = ""
        try:
            async with httpx.AsyncClient() as client:
                tts_payload = {
                    "text": fallback_msg,
                    "speaker": "priya",
                    "model": "bulbul:v3",
                    "target_language_code": "hi-IN" if lang == "hi" else "en-IN"
                }
                tts_headers = {
                    "api-subscription-key": sarvam_key,
                    "Content-Type": "application/json"
                }
                tts_res = await client.post(
                    "https://api.sarvam.ai/text-to-speech",
                    json=tts_payload,
                    headers=tts_headers,
                    timeout=15.0
                )
                if tts_res.status_code == 200:
                    audios = tts_res.json().get("audios", [])
                    fallback_audio = audios[0] if audios else ""
        except Exception as tts_e:
            print(f"Fallback TTS error: {tts_e}")

        return {
            "success": True,
            "query": "",
            "text_response": fallback_msg,
            "audio_response": fallback_audio or None
        }

    # 2. RAG Context Collection
    # To survive Render restarts, we fetch the actual report from Supabase instead of local ChromaDB
    crop_context = None
    location_context = None
    reports_context = ""
    
    try:
        sb = get_supabase()
        res = sb.table("reports").select("*").eq("session_id", session_id).order("created_at", desc=True).limit(3).execute()
        
        if res.data:
            reports_from_db = [row.get("report_markdown") for row in res.data if row.get("report_markdown")]
            reports_context = "\n---\n".join(reports_from_db)
            crop_context = res.data[0].get("crop")
            location_context = res.data[0].get("location")
        else:
            # Fallback to local ChromaDB if not found in Supabase
            similar_docs = search_similar(query_text, n_results=3)
            history_docs = get_history(session_id, limit=5)
            reports_context = "\n---\n".join([doc["document"] for doc in similar_docs])
            if history_docs:
                crop_context = history_docs[0].get("metadata", {}).get("crop")
                location_context = history_docs[0].get("metadata", {}).get("location")
    except Exception as e:
        print(f"Error fetching voice RAG context from Supabase: {e}")
        # Fallback to ChromaDB
        similar_docs = search_similar(query_text, n_results=3)
        reports_context = "\n---\n".join([doc["document"] for doc in similar_docs])
    
    # Add market predictions if query mentions price, market, mandi, cost, sell, rate
    market_prediction_context = ""
    lower_query = query_text.lower()
    mkt_keywords = ["price", "mandi", "sell", "rate", "cost", "predict", "forecast", "भाव", "मंडी", "दाम", "कीमत", "बेच"]
    if any(k in lower_query for k in mkt_keywords):
        # Determine crop & state
        crop = crop_context or "wheat"
        state = location_context or "Maharashtra"
        
        # Check if query specifies a crop or state
        from models.price_predictor import CROPS, STATES
        for c in CROPS:
            if c in lower_query:
                crop = c
                break
        for s in STATES:
            if s.lower() in lower_query:
                state = s
                break
                
        # Run price predictor
        try:
            from datetime import datetime
            from models.price_predictor import _get_fallback_price
            last_price = _get_fallback_price(crop)
            pred = predict(crop=crop, state=state, month=datetime.utcnow().month, last_price=last_price)
            if not pred.get("error"):
                market_prediction_context = (
                    f"Live Mandi Info for {crop} in {state}:\n"
                    f"- Current estimated price: INR {last_price} per quintal\n"
                    f"- Predicted price in 7 days: INR {pred.get('predicted_price')} per quintal\n"
                    f"- Prediction confidence: {pred.get('confidence')}%\n"
                )
        except Exception:
            pass

    # 3. Prompt Construction & LLM Execution
    llm = get_llm()
    
    # Build page context section
    page_ctx_section = ""
    if page_context:
        page_ctx_section = f"\nCurrent session context from the app:\n{page_context}\n"

    system_prompt = f"""You are KrishiSetu Voice Assistant, a friendly AI agricultural advisor speaking directly to a farmer.
Your response MUST be extremely brief (max 2-3 sentences), simple, conversational, and direct, suitable for speech synthesis.
Do NOT use any markdown formatting (no bolding, no bullets, no lists, no headings, no asterisks).
Answer the query based on the following context. If you don't know, keep it short and friendly.

Context from past advisory reports:
{reports_context}

Context from live market prediction:
{market_prediction_context}
{page_ctx_section}
Farmer's query:
{query_text}

Language rule: You MUST respond in Hindi (using Devanagari script) if the language parameter is "hi". Otherwise, respond in simple English.
Ensure natural conversational speech phrasing.
"""
    
    try:
        response = await llm.ainvoke(system_prompt)
        text_reply = extract_text_content(response.content)
        # Clean any remaining markdown fences or headers
        text_reply = text_reply.replace("*", "").replace("#", "").replace("- ", "").strip()
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"LLM generation failed: {str(e)}")

    # 4. Text-to-Speech Synthesis (Sarvam TTS)
    audio_base64 = ""
    try:
        async with httpx.AsyncClient() as client:
            tts_payload = {
                "text": text_reply,
                "speaker": "priya",
                "model": "bulbul:v3",
                "target_language_code": "hi-IN" if lang == "hi" else "en-IN"
            }
            tts_headers = {
                "api-subscription-key": sarvam_key,
                "Content-Type": "application/json"
            }
            tts_response = await client.post(
                "https://api.sarvam.ai/text-to-speech",
                json=tts_payload,
                headers=tts_headers,
                timeout=30.0
            )
            if tts_response.status_code == 200:
                audios = tts_response.json().get("audios", [])
                audio_base64 = audios[0] if audios else ""
            else:
                # We won't block the request if TTS fails, just return text with empty audio
                print(f"Sarvam TTS synthesis failed: {tts_response.text}")
    except Exception as e:
        print(f"Sarvam TTS error: {str(e)}")

    return {
        "success": True,
        "query": query_text,
        "text_response": text_reply,
        "audio_response": audio_base64
    }


# ──────────────────────────────────────────────
# POST /transcribe — Sarvam STT only (no LLM)
# ──────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio file to transcribe"),
):
    """
    Lightweight speech-to-text endpoint using Sarvam AI.
    Returns only the transcript — no LLM or TTS processing.
    Used by the inline chat transcribe button.
    """
    import httpx

    sarvam_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_key:
        raise HTTPException(status_code=500, detail="Sarvam API key not configured")

    audio_content = await audio.read()
    fname = audio.filename or "transcribe.webm"
    ctype = audio.content_type or "audio/webm"
    if "webm" in ctype and not fname.endswith(".webm"):
        fname = "audio.webm"
    elif "mp4" in ctype and not fname.endswith(".mp4"):
        fname = "audio.mp4"
    elif "wav" in ctype and not fname.endswith(".wav"):
        fname = "audio.wav"
    elif "." not in fname:
        fname += ".webm"

    async with httpx.AsyncClient() as client:
        try:
            files = {"file": (fname, audio_content, ctype)}
            data = {"model": "saaras:v3", "mode": "transcribe"}
            headers = {"api-subscription-key": sarvam_key}

            response = await client.post(
                "https://api.sarvam.ai/speech-to-text",
                files=files,
                data=data,
                headers=headers,
                timeout=30.0,
            )

            if response.status_code == 200:
                transcript = response.json().get("transcript", "").strip()
                return {"success": True, "transcript": transcript}
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Sarvam STT failed: {response.text}",
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


# ──────────────────────────────────────────────
# POST /chat/report — Contextual follow-up chat
# ──────────────────────────────────────────────

class ReportChatRequest(BaseModel):
    report_context: Optional[str] = ""
    user_message: Optional[str] = ""
    chat_history: Optional[str] = ""
    lang: str = "en"
    is_greeting: bool = False
    user_id: Optional[Union[int, str]] = None


@app.post("/chat/report")
async def chat_with_report(req: ReportChatRequest):
    """
    Contextual chatbot that answers follow-up questions about a specific
    crop advisory report. Sends the full report + chat history + user
    question to the LLM for a grounded answer.
    """
    llm = get_llm()

    history_section = ""
    if req.chat_history:
        history_section = f"\nPrevious conversation:\n{req.chat_history}\n"

    lang_instruction = (
        "You MUST respond in Hindi (using Devanagari script)."
        if req.lang == "hi"
        else "Respond in clear, simple English."
    )

    prompt = f"""You are KrishiSetu, an expert agricultural advisor chatbot for Indian farmers.
A farmer has just received the following crop advisory report and wants to ask follow-up questions about it.

── ADVISORY REPORT ──
{req.report_context[:8000]}
── END REPORT ──
{history_section}
Farmer's question: {req.user_message}

Rules:
- Answer ONLY based on the report above. If the question is unrelated, politely redirect.
- Be concise but thorough (3-5 sentences max).
- Use simple farmer-friendly language.
- {lang_instruction}
- Use minimal markdown (bold key terms, but no headers or complex formatting).
- PROACTIVE GUIDANCE: If your answer would genuinely benefit from knowing something simple that the farmer can easily tell you (e.g., has it rained recently, when did they last water the field, what does the affected area look like now, how many days since sowing), then naturally end your response by asking 1-2 such brief questions. Keep them conversational and easy to answer. If there is nothing useful to ask, just answer directly without any follow-up questions.
"""

    try:
        response = await llm.ainvoke(prompt)
        reply = extract_text_content(response.content)
        return {"success": True, "reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# ──────────────────────────────────────────────
# Persistent Chat History for Reports (Supabase)
# ──────────────────────────────────────────────

def _ensure_report_chats_table():
    """Best-effort: check if report_chats table exists by attempting a query."""
    try:
        sb = get_supabase()
        sb.table("report_chats").select("id").limit(1).execute()
    except Exception:
        # Table likely doesn't exist — caller should handle gracefully
        pass


@app.get("/chat/report/{report_id}")
async def get_report_chat_history(report_id: str):
    """
    Retrieve all saved chat messages for a specific report from Supabase.
    Returns messages in chronological order.
    """
    try:
        sb = get_supabase()
        res = sb.table("report_chats").select("*").eq("report_id", report_id).order("created_at", desc=False).execute()

        messages = []
        for row in (res.data or []):
            messages.append({
                "role": row.get("role"),
                "text": row.get("message"),
                "created_at": row.get("created_at"),
            })

        return {"success": True, "report_id": report_id, "messages": messages}
    except Exception as e:
        # If table doesn't exist or other error, return empty
        return {"success": True, "report_id": report_id, "messages": []}


@app.post("/chat/report/{report_id}")
async def chat_with_report_persistent(report_id: str, req: ReportChatRequest):
    """
    Contextual chatbot that answers follow-up questions about a specific
    crop advisory report AND persists the conversation in Supabase.
    """
    llm = get_llm()

    # Load existing chat history from Supabase for this report
    db_history = ""
    try:
        sb = get_supabase()
        res = sb.table("report_chats").select("role, message").eq("report_id", report_id).order("created_at", desc=False).execute()
        if res.data:
            history_lines = []
            for row in res.data:
                prefix = "Farmer" if row.get("role") == "user" else "KrishiSetu"
                history_lines.append(f"{prefix}: {row.get('message', '')}")
            db_history = "\n".join(history_lines)
    except Exception:
        pass

    # Merge DB history with any client-supplied history (prefer DB)
    history_section = ""
    combined_history = db_history or req.chat_history
    if combined_history:
        history_section = f"\nPrevious conversation:\n{combined_history}\n"

    lang_instruction = (
        "You MUST respond in Hindi (using Devanagari script)."
        if req.lang == "hi"
        else "Respond in clear, simple English."
    )

    if req.is_greeting:
        prompt = f"""You are KrishiSetu, an expert agricultural advisor chatbot for Indian farmers.
A farmer has just received the following crop advisory report.

── ADVISORY REPORT ──
{req.report_context[:8000]}
── END REPORT ──

Your task: The report was just generated. Give a brief, friendly greeting to the farmer (1-2 sentences) introducing yourself as KrishiSetu, tell them you are here to answer any questions about the report, and end by asking exactly ONE proactive, specific follow-up question based on the report to get more context (e.g., if there's a disease, ask about recent rainfall or when they last irrigated). 
- {lang_instruction}
- Do NOT answer any hypothetical questions, just greet and ask the follow-up question.
"""
    else:
        prompt = f"""You are KrishiSetu, an expert agricultural advisor chatbot for Indian farmers.
A farmer has just received the following crop advisory report and wants to ask follow-up questions about it.

── ADVISORY REPORT ──
{req.report_context[:8000]}
── END REPORT ──
{history_section}
Farmer's question: {req.user_message}

Rules:
- Answer ONLY based on the report above. If the question is unrelated, politely redirect.
- Be concise but thorough (3-5 sentences max).
- Use simple farmer-friendly language.
- {lang_instruction}
- Use minimal markdown (bold key terms, but no headers or complex formatting).
- PROACTIVE GUIDANCE: If your answer would genuinely benefit from knowing something simple that the farmer can easily tell you (e.g., has it rained recently, when did they last water the field, what does the affected area look like now, how many days since sowing), then naturally end your response by asking 1-2 such brief questions. Keep them conversational and easy to answer. If there is nothing useful to ask, just answer directly without any follow-up questions.
"""

    try:
        response = await llm.ainvoke(prompt)
        reply = extract_text_content(response.content)

        # Save messages to Supabase
        try:
            sb = get_supabase()
            user_id = req.user_id if hasattr(req, 'user_id') and req.user_id else None
            inserts = []
            if not req.is_greeting:
                row = {
                    "report_id": report_id,
                    "role": "user",
                    "message": req.user_message,
                    "created_at": datetime.utcnow().isoformat(),
                }
                if user_id:
                    row["user_id"] = user_id
                inserts.append(row)
            row2 = {
                "report_id": report_id,
                "role": "assistant",
                "message": reply,
                "created_at": datetime.utcnow().isoformat(),
            }
            if user_id:
                row2["user_id"] = user_id
            inserts.append(row2)
            sb.table("report_chats").insert(inserts).execute()
        except Exception as db_err:
            print(f"⚠️ Failed to save chat to Supabase: {db_err}")

        return {"success": True, "reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# ──────────────────────────────────────────────
# GET /chat/all-history — Fetch all global report chats
# ──────────────────────────────────────────────

@app.get("/chat/all-history")
async def get_all_chat_history(user_id: str | None = None):
    """
    Fetch chat sessions from Supabase to display in Settings.
    If user_id is provided, only shows that user's chats.
    Groups messages by report_id.
    """
    try:
        sb = get_supabase()
        # Fetch messages ordered by created_at descending, filtered by user if provided
        query = sb.table("report_chats").select("*")
        if user_id:
            query = query.eq("user_id", int(user_id))
        res = query.order("created_at", desc=True).execute()
        
        if not res.data:
            return {"success": True, "sessions": []}
            
        # Group by report_id
        sessions = {}
        for msg in res.data:
            rid = msg["report_id"]
            if rid not in sessions:
                sessions[rid] = {
                    "report_id": rid,
                    "last_updated": msg["created_at"],
                    "messages": []
                }
            sessions[rid]["messages"].append({
                "role": msg["role"],
                "text": msg["message"],
                "created_at": msg["created_at"]
            })
            
        # Sort sessions by last_updated desc
        sorted_sessions = sorted(list(sessions.values()), key=lambda x: x["last_updated"], reverse=True)
        
        return {"success": True, "sessions": sorted_sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────────
# Run with: uvicorn main:app --reload --port 8000
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

