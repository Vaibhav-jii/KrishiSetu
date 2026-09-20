"""
KisanMind Short-Term Memory
━━━━━━━━━━━━━━━━━━━━━━━━━━━
LangGraph Checkpoint using SQLite.
Stores full conversation state per session_id,
auto-managed by LangGraph's StateGraph.
"""

import os

from dotenv import load_dotenv
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

load_dotenv()

SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "./memory.db")


async def get_checkpointer() -> AsyncSqliteSaver:
    """
    Return an async SQLite-backed LangGraph checkpointer.

    Usage in pipeline.py:
        checkpointer = await get_checkpointer()
        graph = workflow.compile(checkpointer=checkpointer)
    """
    return AsyncSqliteSaver.from_conn_string(SQLITE_DB_PATH)
