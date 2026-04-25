import { useEffect, useRef } from "react";
import { useSimStore } from "./store";
import type { SimState, PlayerAction } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

let socket: WebSocket | null = null;

export function sendAction(action: PlayerAction) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(action));
  }
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
