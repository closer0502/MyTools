const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileButton");
const dropZone = document.getElementById("dropZone");
const video = document.getElementById("video");
const frameCanvas = document.getElementById("frameCanvas");
const frameContext = frameCanvas.getContext("2d");

const fileNameLabel = document.getElementById("fileName");
const fileResolutionLabel = document.getElementById("fileResolution");
const durationLabel = document.getElementById("durationLabel");
const fileFpsLabel = document.getElementById("fileFps");
const videoInfo = document.getElementById("videoInfo");
const frameInfo = document.getElementById("frameInfo");
const formatBadge = document.getElementById("formatBadge");

const timecodeInput = document.getElementById("timecodeInput");
const fpsInput = document.getElementById("fpsInput");
const timeSlider = document.getElementById("timeSlider");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const currentFrameLabel = document.getElementById("currentFrameLabel");
const seekStartBtn = document.getElementById("seekStartBtn");
const seekEndBtn = document.getElementById("seekEndBtn");
const stepButtons = Array.from(document.querySelectorAll(".step-button"));

const formatSelect = document.getElementById("formatSelect");
const qualityRange = document.getElementById("qualityRange");
const qualityValue = document.getElementById("qualityValue");
const qualityField = document.getElementById("qualityField");
const captureBtn = document.getElementById("captureBtn");

const rangeToggle = document.getElementById("rangeToggle");
const startFrameInput = document.getElementById("startFrameInput");
const endFrameInput = document.getElementById("endFrameInput");
const setStartBtn = document.getElementById("setStartBtn");
const setEndBtn = document.getElementById("setEndBtn");
const startTimeLabel = document.getElementById("startTimeLabel");
const endTimeLabel = document.getElementById("endTimeLabel");
const rangeCountLabel = document.getElementById("rangeCountLabel");
const exportRangeBtn = document.getElementById("exportRangeBtn");

const statusText = document.getElementById("statusText");

const controls = [
    timecodeInput,
    fpsInput,
    timeSlider,
    seekStartBtn,
    seekEndBtn,
    ...stepButtons,
    formatSelect,
    qualityRange,
    captureBtn,
    rangeToggle,
    startFrameInput,
    endFrameInput,
    setStartBtn,
    setEndBtn,
    exportRangeBtn,
];

let objectUrl = null;
let currentFile = null;
let isReady = false;
let isBusy = false;
let detectedFps = null;
let ffmpeg = null;
let ffmpegReady = false;
let ffmpegInputReady = false;
let probeLogLines = [];
let isProbeActive = false;
let isExportProgressActive = false;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const pad = (value, length = 2) => String(value).padStart(length, "0");

const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) {
        return "00:00:00.000";
    }
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
};

const parseTimecode = (value) => {
    if (!value) {
        return null;
    }
    const cleaned = value.trim();
    if (!cleaned) {
        return null;
    }
    const parts = cleaned.split(":").map((part) => part.trim());
    if (parts.some((part) => part === "")) {
        return null;
    }
    let seconds = 0;
    let multiplier = 1;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const number = Number(parts[i].replace(",", "."));
        if (!Number.isFinite(number)) {
            return null;
        }
        seconds += number * multiplier;
        multiplier *= 60;
    }
    return seconds;
};

const getFps = () => {
    const fps = Number(fpsInput.value);
    return Number.isFinite(fps) && fps > 0 ? fps : 30;
};

const getFFmpegGlobals = () => {
    const ffmpegGlobal = window.FFmpegWASM || window.FFmpeg;
    const utilGlobal = window.FFmpegUtil || window.FFmpegWASM;
    if (!ffmpegGlobal?.FFmpeg || !utilGlobal?.toBlobURL) {
        throw new Error("FFmpeg WASM is not loaded.");
    }
    return {
        FFmpeg: ffmpegGlobal.FFmpeg,
        toBlobURL: utilGlobal.toBlobURL,
    };
};

const ensureFFmpeg = async () => {
    if (ffmpegReady) {
        return ffmpeg;
    }
    const { FFmpeg, toBlobURL } = getFFmpegGlobals();
    ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
        if (isProbeActive) {
            probeLogLines.push(message);
        }
    });
    ffmpeg.on("progress", ({ progress }) => {
        if (isExportProgressActive && Number.isFinite(progress)) {
            setStatus(`Exporting with FFmpeg... ${Math.round(clamp(progress, 0, 1) * 100)}%`);
        }
    });

    setStatus("Loading FFmpeg WASM...");
    const ffmpegBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd";
    const coreBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
        classWorkerURL: await toBlobURL(`${ffmpegBaseURL}/814.ffmpeg.js`, "text/javascript"),
        coreURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegReady = true;
    return ffmpeg;
};

