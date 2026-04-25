"""
Agent dataclass and population generation for Society Simulator.
"""

from dataclasses import dataclass, field
from typing import Optional
import uuid
import random
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
    agreeableness: float      # 0-1
    influence_score: float    # 0-1
    group_ids: list[str] = field(default_factory=list)

    # Dynamic (changes each tick)
    position: float = 0.0             # -1.0 to 1.0
    confidence: float = 0.5           # 0-1
    identity_attachment: float = 0.3  # 0-1
    memory: list[dict] = field(default_factory=list)  # last 8 interactions

    # Spatial (backend tracks, frontend uses for animation)
    x: float = 0.5
    y: float = 0.5
    target_x: float = 0.5
    target_y: float = 0.5
    current_interaction_partner_id: Optional[str] = None

    # Track starting position for win conditions
    starting_position: float = 0.0

    def to_dict(self) -> dict:
        """Serialize agent for state snapshot broadcast."""
        return {
            "id": self.id,
            "name": self.name,
            "age": self.age,
            "position": self.position,
            "confidence": self.confidence,
            "openness": self.openness,
            "analytical": self.analytical,
            "conformity": self.conformity,
            "agreeableness": self.agreeableness,
            "influence_score": self.influence_score,
            "identity_attachment": self.identity_attachment,
            "x": self.x,
            "y": self.y,
            "target_x": self.target_x,
            "target_y": self.target_y,
            "current_interaction_partner_id": self.current_interaction_partner_id,
            "groups": self.group_ids,
            "memory": self.memory[-8:],
        }


def update_belief(
    agent: Agent,
    argument_scores: dict,
    source_agent: Agent,
    peer_avg_position: float,
) -> float:
    """
    Update agent's belief position based on an argument from source_agent.
    Returns abs(final_delta) — the magnitude of the shift.
    """
    arg_quality = (
        argument_scores["logic"] * agent.analytical
        + argument_scores["emotion"] * (1 - agent.analytical)
        + argument_scores["evidence"] * 0.3
    ) / 1.3

    similarity = len(set(agent.group_ids) & set(source_agent.group_ids)) / max(len(agent.group_ids), 1)
    credibility = source_agent.influence_score * (0.5 + 0.5 * similarity)

    elaboration = agent.openness * (1 - agent.identity_attachment)

    if elaboration > 0.5:
        # Central route: engage with the argument
        raw_delta = arg_quality * credibility * agent.openness
        direction = 1 if source_agent.position > agent.position else -1
        raw_delta *= direction
    else:
        # Peripheral route: follow the crowd
        peer_pressure = peer_avg_position - agent.position
        raw_delta = peer_pressure * agent.conformity

    final_delta = raw_delta * (1 - agent.confidence)
    resistance = agent.identity_attachment * 0.5
    final_delta *= (1 - resistance)

    agent.position += final_delta
    agent.position = max(-1.0, min(1.0, agent.position))

    if abs(final_delta) > 0.05:
        agent.confidence = min(1.0, agent.confidence + 0.02)

    return abs(final_delta)


def generate_population(
    n: int,
    topic: str,
    society_type: str,
) -> dict[str, Agent]:
    """
    Generate n agents with diverse personalities and positions.
    society_type: "polarized" | "consensus" | "random"
    Returns: dict mapping agent_id -> Agent
    """
    names = random.sample(NAMES, min(n, len(NAMES)))
    if n > len(NAMES):
        for i in range(n - len(NAMES)):
            names.append(f"Agent_{i}")

    agents = {}
    for i in range(n):
        agent_id = str(uuid.uuid4())[:8]

        # Personality traits from Beta distributions
        openness = float(np.random.beta(2.5, 2.0))
        analytical = float(np.random.beta(2.0, 2.0))
        conformity = float(np.random.beta(2.0, 2.5))
        agreeableness = float(np.random.beta(3.0, 2.0))
        influence_score = float(np.random.beta(1.5, 4.0))
        identity_attachment = float(np.random.beta(1.5, 3.0))
        confidence = float(np.random.beta(2.5, 2.0))

        # Position based on society type
        if society_type == "polarized":
            if random.random() < 0.5:
                position = -float(np.random.beta(6, 2))
            else:
                position = float(np.random.beta(6, 2))
        elif society_type == "consensus":
            position = float(np.random.beta(5, 5)) * 0.6 - 0.3
        else:  # random
            position = random.uniform(-1.0, 1.0)

        # Demographics
        age = random.randint(18, 75)
        group_ids = [
            random.choice(AGE_GROUPS),
            random.choice(LOCALE_GROUPS),
            random.choice(EDUCATION_GROUPS),
        ]

        # Spatial position
        x = random.uniform(0.05, 0.95)
        y = random.uniform(0.05, 0.95)

        agent = Agent(
            id=agent_id,
            name=names[i],
            age=age,
            openness=openness,
            analytical=analytical,
            conformity=conformity,
            agreeableness=agreeableness,
            influence_score=influence_score,
            group_ids=group_ids,
            position=position,
            confidence=confidence,
            identity_attachment=identity_attachment,
            x=x,
            y=y,
            target_x=x,
            target_y=y,
            starting_position=position,
        )
        agents[agent_id] = agent

    return agents
