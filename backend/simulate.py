"""
Simulation engine for synthetic society.
No phases — fully interactive. Users inject arguments to any agent at any time.
Each tick: agents randomly pair along edges and converse. Belief spreads via
ELM (argument quality) + Asch (peer pressure) formulas.

Trust is dynamic:
  - Initialized from opinion similarity + cluster membership
  - Updated after each conversation (productive → +0.05, hostile → −0.03)
  - Decays every tick (×0.998) when no contact
  - Edges below MIN_TRUST are removed (echo chamber formation)
  - New edges form via triadic closure (friend-of-a-friend)
"""
from __future__ import annotations

import asyncio
import random
import os
import json
import logging
import re
import time

from agent import Agent, generate_population
from network import create_society_graph
from persuasion_classifier import predict_argument_quality

# ── Logging ──────────────────────────────────────────────────────────────────
logger = logging.getLogger("sim")
logger.setLevel(logging.DEBUG)
_handler = logging.FileHandler(
    os.path.join(os.path.dirname(__file__), "sim.log"), mode="w"
)
_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(_handler)

# ── LLM setup ─────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
FAST_MODEL = "claude-haiku-4-5-20251001"
PROBE_MODEL = "claude-sonnet-4-6"

_client = None


def _get_client():
    global _client
    if _client is None and API_KEY:
        import anthropic
        _client = anthropic.AsyncAnthropic(api_key=API_KEY)
    return _client


# ── Breaking events ──────────────────────────────────────────────────────────
EVENT_CHANCE_PER_TICK = 0.30  # ~30% chance each tick (roughly every 3 ticks)

EVENT_TEMPLATES = [
    {
        "type": "viral_video",
        "headline": "A viral video surfaces showing {scenario}",
        "effect": "nudge",       # small push on random agents
        "magnitude": 0.06,
        "reach": 0.3,            # fraction of agents affected
    },
    {
        "type": "leader_switch",
        "headline": "A respected community leader publicly changes their stance",
        "effect": "flip_leader",  # one high-trust agent gets a big nudge
        "magnitude": 0.12,
        "reach": 0.04,
    },
    {
        "type": "news_report",
        "headline": "Breaking: New study released with {findings}",
        "effect": "nudge",
        "magnitude": 0.05,
        "reach": 0.4,
    },
    {
        "type": "personal_story",
        "headline": "A personal story goes viral: \"{story}\"",
        "effect": "emotional",
        "magnitude": 0.08,
        "reach": 0.25,
    },
    {
        "type": "economic_shock",
        "headline": "Economic report reveals {impact} — people are rattled",
        "effect": "nudge",
        "magnitude": 0.07,
        "reach": 0.5,
    },
    {
        "type": "protest",
        "headline": "A protest breaks out in the community over {issue}",
        "effect": "polarize",    # pushes people further from center
        "magnitude": 0.05,
        "reach": 0.35,
    },
    {
        "type": "scandal",
        "headline": "Scandal: A prominent advocate is caught {scandal}",
        "effect": "backlash",    # pushes people AWAY from the scandal side
        "magnitude": 0.09,
        "reach": 0.4,
    },
]


async def _generate_event(topic: str, tick: int) -> dict | None:
    """
    Maybe generate a breaking event this tick. Returns event dict or None.
    Uses LLM to fill in topic-specific details for the template.
    """
    if random.random() > EVENT_CHANCE_PER_TICK:
        return None

    template = random.choice(EVENT_TEMPLATES)
    client = _get_client()
    headline = template["headline"]

    # Fill in template placeholders with topic-specific content
    if client and "{" in headline:
        try:
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=60,
                system=(
                    "Fill in the blank for a breaking news event about this topic. "
                    "Return ONLY the fill-in text, no quotes, under 15 words. "
                    "Be specific and dramatic."
                ),
                messages=[{"role": "user", "content": (
                    f"Topic: {topic}\n"
                    f"Template: {headline}\n"
                    f"Fill in the {{bracketed}} part only."
                )}],
            )
            fill = response.content[0].text.strip().strip('"')
            # Replace first placeholder
            import re as _re
            headline = _re.sub(r"\{[^}]+\}", fill, headline, count=1)
        except Exception as e:
            logger.error(f"Event headline fill error: {e}")
            # Use template as-is with placeholder removed
            headline = headline.replace("{", "").replace("}", "")

    event = {
        "type": template["type"],
        "headline": headline,
        "effect": template["effect"],
        "magnitude": template["magnitude"],
        "reach": template["reach"],
        "tick": tick,
        "affected_agents": [],
    }

    logger.info(f"  EVENT [{template['type']}]: {headline}")
    return event


