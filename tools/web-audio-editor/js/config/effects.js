export const effectDefinitions = {
    gain: {
        label: "Gain",
        params: {
            amount: { label: "量", min: 0, max: 2, step: 0.01, default: 1 },
        },
    },
    lowpass: {
        label: "Lowpass",
        params: {
            frequency: { label: "Hz", min: 40, max: 20000, step: 1, default: 8000 },
            q: { label: "Q", min: 0.1, max: 24, step: 0.1, default: 0.7 },
        },
    },
    highpass: {
        label: "Highpass",
        params: {
            frequency: { label: "Hz", min: 20, max: 12000, step: 1, default: 120 },
            q: { label: "Q", min: 0.1, max: 24, step: 0.1, default: 0.7 },
        },
    },
    peaking: {
        label: "Peaking EQ",
        params: {
            frequency: { label: "Hz", min: 40, max: 16000, step: 1, default: 1200 },
            q: { label: "Q", min: 0.1, max: 18, step: 0.1, default: 1 },
            gain: { label: "dB", min: -24, max: 24, step: 0.1, default: 0 },
        },
    },
    "parametric-eq": {
        label: "Parametric EQ",
        params: {
            lowFreq: { label: "Low Hz", min: 40, max: 1000, step: 1, default: 160 },
            lowGain: { label: "Low dB", min: -18, max: 18, step: 0.1, default: 0 },
            midFreq: { label: "Mid Hz", min: 120, max: 8000, step: 1, default: 1200 },
            midQ: { label: "Mid Q", min: 0.1, max: 18, step: 0.1, default: 1 },
            midGain: { label: "Mid dB", min: -18, max: 18, step: 0.1, default: 0 },
            highFreq: { label: "High Hz", min: 1000, max: 16000, step: 1, default: 6000 },
            highGain: { label: "High dB", min: -18, max: 18, step: 0.1, default: 0 },
        },
    },
    compressor: {
        label: "Compressor",
        params: {
            threshold: { label: "Th", min: -80, max: 0, step: 1, default: -24 },
            knee: { label: "Knee", min: 0, max: 40, step: 0.1, default: 0 },
            ratio: { label: "Ratio", min: 1, max: 20, step: 0.1, default: 4 },
            attack: { label: "Atk", min: 0, max: 1, step: 0.005, default: 0.003 },
            release: { label: "Rel", min: 0.01, max: 1, step: 0.01, default: 0.25 },
            outputGain: { label: "Out dB", min: -24, max: 24, step: 0.1, default: 0 },
        },
    },
    limiter: {
        label: "Limiter",
        params: {
            threshold: { label: "Ceil", min: -24, max: 0, step: 0.1, default: -1 },
            release: { label: "Rel", min: 0.01, max: 1, step: 0.01, default: 0.08 },
            outputGain: { label: "Out dB", min: -24, max: 24, step: 0.1, default: 0 },
        },
    },
    delay: {
        label: "Delay",
        params: {
            delayTime: { label: "Time", min: 0, max: 2, step: 0.01, default: 0.25 },
            feedback: { label: "Fdbk", min: 0, max: 0.9, step: 0.01, default: 0.28 },
            damping: { label: "Damp", min: 500, max: 20000, step: 100, default: 8000 },
            dry: { label: "Dry", min: 0, max: 1, step: 0.01, default: 1 },
            wet: { label: "Wet", min: 0, max: 1, step: 0.01, default: 0.35 },
        },
    },
    "stereo-delay": {
        label: "Stereo Delay",
        params: {
            delayType: {
                label: "タイプ",
                kind: "select",
                options: [
                    { value: "ping-pong", label: "Ping-Pong" },
                    { value: "wide", label: "Wide" },
                ],
                default: "ping-pong",
            },
            delayTime: { label: "Time", min: 0, max: 2, step: 0.01, default: 0.25 },
            feedback: { label: "Fdbk", min: 0, max: 0.9, step: 0.01, default: 0.28 },
            damping: { label: "Damp", min: 500, max: 20000, step: 100, default: 8000 },
            dry: { label: "Dry", min: 0, max: 1, step: 0.01, default: 1 },
            wet: { label: "Wet", min: 0, max: 1, step: 0.01, default: 0.35 },
        },
    },
    reverb: {
        label: "Reverb",
        params: {
            reverbType: {
                label: "タイプ",
                kind: "select",
                options: [
                    { value: "room", label: "Room（部屋）" },
                    { value: "hall", label: "Hall（ホール）" },
                    { value: "plate", label: "Plate（プレート）" },
                    { value: "cathedral", label: "Cathedral（大聖堂）" },
                    { value: "spring", label: "Spring（スプリング）" },
                ],
                default: "room",
            },
            decay: { label: "Decay", min: 0.2, max: 8, step: 0.1, default: 2.2 },
            preDelay: { label: "Pre", min: 0, max: 0.2, step: 0.005, default: 0.02 },
            dry: { label: "Dry", min: 0, max: 1, step: 0.01, default: 1 },
            wet: { label: "Wet", min: 0, max: 1, step: 0.01, default: 0.28 },
        },
    },
    "pitch-shifter": {
        label: "Pitch Shifter",
        params: {
            semitones: { label: "Semi", min: -12, max: 12, step: 0.1, default: 0 },
            window: { label: "Win", min: 0.02, max: 0.16, step: 0.005, default: 0.08 },
            wet: { label: "Wet", min: 0, max: 1, step: 0.01, default: 1 },
        },
    },
    bitcrusher: {
        label: "Bitcrusher",
        params: {
            bits: { label: "Bits", min: 2, max: 16, step: 1, default: 8 },
            reduction: { label: "Rate", min: 1, max: 32, step: 1, default: 6 },
            wet: { label: "Wet", min: 0, max: 1, step: 0.01, default: 1 },
        },
    },
};
