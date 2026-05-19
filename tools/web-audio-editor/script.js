const $ = (id) => document.getElementById(id);

const refs = {
    fileInput: $("fileInput"),
    fileButton: $("fileButton"),
    dropZone: $("dropZone"),
    fileName: $("fileName"),
    durationLabel: $("durationLabel"),
    fileType: $("fileType"),
    sampleRateLabel: $("sampleRateLabel"),
    playBtn: $("playBtn"),
    startBtn: $("startBtn"),
    loopToggleBtn: $("loopToggleBtn"),
    outputLeftBtn: $("outputLeftBtn"),
    outputRightBtn: $("outputRightBtn"),
    undoBtn: $("undoBtn"),
    redoBtn: $("redoBtn"),
    cutBtn: $("cutBtn"),
    copyBtn: $("copyBtn"),
    pasteBtn: $("pasteBtn"),
    trimRangeBtn: $("trimRangeBtn"),
    silenceRangeBtn: $("silenceRangeBtn"),
    duplicateBtn: $("duplicateBtn"),
    silenceBtn: $("silenceBtn"),
    quickNormalizeBtn: $("quickNormalizeBtn"),
    quickFadeInBtn: $("quickFadeInBtn"),
    quickFadeOutBtn: $("quickFadeOutBtn"),
    quickPanel: $("quickPanel"),
    quickPanelLabel: $("quickPanelLabel"),
    quickCloseBtn: $("quickCloseBtn"),
    normalizeGainField: $("normalizeGainField"),
    normalizeGainInput: $("normalizeGainInput"),
    fadeCurveField: $("fadeCurveField"),
    quickFadeCurveSelect: $("quickFadeCurveSelect"),
    silenceLengthField: $("silenceLengthField"),
    silenceLengthInput: $("silenceLengthInput"),
    quickPanelHint: $("quickPanelHint"),
    quickApplyBtn: $("quickApplyBtn"),
    waveFrame: $("waveFrame"),
    waveCanvas: $("waveCanvas"),
    clipLayer: $("clipLayer"),
    waveSelection: $("waveSelection"),
    playhead: $("playhead"),
    timeLabel: $("timeLabel"),
    selectionLabel: $("selectionLabel"),
    waveInfo: $("waveInfo"),
    selectionStartInput: $("selectionStartInput"),
    selectionEndInput: $("selectionEndInput"),
    playheadInput: $("playheadInput"),
    vuLeft: $("vuLeft"),
    vuRight: $("vuRight"),
    vuLeftPeak: $("vuLeftPeak"),
    vuRightPeak: $("vuRightPeak"),
    vuLeftLabel: $("vuLeftLabel"),
    vuRightLabel: $("vuRightLabel"),
    trackVolumeRange: $("trackVolumeRange"),
    trackVolumeInput: $("trackVolumeInput"),
    trackPanRange: $("trackPanRange"),
    trackPanInput: $("trackPanInput"),
    centerPanBtn: $("centerPanBtn"),
    effectPicker: $("effectPicker"),
    effectPickerBtn: $("effectPickerBtn"),
    effectMenu: $("effectMenu"),
    effectsList: $("effectsList"),
    exportFormatSelect: $("exportFormatSelect"),
    exportSampleRateSelect: $("exportSampleRateSelect"),
    exportChannelSelect: $("exportChannelSelect"),
    exportBitDepthField: $("exportBitDepthField"),
    exportBitDepthSelect: $("exportBitDepthSelect"),
    exportBitrateField: $("exportBitrateField"),
    exportBitrateSelect: $("exportBitrateSelect"),
    exportIncludeTailCheckbox: $("exportIncludeTailCheckbox"),
    exportBtn: $("exportBtn"),
    exportStatus: $("exportStatus"),
    statusDot: $("statusDot"),
    statusText: $("statusText"),
};

const outputProfiles = {
    wav: { ext: "wav", mime: "audio/wav", codec: null, bitrate: false },
    mp3: { ext: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame"], bitrate: true },
    m4a: { ext: "m4a", mime: "audio/mp4", codec: ["-c:a", "aac"], bitrate: true },
    ogg: { ext: "ogg", mime: "audio/ogg", codec: ["-c:a", "libopus"], bitrate: true },
    flac: { ext: "flac", mime: "audio/flac", codec: ["-c:a", "flac"], bitrate: false },
};

const effectDefinitions = {
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
            ratio: { label: "Ratio", min: 1, max: 20, step: 0.1, default: 4 },
            attack: { label: "Atk", min: 0, max: 1, step: 0.005, default: 0.003 },
            release: { label: "Rel", min: 0.01, max: 1, step: 0.01, default: 0.25 },
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

const editControls = [
    refs.playBtn,
    refs.startBtn,
    refs.loopToggleBtn,
    refs.outputLeftBtn,
    refs.outputRightBtn,
    refs.cutBtn,
    refs.copyBtn,
    refs.silenceRangeBtn,
    refs.trimRangeBtn,
    refs.duplicateBtn,
    refs.silenceBtn,
    refs.quickNormalizeBtn,
    refs.quickFadeInBtn,
    refs.quickFadeOutBtn,
    refs.selectionStartInput,
    refs.selectionEndInput,
    refs.playheadInput,
    refs.trackVolumeRange,
    refs.trackVolumeInput,
    refs.trackPanRange,
    refs.trackPanInput,
    refs.centerPanBtn,
    refs.effectPickerBtn,
    refs.exportFormatSelect,
    refs.exportSampleRateSelect,
    refs.exportChannelSelect,
    refs.exportBitDepthSelect,
    refs.exportBitrateSelect,
    refs.exportIncludeTailCheckbox,
    refs.exportBtn,
];

let ffmpeg = null;
let ffmpegReady = false;
let audioCtx = null;
let project = null;
let sources = new Map();
let currentFile = null;
let history = [];
let redoStack = [];
let clipboard = null;
let isBusy = false;
let isPlaying = false;
let playbackOffset = 0;
let playbackStartedAt = 0;
let playbackEnd = null;
let loopEnabled = false;
let playbackLoop = false;
let playbackLoopStart = 0;
let animationFrame = null;
let activeSources = [];
let liveEffects = new Map();
let liveMixer = null;
let liveOutputChannels = null;
let selection = { start: 0, end: 0 };
let dragState = null;
let meterDataLeft = null;
let meterDataRight = null;
let quickMode = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pad = (value, length = 2) => String(value).padStart(length, "0");
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const EXPORT_TAIL_MAX_SECONDS = 60;
const EXPORT_TAIL_SILENCE_SECONDS = 1.5;
const EXPORT_TAIL_THRESHOLD_DB = -80;
const EXPORT_TAIL_ANALYSIS_WINDOW_SECONDS = 0.05;
const SELECTION_HANDLE_HIT_PX = 10;

function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "00:00:00.000";
    }
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

function parseTimecode(value) {
    const cleaned = String(value || "").trim().replace(",", ".");
    if (!cleaned) {
        return null;
    }
    const parts = cleaned.split(":");
    if (parts.length > 3 || parts.some((part) => part.trim() === "")) {
        return null;
    }
    let seconds = 0;
    let multiplier = 1;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const number = Number(parts[i]);
        if (!Number.isFinite(number) || number < 0) {
            return null;
        }
        seconds += number * multiplier;
        multiplier *= 60;
    }
    return seconds;
}

function getProjectDuration() {
    if (!project) {
        return 0;
    }
    return project.tracks.reduce((trackMax, track) => {
        const clipMax = track.clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
        return Math.max(trackMax, clipMax);
    }, 0);
}

function getTrack() {
    return project?.tracks[0] || null;
}

function getOutputChannels(track = getTrack()) {
    if (!track) {
        return { left: true, right: true };
    }
    if (!track.outputChannels) {
        track.outputChannels = { left: true, right: true };
    }
    if (!track.outputChannels.left && !track.outputChannels.right) {
        track.outputChannels.left = true;
    }
    return track.outputChannels;
}

function setStatus(message, type = "idle") {
    refs.statusText.textContent = message;
    refs.statusDot.classList.toggle("is-active", type === "active");
    refs.statusDot.classList.toggle("is-error", type === "error");
}

function setBusy(state) {
    isBusy = state;
    document.body.classList.toggle("is-busy", state);
    refs.fileButton.disabled = state;
    refs.dropZone.style.pointerEvents = state ? "none" : "";
    updateControls();
}

