const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const fileSizeEl = document.getElementById("fileSize");
const fileDimsEl = document.getElementById("fileDims");
const previewBox = document.getElementById("previewBox");
const previewCanvas = document.getElementById("previewCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const selectionInfo = document.getElementById("selectionInfo");
const clearSelectionButton = document.getElementById("clearSelection");
const languageSelect = document.getElementById("languageSelect");
const runButton = document.getElementById("runButton");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const clearButton = document.getElementById("clearButton");
const statusEl = document.getElementById("status");
const errorBanner = document.getElementById("errorBanner");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const progressValue = document.getElementById("progressValue");
const outputEl = document.getElementById("output");

const previewCtx = previewCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");

const ACCEPT_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ACCEPT_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

const STATUS_LABELS = {
    "loading tesseract core": "OCRエンジン準備中",
    "initializing tesseract": "OCRエンジン初期化中",
    "loading language traineddata": "言語データ読み込み中",
    "recognizing text": "文字解析中",
};

const WORKER_OPTIONS = {
    logger: message => handleProgress(message),
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
};

const PREVIEW_MIN_HEIGHT = 240;
const PREVIEW_MAX_HEIGHT = 420;
const MIN_SELECTION_SIZE = 8;
const HANDLE_SIZE = 12;

let currentFile = null;
let currentImageUrl = null;
let currentImage = null; // { file, url, width, height, source }
let selection = null; // { x, y, w, h } in image coords
let worker = null;
let workerLanguage = null;
let resultText = "";
let isProcessing = false;

const previewLayout = {
    width: 0,
    height: 0,
    drawWidth: 0,
    drawHeight: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
};

const dragState = {
    active: false,
    mode: null,
    startSelection: null,
    startPoint: null,
    offset: null,
    pointerId: null,
};

function setStatus(message) {
    statusEl.textContent = message;
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
}

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
}

function setProgress(value) {
    const clamped = Math.min(Math.max(value, 0), 1);
    const percent = Math.round(clamped * 100);
    progressFill.style.width = `${percent}%`;
    progressValue.textContent = `${percent}%`;
}

function resetProgress() {
    progressLabel.textContent = "待機中";
    setProgress(0);
}

function handleProgress(message) {
    if (!message) return;
    if (message.status) {
        progressLabel.textContent = STATUS_LABELS[message.status] || message.status;
    }
    if (typeof message.progress === "number") {
        setProgress(message.progress);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDims(width, height) {
    return width && height ? `${width} x ${height}` : "-";
}

function basenameWithoutExt(name = "") {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name || "ocr-result";
}

function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
}

function releaseImageSource() {
    if (currentImage?.source && typeof currentImage.source.close === "function") {
        currentImage.source.close();
    }
}

function isSupportedImage(file) {
    if (!file) return false;
    if (ACCEPT_TYPES.includes(file.type)) return true;
    const name = (file.name || "").toLowerCase();
    return ACCEPT_EXTS.some(ext => name.endsWith(ext));
}

async function loadImage(file) {
    const objectUrl = URL.createObjectURL(file);
    let source = null;
    let width = 0;
    let height = 0;

    try {
        if (window.createImageBitmap) {
            source = await createImageBitmap(file, { imageOrientation: "from-image" });
            width = source.width;
            height = source.height;
        }
    } catch (err) {
        console.warn("createImageBitmap failed", err);
    }

    if (!source) {
        source = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = objectUrl;
        });
        width = source.naturalWidth;
        height = source.naturalHeight;
    }

    return { objectUrl, width, height, source };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect) {
    const r = { ...rect };
    if (r.w < 0) {
        r.x += r.w;
        r.w *= -1;
    }
    if (r.h < 0) {
        r.y += r.h;
        r.h *= -1;
    }
    return r;
}

function setCanvasSize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    previewCanvas.width = w;
    previewCanvas.height = h;
    overlayCanvas.width = w;
    overlayCanvas.height = h;
    previewCanvas.style.width = `${w}px`;
    previewCanvas.style.height = `${h}px`;
    overlayCanvas.style.width = `${w}px`;
    overlayCanvas.style.height = `${h}px`;
}