def _apply_event(event: dict, agents: dict, graph) -> list[dict]:
    """
    Apply a breaking event's effect to agents. Returns list of shifts caused.
    """
    shifts = []
    agent_list = list(agents.values())
    n_affected = max(1, int(len(agent_list) * event["reach"]))
    effect = event["effect"]
    mag = event["magnitude"]

    if effect == "flip_leader":
        # Find the agent with highest degree (most connections)
        degrees = [(a.id, graph.degree(a.id)) for a in agent_list if graph.has_node(a.id)]
        if degrees:
            degrees.sort(key=lambda x: -x[1])
            leader_id = degrees[0][0]
            leader = agents[leader_id]
            old_pos = leader.position
            # Push toward opposite side
            direction = -1 if leader.position > 0 else 1
            delta = direction * mag * (1 - leader.identity_attachment * 0.5)
            leader.position = max(-1.0, min(1.0, leader.position + delta))
            actual = leader.position - old_pos
            if abs(actual) > 0.001:
                shifts.append({"agent_id": leader_id, "delta": round(actual, 4),
                               "new_position": round(leader.position, 4), "source": "event"})
                event["affected_agents"] = [leader_id]
                logger.info(f"    Leader flip: {leader.name} {old_pos:.3f}→{leader.position:.3f}")
    elif effect == "polarize":
        # Push people further from center
        targets = random.sample(agent_list, min(n_affected, len(agent_list)))
        for agent in targets:
            old_pos = agent.position
            direction = 1 if agent.position > 0 else (-1 if agent.position < 0 else random.choice([-1, 1]))
            delta = direction * mag * (1 - agent.openness * 0.4)
            agent.position = max(-1.0, min(1.0, agent.position + delta))
            actual = agent.position - old_pos
            if abs(actual) > 0.001:
                shifts.append({"agent_id": agent.id, "delta": round(actual, 4),
                               "new_position": round(agent.position, 4), "source": "event"})
        event["affected_agents"] = [a.id for a in targets]
    elif effect == "backlash":
        # Push people away from one side (randomly chosen)
        backlash_against = random.choice([-1, 1])
        targets = random.sample(agent_list, min(n_affected, len(agent_list)))
        for agent in targets:
            old_pos = agent.position
            delta = -backlash_against * mag * (1 - agent.identity_attachment * 0.5)
            agent.position = max(-1.0, min(1.0, agent.position + delta))
            actual = agent.position - old_pos
            if abs(actual) > 0.001:
                shifts.append({"agent_id": agent.id, "delta": round(actual, 4),
                               "new_position": round(agent.position, 4), "source": "event"})
        event["affected_agents"] = [a.id for a in targets]
    else:
        # Default nudge / emotional: push random subset in a random direction
        direction = random.choice([-1, 1])
        targets = random.sample(agent_list, min(n_affected, len(agent_list)))
        for agent in targets:
            old_pos = agent.position
            # Openness and conformity modulate susceptibility
            suscept = 0.5 + agent.conformity * 0.3 + agent.openness * 0.2
            delta = direction * mag * suscept
            if effect == "emotional":
                delta *= (1.2 - agent.analytical * 0.4)  # emotional hits non-analytical harder
            agent.position = max(-1.0, min(1.0, agent.position + delta))
            actual = agent.position - old_pos
            if abs(actual) > 0.001:
                shifts.append({"agent_id": agent.id, "delta": round(actual, 4),
                               "new_position": round(agent.position, 4), "source": "event"})
        event["affected_agents"] = [a.id for a in targets]

    logger.info(f"    Event affected {len(event['affected_agents'])} agents, {len(shifts)} shifted")
    return shifts


# ── Trust constants ───────────────────────────────────────────────────────────
MIN_TRUST = 0.05          # edge removed when trust falls below this
NEW_EDGE_TRUST = 0.10     # starting trust for triadic-closure-formed edges
TRUST_DECAY = 0.998       # multiplicative decay per tick on all edges
TRIADIC_SCALE = 0.15      # scales probability of a new edge forming per tick
MULTIPLIER = 15           # Multiply all opinion deltas by this to make opinion changes more pronounced