function updateControls() {
    const ready = Boolean(project && getProjectDuration() > 0);
    const hasSelection = ready && selection.end > selection.start;
    if (!hasSelection && loopEnabled) {
        loopEnabled = false;
    }
    editControls.forEach((control) => {
        control.disabled = isBusy || !ready;
    });
    refs.loopToggleBtn.disabled = isBusy || !hasSelection;
    syncLoopToggle();
    refs.undoBtn.disabled = isBusy || history.length === 0;
    refs.redoBtn.disabled = isBusy || redoStack.length === 0;
    refs.pasteBtn.disabled = isBusy || !ready || !clipboard;
    updateExportFields();
}

function updateExportFields() {
    const profile = outputProfiles[refs.exportFormatSelect.value] || outputProfiles.wav;
    const isWav = profile.ext === "wav";
    refs.exportBitDepthField.style.opacity = isWav ? "1" : "0.48";
    refs.exportBitDepthSelect.disabled = isBusy || !project || !isWav;
    refs.exportBitrateField.style.opacity = profile.bitrate ? "1" : "0.48";
    refs.exportBitrateSelect.disabled = isBusy || !project || !profile.bitrate;
    refs.exportBtn.textContent = "書き出し";
}

function cloneProject(value = project) {
    return JSON.parse(JSON.stringify(value));
}

function pushHistory() {
    if (!project) {
        return;
    }
    history.push(cloneProject());
    if (history.length > 60) {
        history.shift();
    }
    redoStack = [];
    updateControls();
}

function restoreProject(snapshot) {
    stopPlayback();
    project = cloneProject(snapshot);
    normalizeClips();
    updateAfterProjectChange();
}

function normalizeClips() {
    const track = getTrack();
    if (!track) {
        return;
    }
    track.clips = track.clips
        .filter((clip) => clip.duration > 0.001)
        .sort((a, b) => a.startTime - b.startTime);
}

function updateAfterProjectChange() {
    const duration = getProjectDuration();
    selection.start = clamp(selection.start, 0, duration);
    selection.end = clamp(selection.end, 0, duration);
    playbackOffset = clamp(playbackOffset, 0, duration);
    renderEffects();
    syncMixerControls();
    syncOutputChannelButtons();
    drawWaveform();
    updateLabels();
    updateControls();
}

function updateLabels() {
    const duration = getProjectDuration();
    const current = getCurrentPlaybackTime();
    refs.durationLabel.textContent = duration ? formatTime(duration) : "-";
    refs.timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    refs.playheadInput.value = formatTime(current);
    if (selection.end > selection.start) {
        refs.selectionLabel.textContent = `選択: ${formatTime(selection.start)} - ${formatTime(selection.end)} (${formatTime(selection.end - selection.start)})`;
    } else {
        refs.selectionLabel.textContent = "選択: -";
    }
    if (document.activeElement !== refs.selectionStartInput) {
        refs.selectionStartInput.value = formatTime(selection.start);
    }
    if (document.activeElement !== refs.selectionEndInput) {
        refs.selectionEndInput.value = formatTime(selection.end);
    }
    const selectionLeft = duration ? (selection.start / duration) * 100 : 0;
    const selectionWidth = duration ? ((selection.end - selection.start) / duration) * 100 : 0;
    refs.waveSelection.style.left = `${selectionLeft}%`;
    refs.waveSelection.style.width = `${Math.max(0, selectionWidth)}%`;
    refs.waveSelection.classList.toggle("has-selection", selection.end > selection.start);
    refs.playhead.style.left = duration ? `${clamp(current / duration, 0, 1) * 100}%` : "0%";
}

function getCurrentPlaybackTime() {
    if (!isPlaying || !audioCtx) {
        return playbackOffset;
    }
    return clamp(playbackOffset + audioCtx.currentTime - playbackStartedAt, 0, playbackEnd ?? getProjectDuration());
}

function setSelection(start, end) {
    const duration = getProjectDuration();
    selection.start = clamp(Math.min(start, end), 0, duration);
    selection.end = clamp(Math.max(start, end), 0, duration);
    updateLabels();
    updateControls();
}

function syncLoopToggle() {
    refs.loopToggleBtn.classList.toggle("is-on", loopEnabled);
    refs.loopToggleBtn.setAttribute("aria-pressed", String(loopEnabled));
}

function toggleLoopEnabled() {
    if (selection.end <= selection.start) {
        loopEnabled = false;
        syncLoopToggle();
        return;
    }
    loopEnabled = !loopEnabled;
    syncLoopToggle();
    if (isPlaying) {
        const current = getCurrentPlaybackTime();
        if (loopEnabled) {
            const nextStart = current >= selection.start && current < selection.end ? current : selection.start;
            startPlayback(nextStart, selection.end, true, selection.start);
        } else if (playbackLoop) {
            startPlayback(current, getProjectDuration(), false);
        }
    }
}

function setPlayhead(time) {
    const duration = getProjectDuration();
    playbackOffset = clamp(time, 0, duration);
    if (isPlaying) {
        startPlayback(playbackOffset, playbackEnd, playbackLoop, playbackLoopStart);
    }
    updateLabels();
}

function commitSelectionStartInput() {
    const value = parseTimecode(refs.selectionStartInput.value);
    if (value === null) {
        setStatus("選択開始の時刻形式を確認してください。", "error");
        updateLabels();
        return;
    }
    setSelection(value, selection.end);
}

function commitSelectionEndInput() {
    const value = parseTimecode(refs.selectionEndInput.value);
    if (value === null) {
        setStatus("選択終了の時刻形式を確認してください。", "error");
        updateLabels();
        return;
    }
    setSelection(selection.start, value);
}

function commitPlayheadInput() {
    const value = parseTimecode(refs.playheadInput.value);
    if (value === null) {
        setStatus("再生位置の時刻形式を確認してください。", "error");
        updateLabels();
        return;
    }
    setPlayhead(value);
}

function bindTimeInput(input, commit) {
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
            input.blur();
        }
    });
}

async function loadFile(file) {
    if (!file || isBusy) {
        return;
    }
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|ogg|webm|m4a|aac|flac)$/i.test(file.name)) {
        setStatus("音声ファイルを選択してください。", "error");
        return;
    }
    setBusy(true);
    stopPlayback();
    setStatus("音声を読み込み中...", "active");
    refs.exportStatus.textContent = "未処理";
    try {
        const context = ensureAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
        const sourceId = makeId("source");
        sources = new Map([[sourceId, { id: sourceId, name: file.name, buffer }]]);
        currentFile = file;
        project = {
            sampleRate: buffer.sampleRate,
            tracks: [{
                id: makeId("track"),
                name: "Track 1",
                clips: [{
                    id: makeId("clip"),
                    sourceId,
                    startTime: 0,
                    sourceStartTime: 0,
                    duration: buffer.duration,
                    gain: 1,
                    fadeIn: 0,
                    fadeOut: 0,
                }],
                effects: [],
                volume: 1,
                pan: 0,
                outputChannels: { left: true, right: true },
                solo: false,
            }],
        };
        history = [];
        redoStack = [];
        clipboard = null;
        playbackOffset = 0;
        selection = { start: 0, end: buffer.duration };
        refs.fileName.textContent = file.name;
        refs.fileType.textContent = file.type || "不明";
        refs.sampleRateLabel.textContent = `${buffer.sampleRate.toLocaleString()} Hz / ${buffer.numberOfChannels} ch`;
        refs.waveInfo.textContent = `${buffer.numberOfChannels === 1 ? "mono" : "stereo"} / ${Math.round(buffer.duration * buffer.sampleRate).toLocaleString()} samples`;
        setStatus("読み込みが完了しました。", "active");
        updateAfterProjectChange();
    } catch (error) {
        console.error(error);
        setStatus(`読み込みに失敗しました: ${error.message}`, "error");
    } finally {
        refs.fileInput.value = "";
        setBusy(false);
    }
}

function drawWaveform() {
    const canvas = refs.waveCanvas;
    const frame = refs.waveFrame;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, frame.clientWidth || 900);
    const height = 240;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d1525";
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    const duration = getProjectDuration();
    if (!project || !duration) {
        refs.clipLayer.innerHTML = "";
        return;
    }

    const channels = getMaxChannelCount();
    const laneHeight = height / channels;
    for (let channel = 0; channel < channels; channel += 1) {
        drawChannelWave(ctx, width, laneHeight, channel, channels, duration);
    }
    renderClipBlocks(duration);
    updateLabels();
}

