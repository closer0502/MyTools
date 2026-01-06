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

const detectVideoFps = () => {
    try {
        if (!video.captureStream) {
            return null;
        }
        const stream = video.captureStream();
        const track = stream.getVideoTracks()[0];
        if (!track) {
            return null;
        }
        const settings = track.getSettings();
        const fps = settings && Number.isFinite(settings.frameRate) ? settings.frameRate : null;
        track.stop();
        return fps;
    } catch (error) {
        return null;
    }
};

const getMaxFrame = () => {
    if (!isReady || !Number.isFinite(video.duration)) {
        return 0;
    }
    return Math.max(0, Math.floor(video.duration * getFps()));
};

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
    currentFrameLabel.textContent = `${Math.round(time * getFps())} frame`;
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
    const fps = getFps();
    const frameIndex = Math.round(video.currentTime * fps);
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
    const frameIndex = Math.round(video.currentTime * getFps());
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

video.addEventListener("loadedmetadata", () => {
    isReady = true;
    detectedFps = detectVideoFps();
    if (detectedFps) {
        fpsInput.value = Math.round(detectedFps);
    }
    syncSliderStep();
    timeSlider.max = video.duration || 0;
    timeSlider.value = video.currentTime || 0;
    timecodeInput.value = formatTime(video.currentTime || 0);
    startFrameInput.value = 0;
    endFrameInput.value = 0;
    updateFileMeta();
    updateTimeLabels();
    updateFormatBadge();
    syncFrameBounds();
    setControlsEnabled(true);
    setStatus("動画を読み込みました。");
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

captureBtn.addEventListener("click", handleCapture);

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
    const frameIndex = Math.round(video.currentTime * getFps());
    startFrameInput.value = frameIndex;
    updateRangeLabels();
});

setEndBtn.addEventListener("click", () => {
    if (!isReady || isBusy) {
        return;
    }
    const frameIndex = Math.round(video.currentTime * getFps());
    endFrameInput.value = frameIndex;
    updateRangeLabels();
});

exportRangeBtn.addEventListener("click", handleRangeExport);

updateFormatBadge();
updateQualityField();
resetUI();
