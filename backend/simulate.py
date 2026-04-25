"""
Single-message simulation engine.
Phase 1: LLM evaluates targeted agent's response to player's argument.
Phase 2: LLM-generated conversations between agents — ideas spread through dialogue.
Probe: LLM tests whether shifts are genuine or surface compliance.
"""

import asyncio
import random
import os
import json
import logging
import re
import time

from agent import Agent, generate_population
from network import create_society_graph

# ── Logging setup ─────────────────────────────────────────────────────────
logger = logging.getLogger("sim")
logger.setLevel(logging.DEBUG)
_handler = logging.FileHandler(
    os.path.join(os.path.dirname(__file__), "sim.log"), mode="w"
)
_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(_handler)

# ── LLM setup ──────────────────────────────────────────────────────────────

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


# ── Probe questions per topic ──────────────────────────────────────────────

PROBE_QUESTIONS = {
    "default": [
        "If someone you trust told you they strongly disagree with your current view on this, how would you respond?",
        "Can you think of a scenario where the opposing position would actually be the better choice?",
        "If you had to explain your position to someone who disagrees, what's the strongest argument you'd make?",
    ],
    "minimum wage": [
        "If a small business owner says they'll have to lay off two workers when min wage rises, what should policy do?",
        "Should states with low costs of living be allowed to set minimum wages below the federal level?",
        "Should tipped workers be exempt from minimum wage increases?",
        "If automation replaces minimum wage jobs after a wage increase, was the increase still worth it?",
    ],
}


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences and preamble."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Find JSON object — handle nested braces
    m = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    # Greedy fallback on original text
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise json.JSONDecodeError("No JSON found", text, 0)


def _get_probe_question(topic: str) -> str:
    questions = PROBE_QUESTIONS.get(topic.lower(), PROBE_QUESTIONS["default"])
    return random.choice(questions)


# ── Stance generation (LLM) ───────────────────────────────────────────────

async def generate_stance(agent: Agent, topic: str) -> str:
    """Generate a one-sentence stance for an agent based on their position and personality."""
    client = _get_client()

    if client:
        try:
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=60,
                system=(
                    "You are generating a person's internal belief as a single casual sentence. "
                    "Write in first person, as if they're thinking to themselves. Keep it under 15 words. "
                    "Match their position: negative = against, positive = for, near zero = unsure. "
                    "Return ONLY the sentence, no quotes, no JSON."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Topic: {topic}\n"
                        f"Person: {agent.name}, age {agent.age}, {agent.group_ids[0] if agent.group_ids else 'general'}\n"
                        f"Position: {agent.position:.2f} (-1=strongly against, 1=strongly for)\n"
                        f"Personality: openness={agent.openness:.1f}, analytical={agent.analytical:.1f}, "
                        f"conformity={agent.conformity:.1f}, identity_attachment={agent.identity_attachment:.1f}"
                    ),
                }],
            )
            return response.content[0].text.strip().strip('"')
        except Exception as e:
            logger.error(f"Stance generation error for {agent.name}: {e}")

    if agent.position > 0.3:
        return "I think this makes sense, we should support it."
    elif agent.position < -0.3:
        return "I don't buy it. This isn't going to work."
    else:
        return "I'm not sure yet. I'd need to hear more."


async def generate_all_stances(agents: dict[str, Agent], topic: str) -> dict[str, str]:
    """Generate stances in batches of 10 to avoid rate limits."""
    logger.info(f"Generating stances for {len(agents)} agents...")
    t0 = time.time()
    stances = {}
    items = list(agents.items())
    batch_size = 10
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        results = await asyncio.gather(*[generate_stance(agent, topic) for _, agent in batch])
        for (aid, _), stance in zip(batch, results):
            stances[aid] = stance
        if i + batch_size < len(items):
            await asyncio.sleep(1.5)
    logger.info(f"Stances generated in {time.time() - t0:.1f}s")
    return stances


# ── Phase 1: Direct persuasion (LLM) ──────────────────────────────────────

