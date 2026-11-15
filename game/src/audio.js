// All of Sablepoint's sound is synthesized with WebAudio at play time: gunfire is filtered
// noise with a body thump, the explosion is a sine drop under noise, the charge beeps, the
// furnace room tone is a low hum. No audio files exist, so nothing can fail to load and the
// game stays self-contained. Sounds take a volume and a lowpass cutoff so distance is audible.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, vol, cutoff, type = 'lowpass', sweepTo = 0) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  function tone(freq, dur, vol, type = 'sine', slideTo = 0, delay = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Gunfire per weapon family. vol/cutoff shrink with distance from the listener.
  function shot(kind, vol = 1, cutoff = 9000) {
    if (!ctx) return;
    const v = Math.min(1, vol);
    if (kind === 'scatter') {
      noise(0.22, 0.85 * v, cutoff * 0.5, 'lowpass', 300);
      tone(120, 0.16, 0.5 * v, 'triangle', 45);
    } else if (kind === 'kestrel') {
      noise(0.3, 0.8 * v, cutoff * 0.7, 'lowpass', 240);
      tone(90, 0.24, 0.55 * v, 'triangle', 38);
    } else if (kind === 'p9') {
      noise(0.11, 0.55 * v, cutoff, 'lowpass', 700);
      tone(170, 0.08, 0.3 * v, 'triangle', 70);
    } else { // raptor / vk7
      noise(0.14, 0.65 * v, cutoff * 0.85, 'lowpass', 500);
      tone(140, 0.1, 0.35 * v, 'triangle', 55);
    }
  }

  return {
    ensure,
    shot,
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(500, 0.04, 0.15, 'square'); tone(340, 0.05, 0.18, 'square', 0, 0.14); tone(720, 0.04, 0.16, 'square', 0, 0.3); },
    hit(head) { tone(head ? 1560 : 1040, 0.06, 0.2, 'sine'); if (head) tone(2090, 0.09, 0.16, 'sine', 0, 0.03); },
    kill() { tone(660, 0.09, 0.2, 'triangle'); tone(990, 0.12, 0.2, 'triangle', 0, 0.07); },
    hurt() { noise(0.12, 0.25, 900); tone(110, 0.12, 0.2, 'sawtooth', 70); },
    footstep(run) { noise(0.05, run ? 0.10 : 0.05, 500); },
    throwIt() { noise(0.16, 0.12, 1600, 'bandpass'); },
    bounce() { tone(300, 0.05, 0.12, 'square', 180); },
    explosion() {
      noise(1.1, 1.0, 2600, 'lowpass', 60);
      tone(120, 0.9, 0.8, 'sine', 28);
      tone(64, 1.2, 0.6, 'triangle', 24, 0.05);
    },
    flash() { noise(0.35, 0.7, 8000, 'highpass'); tone(3400, 0.5, 0.05, 'sine', 3200); },
    smokePop() { noise(0.4, 0.3, 700, 'lowpass', 200); },
    beep(final) { tone(final ? 1760 : 1180, final ? 0.22 : 0.07, 0.22, 'square'); },
    plantDone() { tone(880, 0.08, 0.2, 'square'); tone(1320, 0.14, 0.2, 'square', 0, 0.09); },
    buy() { tone(1240, 0.05, 0.15, 'square'); tone(1860, 0.07, 0.13, 'square', 0, 0.05); },
    denied() { tone(220, 0.12, 0.18, 'square', 180); },
    click() { tone(900, 0.03, 0.1, 'square'); },
    roundEnd(won) {
      if (won) { tone(523, 0.14, 0.2, 'triangle'); tone(784, 0.2, 0.2, 'triangle', 0, 0.11); }
      else { tone(392, 0.16, 0.2, 'triangle'); tone(262, 0.26, 0.2, 'triangle', 0, 0.12); }
    },
  };
}