const deleteVirtualFile = async (name) => {
    if (!ffmpegReady) {
        return;
    }
    try {
        await ffmpeg.deleteFile(name);
    } catch (error) {
        // The file may not exist after a failed or cancelled export.
    }
};

const ensureFFmpegInput = async () => {
    if (ffmpegInputReady) {
        return;
    }
    if (!currentFile) {
        throw new Error("No input video is selected.");
    }
    await ensureFFmpeg();
    await deleteVirtualFile("input.bin");
    const data = new Uint8Array(await currentFile.arrayBuffer());
    await ffmpeg.writeFile("input.bin", data);
    ffmpegInputReady = true;
};

const parseRate = (value) => {
    const text = String(value || "").trim();
    if (!text || text === "0/0") {
        return null;
    }
    const ratio = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (ratio) {
        const numerator = Number(ratio[1]);
        const denominator = Number(ratio[2]);
        return denominator > 0 ? numerator / denominator : null;
    }
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const parseVideoProbeInfo = (lines) => {
    const videoLine = lines.find((line) => /Video:/i.test(line)) || "";
    const fpsMatch = videoLine.match(/(\d+(?:\.\d+)?)\s*fps/i);
    const tbrMatch = videoLine.match(/(\d+(?:\.\d+)?)\s*tbr/i);
    return {
        fps: parseRate(fpsMatch?.[1]) || parseRate(tbrMatch?.[1]),
        line: videoLine,
    };
};

const probeVideoInfo = async () => {
    await ensureFFmpegInput();
    probeLogLines = [];
    isProbeActive = true;
    try {
        await ffmpeg.exec(["-hide_banner", "-i", "input.bin"]);
    } catch (error) {
        // ffmpeg exits with an error because no output was requested; probe info is still logged.
    } finally {
        isProbeActive = false;
    }
    return parseVideoProbeInfo(probeLogLines);
};

const getMaxFrame = () => {
    if (!isReady || !Number.isFinite(video.duration)) {
        return 0;
    }
    const frameCount = Math.round(video.duration * getFps());
    return Math.max(0, frameCount - 1);
};

const getFrameIndexForTime = (time) => {
    if (!isReady) {
        return 0;
    }
    const frameIndex = Math.round(time * getFps());
    return clamp(frameIndex, 0, getMaxFrame());
};

const getCurrentFrameIndex = () => getFrameIndexForTime(video.currentTime);

const getFrameTime = (frameIndex) => clampFrame(frameIndex) / getFps();

const setStatus = (message) => {
    statusText.textContent = message;
};

const setControlsEnabled = (enabled) => {
    controls.forEach((control) => {
        control.disabled = !enabled;
    });
    if (!enabled) {
        if (!isReady) {
            rangeToggle.checked = false;
        }
        endFrameInput.disabled = true;
        setEndBtn.disabled = true;
        exportRangeBtn.disabled = true;
        qualityRange.disabled = true;
    } else {
        handleRangeToggle();
        updateQualityField();
    }
    updateExportButtonsVisibility();
};

const syncSliderStep = () => {
    const step = 1 / getFps();
    timeSlider.step = step.toFixed(6);
};

const syncFrameBounds = () => {
    const maxFrame = getMaxFrame();
    startFrameInput.max = maxFrame;
    endFrameInput.max = maxFrame;
    const startFrame = clampFrame(startFrameInput.value);
    const endFrame = clampFrame(endFrameInput.value);
    startFrameInput.value = startFrame;
    endFrameInput.value = endFrame;
    updateRangeLabels();
};

const updateFormatBadge = () => {
    const mime = formatSelect.value;
    const label = mime === "image/jpeg" ? "JPEG" : mime === "image/webp" ? "WEBP" : "PNG";
    formatBadge.textContent = label;
};

const updateQualityField = () => {
    const isLossy = formatSelect.value !== "image/png";
    qualityRange.disabled = !isLossy || !isReady || isBusy;
    qualityField.style.opacity = isLossy ? "1" : "0.5";
};

const updateExportButtonsVisibility = () => {
    const isRange = rangeToggle.checked && isReady;
    captureBtn.classList.toggle("is-hidden", isRange);
    exportRangeBtn.classList.toggle("is-hidden", !isRange);
};

const updateTimeLabels = () => {
    if (!isReady) {
        return;
    }
    const time = video.currentTime;
    timeSlider.value = time;
    currentTimeLabel.textContent = formatTime(time);
    currentFrameLabel.textContent = `${getCurrentFrameIndex()} frame`;
    if (document.activeElement !== timecodeInput) {
        timecodeInput.value = formatTime(time);
    }
    updateRangeLabels();
    updatePreviewMeta();
};

const updatePreviewMeta = () => {
    if (!isReady) {
        videoInfo.textContent = "-";
        frameInfo.textContent = "-";
        return;
    }
    const frameIndex = getCurrentFrameIndex();
    videoInfo.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    frameInfo.textContent = `frame ${frameIndex}`;
};

const clampFrame = (value) => {
    const parsed = Number.parseInt(value, 10);
    const maxFrame = getMaxFrame();
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return clamp(parsed, 0, maxFrame);
};

const updateRangeLabels = () => {
    const fps = getFps();
    const startFrame = clampFrame(startFrameInput.value);
    const endFrame = clampFrame(endFrameInput.value);
    startTimeLabel.textContent = formatTime(startFrame / fps);
    if (rangeToggle.checked) {
        endTimeLabel.textContent = formatTime(endFrame / fps);
        rangeCountLabel.textContent = endFrame >= startFrame ? String(endFrame - startFrame + 1) : "0";
    } else {
        endTimeLabel.textContent = "-";
        rangeCountLabel.textContent = "0";
    }
};

const drawFrame = () => {
    if (!isReady || !video.videoWidth || !video.videoHeight) {
        return;
    }
    if (frameCanvas.width !== video.videoWidth || frameCanvas.height !== video.videoHeight) {
        frameCanvas.width = video.videoWidth;
        frameCanvas.height = video.videoHeight;
    }
    frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
};

const seekTo = (time) => {
    if (!isReady) {
        return Promise.resolve();
    }
    const target = clamp(time, 0, video.duration || 0);
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            resolve();
        };
        const onSeeked = () => {
            finish();
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.currentTime = target;
        if (Math.abs(video.currentTime - target) < 0.0005) {
            requestAnimationFrame(finish);
        }
        setTimeout(finish, 300);
    });
};

