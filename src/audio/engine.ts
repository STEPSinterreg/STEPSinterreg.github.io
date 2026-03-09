import type { HearingProfile, BiquadSpec } from './profiles';

type Maybe<T> = T | null;

export class AudioEngine {
  private ctx: Maybe<AudioContext> = null;
  private masterGain: Maybe<GainNode> = null;
  private elementInput: Maybe<GainNode> = null;
  private compressor: Maybe<DynamicsCompressorNode> = null;
  private tinnitusOsc: Maybe<OscillatorNode> = null;
  private tinnitusGain: Maybe<GainNode> = null;
  private noiseSource: Maybe<AudioBufferSourceNode> = null;
  private noiseGain: Maybe<GainNode> = null;
  private currentSource: Maybe<AudioBufferSourceNode> = null;
  private currentToneOsc: Maybe<OscillatorNode> = null;
  private currentToneEnvGain: Maybe<GainNode> = null;
  private currentToneLevelGain: Maybe<GainNode> = null;
  private currentBuffer: Maybe<AudioBuffer> = null;
  private currentProfile: Maybe<HearingProfile> = null;
  private intensity: number = 1; // 0..1
  private audioElement: Maybe<HTMLAudioElement> = null;
  private elementSource: Maybe<MediaElementAudioSourceNode> = null;
  private elementSourceByEl: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();
  private analyser: Maybe<AnalyserNode> = null;
  private leftAnalyser: Maybe<AnalyserNode> = null;
  private rightAnalyser: Maybe<AnalyserNode> = null;
  private createdNodes: AudioNode[] = [];
  private correction: any = null;

  async initOnUserGesture() {
    if (this.ctx) return;
    const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx!;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1;

    // Insert an analyser so spectrum UI can attach reliably.
    this.analyser = ctx.createAnalyser();
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Persistent per-ear analysers. These must keep stable object identity so
    // React visualizers don’t get stuck with a disconnected analyser instance
    // after we rebuild the processing graph.
    this.leftAnalyser = ctx.createAnalyser();
    this.rightAnalyser = ctx.createAnalyser();

    // Stable input node for HTMLMediaElement sources.
    // Rewiring MediaElementAudioSourceNode while playing can be glitchy across browsers;
    // keeping it connected to a persistent node makes correction/mute updates reliable.
    this.elementInput = ctx.createGain();
    this.elementInput.gain.value = 1;
  }

  /**
   * Attach an existing <audio> element as the engine's media source.
   * This allows native controls while routing through the processing chain.
   */
  async attachMediaElement(el: HTMLAudioElement) {
    await this.initOnUserGesture();
    if (!this.ctx) throw new Error('AudioContext not initialized');
    if (!this.elementInput) {
      this.elementInput = this.ctx.createGain();
      this.elementInput.gain.value = 1;
    }

    if (this.audioElement === el && this.elementSource) return;

    if (this.elementSource) {
      try { this.elementSource.disconnect(); } catch (e) {}
      this.elementSource = null;
    }

    this.audioElement = el;
    try {
      this.audioElement.crossOrigin = this.audioElement.crossOrigin || 'anonymous';
    } catch (e) {}

    // IMPORTANT: A given HTMLMediaElement can only be used to create one
    // MediaElementAudioSourceNode per AudioContext. Cache and reuse the node.
    const existing = this.elementSourceByEl.get(el);
    if (existing) {
      this.elementSource = existing;
    } else {
      // createMediaElementSource typing can be finicky across libs
      const node = (this.ctx as any).createMediaElementSource(el) as MediaElementAudioSourceNode;
      this.elementSourceByEl.set(el, node);
      this.elementSource = node;
    }

    // Connect element source into a stable input node.
    // Use best-effort disconnect to avoid multiple parallel connections.
    try { this.elementSource.disconnect(this.elementInput); } catch (e) {}
    try { this.elementSource.connect(this.elementInput); } catch (e) {}

    const profileToApply = this.currentProfile || ({ id: 'default', name: 'default', description: '', params: {} } as HearingProfile);
    this.applyProfileToChain(this.elementInput, profileToApply);
  }

  async loadAudio(url: string) {
    await this.initOnUserGesture();
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    this.currentBuffer = await this.ctx.decodeAudioData(ab.slice(0));
  }