function drawGrid(ctx, width, height) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
        const x = (width / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}

function getMaxChannelCount() {
    let max = 1;
    sources.forEach(({ buffer }) => {
        max = Math.max(max, buffer.numberOfChannels);
    });
    return Math.min(max, 2);
}

function drawChannelWave(ctx, width, laneHeight, channel, channels, duration) {
    const top = channel * laneHeight;
    const mid = top + laneHeight / 2;
    const amp = laneHeight * 0.38;
    ctx.strokeStyle = channel === 0 ? "rgba(56, 189, 248, 0.82)" : "rgba(34, 211, 238, 0.72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
        const t0 = (x / width) * duration;
        const t1 = ((x + 1) / width) * duration;
        const peak = getTimelinePeak(t0, t1, channel);
        ctx.moveTo(x, mid + peak.min * amp);
        ctx.lineTo(x, mid + peak.max * amp);
    }
    ctx.stroke();
    if (channels > 1) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(0, top + laneHeight);
        ctx.lineTo(width, top + laneHeight);
        ctx.stroke();
    }
}

function getTimelinePeak(start, end, channel) {
    const track = getTrack();
    if (!track) {
        return { min: 0, max: 0 };
    }
    let min = 0;
    let max = 0;
    const steps = 8;
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd <= start || clip.startTime >= end) {
            continue;
        }
        for (let i = 0; i < steps; i += 1) {
            const t = start + ((end - start) * (i + 0.5)) / steps;
            if (t < clip.startTime || t > clipEnd) {
                continue;
            }
            const sample = getClipSample(clip, t, channel);
            min = Math.min(min, sample);
            max = Math.max(max, sample);
        }
    }
    return { min, max };
}

function getClipSample(clip, timelineTime, channel) {
    const source = sources.get(clip.sourceId);
    if (!source) {
        return 0;
    }
    const buffer = source.buffer;
    const sourceTime = clip.sourceStartTime + (timelineTime - clip.startTime);
    const index = Math.floor(sourceTime * buffer.sampleRate);
    if (index < 0 || index >= buffer.length) {
        return 0;
    }
    const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
    const fade = getFadeMultiplier(clip, timelineTime);
    return buffer.getChannelData(sourceChannel)[index] * clip.gain * fade;
}

function getFadeMultiplier(clip, timelineTime) {
    const local = timelineTime - clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    let gain = 1;
    if (clip.fadeIn > 0 && local < clip.fadeIn) {
        gain *= applyFadeCurve(clamp(local / clip.fadeIn, 0, 1), clip.fadeInCurve || "linear");
    }
    if (clip.fadeOut > 0 && timelineTime > clipEnd - clip.fadeOut) {
        gain *= applyFadeCurve(clamp((clipEnd - timelineTime) / clip.fadeOut, 0, 1), clip.fadeOutCurve || "linear");
    }
    return gain;
}

function applyFadeCurve(value, curve) {
    const t = clamp(value, 0, 1);
    if (curve === "ease-in") {
        return t * t;
    }
    if (curve === "ease-out") {
        return 1 - ((1 - t) * (1 - t));
    }
    if (curve === "smooth") {
        return t * t * (3 - 2 * t);
    }
    return t;
}

function renderClipBlocks(duration) {
    const track = getTrack();
    refs.clipLayer.innerHTML = "";
    if (!track) {
        return;
    }
    track.clips.forEach((clip) => {
        const block = document.createElement("div");
        block.className = "clip-block";
        block.style.left = `${(clip.startTime / duration) * 100}%`;
        block.style.width = `${(clip.duration / duration) * 100}%`;
        block.title = `${formatTime(clip.startTime)} - ${formatTime(clip.startTime + clip.duration)}`;
        refs.clipLayer.appendChild(block);
    });
}

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

function buildEffectNode(context, effect) {
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
            params: {
                threshold: node.threshold,
                ratio: node.ratio,
                attack: node.attack,
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

function buildTrackGraph(context, destination, track, collectLive = false) {
    const input = context.createGain();
    let current = input;
    const nextLive = new Map();
    if (collectLive) {
        liveMixer = null;
        liveOutputChannels = null;
    }
    for (const effect of track.effects) {
        if (!effect.enabled) {
            continue;
        }
        const node = buildEffectNode(context, effect);
        current.connect(node.input);
        current = node.output;
        if (collectLive) {
            nextLive.set(effect.id, node);
        }
    }
    const volume = context.createGain();
    volume.gain.value = track.volume;
    current.connect(volume);
    let meterSource = volume;
    if (context.createStereoPanner) {
        const pan = context.createStereoPanner();
        pan.pan.value = track.pan;
        volume.connect(pan);
        meterSource = pan;
        if (collectLive) {
            liveMixer = { volume: volume.gain, pan: pan.pan, analysers: [] };
        }
    } else if (collectLive) {
        liveMixer = { volume: volume.gain, pan: null, analysers: [] };
    }
    const outputChannels = getOutputChannels(track);
    const outputSplitter = context.createChannelSplitter(2);
    const outputMerger = context.createChannelMerger(2);
    const leftOutput = context.createGain();
    const rightOutput = context.createGain();
    leftOutput.gain.value = outputChannels.left ? 1 : 0;
    rightOutput.gain.value = outputChannels.right ? 1 : 0;
    meterSource.connect(outputSplitter);
    outputSplitter.connect(leftOutput, 0);
    outputSplitter.connect(rightOutput, 1);
    leftOutput.connect(outputMerger, 0, 0);
    rightOutput.connect(outputMerger, 0, 1);
    outputMerger.connect(destination);
    if (collectLive) {
        const leftAnalyser = context.createAnalyser();
        const rightAnalyser = context.createAnalyser();
        leftAnalyser.fftSize = 1024;
        rightAnalyser.fftSize = 1024;
        leftOutput.connect(leftAnalyser);
        rightOutput.connect(rightAnalyser);
        liveMixer.analysers = [leftAnalyser, rightAnalyser];
        meterDataLeft = new Float32Array(leftAnalyser.fftSize);
        meterDataRight = new Float32Array(rightAnalyser.fftSize);
        liveOutputChannels = { left: leftOutput.gain, right: rightOutput.gain };
    }
    if (collectLive) {
        liveEffects = nextLive;
    }
    return input;
}

function scheduleTimeline(context, destination, offset = 0, endTime = getProjectDuration(), collectLive = false) {
    const track = getTrack();
    if (!track) {
        return [];
    }
    const chainInput = buildTrackGraph(context, destination, track, collectLive);
    const nodes = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        const segmentStart = Math.max(clip.startTime, offset);
        const segmentEnd = Math.min(clipEnd, endTime);
        if (segmentEnd <= segmentStart) {
            continue;
        }
        const source = sources.get(clip.sourceId);
        if (!source) {
            continue;
        }
        const node = context.createBufferSource();
        const gain = context.createGain();
        node.buffer = source.buffer;
        node.connect(gain);
        gain.connect(chainInput);
        const when = context.currentTime + Math.max(0, segmentStart - offset);
        const sourceOffset = clip.sourceStartTime + (segmentStart - clip.startTime);
        const playableDuration = Math.min(segmentEnd - segmentStart, source.buffer.duration - sourceOffset);
        if (playableDuration <= 0) {
            continue;
        }
        applyClipGainAutomation(gain.gain, clip, segmentStart, segmentEnd, when);
        node.start(when, sourceOffset, playableDuration);
        nodes.push(node);
    }
    return nodes;
}

function applyClipGainAutomation(param, clip, segmentStart, segmentEnd, when) {
    const base = clip.gain;
    const points = new Set([segmentStart, segmentEnd]);
    const addFadePoints = (start, end) => {
        if (end <= start) {
            return;
        }
        const steps = 12;
        for (let i = 0; i <= steps; i += 1) {
            const point = start + ((end - start) * i) / steps;
            if (point >= segmentStart && point <= segmentEnd) {
                points.add(point);
            }
        }
    };
    addFadePoints(clip.startTime, clip.startTime + (clip.fadeIn || 0));
    addFadePoints(clip.startTime + clip.duration - (clip.fadeOut || 0), clip.startTime + clip.duration);
    const uniquePoints = [...points].sort((a, b) => a - b);
    param.cancelScheduledValues(when);
    param.setValueAtTime(base * getFadeMultiplier(clip, uniquePoints[0]), when);
    uniquePoints.slice(1).forEach((point) => {
        param.linearRampToValueAtTime(base * getFadeMultiplier(clip, point), when + (point - segmentStart));
    });
}

function startPlayback(offset = playbackOffset, endTime = getProjectDuration(), loop = false, loopStart = offset) {
    if (!project) {
        return;
    }
    stopPlayback(false);
    const context = ensureAudioContext();
    context.resume();
    playbackLoop = loop;
    playbackLoopStart = loop ? loopStart : 0;
    playbackEnd = endTime;
    playbackOffset = clamp(offset, 0, getProjectDuration());
    if (playbackLoop && playbackOffset >= playbackEnd) {
        playbackOffset = playbackLoopStart;
    }
    playbackStartedAt = context.currentTime;
    activeSources = scheduleTimeline(context, context.destination, playbackOffset, playbackEnd, true);
    activeSources.forEach((node) => {
        node.onended = handleSourceEnded;
    });
    isPlaying = true;
    refs.playBtn.textContent = "一時停止";
    tickPlayback();
}

function handleSourceEnded() {
    const current = getCurrentPlaybackTime();
    if (isPlaying && current >= (playbackEnd ?? getProjectDuration()) - 0.03) {
        finishPlaybackRange();
    }
}

function finishPlaybackRange() {
    const end = playbackEnd ?? getProjectDuration();
    if (playbackLoop) {
        startPlayback(playbackLoopStart, end, true, playbackLoopStart);
        return;
    }
    const projectEnd = getProjectDuration();
    stopPlayback();
    setPlayhead(end >= projectEnd - 0.03 ? 0 : end);
}

function stopPlayback(resetButton = true) {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    if (isPlaying) {
        playbackOffset = getCurrentPlaybackTime();
    }
    activeSources.forEach((node) => {
        try {
            node.onended = null;
            node.stop();
        } catch (error) {
            // Already stopped.
        }
    });
    activeSources = [];
    liveEffects = new Map();
    liveMixer = null;
    liveOutputChannels = null;
    isPlaying = false;
    playbackEnd = null;
    playbackLoop = false;
    playbackLoopStart = 0;
    if (resetButton) {
        refs.playBtn.textContent = "再生";
    }
    updateMeters();
    updateLabels();
}

function tickPlayback() {
    if (!isPlaying) {
        return;
    }
    const current = getCurrentPlaybackTime();
    if (current >= (playbackEnd ?? getProjectDuration())) {
        finishPlaybackRange();
        return;
    }
    updateMeters();
    updateLabels();
    animationFrame = requestAnimationFrame(tickPlayback);
}

function getSelectedRangeOrPlayhead() {
    if (selection.end > selection.start) {
        return { start: selection.start, end: selection.end };
    }
    return { start: playbackOffset, end: playbackOffset };
}

function copyRange(start = selection.start, end = selection.end) {
    const track = getTrack();
    if (!track || end <= start) {
        return null;
    }
    const clips = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        const segmentStart = Math.max(clip.startTime, start);
        const segmentEnd = Math.min(clipEnd, end);
        if (segmentEnd <= segmentStart) {
            continue;
        }
        clips.push({
            id: makeId("clip"),
            sourceId: clip.sourceId,
            startTime: segmentStart - start,
            sourceStartTime: clip.sourceStartTime + (segmentStart - clip.startTime),
            duration: segmentEnd - segmentStart,
            gain: clip.gain,
            fadeIn: 0,
            fadeOut: 0,
        });
    }
    return clips.length ? { duration: end - start, clips } : null;
}

