import { useEffect, useRef } from "react";
import { useSimStore } from "./store";
import type { SimState } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

let socket: WebSocket | null = null;

export function sendWsMessage(msg: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function startSim(topic: string, nAgents: number, societyType: string) {
  sendWsMessage({
    action: "start",
    topic,
    n_agents: nAgents,
    game_mode: "sandbox",
    society_type: societyType,
  });
}

export function pauseSim() {
  sendWsMessage({ action: "pause" });
}

export function resumeSim() {
  sendWsMessage({ action: "resume" });
}

export function sendBroadcast(message: string, target: string) {
  sendWsMessage({ action: "broadcast", message, target });
}

export function setSpeed(tickDuration: number) {
  sendWsMessage({ action: "speed", tick_duration: tickDuration });
}

export function injectAgent(
  name: string,
  position: number,
  openness: number,
  conformity: number,
  influence: number
) {
  sendWsMessage({
    action: "inject",
    name,
    position,
    openness,
    conformity,
    influence,
  });
}

export function severConnection(agentAId: string, agentBId: string) {
  sendWsMessage({
    action: "sever",
    agent_a_id: agentAId,
    agent_b_id: agentBId,
  });
}

export function useWebSocket() {
  const setState = useSimStore((s) => s.setState);
  const setConnected = useSimStore((s) => s.setConnected);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setConnected(true);

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as SimState;
        setState(data);
      };

      socket.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      socket?.close();
      socket = null;
    };
  }, [setState, setConnected]);
}