  async loadMedia(url: string) {
    await this.initOnUserGesture();
    if (!this.ctx) throw new Error('AudioContext not initialized');
    if (!this.elementInput) {
      this.elementInput = this.ctx.createGain();
      this.elementInput.gain.value = 1;
    }

    if (this.audioElement) {
      try { this.audioElement.pause(); } catch (e) {}
      try { this.audioElement.src = ''; } catch (e) {}
      this.audioElement = null;
    }

    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    this.audioElement = el;

    // create or recreate element source
    if (this.elementSource) {
      try { this.elementSource.disconnect(); } catch (e) {}
      this.elementSource = null;
    }
    // createMediaElementSource typing can be finicky across libs
    this.elementSource = (this.ctx as any).createMediaElementSource(el) as MediaElementAudioSourceNode;

    try { this.elementSource.connect(this.elementInput); } catch (e) {}

    // rebuild chain for current profile or default (always connect)
    const profileToApply = this.currentProfile || ({ id: 'default', name: 'default', description: '', params: {} } as HearingProfile);
    this.applyProfileToChain(this.elementInput, profileToApply);
  }

  getAnalyser(): Maybe<AnalyserNode> {
    return this.analyser || null;
  }

  getEarAnalyser(ear: 'left' | 'right'): Maybe<AnalyserNode> {
    return ear === 'left' ? (this.leftAnalyser || null) : (this.rightAnalyser || null);
  }

