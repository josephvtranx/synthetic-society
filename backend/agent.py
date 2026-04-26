"""
Agent dataclass and population generation for Society Simulator.
"""

from dataclasses import dataclass, field
import uuid
import random
import math
import numpy as np


# ── Name pool (200+ names, diverse cultural backgrounds) ──────────────────────
NAMES = [
    # East Asian
    "Wei Chen", "Yuki Tanaka", "Min-jun Park", "Mei Lin", "Hiroshi Sato",
    "Jia Li", "Soo-yeon Kim", "Takeshi Yamamoto", "Xin Wang", "Hana Nakamura",
    "Jun Zhang", "Aiko Suzuki", "Bao Nguyen", "Li Wei", "Yuna Choi",
    "Kenji Watanabe", "Zhi Ruo", "Sakura Ito", "Dae-jung Lee", "Fang Huang",
    # South Asian
    "Priya Sharma", "Arjun Patel", "Deepa Krishnan", "Ravi Gupta", "Ananya Singh",
    "Vikram Reddy", "Kavya Nair", "Sanjay Mehta", "Fatima Begum", "Amir Hassan",
    "Neha Joshi", "Rohan Desai", "Sunita Rao", "Karthik Iyer", "Meera Pillai",
    "Aditya Bhat", "Pooja Verma", "Rahul Chopra", "Ishaan Malhotra", "Divya Menon",
    # Middle Eastern
    "Omar Al-Rashid", "Layla Khoury", "Youssef Mansour", "Nadia Farah", "Karim Haddad",
    "Samira Nazari", "Hassan Jaber", "Dina Sabbagh", "Tariq Osman", "Rania Bakri",
    "Amal Kassem", "Ibrahim Saleh", "Yasmin Darwish", "Faisal Nouri", "Leila Mostafa",
    # African
    "Amina Diallo", "Kwame Asante", "Ngozi Okafor", "Jabari Mwangi", "Zainab Traore",
    "Tendai Moyo", "Esi Mensah", "Chidi Nwosu", "Fatou Sow", "Kofi Adjei",
    "Adaeze Eze", "Moussa Diop", "Wanjiku Kamau", "Sekou Barry", "Aisha Bello",
    "Thabo Ndlovu", "Chiamaka Obi", "Oumar Cisse", "Nalini Devi", "Emeka Agu",
    # European
    "Elena Petrova", "Marco Rossi", "Sophie Dubois", "Lars Andersen", "Katarina Novak",
    "Piotr Kowalski", "Ingrid Bergstrom", "Dimitri Volkov", "Clara Schmidt", "Matteo Bianchi",
    "Astrid Johansson", "Nikolai Ivanov", "Freya Lindqvist", "Andrei Popescu", "Lucia Fernandez",
    "Henrik Dahl", "Marta Kowalczyk", "Sergei Petrov", "Elise Moreau", "Tomas Horvath",
    # Latin American
    "Camila Rodriguez", "Diego Morales", "Valentina Herrera", "Mateo Gutierrez", "Isabella Reyes",
    "Santiago Vargas", "Lucia Mendoza", "Andres Castillo", "Sofia Paredes", "Carlos Fuentes",
    "Gabriela Rios", "Fernando Delgado", "Ana Luisa Vega", "Miguel Torres", "Daniela Soto",
    "Alejandro Cruz", "Mariana Flores", "Pablo Sandoval", "Renata Aguilar", "Jorge Espinoza",
    # North American (diverse)
    "Maya Johnson", "Ethan Williams", "Aaliyah Washington", "Liam O'Brien", "Chloe Tremblay",
    "Jayden Carter", "Emma Kowalski", "Noah Jackson", "Olivia Chen-Martinez", "Aiden Begay",
    "Zoe Levine", "Marcus Freeman", "Riley Nakamura-Smith", "Destiny Robinson", "Tyler Pham",
    "Hannah Johansson", "Elijah Brown", "Savannah White", "Caleb Hernandez", "Lily Duchamp",
    # Indigenous / Pacific
    "Aroha Tane", "Kai Mahina", "Tala Reyes", "Manaia Wiremu", "Sione Latu",
    "Mere Kopu", "Anaru Heke", "Moana Tupou", "Tui Matagi", "Leilani Kealoha",
    # Central Asian / Caucasus
    "Nurlan Tokayev", "Gulnara Akhmedova", "Bakyt Asanov", "Madina Usmanova", "Ruslan Aliev",
    "Aizada Nurbekova", "Timur Karimov", "Dinara Sultanova", "Arsen Grigoryan", "Nargiza Rakhimova",
    # Southeast Asian
    "Thanh Pham", "Siti Rahmah", "Rizal Santos", "Channary Sok", "Aung Kyaw",
    "Linh Tran", "Dewi Putri", "Ramon Cruz", "Sopheap Chea", "Nyi Nyi Aung",
]