# ── JSON extraction ───────────────────────────────────────────────────────────
def _extract_json(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise json.JSONDecodeError("No JSON found", text, 0)


# ── Probe questions ───────────────────────────────────────────────────────────
PROBE_QUESTIONS = {
    "default": [
        "If someone you trust told you they strongly disagree with your current view, how would you respond?",
        "Can you think of a scenario where the opposing position would actually be the better choice?",
        "If you had to explain your position to a skeptic, what is the strongest argument you'd make?",
    ],
    "minimum wage": [
        "If a small business owner says they'll have to lay off two workers when min wage rises, what should policy do?",
        "Should states with low costs of living be allowed to set minimum wages below the federal level?",
        "Should tipped workers be exempt from minimum wage increases?",
        "If automation replaces minimum wage jobs after a wage increase, was the increase still worth it?",
    ],
}


def _get_probe_question(topic: str) -> str:
    questions = PROBE_QUESTIONS.get(topic.lower(), PROBE_QUESTIONS["default"])
    return random.choice(questions)


# ── Personality descriptors ──────────────────────────────────────────────────
def _describe_personality(agent: Agent) -> str:
    """
    Translate numeric traits into a narrative personality sketch.
    Gives the LLM something to role-play with instead of raw numbers.
    """
    parts = []

    # Openness
    if agent.openness > 0.7:
        parts.append("genuinely curious and open to new ideas")
    elif agent.openness > 0.4:
        parts.append("willing to listen but cautious about changing their mind")
    else:
        parts.append("deeply skeptical of new ideas and set in their ways")

    # Analytical
    if agent.analytical > 0.7:
        parts.append("demands hard evidence and picks apart weak reasoning")
    elif agent.analytical > 0.4:
        parts.append("can follow a logical argument but also swayed by stories")
    else:
        parts.append("trusts gut feelings and personal experience over data")

    # Conformity
    if agent.conformity > 0.7:
        parts.append("cares a lot about what their peers think")
    elif agent.conformity > 0.4:
        parts.append("somewhat influenced by social pressure")
    else:
        parts.append("doesn't care what others think, speaks their mind freely")

    # Identity attachment
    if agent.identity_attachment > 0.7:
        parts.append("this issue is deeply personal to their identity")
    elif agent.identity_attachment > 0.4:
        parts.append("has some personal stake in this issue")
    else:
        parts.append("sees this as an intellectual question, not a personal one")

    # Confidence
    if agent.confidence > 0.7:
        parts.append("very sure of their current view")
    elif agent.confidence > 0.4:
        parts.append("moderately confident but has some doubts")
    else:
        parts.append("uncertain and still figuring out what they believe")

    return ". ".join(parts) + "."


# ── Stance generation ─────────────────────────────────────────────────────────
async def generate_stance(agent: Agent, topic: str) -> str:
    """Generate a rich internal belief grounded in the agent's life experience."""
    client = _get_client()
    personality = _describe_personality(agent)
    if client:
        try:
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=150,
                system=(
                    "Generate a person's internal belief about the topic in first person. "
                    "2-3 sentences. Ground it in a specific life experience, memory, or observation "
                    "that explains WHY they hold this view — not just what they believe. "
                    "Match their position: negative=against, positive=for, near zero=conflicted. "
                    "Write in their natural voice (casual, not academic). "
                    "Return ONLY the text, no quotes, no JSON."
                ),
                messages=[{"role": "user", "content": (
                    f"Topic: {topic}\n"
                    f"Person: {agent.name}, age {agent.age}, "
                    f"{agent.group_ids[0] if agent.group_ids else 'general'}\n"
                    f"Position: {agent.position:.2f} (-1=strongly against, 1=strongly for)\n"
                    f"Personality: {personality}"
                )}],
            )
            return response.content[0].text.strip().strip('"')
        except Exception as e:
            logger.error(f"Stance error for {agent.name}: {e}")

    if agent.position > 0.3:
        return "I think this makes sense, we should support it."
    elif agent.position < -0.3:
        return "I don't buy it. This isn't going to work."
    return "I'm not sure yet. I'd need to hear more."


async def generate_all_stances(agents: dict, topic: str) -> dict:
    logger.info(f"Generating stances for {len(agents)} agents on '{topic}'")
    stances = {}
    items = list(agents.items())
    for i in range(0, len(items), 10):
        batch = items[i:i + 10]
        results = await asyncio.gather(*[generate_stance(a, topic) for _, a in batch])
        for (aid, _), stance in zip(batch, results):
            stances[aid] = stance
        if i + 10 < len(items):
            await asyncio.sleep(1.0)
    return stances


# ── ELM delta formula ─────────────────────────────────────────────────────────
def _compute_elm_delta(
    listener: Agent,
    arg_type: str,
    arg_quality: float,
    arg_position: float,
    trust: float = 1.0,
) -> float:
    """
    Elaboration Likelihood Model argument delta (Petty & Cacioppo 1986).
    trust scales the entire delta (v2 formula: delta_arg *= trust[A][B]).
    Maps agent params:
      analytical → NFC (need for cognition)
      conformity → agreeableness proxy
      identity_attachment → identity_centrality
    """
    nfc = listener.analytical
    openness = listener.openness
    salience = 0.5  # default topic salience

    # Elaboration likelihood
    elab = min(1.0, max(0.0, nfc * 0.4 + salience * 0.3 + openness * 0.3))

    # Source credibility blends trust and default expertise
    source_cred = 0.5 * trust + 0.25   # 0.25–0.75 range

    # Central/peripheral max shift per exposure:
    # Petty & Cacioppo (1986) Fig 3: high-elab strong-arg shifts ~0.8 on 7-pt
    # scale = 0.8/7 ≈ 0.114 per unit distance. We use 0.12 for central
    # (strong argument quality ≈ 1.0) and 0.09 for peripheral (weaker effect).
    # Peripheral sourced from Chaiken (1980): heuristic shifts ~60-75% of
    # systematic shifts → 0.12 × 0.75 ≈ 0.09
    d_central = arg_quality * 0.12 * (arg_position - listener.position)
    d_periph  = source_cred * 0.09 * (arg_position - listener.position)

    # Argument type modulation
    type_mult = {
        "evidence":   0.5 + nfc * 0.5,
        "social":     0.3 + listener.conformity * 0.7,
        "emotional":  0.65,
        "repetition": 1.0 - nfc * 0.5,
    }.get(arg_type, 0.7)

    # Confirmation bias damping (low openness → high confirmation bias)
    cb = 1.0 - openness
    alignment = 1.0 - abs(arg_position - listener.position) / 2.0
    cb_damp = 1.0 - (cb * alignment * 0.6)

    # Trust scales the whole delta (v2 additions, Step 6)
    return (elab * d_central + (1.0 - elab) * d_periph) * type_mult * cb_damp * trust * MULTIPLIER