  /** Update the volume (linear scalar) of an in-flight pure tone, if any. */
  setPureToneVolume(volume: number) {
    if (!this.ctx || !this.currentToneLevelGain) return;
    const v = Math.max(0, volume);
    const t0 = this.ctx.currentTime;
    try {
      this.currentToneLevelGain.gain.cancelScheduledValues(t0);
      // Smooth a bit to avoid zipper noise.
      this.currentToneLevelGain.gain.setTargetAtTime(v, t0, 0.02);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Gracefully fades out an in-flight pure tone (if any) and stops it.
   * Useful when changing frequency mid-tone to avoid clicks/static.
   */
  async stopPureTone(opts?: { rampSeconds?: number }) {
    if (!this.ctx) return;
    if (!this.currentToneOsc) return;

    const ctx = this.ctx;
    const osc = this.currentToneOsc;
    const envGain = this.currentToneEnvGain;
    const rampSeconds = Math.max(0, opts?.rampSeconds ?? 0.5);
    const t0 = ctx.currentTime;

    try {
      if (envGain) {
        // Hold current value (best-effort) then ramp down.
        try {
          (envGain.gain as any).cancelAndHoldAtTime?.(t0);
        } catch (e) {
          // ignore
        }
        try {
          envGain.gain.cancelScheduledValues(t0);
          envGain.gain.setValueAtTime(envGain.gain.value, t0);
        } catch (e) {
          // ignore
        }
        try {
          envGain.gain.linearRampToValueAtTime(0, t0 + rampSeconds);
        } catch (e) {
          // ignore
        }
      }

      try {
        osc.stop(t0 + rampSeconds + 0.01);
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;

        // Only clear if we're still referring to the same oscillator.
        if (this.currentToneOsc === osc) {
          try { this.currentToneOsc.disconnect(); } catch (e) {}
          this.currentToneOsc = null;
        }
        if (this.currentToneEnvGain) {
          try { this.currentToneEnvGain.disconnect(); } catch (e) {}
          this.currentToneEnvGain = null;
        }
        if (this.currentToneLevelGain) {
          try { this.currentToneLevelGain.disconnect(); } catch (e) {}
          this.currentToneLevelGain = null;
        }
        resolve();
      };

      osc.onended = () => finish();
      // Fallback: ensure we resolve even if onended doesn't fire.
      setTimeout(() => finish(), Math.ceil((rampSeconds + 0.1) * 1000));
    });
  }

  /**
   * Plays a pure sine tone with a symmetric ramp envelope.
   * Total exposure: rampUp + steady + rampDown.
   * Ear routing is hard L/R via a channel merger.
   */
  async playPureTone(opts: {
    frequencyHz: number;
    volume: number; // linear scalar
    ear: "L" | "R";
    rampSeconds?: number;
    steadySeconds?: number;
  }) {
    await this.initOnUserGesture();
    if (!this.ctx || !this.masterGain) throw new Error('AudioContext not initialized');

    const rampSeconds = opts.rampSeconds ?? 0.5;
    const steadySeconds = opts.steadySeconds ?? 1.0;
    const totalSeconds = rampSeconds + steadySeconds + rampSeconds;
    const volume = Math.max(0, opts.volume);

    // Stop any ongoing sources (media/buffer/tone) to avoid overlaps during testing.
    this.stop();

    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = opts.frequencyHz;

    // Separate envelope and level so we can adjust the level live.
    const envGain = ctx.createGain();
    envGain.gain.value = 0;
    const levelGain = ctx.createGain();
    levelGain.gain.value = volume;

    // Ear-specific routing (strict L/R)
    const merger = ctx.createChannelMerger(2);
    const outIndex = opts.ear === 'L' ? 0 : 1;

    osc.connect(envGain);
    envGain.connect(levelGain);
    levelGain.connect(merger, 0, outIndex);

    const profileToApply = this.currentProfile || ({ id: 'default', name: 'default', description: '', params: {} } as HearingProfile);
    this.applyProfileToChain(merger, profileToApply);

    const t0 = ctx.currentTime;
    envGain.gain.cancelScheduledValues(t0);
    envGain.gain.setValueAtTime(0, t0);
    envGain.gain.linearRampToValueAtTime(1, t0 + rampSeconds);
    envGain.gain.setValueAtTime(1, t0 + rampSeconds + steadySeconds);
    envGain.gain.linearRampToValueAtTime(0, t0 + totalSeconds);

    this.currentToneOsc = osc;
    this.currentToneEnvGain = envGain;
    this.currentToneLevelGain = levelGain;

    osc.start(t0);
    osc.stop(t0 + totalSeconds + 0.01);

    await new Promise<void>((resolve) => {
      osc.onended = () => resolve();
    });
  }

  setMasterVolume(value01: number) {
    if (!this.masterGain) return;
    const v = Math.max(0, Math.min(1, value01));
    this.masterGain.gain.value = v;
  }

  setCorrection(params: Partial<import('./profiles').CorrectionParams> | null) {
    this.correction = params || null;
    // rebuild chain with same profile
    const profileToApply = this.currentProfile || ({ id: 'default', name: 'default', description: '', params: {} } as HearingProfile);
    if (this.elementSource) {
      this.applyProfileToChain(this.elementInput || this.elementSource, profileToApply);
    } else if (this.currentSource) {
      // restart buffer source to apply changes
      const wasPlaying = !!this.currentSource;
      this.stop();
      if (wasPlaying) this.play();
    }
  }

  private createFiltersForSpecs(specs: BiquadSpec[]) {
    if (!this.ctx) throw new Error('No audio context');
    return specs.map((s) => {
      const f = this.ctx!.createBiquadFilter();
      // cast to any to avoid narrow DOM type issues across TS versions
      (f as any).type = s.type;
      f.frequency.value = s.frequency;
      // gain is ignored by lowpass/highpass/bandpass, but setting it is harmless.
      f.gain.value = s.gain;
      if (s.Q !== undefined) f.Q.value = s.Q;
      return f;
    });
  }

  private dbToLinear(db: number) {
    return Math.pow(10, db / 20);
  }

  private createNoiseSource() {
    if (!this.ctx) throw new Error('No audio context');
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private createWaveShaper(amount: number) {
    if (!this.ctx) throw new Error('No audio context');
    const ws = this.ctx.createWaveShaper();
    const k = amount * 100;
    const samples = 4096;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    ws.curve = curve;
    ws.oversample = '4x';
    return ws;
  }

  private clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
  }

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private applyProfileToChain(source: AudioNode, profile: HearingProfile) {
    if (!this.ctx || !this.masterGain) throw new Error('No context');
    // Disconnect previously created nodes (but keep masterGain/analyser).
    for (const n of this.createdNodes) {
      try { n.disconnect(); } catch (e) {}
    }
    this.createdNodes = [];
    // Keep ear analysers stable; just ensure they’re disconnected from any prior graph.
    if (this.leftAnalyser) {
      try { this.leftAnalyser.disconnect(); } catch (e) {}
    }
    if (this.rightAnalyser) {
      try { this.rightAnalyser.disconnect(); } catch (e) {}
    }

    // Stop/disconnect side sources.
    if (this.tinnitusOsc) {
      try { this.tinnitusOsc.stop(); } catch (e) {}
      try { this.tinnitusOsc.disconnect(); } catch (e) {}
      this.tinnitusOsc = null;
    }
    if (this.tinnitusGain) {
      try { this.tinnitusGain.disconnect(); } catch (e) {}
      this.tinnitusGain = null;
    }
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch (e) {}
      try { this.noiseSource.disconnect(); } catch (e) {}
      this.noiseSource = null;
    }
    if (this.noiseGain) {
      try { this.noiseGain.disconnect(); } catch (e) {}
      this.noiseGain = null;
    }
    if (this.compressor) {
      try { this.compressor.disconnect(); } catch (e) {}
      this.compressor = null;
    }

    // Disconnect the input source from any previous chain.
    try { (source as any).disconnect?.(); } catch (e) {}

    // Start chain from source -> (optional per-ear) -> compressor -> ... -> masterGain
    let nodeChain: AudioNode = source;

    // combine profile params with correction overlay
    const pProfile = profile.params || {};
    const pCorrection = (this.correction || {}) as import('./profiles').CorrectionParams;
    const forceDualMono = !!(pCorrection as any).forceDualMono;

    const p: any = {
      ...pProfile,
      filters: [...(pProfile.filters || [])],
      earFilters: pProfile.earFilters,
      earGainDb: pProfile.earGainDb,
      compressor: pProfile.compressor ? { ...pProfile.compressor } : undefined,
      tinnitus: pProfile.tinnitus,
      globalGain: pProfile.globalGain,
      distortion: pProfile.distortion,
      mute: pProfile.mute,
      noise: pProfile.noise,
      asymmetric: pProfile.asymmetric,
    };

    // Build correction filters (hearing-aid-like correction should happen before simulated loss).
    const correctionBase: BiquadSpec[] = [];
    if (typeof pCorrection.lowShelfGain === 'number') {
      correctionBase.push({ type: 'lowshelf', frequency: 500, gain: pCorrection.lowShelfGain, Q: 0.7 });
    }
    if (typeof pCorrection.highShelfGain === 'number') {
      correctionBase.push({ type: 'highshelf', frequency: 3000, gain: pCorrection.highShelfGain, Q: 0.7 });
    }
    if (typeof pCorrection.notchFreq === 'number' && typeof pCorrection.notchDepth === 'number') {
      correctionBase.push({ type: 'notch', frequency: pCorrection.notchFreq, gain: pCorrection.notchDepth, Q: 8 });
    }

    const buildEqFilters = (eq: unknown): BiquadSpec[] => {
      if (!eq || typeof eq !== 'object') return [];
      const entries = Object.entries(eq as Record<string, number>)
        .map(([k, v]) => [Number(k), Number(v)] as const)
        .filter(([hz, gainDb]) => Number.isFinite(hz) && Number.isFinite(gainDb))
        .sort((a, b) => a[0] - b[0]);
      return entries.map(([hz, gainDb]) => ({ type: 'peaking', frequency: hz, gain: gainDb, Q: 1.2 }));
    };

    const eqGlobal = buildEqFilters(pCorrection.eqByHzDb);
    const eqByEar = (pCorrection.eqByHzDbByEar || {}) as { left?: Record<number, number>; right?: Record<number, number> };
    const correctionLeft: BiquadSpec[] = [...correctionBase, ...(eqByEar.left ? buildEqFilters(eqByEar.left) : eqGlobal)];
    const correctionRight: BiquadSpec[] = [...correctionBase, ...(eqByEar.right ? buildEqFilters(eqByEar.right) : eqGlobal)];
    const correctionGlobal: BiquadSpec[] = [...correctionBase, ...eqGlobal];

    // apply correction to compressor if provided
    if (typeof pCorrection.compressionAmount === 'number') {
      const amt = Math.max(0, Math.min(100, pCorrection.compressionAmount));
      // map 0-100 to threshold -80..-20 and ratio 1..8
      p.compressor = p.compressor || {};
      p.compressor.threshold = -80 + (amt / 100) * 60;
      p.compressor.ratio = 1 + (amt / 100) * 7;
      p.compressor.attack = p.compressor.attack ?? 0.01;
      p.compressor.release = p.compressor.release ?? 0.2;
    }

    // tinnitus override
    if (pCorrection.tinnitusOn) {
      p.tinnitus = { enabled: true, frequency: pCorrection.tinnitusFreq || 7000, gain: (pCorrection.tinnitusLevel || 0) };
    }

    let baseFilters: BiquadSpec[] = [...correctionGlobal, ...(p.filters || [])];
    const hasEarFilters = !!p.earFilters && ((p.earFilters.left?.length || 0) + (p.earFilters.right?.length || 0) > 0);
    const needsLegacyAsymmetry = !!p.asymmetric;
    const leftAttDb = typeof pCorrection.leftEarAttenuation === 'number' ? pCorrection.leftEarAttenuation : 0;
    const rightAttDb = typeof pCorrection.rightEarAttenuation === 'number' ? pCorrection.rightEarAttenuation : 0;
    const hasEarGain = !!p.earGainDb || leftAttDb !== 0 || rightAttDb !== 0;
    const hasPerEarEq = !!(pCorrection.eqByHzDbByEar && (pCorrection.eqByHzDbByEar.left || pCorrection.eqByHzDbByEar.right));

    const specsEqual = (a: BiquadSpec[] | undefined, b: BiquadSpec[] | undefined) => {
      const aa = a || [];
      const bb = b || [];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i++) {
        const x = aa[i]!;
        const y = bb[i]!;
        if (x.type !== y.type) return false;
        if (x.frequency !== y.frequency) return false;
        if (x.gain !== y.gain) return false;
        if ((x.Q ?? undefined) !== (y.Q ?? undefined)) return false;
      }
      return true;
    };