async def phase1_evaluate_argument(
    agent: Agent,
    prompt: str,
    source_trust: float,
) -> tuple[float, str]:
    """
    LLM evaluates how well the argument resonates with this specific person.
    Returns (argument_quality 0-1, reasoning).
    The LLM judges argument-person FIT, not shift magnitude — that comes from the formula.
    """
    client = _get_client()
    logger.info(f"Phase1 LLM: target={agent.name} pos={agent.position:.3f} open={agent.openness:.2f} conf={agent.confidence:.2f} id_attach={agent.identity_attachment:.2f} trust={source_trust:.2f}")

    if client:
        try:
            t0 = time.time()
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=150,
                system=(
                    "You are evaluating how well an argument resonates with a specific person. "
                    "Consider: does this argument address their values, concerns, and thinking style? "
                    "Would it make them THINK, even if they don't agree? "
                    "\n\nRate the ARGUMENT-PERSON FIT on 0.0-1.0:"
                    "\n  0.0-0.2: argument is irrelevant, offensive, or completely mismatched to their worldview"
                    "\n  0.2-0.4: argument has some merit but doesn't address their core concerns"
                    "\n  0.4-0.6: argument makes a point they'd consider, touches something they care about"
                    "\n  0.6-0.8: argument is compelling and speaks to their specific values/experience"
                    "\n  0.8-1.0: argument is perfectly tailored — addresses exactly what matters to this person"
                    "\n\nThis is about FIT, not persuasion. A great argument to the wrong person scores low. "
                    "A simple argument that speaks to someone's lived experience scores high."
                    "\n\nReturn ONLY valid JSON: "
                    '{"argument_quality": float 0.0-1.0, "reasoning": "one sentence"}'
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Person: {agent.name}, age {agent.age}\n"
                        f"Current position: {agent.position:.2f} (-1=strongly against, 1=strongly for)\n"
                        f"Openness: {agent.openness:.2f}, Analytical: {agent.analytical:.2f}\n"
                        f"Identity attachment: {agent.identity_attachment:.2f}, Confidence: {agent.confidence:.2f}\n"
                        f"Conformity: {agent.conformity:.2f}\n\n"
                        f"Argument they just heard:\n\"{prompt}\""
                    ),
                }],
            )
            elapsed = time.time() - t0
            raw_text = response.content[0].text
            result = _extract_json(raw_text)
            quality = max(0.0, min(1.0, float(result.get("argument_quality", 0.3))))
            reasoning = result.get("reasoning", "")
            logger.info(f"Phase1 LLM response ({elapsed:.1f}s): argument_quality={quality:.3f} reasoning=\"{reasoning}\"")
            return quality, reasoning
        except Exception as e:
            raw_text = ""
            try:
                raw_text = response.content[0].text[:200]
            except Exception:
                pass
            logger.error(f"Phase1 LLM error: {e} | raw response: {raw_text}")

    quality = random.uniform(0.3, 0.7)
    logger.info(f"Phase1 DEMO: argument_quality={quality:.3f}")
    return quality, "demo fallback"