function deleteRange(start = selection.start, end = selection.end) {
    const track = getTrack();
    if (!track || end <= start) {
        return;
    }
    const length = end - start;
    const next = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd <= start) {
            next.push(clip);
        } else if (clip.startTime >= end) {
            next.push({ ...clip, startTime: clip.startTime - length });
        } else {
            if (clip.startTime < start) {
                next.push({ ...clip, duration: start - clip.startTime, fadeOut: 0 });
            }
            if (clipEnd > end) {
                next.push({
                    ...clip,
                    id: makeId("clip"),
                    startTime: start,
                    sourceStartTime: clip.sourceStartTime + (end - clip.startTime),
                    duration: clipEnd - end,
                    fadeIn: 0,
                });
            }
        }
    }
    track.clips = next;
    normalizeClips();
    selection = { start, end: start };
    playbackOffset = start;
}

function trimToRange(start = selection.start, end = selection.end) {
    const track = getTrack();
    if (!track || end <= start) {
        return;
    }
    const next = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        const segmentStart = Math.max(clip.startTime, start);
        const segmentEnd = Math.min(clipEnd, end);
        if (segmentEnd <= segmentStart) {
            continue;
        }
        next.push({
            ...clip,
            id: makeId("clip"),
            startTime: segmentStart - start,
            sourceStartTime: clip.sourceStartTime + (segmentStart - clip.startTime),
            duration: segmentEnd - segmentStart,
            fadeIn: segmentStart > clip.startTime ? 0 : clip.fadeIn,
            fadeOut: segmentEnd < clipEnd ? 0 : clip.fadeOut,
        });
    }
    track.clips = next;
    normalizeClips();
    selection = { start: 0, end: end - start };
    playbackOffset = 0;
}

function silenceRange(start = selection.start, end = selection.end) {
    const track = getTrack();
    if (!track || end <= start) {
        return;
    }
    const next = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd <= start || clip.startTime >= end) {
            next.push(clip);
            continue;
        }
        if (clip.startTime < start) {
            next.push({ ...clip, duration: start - clip.startTime, fadeOut: 0 });
        }
        if (clipEnd > end) {
            next.push({
                ...clip,
                id: makeId("clip"),
                startTime: end,
                sourceStartTime: clip.sourceStartTime + (end - clip.startTime),
                duration: clipEnd - end,
                fadeIn: 0,
            });
        }
    }
    track.clips = next;
    normalizeClips();
    selection = { start, end };
    playbackOffset = start;
}

function splitClipsAt(time) {
    const track = getTrack();
    if (!track) {
        return;
    }
    const next = [];
    for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (time <= clip.startTime || time >= clipEnd) {
            next.push(clip);
            continue;
        }
        next.push({ ...clip, duration: time - clip.startTime, fadeOut: 0 });
        next.push({
            ...clip,
            id: makeId("clip"),
            startTime: time,
            sourceStartTime: clip.sourceStartTime + (time - clip.startTime),
            duration: clipEnd - time,
            fadeIn: 0,
        });
    }
    track.clips = next;
    normalizeClips();
}

function insertGap(time, length) {
    const track = getTrack();
    if (!track || length <= 0) {
        return;
    }
    splitClipsAt(time);
    track.clips = track.clips.map((clip) => (
        clip.startTime >= time ? { ...clip, startTime: clip.startTime + length } : clip
    ));
    normalizeClips();
}

function insertClipboard(time) {
    const track = getTrack();
    if (!track || !clipboard) {
        return;
    }
    insertGap(time, clipboard.duration);
    clipboard.clips.forEach((clip) => {
        track.clips.push({
            ...clip,
            id: makeId("clip"),
            startTime: time + clip.startTime,
        });
    });
    normalizeClips();
    selection = { start: time, end: time + clipboard.duration };
    playbackOffset = selection.start;
}

function applyToSelectedClips(updater) {
    const track = getTrack();
    if (!track) {
        return 0;
    }
    const range = getSelectedRangeOrPlayhead();
    let count = 0;
    track.clips = track.clips.map((clip) => {
        const clipEnd = clip.startTime + clip.duration;
        const intersects = range.end > range.start
            ? clipEnd > range.start && clip.startTime < range.end
            : range.start >= clip.startTime && range.start <= clipEnd;
        if (!intersects) {
            return clip;
        }
        count += 1;
        return updater(clip);
    });
    return count;
}

function getQuickEditRange() {
    const duration = getProjectDuration();
    if (selection.end > selection.start) {
        return { start: selection.start, end: selection.end };
    }
    return { start: 0, end: duration };
}

function prepareRangeClips(range) {
    splitClipsAt(range.end);
    splitClipsAt(range.start);
    normalizeClips();
}

function getClipsFullyInsideRange(range) {
    const track = getTrack();
    if (!track) {
        return [];
    }
    const epsilon = 0.001;
    return track.clips.filter((clip) => (
        clip.startTime >= range.start - epsilon && clip.startTime + clip.duration <= range.end + epsilon
    ));
}

