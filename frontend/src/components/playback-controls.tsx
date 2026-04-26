"use client";

import { useEffect, useRef } from "react";
import { useSimStore, useTotalTicks } from "@/lib/store";
import { nextTick } from "@/lib/api";
import { BG, SURF, BORDER, BORDER_MD, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACTION, FONT_UI, FONT_MONO } from "@/lib/colors";

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

  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    const ms = 5000 / speed;
    intervalRef.current = setInterval(() => {
      const state = useSimStore.getState();
      const nextIdx = state.currentTick + 1;

      if (nextIdx < state.ticks.length) {
        useSimStore.setState({ currentTick: nextIdx });
        return;
      }

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
    <div className="px-5 flex items-center gap-4" style={{ height: 52, background: SURF, borderTop: `1px solid ${BORDER}` }}>
      {/* Play/Pause button */}
      <button
        onClick={() => setPlaying(!playing)}
        className="flex items-center justify-center transition-all"
        style={{ width: 32, height: 32, borderRadius: "50%", background: ACTION, border: "none" }}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="1.5" width="3" height="9" rx="0.5" fill="white" />
            <rect x="7" y="1.5" width="3" height="9" rx="0.5" fill="white" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 1.5L10 6L3.5 10.5V1.5Z" fill="white" />
          </svg>
        )}
      </button>

      {/* Rewind */}
      <button onClick={() => { setCurrentTick(0); setPlaying(false); }}
        style={{ fontFamily: FONT_UI, fontSize: 11, color: TEXT_MUTED, background: "none", border: "none" }}>
        Rewind
      </button>

      {/* Scrubber */}
      <div className="flex-1 flex items-center gap-3">
        <input
          type="range" min={0} max={totalTicks} value={currentTick}
          onChange={(e) => { setCurrentTick(parseInt(e.target.value)); setPlaying(false); }}
          className="flex-1 h-1 appearance-none cursor-pointer"
          style={{ background: "rgba(0,0,0,0.08)", accentColor: ACTION }}
        />
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: TEXT_PRIMARY, width: 56, textAlign: "right" }}>
          {currentTick} / {totalTicks}
        </span>
      </div>

      {/* Speed buttons */}
      <div className="flex items-center gap-0.5">
        {([0.5, 1, 2] as const).map((s) => (
          <button
            key={s} onClick={() => setSpeed(s)}
            className="transition-all"
            style={{
              padding: "4px 10px",
              borderRadius: 5,
              border: speed === s ? "none" : `1px solid ${BORDER}`,
              background: speed === s ? ACTION : "transparent",
              color: speed === s ? "white" : TEXT_MUTED,
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: speed === s ? 700 : 400,
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* End & Probe */}
      <button onClick={() => { setPlaying(false); setScreen("debrief"); }}
        className="transition-all"
        style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, border: `1px solid ${BORDER_MD}`, borderRadius: 6, padding: "5px 14px", background: "transparent" }}>
        End &amp; Probe
      </button>
    </div>
  );
}