async def _generate_phase1_response(
    agent: Agent, prompt: str, shift: float, topic: str,
) -> str:
    """Generate the target agent's verbal reaction to the player's argument."""
    client = _get_client()

    if shift >= 0.05:
        outcome_desc = "The listener is genuinely considering the argument — they push back on some points but concede others."
    elif shift >= 0.02:
        outcome_desc = "The listener is slightly intrigued but mostly skeptical — they raise counterpoints but show a crack of openness."
    else:
        outcome_desc = "The listener is largely unmoved — they acknowledge hearing it but deflect, push back, or dismiss it."

    if client:
        try:
            t0 = time.time()
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=200,
                system=(
                    f"You are {agent.name}, age {agent.age}, a {agent.group_ids[0]}. "
                    f"Someone just told you: \"{prompt}\"\n"
                    f"Your current position on {topic}: {agent.position:.2f} "
                    f"(-1=strongly against, +1=strongly for).\n"
                    f"Openness: {agent.openness:.2f}, Confidence: {agent.confidence:.2f}, "
                    f"Identity attachment: {agent.identity_attachment:.2f}.\n\n"
                    f"OUTCOME: {outcome_desc}\n\n"
                    "Respond in 1-3 sentences, in character, as yourself. "
                    "Return ONLY your spoken response, no JSON, no quotes."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            elapsed = time.time() - t0
            text = response.content[0].text.strip().strip('"')
            logger.info(f"Phase1 response ({elapsed:.1f}s): \"{text[:80]}\"")
            return text
        except Exception as e:
            logger.error(f"Phase1 response generation error: {e}")

    if shift >= 0.02:
        return f"Hm, that's an interesting point. I'm not sure I fully agree, but I hear you."
    else:
        return f"I don't know about that. I see it differently."


async def run_phase1(
    agent: Agent,
    prompt: str,
    trust: float,
    topic: str = "",
) -> tuple[float, str]:
    """
    Run Phase 1: LLM evaluates argument quality, then deterministic formula
    computes the actual shift. Also generates the target's verbal response.

    Returns (shift_delta, response_text).

    Formula (Friedkin-Johnsen inspired):
      shift = argument_quality × receptivity × confidence_resistance × trust × SCALE
    """
    argument_quality, reasoning = await phase1_evaluate_argument(agent, prompt, trust)

    # Friedkin-Johnsen susceptibility
    receptivity = (max(0.3, agent.openness) + (1 - agent.identity_attachment)) / 2
    # Sherif & Hovland: high confidence narrows latitude of acceptance
    confidence_resistance = 1 - agent.confidence * 0.4
    # Compute shift
    actual_shift = argument_quality * receptivity * confidence_resistance * trust * PHASE1_SCALE

    old_position = agent.position
    agent.position = max(-1.0, min(1.0, agent.position + actual_shift))
    final_delta = agent.position - old_position
    logger.info(
        f"Phase1 formula: quality={argument_quality:.3f} × recept={receptivity:.2f} "
        f"× conf_resist={confidence_resistance:.2f} × trust={trust:.2f} × scale={PHASE1_SCALE} "
        f"= {actual_shift:.4f} → delta={final_delta:.4f} pos={old_position:.4f}→{agent.position:.4f}"
    )

    # Generate the target's spoken reaction
    response_text = await _generate_phase1_response(agent, prompt, final_delta, topic)
    return final_delta, response_text


# ── Phase 2: LLM conversation propagation ────────────────────────────────

RESISTANCE_THRESHOLD = 0.003  # minimum shift to count as "not resisted"
EVANGELIST_THRESHOLD = 0.02   # minimum total shift to become a speaker — below this, you heard it but wouldn't bring it up
CONVERSATION_BATCH_SIZE = 8

# ── Empirical shift calibration ───────────────────────────────────────────
#
# Sources:
#   Asch (1951/1956)       — conformity rates by group size
#   Bond & Smith (1996)    — meta-analysis, mean d=0.92
#   Allen & Levine (1968)  — ally effect: one dissenter cuts conformity ~0.17×
#   Cacioppo & Petty (1979)— repeated exposure inverted-U, peaks at 3-5
#   Friedkin & Johnsen (1990) — opinion dynamics: susceptibility × trust × delta
#   Fishkin & Luskin (2005)— deliberative polling: 40-60% shift, magnitude 0.05-0.10
#   Sherif & Hovland (1961)— ego-involvement narrows latitude of acceptance by ~50%
#   Wood & Porter (2019)   — backfire is rare (~2-5%), only high identity-attachment
#
# Asch conformity rates (probability of yielding, NOT magnitude):
#   1 voice → ~3%, 2 → ~13%, 3 → ~33% (plateau), 4+ → ceiling ~35%
_ASCH_BASE_RATES = {1: 0.03, 2: 0.13, 3: 0.33}

# Phase 1 scale: argument_quality(0-1) × receptivity × trust × SCALE → shift
# Calibrated so perfect argument to fully receptive person ≈ 0.15 shift
PHASE1_SCALE = 0.20

# Phase 2 base: median shift magnitude when a listener yields
# Calibrated to Fishkin individual shifts (0.05-0.10 on 0-1 scale = 0.025-0.05 on our ±1 scale)
PHASE2_BASE_SHIFT = 0.10


def _asch_yield_probability(
    n_unanimous: int,
    has_ally: bool,
    conformity_trait: float,
    identity_attachment: float,
) -> float:
    """
    Probability that a listener yields due to social conformity pressure.
    Based on Asch (1956) experimental conformity rates, modulated by traits.
    """
    if n_unanimous <= 0:
        return 0.0

    if n_unanimous >= 4:
        base = min(0.33 + (n_unanimous - 3) * 0.005, 0.35)
    else:
        base = _ASCH_BASE_RATES[n_unanimous]

    if has_ally:
        base *= 0.17  # Allen & Levine (1968)

    # Modulate by personal traits
    return base * (0.3 + 0.7 * conformity_trait) * (1 - identity_attachment * 0.5)


def _exposure_factor(n_same_direction: int) -> float:
    """
    Cacioppo & Petty (1979): persuasion follows an inverted-U with repeated
    exposure. Agreement peaks at 3-5 exposures, then declines (tedium/reactance).
    """
    if n_same_direction <= 1:
        return 0.8   # first exposure: baseline
    elif n_same_direction == 2:
        return 1.0   # second: noticeable boost
    elif n_same_direction <= 4:
        return 1.15  # peak zone
    elif n_same_direction == 5:
        return 1.0   # starting to decline
    else:
        return max(0.6, 1.0 - 0.12 * (n_same_direction - 5))  # tedium


def _compute_conversation_outcome(
    listener: Agent,
    speaker: Agent,
    trust: float,
    n_same_direction: int,
    has_contrary: bool,
) -> tuple[float, str]:
    """
    Deterministic shift computation from empirical formulas.
    Returns (shift_magnitude_with_sign, outcome) where outcome is
    'yield', 'resist', or 'backfire'.

    Two independent pathways to yielding:
      1. Genuine persuasion (ELM central route): openness × trust × low-confidence
      2. Social conformity (Asch): group pressure × conformity trait
    """
    # ── Pathway 1: Genuine persuasion ──
    # Probability the argument resonates on its own merits
    p_genuine = (
        listener.openness
        * (1 - listener.identity_attachment)
        * (1 - listener.confidence * 0.3)
        * trust
        * 0.5  # scaling factor — most single conversations don't persuade
    )

    # ── Pathway 2: Social conformity (Asch) ──
    p_conformity = _asch_yield_probability(
        n_same_direction, has_contrary,
        listener.conformity, listener.identity_attachment,
    )

    # Combined: either pathway can trigger a shift (independent events)
    p_yield = 1 - (1 - p_genuine) * (1 - p_conformity)
    p_yield = min(0.80, p_yield)  # hard cap

    # ── Roll the dice ──
    if random.random() > p_yield:
        # Didn't yield — check for backfire
        # Wood & Porter (2019): backfire is rare (~2-5%), concentrated in
        # high identity-attachment individuals on identity-linked topics
        backfire_prob = 0.05 * max(0, (listener.identity_attachment - 0.5) * 2)
        if random.random() < backfire_prob:
            mag = random.uniform(0.01, 0.03) * (1 + listener.confidence * 0.5)
            direction = 1 if speaker.position > listener.position else -1
            return round(-mag * direction, 4), "backfire"
        return 0.0, "resist"

    # ── Compute yield magnitude (Friedkin-Johnsen style) ──
    susceptibility = (max(0.3, listener.openness) + (1 - listener.identity_attachment)) / 2
    confidence_factor = 1 - listener.confidence * 0.4
    exposure = _exposure_factor(n_same_direction)

    magnitude = PHASE2_BASE_SHIFT * susceptibility * confidence_factor * trust * exposure
    magnitude = max(0.005, min(0.06, magnitude))

    # Direction: toward speaker's position
    direction = 1 if speaker.position > listener.position else -1
    return round(magnitude * direction, 4), "yield"


async def generate_conversation(
    speaker: Agent,
    listener: Agent,
    topic: str,
    edge_trust: float,
    outcome: str,
    shift: float,
    listener_stance: str = "",
) -> dict:
    """
    Generate dialogue for a conversation whose outcome is already determined.
    The LLM produces realistic dialogue matching the predetermined shift.
    Returns { speaker_message, listener_response }.
    """
    client = _get_client()
    argument = getattr(speaker, '_internalized_argument', 'I changed my mind on this.')
    conviction = getattr(speaker, '_conviction', 'convinced')
    total_shift = abs(getattr(speaker, '_total_shift', 0.0))

    # Frame the speaker's delivery based on how convinced THEY are
    if conviction == "convinced" and total_shift >= 0.05:
        speaker_framing = (
            "The speaker genuinely believes this and argues from personal conviction. "
            "They rephrase it in their own words, through their own experience."
        )
    else:
        speaker_framing = (
            "The speaker is NOT convinced — they're conflicted. They might say "
            "'someone was telling me...' or 'I don't know if I agree, but...' "
            "They sound like someone processing a new idea, NOT spreading a message."
        )

    # Describe the predetermined outcome so the LLM matches the dialogue
    if outcome == "yield":
        outcome_desc = (
            "The listener is somewhat moved — they don't suddenly agree, but they "
            "concede a point, ask a genuine follow-up, or show they're actually thinking "
            "about it. Show GRADUAL, reluctant movement, not instant conversion."
        )
    elif outcome == "backfire":
        outcome_desc = (
            "The argument BACKFIRES. The listener gets defensive, dismissive, or hostile. "
            "The topic threatens their identity or livelihood. They dig in harder "
            "and may end the conversation or attack the speaker's credibility."
        )
    else:  # resist
        outcome_desc = (
            "The listener is UNMOVED. They politely disagree, deflect, change the subject, "
            "or give surface acknowledgment while internally unchanged. "
            "'I hear you, but...' or they just don't engage deeply."
        )

    if client:
        try:
            t0 = time.time()
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=400,
                system=(
                    f"Simulate a realistic conversation between two people about {topic}. "
                    "Real people resist, deflect, get defensive, or dismiss arguments "
                    "that threaten their identity. A blue-collar worker talks differently "
                    "than an educator."
                    "\n\nRULES:"
                    f"\n- SPEAKER STYLE: {speaker_framing} "
                    "The argument should MUTATE — each person emphasizes different parts, "
                    "gets details wrong, adds their own spin."
                    f"\n- OUTCOME (predetermined): {outcome_desc}"
                    "\n- The listener should voice their ACTUAL concerns, not just politely nod."
                    "\n\nReturn ONLY valid JSON:\n"
                    '{"speaker_message": "1-3 sentences in character", '
                    '"listener_response": "1-3 sentences in character, showing their real reaction"}'
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"SPEAKER: {speaker.name}, age {speaker.age}, {speaker.group_ids[0]}\n"
                        f"  Position: {speaker.position:.2f} (scale: -1=strongly against, +1=strongly for)\n"
                        f"  Openness: {speaker.openness:.2f}, Analytical: {speaker.analytical:.2f}\n"
                        f"  What they heard (rephrase in their own words, mutate it): \"{argument}\"\n\n"
                        f"LISTENER: {listener.name}, age {listener.age}, {listener.group_ids[0]}\n"
                        f"  Position: {listener.position:.2f}, Openness: {listener.openness:.2f}, "
                        f"Analytical: {listener.analytical:.2f}\n"
                        f"  Confidence: {listener.confidence:.2f}, "
                        f"Identity attachment: {listener.identity_attachment:.2f}\n"
                        + (f"  Their current opinion: \"{listener_stance}\"\n" if listener_stance else "")
                        + f"\nTrust between them: {edge_trust:.2f} (0=stranger, 1=close friend)"
                    ),
                }],
            )
            elapsed = time.time() - t0
            result = _extract_json(response.content[0].text)
            logger.info(
                f"  Dialogue ({elapsed:.1f}s): {speaker.name} → {listener.name} "
                f"[{outcome}] | \"{result.get('speaker_message', '')[:50]}\" → \"{result.get('listener_response', '')[:50]}\""
            )
            return {
                "speaker_message": result.get("speaker_message", ""),
                "listener_response": result.get("listener_response", ""),
            }
        except json.JSONDecodeError as e:
            raw_text = response.content[0].text if response and response.content else "(empty)"
            logger.error(
                f"  Conversation LLM error ({speaker.name} → {listener.name}): {e}\n"
                f"    Raw response: {raw_text[:200]}"
            )
        except Exception as e:
            logger.error(f"  Conversation LLM error ({speaker.name} → {listener.name}): {e}")

    # Fallback dialogue
    arg_words = argument.split()
    speaker_msg = " ".join(arg_words[:25]) + ("..." if len(arg_words) > 25 else "")
    if outcome == "backfire":
        listener_msg = f"No offense {speaker.name.split()[0]}, but that's not how it works."
    elif outcome == "resist":
        listener_msg = f"I hear you, {speaker.name.split()[0]}, but I'm not so sure about that."
    else:
        listener_msg = f"Hm, that's an interesting point, {speaker.name.split()[0]}. Let me think about that."
    return {
        "speaker_message": speaker_msg,
        "listener_response": listener_msg,
    }


