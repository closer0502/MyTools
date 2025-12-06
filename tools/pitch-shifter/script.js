let audioCtx = null;
let shifter = null;
let audioBuffer = null;
let playing = false;
let waveformData = [];
let PitchShifterCtor = null;

const fileInput = document.getElementById('fileInput');
const fileButton = document.getElementById('fileButton');
const dropzone = document.getElementById('dropzone');
const playBtn = document.getElementById('playBtn');
const resetBtn = document.getElementById('resetBtn');
const pitchRange = document.getElementById('pitchRange');
const minusBtn = document.getElementById('minusBtn');
const plusBtn = document.getElementById('plusBtn');
const pitchValue = document.getElementById('pitchValue');
const fileNameEl = document.getElementById('fileName');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const waveCanvas = document.getElementById('waveCanvas');
const waveWrapper = document.getElementById('waveWrapper');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');

fileButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', evt => {
    const file = evt.target.files[0];
    if (file) loadFile(file);
});

['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dropzone.classList.add('dragging');
    });
});

['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, () => dropzone.classList.remove('dragging'));
});

dropzone.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
});

playBtn.addEventListener('click', () => {
    if (!shifter) return;
    playing ? pause() : play();
});

resetBtn.addEventListener('click', () => {
    if (!shifter) return;
    pause();
    shifter.percentagePlayed = 0;
    updateProgress(0);
    pitchRange.value = 0;
    applyPitch(0);
});

pitchRange.addEventListener('input', e => {
    const semitone = parseFloat(e.target.value);
    applyPitch(semitone);
    pitchValue.textContent = semitone.toFixed(1);
});

pitchRange.addEventListener('dblclick', () => {
    pitchRange.value = 0;
    pitchRange.dispatchEvent(new Event('input'));
});

minusBtn.addEventListener('click', () => nudgePitch(-0.1));
plusBtn.addEventListener('click', () => nudgePitch(0.1));

waveWrapper.addEventListener('pointerdown', onSeekStart);

window.addEventListener('resize', () => {
    if (audioBuffer) drawWaveform(audioBuffer);
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause();
});

function ensureContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

async function ensureLibrary() {
    if (PitchShifterCtor) return;
    const mod = await import('https://cdn.jsdelivr.net/npm/soundtouchjs@0.2.1/dist/soundtouch.min.js');
    PitchShifterCtor = mod.PitchShifter;
    if (!PitchShifterCtor) throw new Error('SoundTouchJS が読み込めませんでした。');
}

function loadFile(file) {
    ensureContext();
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            await ensureLibrary();
            const arrayBuffer = reader.result;
            const decoded = await audioCtx.decodeAudioData(arrayBuffer);
            setupShifter(decoded, file.name);
        } catch (err) {
            alert('音声の読み込みに失敗しました: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function setupShifter(buffer, name) {
    if (shifter) {
        try { shifter.disconnect(); } catch (e) {}
    }
    audioBuffer = buffer;
    shifter = new PitchShifterCtor(audioCtx, buffer, 4096, () => {
        playing = false;
        playBtn.textContent = '再生';
        updateProgress(100);
    });
    shifter.on('play', ({ percentagePlayed, formattedTimePlayed }) => {
        updateProgress(percentagePlayed);
        currentTimeEl.textContent = formattedTimePlayed;
    });
    totalTimeEl.textContent = formatTime(buffer.duration);
    fileNameEl.textContent = name;

    enableControls();
    drawWaveform(buffer);
    updateProgress(0);
    pitchRange.value = 0;
    pitchValue.textContent = '0.0';
    playing = false;
    playBtn.textContent = '再生';
}

function play() {
    if (!shifter) return;
    shifter.connect(audioCtx.destination);
    audioCtx.resume();
    playing = true;
    playBtn.textContent = '一時停止';
}

function pause() {
    if (!shifter) return;
    try { shifter.disconnect(); } catch (e) {}
    playing = false;
    playBtn.textContent = '再生';
}

function applyPitch(semitone) {
    if (!shifter) return;
    shifter.pitchSemitones = semitone;
}

function nudgePitch(delta) {
    const current = parseFloat(pitchValue.textContent);
    const next = clamp(current + delta, -24, 24);
    pitchValue.textContent = next.toFixed(1);
    pitchRange.value = Math.round(next); // sliderは1刻み
    applyPitch(next);
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function updateProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = `${clamped}%`;
    progressThumb.style.left = `${clamped}%`;
}

function onSeekStart(e) {
    if (!shifter || !audioBuffer) return;
    const rect = waveWrapper.getBoundingClientRect();
    const move = evt => {
        const ratio = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
        shifter.percentagePlayed = ratio;
        updateProgress(ratio * 100);
        currentTimeEl.textContent = formatTime(audioBuffer.duration * ratio);
    };
    move(e);
    const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

function drawWaveform(buffer) {
    const canvas = waveCanvas;
    const width = waveWrapper.clientWidth || 800;
    const height = canvas.height;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const data = buffer.getChannelData(0);
    const samples = 800;
    const block = Math.floor(data.length / samples) || 1;
    waveformData = [];
    for (let i = 0; i < samples; i++) {
        const start = i * block;
        let min = 1, max = -1;
        for (let j = 0; j < block; j++) {
            const v = data[start + j] || 0;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        waveformData.push({ min, max });
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c1426';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1;
    const mid = height / 2;
    const xScale = width / waveformData.length;
    ctx.beginPath();
    waveformData.forEach((p, i) => {
        const x = i * xScale;
        ctx.moveTo(x, mid + p.min * mid);
        ctx.lineTo(x, mid + p.max * mid);
    });
    ctx.stroke();
}

function enableControls() {
    playBtn.disabled = false;
    resetBtn.disabled = false;
    pitchRange.disabled = false;
    minusBtn.disabled = false;
    plusBtn.disabled = false;
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}