    // If earFilters are present but identical, we can treat them as a single stereo
    // chain and avoid the splitter/merger path (which can produce left-only audio
    // for mono media sources).
    const hasSymmetricEarFilters =
      hasEarFilters &&
      !needsLegacyAsymmetry &&
      !hasEarGain &&
      !hasPerEarEq &&
      specsEqual((p.earFilters as any)?.left, (p.earFilters as any)?.right);

    if (hasSymmetricEarFilters) {
      baseFilters = [...correctionGlobal, ...(((p.earFilters as any)?.left as BiquadSpec[]) || [])];
    }

    const needsPerEar = (hasEarFilters && !hasSymmetricEarFilters) || needsLegacyAsymmetry || hasEarGain || hasPerEarEq;

    if (needsPerEar) {
      const splitter = this.ctx.createChannelSplitter(2);
      const merger = this.ctx.createChannelMerger(2);
      if (!this.leftAnalyser) this.leftAnalyser = this.ctx.createAnalyser();
      if (!this.rightAnalyser) this.rightAnalyser = this.ctx.createAnalyser();
      // When we split into per-ear processing, mono inputs can otherwise end up
      // in the left channel only. Detect this and route both ears from channel 0.
      const sourceChannelCount = (() => {
        const s: any = source as any;
        // AudioBufferSourceNode: buffer.numberOfChannels is reliable.
        const bufCh = s?.buffer?.numberOfChannels;
        if (typeof bufCh === 'number' && Number.isFinite(bufCh)) return bufCh;
        // MediaElementAudioSourceNode / AudioNode: channelCount is best-effort.
        const ch = s?.channelCount;
        if (typeof ch === 'number' && Number.isFinite(ch)) return ch;
        return 2;
      })();
      const rightInputIndex: 0 | 1 = forceDualMono ? 0 : (sourceChannelCount >= 2 ? 1 : 0);

      this.createdNodes.push(splitter, merger);
      nodeChain.connect(splitter);

      const leftSpecs: BiquadSpec[] = hasEarFilters
        ? [...correctionLeft, ...((p.earFilters.left as BiquadSpec[]) || [])]
        : [...correctionLeft, ...(p.filters || [])];

      const rightSpecs: BiquadSpec[] = hasEarFilters
        ? [...correctionRight, ...((p.earFilters.right as BiquadSpec[]) || [])]
        : (needsLegacyAsymmetry ? correctionRight : [...correctionRight, ...(p.filters || [])]);

      const connectEar = (inIndex: 0 | 1, specs: BiquadSpec[], outIndex: 0 | 1) => {
        let last: AudioNode | null = null;

        if (specs.length > 0) {
          const filters = this.createFiltersForSpecs(specs);
          this.createdNodes.push(...filters);
          splitter.connect(filters[0], inIndex);
          for (let i = 0; i < filters.length - 1; i++) {
            filters[i].connect(filters[i + 1]);
          }
          last = filters[filters.length - 1];
        }

        const earKey = outIndex === 0 ? 'left' : 'right';
        const earDb = (p.earGainDb && (p.earGainDb as any)[earKey]) ? (p.earGainDb as any)[earKey] : 0;
        const extraAtt = outIndex === 0 ? leftAttDb : rightAttDb;
        const totalDb = (earDb || 0) * this.intensity - (extraAtt || 0);

        if (totalDb !== 0) {
          const g = this.ctx!.createGain();
          g.gain.value = this.dbToLinear(totalDb);
          this.createdNodes.push(g);
          if (last) {
            last.connect(g);
          } else {
            splitter.connect(g, inIndex);
          }
          last = g;
        }

        const analyser = outIndex === 0 ? this.leftAnalyser : this.rightAnalyser;
        if (analyser) {
          if (last) {
            last.connect(analyser);
          } else {
            splitter.connect(analyser, inIndex);
          }
          analyser.connect(merger, 0, outIndex);
        } else {
          if (last) {
            last.connect(merger, 0, outIndex);
          } else {
            splitter.connect(merger, inIndex, outIndex);
          }
        }
      };

      // After the upmix node above, we can always treat the input as stereo.
      // This keeps pure-tone audiometry correctly isolated to a single ear.
      connectEar(0, leftSpecs, 0);
      connectEar(rightInputIndex, rightSpecs, 1);

      nodeChain = merger;
    } else {
      if (baseFilters.length > 0) {
        const filters = this.createFiltersForSpecs(baseFilters);
        this.createdNodes.push(...filters);
        for (const f of filters) {
          nodeChain.connect(f);
          nodeChain = f;
        }
      }
    }