def _pick_conversation_targets(
    agents: dict[str, Agent], graph, failed_pairs: set[tuple[str, str]]
) -> list[tuple[str, str]]:
    """
    Each shifted agent picks ONE unconvinced neighbor (highest trust).
    Skips pairs that already failed (resisted). Returns list of
    (speaker_id, listener_id) pairs, deduplicated so no listener appears twice.
    """
    # Identify agents who shifted enough to actually bring it up in conversation
    # Must pass EVANGELIST_THRESHOLD — even the direct target doesn't evangelize
    # if they barely moved. A -0.75 agent who shifted 0.01 wouldn't parrot the argument.
    shifted_ids = {
        aid for aid, a in agents.items()
        if getattr(a, '_internalized_argument', None) is not None
        and abs(getattr(a, '_total_shift', 0.0)) >= EVANGELIST_THRESHOLD
    }

    if not shifted_ids:
        return []

    # Each shifted agent picks their best unconvinced neighbor
    candidates = []  # (trust, speaker_id, listener_id)
    for speaker_id in shifted_ids:
        if not graph.has_node(speaker_id):
            continue
        neighbors = list(graph.neighbors(speaker_id))
        # Sort by trust descending
        neighbors.sort(key=lambda n: graph[speaker_id][n].get("weight", 0.5), reverse=True)

        for neighbor_id in neighbors:
            # Skip if neighbor already shifted (has internalized argument)
            if neighbor_id in shifted_ids:
                continue
            # Skip if this pair already failed
            if (speaker_id, neighbor_id) in failed_pairs:
                continue
            trust = graph[speaker_id][neighbor_id].get("weight", 0.5)
            candidates.append((trust, speaker_id, neighbor_id))
            break  # only one target per speaker

    # Deduplicate: if two speakers target same listener, keep highest trust
    listener_best: dict[str, tuple[float, str]] = {}
    for trust, speaker_id, listener_id in candidates:
        if listener_id not in listener_best or trust > listener_best[listener_id][0]:
            listener_best[listener_id] = (trust, speaker_id)

    return [(speaker_id, listener_id) for listener_id, (_, speaker_id) in listener_best.items()]


