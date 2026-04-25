"use client";

import { useEffect, useRef } from "react";
import { useSimStore, useTotalTicks } from "@/lib/store";
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, CARD } from "@/lib/colors";

export default function PlaybackControls() {
  const currentTick = useSimStore((s) => s.currentTick);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const setCurrentTick = useSimStore((s) => s.setCurrentTick);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setScreen = useSimStore((s) => s.setScreen);
  const totalTicks = useTotalTicks();

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    const ms = 2000 / speed;
    intervalRef.current = setInterval(() => {
      useSimStore.setState((state) => {
        const next = state.currentTick + 1;
        if (next > totalTicks) return { playing: false, screen: "debrief" as const };
        return { currentTick: next };
      });
    }, ms);
    return () => clearInterval(intervalRef.current);
  }, [playing, speed, totalTicks]);

  return (
    <div className="px-5 py-3 flex items-center gap-4" style={{ background: BG, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
      <button
        onClick={() => {
          if (currentTick >= totalTicks) { setCurrentTick(0); setPlaying(true); }
          else setPlaying(!playing);
        }}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shadow-sm"
        style={{ background: CARD, border: "1px solid rgba(0,0,0,0.08)" }}
      >
        {playing ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.5" y="1" width="2" height="8" rx="0.5" fill={TEXT_PRIMARY} />
            <rect x="6.5" y="1" width="2" height="8" rx="0.5" fill={TEXT_PRIMARY} />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 1L8.5 5L2.5 9V1Z" fill={TEXT_PRIMARY} />
          </svg>
        )}
      </button>

      <button onClick={() => { setCurrentTick(0); setPlaying(false); }} className="text-xs" style={{ color: TEXT_MUTED }}>
        rewind
      </button>

      <div className="flex-1 flex items-center gap-3">
        <input
          type="range" min={0} max={totalTicks} value={currentTick}
          onChange={(e) => { setCurrentTick(parseInt(e.target.value)); setPlaying(false); }}
          className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
          style={{ background: "rgba(0,0,0,0.08)", accentColor: TEXT_SECONDARY }}
        />
        <span className="text-xs tabular-nums w-14 text-right" style={{ color: TEXT_MUTED }}>
          {currentTick}/{totalTicks}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {([0.5, 1, 2] as const).map((s) => (
          <button
            key={s} onClick={() => setSpeed(s)}
            className="px-2 py-1 text-xs rounded transition-colors"
            style={{ background: speed === s ? "rgba(0,0,0,0.06)" : "transparent", color: speed === s ? TEXT_PRIMARY : TEXT_MUTED }}
          >
            {s}x
          </button>
        ))}
      </div>

      <button onClick={() => { setPlaying(false); setCurrentTick(totalTicks); setScreen("debrief"); }} className="text-xs" style={{ color: TEXT_MUTED }}>
        skip to results
      </button>
    </div>
  );
}