function updatePreviewLayout() {
    if (!currentImage) return;
    const width = previewBox.clientWidth || 0;
    if (!width) return;
    let height = Math.round(width * (currentImage.height / currentImage.width));
    height = Math.max(PREVIEW_MIN_HEIGHT, Math.min(PREVIEW_MAX_HEIGHT, height));
    setCanvasSize(width, height);

    const scale = Math.min(
        previewCanvas.width / currentImage.width,
        previewCanvas.height / currentImage.height
    );
    const drawWidth = currentImage.width * scale;
    const drawHeight = currentImage.height * scale;
    previewLayout.width = previewCanvas.width;
    previewLayout.height = previewCanvas.height;
    previewLayout.drawWidth = drawWidth;
    previewLayout.drawHeight = drawHeight;
    previewLayout.offsetX = (previewCanvas.width - drawWidth) / 2;
    previewLayout.offsetY = (previewCanvas.height - drawHeight) / 2;
    previewLayout.scale = scale;
}

function drawPreview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!currentImage) return;
    previewCtx.drawImage(
        currentImage.source,
        previewLayout.offsetX,
        previewLayout.offsetY,
        previewLayout.drawWidth,
        previewLayout.drawHeight
    );
    drawSelectionOverlay();
}

function clearPreview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    previewBox.classList.remove("has-image");
}

function imageRectToCanvas(rect) {
    return {
        x: previewLayout.offsetX + rect.x * previewLayout.scale,
        y: previewLayout.offsetY + rect.y * previewLayout.scale,
        w: rect.w * previewLayout.scale,
        h: rect.h * previewLayout.scale,
    };
}

function clampRectToImageCanvas(rect) {
    const bounds = {
        x: previewLayout.offsetX,
        y: previewLayout.offsetY,
        w: previewLayout.drawWidth,
        h: previewLayout.drawHeight,
    };
    const r = normalizeRect(rect);
    const x1 = clamp(r.x, bounds.x, bounds.x + bounds.w);
    const y1 = clamp(r.y, bounds.y, bounds.y + bounds.h);
    const x2 = clamp(r.x + r.w, bounds.x, bounds.x + bounds.w);
    const y2 = clamp(r.y + r.h, bounds.y, bounds.y + bounds.h);
    return {
        x: x1,
        y: y1,
        w: Math.max(0, x2 - x1),
        h: Math.max(0, y2 - y1),
    };
}

function canvasRectToImage(rect) {
    const clamped = clampRectToImageCanvas(rect);
    const x = (clamped.x - previewLayout.offsetX) / previewLayout.scale;
    const y = (clamped.y - previewLayout.offsetY) / previewLayout.scale;
    const w = clamped.w / previewLayout.scale;
    const h = clamped.h / previewLayout.scale;
    return {
        x: clamp(x, 0, currentImage.width),
        y: clamp(y, 0, currentImage.height),
        w: clamp(w, 0, currentImage.width - x),
        h: clamp(h, 0, currentImage.height - y),
    };
}

function canvasPointToImage(point) {
    const x = (point.x - previewLayout.offsetX) / previewLayout.scale;
    const y = (point.y - previewLayout.offsetY) / previewLayout.scale;
    return {
        x: clamp(x, 0, currentImage.width),
        y: clamp(y, 0, currentImage.height),
    };
}

function clampSelectionRect(rect) {
    const x = clamp(rect.x, 0, currentImage.width - MIN_SELECTION_SIZE);
    const y = clamp(rect.y, 0, currentImage.height - MIN_SELECTION_SIZE);
    const w = clamp(rect.w, MIN_SELECTION_SIZE, currentImage.width - x);
    const h = clamp(rect.h, MIN_SELECTION_SIZE, currentImage.height - y);
    return { x, y, w, h };
}

function updateSelection(rect) {
    selection = clampSelectionRect(rect);
    updateSelectionInfo();
    drawSelectionOverlay();
}

function isPointInRect(point, rect) {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.w &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.h
    );
}

function getHandleAtPoint(point) {
    if (!selection) return null;
    const rect = imageRectToCanvas(selection);
    const clamped = clampRectToImageCanvas(rect);
    const half = HANDLE_SIZE / 2;
    const handles = [
        { key: "nw", x: clamped.x, y: clamped.y },
        { key: "n", x: clamped.x + clamped.w / 2, y: clamped.y },
        { key: "ne", x: clamped.x + clamped.w, y: clamped.y },
        { key: "e", x: clamped.x + clamped.w, y: clamped.y + clamped.h / 2 },
        { key: "se", x: clamped.x + clamped.w, y: clamped.y + clamped.h },
        { key: "s", x: clamped.x + clamped.w / 2, y: clamped.y + clamped.h },
        { key: "sw", x: clamped.x, y: clamped.y + clamped.h },
        { key: "w", x: clamped.x, y: clamped.y + clamped.h / 2 },
    ];

    for (const handle of handles) {
        const hitRect = {
            x: handle.x - half,
            y: handle.y - half,
            w: HANDLE_SIZE,
            h: HANDLE_SIZE,
        };
        if (isPointInRect(point, hitRect)) {
            return handle.key;
        }
    }
    return null;
}