async def phase2_conversations(
    agents: dict[str, Agent],
    graph,
    topic: str,
    tick: int,
    failed_pairs: set[tuple[str, str]],
    attempt_counts: dict[tuple[str, str], int],
    stances: dict[str, str] | None = None,
) -> tuple[list, list, list]:
    """
    One tick of Phase 2: shifted agents have conversations with neighbors.
    Shift outcomes are computed FIRST from empirical formulas, then the LLM
    generates dialogue matching the predetermined outcome.
    Returns (shifts, propagations, conversations).
    """
    pairs = _pick_conversation_targets(agents, graph, failed_pairs)
    logger.info(f"  Phase2 conversations: {len(pairs)} pairs")

    if not pairs:
        return [], [], []

    shifts = []
    propagations = []
    conversations = []

    # ── Step 1: Compute all outcomes deterministically ──
    outcomes = []  # (speaker_id, listener_id, shift, outcome_label, trust)
    for speaker_id, listener_id in pairs:
        speaker = agents[speaker_id]
        listener = agents[listener_id]
        trust = graph[speaker_id][listener_id].get("weight", 0.5)

        # Count prior exposure from conversation_history
        # Direction: toward speaker's position (same direction as speaker's argument)
        direction = 1 if speaker.position > listener.position else -1
        prior_same = {
            e["neighbor_id"] for e in listener.conversation_history
            if e["direction"] == direction
        }
        n_same_direction = len(prior_same) + 1  # +1 for current conversation
        has_contrary = any(
            e["direction"] != direction
            for e in listener.conversation_history
        )

        shift, outcome = _compute_conversation_outcome(
            listener, speaker, trust, n_same_direction, has_contrary,
        )

        logger.info(
            f"  Outcome: {speaker.name} → {listener.name} [{outcome}] "
            f"shift={shift:+.4f} (n_same={n_same_direction} ally={has_contrary} "
            f"trust={trust:.2f} open={listener.openness:.2f} "
            f"id_attach={listener.identity_attachment:.2f} conf={listener.confidence:.2f})"
        )
        outcomes.append((speaker_id, listener_id, shift, outcome, trust))

    # ── Step 2: Generate dialogue in batches (LLM only produces text) ──
    for i in range(0, len(outcomes), CONVERSATION_BATCH_SIZE):
        batch = outcomes[i:i + CONVERSATION_BATCH_SIZE]

        async def run_one(speaker_id, listener_id, shift, outcome, trust):
            speaker = agents[speaker_id]
            listener = agents[listener_id]
            listener_stance = (stances or {}).get(listener_id, "")
            return await generate_conversation(
                speaker, listener, topic, trust, outcome, shift, listener_stance,
            )

        results = await asyncio.gather(*[
            run_one(sid, lid, sh, out, tr) for sid, lid, sh, out, tr in batch
        ])

        for (speaker_id, listener_id, shift, outcome, trust), dialogue in zip(batch, results):
            speaker = agents[speaker_id]
            listener = agents[listener_id]

            # Direction for conversation_history
            direction = 1 if speaker.position > listener.position else -1

            # Record exposure in listener's history (even if resisted —
            # they still heard the argument, building Asch pressure)
            listener.conversation_history.append({
                "tick": tick,
                "neighbor_id": speaker_id,
                "direction": direction,
            })

            # Record conversation for frontend
            conversations.append({
                "from_id": speaker_id,
                "to_id": listener_id,
                "speaker_message": dialogue["speaker_message"],
                "listener_response": dialogue["listener_response"],
                "shift": shift,
                "tick": tick,
            })

            # Record propagation (for edge highlighting)
            propagations.append({
                "from_id": speaker_id,
                "to_id": listener_id,
                "pressure": round(abs(shift), 4),
                "resisted": outcome != "yield",
            })

            # Track attempts per pair — give up after 2 tries
            pair_key = (speaker_id, listener_id)
            attempt_counts[pair_key] = attempt_counts.get(pair_key, 0) + 1

            if outcome == "resist":
                listener.confidence = min(1.0, listener.confidence + 0.03)
                failed_pairs.add(pair_key)
                logger.info(f"  {listener.name}: RESISTED {speaker.name}")

            elif outcome == "backfire":
                old_pos = listener.position
                listener.position = max(-1.0, min(1.0, listener.position + shift))
                actual = listener.position - old_pos
                listener.confidence = min(1.0, listener.confidence + 0.05)
                failed_pairs.add(pair_key)
                logger.info(f"  {listener.name}: BACKFIRED by {speaker.name} {old_pos:.4f}→{listener.position:.4f} (delta={actual:.4f})")
                shifts.append({
                    "agent_id": listener_id,
                    "delta": round(actual, 4),
                    "new_position": round(listener.position, 4),
                    "source": "pressure",
                })

            else:  # yield
                if attempt_counts[pair_key] >= 2:
                    failed_pairs.add(pair_key)
                    logger.info(f"  {listener.name}: max attempts with {speaker.name}, moving on")

                old_pos = listener.position
                listener.position = max(-1.0, min(1.0, listener.position + shift))
                actual = listener.position - old_pos
                listener._total_shift = getattr(listener, '_total_shift', 0.0) + actual

                # Internalize the argument — conviction based on total accumulated shift
                total = abs(listener._total_shift)
                listener._internalized_argument = dialogue["speaker_message"]
                listener._conviction = "convinced" if total >= 0.05 else "skeptical"

                logger.info(
                    f"  {listener.name}: SHIFTED by {speaker.name} {old_pos:.4f}→{listener.position:.4f} "
                    f"(delta={actual:.4f})"
                )
                shifts.append({
                    "agent_id": listener_id,
                    "delta": round(actual, 4),
                    "new_position": round(listener.position, 4),
                    "source": "pressure",
                })

        # Rate limit delay between batches
        if i + CONVERSATION_BATCH_SIZE < len(outcomes):
            await asyncio.sleep(1.5)

    return shifts, propagations, conversations


