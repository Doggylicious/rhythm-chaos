import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, RotateCcw, Play, Square, Volume2 } from "lucide-react";

const BPM = 100;
const BEAT_SECONDS = 60 / BPM;
const START_LEAD_SECONDS = 1.8;
const SESSION_SECONDS = 30;
const HIT_WINDOW_MS = 220;

type Hit = { delta: number; at: number };

function makeClick(ctx: AudioContext, when: number, frequency: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.01);
}

function playBeat(ctx: AudioContext, when: number, beatIndex: number) {
  // A tiny original synthesized groove: kick on 1/3, snare-like click on 2/4, hats on every beat.
  if (beatIndex % 4 === 0 || beatIndex % 4 === 2) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(115, when);
    osc.frequency.exponentialRampToValueAtTime(48, when + 0.13);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.55, when + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.17);
  } else {
    makeClick(ctx, when, 190, 0.075, 0.18);
  }
  makeClick(ctx, when, beatIndex % 4 === 0 ? 1200 : 900, 0.025, 0.045);
}

export default function App() {
  const audioRef = useRef<AudioContext | null>(null);
  const startAtRef = useRef(0);
  const nextBeatRef = useRef(0);
  const schedulerRef = useRef<number | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const lastHitRef = useRef(-1);
  const hitsRef = useRef<Hit[]>([]);
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [muted, setMuted] = useState(false);
  const tapRef = useRef<() => void>(() => undefined);

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false;
    setRunning(false);
    setCountdown(false);
    setSessionDone(true);
    if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    schedulerRef.current = null;
    endTimerRef.current = null;
  }, []);

  const startSession = useCallback(async () => {
    if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    const ctx = audioRef.current ?? new AudioContext();
    audioRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    hitsRef.current = [];
    lastHitRef.current = -1;
    setHits([]);
    setLastDelta(null);
    setElapsed(0);
    setFlash(0);
    setSessionDone(false);
    setCountdown(true);
    setRunning(true);
    sessionActiveRef.current = true;
    startAtRef.current = ctx.currentTime + START_LEAD_SECONDS;
    nextBeatRef.current = 0;

    // Schedule against the audio clock, not setInterval's clock.
    schedulerRef.current = window.setInterval(() => {
      if (!sessionActiveRef.current) return;
      const now = ctx.currentTime;
      while (startAtRef.current + nextBeatRef.current * BEAT_SECONDS < now + 0.12) {
        const beatTime = startAtRef.current + nextBeatRef.current * BEAT_SECONDS;
        if (!muted) playBeat(ctx, beatTime, nextBeatRef.current);
        nextBeatRef.current += 1;
      }
      const elapsedNow = Math.max(0, now - startAtRef.current);
      setElapsed(Math.min(SESSION_SECONDS, elapsedNow));
      setCountdown(now < startAtRef.current);
      if (elapsedNow >= SESSION_SECONDS) stopSession();
    }, 25);
  }, [muted, stopSession]);

  useEffect(() => () => {
    if (schedulerRef.current !== null) window.clearInterval(schedulerRef.current);
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    void audioRef.current?.close();
  }, []);

  const tap = () => {
    const ctx = audioRef.current;
    if (!running || !ctx || !sessionActiveRef.current || ctx.currentTime < startAtRef.current) return;
    const now = ctx.currentTime;
    const beatFloat = (now - startAtRef.current) / BEAT_SECONDS;
    const nearestBeat = Math.round(beatFloat);
    if (nearestBeat === lastHitRef.current) return;
    const delta = (beatFloat - nearestBeat) * BEAT_SECONDS * 1000;
    if (Math.abs(delta) > HIT_WINDOW_MS) {
      setLastDelta(delta);
      setFlash(0);
      return;
    }
    lastHitRef.current = nearestBeat;
    const hit = { delta, at: now };
    hitsRef.current = [...hitsRef.current, hit];
    setHits([...hitsRef.current]);
    setLastDelta(delta);
    setFlash(Math.max(0, 1 - Math.abs(delta) / 180));
  };

  tapRef.current = tap;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        tapRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const avgAbs = hits.length ? hits.reduce((sum, hit) => sum + Math.abs(hit.delta), 0) / hits.length : null;
  const accuracy = hits.length ? Math.round((hits.filter((hit) => Math.abs(hit.delta) <= 50).length / hits.length) * 100) : 0;
  const perfect = lastDelta !== null && Math.abs(lastDelta) <= 35;
  const good = lastDelta !== null && Math.abs(lastDelta) <= 80;
  const color = perfect ? "#ff53d2" : good ? "#62dcff" : "#897eff";

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><AudioLines size={18} /></span><span>RHYTHM <b>CHAOS</b></span></div>
        <div className="mode">METRUM / 01</div>
      </header>

      <section className="game">
        <div className="eyebrow">{sessionDone ? "SESSION COMPLETE" : countdown ? "GET READY" : running ? "FIND YOUR GROOVE" : "A RHYTHM GAME"}</div>
        <div className="headline">{sessionDone ? "Nice flow." : running ? "Feel the beat." : "Tap into it."}</div>
        <p className="subhead">{sessionDone ? "Your rhythm, measured." : "It's just you and the pulse."}</p>

        <div className={`tap-zone ${running ? "is-running" : ""}`} style={{ "--flash": flash, "--glow-color": color } as React.CSSProperties}>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <button className="tap-button" onPointerDown={(event) => { event.preventDefault(); tap(); }} aria-label="Tap to the beat" disabled={!running || countdown}>
            <span className="tap-label">{countdown ? "READY" : running ? "TAP" : sessionDone ? "AGAIN?" : "TAP"}</span>
            <span className="tap-sub">{running && !countdown ? "ON THE PULSE" : "TO THE BEAT"}</span>
          </button>
          <div className="spark spark-a" />
          <div className="spark spark-b" />
        </div>

        <div className="feedback" aria-live="polite">
          {countdown ? <><span className="feedback-label">STARTING IN</span><strong>•••</strong></> :
            lastDelta === null ? <><span className="feedback-label">LAST DEVIATION</span><strong>— <small>ms</small></strong></> :
            <><span className="feedback-label">{Math.abs(lastDelta) <= 35 ? "LOCKED IN" : Math.abs(lastDelta) <= 80 ? "NICE TIMING" : Math.abs(lastDelta) <= 150 ? "KEEP FEELING IT" : "FIND THE PULSE"}</span><strong>{lastDelta > 0 ? "+" : ""}{Math.round(lastDelta)} <small>ms</small></strong><span className="direction">{lastDelta < 0 ? "EARLY" : lastDelta > 0 ? "LATE" : "DEAD ON"}</span></>}
        </div>

        <div className="session-line">
          <div className="session-meta"><span>{running ? "SESSION" : sessionDone ? "SESSION ENDED" : "TEST GROOVE"}</span><span>{running ? `${Math.ceil(Math.max(0, SESSION_SECONDS - elapsed))}s left` : `${BPM} BPM · 4/4`}</span></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${running ? (elapsed / SESSION_SECONDS) * 100 : sessionDone ? 100 : 0}%` }} /></div>
        </div>

        {!running ? (
          <button className="primary-button" onClick={() => void startSession()}><Play size={16} fill="currentColor" /> {sessionDone ? "PLAY AGAIN" : "START GROOVE"}</button>
        ) : (
          <button className="secondary-button" onClick={stopSession}><Square size={14} fill="currentColor" /> END SESSION</button>
        )}
        <div className="hint"><span className="keycap">SPACE</span> or tap the button</div>
      </section>

      <section className="stats">
        <div className="stat"><span className="stat-label">TAPS ON BEAT</span><strong>{hits.length}</strong></div>
        <div className="stat"><span className="stat-label">AVG. DEVIATION</span><strong>{avgAbs === null ? "—" : <>{Math.round(avgAbs)}<small> ms</small></>}</strong></div>
        <div className="stat"><span className="stat-label">TIGHT HITS</span><strong>{hits.length ? `${accuracy}%` : "—"}</strong></div>
      </section>

      <footer className="footer">
        <button className="icon-button" title={muted ? "Enable sound" : "Mute sound"} onClick={() => setMuted(!muted)}><Volume2 size={16} /> {muted ? "SOUND OFF" : "SOUND ON"}</button>
        <button className="icon-button" title="Reset stats" onClick={() => { setHits([]); hitsRef.current = []; setLastDelta(null); setSessionDone(false); setElapsed(0); }}><RotateCcw size={14} /> RESET</button>
      </footer>
      <p className="prototype-note">PROTOTYPE 0.1 · BUILT FOR THE FEELING · THEO PRILL? THIS GUY FUUUCKS!</p>
    </main>
  );
}