function getActiveCanvasRect() {
    if (selection) {
        return imageRectToCanvas(selection);
    }
    return null;
}

function drawSelectionOverlay() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!currentImage) return;
    const rect = getActiveCanvasRect();
    if (!rect) return;
    const clamped = clampRectToImageCanvas(rect);
    if (clamped.w < 2 || clamped.h < 2) return;

    overlayCtx.save();
    overlayCtx.fillStyle = "rgba(56, 189, 248, 0.18)";
    overlayCtx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.fillRect(clamped.x, clamped.y, clamped.w, clamped.h);
    overlayCtx.strokeRect(clamped.x + 0.5, clamped.y + 0.5, clamped.w - 1, clamped.h - 1);
    overlayCtx.setLineDash([]);
    drawSelectionHandles(clamped);
    overlayCtx.restore();
}

function drawSelectionHandles(rect) {
    const half = HANDLE_SIZE / 2;
    const points = [
        { key: "nw", x: rect.x, y: rect.y },
        { key: "n", x: rect.x + rect.w / 2, y: rect.y },
        { key: "ne", x: rect.x + rect.w, y: rect.y },
        { key: "e", x: rect.x + rect.w, y: rect.y + rect.h / 2 },
        { key: "se", x: rect.x + rect.w, y: rect.y + rect.h },
        { key: "s", x: rect.x + rect.w / 2, y: rect.y + rect.h },
        { key: "sw", x: rect.x, y: rect.y + rect.h },
        { key: "w", x: rect.x, y: rect.y + rect.h / 2 },
    ];

    overlayCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
    overlayCtx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    overlayCtx.lineWidth = 1.5;

    points.forEach(point => {
        overlayCtx.beginPath();
        overlayCtx.rect(point.x - half, point.y - half, HANDLE_SIZE, HANDLE_SIZE);
        overlayCtx.fill();
        overlayCtx.stroke();
    });
}

function isFullSelection(rect) {
    if (!currentImage || !rect) return false;
    const margin = 1;
    return (
        rect.x <= margin &&
        rect.y <= margin &&
        rect.w >= currentImage.width - margin &&
        rect.h >= currentImage.height - margin
    );
}

function updateSelectionInfo() {
    if (!selection) {
        selectionInfo.textContent = "未選択";
        clearSelectionButton.disabled = true;
        return;
    }
    const label = isFullSelection(selection) ? "全体" : "選択中";
    selectionInfo.textContent = `${label} (${Math.round(selection.w)} x ${Math.round(selection.h)} px)`;
    clearSelectionButton.disabled = false;
}

function clearSelection() {
    if (currentImage) {
        updateSelection({
            x: 0,
            y: 0,
            w: currentImage.width,
            h: currentImage.height,
        });
        dragState.active = false;
        dragState.mode = null;
        dragState.startSelection = null;
        dragState.startPoint = null;
        dragState.offset = null;
        return;
    } else {
        selection = null;
    }
    dragState.active = false;
    dragState.mode = null;
    dragState.startSelection = null;
    dragState.startPoint = null;
    dragState.offset = null;
    drawSelectionOverlay();
    updateSelectionInfo();
}

function resetOutput() {
    resultText = "";
    outputEl.textContent = "";
    copyButton.disabled = true;
    downloadButton.disabled = true;
}

function setWorking(working) {
    isProcessing = working;
    runButton.disabled = working || !currentFile;
    copyButton.disabled = working || !resultText;
    downloadButton.disabled = working || !resultText;
    fileSelect.disabled = working;
    fileInput.disabled = working;
    languageSelect.disabled = working;
    clearButton.disabled = working;
    clearSelectionButton.disabled = working || !selection;
    overlayCanvas.style.pointerEvents = working || !currentImage ? "none" : "auto";
}

function resetUI() {
    releaseImageSource();
    revokeUrl(currentImageUrl);
    currentFile = null;
    currentImageUrl = null;
    currentImage = null;
    fileNameEl.textContent = "未選択";
    fileMetaEl.textContent = "PNG / JPG / WEBP のみ";
    fileSizeEl.textContent = "-";
    fileDimsEl.textContent = "-";
    clearSelection();
    clearPreview();
    overlayCanvas.style.pointerEvents = "none";
    resetOutput();
    clearError();
    resetProgress();
    setStatus("準備完了");
    runButton.disabled = true;
}

