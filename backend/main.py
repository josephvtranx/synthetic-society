"""
FastAPI app with REST endpoints and WebSocket for Society Simulator.
Owner: Person B
"""

import asyncio
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

import simulation

app = FastAPI(title="Society Simulator")

# CORS — allow all origins for hackathon
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connection manager ────────────────────────────────────────────
# TODO [B12]: Track active WebSocket connections for broadcasting
connected_clients: set[WebSocket] = set()


async def broadcast_state(snapshot: dict) -> None:
    """Send state snapshot to all connected WebSocket clients."""
    # TODO [B12]: Implement — iterate connected_clients, send JSON,
    # handle disconnections gracefully
    pass


# ── REST Endpoints ──────────────────────────────────────────────────────────

@app.post("/start")
async def start_simulation(body: dict):
    """
    Initialize a new simulation.
    Body: {"topic": str, "n_agents": int, "game_mode": str, "society_type": str}
    Returns: first state snapshot.
    """
    # TODO [B7]: Implement
    # 1. Extract topic, n_agents, game_mode, society_type from body
    # 2. Call simulation.init_simulation(...)
    # 3. Return the snapshot
    # TODO [B13]: Add Pydantic validation (n_agents 5-50, valid game_mode, etc.)
    raise NotImplementedError("TODO [B7]")


@app.post("/pause")
async def pause_simulation():
    """Pause the simulation."""
    # TODO [B8]: Set simulation.is_running = False, return status
    raise NotImplementedError("TODO [B8]")


@app.post("/resume")
async def resume_simulation():
    """Resume the simulation."""
    # TODO [B8]: Set simulation.is_running = True, return status
    raise NotImplementedError("TODO [B8]")


@app.get("/state")
async def get_state():
    """Return current full state snapshot."""
    # TODO [B8]: Return simulation.get_state_snapshot()
    raise NotImplementedError("TODO [B8]")


@app.post("/broadcast")
async def broadcast_message(body: dict):
    """
    Queue a player message for next tick.
    Body: {"message": str, "target": "all" | agent_id}
    Returns: {"queued": true}
    """
    # TODO [B9]: Implement
    # 1. Extract message and target from body
    # 2. Call simulation.queue_broadcast(message, target)
    # 3. Return {"queued": True}
    raise NotImplementedError("TODO [B9]")


@app.post("/inject_agent")
async def inject_agent(body: dict):
    """
    Inject a new agent into the simulation.
    Body: {"name": str, "position": float, "openness": float,
           "conformity": float, "influence": float}
    Returns: updated state snapshot.
    """
    # TODO [B10]: Implement
    # 1. Extract params from body
    # 2. Call simulation.sim_inject_agent(...)
    # 3. Return updated snapshot
    raise NotImplementedError("TODO [B10]")


@app.post("/sever")
async def sever_connection(body: dict):
    """
    Sever connection between two agents.
    Body: {"agent_a_id": str, "agent_b_id": str}
    Returns: updated state snapshot.
    """
    # TODO [B10]: Implement
    # 1. Extract agent IDs from body
    # 2. Call simulation.sim_sever_connection(...)
    # 3. Return updated snapshot
    raise NotImplementedError("TODO [B10]")


@app.post("/speed")
async def set_speed(body: dict):
    """
    Set tick speed.
    Body: {"tick_duration": float}  — clamped to [0.5, 10.0]
    """
    # TODO [B14]: Implement
    raise NotImplementedError("TODO [B14]")


# ── WebSocket ───────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    WebSocket endpoint for real-time state streaming.
    - On connect: send current state immediately
    - Run tick loop while is_running
    - Accept player action messages as JSON
    """
    # TODO [B11]: Implement
    # 1. Accept connection, add to connected_clients
    # 2. Send current state snapshot
    # 3. Start two concurrent tasks:
    #    a. Tick loop: while is_running, call run_tick(broadcast_state),
    #       sleep tick_duration_seconds
    #    b. Receive loop: accept JSON messages, route to appropriate
    #       simulation functions (broadcast, inject, sever)
    # 4. On disconnect: remove from connected_clients
    raise NotImplementedError("TODO [B11]")