# ── Demographic group pools ──────────────────────────────────────────────────
AGE_GROUPS = ["young", "middle_aged", "older"]
LOCALE_GROUPS = ["urban", "suburban", "rural"]
EDUCATION_GROUPS = ["college_educated", "trade_educated", "self_educated"]


@dataclass
class Agent:
    """A single agent in the society simulation."""
    # Stable (never changes after init)
    id: str
    name: str
    age: int
    openness: float           # 0-1
    analytical: float         # 0-1
    conformity: float         # 0-1
    group_ids: list[str] = field(default_factory=list)

    # Dynamic (changes each tick)
    position: float = 0.0             # -1.0 to 1.0
    confidence: float = 0.5           # 0-1
    identity_attachment: float = 0.3  # 0-1

    # Spatial
    x: float = 0.5
    y: float = 0.5

    # Conversation history — grows across ticks, drives Asch conformity pressure
    # Each entry: {"tick": int, "neighbor_id": str, "direction": int (+1 or -1)}
    conversation_history: list = field(default_factory=list)


# ── Cluster-specific trait distributions ─────────────────────────────────────
# Each cluster has distinct personality priors and belief leanings.
# Format: (alpha, beta) for np.random.beta()

CLUSTER_TRAITS = {
    # blue_collar: moderate openness, high conformity, high identity attachment
    0: {
        "openness": (2.0, 3.0),
        "analytical": (1.5, 2.5),
        "conformity": (3.5, 2.0),
        "identity_attachment": (3.0, 2.0),
        "confidence": (3.0, 2.0),
        "position_lean": -0.4,   # leans against
        "position_spread": 0.3,
        "age_range": (30, 65),
    },
    # educators: high openness, high analytical, low conformity
    1: {
        "openness": (3.5, 1.5),
        "analytical": (3.5, 2.0),
        "conformity": (1.5, 3.0),
        "identity_attachment": (1.5, 3.0),
        "confidence": (2.5, 2.0),
        "position_lean": 0.3,    # leans for
        "position_spread": 0.35,
        "age_range": (28, 60),
    },
    # young_professionals: moderate openness, low identity, moderate conformity
    2: {
        "openness": (2.5, 2.0),
        "analytical": (2.5, 2.0),
        "conformity": (2.5, 2.0),
        "identity_attachment": (1.5, 3.5),
        "confidence": (2.0, 2.5),
        "position_lean": 0.1,    # slightly for
        "position_spread": 0.4,
        "age_range": (22, 38),
    },
    # small_business: low openness, low conformity, very high identity attachment
    3: {
        "openness": (1.5, 3.0),
        "analytical": (2.0, 2.0),
        "conformity": (1.5, 3.0),
        "identity_attachment": (4.0, 1.5),
        "confidence": (3.5, 1.5),
        "position_lean": -0.6,   # strongly against
        "position_spread": 0.2,
        "age_range": (35, 70),
    },
}

# Cluster spatial centers for visual clustering on the canvas
CLUSTER_CENTERS = [
    (0.2, 0.25),   # blue_collar: top-left
    (0.75, 0.2),   # educators: top-right
    (0.25, 0.75),  # young_professionals: bottom-left
    (0.8, 0.78),   # small_business: bottom-right
]

# ── Special preset trait definitions ──────────────────────────────────────────

# Cult leader: thinks independently, resists peer pressure, very high confidence
CULT_LEADER_TRAITS = {
    "openness": (7.0, 2.0),
    "analytical": (6.0, 2.0),
    "conformity": (1.0, 7.0),           # very low — leads, never follows
    "identity_attachment": (8.0, 1.5),  # fully committed to worldview
    "confidence": (8.5, 1.5),
    "age_range": (38, 60),
}