# ── Probe: genuine vs surface ─────────────────────────────────────────────

async def probe_agent(agent: Agent, topic: str, original_position: float) -> dict:
    """
    Ask a probe question to test if belief shift is genuine.
    Returns probe result dict.
    """
    question = _get_probe_question(topic)
    shift_mag = abs(agent.position - original_position)
    logger.info(f"Probe: {agent.name} pos={original_position:.3f}→{agent.position:.3f} (shift={shift_mag:.3f}) question=\"{question[:60]}...\"")
    client = _get_client()

    if client:
        try:
            response = await client.messages.create(
                model=PROBE_MODEL,
                max_tokens=200,
                system=(
                    "You are simulating a person answering a follow-up question. "
                    "This person recently changed their position on an issue. "
                    "If the change was GENUINE, they will give a coherent, thoughtful answer "
                    "that demonstrates deep understanding of their new position. "
                    "If the change was SURFACE-LEVEL (they just went along with social pressure), "
                    "they will give a vague, wishy-washy, or contradictory answer. "
                    "Return ONLY valid JSON: "
                    '{"answer": "their response in 1-2 sentences", "genuine": true/false}'
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Person: {agent.name}\n"
                        f"Original position: {original_position:.2f}\n"
                        f"Current position: {agent.position:.2f}\n"
                        f"Openness: {agent.openness:.2f}, Conformity: {agent.conformity:.2f}\n"
                        f"Identity attachment: {agent.identity_attachment:.2f}\n\n"
                        f"Follow-up question: \"{question}\""
                    ),
                }],
            )
            result = _extract_json(response.content[0].text)
            genuine = bool(result.get("genuine", False))
            logger.info(f"Probe result (LLM): {agent.name} genuine={genuine} answer=\"{result.get('answer', '')[:80]}\"")
            return {
                "agent_id": agent.id,
                "shifted": True,
                "genuine": genuine,
                "probe_question": question,
                "probe_answer": result.get("answer", ""),
            }
        except Exception as e:
            logger.error(f"Probe LLM error for {agent.name}: {e}")

    genuine = agent.openness > agent.conformity or random.random() > 0.5
    logger.info(f"Probe result (DEMO): {agent.name} genuine={genuine}")
    if genuine:
        answer = f"I've thought about this carefully. My view shifted because the argument addressed concerns I hadn't considered before."
    else:
        answer = f"I mean... I guess? Everyone seems to think so. I'm not really sure about the specifics though."

    return {
        "agent_id": agent.id,
        "shifted": True,
        "genuine": genuine,
        "probe_question": question,
        "probe_answer": answer,
    }