    // Optional temporal smoothing (short delay mix).
    if (p.smoothing && p.smoothing.enabled) {
      const mix = this.clamp01(Number(p.smoothing.mix ?? 0));
      const delayMs = this.clamp(Number(p.smoothing.delayMs ?? 0), 0, 50);
      if (mix > 0 && delayMs > 0) {
        const delay = this.ctx.createDelay(0.1);
        delay.delayTime.value = delayMs / 1000;
        const dry = this.ctx.createGain();
        dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain();
        wet.gain.value = mix;
        const sum = this.ctx.createGain();
        sum.gain.value = 1;
        this.createdNodes.push(delay, dry, wet, sum);

        nodeChain.connect(dry);
        nodeChain.connect(delay);
        delay.connect(wet);
        dry.connect(sum);
        wet.connect(sum);
        nodeChain = sum;
      }
    }

    // Optional clarity reduction: HF-focused smearing and/or mild distortion.
    if (p.clarityLoss && p.clarityLoss.enabled) {
      const mix = this.clamp01(Number(p.clarityLoss.mix ?? 0));
      if (mix > 0) {
        const hpHz = this.clamp(Number(p.clarityLoss.highpassHz ?? 3000), 80, 20000);
        const smearMs = this.clamp(Number(p.clarityLoss.smearMs ?? 0), 0, 50);
        const dist = this.clamp(Number(p.clarityLoss.distortionAmount ?? 0), 0, 1);

        const dry = this.ctx.createGain();
        dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain();
        wet.gain.value = mix;
        const sum = this.ctx.createGain();
        sum.gain.value = 1;
        this.createdNodes.push(dry, wet, sum);

        nodeChain.connect(dry);

        const hp = this.ctx.createBiquadFilter();
        (hp as any).type = 'highpass';
        hp.frequency.value = hpHz;
        hp.Q.value = 0.7;
        this.createdNodes.push(hp);
        nodeChain.connect(hp);

        let wetChain: AudioNode = hp;
        if (smearMs > 0) {
          const delay = this.ctx.createDelay(0.1);
          delay.delayTime.value = smearMs / 1000;
          this.createdNodes.push(delay);
          wetChain.connect(delay);
          wetChain = delay;
        }

        if (dist > 0) {
          const ws = this.createWaveShaper(dist * this.intensity);
          this.createdNodes.push(ws);
          wetChain.connect(ws);
          wetChain = ws;
        }

        wetChain.connect(wet);
        dry.connect(sum);
        wet.connect(sum);
        nodeChain = sum;
      }
    }

