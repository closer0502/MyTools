let audioCtx = null;
let shifter = null;
let audioBuffer = null;
let playing = false;
let waveformData = [];
let PitchShifterCtor = null;
let soundtouchLib = null;
let lameLib = null;
let isExporting = false;

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
const exportDownloadBtn = document.getElementById('exportDownload');
const exportStatus = document.getElementById('exportStatus');

let inputFormat = null; // 'wav' or 'mp3'

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
    if (isExporting) return;
    if (!shifter) return;
    playing ? pause() : play();
});

resetBtn.addEventListener('click', () => {
    if (isExporting) return;
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

exportDownloadBtn.addEventListener('click', () => handleExport());

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
    if (PitchShifterCtor && soundtouchLib) return;
    const mod = await import('https://cdn.jsdelivr.net/npm/soundtouchjs@0.2.1/dist/soundtouch.min.js');
    PitchShifterCtor = mod.PitchShifter;
    soundtouchLib = mod;
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
            inputFormat = detectFormat(file);
            if (!inputFormat) {
                alert('WAV または MP3 のみ対応しています。');
                return;
            }
            setupShifter(decoded, file.name);
        } catch (err) {
            alert('音声の読み込みに失敗しました: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function detectFormat(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type.includes('wav') || name.endsWith('.wav')) return 'wav';
    if (type.includes('mpeg') || type.includes('mp3') || name.endsWith('.mp3')) return 'mp3';
    return null;
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
    setExportStatus('未処理');
    updateExportAvailability();
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
    if (isExporting) return;
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
    if (isExporting) return;
    playBtn.disabled = false;
    resetBtn.disabled = false;
    pitchRange.disabled = false;
    minusBtn.disabled = false;
    plusBtn.disabled = false;
    updateExportAvailability();
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateExportAvailability() {
    const ready = Boolean(audioBuffer);
    exportDownloadBtn.disabled = !ready;
}

function setExporting(state) {
    isExporting = state;
    document.body.classList.toggle('exporting', state);

    const disabled = state || !audioBuffer;
    playBtn.disabled = disabled;
    resetBtn.disabled = disabled;
    pitchRange.disabled = disabled;
    minusBtn.disabled = disabled;
    plusBtn.disabled = disabled;
    fileButton.disabled = state; // 防止: 書き出し中の別ファイル投入
    exportDownloadBtn.disabled = disabled;
}

async function handleExport() {
    if (!audioBuffer) {
        alert('先に音声ファイルを読み込んでください。');
        return;
    }
    if (!inputFormat) {
        alert('入力形式の判定に失敗しました。');
        return;
    }
    pause(); // 再生中なら止める
    setExporting(true);
    setExportStatus(`書き出し中... (${inputFormat.toUpperCase()})`);
    try {
        if (inputFormat === 'wav') {
            const data = await renderProcessed();
            const blob = encodeWav(data);
            downloadBlob(blob, `pitch-shifted.wav`);
            setExportStatus('WAV ダウンロード完了');
        } else if (inputFormat === 'mp3') {
            await ensureLame();
            const data = await renderProcessed();
            const blob = encodeMp3(data);
            downloadBlob(blob, `pitch-shifted.mp3`);
            setExportStatus('MP3 ダウンロード完了');
        }
    } catch (err) {
        console.error(err);
        alert('書き出しに失敗しました: ' + err.message);
        setExportStatus('エラーが発生しました');
    } finally {
        setExporting(false);
    }
}

function setExportStatus(text) {
    exportStatus.textContent = text;
}

async function ensureLame() {
    if (lameLib) return;
    await loadScript('https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js');
    lameLib = window.lamejs;
    if (!lameLib) throw new Error('lamejs の読み込みに失敗しました');
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Script load error'));
        document.head.appendChild(s);
    });
}

function floatTo16BitPCM(float32Array) {
    const output = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
}

function interleave(left, right) {
    const length = Math.min(left.length, right.length);
    const interleaved = new Float32Array(length * 2);
    for (let i = 0; i < length; i++) {
        interleaved[2 * i] = left[i];
        interleaved[2 * i + 1] = right[i];
    }
    return interleaved;
}

function encodeWav({ left, right, sampleRate }) {
    const interleaved = interleave(left, right);
    const buffer = new ArrayBuffer(44 + interleaved.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + interleaved.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true);  // linear PCM
    view.setUint16(22, 2, true);  // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true); // byte rate
    view.setUint16(32, 4, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, interleaved.length * 2, true);

    const pcm = floatTo16BitPCM(interleaved);
    for (let i = 0; i < pcm.length; i++) {
        view.setInt16(44 + i * 2, pcm[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function encodeMp3({ left, right, sampleRate }) {
    const samplesLeft = floatTo16BitPCM(left);
    const samplesRight = floatTo16BitPCM(right);
    const encoder = new lameLib.Mp3Encoder(2, sampleRate, 192);
    const mp3Data = [];
    const block = 1152;
    for (let i = 0; i < samplesLeft.length; i += block) {
        const sliceL = samplesLeft.subarray(i, i + block);
        const sliceR = samplesRight.subarray(i, i + block);
        const buf = encoder.encodeBuffer(sliceL, sliceR);
        if (buf.length) mp3Data.push(buf);
    }
    const end = encoder.flush();
    if (end.length) mp3Data.push(end);
    return new Blob(mp3Data, { type: 'audio/mpeg' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function renderProcessed() {
    await ensureLibrary();
    const { SoundTouch, SimpleFilter, WebAudioBufferSource } = soundtouchLib;
    const st = new SoundTouch();
    st.pitchSemitones = parseFloat(pitchValue.textContent);
    st.rate = 1;
    st.tempo = 1;
    if (st.stretch && typeof st.stretch.setParameters === 'function') {
        st.stretch.setParameters(audioBuffer.sampleRate, 0, 0, 8);
    }

    const source = new WebAudioBufferSource(audioBuffer);
    const filter = new SimpleFilter(source, st);

    const chunk = 4096;
    const temp = new Float32Array(chunk * 2);
    const left = [];
    const right = [];
    let frames;
    while ((frames = filter.extract(temp, chunk)) > 0) {
        for (let i = 0; i < frames; i++) {
            left.push(temp[2 * i]);
            right.push(temp[2 * i + 1]);
        }
    }
    return {
        left: new Float32Array(left),
        right: new Float32Array(right),
        sampleRate: audioBuffer.sampleRate
    };
}
