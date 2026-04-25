"""
FastAPI app with REST endpoints and WebSocket for Society Simulator.
"""

import asyncio
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

import simulation

app = FastAPI(title="Society Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connection manager ────────────────────────────────────────────
connected_clients: set[WebSocket] = set()


async def broadcast_state(snapshot: dict) -> None:
    """Send state snapshot to all connected WebSocket clients."""
    dead = set()
    data = json.dumps(snapshot)
    for ws in connected_clients:
        try:
            await ws.send_text(data)
        except Exception:
            dead.add(ws)
    connected_clients.difference_update(dead)


# ── REST Endpoints ──────────────────────────────────────────────────────────

@app.post("/start")
async def start_simulation(body: dict):
    """
    Initialize a new simulation.
    Body: {"topic": str, "n_agents": int, "game_mode": str, "society_type": str}
    """
    topic = body.get("topic", "minimum wage")
    n_agents = max(5, min(50, body.get("n_agents", 25)))
    game_mode = body.get("game_mode", "sandbox")
    society_type = body.get("society_type", "random")

    snapshot = simulation.init_simulation(topic, n_agents, game_mode, society_type)
    return snapshot


@app.post("/pause")
async def pause_simulation():
    simulation.is_running = False
    return {"status": "paused"}


@app.post("/resume")
async def resume_simulation():
    simulation.is_running = True
    return {"status": "running"}


@app.get("/state")
async def get_state():
    return simulation.get_state_snapshot()


@app.post("/broadcast")
async def broadcast_message(body: dict):
    """Queue a player message for next tick."""
    message = body.get("message", "")
    target = body.get("target", "all")
    simulation.queue_broadcast(message, target)
    return {"queued": True}


@app.post("/inject_agent")
async def inject_agent(body: dict):
    """Inject a new agent into the simulation."""
    return simulation.sim_inject_agent(
        name=body.get("name", "Injected Agent"),
        position=max(-1.0, min(1.0, body.get("position", 0.0))),
        openness=max(0.0, min(1.0, body.get("openness", 0.5))),
        conformity=max(0.0, min(1.0, body.get("conformity", 0.5))),
        influence=max(0.0, min(1.0, body.get("influence", 0.5))),
    )


@app.post("/sever")
async def sever_connection(body: dict):
    """Sever connection between two agents."""
    agent_a_id = body.get("agent_a_id", "")
    agent_b_id = body.get("agent_b_id", "")
    return simulation.sim_sever_connection(agent_a_id, agent_b_id)


@app.post("/speed")
async def set_speed(body: dict):
    """Set tick speed. Clamped to [0.5, 10.0]."""
    duration = body.get("tick_duration", 3.0)
    simulation.tick_duration_seconds = max(0.5, min(10.0, float(duration)))
    return {"tick_duration": simulation.tick_duration_seconds}


# ── WebSocket ───────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)

    try:
        # Send current state on connect
        await ws.send_text(json.dumps(simulation.get_state_snapshot()))

        async def tick_loop():
            while True:
                if simulation.is_running and not simulation.has_converged:
                    await simulation.run_tick(broadcast_state)
                    await asyncio.sleep(simulation.tick_duration_seconds)
                else:
                    await asyncio.sleep(0.2)

        async def receive_loop():
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                    action = msg.get("action")

                    if action == "start":
                        topic = msg.get("topic", "minimum wage")
                        n_agents = max(5, min(50, msg.get("n_agents", 25)))
                        game_mode = msg.get("game_mode", "sandbox")
                        society_type = msg.get("society_type", "random")
                        simulation.init_simulation(topic, n_agents, game_mode, society_type)
                        simulation.is_running = True
                        await broadcast_state(simulation.get_state_snapshot())

                    elif action == "pause":
                        simulation.is_running = False
                        await broadcast_state(simulation.get_state_snapshot())

                    elif action == "resume":
                        simulation.is_running = True

                    elif action == "broadcast":
                        simulation.queue_broadcast(
                            msg.get("message", ""),
                            msg.get("target", "all"),
                        )

                    elif action == "inject":
                        snapshot = simulation.sim_inject_agent(
                            name=msg.get("name", "Injected Agent"),
                            position=msg.get("position", 0.0),
                            openness=msg.get("openness", 0.5),
                            conformity=msg.get("conformity", 0.5),
                            influence=msg.get("influence", 0.5),
                        )
                        await broadcast_state(snapshot)

                    elif action == "sever":
                        snapshot = simulation.sim_sever_connection(
                            msg.get("agent_a_id", ""),
                            msg.get("agent_b_id", ""),
                        )
                        await broadcast_state(snapshot)

                    elif action == "speed":
                        simulation.tick_duration_seconds = max(
                            0.5, min(10.0, float(msg.get("tick_duration", 3.0)))
                        )

                except json.JSONDecodeError:
                    pass

        # Run both loops concurrently
        tick_task = asyncio.create_task(tick_loop())
        recv_task = asyncio.create_task(receive_loop())

        done, pending = await asyncio.wait(
            [tick_task, recv_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(ws)