    // Optional transient softening (conductive-like): a fast, gentle compressor.
    if (p.transientSoftening && p.transientSoftening.enabled) {
      const amt = this.clamp01(Number(p.transientSoftening.amount ?? 0.5));
      if (amt > 0) {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18 - amt * 18; // -18..-36
        comp.knee.value = 18 + amt * 12;
        comp.ratio.value = 1.5 + amt * 3.0; // ~1.5..4.5
        comp.attack.value = 0.001 + amt * 0.004; // 1..5 ms
        comp.release.value = 0.05 + amt * 0.1;
        this.createdNodes.push(comp);
        nodeChain.connect(comp);
        nodeChain = comp;
      }
    }

    // compressor
    if (p.compressor) {
      const comp = this.ctx.createDynamicsCompressor();
      if (p.compressor.threshold !== undefined) comp.threshold.value = p.compressor.threshold;
      if (p.compressor.knee !== undefined) comp.knee.value = p.compressor.knee;
      if (p.compressor.ratio !== undefined) comp.ratio.value = p.compressor.ratio;
      if (p.compressor.attack !== undefined) comp.attack.value = p.compressor.attack;
      if (p.compressor.release !== undefined) comp.release.value = p.compressor.release;
      nodeChain.connect(comp);
      nodeChain = comp;
      this.compressor = comp;
      this.createdNodes.push(comp);
    }

