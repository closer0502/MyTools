const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileButton");
const dropZone = document.getElementById("dropZone");
const video = document.getElementById("video");
const fileNameLabel = document.getElementById("fileName");
const fileSizeLabel = document.getElementById("fileSize");
const durationLabel = document.getElementById("durationLabel");
const fileTypeLabel = document.getElementById("fileType");
const videoInfo = document.getElementById("videoInfo");
const waveInfo = document.getElementById("waveInfo");
const waveFrame = document.getElementById("waveFrame");
const topRuler = document.getElementById("topRuler");
const bottomRuler = document.getElementById("bottomRuler");
const waveCanvas = document.getElementById("waveCanvas");
const waveSelection = document.getElementById("waveSelection");
const playhead = document.getElementById("playhead");
const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const setStartBtn = document.getElementById("setStartBtn");
const setEndBtn = document.getElementById("setEndBtn");
const fullRangeBtn = document.getElementById("fullRangeBtn");
const playSelectionBtn = document.getElementById("playSelectionBtn");
const wavePlayBtn = document.getElementById("wavePlayBtn");
const waveStartBtn = document.getElementById("waveStartBtn");
const waveTimeLabel = document.getElementById("waveTimeLabel");
const selectionLabel = document.getElementById("selectionLabel");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const formatSelect = document.getElementById("formatSelect");
const sampleRateSelect = document.getElementById("sampleRateSelect");
const channelSelect = document.getElementById("channelSelect");
const bitrateSelect = document.getElementById("bitrateSelect");
const bitrateField = document.getElementById("bitrateField");
const formatBadge = document.getElementById("formatBadge");
const exportBtn = document.getElementById("exportBtn");
const exportStatus = document.getElementById("exportStatus");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");

const controls = [
    startInput,
    endInput,
    setStartBtn,
    setEndBtn,
    fullRangeBtn,
    playSelectionBtn,
    wavePlayBtn,
    waveStartBtn,
    formatSelect,
    sampleRateSelect,
    channelSelect,
    bitrateSelect,
    exportBtn,
];