function getRangePeak(range) {
    const clips = getClipsFullyInsideRange(range);
    let peak = 0;
    for (const clip of clips) {
        const source = sources.get(clip.sourceId);
        if (!source) {
            continue;
        }
        const buffer = source.buffer;
        const channelCount = Math.min(buffer.numberOfChannels, 2);
        const startIndex = Math.max(0, Math.floor(clip.sourceStartTime * buffer.sampleRate));
        const endIndex = Math.min(buffer.length, Math.ceil((clip.sourceStartTime + clip.duration) * buffer.sampleRate));
        for (let channel = 0; channel < channelCount; channel += 1) {
            const data = buffer.getChannelData(channel);
            for (let i = startIndex; i < endIndex; i += 1) {
                const value = Math.abs(data[i] * clip.gain);
                if (value > peak) {
                    peak = value;
                }
            }
        }
    }
    return peak;
}

function dbToGain(db) {
    return 10 ** (db / 20);
}

function openQuickPanel(mode) {
    quickMode = mode;
    refs.quickPanel.hidden = false;
    const isNormalize = mode === "normalize";
    const isSilence = mode === "silence";
    const isFade = mode === "fade-in" || mode === "fade-out";
    refs.normalizeGainField.hidden = !isNormalize;
    refs.normalizeGainField.style.display = isNormalize ? "" : "none";
    refs.fadeCurveField.hidden = !isFade;
    refs.fadeCurveField.style.display = isFade ? "" : "none";
    refs.silenceLengthField.hidden = !isSilence;
    refs.silenceLengthField.style.display = isSilence ? "" : "none";
    refs.quickPanelLabel.textContent = mode === "normalize"
        ? "ノーマライズ"
        : mode === "fade-in"
            ? "フェードイン"
            : mode === "fade-out"
                ? "フェードアウト"
                : "無音挿入";
    refs.quickPanelHint.textContent = isSilence
        ? "現在の再生位置に指定した長さの無音を挿入します。"
        : selection.end > selection.start
        ? "現在の選択範囲に適用します。"
        : "選択範囲がないため全体に適用します。";
}

function closeQuickPanel() {
    quickMode = null;
    refs.quickPanel.hidden = true;
}

function applyQuickPanel() {
    if (!quickMode || !project) {
        return;
    }
    if (quickMode === "silence") {
        const length = Math.max(0.01, Number(refs.silenceLengthInput.value || 0));
        pushHistory();
        insertGap(playbackOffset, length);
        selection = { start: playbackOffset, end: playbackOffset + length };
        updateAfterProjectChange();
        closeQuickPanel();
        setStatus("無音を挿入しました。", "active");
        return;
    }
    const range = getQuickEditRange();
    if (range.end <= range.start) {
        setStatus("処理できる範囲がありません。", "error");
        return;
    }
    pushHistory();
    prepareRangeClips(range);
    const clips = getClipsFullyInsideRange(range);
    if (!clips.length) {
        updateAfterProjectChange();
        setStatus("処理対象のクリップがありません。", "error");
        return;
    }
    if (quickMode === "normalize") {
        const peak = getRangePeak(range);
        if (peak <= 0) {
            updateAfterProjectChange();
            setStatus("ノーマライズできる音声ピークがありません。", "error");
            return;
        }
        const target = dbToGain(Number(refs.normalizeGainInput.value || 0));
        const multiplier = target / peak;
        clips.forEach((clip) => {
            clip.gain *= multiplier;
        });
        setStatus("ノーマライズを適用しました。", "active");
    } else {
        const curve = refs.quickFadeCurveSelect.value;
        clips.forEach((clip) => {
            if (quickMode === "fade-in") {
                clip.fadeIn = clip.duration;
                clip.fadeInCurve = curve;
            } else {
                clip.fadeOut = clip.duration;
                clip.fadeOutCurve = curve;
            }
        });
        setStatus(quickMode === "fade-in" ? "フェードインを適用しました。" : "フェードアウトを適用しました。", "active");
    }
    updateAfterProjectChange();
    closeQuickPanel();
}

