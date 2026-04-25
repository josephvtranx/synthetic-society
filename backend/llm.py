"""
LLM integration for conversation generation and argument scoring.
Owner: Person A
"""

import os
import json
import random

from agent import Agent

# ── Demo mode detection ──────────────────────────────────────────────────────
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-20250514"

if API_KEY:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=API_KEY)
else:
    client = None


async def generate_conversation(
    agent_a: Agent,
    agent_b: Agent,
    topic: str,
) -> dict:
    """
    Generate a short argument between two agents about a topic.
    Returns: {"agent_a_statement": str, "agent_b_statement": str}

    DEMO MODE: If no API key, returns placeholder statements.
    """
    # TODO [A4]: Implement demo mode fallback
    #   Return placeholder like "{name} argued their position firmly."
    #   with random but plausible filler text.

    # TODO [A5]: Implement real LLM call
    #   System prompt: "You are simulating realistic human conversation..."
    #   User prompt: include both agents' names, ages, positions, personality
    #   summaries (openness, analytical, identity_attachment), topic,
    #   and last 2 memory entries.
    #   Parse JSON response. Fall back to demo mode on any error.
    raise NotImplementedError("TODO [A4/A5]")


async def score_argument(
    statement: str,
    topic: str,
    target_agent: Agent,
) -> dict:
    """
    Score the persuasive quality of a statement for a specific listener.
    Returns: {"logic": float, "emotion": float, "evidence": float}

    DEMO MODE: If no API key, returns random scores.
    """
    # TODO [A4]: Implement demo mode fallback
    #   Return {"logic": random(0.2,0.8), "emotion": random(0.2,0.8),
    #           "evidence": random(0.2,0.8)}

    # TODO [A6]: Implement real LLM call
    #   System prompt: "Score the persuasive quality of this statement..."
    #   User prompt: include statement, topic, target agent's analytical
    #   score and identity_attachment.
    #   Parse JSON response. Fall back to random scores on error.
    raise NotImplementedError("TODO [A4/A6]")
