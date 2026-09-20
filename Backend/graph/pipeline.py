"""
KisanMind LangGraph Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orchestrates 5 specialized agents using LangGraph StateGraph.

Flow:
  START → router_node → [disease, market, scheme, weather] (PARALLEL) → report_node → END

Agents run in PARALLEL using LangGraph's fanout pattern.
Execution times (parallel vs sequential) are measured and
stored in KisanMindState for performance analysis.
"""

import time
from typing import Literal

from langgraph.graph import END, START, StateGraph

from agents.disease_agent import run_disease_agent
from agents.market_agent import run_market_agent
from agents.report_agent import run_report_agent
from agents.scheme_agent import run_scheme_agent
from agents.weather_agent import run_weather_agent
from memory.short_term import get_checkpointer
from models.state import KisanMindState


# ──────────────────────────────────────────────
# Router Node
# ──────────────────────────────────────────────

async def router_node(state: KisanMindState) -> KisanMindState:
    """
    Analyzes input and prepares state for parallel agent execution.
    All agents run regardless (graceful handling inside each),
    so this node mainly serves as an entry point for logging
    and state initialization.
    """
    return {
        "agent_times": {},
        "errors": {},
    }


# ──────────────────────────────────────────────
# Timing Wrapper Nodes
# ──────────────────────────────────────────────

async def disease_node(state: KisanMindState) -> KisanMindState:
    """Run disease agent with timing."""
    return await run_disease_agent(state)


async def market_node(state: KisanMindState) -> KisanMindState:
    """Run market agent with timing."""
    return await run_market_agent(state)


async def scheme_node(state: KisanMindState) -> KisanMindState:
    """Run scheme agent with timing."""
    return await run_scheme_agent(state)


async def weather_node(state: KisanMindState) -> KisanMindState:
    """Run weather agent with timing."""
    return await run_weather_agent(state)


async def report_node(state: KisanMindState) -> KisanMindState:
    """
    Run report agent AFTER all parallel agents complete.
    Also calculates parallel vs sequential execution times.
    """
    # Calculate sequential time (sum of individual agent times)
    agent_times = state.get("agent_times") or {}
    sequential_time = sum(agent_times.values())

    result = await run_report_agent(state)

    # Update agent_times from report agent
    updated_times = dict(agent_times)
    if result.get("agent_times"):
        updated_times.update(result["agent_times"])

    result["agent_times"] = updated_times
    result["execution_time_sequential"] = round(sequential_time, 3)

    return result


# ──────────────────────────────────────────────
# Build the StateGraph
# ──────────────────────────────────────────────

def build_graph() -> StateGraph:
    """
    Construct the KisanMind LangGraph pipeline.

    Architecture:
      START
        → router_node
        → [disease_node, market_node, scheme_node, weather_node]  (PARALLEL)
        → report_node
        → END
    """
    workflow = StateGraph(KisanMindState)

    # Add nodes
    workflow.add_node("router", router_node)
    workflow.add_node("disease", disease_node)
    workflow.add_node("market", market_node)
    workflow.add_node("scheme", scheme_node)
    workflow.add_node("weather", weather_node)
    workflow.add_node("report", report_node)

    # Entry point
    workflow.add_edge(START, "router")

    # Router fans out to all 4 agents IN PARALLEL
    # LangGraph executes nodes with the same source in parallel
    workflow.add_edge("router", "disease")
    workflow.add_edge("router", "market")
    workflow.add_edge("router", "scheme")
    workflow.add_edge("router", "weather")

    # All 4 agents converge into the report node
    workflow.add_edge("disease", "report")
    workflow.add_edge("market", "report")
    workflow.add_edge("scheme", "report")
    workflow.add_edge("weather", "report")

    # Report → END
    workflow.add_edge("report", END)

    return workflow


async def run_pipeline(state: KisanMindState) -> KisanMindState:
    """
    Main entry point: Run the full KisanMind pipeline.
    Measures total parallel execution time.

    Args:
        state: Initialized KisanMindState

    Returns:
        Completed state with all agent results and final report
    """
    start_time = time.time()
    workflow = build_graph()

    # Create checkpointer async context manager
    checkpointer_cm = await get_checkpointer()

    async with checkpointer_cm as checkpointer:
        graph = workflow.compile(checkpointer=checkpointer)

        # Run with a config that includes the session_id as thread_id
        config = {
            "configurable": {
                "thread_id": state.get("session_id", "default"),
            }
        }

        result = await graph.ainvoke(state, config=config)

    # Measure total parallel execution time
    parallel_time = round(time.time() - start_time, 3)
    result["execution_time_parallel"] = parallel_time

    return result