function renderEffects() {
    const track = getTrack();
    refs.effectsList.innerHTML = "";
    if (!track || track.effects.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "エフェクトはまだありません。";
        refs.effectsList.appendChild(empty);
        return;
    }
    track.effects.forEach((effect, index) => {
        const def = effectDefinitions[effect.type];
        const card = document.createElement("article");
        card.className = `effect-card${effect.enabled ? "" : " is-off"}`;
        card.dataset.effectId = effect.id;

        const head = document.createElement("div");
        head.className = "effect-head";
        const title = document.createElement("span");
        title.className = "effect-title";
        title.textContent = `${index + 1}. ${def?.label || effect.type}`;
        const actions = document.createElement("div");
        actions.className = "effect-actions";
        actions.append(
            makeEffectButton(effect.enabled ? "On" : "Off", () => toggleEffect(effect.id)),
            makeEffectButton("↑", () => moveEffect(effect.id, -1), index === 0),
            makeEffectButton("↓", () => moveEffect(effect.id, 1), index === track.effects.length - 1),
            makeEffectButton("×", () => removeEffect(effect.id))
        );
        head.append(title, actions);
        card.appendChild(head);

        Object.entries(def.params).forEach(([key, meta]) => {
            const value = effect.params[key] ?? meta.default;
            const row = document.createElement("label");
            row.className = "effect-param";
            const label = document.createElement("span");
            label.textContent = meta.label;
            if (meta.kind === "select") {
                const select = document.createElement("select");
                select.className = "effect-select";
                meta.options.forEach((opt) => {
                    const option = document.createElement("option");
                    option.value = opt.value;
                    option.textContent = opt.label;
                    if (opt.value === value) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
                select.addEventListener("change", () => {
                    setEffectParam(effect.id, key, select.value, true);
                });
                row.append(label, select);
            } else {
                const range = document.createElement("input");
                range.type = "range";
                range.min = meta.min;
                range.max = meta.max;
                range.step = meta.step;
                range.value = value;
                const number = document.createElement("input");
                number.type = "number";
                number.min = meta.min;
                number.max = meta.max;
                number.step = meta.step;
                number.value = value;
                range.addEventListener("input", () => {
                    number.value = range.value;
                    setEffectParam(effect.id, key, Number(range.value), false);
                });
                number.addEventListener("change", () => {
                    const value = clamp(Number(number.value), Number(meta.min), Number(meta.max));
                    number.value = value;
                    range.value = value;
                    setEffectParam(effect.id, key, value, true);
                });
                row.append(label, range, number);
            }
            card.appendChild(row);
        });
        refs.effectsList.appendChild(card);
    });
}

function makeEffectButton(label, handler, disabled = false) {
    const button = document.createElement("button");
    button.className = "mini-button";
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
}

function addEffect(type) {
    const track = getTrack();
    const def = effectDefinitions[type];
    if (!track || !def) {
        return;
    }
    pushHistory();
    const params = {};
    Object.entries(def.params).forEach(([key, meta]) => {
        params[key] = meta.default;
    });
    track.effects.push({ id: makeId("effect"), type, enabled: true, params });
    renderEffects();
    if (isPlaying) {
        startPlayback(getCurrentPlaybackTime(), playbackEnd ?? getProjectDuration(), playbackLoop, playbackLoopStart);
    }
    updateControls();
}

function setEffectMenuOpen(open) {
    refs.effectPicker.classList.toggle("is-open", open);
    refs.effectPickerBtn.setAttribute("aria-expanded", String(open));
}

function removeEffect(id) {
    const track = getTrack();
    if (!track) {
        return;
    }
    pushHistory();
    track.effects = track.effects.filter((effect) => effect.id !== id);
    renderEffects();
    if (isPlaying) {
        startPlayback(getCurrentPlaybackTime(), playbackEnd ?? getProjectDuration(), playbackLoop, playbackLoopStart);
    }
}

function toggleEffect(id) {
    const track = getTrack();
    const effect = track?.effects.find((item) => item.id === id);
    if (!effect) {
        return;
    }
    pushHistory();
    effect.enabled = !effect.enabled;
    renderEffects();
    if (isPlaying) {
        startPlayback(getCurrentPlaybackTime(), playbackEnd ?? getProjectDuration(), playbackLoop, playbackLoopStart);
    }
}

function moveEffect(id, delta) {
    const track = getTrack();
    if (!track) {
        return;
    }
    const index = track.effects.findIndex((effect) => effect.id === id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= track.effects.length) {
        return;
    }
    pushHistory();
    const [effect] = track.effects.splice(index, 1);
    track.effects.splice(nextIndex, 0, effect);
    renderEffects();
    if (isPlaying) {
        startPlayback(getCurrentPlaybackTime(), playbackEnd ?? getProjectDuration(), playbackLoop, playbackLoopStart);
    }
}

function setEffectParam(id, key, value, commitHistory) {
    const track = getTrack();
    const effect = track?.effects.find((item) => item.id === id);
    if (!effect) {
        return;
    }
    if (commitHistory) {
        pushHistory();
    }
    effect.params[key] = value;
    const live = liveEffects.get(id);
    if (live?.setParam) {
        live.setParam(key, value);
    }
    const param = live?.params?.[key];
    if (param?.setTargetAtTime && audioCtx) {
        param.setTargetAtTime(value, audioCtx.currentTime, 0.01);
    } else if (param) {
        param.value = value;
    }
}

function syncMixerControls() {
    const track = getTrack();
    if (!track) {
        return;
    }
    refs.trackVolumeRange.value = track.volume;
    refs.trackVolumeInput.value = Number(track.volume).toFixed(2);
    refs.trackPanRange.value = track.pan;
    refs.trackPanInput.value = Number(track.pan).toFixed(2);
}

function setTrackVolume(value, commitHistory = false) {
    const track = getTrack();
    if (!track) {
        return;
    }
    const next = clamp(Number(value), 0, 2);
    if (commitHistory) {
        pushHistory();
    }
    track.volume = next;
    refs.trackVolumeRange.value = next;
    refs.trackVolumeInput.value = next.toFixed(2);
    if (liveMixer?.volume && audioCtx) {
        liveMixer.volume.setTargetAtTime(next, audioCtx.currentTime, 0.01);
    }
}

function setTrackPan(value, commitHistory = false) {
    const track = getTrack();
    if (!track) {
        return;
    }
    const next = clamp(Number(value), -1, 1);
    if (commitHistory) {
        pushHistory();
    }
    track.pan = next;
    refs.trackPanRange.value = next;
    refs.trackPanInput.value = next.toFixed(2);
    if (liveMixer?.pan && audioCtx) {
        liveMixer.pan.setTargetAtTime(next, audioCtx.currentTime, 0.01);
    }
}

function syncOutputChannelButtons() {
    const channels = getOutputChannels();
    refs.outputLeftBtn.classList.toggle("is-on", channels.left);
    refs.outputRightBtn.classList.toggle("is-on", channels.right);
    refs.outputLeftBtn.setAttribute("aria-pressed", String(channels.left));
    refs.outputRightBtn.setAttribute("aria-pressed", String(channels.right));
}

function toggleOutputChannel(channel) {
    const track = getTrack();
    if (!track) {
        return;
    }
    const channels = getOutputChannels(track);
    const next = { ...channels, [channel]: !channels[channel] };
    if (!next.left && !next.right) {
        return;
    }
    pushHistory();
    track.outputChannels = next;
    syncOutputChannelButtons();
    if (liveOutputChannels && audioCtx) {
        liveOutputChannels.left.setTargetAtTime(next.left ? 1 : 0, audioCtx.currentTime, 0.01);
        liveOutputChannels.right.setTargetAtTime(next.right ? 1 : 0, audioCtx.currentTime, 0.01);
    }
}

function updateMeters() {
    if (!liveMixer?.analysers?.length || !meterDataLeft || !meterDataRight) {
        setMeterLevel("Left", 0);
        setMeterLevel("Right", 0);
        return;
    }
    liveMixer.analysers[0].getFloatTimeDomainData(meterDataLeft);
    liveMixer.analysers[1].getFloatTimeDomainData(meterDataRight);
    setMeterLevel("Left", getRms(meterDataLeft));
    setMeterLevel("Right", getRms(meterDataRight));
}

function getRms(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
        sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
}

function setMeterLevel(side, rms) {
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const normalized = clamp((db + 60) / 60, 0, 1);
    const fill = refs[`vu${side}`];
    const peak = refs[`vu${side}Peak`];
    const label = refs[`vu${side}Label`];
    fill.style.height = `${normalized * 100}%`;
    peak.style.bottom = `${normalized * 100}%`;
    label.textContent = Number.isFinite(db) && db > -60 ? `${db.toFixed(1)} dB` : "-∞ dB";
}

function getFFmpegGlobals() {
    const ffmpegGlobal = window.FFmpegWASM || window.FFmpeg;
    const utilGlobal = window.FFmpegUtil || window.FFmpegWASM;
    if (!ffmpegGlobal?.FFmpeg || !utilGlobal?.toBlobURL) {
        throw new Error("FFmpeg WASMライブラリを読み込めませんでした。ネットワーク接続を確認してください。");
    }
    return {
        FFmpeg: ffmpegGlobal.FFmpeg,
        toBlobURL: utilGlobal.toBlobURL,
    };
}

async function ensureFFmpeg() {
    if (ffmpegReady) {
        return ffmpeg;
    }
    const { FFmpeg, toBlobURL } = getFFmpegGlobals();
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
        if (Number.isFinite(progress)) {
            refs.exportStatus.textContent = `変換中... ${(clamp(progress, 0, 1) * 100).toFixed(0)}%`;
        }
    });
    setStatus("FFmpeg WASMを読み込み中...", "active");
    const ffmpegBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd";
    const coreBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
        classWorkerURL: await toBlobURL(`${ffmpegBaseURL}/814.ffmpeg.js`, "text/javascript"),
        coreURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegReady = true;
    return ffmpeg;
}