    // distortion
    if (p.distortion) {
      const ws = this.createWaveShaper(p.distortion.amount * this.intensity);
      nodeChain.connect(ws);
      nodeChain = ws;
      this.createdNodes.push(ws);
    }

    // global gain
    if (p.globalGain !== undefined) {
      const g = this.ctx.createGain();
      const linear = this.dbToLinear(p.globalGain * this.intensity);
      g.gain.value = linear;
      nodeChain.connect(g);
      nodeChain = g;
      this.createdNodes.push(g);
    }

    // Optional noise mix
    if (p.noise && p.noise.enabled) {
      const noiseSrc = this.createNoiseSource();
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = Math.max(0, p.noise.gain) * this.intensity;
      this.createdNodes.push(noiseSrc, noiseGain);

      let noiseNode: AudioNode = noiseSrc;
      if (typeof p.noise.highpassHz === 'number' && p.noise.highpassHz > 0) {
        const hp = this.ctx.createBiquadFilter();
        (hp as any).type = 'highpass';
        hp.frequency.value = p.noise.highpassHz;
        this.createdNodes.push(hp);
        noiseSrc.connect(hp);
        noiseNode = hp;
      }

      if (typeof p.noise.lowpassHz === 'number' && p.noise.lowpassHz > 0) {
        const lp = this.ctx.createBiquadFilter();
        (lp as any).type = 'lowpass';
        lp.frequency.value = p.noise.lowpassHz;
        this.createdNodes.push(lp);
        noiseNode.connect(lp);
        noiseNode = lp;
      }

      if (typeof p.noise.bandpassHz === 'number' && p.noise.bandpassHz > 0) {
        const bp = this.ctx.createBiquadFilter();
        (bp as any).type = 'bandpass';
        bp.frequency.value = p.noise.bandpassHz;
        bp.Q.value = 0.9;
        this.createdNodes.push(bp);
        noiseNode.connect(bp);
        noiseNode = bp;
      }

      // Optional modulation (prevents static 'white noise' feel).
      const modHz = typeof p.noise.modulateHz === 'number' ? p.noise.modulateHz : 0;
      const modDepth = this.clamp01(typeof p.noise.modDepth === 'number' ? p.noise.modDepth : 0);
      if (modHz > 0 && modDepth > 0) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = modHz;
        const g = this.ctx.createGain();
        g.gain.value = noiseGain.gain.value * modDepth;
        this.createdNodes.push(osc, g);
        osc.connect(g);
        g.connect(noiseGain.gain);
        osc.start();
      }