# Cult followers: low analytical → peripheral route, high conformity → Asch pressure
CULT_FOLLOWER_TRAITS = {
    "openness": (1.0, 7.0),            # very low — no outside input
    "analytical": (1.0, 7.0),          # very low — peripheral route dominates
    "conformity": (8.0, 1.5),          # very high — strong social compliance
    "identity_attachment": (1.5, 6.0), # low — beliefs not load-bearing to identity
    "confidence": (1.5, 6.0),          # low — easy to shift
    "age_range": (18, 65),
}

# Echo chamber agents: moderate conformity, symmetric starting positions near center
ECHO_CHAMBER_TRAITS = {
    0: {  # left_chamber
        "openness": (2.0, 3.5),
        "analytical": (2.5, 2.5),
        "conformity": (3.5, 2.0),
        "identity_attachment": (3.0, 2.0),
        "confidence": (2.5, 2.5),
        "position_lean": -0.2,
        "position_spread": 0.15,
        "age_range": (20, 65),
    },
    1: {  # right_chamber
        "openness": (2.0, 3.5),
        "analytical": (2.5, 2.5),
        "conformity": (3.5, 2.0),
        "identity_attachment": (3.0, 2.0),
        "confidence": (2.5, 2.5),
        "position_lean": 0.2,
        "position_spread": 0.15,
        "age_range": (20, 65),
    },
}


def generate_population(
    n: int,
    topic: str,
    society_type: str,
) -> dict[str, Agent]:
    """
    Generate n agents. Dispatches to preset-specific generators for cult,
    echo_chambers, and random_spread; otherwise uses the standard
    cluster-based approach (polarized / consensus / random).
    """
    names = random.sample(NAMES, min(n, len(NAMES)))
    if n > len(NAMES):
        for i in range(n - len(NAMES)):
            names.append(f"Agent_{i}")

    if society_type == "cult":
        return _gen_cult(n, names)
    if society_type == "echo_chambers":
        return _gen_echo_chambers(n, names)
    if society_type == "random_spread":
        return _gen_random_spread(n, names)
    if society_type == "consensus":
        return _gen_consensus(n, names)
    if society_type == "random":
        return _gen_random(n, names)
    return _gen_polarized(n, names)


def _make_agent(agent_id: str, name: str, traits: dict, position: float,
                group_ids: list[str], cluster_id: int,
                x: float, y: float) -> Agent:
    age_lo, age_hi = traits["age_range"]
    return Agent(
        id=agent_id,
        name=name,
        age=random.randint(age_lo, age_hi),
        openness=float(np.clip(np.random.beta(*traits["openness"]), 0.05, 0.95)),
        analytical=float(np.clip(np.random.beta(*traits["analytical"]), 0.05, 0.95)),
        conformity=float(np.clip(np.random.beta(*traits["conformity"]), 0.05, 0.95)),
        identity_attachment=float(np.clip(np.random.beta(*traits["identity_attachment"]), 0.05, 0.95)),
        confidence=float(np.clip(np.random.beta(*traits["confidence"]), 0.05, 0.95)),
        group_ids=group_ids,
        position=max(-1.0, min(1.0, position)),
        x=x,
        y=y,
    )


def _gen_cult(n: int, names: list[str]) -> dict[str, Agent]:
    """
    1 cult leader at center, n-1 followers in a ring.
    Leader: high analytical + identity_attachment, near-zero conformity.
    Followers: low analytical + openness, very high conformity → dominated by Asch pressure.
    Follower positions spread across the full range to showcase the dramatic shift.
    """
    agents = {}

    # Leader
    leader_id = str(uuid.uuid4())[:8]
    leader_pos = max(-1.0, min(1.0, random.gauss(0.0, 0.1)))
    leader = _make_agent(
        agent_id=leader_id,
        name=names[0],
        traits=CULT_LEADER_TRAITS,
        position=leader_pos,
        group_ids=["cult_leader"],
        cluster_id=0,
        x=0.5,
        y=0.5,
    )
    leader._cluster_id = 0
    agents[leader_id] = leader

    # Followers evenly spaced in a ring
    n_followers = n - 1
    for i in range(n_followers):
        angle = (2 * math.pi * i) / n_followers
        cx = 0.5 + 0.38 * math.cos(angle)
        cy = 0.5 + 0.38 * math.sin(angle)
        x = max(0.05, min(0.95, cx + random.gauss(0, 0.03)))
        y = max(0.05, min(0.95, cy + random.gauss(0, 0.03)))

        follower_id = str(uuid.uuid4())[:8]
        follower_pos = random.uniform(-1.0, 1.0)
        follower = _make_agent(
            agent_id=follower_id,
            name=names[i + 1],
            traits=CULT_FOLLOWER_TRAITS,
            position=follower_pos,
            group_ids=["cult_follower"],
            cluster_id=1,
            x=x,
            y=y,
        )
        follower._cluster_id = 1
        agents[follower_id] = follower

    return agents


