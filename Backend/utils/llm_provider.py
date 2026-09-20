"""
KisanMind LLM Provider — Runtime-Switchable Wrapper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Single source of truth for LLM instantiation.
Every agent imports get_llm() from here — no agent
should ever directly import an LLM class.

Provider is controlled via .env at startup, and can be
switched at runtime via LLMManager.switch_provider().

Supported providers:
  gemini | groq | ollama | openrouter | openai
"""

import os

from dotenv import load_dotenv

load_dotenv(override=True)


# ──────────────────────────────────────────────
# Default model names per provider
# ──────────────────────────────────────────────

DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
    "ollama": "llama3",
    "openrouter": "google/gemma-3-4b-it:free",
    "openai": "gpt-4o-mini",
}


# ──────────────────────────────────────────────
# LLMManager — Singleton Wrapper Class
# ──────────────────────────────────────────────

class LLMManager:
    """
    Thread-safe(ish) singleton that holds the current LLM
    configuration and can be hot-swapped at runtime without
    restarting the server.
    """

    def __init__(self):
        self._provider: str = os.getenv("LLM_PROVIDER", "gemini").lower()
        self._model_name: str | None = os.getenv("LLM_MODEL_NAME")
        self._api_keys: dict[str, str] = {
            "gemini": os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY", ""),
            "groq": os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY", ""),
            "ollama": "",  # no key needed
            "openrouter": os.getenv("LLM_API_KEY", ""),
            "openai": os.getenv("LLM_API_KEY", ""),
        }
        # Also store the generic LLM_API_KEY for the current provider
        generic_key = os.getenv("LLM_API_KEY", "")
        if generic_key and not self._api_keys.get(self._provider):
            self._api_keys[self._provider] = generic_key

        self._llm_instance = None  # lazily created

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def model_name(self) -> str:
        return self._model_name or DEFAULT_MODELS.get(self._provider, "unknown")

    @property
    def api_key(self) -> str:
        return self._api_keys.get(self._provider, "")

    def switch_provider(self, provider: str, model_name: str | None = None) -> dict:
        """
        Hot-swap the active LLM provider and model at runtime.
        The next call to get_llm() will use the new provider.

        Args:
            provider: one of gemini, groq, ollama, openrouter, openai
            model_name: optional model override

        Returns:
            dict with the new provider info
        """
        provider = provider.lower().strip()
        if provider not in DEFAULT_MODELS:
            raise ValueError(
                f"Unknown provider '{provider}'. "
                f"Supported: {', '.join(DEFAULT_MODELS.keys())}"
            )

        self._provider = provider
        self._model_name = model_name
        self._llm_instance = None  # force re-creation on next get_llm()

        return self.get_provider_info()

    def get_llm(self):
        """
        Return a LangChain-compatible chat model for the current provider.
        Lazy-imports so only the required SDK is loaded.
        Caches the instance until provider is switched.
        """
        if self._llm_instance is not None:
            return self._llm_instance

        key = self.api_key
        model = self.model_name

        if self._provider == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            self._llm_instance = ChatGoogleGenerativeAI(
                model=model,
                google_api_key=key,
                temperature=0.3,
            )

        elif self._provider == "groq":
            from langchain_groq import ChatGroq
            self._llm_instance = ChatGroq(
                model=model,
                groq_api_key=key,
                temperature=0.3,
            )

        elif self._provider == "ollama":
            from langchain_ollama import ChatOllama
            self._llm_instance = ChatOllama(
                model=model,
                temperature=0.3,
            )

        elif self._provider == "openrouter":
            from langchain_openai import ChatOpenAI
            self._llm_instance = ChatOpenAI(
                model=model,
                openai_api_key=key,
                openai_api_base="https://openrouter.ai/api/v1",
                temperature=0.3,
            )

        elif self._provider == "openai":
            from langchain_openai import ChatOpenAI
            self._llm_instance = ChatOpenAI(
                model=model,
                openai_api_key=key,
                temperature=0.3,
            )

        else:
            raise ValueError(
                f"Unknown LLM provider: '{self._provider}'. "
                f"Supported: {', '.join(DEFAULT_MODELS.keys())}"
            )

        return self._llm_instance

    def get_provider_info(self) -> dict:
        """Return metadata about the active LLM provider."""
        return {
            "provider": self._provider,
            "model": self.model_name,
            "api_key_set": bool(self.api_key),
            "available_providers": list(DEFAULT_MODELS.keys()),
        }


# ──────────────────────────────────────────────
# Module-level singleton + convenience functions
# (backwards-compatible — all existing imports work)
# ──────────────────────────────────────────────

_manager = LLMManager()


def get_llm():
    """Return the active LangChain chat model."""
    return _manager.get_llm()


def get_provider_info() -> dict:
    """Return metadata about the active LLM provider."""
    return _manager.get_provider_info()


def get_manager() -> LLMManager:
    """Return the global LLMManager singleton (for runtime switching)."""
    return _manager