      noiseNode.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSrc.start();
      this.noiseSource = noiseSrc;
      this.noiseGain = noiseGain;
    }

    // Final mute gate
    const muteGate = this.ctx.createGain();
    muteGate.gain.value = p.mute ? 0 : 1;
    this.createdNodes.push(muteGate);
    nodeChain.connect(muteGate);
    nodeChain = muteGate;

    nodeChain.connect(this.masterGain);

    // tinnitus oscillator
    if (p.tinnitus && p.tinnitus.enabled) {
      this.tinnitusOsc = this.ctx.createOscillator();
      this.tinnitusOsc.type = 'sine';
      this.tinnitusOsc.frequency.value = p.tinnitus.frequency;
      this.tinnitusGain = this.ctx.createGain();
      this.tinnitusGain.gain.value = p.tinnitus.gain * this.intensity;
      this.tinnitusOsc.connect(this.tinnitusGain).connect(this.masterGain);
      this.tinnitusOsc.start();
      this.createdNodes.push(this.tinnitusOsc, this.tinnitusGain);
    }
  }

  setIntensity(intPerc: number) {
    this.intensity = Math.max(0, Math.min(1, intPerc / 100));
  }

  async setProfile(profile: HearingProfile, intensityPerc: number = 100) {
    this.currentProfile = profile;
    this.setIntensity(intensityPerc);
    // if using element source, rebuild chain live; otherwise restart bufferSource
    if (this.elementSource) {
      this.applyProfileToChain(this.elementInput || this.elementSource, profile);
    } else if (this.currentSource) {
      this.stop();
      await this.play();
    }
  }

  async play() {
    if (!this.ctx) await this.initOnUserGesture();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    // if there is a media element, just play it
    if (this.audioElement) {
      // ensure chain exists
      const profileToApply = this.currentProfile || ({ id: 'default', name: 'default', description: '', params: {} } as HearingProfile);
      if (this.elementSource) this.applyProfileToChain(this.elementInput || this.elementSource, profileToApply);
      try { await this.audioElement.play(); } catch (e) { throw e; }
      return;
    }

    if (!this.currentBuffer) throw new Error('No audio loaded');

    // cleanup any previous
    this.stop();

    const src = this.ctx.createBufferSource();
    src.buffer = this.currentBuffer!;
    this.currentSource = src;

    const profile = this.currentProfile || ({ params: {} } as HearingProfile);
    this.applyProfileToChain(src, profile);

    src.start();
  }

  pause() {
    if (this.audioElement) {
      try { this.audioElement.pause(); } catch (e) {}
      return;
    }
    // no resume support for bufferSource; implement as stop
    this.stop();
  }

  stop() {
    try {
      if (this.audioElement) {
        try { this.audioElement.pause(); } catch (e) {}
        try { this.audioElement.currentTime = 0; } catch (e) {}
      }

      if (this.currentToneOsc) {
        try { this.currentToneOsc.stop(); } catch (e) {}
        try { this.currentToneOsc.disconnect(); } catch (e) {}
        this.currentToneOsc = null;
      }
      if (this.currentToneEnvGain) {
        try { this.currentToneEnvGain.disconnect(); } catch (e) {}
        this.currentToneEnvGain = null;
      }
      if (this.currentToneLevelGain) {
        try { this.currentToneLevelGain.disconnect(); } catch (e) {}
        this.currentToneLevelGain = null;
      }

      if (this.currentSource) {
        try { this.currentSource.stop(); } catch (e) {}
        try { this.currentSource.disconnect(); } catch (e) {}
        this.currentSource = null;
      }

      for (const n of this.createdNodes) {
        try { n.disconnect(); } catch (e) {}
      }
      this.createdNodes = [];

      if (this.tinnitusOsc) {
        try { this.tinnitusOsc.stop(); } catch (e) {}
        try { this.tinnitusOsc.disconnect(); } catch (e) {}
        this.tinnitusOsc = null;
      }
      if (this.tinnitusGain) {
        try { this.tinnitusGain.disconnect(); } catch (e) {}
        this.tinnitusGain = null;
      }
      if (this.noiseSource) {
        try { this.noiseSource.stop(); } catch (e) {}
        try { this.noiseSource.disconnect(); } catch (e) {}
        this.noiseSource = null;
      }
      if (this.noiseGain) {
        try { this.noiseGain.disconnect(); } catch (e) {}
        this.noiseGain = null;
      }
      if (this.compressor) {
        try { this.compressor.disconnect(); } catch (e) {}
        this.compressor = null;
      }
    } catch (err) {
      // swallow
    }
  }

  async destroy() {
    this.stop();
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch (e) {}
      this.masterGain = null;
    }
    if (this.leftAnalyser) {
      try { this.leftAnalyser.disconnect(); } catch (e) {}
      this.leftAnalyser = null;
    }
    if (this.rightAnalyser) {
      try { this.rightAnalyser.disconnect(); } catch (e) {}
      this.rightAnalyser = null;
    }
    if (this.elementInput) {
      try { this.elementInput.disconnect(); } catch (e) {}
      this.elementInput = null;
    }
    if (this.ctx) {
      try { await this.ctx.close(); } catch (e) {}
      this.ctx = null;
    }
  }
}

export const engine = new AudioEngine();
