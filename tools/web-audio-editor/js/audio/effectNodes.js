import { clamp } from "../utils/math.js";

function createLoopBuffer(context, duration, valueAtPhase) {
    const sampleRate = context.sampleRate;
    const length = Math.max(2, Math.ceil(duration * sampleRate));
    const buffer = context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
        data[i] = valueAtPhase(i / length);
    }
    return buffer;
}

function createLoopSource(context, buffer, destination) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start(0);
    return source;
}

function createPitchShifterNode(context, params) {
    const input = context.createGain();
    const output = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const delayA = context.createDelay(0.2);
    const delayB = context.createDelay(0.2);
    const gainA = context.createGain();
    const gainB = context.createGain();
    let modulators = [];
    let currentSemitones = Number(params.semitones ?? 0);
    let currentWindow = Number(params.window ?? 0.08);

    dry.gain.value = 0;
    wet.gain.value = Number(params.wet ?? 1);
    input.connect(dry);
    dry.connect(output);
    input.connect(delayA);
    input.connect(delayB);
    delayA.connect(gainA);
    delayB.connect(gainB);
    gainA.connect(wet);
    gainB.connect(wet);
    wet.connect(output);

    function stopModulators() {
        modulators.forEach((source) => {
            try {
                source.stop();
                source.disconnect();
            } catch (error) {
                // Ignore already-stopped modulation sources.
            }
        });
        modulators = [];
    }

    function phaseShift(phase, amount) {
        return (phase + amount) % 1;
    }

    function crossfade(phase) {
        return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    }

    function applyPitch(semitones, windowSeconds) {
        stopModulators();
        const wetAmount = Number(params.wet ?? wet.gain.value);
        const depth = clamp(Number(windowSeconds) || 0.08, 0.02, 0.16);
        const ratio = 2 ** (Number(semitones) / 12);
        const distance = Math.abs(ratio - 1);
        dry.gain.value = wetAmount >= 1 ? 0 : 1 - wetAmount;
        delayA.delayTime.value = 0;
        delayB.delayTime.value = 0;
        gainA.gain.value = distance < 0.001 ? 1 : 0;
        gainB.gain.value = 0;
        if (distance < 0.001) {
            return;
        }
        const period = clamp(depth / distance, 0.035, 1.2);
        const pitchUp = ratio > 1;
        const delayCurve = (phase) => pitchUp ? depth * (1 - phase) : depth * phase;
        const gainCurveA = (phase) => crossfade(phase);
        const gainCurveB = (phase) => crossfade(phaseShift(phase, 0.5));
        modulators = [
            createLoopSource(context, createLoopBuffer(context, period, delayCurve), delayA.delayTime),
            createLoopSource(context, createLoopBuffer(context, period, (phase) => delayCurve(phaseShift(phase, 0.5))), delayB.delayTime),
            createLoopSource(context, createLoopBuffer(context, period, gainCurveA), gainA.gain),
            createLoopSource(context, createLoopBuffer(context, period, gainCurveB), gainB.gain),
        ];
    }

    applyPitch(currentSemitones, currentWindow);
    return {
        input,
        output,
        params: { wet: wet.gain },
        setParam: (key, value) => {
            if (key === "wet") {
                wet.gain.value = Number(value);
                dry.gain.value = Number(value) >= 1 ? 0 : 1 - Number(value);
            } else if (key === "semitones") {
                currentSemitones = Number(value);
                applyPitch(currentSemitones, currentWindow);
            } else if (key === "window") {
                currentWindow = Number(value);
                applyPitch(currentSemitones, currentWindow);
            }
        },
    };
}

function createBitcrusherFallbackCurve(bits) {
    const steps = 2 ** clamp(Math.round(Number(bits) || 8), 2, 16);
    const curve = new Float32Array(65536);
    for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
}