# ── Asch peer pressure formula ────────────────────────────────────────────────
def _sign(x: float) -> int:
    return 1 if x > 0 else (-1 if x < 0 else 0)


def _compute_asch_delta(agent: Agent, graph, agents: dict) -> float:
    """
    Asch (1951/1956) peer pressure from trusted neighborhood.
    Only neighbors with trust > 0.2 count (v2 directed-edge threshold).
    Trust-weighted mean and opposition ratio (McPherson et al. 2001).

    Calibration (from original studies):
      base_rate 0.368 = Asch (1956) mean conformity rate across 12 critical trials
      u_mult = 6.7 when no ally — Allen & Levine (1968): conformity drops
        from 37% to 5.5% with one ally, ratio = 37/5.5 ≈ 6.7
    """
    all_nbr = [
        (n, graph[agent.id][n].get("weight", 1.0))
        for n in graph.neighbors(agent.id)
        if n in agents
    ]
    # Filter to trusted neighbors only
    neighbors = [(n, w) for n, w in all_nbr if w > 0.2]
    if not neighbors:
        return 0.0

    total_w = sum(w for _, w in neighbors)

    # Trust-weighted mean neighbor position
    neighbor_mean = sum(agents[n].position * w for n, w in neighbors) / total_w

    # Trust-weighted opposition ratio
    agent_sign = _sign(agent.position)
    w_opp = sum(w for n, w in neighbors if _sign(agents[n].position) != agent_sign)
    opp_ratio = w_opp / total_w

    # Unanimity multiplier — Allen & Levine (1968): 37% → 5.5% with ally
    # ratio = 37/5.5 ≈ 6.7×
    has_ally = any(_sign(agents[n].position) == agent_sign for n, _ in neighbors)
    u_mult = 1 if not has_ally else 0.16

    # Susceptibility (map: agreeableness→conformity, neuroticism default 0.5)
    suscept = (
        0.40 * (1.0 - agent.openness)
        + 0.25 * agent.conformity
        + 0.10                             # neuroticism contribution (0.5 × 0.20)
        + 0.15 * (1.0 - agent.analytical)
    )

    # Asch (1956): 36.8% conformity under unanimous opposition
    p_update = min(0.368 * opp_ratio * u_mult * suscept, 0.80)
    if random.random() < p_update:
        # Magnitude: shift toward group mean by ~8% of distance
        # Gerard, Wilhelmy & Conolley (1968): conforming responses average
        # 6-10% movement toward group position per exposure
        return (neighbor_mean - agent.position) * 0.08 * MULTIPLIER
    return 0.0


def _apply_resistance(agent: Agent, raw_delta: float) -> float:
    """
    Identity resistance + rare backfire.

    Identity-protective cognition — Kahan et al. (2012): subjects with strong
    identity priors showed ~70% resistance to counter-attitudinal evidence.
    Confidence contributes ~30% of resistance (Petrocelli et al. 2007:
    attitude certainty independently predicts resistance r=0.34).

    Backfire — Wood & Porter (2019): tested across 52 issues, found backfire
    is "considerably more rare" than assumed. Only ~10-15% of high-identity
    subjects showed any backfire, and effect sizes were small (~0.3× reversal).
    We use 12% base rate for high-identity agents with large incoming deltas.
    """
    id_resist = agent.identity_attachment * 0.70 + agent.confidence * 0.30
    total = raw_delta * (1.0 - id_resist * 0.80)

    # Backfire: Wood & Porter (2019) — rare, ~12% of high-identity cases
    if abs(raw_delta) > 0.05:
        backfire_prob = agent.identity_attachment * 0.12 * (abs(raw_delta) > 0.10)
        if random.random() < backfire_prob:
            total = -abs(total) * 0.30

    return total


# ── Trust evolution ───────────────────────────────────────────────────────────
def _update_trust_after_conversation(
    graph,
    a_id: str,
    b_id: str,
    delta_a: float,
    delta_b: float,
    agent_a: Agent,
    agent_b: Agent,
) -> None:
    """
    Update trust on an edge after a conversation (ScienceDirect 2018 model).
    Productive exchange → trust grows. Friction / no movement → trust erodes.
    Opinion convergence adds a bonus.
    """
    if not graph.has_edge(a_id, b_id):
        return

    both_moved = abs(delta_a) > 0.002 and abs(delta_b) > 0.002
    one_moved  = abs(delta_a) > 0.002 or  abs(delta_b) > 0.002

    if both_moved:
        quality = 0.05
    elif one_moved:
        quality = 0.02
    else:
        quality = -0.03   # neither engaged → mild friction

    # Convergence bonus: positions converging → homophily grows (McPherson 2001)
    gap = abs(agent_a.position - agent_b.position)
    if gap < 0.3:
        quality += 0.02

    current = graph[a_id][b_id].get("weight", 0.1)
    graph[a_id][b_id]["weight"] = round(max(0.0, min(1.0, current + quality)), 3)