async function ensureFFmpegWithFallbacks() {
    if (ffmpegReady) {
        return ffmpeg;
    }
    const { FFmpeg, toBlobURL } = getFFmpegGlobals();
    setStatus("FFmpeg WASMを読み込み中...", "active");
    const ffmpegBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd";
    const classWorkerURL = await toBlobURL(`${ffmpegBaseURL}/814.ffmpeg.js`, "text/javascript");
    const coreCandidates = [
        { baseURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm", blob: true },
        { baseURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm", blob: false },
        { baseURL: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm", blob: true },
        { baseURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd", blob: true },
    ];
    let lastError = null;
    for (const candidate of coreCandidates) {
        const instance = new FFmpeg();
        instance.on("progress", ({ progress }) => {
            if (Number.isFinite(progress)) {
                refs.exportStatus.textContent = `変換中... ${(clamp(progress, 0, 1) * 100).toFixed(0)}%`;
            }
        });
        try {
            const coreURL = `${candidate.baseURL}/ffmpeg-core.js`;
            const wasmURL = `${candidate.baseURL}/ffmpeg-core.wasm`;
            await instance.load({
                classWorkerURL,
                coreURL: candidate.blob ? await toBlobURL(coreURL, "text/javascript") : coreURL,
                wasmURL: candidate.blob ? await toBlobURL(wasmURL, "application/wasm") : wasmURL,
            });
            ffmpeg = instance;
            ffmpegReady = true;
            return ffmpeg;
        } catch (error) {
            lastError = error;
            try {
                instance.terminate();
            } catch (terminateError) {
                // Ignore cleanup errors from a partially initialized worker.
            }
        }
    }
    throw lastError || new Error("FFmpeg WASMを読み込めませんでした。");
}

async function deleteVirtualFile(name) {
    try {
        await ffmpeg.deleteFile(name);
    } catch (error) {
        // The file may not exist after a failed conversion.
    }
}

function getExportSampleRate() {
    const selected = refs.exportSampleRateSelect.value;
    return selected === "copy" ? project.sampleRate || 44100 : Number(selected);
}

function getExportWavBitDepth() {
    if (refs.exportBitDepthSelect.value === "32f") {
        return "32f";
    }
    return refs.exportBitDepthSelect.value === "24" ? 24 : 16;
}

function getRenderChannelCount() {
    const selected = refs.exportChannelSelect.value;
    if (selected === "2") {
        return 2;
    }
    return Math.max(getMaxChannelCount(), selected.startsWith("mono-") ? 2 : 1);
}

function createExportAudioBuffer(channels, length, sampleRate) {
    const context = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return context.createBuffer(channels, length, sampleRate);
}

function convertRenderedBuffer(buffer) {
    const mode = refs.exportChannelSelect.value;
    if (mode === "copy") {
        return buffer;
    }
    if (mode === "2") {
        if (buffer.numberOfChannels === 2) {
            return buffer;
        }
        const stereo = createExportAudioBuffer(2, buffer.length, buffer.sampleRate);
        const source = buffer.getChannelData(0);
        stereo.copyToChannel(source, 0);
        stereo.copyToChannel(source, 1);
        return stereo;
    }
    const channelIndex = mode === "mono-right" ? 1 : 0;
    const mono = createExportAudioBuffer(1, buffer.length, buffer.sampleRate);
    mono.copyToChannel(buffer.getChannelData(Math.min(channelIndex, buffer.numberOfChannels - 1)), 0);
    return mono;
}

function getWindowRms(buffer, start, end) {
    let sum = 0;
    let count = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = start; i < end; i += 1) {
            sum += data[i] * data[i];
            count += 1;
        }
    }
    return count ? Math.sqrt(sum / count) : 0;
}

function copyAudioBufferRange(buffer, length) {
    const trimmed = createExportAudioBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        trimmed.copyToChannel(buffer.getChannelData(channel).subarray(0, length), channel);
    }
    return trimmed;
}

function trimRenderedTail(buffer, originalDuration) {
    const sampleRate = buffer.sampleRate;
    const originalLength = Math.min(buffer.length, Math.ceil(originalDuration * sampleRate));
    const threshold = 10 ** (EXPORT_TAIL_THRESHOLD_DB / 20);
    const windowSize = Math.max(1, Math.round(EXPORT_TAIL_ANALYSIS_WINDOW_SECONDS * sampleRate));
    const requiredSilentSamples = Math.max(1, Math.round(EXPORT_TAIL_SILENCE_SECONDS * sampleRate));
    let silentStart = null;
    for (let start = originalLength; start < buffer.length; start += windowSize) {
        const end = Math.min(buffer.length, start + windowSize);
        const rms = getWindowRms(buffer, start, end);
        if (rms <= threshold) {
            if (silentStart === null) {
                silentStart = start;
            }
            if (end - silentStart >= requiredSilentSamples) {
                return copyAudioBufferRange(buffer, Math.max(originalLength, silentStart));
            }
        } else {
            silentStart = null;
        }
    }
    return buffer;
}

async function renderExportBuffer() {
    const duration = getProjectDuration();
    const sampleRate = getExportSampleRate();
    const channels = getRenderChannelCount();
    const includeTail = refs.exportIncludeTailCheckbox.checked;
    const renderDuration = includeTail ? duration + EXPORT_TAIL_MAX_SECONDS : duration;
    const length = Math.max(1, Math.ceil(renderDuration * sampleRate));
    const offline = new OfflineAudioContext(channels, length, sampleRate);
    scheduleTimeline(offline, offline.destination, 0, renderDuration, false);
    const rendered = convertRenderedBuffer(await offline.startRendering());
    return includeTail ? trimRenderedTail(rendered, duration) : rendered;
}

async function transcodeRenderedWav(wavBlob, profile) {
    const instance = await ensureFFmpegWithFallbacks();
    const inputName = "input.wav";
    const outputName = `output.${profile.ext}`;
    await deleteVirtualFile(inputName);
    await deleteVirtualFile(outputName);
    await instance.writeFile(inputName, new Uint8Array(await wavBlob.arrayBuffer()));
    const args = ["-i", inputName, ...profile.codec];
    if (profile.bitrate) {
        args.push("-b:a", refs.exportBitrateSelect.value);
    }
    args.push(outputName);
    await instance.exec(args);
    const data = await instance.readFile(outputName);
    await deleteVirtualFile(inputName);
    await deleteVirtualFile(outputName);
    return new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)], {
        type: profile.mime,
    });
}

async function handleExport() {
    if (!project || isBusy) {
        return;
    }
    const duration = getProjectDuration();
    if (!duration) {
        setStatus("書き出す音声がありません。", "error");
        return;
    }
    const profile = outputProfiles[refs.exportFormatSelect.value] || outputProfiles.wav;
    setBusy(true);
    stopPlayback();
    refs.exportStatus.textContent = "レンダリング中...";
    setStatus(`${profile.ext.toUpperCase()}を書き出し中...`, "active");
    try {
        const rendered = await renderExportBuffer();
        const wavBitDepth = profile.ext === "wav" ? getExportWavBitDepth() : 16;
        const wavBlob = encodeWav(rendered, wavBitDepth);
        refs.exportStatus.textContent = profile.ext === "wav" ? "書き出し中..." : "変換中...";
        const blob = profile.ext === "wav" ? wavBlob : await transcodeRenderedWav(wavBlob, profile);
        const baseName = getSafeBaseName(currentFile?.name || "audio");
        downloadBlob(blob, `${baseName}_edited.${profile.ext}`);
        refs.exportStatus.textContent = `${profile.ext.toUpperCase()}ダウンロード完了`;
        setStatus(`${profile.ext.toUpperCase()}を書き出しました。`, "active");
    } catch (error) {
        console.error(error);
        refs.exportStatus.textContent = "エラー";
        setStatus(`書き出しに失敗しました: ${error.message}`, "error");
    } finally {
        setBusy(false);
    }
}

async function exportWav() {
    if (!project || isBusy) {
        return;
    }
    const duration = getProjectDuration();
    if (!duration) {
        setStatus("書き出す音声がありません。", "error");
        return;
    }
    setBusy(true);
    stopPlayback();
    refs.exportStatus.textContent = "レンダリング中...";
    setStatus("WAVを書き出し中...", "active");
    try {
        const channels = getMaxChannelCount();
        const sampleRate = project.sampleRate || 44100;
        const length = Math.max(1, Math.ceil(duration * sampleRate));
        const offline = new OfflineAudioContext(channels, length, sampleRate);
        scheduleTimeline(offline, offline.destination, 0, duration, false);
        const rendered = await offline.startRendering();
        const blob = encodeWav(rendered, getExportWavBitDepth());
        const baseName = getSafeBaseName(currentFile?.name || "audio");
        downloadBlob(blob, `${baseName}_edited.wav`);
        refs.exportStatus.textContent = "WAVダウンロード完了";
        setStatus("WAVを書き出しました。", "active");
    } catch (error) {
        console.error(error);
        refs.exportStatus.textContent = "エラー";
        setStatus(`書き出しに失敗しました: ${error.message}`, "error");
    } finally {
        setBusy(false);
    }
}

function encodeWav(buffer, bitDepth = 16) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const isFloat = bitDepth === "32f";
    const normalizedBitDepth = isFloat ? 32 : bitDepth === 24 ? 24 : 16;
    const bytesPerSample = isFloat ? 4 : normalizedBitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const dataSize = samples * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, isFloat ? 3 : 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, normalizedBitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    const channelData = [];
    for (let channel = 0; channel < channels; channel += 1) {
        channelData.push(buffer.getChannelData(channel));
    }
    for (let i = 0; i < samples; i += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const sample = clamp(channelData[channel][i], -1, 1);
            if (isFloat) {
                view.setFloat32(offset, sample, true);
                offset += 4;
            } else if (normalizedBitDepth === 24) {
                const intSample = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
                view.setUint8(offset, intSample & 0xff);
                view.setUint8(offset + 1, (intSample >> 8) & 0xff);
                view.setUint8(offset + 2, (intSample >> 16) & 0xff);
                offset += 3;
            } else {
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }
    }
    return new Blob([view], { type: "audio/wav" });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i += 1) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function getSafeBaseName(name) {
    const withoutExt = name.replace(/\.[^.]+$/, "");
    return withoutExt.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "audio";
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function getTimeFromPointer(event) {
    const duration = getProjectDuration();
    const rect = refs.waveFrame.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration);
}

function getSelectionPointerMode(event) {
    if (selection.end <= selection.start) {
        return "new";
    }
    const duration = getProjectDuration();
    if (!duration) {
        return "new";
    }
    const rect = refs.waveFrame.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const startX = (selection.start / duration) * rect.width;
    const endX = (selection.end / duration) * rect.width;
    if (Math.abs(x - startX) <= SELECTION_HANDLE_HIT_PX) {
        return "start";
    }
    if (Math.abs(x - endX) <= SELECTION_HANDLE_HIT_PX) {
        return "end";
    }
    if (x > startX && x < endX) {
        return "move";
    }
    return "new";
}