const canvasToBlob = (type, quality) =>
    new Promise((resolve) => {
        const useQuality = type === "image/png" ? undefined : quality;
        frameCanvas.toBlob((blob) => resolve(blob), type, useQuality);
    });

const getOutputProfile = () => {
    const mime = formatSelect.value;
    if (mime === "image/jpeg") {
        return { ext: "jpg", mime };
    }
    if (mime === "image/webp") {
        return { ext: "webp", mime };
    }
    return { ext: "png", mime: "image/png" };
};

const getFFmpegImageQualityArgs = () => {
    const quality = clamp(Number(qualityRange.value) || 0.92, 0.5, 1);
    const mime = formatSelect.value;
    if (mime === "image/jpeg") {
        const qscale = Math.round(31 - quality * 29);
        return ["-q:v", String(clamp(qscale, 2, 31))];
    }
    if (mime === "image/webp") {
        return ["-quality", String(Math.round(quality * 100))];
    }
    return [];
};

const blobFromFFmpegData = (data, type) =>
    new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)], { type });

const listVirtualFiles = async () => {
    try {
        return await ffmpeg.listDir(".");
    } catch (error) {
        return [];
    }
};

const deleteMatchingVirtualFiles = async (predicate) => {
    if (!ffmpegReady) {
        return;
    }
    const entries = await listVirtualFiles();
    await Promise.all(entries
        .filter((entry) => !entry.isDir && predicate(entry.name))
        .map((entry) => deleteVirtualFile(entry.name)));
};

const readMatchingVirtualFiles = async (predicate) => {
    const entries = await listVirtualFiles();
    return entries
        .filter((entry) => !entry.isDir && predicate(entry.name))
        .map((entry) => entry.name)
        .sort();
};