const outputProfiles = {
    mp3: { ext: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame"], bitrate: true },
    wav: { ext: "wav", mime: "audio/wav", codec: ["-c:a", "pcm_s16le"], bitrate: false },
    m4a: { ext: "m4a", mime: "audio/mp4", codec: ["-c:a", "aac"], bitrate: true },
    ogg: { ext: "ogg", mime: "audio/ogg", codec: ["-c:a", "libopus"], bitrate: true },
    flac: { ext: "flac", mime: "audio/flac", codec: ["-c:a", "flac"], bitrate: false },
};

let ffmpeg = null;
let ffmpegReady = false;
let audioCtx = null;
let currentFile = null;
let objectUrl = null;
let duration = 0;
let selectionStart = 0;
let selectionEnd = 0;
let waveformPeaks = [];
let isBusy = false;
let dragMode = null;
let isRulerDrag = false;
let stopAtSelectionEnd = false;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pad = (value, length = 2) => String(value).padStart(length, "0");

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

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) {
        return "-";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getSafeBaseName(name) {
    const withoutExt = name.replace(/\.[^.]+$/, "");
    return withoutExt.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "audio";
}

function setStatus(message, type = "idle") {
    statusText.textContent = message;
    statusDot.classList.toggle("is-active", type === "active");
    statusDot.classList.toggle("is-error", type === "error");
}

function setExportStatus(message) {
    exportStatus.textContent = message;
}

function setBusy(state) {
    isBusy = state;
    document.body.classList.toggle("is-busy", state);
    fileButton.disabled = state;
    dropZone.style.pointerEvents = state ? "none" : "";
    updateControls();
}

function updateControls() {
    const ready = Boolean(currentFile && duration > 0 && waveformPeaks.length);
    controls.forEach((control) => {
        control.disabled = isBusy || !ready;
    });
    bitrateSelect.disabled = isBusy || !ready || !outputProfiles[formatSelect.value].bitrate;
}

function updateFormatFields() {
    const profile = outputProfiles[formatSelect.value];
    bitrateField.style.opacity = profile.bitrate ? "1" : "0.48";
    formatBadge.textContent = profile.ext.toUpperCase();
    updateControls();
}

function updateSelectionLabels() {
    if (!duration) {
        selectionLabel.textContent = "-";
        return;
    }
    const length = Math.max(0, selectionEnd - selectionStart);
    selectionLabel.textContent = `${formatTime(selectionStart)} - ${formatTime(selectionEnd)} (${formatTime(length)})`;
    if (document.activeElement !== startInput) {
        startInput.value = formatTime(selectionStart);
    }
    if (document.activeElement !== endInput) {
        endInput.value = formatTime(selectionEnd);
    }
    updateSelectionOverlay();
}

function updateSelectionOverlay() {
    if (!duration) {
        waveSelection.style.left = "0%";
        waveSelection.style.width = "0%";
        waveFrame.style.setProperty("--range-start", "0%");
        waveFrame.style.setProperty("--range-end", "0%");
        return;
    }
    const left = (selectionStart / duration) * 100;
    const right = (selectionEnd / duration) * 100;
    const width = ((selectionEnd - selectionStart) / duration) * 100;
    waveSelection.style.left = `${left}%`;
    waveSelection.style.width = `${Math.max(0, width)}%`;
    waveFrame.style.setProperty("--range-start", `${left}%`);
    waveFrame.style.setProperty("--range-end", `${right}%`);
}

function updatePlayhead() {
    const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    currentTimeLabel.textContent = formatTime(time);
    videoInfo.textContent = duration ? `${formatTime(time)} / ${formatTime(duration)}` : "-";
    waveTimeLabel.textContent = duration ? `${formatTime(time)} / ${formatTime(duration)}` : "00:00:00.000 / 00:00:00.000";
    playhead.style.left = duration ? `${clamp(time / duration, 0, 1) * 100}%` : "0%";
}

function seekVideoTo(time) {
    if (!duration || !Number.isFinite(time)) {
        return;
    }
    const nextTime = clamp(time, 0, duration);
    stopAtSelectionEnd = false;
    video.currentTime = nextTime;
    updatePlayhead();
}

function setSelection(start, end) {
    const nextStart = clamp(Math.min(start, end), 0, duration);
    const nextEnd = clamp(Math.max(start, end), 0, duration);
    selectionStart = nextStart;
    selectionEnd = Math.max(nextStart, nextEnd);
    updateSelectionLabels();
}

function setFileMeta(file) {
    fileNameLabel.textContent = file ? file.name : "-";
    fileSizeLabel.textContent = file ? formatBytes(file.size) : "-";
    fileTypeLabel.textContent = file ? file.type || "不明" : "-";
    durationLabel.textContent = duration ? formatTime(duration) : "-";
}

function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function getFFmpegGlobals() {
    const ffmpegGlobal = window.FFmpegWASM || window.FFmpeg;
    const utilGlobal = window.FFmpegUtil || window.FFmpegWASM;
    if (!ffmpegGlobal || !ffmpegGlobal.FFmpeg || !utilGlobal || !utilGlobal.toBlobURL) {
        throw new Error("FFmpeg WASMライブラリを読み込めませんでした。");
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
    ffmpeg.on("log", ({ message }) => {
        if (/time=|size=|speed=/.test(message)) {
            setExportStatus(message);
        }
    });
    ffmpeg.on("progress", ({ progress }) => {
        if (Number.isFinite(progress)) {
            const percent = clamp(progress, 0, 1) * 100;
            setExportStatus(`処理中... ${percent.toFixed(0)}%`);
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
    setStatus("FFmpeg WASMの読み込みが完了しました。", "active");
    return ffmpeg;
}

async function writeInputFile(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile("input.bin", data);
}

async function deleteVirtualFile(name) {
    try {
        await ffmpeg.deleteFile(name);
    } catch (error) {
        // The file may not exist after a failed conversion.
    }
}

async function buildWaveform(file) {
    await ensureFFmpeg();
    await deleteVirtualFile("input.bin");
    await deleteVirtualFile("waveform.wav");
    await writeInputFile(file);
    setStatus("解析用の音声波形を生成中...", "active");
    setExportStatus("波形生成中");
    await ffmpeg.exec([
        "-i", "input.bin",
        "-vn",
        "-ac", "1",
        "-ar", "8000",
        "-f", "wav",
        "waveform.wav",
    ]);
    const waveFile = await ffmpeg.readFile("waveform.wav");
    const arrayBuffer = waveFile.buffer.slice(waveFile.byteOffset, waveFile.byteOffset + waveFile.byteLength);
    const decoded = await ensureAudioContext().decodeAudioData(arrayBuffer);
    waveformPeaks = createPeaks(decoded, 1200);
    drawWaveform();
    waveInfo.textContent = `${waveformPeaks.length} peaks / mono 8 kHz`;
    setExportStatus("未処理");
    setStatus("波形を生成しました。", "active");
}

function createPeaks(buffer, targetSamples) {
    const channel = buffer.getChannelData(0);
    const samples = Math.min(targetSamples, Math.max(1, channel.length));
    const blockSize = Math.max(1, Math.floor(channel.length / samples));
    const peaks = [];
    for (let i = 0; i < samples; i += 1) {
        const start = i * blockSize;
        let min = 1;
        let max = -1;
        for (let j = 0; j < blockSize; j += 1) {
            const sample = channel[start + j] || 0;
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        peaks.push({ min, max });
    }
    return peaks;
}

function drawWaveform() {
    const ratio = window.devicePixelRatio || 1;
    const width = waveFrame.clientWidth || 480;
    const height = 170;
    waveCanvas.width = width * ratio;
    waveCanvas.height = height * ratio;
    waveCanvas.style.height = `${height}px`;
    const ctx = waveCanvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d1525";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.72)";
    ctx.lineWidth = 1;
    const mid = height / 2;
    const amplitude = height * 0.42;
    const xScale = width / Math.max(1, waveformPeaks.length);
    ctx.beginPath();
    waveformPeaks.forEach((peak, index) => {
        const x = index * xScale;
        ctx.moveTo(x, mid + peak.min * amplitude);
        ctx.lineTo(x, mid + peak.max * amplitude);
    });
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
}

function getTimeFromPointer(event) {
    const rect = waveFrame.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return ratio * duration;
}

function getDragMode(time) {
    const threshold = Math.max(0.35, duration * 0.01);
    if (Math.abs(time - selectionStart) <= threshold) {
        return "start";
    }
    if (Math.abs(time - selectionEnd) <= threshold) {
        return "end";
    }
    return "range";
}

function getHandleDragMode(time) {
    const threshold = Math.max(0.35, duration * 0.012);
    const startDistance = Math.abs(time - selectionStart);
    const endDistance = Math.abs(time - selectionEnd);
    if (startDistance > threshold && endDistance > threshold) {
        return null;
    }
    return startDistance <= endDistance ? "start" : "end";
}

function handleRulerPointerDown(event) {
    if (!duration || isBusy) {
        return;
    }
    event.preventDefault();
    const time = getTimeFromPointer(event);
    dragMode = getHandleDragMode(time);
    if (!dragMode) {
        return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    isRulerDrag = true;
    if (dragMode === "start") {
        setSelection(time, selectionEnd);
    } else {
        setSelection(selectionStart, time);
    }
}

function handleRulerPointerMove(event) {
    if (!dragMode || !duration || isBusy) {
        return;
    }
    event.preventDefault();
    const time = getTimeFromPointer(event);
    if (dragMode === "start") {
        setSelection(time, selectionEnd);
    } else {
        setSelection(selectionStart, time);
    }
}

function handleRulerPointerUp(event) {
    if (dragMode) {
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragMode = null;
    isRulerDrag = false;
}

function handleWavePointerDown(event) {
    if (!duration || isBusy || isRulerDrag) {
        return;
    }
    seekVideoTo(getTimeFromPointer(event));
}

function handleRulerPointerMovePreview(event) {
    if (!duration || isBusy || isRulerDrag) {
        return;
    }
    const time = getTimeFromPointer(event);
    event.currentTarget.classList.toggle("is-near-handle", Boolean(getHandleDragMode(time)));
}

function handleRulerPointerLeave(event) {
    if (!isRulerDrag) {
        event.currentTarget.classList.remove("is-near-handle");
    }
}

function applyInputTimes() {
    const start = parseTimecode(startInput.value);
    const end = parseTimecode(endInput.value);
    if (start === null || end === null) {
        setStatus("タイムコードの形式を確認してください。", "error");
        updateSelectionLabels();
        return;
    }
    setSelection(start, end);
    setStatus("範囲を更新しました。", "active");
}

async function loadFile(file) {
    if (!file || isBusy) {
        return;
    }
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi|ogv)$/i.test(file.name)) {
        setStatus("動画ファイルを選択してください。", "error");
        return;
    }
    setBusy(true);
    setStatus("動画を読み込み中...", "active");
    setExportStatus("未処理");
    waveformPeaks = [];
    drawWaveform();
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    }
    currentFile = file;
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    fileInput.value = "";
    setFileMeta(file);
    try {
        await waitForVideoMetadata();
        duration = video.duration;
        selectionStart = 0;
        selectionEnd = duration;
        setFileMeta(file);
        updatePlayhead();
        updateSelectionLabels();
        await buildWaveform(file);
    } catch (error) {
        console.error(error);
        setStatus(`読み込みに失敗しました: ${error.message}`, "error");
        setExportStatus("エラー");
    } finally {
        setBusy(false);
    }
}

function waitForVideoMetadata() {
    return new Promise((resolve, reject) => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
            resolve();
            return;
        }
        const cleanup = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            video.removeEventListener("error", onError);
        };
        const onLoaded = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("動画メタデータを読み込めませんでした。"));
        };
        video.addEventListener("loadedmetadata", onLoaded, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

function buildExportArgs(outputName) {
    const profile = outputProfiles[formatSelect.value];
    const length = Math.max(0, selectionEnd - selectionStart);
    const args = [
        "-ss", selectionStart.toFixed(3),
        "-t", length.toFixed(3),
        "-i", "input.bin",
        "-vn",
        ...profile.codec,
    ];
    if (sampleRateSelect.value !== "copy") {
        args.push("-ar", sampleRateSelect.value);
    }
    if (channelSelect.value !== "copy") {
        args.push("-ac", channelSelect.value);
    }
    if (profile.bitrate) {
        args.push("-b:a", bitrateSelect.value);
    }
    args.push(outputName);
    return args;
}

async function handleExport() {
    if (!currentFile || isBusy) {
        return;
    }
    if (selectionEnd <= selectionStart) {
        setStatus("書き出し範囲を選択してください。", "error");
        return;
    }
    const profile = outputProfiles[formatSelect.value];
    const outputName = `output.${profile.ext}`;
    setBusy(true);
    setStatus("音声を書き出し中...", "active");
    setExportStatus("処理中...");
    video.pause();
    try {
        await ensureFFmpeg();
        await deleteVirtualFile(outputName);
        const args = buildExportArgs(outputName);
        await ffmpeg.exec(args);
        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)], {
            type: profile.mime,
        });
        const name = `${getSafeBaseName(currentFile.name)}_${formatTime(selectionStart).replace(/[:.]/g, "-")}_${formatTime(selectionEnd).replace(/[:.]/g, "-")}.${profile.ext}`;
        downloadBlob(blob, name);
        setExportStatus("ダウンロード完了");
        setStatus("音声を書き出しました。", "active");
        await deleteVirtualFile(outputName);
    } catch (error) {
        console.error(error);
        setExportStatus("エラー");
        setStatus(`書き出しに失敗しました: ${error.message}`, "error");
    } finally {
        setBusy(false);
    }
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

function playSelection() {
    if (!duration || selectionEnd <= selectionStart) {
        return;
    }
    stopAtSelectionEnd = true;
    video.currentTime = selectionStart;
    video.play();
}

function toggleWavePlayback() {
    if (!duration) {
        return;
    }
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function seekWaveToStart() {
    if (!duration) {
        return;
    }
    seekVideoTo(0);
}

function updateTransportState() {
    const isPlaying = !video.paused && !video.ended;
    wavePlayBtn.textContent = isPlaying ? "停止" : "再生";
    playSelectionBtn.classList.toggle("is-hidden", isPlaying);
}

fileButton.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", (event) => {
    if (event.target !== fileButton) {
        fileInput.click();
    }
});
fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
        loadFile(file);
    }
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        dropZone.classList.add("is-dragover");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove("is-dragover");
    });
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
        loadFile(file);
    }
});