def _evolve_trust(graph, agents: dict) -> dict:
    """
    Per-tick trust evolution — call at the end of every tick.

    1. Decay all edges (×TRUST_DECAY = 0.998) — slow erosion without contact.
    2. Remove edges below MIN_TRUST = 0.05 — weak ties fade entirely.
    3. New edges via triadic closure — friend-of-a-friend meeting (AJS 2009).
       Probability ∝ max(trust[A→C] × trust[B→C]) × TRIADIC_SCALE.
       New edge starts at a small trust value based on opinion similarity.

    Returns {removed, added} counts for the tick snapshot.
    """
    removed = 0
    added = 0

    # 1. Decay
    for u, v in graph.edges():
        graph[u][v]["weight"] = round(graph[u][v].get("weight", 0.1) * TRUST_DECAY, 4)

    # 2. Remove weak edges
    to_remove = [
        (u, v) for u, v in list(graph.edges())
        if graph[u][v].get("weight", 0.1) < MIN_TRUST
    ]
    for u, v in to_remove:
        graph.remove_edge(u, v)
        removed += 1
    if removed:
        logger.info(f"  Trust: removed {removed} weak edge(s)")

    # 3. Triadic closure — new connections via mutual friends
    agent_ids = list(agents.keys())
    new_edges = []

    for i, a_id in enumerate(agent_ids):
        for b_id in agent_ids[i + 1:]:
            if graph.has_edge(a_id, b_id):
                continue

            # Find mutual trusted friends
            a_nbr = {n for n in graph.neighbors(a_id) if graph[a_id][n].get("weight", 0) > 0.2}
            b_nbr = {n for n in graph.neighbors(b_id) if graph[b_id][n].get("weight", 0) > 0.2}
            common = a_nbr & b_nbr
            if not common:
                continue

            # Triadic boost from strongest mutual connection (AJS 2009)
            triadic_boost = max(
                graph[a_id][c].get("weight", 0) * graph[b_id][c].get("weight", 0)
                for c in common
            ) * 0.20

            # Probability this tick proportional to boost
            p_form = triadic_boost * TRIADIC_SCALE
            if random.random() < p_form:
                a_ag = agents.get(a_id)
                b_ag = agents.get(b_id)
                if a_ag and b_ag:
                    opinion_sim = 1.0 - abs(a_ag.position - b_ag.position) / 2.0
                    # Higher opinion similarity → stronger starting trust
                    init_trust = round(min(0.30, NEW_EDGE_TRUST + opinion_sim * 0.06 + triadic_boost), 3)
                    new_edges.append((a_id, b_id, init_trust))

    for a_id, b_id, trust in new_edges:
        graph.add_edge(a_id, b_id, weight=trust)
        added += 1
    if added:
        logger.info(f"  Trust: formed {added} new triadic edge(s)")

    return {"removed": removed, "added": added}


# ── LLM: agent-to-agent conversation ─────────────────────────────────────────
async def generate_agent_conversation(
    speaker: Agent,
    listener: Agent,
    topic: str,
    stances: dict,
) -> dict:
    """
    LLM generates a two-turn conversation between speaker and listener.
    Both argue from their current positions in their own voice.
    Returns both messages and argument classifications.
    """
    client = _get_client()
    speaker_stance = stances.get(speaker.id, f"position {speaker.position:+.2f}")
    listener_stance = stances.get(listener.id, f"position {listener.position:+.2f}")
    speaker_personality = _describe_personality(speaker)
    listener_personality = _describe_personality(listener)

    # Default dialogue + types in case LLM fails
    speaker_message = f"I think you should consider: {topic}."
    listener_response = "I hear you, but I see it differently."
    speaker_arg_type = "social"
    listener_arg_type = "social"

    if client:
        try:
            t0 = time.time()
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=500,
                system=(
                    f"Simulate a realistic conversation between two people about: {topic}\n\n"
                    "RULES:\n"
                    "- Each person speaks 3-5 sentences in their natural voice\n"
                    "- They should reference specific personal experiences, anecdotes, or concrete examples\n"
                    "- They should ACTUALLY ENGAGE with each other — push back, ask pointed questions, "
                    "concede specific points, or double down with real reasons\n"
                    "- Avoid generic platitudes like 'that's interesting' or 'I see your point' — "
                    "make them argue like real people who care about this topic\n"
                    "- If they disagree, show the tension. If they agree, show them building on each other's ideas\n"
                    "- Their personality traits should shape HOW they argue, not just WHAT they say\n\n"
                    "Classify each person's PRIMARY argument strategy:\n"
                    "  evidence = cites facts, data, studies, specific outcomes\n"
                    "  social = appeals to norms, what others think, community standards\n"
                    "  emotional = appeals to values, fairness, personal impact, moral weight\n"
                    "  repetition = restates existing position without new substance\n\n"
                    "Return ONLY valid JSON:\n"
                    '{"speaker_message": "...", '
                    '"speaker_arg_type": "evidence|social|emotional|repetition", '
                    '"listener_response": "...", '
                    '"listener_arg_type": "evidence|social|emotional|repetition"}'
                ),
                messages=[{"role": "user", "content": (
                    f"SPEAKER: {speaker.name}, age {speaker.age}, "
                    f"{speaker.group_ids[0] if speaker.group_ids else 'general'}\n"
                    f"  Position: {speaker.position:+.2f}  |  View: \"{speaker_stance}\"\n"
                    f"  Personality: {speaker_personality}\n\n"
                    f"LISTENER: {listener.name}, age {listener.age}, "
                    f"{listener.group_ids[0] if listener.group_ids else 'general'}\n"
                    f"  Position: {listener.position:+.2f}  |  View: \"{listener_stance}\"\n"
                    f"  Personality: {listener_personality}"
                )}],
            )
            result = _extract_json(response.content[0].text)
            elapsed = time.time() - t0
            speaker_message = result.get("speaker_message", speaker_message)
            listener_response = result.get("listener_response", listener_response)
            speaker_arg_type = result.get("speaker_arg_type", "social")
            listener_arg_type = result.get("listener_arg_type", "social")
            logger.info(
                f"  Convo LLM ({elapsed:.1f}s): {speaker.name}↔{listener.name} "
                f"s_type={speaker_arg_type} l_type={listener_arg_type}"
            )
        except Exception as e:
            logger.error(f"  Convo LLM error ({speaker.name}↔{listener.name}): {e}")

    # Score both messages with CMV classifier
    speaker_quality = predict_argument_quality(speaker_message)
    listener_quality = predict_argument_quality(listener_response)
    logger.info(
        f"  CMV quality: {speaker.name}={speaker_quality:.3f} "
        f"{listener.name}={listener_quality:.3f}"
    )

    return {
        "speaker_message":     speaker_message,
        "speaker_arg_type":    speaker_arg_type,
        "speaker_arg_quality": speaker_quality,
        "listener_response":   listener_response,
        "listener_arg_type":   listener_arg_type,
        "listener_arg_quality": listener_quality,
    }


