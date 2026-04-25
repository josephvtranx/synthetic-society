"""
LLM integration for conversation generation and argument scoring.
Demo mode: works without API key using random values.
"""

import os
import json
import random

from agent import Agent

# ── Setup ────────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-20250514"

client = None
if API_KEY:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=API_KEY)


def _demo_conversation(agent_a: Agent, agent_b: Agent, topic: str) -> dict:
    """Placeholder conversation for demo mode."""
    stances = {True: "in favor of", False: "against"}
    a_stance = stances[agent_a.position > 0]
    b_stance = stances[agent_b.position > 0]
    return {
        "agent_a_statement": f"{agent_a.name} argued {a_stance} {topic}, drawing on personal experience.",
        "agent_b_statement": f"{agent_b.name} pushed back, making a case {b_stance} {topic}.",
    }


def _demo_scores() -> dict:
    """Random argument scores for demo mode."""
    return {
        "logic": round(random.uniform(0.2, 0.8), 2),
        "emotion": round(random.uniform(0.2, 0.8), 2),
        "evidence": round(random.uniform(0.2, 0.8), 2),
    }


def _agent_summary(agent: Agent) -> str:
    """Short personality summary for LLM prompts."""
    stance = "supportive" if agent.position > 0.3 else "opposed" if agent.position < -0.3 else "undecided"
    recent = ""
    if agent.memory:
        last = agent.memory[-1]
        recent = f" Recently heard: \"{last.get('message', '')[:80]}\""
    return (
        f"{agent.name}, age {agent.age}, {stance} (position={agent.position:.2f}). "
        f"Openness={agent.openness:.1f}, analytical={agent.analytical:.1f}, "
        f"identity_attachment={agent.identity_attachment:.1f}.{recent}"
    )


async def generate_conversation(
    agent_a: Agent,
    agent_b: Agent,
    topic: str,
) -> dict:
    """
    Generate a short argument between two agents about a topic.
    Returns: {"agent_a_statement": str, "agent_b_statement": str}
    """
    if not client:
        return _demo_conversation(agent_a, agent_b, topic)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=300,
            system="You are simulating realistic human conversation. Generate ONE statement "
                   "from each of two people briefly arguing about a topic. Each statement is 1-2 "
                   "sentences max. Be true to each person's personality — do not make them artificially "
                   "agree. People with low agreeableness push back hard. People with high "
                   "identity_attachment dismiss threats to their worldview. Return ONLY valid JSON: "
                   "{\"agent_a_statement\": \"...\", \"agent_b_statement\": \"...\"}",
            messages=[{
                "role": "user",
                "content": (
                    f"Topic: {topic}\n\n"
                    f"Person A: {_agent_summary(agent_a)}\n\n"
                    f"Person B: {_agent_summary(agent_b)}"
                ),
            }],
        )
        return json.loads(response.content[0].text)
    except Exception:
        return _demo_conversation(agent_a, agent_b, topic)


async def score_argument(
    statement: str,
    topic: str,
    target_agent: Agent,
) -> dict:
    """
    Score the persuasive quality of a statement for a specific listener.
    Returns: {"logic": float, "emotion": float, "evidence": float}
    """
    if not client:
        return _demo_scores()

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=100,
            system="Score the persuasive quality of this statement on three dimensions for "
                   "this specific listener. Return ONLY valid JSON: "
                   "{\"logic\": 0.0-1.0, \"emotion\": 0.0-1.0, \"evidence\": 0.0-1.0}",
            messages=[{
                "role": "user",
                "content": (
                    f"Statement: \"{statement}\"\n"
                    f"Topic: {topic}\n"
                    f"Listener: analytical={target_agent.analytical:.1f}, "
                    f"identity_attachment={target_agent.identity_attachment:.1f}"
                ),
            }],
        )
        scores = json.loads(response.content[0].text)
        return {
            "logic": max(0.0, min(1.0, float(scores.get("logic", 0.5)))),
            "emotion": max(0.0, min(1.0, float(scores.get("emotion", 0.5)))),
            "evidence": max(0.0, min(1.0, float(scores.get("evidence", 0.5)))),
        }
    except Exception:
        return _demo_scores()
