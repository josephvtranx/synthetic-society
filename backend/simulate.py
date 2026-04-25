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

async def phase1_direct_persuasion(
    agent: Agent,
    prompt: str,
    source_trust: float,
) -> float:
    """
    LLM evaluates how the targeted agent responds to the player's argument.
    Returns the raw belief shift before clamping.
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
                    "You are simulating a real person's internal reaction to an argument. "
                    "Given their personality and current belief, estimate how much their "
                    "position would shift. Use the FULL range: 0.3-0.5 for a compelling argument "
                    "to a receptive person, 0.1-0.3 for moderate impact, 0.01-0.1 for minimal impact. "
                    "Negative values mean the argument backfired. Consider: would this specific "
                    "argument resonate with THIS person's values and thinking style? "
                    "Return ONLY valid JSON: "
                    '{"raw_shift": float between -0.5 and 0.5, "reasoning": "one sentence"}'
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
            raw = float(result.get("raw_shift", 0.0))
            reasoning = result.get("reasoning", "")
            logger.info(f"Phase1 LLM response ({elapsed:.1f}s): raw_shift={raw:.4f} reasoning=\"{reasoning}\"")
            return max(-0.5, min(0.5, raw))
        except Exception as e:
            raw_text = ""
            try:
                raw_text = response.content[0].text[:200]
            except Exception:
                pass
            logger.error(f"Phase1 LLM error: {e} | raw response: {raw_text}")

    direction = 1 if random.random() > 0.5 else -1
    raw = random.uniform(0.35, 0.5) * direction
    logger.info(f"Phase1 DEMO: raw_shift={raw:.4f}")
    return raw


async def run_phase1(
    agent: Agent,
    prompt: str,
    trust: float,
) -> float:
    """Run Phase 1 and apply the belief update formula with clamping."""
    raw_shift = await phase1_direct_persuasion(agent, prompt, trust)

    # Receptivity: average of openness and flexibility (1 - identity_attachment)
    # This prevents double-damping when both are low
    receptivity = (max(0.3, agent.openness) + (1 - agent.identity_attachment)) / 2
    actual_shift = raw_shift * receptivity

    old_position = agent.position
    agent.position = max(-1.0, min(1.0, agent.position + actual_shift))
    final_delta = agent.position - old_position
    logger.info(
        f"Phase1 clamp: raw={raw_shift:.4f} × receptivity={receptivity:.2f} "
        f"(open={agent.openness:.2f}, id_attach={agent.identity_attachment:.2f}) "
        f"= actual={actual_shift:.4f} → delta={final_delta:.4f} pos={old_position:.4f}→{agent.position:.4f}"
    )
    return final_delta


# ── Phase 2: LLM conversation propagation ────────────────────────────────

RESISTANCE_THRESHOLD = 0.003  # minimum shift to count as "not resisted"
EVANGELIST_THRESHOLD = 0.02   # minimum total shift to become a speaker — below this, you heard it but wouldn't bring it up
CONVERSATION_BATCH_SIZE = 8

# ── Asch conformity calibration ───────────────────────────────────────────
# Empirical rates from Asch (1951/1956) line-judgment experiments.
# Bond & Smith (1996) meta-analysis; Allen & Levine (1968/1971) ally studies.
#
#   Unanimous voices → base conformity rate (% of trials subjects yielded)
#   1 voice  →  ~3%   (barely above noise; one dissenter is easily dismissed)
#   2 voices → ~13%   (social pressure begins to register)
#   3 voices → ~32%   (plateau onset; three is enough for full group effect)
#   4+ voices → slight increase, hard ceiling ~37% (Asch 1956, varied group sizes)
#
#   Ally effect (Allen & Levine 1968): even ONE voice disagreeing with the
#   majority drops conformity from ~32% to ~5.5% — a 0.17× suppression factor.
#   The ally doesn't need to agree with the subject, just break unanimity.
_ASCH_BASE_RATES = {1: 0.03, 2: 0.13, 3: 0.32}


def _asch_conformity_pressure(
    n_unanimous: int,
    has_ally: bool,
    conformity_trait: float,
    identity_attachment: float,
) -> float:
    """
    Pressure multiplier calibrated to Asch (1956) experimental conformity rates.

    n_unanimous: number of DISTINCT neighbors who have pushed in the same
                 direction (including the current conversation).
    has_ally:    True if ANY prior neighbor pushed in the OPPOSITE direction,
                 breaking the unanimity (Allen & Levine 1968 ally effect).
    """
    if n_unanimous == 0:
        return 0.0

    if n_unanimous >= 4:
        # Marginal increase past 3, hard ceiling at 0.37
        base = min(0.32 + (n_unanimous - 3) * 0.013, 0.37)
    else:
        base = _ASCH_BASE_RATES[n_unanimous]

    if has_ally:
        # 5.5 / 32 ≈ 0.17 — even one dissenting voice cuts conformity drastically
        base *= 0.17

    return base * conformity_trait * (1 - identity_attachment)


async def generate_conversation(
    speaker: Agent,
    listener: Agent,
    topic: str,
    edge_trust: float,
    listener_stance: str = "",
) -> dict:
    """
    Generate a conversation where the speaker tries to persuade the listener.
    Returns { speaker_message, listener_response, raw_shift, reasoning }.
    """
    client = _get_client()
    argument = getattr(speaker, '_internalized_argument', 'I changed my mind on this.')
    conviction = getattr(speaker, '_conviction', 'convinced')

    # Frame the speaker's delivery based on how convinced THEY are
    if conviction == "convinced":
        speaker_framing = (
            "The speaker genuinely believes this now and argues from personal conviction. "
            "They rephrase it in their own words, through their own experience."
        )
    else:
        speaker_framing = (
            "The speaker is NOT fully convinced — they're more like 'thinking out loud' or "
            "'playing devil's advocate.' They might say 'someone told me...' or 'I'm not sure but...' "
            "or raise it as a question rather than a statement. They still have doubts."
        )

    if client:
        try:
            t0 = time.time()
            response = await client.messages.create(
                model=FAST_MODEL,
                max_tokens=400,
                system=(
                    f"Simulate a realistic conversation between two people about {topic}. "
                    "This is NOT a persuasion success story. Real people resist, deflect, "
                    "get defensive, change the subject, or dismiss arguments that threaten their identity. "
                    "\n\nRULES:"
                    f"\n- SPEAKER CONVICTION: {speaker_framing} "
                    "A blue-collar worker talks differently than an educator. "
                    "The argument should MUTATE — each person emphasizes different parts, "
                    "gets details wrong, adds their own spin, or shifts the framing entirely."
                    "\n- The listener has their OWN existing opinion and defends it. "
                    "High identity_attachment = dismissive or hostile. "
                    "Low openness = doesn't engage with the argument. "
                    "High confidence = already sure of their position. "
                    "The listener should voice their ACTUAL concerns, not just politely nod."
                    "\n- Most conversations should NOT result in agreement. "
                    "People dig in, argue back, or give surface politeness while internally unmoved."
                    "\n\nSHIFT GUIDELINES (positive = toward speaker's view):"
                    "\n  0.0-0.02: Listener politely disagrees or deflects. Common for high-confidence or high-identity listeners."
                    "\n  0.03-0.08: Listener concedes a point or is genuinely thinking. Expected when openness > 0.5 and identity_attachment < 0.5."
                    "\n  0.08-0.15: Real engagement — listener is reconsidering. Requires high openness AND low identity_attachment AND a compelling argument."
                    "\n  0.15-0.25: Major shift — only for very open, low-confidence listeners hearing a strong peer argument. Rare."
                    "\n  Negative (-0.02 to -0.15): Backfire — listener digs in. Expected when identity_attachment > 0.6 or argument threatens their livelihood/identity."
                    "\n  Consider the listener's traits carefully: a small business owner hearing 'raise wages' has PERSONAL stakes."
                    "\n\nReturn ONLY valid JSON:\n"
                    '{"speaker_message": "1-3 sentences in character", '
                    '"listener_response": "1-3 sentences in character, showing their real reaction", '
                    '"raw_shift": float between -0.3 and 0.3, '
                    '"reasoning": "one sentence explaining why the listener did or did not move"}'
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
                        f"Identity attachment: {listener.identity_attachment:.2f}, "
                        f"Conformity: {listener.conformity:.2f}\n"
                        + (f"  Their current opinion: \"{listener_stance}\"\n" if listener_stance else "")
                        + f"\nTrust between them: {edge_trust:.2f} (0=stranger, 1=close friend)"
                    ),
                }],
            )
            elapsed = time.time() - t0
            result = _extract_json(response.content[0].text)
            raw_shift = max(-0.3, min(0.3, float(result.get("raw_shift", 0.0))))
            logger.info(
                f"  Conversation ({elapsed:.1f}s): {speaker.name} → {listener.name} "
                f"raw_shift={raw_shift:.3f} | \"{result.get('speaker_message', '')[:50]}\" → \"{result.get('listener_response', '')[:50]}\""
            )
            return {
                "speaker_message": result.get("speaker_message", ""),
                "listener_response": result.get("listener_response", ""),
                "raw_shift": raw_shift,
                "reasoning": result.get("reasoning", ""),
            }
        except json.JSONDecodeError as e:
            raw_text = response.content[0].text if response and response.content else "(empty)"
            logger.error(
                f"  Conversation LLM error ({speaker.name} → {listener.name}): {e}\n"
                f"    Raw response: {raw_text[:200]}"
            )
        except Exception as e:
            logger.error(f"  Conversation LLM error ({speaker.name} → {listener.name}): {e}")

    # Fallback: use the speaker's internalized argument as the message
    direction = 1 if speaker.position > listener.position else -1
    raw_shift = random.uniform(0.05, 0.12) * direction
    # Truncate the argument to feel like natural speech
    arg_words = argument.split()
    if len(arg_words) > 25:
        speaker_msg = " ".join(arg_words[:25]) + "..."
    else:
        speaker_msg = argument
    return {
        "speaker_message": speaker_msg,
        "listener_response": f"I see what you mean, {speaker.name.split()[0]}. Let me think about that.",
        "raw_shift": raw_shift,
        "reasoning": "fallback — LLM response could not be parsed",
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
    # Direct target always qualifies (they were personally addressed by the player)
    shifted_ids = {
        aid for aid, a in agents.items()
        if getattr(a, '_internalized_argument', None) is not None
        and (
            abs(getattr(a, '_total_shift', 0.0)) >= EVANGELIST_THRESHOLD
            or getattr(a, '_is_direct_target', False)
        )
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
    Returns (shifts, propagations, conversations).
    """
    pairs = _pick_conversation_targets(agents, graph, failed_pairs)
    logger.info(f"  Phase2 conversations: {len(pairs)} pairs")

    if not pairs:
        return [], [], []

    shifts = []
    propagations = []
    conversations = []

    # Batch LLM calls
    for i in range(0, len(pairs), CONVERSATION_BATCH_SIZE):
        batch = pairs[i:i + CONVERSATION_BATCH_SIZE]

        async def run_one(speaker_id: str, listener_id: str):
            speaker = agents[speaker_id]
            listener = agents[listener_id]
            trust = graph[speaker_id][listener_id].get("weight", 0.5)
            listener_stance = (stances or {}).get(listener_id, "")
            return await generate_conversation(speaker, listener, topic, trust, listener_stance)

        results = await asyncio.gather(*[run_one(sid, lid) for sid, lid in batch])

        for (speaker_id, listener_id), result in zip(batch, results):
            speaker = agents[speaker_id]
            listener = agents[listener_id]
            trust = graph[speaker_id][listener_id].get("weight", 0.5)

            # Asch-calibrated conformity pressure replaces simple receptivity.
            # Count unique neighbors who have spoken in the same direction across
            # all prior ticks (conversation_history), plus the current speaker.
            # If any neighbor has ever pushed the OTHER direction, the unanimity
            # is broken and conformity drops sharply (Allen & Levine ally effect).
            raw_shift = result["raw_shift"]
            current_direction = 1 if raw_shift > 0 else -1

            prior_same = {
                e["neighbor_id"] for e in listener.conversation_history
                if e["direction"] == current_direction
            }
            n_unanimous = len(prior_same) + 1  # +1 for current conversation

            has_ally = any(
                e["direction"] != current_direction
                for e in listener.conversation_history
            )

            conformity_pressure = _asch_conformity_pressure(
                n_unanimous, has_ally, listener.conformity, listener.identity_attachment
            )
            actual_shift = raw_shift * conformity_pressure
            logger.info(
                f"  Asch pressure: {listener.name} n_unanimous={n_unanimous} "
                f"has_ally={has_ally} pressure={conformity_pressure:.4f} "
                f"raw={raw_shift:.4f} actual={actual_shift:.4f}"
            )

            # Record this conversation in listener's history so future
            # interactions compound (the "gaslighting" accumulation effect)
            listener.conversation_history.append({
                "tick": tick,
                "neighbor_id": speaker_id,
                "direction": current_direction,
            })

            # Record conversation
            conversations.append({
                "from_id": speaker_id,
                "to_id": listener_id,
                "speaker_message": result["speaker_message"],
                "listener_response": result["listener_response"],
                "shift": round(actual_shift, 4),
                "tick": tick,
            })

            # Record propagation (for edge highlighting)
            resisted = abs(actual_shift) < RESISTANCE_THRESHOLD
            backfired = actual_shift < -RESISTANCE_THRESHOLD  # pushed further away
            propagations.append({
                "from_id": speaker_id,
                "to_id": listener_id,
                "pressure": round(abs(raw_shift * trust), 4),
                "resisted": resisted or backfired,
            })

            # Track attempts per pair — give up after 2 tries
            pair_key = (speaker_id, listener_id)
            attempt_counts[pair_key] = attempt_counts.get(pair_key, 0) + 1

            if resisted:
                listener.confidence = min(1.0, listener.confidence + 0.03)
                failed_pairs.add(pair_key)
                logger.info(f"  {listener.name}: RESISTED {speaker.name} (shift={actual_shift:.4f})")
            elif backfired:
                # Apply the backfire shift — listener digs in
                old_pos = listener.position
                listener.position = max(-1.0, min(1.0, listener.position + actual_shift))
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
            elif attempt_counts[pair_key] >= 2:
                # Talked twice, small positive shifts but not enough to spread — move on
                failed_pairs.add(pair_key)
                logger.info(f"  {listener.name}: max attempts with {speaker.name}, moving on")
            if not resisted and not backfired:
                old_pos = listener.position
                listener.position = max(-1.0, min(1.0, listener.position + actual_shift))
                actual = listener.position - old_pos
                listener._total_shift = getattr(listener, '_total_shift', 0.0) + actual
                # The listener internalizes the idea — but shaped by how convinced they are
                total = abs(listener._total_shift)
                if total >= EVANGELIST_THRESHOLD:
                    # Genuinely moved — they adopt the argument in their own words
                    listener._internalized_argument = result["speaker_message"]
                    listener._conviction = "convinced"
                else:
                    # Slightly nudged — they heard it but aren't sold
                    listener._internalized_argument = result["speaker_message"]
                    listener._conviction = "skeptical"
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
        if i + CONVERSATION_BATCH_SIZE < len(pairs):
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
    target_agent_id: str,
    society_type: str = "polarized",
    n_agents: int = 25,
    n_ticks: int = 8,
    shift_threshold: float = 0.02,
    target_index: int = 0,
    agents: dict[str, Agent] | None = None,
    graph=None,
    stances: dict[str, str] | None = None,
) -> dict:
    """
    Run the full simulation and return a SimTimeline.
    If agents/graph/stances are provided (from /populate cache), reuse them.
    """
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

    # Find target agent
    agent_list = list(agents.values())
    if target_agent_id in agents:
        target = agents[target_agent_id]
    else:
        idx = max(0, min(target_index, len(agent_list) - 1))
        target = agent_list[idx]
    logger.info(f"Target: {target.name} (id={target.id}) pos={target.position:.3f} groups={target.group_ids}")

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

    # 2. Phase 1: Direct persuasion on target agent
    neighbor_weights = [
        graph[target.id][n].get("weight", 0.5)
        for n in graph.neighbors(target.id)
        if graph.has_edge(target.id, n)
    ] if graph.has_node(target.id) else [0.5]
    source_trust = sum(neighbor_weights) / len(neighbor_weights) if neighbor_weights else 0.5
    source_trust = min(0.7, source_trust)

    direct_delta = await run_phase1(target, prompt, source_trust)
    target._total_shift = direct_delta
    # Target always internalizes the player's argument — they were directly addressed
    target._internalized_argument = prompt
    target._conviction = "convinced" if abs(direct_delta) >= EVANGELIST_THRESHOLD else "skeptical"
    # Force target to be a speaker regardless of shift size — they'll frame it
    # through their conviction level (skeptical target = "someone told me...")
    target._is_direct_target = True

    tick1_shifts = []
    if abs(direct_delta) > 0.001:
        tick1_shifts.append({
            "agent_id": target.id,
            "delta": round(direct_delta, 4),
            "new_position": round(target.position, 4),
            "source": "direct",
        })

    ticks.append({
        "tick": 1,
        "agents": [_serialize_agent(a, stances) for a in agents.values()],
        "shifts": tick1_shifts,
        "propagations": [],
        "conversations": [],
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
        "target_agent_id": target.id,
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