# ── LLM: classify user-injected argument ─────────────────────────────────────
async def classify_user_argument(prompt: str, topic: str, target: Agent) -> dict:
    """
    Classify a user-written argument.
    arg_quality comes from the CMV-trained classifier (empirically grounded).
    arg_type, arg_position, and agent_response come from the LLM.
    Returns {arg_type, arg_quality, arg_position, agent_response}.
    """
    # ── arg_quality from CMV classifier (instant, no LLM call) ──
    t0 = time.time()
    arg_quality = predict_argument_quality(prompt)
    logger.info(f"  CMV classifier ({time.time() - t0:.2f}s): arg_quality={arg_quality:.3f}")

    # ── arg_type, arg_position, agent_response from LLM ──
    client = _get_client()
    if client:
        try:
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=300,
                system=(
                    "Classify this argument and generate the target person's spoken response.\n\n"
                    "arg_type: evidence | social | emotional | repetition\n"
                    "arg_position: −1.0 to +1.0 (what position does this argument push toward)\n\n"
                    "Return ONLY valid JSON:\n"
                    '{"arg_type": "...", "arg_position": 0.0, '
                    '"agent_response": "1-2 sentences in character"}'
                ),
                messages=[{"role": "user", "content": (
                    f"Topic: {topic}\n"
                    f"Target: {target.name}, age {target.age}, "
                    f"{target.group_ids[0] if target.group_ids else 'general'}\n"
                    f"  Position: {target.position:+.2f}, Openness: {target.openness:.2f}, "
                    f"Analytical: {target.analytical:.2f}, "
                    f"Identity attachment: {target.identity_attachment:.2f}\n\n"
                    f'Argument: "{prompt}"'
                )}],
            )
            result = _extract_json(response.content[0].text)
            return {
                "arg_type":       result.get("arg_type", "social"),
                "arg_quality":    arg_quality,
                "arg_position":   max(-1.0, min(1.0, float(result.get("arg_position", 0.3)))),
                "agent_response": result.get("agent_response", "Hmm, I'll think about that."),
            }
        except Exception as e:
            logger.error(f"Classify argument error: {e}")

    return {
        "arg_type":       "social",
        "arg_quality":    arg_quality,
        "arg_position":   0.3,
        "agent_response": "That's an interesting perspective. I'm not sure I fully agree.",
    }


# ── Pairing logic ─────────────────────────────────────────────────────────────
def _pair_agents_for_tick(agents: dict, graph) -> list[tuple[str, str]]:
    """
    Randomly pair agents for conversation along existing edges.
    Each agent appears in at most one pair. Leftover agents sit out.
    """
    all_ids = list(agents.keys())
    random.shuffle(all_ids)

    used: set[str] = set()
    pairs: list[tuple[str, str]] = []

    for agent_id in all_ids:
        if agent_id in used:
            continue
        available = [
            n for n in graph.neighbors(agent_id)
            if n not in used and n in agents
        ]
        if not available:
            continue
        partner_id = random.choice(available)
        pairs.append((agent_id, partner_id))
        used.add(agent_id)
        used.add(partner_id)

    return pairs