function updateWaveCursor(event) {
    if (!project || isBusy || dragState) {
        return;
    }
    const mode = getSelectionPointerMode(event);
    refs.waveFrame.classList.toggle("is-resizing-selection", mode === "start" || mode === "end");
    refs.waveFrame.classList.toggle("is-moving-selection", mode === "move");
}

function resetWaveCursor() {
    refs.waveFrame.classList.remove("is-resizing-selection", "is-moving-selection");
}

function handleWavePointerDown(event) {
    if (!project || isBusy) {
        return;
    }
    if (playbackLoop) {
        stopPlayback();
        loopEnabled = false;
        syncLoopToggle();
    }
    refs.waveFrame.setPointerCapture(event.pointerId);
    const time = getTimeFromPointer(event);
    dragState = {
        mode: getSelectionPointerMode(event),
        anchor: time,
        originalStart: selection.start,
        originalEnd: selection.end,
        moved: false,
    };
    refs.waveFrame.classList.toggle("is-resizing-selection", dragState.mode === "start" || dragState.mode === "end");
    refs.waveFrame.classList.toggle("is-moving-selection", dragState.mode === "move");
    setPlayhead(dragState.mode === "move" ? selection.start : time);
}

function handleWavePointerMove(event) {
    if (!project || isBusy) {
        return;
    }
    if (!dragState) {
        updateWaveCursor(event);
        return;
    }
    const time = getTimeFromPointer(event);
    dragState.moved = true;
    if (dragState.mode === "start") {
        setSelection(Math.min(time, dragState.originalEnd), dragState.originalEnd);
        setPlayhead(selection.start);
    } else if (dragState.mode === "end") {
        setSelection(dragState.originalStart, Math.max(time, dragState.originalStart));
        setPlayhead(selection.end);
    } else if (dragState.mode === "move") {
        const duration = getProjectDuration();
        const selectionLength = dragState.originalEnd - dragState.originalStart;
        const delta = time - dragState.anchor;
        const nextStart = clamp(dragState.originalStart + delta, 0, Math.max(0, duration - selectionLength));
        setSelection(nextStart, nextStart + selectionLength);
        setPlayhead(nextStart);
    } else {
        setSelection(dragState.anchor, time);
        setPlayhead(time);
    }
}

function handleWavePointerUp(event) {
    if (!dragState) {
        return;
    }
    refs.waveFrame.releasePointerCapture(event.pointerId);
    if (!dragState.moved && dragState.mode === "new") {
        setSelection(0, getProjectDuration());
    }
    dragState = null;
    updateWaveCursor(event);
}

function bindEvents() {
    refs.fileButton.addEventListener("click", () => refs.fileInput.click());
    refs.dropZone.addEventListener("click", (event) => {
        if (event.target !== refs.fileButton) {
            refs.fileInput.click();
        }
    });
    refs.fileInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
            loadFile(file);
        }
    });
    ["dragenter", "dragover"].forEach((eventName) => {
        refs.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            refs.dropZone.classList.add("is-dragover");
        });
    });
    ["dragleave", "drop"].forEach((eventName) => {
        refs.dropZone.addEventListener(eventName, () => refs.dropZone.classList.remove("is-dragover"));
    });
    refs.dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) {
            loadFile(file);
        }
    });

    refs.playBtn.addEventListener("click", () => {
        if (isPlaying) {
            stopPlayback();
        } else {
            if (loopEnabled && selection.end > selection.start) {
                const offset = playbackOffset >= selection.start && playbackOffset < selection.end ? playbackOffset : selection.start;
                startPlayback(offset, selection.end, true, selection.start);
            } else {
                startPlayback(playbackOffset, getProjectDuration());
            }
        }
    });
    refs.startBtn.addEventListener("click", () => setPlayhead(0));
    refs.loopToggleBtn.addEventListener("click", toggleLoopEnabled);
    refs.outputLeftBtn.addEventListener("click", () => toggleOutputChannel("left"));
    refs.outputRightBtn.addEventListener("click", () => toggleOutputChannel("right"));
    refs.undoBtn.addEventListener("click", () => {
        if (!history.length) {
            return;
        }
        redoStack.push(cloneProject());
        restoreProject(history.pop());
    });
    refs.redoBtn.addEventListener("click", () => {
        if (!redoStack.length) {
            return;
        }
        history.push(cloneProject());
        restoreProject(redoStack.pop());
    });
    refs.copyBtn.addEventListener("click", () => {
        clipboard = copyRange();
        setStatus(clipboard ? "選択範囲をコピーしました。" : "コピーできる範囲がありません。", clipboard ? "active" : "error");
        updateControls();
    });
    refs.cutBtn.addEventListener("click", () => {
        if (selection.end <= selection.start) {
            return;
        }
        clipboard = copyRange();
        pushHistory();
        deleteRange();
        updateAfterProjectChange();
        setSelection(0, getProjectDuration());
        setStatus("選択範囲をカットしました。", "active");
    });
    refs.trimRangeBtn.addEventListener("click", () => {
        if (selection.end <= selection.start) {
            return;
        }
        pushHistory();
        trimToRange();
        updateAfterProjectChange();
        setSelection(0, getProjectDuration());
        setStatus("選択部分だけを残しました。", "active");
    });
    refs.silenceRangeBtn.addEventListener("click", () => {
        if (selection.end <= selection.start) {
            return;
        }
        pushHistory();
        silenceRange();
        updateAfterProjectChange();
        setStatus("選択範囲を無音化しました。", "active");
    });
    refs.pasteBtn.addEventListener("click", () => {
        if (!clipboard) {
            return;
        }
        pushHistory();
        insertClipboard(playbackOffset);
        updateAfterProjectChange();
        setStatus("ペーストしました。", "active");
    });
    refs.duplicateBtn.addEventListener("click", () => {
        const copied = copyRange();
        if (!copied) {
            return;
        }
        pushHistory();
        clipboard = copied;
        insertClipboard(selection.end);
        updateAfterProjectChange();
        setStatus("選択範囲を複製しました。", "active");
    });
    refs.silenceBtn.addEventListener("click", () => openQuickPanel("silence"));
    bindTimeInput(refs.selectionStartInput, commitSelectionStartInput);
    bindTimeInput(refs.selectionEndInput, commitSelectionEndInput);
    bindTimeInput(refs.playheadInput, commitPlayheadInput);
    refs.quickNormalizeBtn.addEventListener("click", () => openQuickPanel("normalize"));
    refs.quickFadeInBtn.addEventListener("click", () => openQuickPanel("fade-in"));
    refs.quickFadeOutBtn.addEventListener("click", () => openQuickPanel("fade-out"));
    refs.quickCloseBtn.addEventListener("click", closeQuickPanel);
    refs.quickApplyBtn.addEventListener("click", applyQuickPanel);
    refs.trackVolumeRange.addEventListener("input", () => setTrackVolume(refs.trackVolumeRange.value));
    refs.trackVolumeInput.addEventListener("change", () => setTrackVolume(refs.trackVolumeInput.value, true));
    refs.trackPanRange.addEventListener("input", () => setTrackPan(refs.trackPanRange.value));
    refs.trackPanInput.addEventListener("change", () => setTrackPan(refs.trackPanInput.value, true));
    refs.centerPanBtn.addEventListener("click", () => setTrackPan(0, true));
    refs.effectPickerBtn.addEventListener("click", () => {
        setEffectMenuOpen(!refs.effectPicker.classList.contains("is-open"));
    });
    refs.effectMenu.addEventListener("click", (event) => {
        const option = event.target.closest(".effect-option");
        if (!option) {
            return;
        }
        addEffect(option.dataset.effectType);
        setEffectMenuOpen(false);
    });
    document.addEventListener("click", (event) => {
        if (!refs.effectPicker.contains(event.target)) {
            setEffectMenuOpen(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setEffectMenuOpen(false);
        }
    });
    refs.exportFormatSelect.addEventListener("change", updateExportFields);
    refs.exportBtn.addEventListener("click", handleExport);

    refs.waveFrame.addEventListener("pointerdown", handleWavePointerDown);
    refs.waveFrame.addEventListener("pointermove", handleWavePointerMove);
    refs.waveFrame.addEventListener("pointerup", handleWavePointerUp);
    refs.waveFrame.addEventListener("pointercancel", handleWavePointerUp);
    refs.waveFrame.addEventListener("pointerleave", resetWaveCursor);
    window.addEventListener("resize", drawWaveform);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopPlayback();
        }
    });
}

bindEvents();
updateControls();
drawWaveform();
renderEffects();
updateLabels();
