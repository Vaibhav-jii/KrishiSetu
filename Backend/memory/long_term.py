"""
KisanMind Long-Term Memory (ChromaDB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Persistent vector store for advisory reports.
Enables semantic search across past advisories and
per-farmer history retrieval.
"""

import os
from datetime import datetime
from typing import Optional

import chromadb
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")

# Initialize persistent ChromaDB client
_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
_collection = _client.get_or_create_collection(
    name="advisory_reports",
    metadata={"description": "KisanMind farmer advisory reports"},
)


def save_report(report: str, metadata: dict) -> str:
    """
    Save an advisory report to ChromaDB.

    Args:
        report: Full markdown report text
        metadata: Dict with session_id, crop, location, date, etc.

    Returns:
        The document ID
    """
    doc_id = f"{metadata.get('session_id', 'unknown')}_{datetime.utcnow().isoformat()}"

    # ChromaDB metadata values must be str, int, or float
    clean_meta = {}
    for k, v in metadata.items():
        if isinstance(v, (str, int, float)):
            clean_meta[k] = v
        else:
            clean_meta[k] = str(v)

    clean_meta.setdefault("saved_at", datetime.utcnow().isoformat())

    _collection.add(
        documents=[report],
        metadatas=[clean_meta],
        ids=[doc_id],
    )

    return doc_id


def get_history(session_id: str, limit: int = 20) -> list[dict]:
    """
    Retrieve all past advisory reports for a specific session.

    Returns:
        List of dicts with 'document', 'metadata', 'id'
    """
    results = _collection.get(
        where={"session_id": session_id},
        limit=limit,
    )

    if not results or not results["documents"]:
        return []

    history = []
    for i, doc in enumerate(results["documents"]):
        history.append({
            "id": results["ids"][i],
            "document": doc,
            "metadata": results["metadatas"][i] if results["metadatas"] else {},
        })

    return history


def get_all_history(limit: int = 50) -> list[dict]:
    """
    Retrieve all past advisory reports from all sessions.
    """
    results = _collection.get(limit=limit)
    if not results or not results["documents"]:
        return []

    history = []
    for i, doc in enumerate(results["documents"]):
        history.append({
            "id": results["ids"][i],
            "document": doc,
            "metadata": results["metadatas"][i] if results["metadatas"] else {},
        })
    # Sort by saved_at descending
    history.sort(key=lambda x: x["metadata"].get("saved_at", ""), reverse=True)
    return history


def search_similar(query: str, n_results: int = 5) -> list[dict]:
    """
    Semantic search across all stored advisory reports.

    Args:
        query: Natural language search query
        n_results: Max number of results

    Returns:
        List of similar reports with metadata
    """
    results = _collection.query(
        query_texts=[query],
        n_results=n_results,
    )

    if not results or not results["documents"] or not results["documents"][0]:
        return []

    similar = []
    for i, doc in enumerate(results["documents"][0]):
        similar.append({
            "id": results["ids"][0][i],
            "document": doc,
            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
            "distance": results["distances"][0][i] if results.get("distances") else None,
        })

    return similar