# ── Core API functions ────────────────────────────────────────────────────────
async def inject_argument(
    agents: dict,
    graph,
    stances: dict,
    target_agent_id: str,
    prompt: str,
    topic: str,
) -> dict:
    """
    User injects an argument to a specific agent (trust = 1.0, player has no edge).
    Classifies via LLM, applies ELM + Asch delta, generates agent response.
    Does NOT advance the tick — call /next_tick separately.
    """
    if target_agent_id not in agents:
        return {"error": f"Agent {target_agent_id} not found"}

    target = agents[target_agent_id]
    old_position = target.position

    classified = await classify_user_argument(prompt, topic, target)
    arg_type      = classified["arg_type"]
    arg_quality   = classified["arg_quality"]
    arg_position  = classified["arg_position"]
    response_text = classified["agent_response"]

    # Player has no graph edge → trust = 1.0
    delta_arg  = _compute_elm_delta(target, arg_type, arg_quality, arg_position, trust=1.0)
    delta_peer = _compute_asch_delta(target, graph, agents)
    actual     = _apply_resistance(target, delta_arg + delta_peer)

    target.position = max(-1.0, min(1.0, target.position + actual))
    actual = target.position - old_position

    if abs(actual) > 0.02:
        stances[target_agent_id] = response_text

    logger.info(
        f"INJECT → {target.name}: type={arg_type} quality={arg_quality:.3f} "
        f"delta_arg={delta_arg:+.4f} delta_peer={delta_peer:+.4f} "
        f"actual={actual:+.4f}  pos {old_position:.4f}→{target.position:.4f}"
    )

    return {
        "from_id":           "player",
        "to_id":             target_agent_id,
        "speaker_message":   prompt,
        "listener_response": response_text,
        "arg_type":          arg_type,
        "arg_quality":       round(arg_quality, 3),
        "delta_arg":         round(delta_arg, 4),
        "delta_peer":        round(delta_peer, 4),
        "actual_delta":      round(actual, 4),
        "new_position":      round(target.position, 4),
        "agent":             _serialize_agent(target, stances),
    }


async def next_tick(
    agents: dict,
    graph,
    stances: dict,
    topic: str,
    tick: int,
) -> dict:
    """
    Advance simulation one tick.

    1. Randomly pair agents along existing edges (no double-booking).
    2. LLM generates conversations for all pairs in parallel.
    3. Apply ELM delta (scaled by edge trust) + Asch delta (trust-weighted
       neighborhood) + identity resistance to both agents in each pair.
    4. Update trust on each conversed edge.
    5. Evolve trust globally: decay all edges, remove weak ones, form
       new edges via triadic closure.
    """
    logger.info(f"--- Tick {tick} ---")

    pairs = _pair_agents_for_tick(agents, graph)
    n_unpaired = len(agents) - 2 * len(pairs)
    logger.info(f"  {len(pairs)} pairs / {n_unpaired} agents sit out")

    conversations = []
    shifts = []

    if pairs:
        # Generate conversations in batches of 6 (Haiku is fast)
        BATCH_SIZE = 6
        conv_results = []
        for i in range(0, len(pairs), BATCH_SIZE):
            batch = pairs[i:i + BATCH_SIZE]
            batch_results = await asyncio.gather(*[
                generate_agent_conversation(agents[a_id], agents[b_id], topic, stances)
                for a_id, b_id in batch
            ])
            conv_results.extend(batch_results)
            if i + BATCH_SIZE < len(pairs):
                await asyncio.sleep(0.5)

        for (a_id, b_id), conv in zip(pairs, conv_results):
            agent_a = agents[a_id]
            agent_b = agents[b_id]
            old_a = agent_a.position
            old_b = agent_b.position

            # Edge trust gates how much influence each agent has
            edge_trust = graph[a_id][b_id].get("weight", 1.0) if graph.has_edge(a_id, b_id) else 1.0

            # Listener B hears speaker A's argument (scaled by edge trust)
            delta_arg_b = _compute_elm_delta(
                agent_b,
                conv["speaker_arg_type"],
                conv["speaker_arg_quality"],
                agent_a.position,
                trust=edge_trust,
            )
            delta_peer_b = _compute_asch_delta(agent_b, graph, agents)
            actual_b = _apply_resistance(agent_b, delta_arg_b + delta_peer_b)
            agent_b.position = max(-1.0, min(1.0, agent_b.position + actual_b))
            actual_b = agent_b.position - old_b

            # Listener A hears speaker B's response (scaled by same edge trust)
            delta_arg_a = _compute_elm_delta(
                agent_a,
                conv["listener_arg_type"],
                conv["listener_arg_quality"],
                agent_b.position,
                trust=edge_trust,
            )
            delta_peer_a = _compute_asch_delta(agent_a, graph, agents)
            actual_a = _apply_resistance(agent_a, delta_arg_a + delta_peer_a)
            agent_a.position = max(-1.0, min(1.0, agent_a.position + actual_a))
            actual_a = agent_a.position - old_a

            # Trust update after the conversation
            _update_trust_after_conversation(graph, a_id, b_id, actual_a, actual_b, agent_a, agent_b)

            logger.info(
                f"  {agent_a.name}↔{agent_b.name} (trust={edge_trust:.3f}): "
                f"A {old_a:.3f}→{agent_a.position:.3f} ({actual_a:+.4f})  "
                f"B {old_b:.3f}→{agent_b.position:.3f} ({actual_b:+.4f})  "
                f"new_trust={graph[a_id][b_id]['weight'] if graph.has_edge(a_id, b_id) else 'removed'}"
            )

            conversations.append({
                "from_id":           a_id,
                "to_id":             b_id,
                "speaker_message":   conv["speaker_message"],
                "listener_response": conv["listener_response"],
                "speaker_arg_type":  conv["speaker_arg_type"],
                "listener_arg_type": conv["listener_arg_type"],
                "edge_trust":        round(edge_trust, 3),
                "delta_on_speaker":  round(actual_a, 4),
                "delta_on_listener": round(actual_b, 4),
                "tick":              tick,
            })

            if abs(actual_b) > 0.001:
                shifts.append({"agent_id": b_id,  "delta": round(actual_b, 4),
                                "new_position": round(agent_b.position, 4), "source": "argument"})
            if abs(actual_a) > 0.001:
                shifts.append({"agent_id": a_id,  "delta": round(actual_a, 4),
                                "new_position": round(agent_a.position, 4), "source": "argument"})

    # Breaking event (random, ~30% chance per tick)
    event = await _generate_event(topic, tick)
    if event:
        event_shifts = _apply_event(event, agents, graph)
        shifts.extend(event_shifts)

    # Global trust evolution (decay → prune → triadic closure)
    trust_changes = _evolve_trust(graph, agents)

    logger.info(
        f"  Tick {tick}: {len(conversations)} conversations, {len(shifts)} shifts | "
        f"edges removed={trust_changes['removed']} added={trust_changes['added']}"
        f"{' | EVENT: ' + event['type'] if event else ''}"
    )

    result = {
        "tick":          tick,
        "agents":        [_serialize_agent(a, stances) for a in agents.values()],
        "shifts":        shifts,
        "conversations": conversations,
        "n_pairs":       len(pairs),
        "n_unpaired":    n_unpaired,
        "trust_changes": trust_changes,
        "edges":         [
            {"source": u, "target": v, "weight": round(d.get("weight", 0), 3)}
            for u, v, d in graph.edges(data=True)
        ],
    }

    if event:
        result["event"] = {
            "type":            event["type"],
            "headline":        event["headline"],
            "affected_agents": event["affected_agents"],
            "tick":            tick,
        }

    return result