function createBitcrusherNode(context, params) {
    const input = context.createGain();
    const output = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    let bits = clamp(Math.round(Number(params.bits ?? 8)), 2, 16);
    let reduction = clamp(Math.round(Number(params.reduction ?? 6)), 1, 32);
    wet.gain.value = Number(params.wet ?? 1);
    dry.gain.value = 1 - wet.gain.value;
    input.connect(dry);
    dry.connect(output);

    let shaper = null;
    if (context.createScriptProcessor) {
        const processor = context.createScriptProcessor(1024, 2, 2);
        const held = [0, 0];
        let phase = 0;
        processor.onaudioprocess = (event) => {
            const inputChannels = Math.max(1, event.inputBuffer.numberOfChannels);
            const outputChannels = event.outputBuffer.numberOfChannels;
            const frameCount = event.outputBuffer.length;
            const steps = 2 ** bits;
            const sources = [];
            const targets = [];
            for (let channel = 0; channel < outputChannels; channel += 1) {
                sources.push(event.inputBuffer.getChannelData(Math.min(channel, inputChannels - 1)));
                targets.push(event.outputBuffer.getChannelData(channel));
            }
            for (let i = 0; i < frameCount; i += 1) {
                if (phase % reduction === 0) {
                    for (let channel = 0; channel < outputChannels; channel += 1) {
                        held[channel] = Math.round(sources[channel][i] * steps) / steps;
                    }
                }
                for (let channel = 0; channel < outputChannels; channel += 1) {
                    targets[channel][i] = held[channel];
                }
                phase += 1;
            }
        };
        input.connect(processor);
        processor.connect(wet);
    } else {
        shaper = context.createWaveShaper();
        shaper.curve = createBitcrusherFallbackCurve(bits);
        shaper.oversample = "none";
        input.connect(shaper);
        shaper.connect(wet);
    }
    wet.connect(output);
    return {
        input,
        output,
        params: { wet: wet.gain },
        setParam: (key, value) => {
            if (key === "bits") {
                bits = clamp(Math.round(Number(value)), 2, 16);
                if (shaper) {
                    shaper.curve = createBitcrusherFallbackCurve(bits);
                }
            } else if (key === "reduction") {
                reduction = clamp(Math.round(Number(value)), 1, 32);
            } else if (key === "wet") {
                wet.gain.value = Number(value);
                dry.gain.value = 1 - Number(value);
            }
        },
    };
}