def _gen_echo_chambers(n: int, names: list[str]) -> dict[str, Agent]:
    """
    Two symmetrically sized chambers starting just left/right of center.
    Dense within-chamber connections, almost no bridges.
    Conformity is high enough that Asch pressure quickly drives each side apart.
    """
    agents = {}
    half = n // 2

    for i in range(n):
        agent_id = str(uuid.uuid4())[:8]
        is_left = i < half
        chamber_idx = 0 if is_left else 1
        traits = ECHO_CHAMBER_TRAITS[chamber_idx]

        position = traits["position_lean"] + random.gauss(0, traits["position_spread"])

        cx = 0.28 if is_left else 0.72
        x = max(0.05, min(0.95, cx + random.gauss(0, 0.10)))
        y = max(0.05, min(0.95, 0.5 + random.gauss(0, 0.20)))

        group_name = "left_chamber" if is_left else "right_chamber"
        agent = _make_agent(
            agent_id=agent_id,
            name=names[i],
            traits=traits,
            position=position,
            group_ids=[group_name],
            cluster_id=chamber_idx,
            x=x,
            y=y,
        )
        agent._cluster_id = chamber_idx
        agents[agent_id] = agent

    return agents


def _gen_random_spread(n: int, names: list[str]) -> dict[str, Agent]:
    """
    Fully random personalities, positions, and spatial layout.
    No cluster structure — every trait is an independent uniform draw.
    """
    agents = {}
    for i in range(n):
        agent_id = str(uuid.uuid4())[:8]
        agent = Agent(
            id=agent_id,
            name=names[i],
            age=random.randint(18, 75),
            openness=random.uniform(0.05, 0.95),
            analytical=random.uniform(0.05, 0.95),
            conformity=random.uniform(0.05, 0.95),
            identity_attachment=random.uniform(0.05, 0.95),
            confidence=random.uniform(0.05, 0.95),
            group_ids=["independent"],
            position=random.uniform(-1.0, 1.0),
            x=random.uniform(0.05, 0.95),
            y=random.uniform(0.05, 0.95),
        )
        agent._cluster_id = 0
        agents[agent_id] = agent

    return agents


def _gen_standard(n: int, names: list[str], position_fn) -> dict[str, Agent]:
    """Shared generator for the 4-cluster demographic presets."""
    from network import CLUSTER_SIZES, CLUSTER_NAMES

    n_clusters = len(CLUSTER_SIZES)
    if n == 25:
        sizes = list(CLUSTER_SIZES)
    else:
        base = n // n_clusters
        remainder = n % n_clusters
        sizes = [base + (1 if i < remainder else 0) for i in range(n_clusters)]

    cluster_assignments = []
    for cluster_id, size in enumerate(sizes):
        cluster_assignments.extend([cluster_id] * size)

    agents = {}
    for i in range(n):
        agent_id = str(uuid.uuid4())[:8]
        cluster_id = cluster_assignments[i]
        traits = CLUSTER_TRAITS[cluster_id]

        cx, cy = CLUSTER_CENTERS[cluster_id]
        x = max(0.05, min(0.95, cx + random.gauss(0, 0.08)))
        y = max(0.05, min(0.95, cy + random.gauss(0, 0.08)))

        agent = _make_agent(
            agent_id=agent_id,
            name=names[i],
            traits=traits,
            position=position_fn(traits),
            group_ids=[CLUSTER_NAMES[cluster_id]],
            cluster_id=cluster_id,
            x=x,
            y=y,
        )
        agent._cluster_id = cluster_id
        agents[agent_id] = agent

    return agents


def _gen_polarized(n: int, names: list[str]) -> dict[str, Agent]:
    return _gen_standard(n, names,
        lambda t: t["position_lean"] + random.gauss(0, t["position_spread"]))


def _gen_consensus(n: int, names: list[str]) -> dict[str, Agent]:
    return _gen_standard(n, names,
        lambda _: float(np.random.beta(5, 5)) * 0.6 - 0.3)


def _gen_random(n: int, names: list[str]) -> dict[str, Agent]:
    return _gen_standard(n, names,
        lambda _: random.uniform(-1.0, 1.0))