const downloadBlob = (blob, filename) => {
    if (!blob) {
        return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const updateFileMeta = () => {
    if (!currentFile || !isReady) {
        fileNameLabel.textContent = "-";
        fileResolutionLabel.textContent = "-";
        durationLabel.textContent = "-";
        fileFpsLabel.textContent = "-";
        return;
    }
    fileNameLabel.textContent = currentFile.name;
    fileResolutionLabel.textContent = `${video.videoWidth} x ${video.videoHeight}`;
    durationLabel.textContent = formatTime(video.duration);
    fileFpsLabel.textContent = detectedFps ? `${detectedFps.toFixed(2)} fps` : "-";
};

const resetUI = () => {
    isReady = false;
    setControlsEnabled(false);
    updateFormatBadge();
    updateQualityField();
    currentTimeLabel.textContent = "00:00:00.000";
    currentFrameLabel.textContent = "0 frame";
    startTimeLabel.textContent = "00:00:00.000";
    endTimeLabel.textContent = "-";
    rangeCountLabel.textContent = "0";
    fileNameLabel.textContent = "-";
    fileResolutionLabel.textContent = "-";
    durationLabel.textContent = "-";
    fileFpsLabel.textContent = "-";
    videoInfo.textContent = "-";
    frameInfo.textContent = "-";
    frameContext.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
};

const handleFile = (file) => {
    if (!file) {
        return;
    }
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    }
    currentFile = file;
    ffmpegInputReady = false;
    detectedFps = null;
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.load();
    resetUI();
    setStatus("動画を読み込み中...");
};

const handleRangeToggle = () => {
    const enabled = rangeToggle.checked && isReady && !isBusy;
    endFrameInput.disabled = !enabled;
    setEndBtn.disabled = !enabled;
    exportRangeBtn.disabled = !enabled;
    captureBtn.disabled = !isReady || isBusy || enabled;
    updateRangeLabels();
    updateExportButtonsVisibility();
};

const handleFrameStep = async (direction, frames) => {
    if (!isReady || isBusy) {
        return;
    }
    const step = frames / getFps();
    const nextTime = video.currentTime + direction * step;
    await seekTo(nextTime);
    drawFrame();
    updateTimeLabels();
};

const handleCapture = async () => {
    if (!isReady || isBusy) {
        return;
    }
    isBusy = true;
    setControlsEnabled(false);
    setStatus("フレームを書き出し中...");
    const quality = Number(qualityRange.value);
    const mime = formatSelect.value;
    await seekTo(video.currentTime);
    drawFrame();
    const blob = await canvasToBlob(mime, quality);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const frameIndex = getCurrentFrameIndex();
    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : "frame";
    downloadBlob(blob, `${baseName}_frame_${pad(frameIndex, 6)}.${ext}`);
    setStatus("フレームを保存しました。");
    isBusy = false;
    setControlsEnabled(true);
};

const handleRangeExport = async () => {
    if (!isReady || isBusy || !rangeToggle.checked) {
        return;
    }
    const fps = getFps();
    const startFrame = clampFrame(startFrameInput.value);
    const endFrame = clampFrame(endFrameInput.value);
    if (endFrame < startFrame) {
        setStatus("終了フレームが開始フレームより前です。");
        return;
    }
    const totalFrames = endFrame - startFrame + 1;
    isBusy = true;
    setControlsEnabled(false);
    setStatus(`書き出し中... (${totalFrames} frames)`);

    const mime = formatSelect.value;
    const quality = Number(qualityRange.value);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : "frames";
    const zip = new JSZip();
    const digits = String(endFrame).length;

    for (let frame = startFrame; frame <= endFrame; frame += 1) {
        if (!isReady) {
            break;
        }
        const time = frame / fps;
        await seekTo(time);
        drawFrame();
        const blob = await canvasToBlob(mime, quality);
        const filename = `frame_${pad(frame, digits)}.${ext}`;
        zip.file(filename, blob);
        setStatus(`書き出し中... ${frame - startFrame + 1}/${totalFrames}`);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `${baseName}_frames_${startFrame}-${endFrame}.zip`);
    setStatus("ZIPを書き出しました。");
    isBusy = false;
    setControlsEnabled(true);
};

const handleExactCapture = async () => {
    if (!isReady || isBusy) {
        return;
    }
    isBusy = true;
    setControlsEnabled(false);
    setStatus("Exporting exact frame with FFmpeg...");
    try {
        await ensureFFmpegInput();
        const { ext, mime } = getOutputProfile();
        const frameIndex = getCurrentFrameIndex();
        const outputName = `capture_000001.${ext}`;
        await deleteMatchingVirtualFiles((name) => name.startsWith("capture_"));
        isExportProgressActive = true;
        await ffmpeg.exec([
            "-hide_banner",
            "-i", "input.bin",
            "-vf", `select=eq(n\\,${frameIndex})`,
            "-vsync", "0",
            "-frames:v", "1",
            ...getFFmpegImageQualityArgs(),
            outputName,
        ]);
        let data;
        try {
            data = await ffmpeg.readFile(outputName);
        } catch (error) {
            throw new Error(`No frame was extracted for frame ${frameIndex}.`);
        }
        const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : "frame";
        downloadBlob(blobFromFFmpegData(data, mime), `${baseName}_frame_${pad(frameIndex, 6)}.${ext}`);
        await deleteVirtualFile(outputName);
        setStatus("Frame exported with FFmpeg.");
    } catch (error) {
        console.error(error);
        setStatus(`FFmpeg export failed: ${error.message}`);
    } finally {
        isExportProgressActive = false;
        isBusy = false;
        setControlsEnabled(true);
    }
};

const handleExactRangeExport = async () => {
    if (!isReady || isBusy || !rangeToggle.checked) {
        return;
    }
    const startFrame = clampFrame(startFrameInput.value);
    const endFrame = clampFrame(endFrameInput.value);
    if (endFrame < startFrame) {
        setStatus("End frame must be greater than or equal to start frame.");
        return;
    }

    const totalFrames = endFrame - startFrame + 1;
    isBusy = true;
    setControlsEnabled(false);
    setStatus(`Exporting exact frames with FFmpeg... (${totalFrames} frames)`);
    try {
        await ensureFFmpegInput();
        const { ext } = getOutputProfile();
        const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : "frames";
        const zip = new JSZip();
        const digits = Math.max(6, String(endFrame).length);
        const outputPattern = `frame_%0${digits}d.${ext}`;

        await deleteMatchingVirtualFiles((name) => /^frame_\d+\.(png|jpe?g|webp)$/i.test(name));
        isExportProgressActive = true;
        await ffmpeg.exec([
            "-hide_banner",
            "-i", "input.bin",
            "-vf", `select=between(n\\,${startFrame}\\,${endFrame})`,
            "-vsync", "0",
            "-frames:v", String(totalFrames),
            ...getFFmpegImageQualityArgs(),
            outputPattern,
        ]);

        const outputFiles = await readMatchingVirtualFiles((name) => new RegExp(`^frame_\\d+\\.${ext}$`, "i").test(name));
        if (outputFiles.length === 0) {
            throw new Error("No frames were extracted. Check the frame range.");
        }
        for (let index = 0; index < outputFiles.length; index += 1) {
            const name = outputFiles[index];
            const data = await ffmpeg.readFile(name);
            const actualFrame = startFrame + index;
            zip.file(`frame_${pad(actualFrame, digits)}.${ext}`, data);
            setStatus(`Packing ZIP... ${index + 1}/${outputFiles.length}`);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${baseName}_frames_${startFrame}-${endFrame}.zip`);
        await deleteMatchingVirtualFiles((name) => /^frame_\d+\.(png|jpe?g|webp)$/i.test(name));
        setStatus(`ZIP exported with ${outputFiles.length} frames.`);
    } catch (error) {
        console.error(error);
        setStatus(`FFmpeg export failed: ${error.message}`);
    } finally {
        isExportProgressActive = false;
        isBusy = false;
        setControlsEnabled(true);
    }
};

fileButton.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    handleFile(file);
});

dropZone.addEventListener("click", (event) => {
    if (event.target.closest("#fileButton")) {
        return;
    }
    fileInput.click();
});

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    const file = event.dataTransfer.files[0];
    handleFile(file);
});

video.addEventListener("loadedmetadata", async () => {
    isReady = true;
    setControlsEnabled(false);
    setStatus("Probing video metadata with FFmpeg...");
    syncSliderStep();
    timeSlider.max = video.duration || 0;
    timeSlider.value = video.currentTime || 0;
    timecodeInput.value = formatTime(video.currentTime || 0);
    startFrameInput.value = 0;
    endFrameInput.value = 0;
    try {
        const probeInfo = await probeVideoInfo();
        detectedFps = probeInfo.fps;
        if (detectedFps) {
            fpsInput.value = Number.isInteger(detectedFps) ? String(detectedFps) : detectedFps.toFixed(3);
        }
    } catch (error) {
        console.error(error);
        detectedFps = null;
        setStatus(`FFmpeg probe failed. Use manual FPS: ${error.message}`);
    }
    updateFileMeta();
    updateTimeLabels();
    updateFormatBadge();
    syncFrameBounds();
    setControlsEnabled(true);
    if (detectedFps) {
        setStatus(`Video loaded. FPS detected by FFmpeg: ${detectedFps.toFixed(3)}`);
    }
});

video.addEventListener("loadeddata", () => {
    drawFrame();
});

video.addEventListener("timeupdate", () => {
    if (isReady) {
        updateTimeLabels();
    }
});

video.addEventListener("seeked", () => {
    if (isReady) {
        drawFrame();
        updateTimeLabels();
    }
});

timeSlider.addEventListener("input", () => {
    if (!isReady || isBusy) {
        return;
    }
    video.currentTime = Number(timeSlider.value);
});

timecodeInput.addEventListener("change", () => {
    if (!isReady || isBusy) {
        return;
    }
    const parsed = parseTimecode(timecodeInput.value);
    if (parsed === null) {
        setStatus("タイムコードが不正です。");
        timecodeInput.value = formatTime(video.currentTime);
        return;
    }
    seekTo(parsed).then(() => {
        drawFrame();
        updateTimeLabels();
    });
});

timecodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        timecodeInput.blur();
    }
});

fpsInput.addEventListener("input", () => {
    if (!isReady || isBusy) {
        return;
    }
    syncSliderStep();
    syncFrameBounds();
    updateTimeLabels();
});

stepButtons.forEach((button) => {
    button.addEventListener("mousemove", (event) => {
        const rect = button.getBoundingClientRect();
        const isLeft = event.clientX < rect.left + rect.width / 2;
        button.classList.toggle("is-left", isLeft);
        button.classList.toggle("is-right", !isLeft);
    });

    button.addEventListener("mouseleave", () => {
        button.classList.remove("is-left", "is-right");
    });

    button.addEventListener("click", (event) => {
        if (!isReady || isBusy) {
            return;
        }
        const rect = button.getBoundingClientRect();
        const direction = event.clientX < rect.left + rect.width / 2 ? -1 : 1;
        const step = Number(button.dataset.step) || 1;
        handleFrameStep(direction, step);
    });
});

formatSelect.addEventListener("change", () => {
    updateFormatBadge();
    updateQualityField();
});

qualityRange.addEventListener("input", () => {
    qualityValue.textContent = Number(qualityRange.value).toFixed(2);
});

captureBtn.addEventListener("click", handleExactCapture);

rangeToggle.addEventListener("change", handleRangeToggle);

startFrameInput.addEventListener("change", () => {
    if (!isReady || isBusy) {
        return;
    }
    startFrameInput.value = clampFrame(startFrameInput.value);
    updateRangeLabels();
});

endFrameInput.addEventListener("change", () => {
    if (!isReady || isBusy) {
        return;
    }
    endFrameInput.value = clampFrame(endFrameInput.value);
    updateRangeLabels();
});

setStartBtn.addEventListener("click", () => {
    if (!isReady || isBusy) {
        return;
    }
    const frameIndex = getCurrentFrameIndex();
    startFrameInput.value = frameIndex;
    updateRangeLabels();
});

setEndBtn.addEventListener("click", () => {
    if (!isReady || isBusy) {
        return;
    }
    const frameIndex = getCurrentFrameIndex();
    endFrameInput.value = frameIndex;
    updateRangeLabels();
});

seekStartBtn.addEventListener("click", async () => {
    if (!isReady || isBusy) {
        return;
    }
    await seekTo(0);
    drawFrame();
    updateTimeLabels();
});

seekEndBtn.addEventListener("click", async () => {
    if (!isReady || isBusy) {
        return;
    }
    await seekTo(getFrameTime(getMaxFrame()));
    drawFrame();
    updateTimeLabels();
});

exportRangeBtn.addEventListener("click", handleExactRangeExport);

updateFormatBadge();
updateQualityField();
resetUI();