video.addEventListener("timeupdate", () => {
    updatePlayhead();
    if (stopAtSelectionEnd && video.currentTime >= selectionEnd) {
        video.pause();
        stopAtSelectionEnd = false;
        video.currentTime = selectionEnd;
    }
});
video.addEventListener("seeking", updatePlayhead);
video.addEventListener("seeked", updatePlayhead);
video.addEventListener("play", () => {
    if (!stopAtSelectionEnd) {
        stopAtSelectionEnd = false;
    }
    updateTransportState();
});
video.addEventListener("pause", () => {
    stopAtSelectionEnd = false;
    updateTransportState();
});
video.addEventListener("ended", updateTransportState);

waveFrame.addEventListener("pointerdown", handleWavePointerDown);
[topRuler, bottomRuler].forEach((ruler) => {
    ruler.addEventListener("pointerdown", handleRulerPointerDown);
    ruler.addEventListener("pointermove", handleRulerPointerMove);
    ruler.addEventListener("pointermove", handleRulerPointerMovePreview);
    ruler.addEventListener("pointerup", handleRulerPointerUp);
    ruler.addEventListener("pointercancel", handleRulerPointerUp);
    ruler.addEventListener("pointerleave", handleRulerPointerLeave);
});

setStartBtn.addEventListener("click", () => setSelection(video.currentTime, selectionEnd));
setEndBtn.addEventListener("click", () => setSelection(selectionStart, video.currentTime));
fullRangeBtn.addEventListener("click", () => setSelection(0, duration));
playSelectionBtn.addEventListener("click", playSelection);
wavePlayBtn.addEventListener("click", toggleWavePlayback);
waveStartBtn.addEventListener("click", seekWaveToStart);
startInput.addEventListener("change", applyInputTimes);
endInput.addEventListener("change", applyInputTimes);
formatSelect.addEventListener("change", updateFormatFields);
exportBtn.addEventListener("click", handleExport);

window.addEventListener("resize", () => {
    drawWaveform();
    updateSelectionOverlay();
    updatePlayhead();
});

updateFormatFields();
updateControls();
drawWaveform();
updatePlayhead();
updateTransportState();
