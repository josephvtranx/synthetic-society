"use client";

import { useEffect, useRef } from "react";
import { useSimStore, useTotalTicks } from "@/lib/store";
import { nextTick } from "@/lib/api";
import { BG, TEXT_PRIMARY, TEXT_MUTED, CARD } from "@/lib/colors";

export default function PlaybackControls() {
  const currentTick = useSimStore((s) => s.currentTick);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const simId = useSimStore((s) => s.simId);
  const setCurrentTick = useSimStore((s) => s.setCurrentTick);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setScreen = useSimStore((s) => s.setScreen);
  const addTick = useSimStore((s) => s.addTick);
  const totalTicks = useTotalTicks();

  const fetchingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const mono = { fontFamily: "'Courier New', monospace" };

  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    const ms = 5000 / speed;
    intervalRef.current = setInterval(() => {
      const state = useSimStore.getState();
      const nextIdx = state.currentTick + 1;

      // If we already have this tick loaded (rewound), scrub forward
      if (nextIdx < state.ticks.length) {
        useSimStore.setState({ currentTick: nextIdx });
        return;
      }

      // Fetch a new tick from the backend
      if (fetchingRef.current || !state.simId) return;
      fetchingRef.current = true;

      nextTick(state.simId).then((snapshot) => {
        useSimStore.getState().addTick(snapshot);
        useSimStore.setState({ currentTick: nextIdx });
        fetchingRef.current = false;
      }).catch(() => {
        fetchingRef.current = false;
        useSimStore.setState({ playing: false });
      });
    }, ms);
    return () => clearInterval(intervalRef.current);
  }, [playing, speed]);

  return (
    <div className="px-5 py-3 flex items-center gap-4" style={{ background: BG, borderTop: `2px solid ${TEXT_PRIMARY}` }}>
      <button
        onClick={() => setPlaying(!playing)}
        className="w-8 h-8 flex items-center justify-center transition-colors"
        style={{ border: `2px solid ${TEXT_PRIMARY}`, background: CARD }}
      >
        {playing ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.5" y="1" width="2.5" height="8" fill={TEXT_PRIMARY} />
            <rect x="6" y="1" width="2.5" height="8" fill={TEXT_PRIMARY} />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 1L8.5 5L2.5 9V1Z" fill={TEXT_PRIMARY} />
          </svg>
        )}
      </button>

      <button onClick={() => { setCurrentTick(0); setPlaying(false); }}
        className="text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED, ...mono }}>
        rewind
      </button>

      <div className="flex-1 flex items-center gap-3">
        <input
          type="range" min={0} max={totalTicks} value={currentTick}
          onChange={(e) => { setCurrentTick(parseInt(e.target.value)); setPlaying(false); }}
          className="flex-1 h-1 appearance-none cursor-pointer"
          style={{ background: "rgba(0,0,0,0.12)", accentColor: TEXT_PRIMARY }}
        />
        <span className="text-xs tabular-nums w-14 text-right font-bold" style={{ color: TEXT_PRIMARY, ...mono }}>
          tick {currentTick}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {([0.5, 1, 2] as const).map((s) => (
          <button
            key={s} onClick={() => setSpeed(s)}
            className="px-2 py-1 text-xs transition-colors"
            style={{
              background: speed === s ? TEXT_PRIMARY : "transparent",
              color: speed === s ? CARD : TEXT_MUTED,
              fontWeight: speed === s ? 700 : 400,
              ...mono,
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      <button onClick={() => { setPlaying(false); setScreen("debrief"); }}
        className="text-xs uppercase tracking-widest font-bold" style={{ color: TEXT_PRIMARY, ...mono }}>
        end &amp; probe
      </button>
    </div>
  );
}