async function handleFile(file) {
    resetOutput();
    clearError();
    resetProgress();

    if (isProcessing) return;
    if (!file) return;
    if (!isSupportedImage(file)) {
        showError("PNG / JPG / WEBP のいずれかを選択してください。");
        setStatus("未対応フォーマット");
        return;
    }

    setStatus("画像を読み込み中...");
    try {
        const loaded = await loadImage(file);
        releaseImageSource();
        revokeUrl(currentImageUrl);

        currentFile = file;
        currentImageUrl = loaded.objectUrl;
        currentImage = {
            file,
            url: loaded.objectUrl,
            width: loaded.width,
            height: loaded.height,
            source: loaded.source,
        };

        fileNameEl.textContent = file.name;
        fileMetaEl.textContent = file.type || "不明";
        fileSizeEl.textContent = formatBytes(file.size);
        fileDimsEl.textContent = formatDims(loaded.width, loaded.height);

        previewBox.classList.add("has-image");
        updatePreviewLayout();
        clearSelection();
        drawPreview();
        overlayCanvas.style.pointerEvents = "auto";

        setStatus("準備完了");
        runButton.disabled = false;
    } catch (err) {
        console.error(err);
        showError("画像の読み込みに失敗しました。");
        setStatus("失敗");
    }
}

async function ensureWorker(lang) {
    if (!window.Tesseract) {
        throw new Error("Tesseract.js failed to load");
    }

    if (!worker) {
        worker = await Tesseract.createWorker(WORKER_OPTIONS);
    }

    if (workerLanguage !== lang) {
        await worker.loadLanguage(lang);
        await worker.initialize(lang);
        workerLanguage = lang;
    }

    return worker;
}

function getOcrTarget() {
    if (!currentImage || !selection) return currentImageUrl;
    if (isFullSelection(selection)) return currentImageUrl;
    const rect = {
        x: Math.round(selection.x),
        y: Math.round(selection.y),
        w: Math.round(selection.w),
        h: Math.round(selection.h),
    };
    if (rect.w < MIN_SELECTION_SIZE || rect.h < MIN_SELECTION_SIZE) {
        return currentImageUrl;
    }

    const canvas = document.createElement("canvas");
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
        currentImage.source,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        rect.w,
        rect.h
    );
    return canvas;
}

async function runOcr() {
    if (isProcessing) return;
    if (!currentFile || !currentImageUrl) {
        showError("まず画像を選択してください。");
        return;
    }

    clearError();
    resetOutput();
    resetProgress();
    setWorking(true);
    setStatus("OCR準備中...");

    try {
        const lang = languageSelect.value;
        const ocrWorker = await ensureWorker(lang);
        setStatus("OCR実行中...");
        const target = getOcrTarget();
        const { data } = await ocrWorker.recognize(target);
        const text = (data.text || "").trim();
        resultText = text;
        outputEl.textContent = text || "文字が検出されませんでした。";
        copyButton.disabled = !text;
        downloadButton.disabled = !text;
        progressLabel.textContent = "完了";
        setProgress(1);
        setStatus("OCR完了");
    } catch (err) {
        console.error(err);
        showError("OCRに失敗しました。言語データの取得状況を確認してください。");
        setStatus("失敗");
    } finally {
        setWorking(false);
    }
}

async function handleCopy() {
    if (!resultText) return;
    try {
        await navigator.clipboard.writeText(resultText);
        setStatus("コピーしました");
    } catch (err) {
        console.error(err);
        showError("クリップボードへのコピーに失敗しました。");
    }
}