# ── Probe ─────────────────────────────────────────────────────────────────────
async def probe_agent(agent: Agent, topic: str, original_position: float) -> dict:
    """Test if belief shift is genuine or surface compliance."""
    question = _get_probe_question(topic)
    logger.info(f"Probe: {agent.name} {original_position:.3f}→{agent.position:.3f}")

    client = _get_client()
    if client:
        try:
            response = await client.messages.create(
                model=PROBE_MODEL,
                max_tokens=200,
                system=(
                    "Simulate a person answering a follow-up question after changing their position. "
                    "Genuine change → coherent, thoughtful answer applying the new belief to a novel scenario. "
                    "Surface-level change → vague, wishy-washy, or contradictory answer. "
                    'Return ONLY valid JSON: {"answer": "1-2 sentences", "genuine": true/false}'
                ),
                messages=[{"role": "user", "content": (
                    f"Person: {agent.name}\n"
                    f"Original position: {original_position:.2f} → Current: {agent.position:.2f}\n"
                    f"Openness: {agent.openness:.2f}, Conformity: {agent.conformity:.2f}, "
                    f"Identity attachment: {agent.identity_attachment:.2f}\n\n"
                    f'Question: "{question}"'
                )}],
            )
            result = _extract_json(response.content[0].text)
            return {
                "agent_id":       agent.id,
                "shifted":        True,
                "genuine":        bool(result.get("genuine", False)),
                "probe_question": question,
                "probe_answer":   result.get("answer", ""),
            }
        except Exception as e:
            logger.error(f"Probe error for {agent.name}: {e}")

    genuine = agent.openness > agent.conformity or random.random() > 0.5
    return {
        "agent_id":       agent.id,
        "shifted":        True,
        "genuine":        genuine,
        "probe_question": question,
        "probe_answer": (
            "I've thought carefully about this. My view shifted because the argument raised "
            "concerns I hadn't fully considered."
            if genuine else
            "I mean, I guess? Everyone seems to think so. I'm not sure about the specifics."
        ),
    }


# ── Serialization ─────────────────────────────────────────────────────────────
def _serialize_agent(agent: Agent, stances: dict | None = None) -> dict:
    d = {
        "id":                 agent.id,
        "name":               agent.name,
        "age":                agent.age,
        "position":           round(agent.position, 4),
        "confidence":         round(agent.confidence, 3),
        "openness":           round(agent.openness, 3),
        "analytical":         round(agent.analytical, 3),
        "conformity":         round(agent.conformity, 3),
        "identity_attachment": round(agent.identity_attachment, 3),
        "x":                  round(agent.x, 4),
        "y":                  round(agent.y, 4),
        "groups":             agent.group_ids,
    }
    if stances and agent.id in stances:
        d["stance"] = stances[agent.id]
    return d