# ── Main simulation runner ────────────────────────────────────────────────

async def run_simulation(
    prompt: str,
    target_agent_ids: list[str] | None = None,
    society_type: str = "polarized",
    n_agents: int = 25,
    n_ticks: int = 8,
    shift_threshold: float = 0.02,
    agents: dict[str, Agent] | None = None,
    graph=None,
    stances: dict[str, str] | None = None,
) -> dict:
    """
    Run the full simulation and return a SimTimeline.
    If agents/graph/stances are provided (from /populate cache), reuse them.
    """
    if target_agent_ids is None:
        target_agent_ids = []

    sim_start = time.time()
    logger.info("=" * 70)
    logger.info(f"SIMULATION START: n={n_agents} type={society_type} ticks={n_ticks}")
    logger.info(f"Prompt: \"{prompt[:100]}\"")
    logger.info(f"LLM mode: {'API' if _get_client() else 'DEMO'}")

    # 1. Use cached or generate fresh population and graph
    if agents is not None and graph is not None:
        logger.info("Using cached population and graph")
    else:
        agents = generate_population(n_agents, prompt, society_type)
        graph = create_society_graph(agents)
    logger.info("=" * 70)

    for a in agents.values():
        logger.debug(f"  Agent {a.name}: pos={a.position:.3f} open={a.openness:.2f} conf={a.confidence:.2f} conform={a.conformity:.2f} id_attach={a.identity_attachment:.2f} groups={a.group_ids}")
    logger.info(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")

    # Find target agents
    targets = [agents[tid] for tid in target_agent_ids if tid in agents]
    if not targets:
        # Fallback: pick first agent
        targets = [list(agents.values())[0]]
    for t in targets:
        logger.info(f"Target: {t.name} (id={t.id}) pos={t.position:.3f} groups={t.group_ids}")

    # Serialize edges
    edges = []
    for u, v, data in graph.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "weight": round(data.get("weight", 0.5), 3),
        })

    # Store original positions for probe comparison
    original_positions = {a.id: a.position for a in agents.values()}

    # Use cached stances or generate fresh
    if stances is None:
        stances = await generate_all_stances(agents, prompt)

    # Initialize conversation state for all agents
    for a in agents.values():
        a._total_shift = 0.0
        a._internalized_argument = None  # None = hasn't been convinced yet
        a.conversation_history = []      # Reset Asch history each simulation run

    all_conversations = []
    ticks = []

    # Tick 0: initial state
    ticks.append({
        "tick": 0,
        "agents": [_serialize_agent(a, stances) for a in agents.values()],
        "shifts": [],
        "propagations": [],
        "conversations": [],
    })

    # 2. Phase 1: Direct persuasion on ALL targets (concurrent)
    async def _phase1_one(target):
        neighbor_weights = [
            graph[target.id][n].get("weight", 0.5)
            for n in graph.neighbors(target.id)
            if graph.has_edge(target.id, n)
        ] if graph.has_node(target.id) else [0.5]
        source_trust = sum(neighbor_weights) / len(neighbor_weights) if neighbor_weights else 0.5
        source_trust = min(0.7, source_trust)
        delta, response = await run_phase1(target, prompt, source_trust, topic=prompt)
        return target, delta, response

    phase1_results = await asyncio.gather(*[_phase1_one(t) for t in targets])

    tick1_shifts = []
    tick1_conversations = []
    for target, direct_delta, target_response in phase1_results:
        target._total_shift = direct_delta
        if abs(direct_delta) >= EVANGELIST_THRESHOLD:
            target._internalized_argument = prompt
            target._conviction = "convinced" if abs(direct_delta) >= 0.05 else "skeptical"
        else:
            logger.info(f"  Target {target.name} shift too small ({direct_delta:.4f}) to evangelize")

        if abs(direct_delta) > 0.001:
            tick1_shifts.append({
                "agent_id": target.id,
                "delta": round(direct_delta, 4),
                "new_position": round(target.position, 4),
                "source": "direct",
            })

        conversation = {
            "from_id": "player",
            "to_id": target.id,
            "speaker_message": prompt,
            "listener_response": target_response,
            "shift": round(direct_delta, 4),
            "tick": 1,
        }
        tick1_conversations.append(conversation)
        all_conversations.append(conversation)

    ticks.append({
        "tick": 1,
        "agents": [_serialize_agent(a, stances) for a in agents.values()],
        "shifts": tick1_shifts,
        "propagations": [],
        "conversations": tick1_conversations,
    })

    # 3. Phase 2: Conversation ticks
    consecutive_idle = 0
    failed_pairs: set[tuple[str, str]] = set()
    attempt_counts: dict[tuple[str, str], int] = {}
    for t in range(2, n_ticks + 1):
        logger.info(f"--- Tick {t} ---")
        shifts, propagations, conversations = await phase2_conversations(agents, graph, prompt, t, failed_pairs, attempt_counts, stances)

        all_conversations.extend(conversations)

        ticks.append({
            "tick": t,
            "agents": [_serialize_agent(a, stances) for a in agents.values()],
            "shifts": shifts,
            "propagations": propagations,
            "conversations": conversations,
        })

        logger.info(f"  Tick {t} result: {len(shifts)} shifts, {len(conversations)} conversations")

        if not shifts:
            consecutive_idle += 1
        else:
            consecutive_idle = 0

        if consecutive_idle >= 2 and t > 3:
            logger.info(f"  EARLY STOP at tick {t}: no shifts for {consecutive_idle} consecutive ticks")
            break

    # 4. Probes
    shifted_agents = [
        a for a in agents.values()
        if abs(a.position - original_positions[a.id]) > shift_threshold
    ]
    logger.info(f"PROBE PHASE: {len(shifted_agents)}/{len(agents)} agents shifted past threshold={shift_threshold}")

    # Batch probes to avoid rate limits
    probe_results = []
    probe_batch_size = 8
    for i in range(0, len(shifted_agents), probe_batch_size):
        batch = shifted_agents[i:i + probe_batch_size]
        results = await asyncio.gather(*[probe_agent(a, prompt, original_positions[a.id]) for a in batch])
        probe_results.extend(results)
        if i + probe_batch_size < len(shifted_agents):
            await asyncio.sleep(1.5)

    shifted_ids = {a.id for a in shifted_agents}
    for a in agents.values():
        if a.id not in shifted_ids:
            probe_results.append({
                "agent_id": a.id,
                "shifted": False,
                "genuine": False,
                "probe_question": "",
                "probe_answer": "",
            })

    # 5. Summary
    genuine_count = sum(1 for p in probe_results if p["shifted"] and p["genuine"])
    surface_count = sum(1 for p in probe_results if p["shifted"] and not p["genuine"])

    all_ever_shifted_ids = set()
    for tick in ticks:
        for sh in tick["shifts"]:
            all_ever_shifted_ids.add(sh["agent_id"])
    clusters_reached = len(set(
        getattr(agents[aid], '_cluster_id', 0)
        for aid in all_ever_shifted_ids
        if aid in agents
    )) if all_ever_shifted_ids else 0
    clusters_reached = max(1, clusters_reached)

    elapsed = time.time() - sim_start
    logger.info("=" * 70)
    logger.info(f"SIMULATION COMPLETE in {elapsed:.1f}s")
    logger.info(f"  Shifted: {len(shifted_agents)}/{len(agents)} | Genuine: {genuine_count} | Surface: {surface_count} | Clusters: {clusters_reached}")
    logger.info(f"  Final positions: {', '.join(f'{a.name}={a.position:.3f}' for a in agents.values())}")
    logger.info("=" * 70)

    return {
        "target_agent_ids": [t.id for t in targets],
        "edges": edges,
        "ticks": ticks,
        "conversations": all_conversations,
        "probe_results": list(probe_results),
        "summary": {
            "total_shifted": len(shifted_agents),
            "genuine_count": genuine_count,
            "surface_count": surface_count,
            "clusters_reached": clusters_reached,
        },
    }


def _serialize_agent(agent: Agent, stances: dict[str, str] | None = None) -> dict:
    """Serialize agent to match frontend AgentData type."""
    d = {
        "id": agent.id,
        "name": agent.name,
        "age": agent.age,
        "position": round(agent.position, 4),
        "confidence": round(agent.confidence, 3),
        "openness": round(agent.openness, 3),
        "analytical": round(agent.analytical, 3),
        "conformity": round(agent.conformity, 3),
        "identity_attachment": round(agent.identity_attachment, 3),
        "x": round(agent.x, 4),
        "y": round(agent.y, 4),
        "groups": agent.group_ids,
    }
    if stances and agent.id in stances:
        d["stance"] = stances[agent.id]
    return d