function handleDownload() {
    if (!resultText) return;
    const blob = new Blob([resultText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const base = basenameWithoutExt(currentFile?.name || "ocr-result");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${base}-ocr.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("テキストを保存しました");
}

function getCanvasPoint(event) {
    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
    };
}

function pointInImageArea(point) {
    const minX = previewLayout.offsetX;
    const minY = previewLayout.offsetY;
    const maxX = previewLayout.offsetX + previewLayout.drawWidth;
    const maxY = previewLayout.offsetY + previewLayout.drawHeight;
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function handlePointerDown(event) {
    if (!currentImage || isProcessing) return;
    const point = getCanvasPoint(event);
    if (!pointInImageArea(point)) return;
    if (!selection) {
        clearSelection();
    }
    const handle = getHandleAtPoint(point);
    const rectCanvas = selection ? clampRectToImageCanvas(imageRectToCanvas(selection)) : null;
    const inSelection = rectCanvas ? isPointInRect(point, rectCanvas) : false;
    if (!handle && !inSelection) return;

    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.mode = handle || "move";
    dragState.startSelection = selection ? { ...selection } : null;
    dragState.startPoint = canvasPointToImage(point);
    dragState.offset = dragState.mode === "move" && selection
        ? { x: dragState.startPoint.x - selection.x, y: dragState.startPoint.y - selection.y }
        : null;

    overlayCanvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
    if (!currentImage || isProcessing) return;
    if (!dragState.active) return;
    const point = canvasPointToImage(getCanvasPoint(event));
    const start = dragState.startSelection;
    if (!start) return;

    let next = { ...start };
    const imgW = currentImage.width;
    const imgH = currentImage.height;

    switch (dragState.mode) {
        case "move": {
            const offset = dragState.offset || { x: 0, y: 0 };
            next.x = clamp(point.x - offset.x, 0, imgW - start.w);
            next.y = clamp(point.y - offset.y, 0, imgH - start.h);
            break;
        }
        case "n": {
            const anchorY = start.y + start.h;
            next.y = clamp(point.y, 0, anchorY - MIN_SELECTION_SIZE);
            next.h = anchorY - next.y;
            break;
        }
        case "s": {
            next.h = clamp(point.y - start.y, MIN_SELECTION_SIZE, imgH - start.y);
            break;
        }
        case "w": {
            const anchorX = start.x + start.w;
            next.x = clamp(point.x, 0, anchorX - MIN_SELECTION_SIZE);
            next.w = anchorX - next.x;
            break;
        }
        case "e": {
            next.w = clamp(point.x - start.x, MIN_SELECTION_SIZE, imgW - start.x);
            break;
        }
        case "nw": {
            const anchorX = start.x + start.w;
            const anchorY = start.y + start.h;
            next.x = clamp(point.x, 0, anchorX - MIN_SELECTION_SIZE);
            next.y = clamp(point.y, 0, anchorY - MIN_SELECTION_SIZE);
            next.w = anchorX - next.x;
            next.h = anchorY - next.y;
            break;
        }
        case "ne": {
            const anchorY = start.y + start.h;
            next.y = clamp(point.y, 0, anchorY - MIN_SELECTION_SIZE);
            next.h = anchorY - next.y;
            next.w = clamp(point.x - start.x, MIN_SELECTION_SIZE, imgW - start.x);
            break;
        }
        case "sw": {
            const anchorX = start.x + start.w;
            next.x = clamp(point.x, 0, anchorX - MIN_SELECTION_SIZE);
            next.w = anchorX - next.x;
            next.h = clamp(point.y - start.y, MIN_SELECTION_SIZE, imgH - start.y);
            break;
        }
        case "se": {
            next.w = clamp(point.x - start.x, MIN_SELECTION_SIZE, imgW - start.x);
            next.h = clamp(point.y - start.y, MIN_SELECTION_SIZE, imgH - start.y);
            break;
        }
        default:
            break;
    }

    updateSelection(next);
}

function handlePointerUp(event) {
    if (!dragState.active) return;
    if (event.pointerId === dragState.pointerId) {
        overlayCanvas.releasePointerCapture(event.pointerId);
    }
    dragState.active = false;
    dragState.pointerId = null;
    dragState.mode = null;
    dragState.startSelection = null;
    dragState.startPoint = null;
    dragState.offset = null;
}

fileSelect.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", event => {
    const [file] = event.target.files || [];
    handleFile(file);
    event.target.value = "";
});

dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));

dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (isProcessing) return;
    const [file] = event.dataTransfer?.files || [];
    handleFile(file);
});

["dragover", "drop"].forEach(evt => {
    window.addEventListener(evt, event => event.preventDefault());
});

overlayCanvas.addEventListener("pointerdown", handlePointerDown);
overlayCanvas.addEventListener("pointermove", handlePointerMove);
overlayCanvas.addEventListener("pointerup", handlePointerUp);
overlayCanvas.addEventListener("pointerleave", handlePointerUp);
overlayCanvas.addEventListener("pointercancel", handlePointerUp);

clearSelectionButton.addEventListener("click", clearSelection);

runButton.addEventListener("click", runOcr);
copyButton.addEventListener("click", handleCopy);
downloadButton.addEventListener("click", handleDownload);
clearButton.addEventListener("click", resetUI);

window.addEventListener("resize", () => {
    if (!currentImage) return;
    updatePreviewLayout();
    drawPreview();
});

resetUI();
