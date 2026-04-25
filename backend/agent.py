"""
Agent dataclass and population generation for Society Simulator.
Owner: Person A
"""

from dataclasses import dataclass, field
from typing import Optional
import uuid
import random
import numpy as np


# ── Name pool (200+ names, diverse cultural backgrounds) ──────────────────────
# TODO [A3]: Expand to 200+ names spanning many cultural backgrounds
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
            "position": self.position,
            "confidence": self.confidence,
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
    # TODO [A2]: Implement the full belief update formula
    # 1. Compute arg_quality from logic/emotion/evidence weighted by agent.analytical
    # 2. Compute credibility from source influence * group similarity
    # 3. Compute elaboration = openness * (1 - identity_attachment)
    # 4. If elaboration > 0.5: central route (arg_quality * credibility * openness)
    #    Else: peripheral route (peer_pressure * conformity)
    # 5. Apply final_delta with confidence and resistance dampening
    # 6. Clamp position to [-1, 1]
    # 7. Bump confidence if shift > 0.05
    raise NotImplementedError("TODO [A2]")


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
    # TODO [A3]: Implement population generation
    # 1. Sample n names without replacement from NAMES pool
    # 2. Generate personality traits from Beta distributions:
    #    openness ~ Beta(2.5, 2.0), analytical ~ Beta(2.0, 2.0),
    #    conformity ~ Beta(2.0, 2.5), agreeableness ~ Beta(3.0, 2.0),
    #    influence_score ~ Beta(1.5, 4.0), identity_attachment ~ Beta(1.5, 3.0),
    #    confidence ~ Beta(2.5, 2.0)
    # 3. Generate positions based on society_type:
    #    "polarized": bimodal (Beta(6,2) scaled to [-1,0] and [0,1])
    #    "consensus": Beta(5,5) scaled to [-0.3, 0.3]
    #    "random": uniform [-1, 1]
    # 4. Assign group_ids from AGE_GROUPS, LOCALE_GROUPS, EDUCATION_GROUPS
    # 5. Random x, y in [0.05, 0.95]; target = initial position
    # 6. Set starting_position = position
    raise NotImplementedError("TODO [A3]")