export function buildEffectNode(context, effect) {
    const params = effect.params || {};
    if (effect.type === "gain") {
        const node = context.createGain();
        node.gain.value = Number(params.amount ?? 1);
        return { input: node, output: node, params: { amount: node.gain } };
    }
    if (["lowpass", "highpass", "peaking"].includes(effect.type)) {
        const node = context.createBiquadFilter();
        node.type = effect.type === "peaking" ? "peaking" : effect.type;
        node.frequency.value = Number(params.frequency ?? 1000);
        node.Q.value = Number(params.q ?? 0.7);
        if (effect.type === "peaking") {
            node.gain.value = Number(params.gain ?? 0);
        }
        return { input: node, output: node, params: { frequency: node.frequency, q: node.Q, gain: node.gain } };
    }
    if (effect.type === "parametric-eq") {
        const low = context.createBiquadFilter();
        const mid = context.createBiquadFilter();
        const high = context.createBiquadFilter();
        low.type = "lowshelf";
        mid.type = "peaking";
        high.type = "highshelf";
        low.frequency.value = Number(params.lowFreq ?? 160);
        low.gain.value = Number(params.lowGain ?? 0);
        mid.frequency.value = Number(params.midFreq ?? 1200);
        mid.Q.value = Number(params.midQ ?? 1);
        mid.gain.value = Number(params.midGain ?? 0);
        high.frequency.value = Number(params.highFreq ?? 6000);
        high.gain.value = Number(params.highGain ?? 0);
        low.connect(mid);
        mid.connect(high);
        return {
            input: low,
            output: high,
            params: {
                lowFreq: low.frequency,
                lowGain: low.gain,
                midFreq: mid.frequency,
                midQ: mid.Q,
                midGain: mid.gain,
                highFreq: high.frequency,
                highGain: high.gain,
            },
        };
    }
    if (effect.type === "compressor") {
        const node = context.createDynamicsCompressor();
        node.threshold.value = Number(params.threshold ?? -24);
        node.ratio.value = Number(params.ratio ?? 4);
        node.attack.value = Number(params.attack ?? 0.003);
        node.release.value = Number(params.release ?? 0.25);
        return {
            input: node,
            output: node,
            reduction: node,
            params: {
                threshold: node.threshold,
                ratio: node.ratio,
                attack: node.attack,
                release: node.release,
            },
        };
    }
    if (effect.type === "limiter") {
        const node = context.createDynamicsCompressor();
        node.threshold.value = Number(params.threshold ?? -1);
        node.knee.value = 0;
        node.ratio.value = 20;
        node.attack.value = 0.001;
        node.release.value = Number(params.release ?? 0.08);
        return {
            input: node,
            output: node,
            reduction: node,
            params: {
                threshold: node.threshold,
                release: node.release,
            },
        };
    }
    if (effect.type === "delay") {
        const input = context.createGain();
        const output = context.createGain();
        const dry = context.createGain();
        const delay = context.createDelay(5);
        const lpf = context.createBiquadFilter();
        const feedback = context.createGain();
        const wet = context.createGain();
        dry.gain.value = Number(params.dry ?? 1);
        delay.delayTime.value = Number(params.delayTime ?? 0.25);
        lpf.type = "lowpass";
        lpf.frequency.value = Number(params.damping ?? 8000);
        feedback.gain.value = Number(params.feedback ?? 0.28);
        wet.gain.value = Number(params.wet ?? 0.35);
        input.connect(dry);
        dry.connect(output);
        input.connect(delay);
        delay.connect(lpf);
        lpf.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(output);
        return {
            input,
            output,
            params: { delayTime: delay.delayTime, feedback: feedback.gain, damping: lpf.frequency, dry: dry.gain, wet: wet.gain },
        };
    }
    if (effect.type === "stereo-delay") {
        // Both Ping-Pong and Wide share the same node graph.
        // Routing is controlled by four gain nodes:
        //   crossLR / crossRL : cross-channel feedback (Ping-Pong)
        //   selfLL  / selfRR  : same-channel feedback  (Wide)
        let currentType = params.delayType ?? "ping-pong";
        let currentFeedback = Number(params.feedback ?? 0.28);
        const input = context.createGain();
        const output = context.createGain();
        const dry = context.createGain();
        const delayL = context.createDelay(5);
        const delayR = context.createDelay(5);
        const lpfL = context.createBiquadFilter();
        const lpfR = context.createBiquadFilter();
        const crossLR = context.createGain();   // L→R feedback (ping-pong)
        const crossRL = context.createGain();   // R→L feedback (ping-pong)
        const selfLL = context.createGain();    // L→L feedback (wide)
        const selfRR = context.createGain();    // R→R feedback (wide)
        const panL = context.createStereoPanner();
        const panR = context.createStereoPanner();
        const wet = context.createGain();
        const dampFreq = Number(params.damping ?? 8000);
        const delayTime = Number(params.delayTime ?? 0.25);
        dry.gain.value = Number(params.dry ?? 1);
        delayL.delayTime.value = delayTime;
        delayR.delayTime.value = delayTime;
        lpfL.type = "lowpass";
        lpfL.frequency.value = dampFreq;
        lpfR.type = "lowpass";
        lpfR.frequency.value = dampFreq;
        wet.gain.value = Number(params.wet ?? 0.35);
        function applyType(type, fb) {
            if (type === "ping-pong") {
                panL.pan.value = -1;
                panR.pan.value = 1;
                crossLR.gain.value = fb;
                crossRL.gain.value = fb;
                selfLL.gain.value = 0;
                selfRR.gain.value = 0;
            } else {
                panL.pan.value = -0.8;
                panR.pan.value = 0.8;
                crossLR.gain.value = 0;
                crossRL.gain.value = 0;
                selfLL.gain.value = fb;
                selfRR.gain.value = fb;
            }
        }
        applyType(currentType, currentFeedback);
        // Signal flow
        input.connect(dry);
        dry.connect(output);
        input.connect(delayL);
        input.connect(delayR);
        delayL.connect(lpfL);
        delayR.connect(lpfR);
        lpfL.connect(crossLR);   // L → R (ping-pong)
        lpfL.connect(selfLL);    // L → L (wide)
        lpfR.connect(crossRL);   // R → L (ping-pong)
        lpfR.connect(selfRR);    // R → R (wide)
        crossLR.connect(delayR);
        selfLL.connect(delayL);
        crossRL.connect(delayL);
        selfRR.connect(delayR);
        delayL.connect(panL);
        delayR.connect(panR);
        panL.connect(wet);
        panR.connect(wet);
        wet.connect(output);
        return {
            input,
            output,
            params: {
                delayTime: delayL.delayTime,
                dry: dry.gain,
                wet: wet.gain,
            },
            setParam: (key, value) => {
                if (key === "delayTime") {
                    delayL.delayTime.value = Number(value);
                    delayR.delayTime.value = Number(value);
                } else if (key === "feedback") {
                    currentFeedback = Number(value);
                    applyType(currentType, currentFeedback);
                } else if (key === "damping") {
                    lpfL.frequency.value = Number(value);
                    lpfR.frequency.value = Number(value);
                } else if (key === "delayType") {
                    currentType = value;
                    applyType(currentType, currentFeedback);
                }
            },
        };
    }
    if (effect.type === "reverb") {
        let currentDecay = Number(params.decay ?? 2.2);
        let currentType = params.reverbType ?? "room";
        const input = context.createGain();
        const output = context.createGain();
        const dry = context.createGain();
        const preDelay = context.createDelay(1);
        const convolver = context.createConvolver();
        const wet = context.createGain();
        dry.gain.value = Number(params.dry ?? 1);
        wet.gain.value = Number(params.wet ?? 0.28);
        preDelay.delayTime.value = Number(params.preDelay ?? 0.02);
        convolver.buffer = createReverbImpulse(context, currentDecay, currentType);
        input.connect(dry);
        dry.connect(output);
        input.connect(preDelay);
        preDelay.connect(convolver);
        convolver.connect(wet);
        wet.connect(output);
        return {
            input,
            output,
            params: {
                preDelay: preDelay.delayTime,
                dry: dry.gain,
                wet: wet.gain,
            },
            setParam: (key, value) => {
                if (key === "decay") {
                    currentDecay = Number(value);
                    convolver.buffer = createReverbImpulse(context, currentDecay, currentType);
                } else if (key === "reverbType") {
                    currentType = value;
                    convolver.buffer = createReverbImpulse(context, currentDecay, currentType);
                }
            },
        };
    }
    if (effect.type === "pitch-shifter") {
        return createPitchShifterNode(context, params);
    }
    if (effect.type === "bitcrusher") {
        return createBitcrusherNode(context, params);
    }
    const passthrough = context.createGain();
    return { input: passthrough, output: passthrough, params: {} };
}

function createReverbImpulse(context, decay, type = "room") {
    const sampleRate = context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * clamp(decay, 0.2, 8)));
    const impulse = context.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i += 1) {
            const t = i / length;
            let envelope;
            switch (type) {
                case "hall":
                    // Smooth, gradual decay — concert hall character
                    envelope = (1 - t) ** 1.5;
                    break;
                case "plate":
                    // Dense initial burst then faster rolloff — metallic plate character
                    envelope = Math.exp(-4 * t) * (1 + 2 * Math.exp(-60 * t));
                    break;
                case "cathedral":
                    // Very slow linear-ish decay — enormous space
                    envelope = (1 - t) ** 0.8;
                    break;
                case "spring":
                    // Oscillating decay — spring reverb "boing" character
                    envelope = (1 - t) ** 2.2 * (0.5 + 0.5 * Math.abs(Math.cos(Math.PI * 18 * t ** 0.6)));
                    break;
                default: // room
                    envelope = (1 - t) ** 2.2;
            }
            data[i] = (Math.random() * 2 - 1) * envelope;
        }
    }
    return impulse;
}
