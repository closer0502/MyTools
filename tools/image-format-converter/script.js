const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const fileDimsEl = document.getElementById("fileDims");
const statusEl = document.getElementById("status");
const errorBanner = document.getElementById("errorBanner");
const previewButton = document.getElementById("previewButton");
const downloadButton = document.getElementById("downloadButton");
const clearButton = document.getElementById("clearButton");
const qualityInput = document.getElementById("quality");
const qualityValueEl = document.getElementById("qualityValue");
const formatRadios = document.querySelectorAll("input[name='format']");
const resizeToggle = document.getElementById("resizeToggle");
const resizeGrid = document.getElementById("resizeGrid");
const resizeUnitRow = document.getElementById("resizeUnitRow");
const resizeUnitRadios = document.querySelectorAll("input[name='resizeUnit']");
const resizeWidth = document.getElementById("resizeWidth");
const resizeHeight = document.getElementById("resizeHeight");
const lockRatio = document.getElementById("lockRatio");
const bgColorInput = document.getElementById("bgColor");
const bgColorValue = document.getElementById("bgColorValue");
const fileBaseNameInput = document.getElementById("fileBaseName");
const inputImageEl = document.getElementById("inputImage");
const outputImageEl = document.getElementById("outputImage");
const inputInfoEl = document.getElementById("inputInfo");
const outputInfoEl = document.getElementById("outputInfo");

const ACCEPT_TYPES = ["image/webp", "image/png", "image/jpeg", "image/jpg"];

let currentImage = null; // { file, width, height, objectUrl, bitmap? }
let outputUrl = null;
let outputBlob = null;

function invalidateOutput() {
    revokeUrl(outputUrl);
    outputUrl = null;
    outputBlob = null;
    outputImageEl.src = "";
    outputInfoEl.textContent = "-";
}

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

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDims(w, h) {
    return w && h ? `${w} x ${h}` : "-";
}

function basenameWithoutExt(name = "") {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name || "converted-image";
}

function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
}

function resetUI() {
    revokeUrl(currentImage?.objectUrl);
    invalidateOutput();
    currentImage = null;
    fileNameEl.textContent = "未選択";
    fileMetaEl.textContent = "WEBP / PNG / JPG のみ";
    fileDimsEl.textContent = "-";
    inputImageEl.src = "";
    outputImageEl.src = "";
    inputInfoEl.textContent = "-";
    outputInfoEl.textContent = "-";
    fileBaseNameInput.value = "";
    resizeToggle.checked = false;
    resizeWidth.value = "";
    resizeHeight.value = "";
    lockRatio.checked = true;
    resizeGrid.setAttribute("aria-disabled", "true");
    resizeUnitRow.setAttribute("aria-disabled", "true");
    resizeWidth.disabled = true;
    resizeHeight.disabled = true;
    lockRatio.disabled = true;
    resizeUnitRadios.forEach(r => r.disabled = true);
    resizeUnitRadios.forEach(r => r.checked = r.value === "px");
    updateResizePlaceholders();
    clearError();
    setStatus("準備完了");
}

async function loadImage(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
        if (window.createImageBitmap) {
            const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
            return { width: bitmap.width, height: bitmap.height, bitmap, objectUrl };
        }
    } catch (err) {
        console.warn("createImageBitmap failed, fallback", err);
    }

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, img, objectUrl };
}

function updateQualityHint() {
    const format = getSelectedFormat();
    const isLossy = format === "image/jpeg" || format === "image/webp";
    qualityInput.disabled = !isLossy;
    qualityValueEl.textContent = `${qualityInput.value}%` + (isLossy ? "" : " (非適用)");
}

function updateBgColorLabel() {
    bgColorValue.textContent = bgColorInput.value.toLowerCase();
}

function toggleResize(enable) {
    resizeGrid.setAttribute("aria-disabled", enable ? "false" : "true");
    resizeUnitRow.setAttribute("aria-disabled", enable ? "false" : "true");
    resizeWidth.disabled = !enable;
    resizeHeight.disabled = !enable;
    lockRatio.disabled = !enable;
    resizeUnitRadios.forEach(r => r.disabled = !enable);
    if (enable) updateResizePlaceholders();
}

function updateResizePlaceholders() {
    const unit = Array.from(resizeUnitRadios).find(r => r.checked)?.value || "px";
    resizeWidth.placeholder = unit === "percent" ? "例: 50" : "例: 800";
    resizeHeight.placeholder = unit === "percent" ? "例: 50" : "例: 600";
}

function handleRatioLockChange(changedInput) {
    if (!lockRatio.checked || !currentImage) return;
    const { width, height } = currentImage;
    const unit = Array.from(resizeUnitRadios).find(r => r.checked)?.value || "px";
    const toPixels = (value, base) => unit === "percent" ? base * (value / 100) : value;
    const toUnit = (valuePx, base) => unit === "percent" ? Math.round((valuePx / base) * 100) : Math.round(valuePx);

    const inputW = Number(resizeWidth.value);
    const inputH = Number(resizeHeight.value);
    const ratio = width / height;

    if (changedInput === "width") {
        const targetWpx = inputW > 0 ? toPixels(inputW, width) : width;
        const targetHpx = targetWpx / ratio;
        resizeHeight.value = toUnit(targetHpx, height);
    } else if (changedInput === "height") {
        const targetHpx = inputH > 0 ? toPixels(inputH, height) : height;
        const targetWpx = targetHpx * ratio;
        resizeWidth.value = toUnit(targetWpx, width);
    }
}

function getSelectedFormat() {
    const checked = Array.from(formatRadios).find(r => r.checked);
    return checked ? checked.value : "image/webp";
}

async function handleFile(file) {
    resetUI();
    if (!file) return;
    if (!ACCEPT_TYPES.includes(file.type)) {
        showError("WEBP / PNG / JPG のいずれかを選択してください。");
        setStatus("未対応フォーマット");
        return;
    }

    setStatus("読み込み中...");
    clearError();

    try {
        const loaded = await loadImage(file);
        currentImage = { file, ...loaded, type: file.type, name: file.name };

        fileNameEl.textContent = file.name;
        fileMetaEl.textContent = `${file.type || "不明"} / ${formatBytes(file.size)}`;
        fileDimsEl.textContent = formatDims(loaded.width, loaded.height);
        fileBaseNameInput.value = basenameWithoutExt(file.name);
        inputImageEl.src = loaded.objectUrl;
        inputInfoEl.textContent = `${formatDims(loaded.width, loaded.height)} | ${file.type || ""}`;
        setStatus("読み込み完了");
    } catch (err) {
        console.error(err);
        showError("画像の読み込みに失敗しました。");
        setStatus("失敗");
    }
}

function computeTargetSize() {
    if (!currentImage) return null;
    const { width: origW, height: origH } = currentImage;
    if (!resizeToggle.checked) return { width: origW, height: origH };

    const ratio = origW / origH;
    const wVal = Number(resizeWidth.value);
    const hVal = Number(resizeHeight.value);
    const unit = Array.from(resizeUnitRadios).find(r => r.checked)?.value || "px";

    const toPixels = (value, base) => {
        if (unit === "percent") {
            return Math.round(base * (value / 100));
        }
        return value;
    };

    if (lockRatio.checked) {
        if (wVal > 0 && !hVal) {
            const targetW = toPixels(wVal, origW);
            return { width: targetW, height: Math.round(targetW / ratio) };
        }
        if (hVal > 0 && !wVal) {
            const targetH = toPixels(hVal, origH);
            return { width: Math.round(targetH * ratio), height: targetH };
        }
        if (wVal > 0 && hVal > 0) {
            const targetW = toPixels(wVal, origW);
            return { width: targetW, height: Math.round(targetW / ratio) };
        }
        return { width: origW, height: origH };
    }

    return {
        width: wVal > 0 ? toPixels(wVal, origW) : origW,
        height: hVal > 0 ? toPixels(hVal, origH) : origH,
    };
}

function canvasFromSource(targetSize) {
    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const ctx = canvas.getContext("2d");

    const format = getSelectedFormat();
    if (format === "image/jpeg") {
        ctx.fillStyle = bgColorInput.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const source = currentImage.bitmap || currentImage.img;
    if (!source) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function qualityValue(format) {
    if (format === "image/png") return undefined;
    const q = Number(qualityInput.value) / 100;
    return Math.min(Math.max(q, 0), 1);
}

function extensionFromFormat(format) {
    if (format === "image/png") return "png";
    if (format === "image/jpeg") return "jpg";
    return "webp";
}

async function generateOutput() {
    clearError();
    if (!currentImage) {
        showError("まず画像を選択してください。");
        return null;
    }

    const format = getSelectedFormat();
    const size = computeTargetSize();
    if (!size || size.width <= 0 || size.height <= 0) {
        showError("リサイズ値が正しくありません。");
        return null;
    }

    setStatus("変換中...");

    const canvas = canvasFromSource(size);
    if (!canvas) {
        showError("描画に失敗しました。");
        setStatus("失敗");
        return null;
    }

    const quality = qualityValue(format);

    const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, format, quality);
    });

    if (!blob) {
        showError("出力の生成に失敗しました。");
        setStatus("失敗");
        return null;
    }

    revokeUrl(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    outputBlob = blob;
    outputImageEl.src = outputUrl;
    outputInfoEl.textContent = `${formatDims(size.width, size.height)} | ${formatBytes(blob.size)}`;
    setStatus("プレビュー生成完了");
    return { blob, format, size };
}

async function handlePreview() {
    await generateOutput();
}

async function handleDownload() {
    let result = null;
    if (!outputBlob) {
        result = await generateOutput();
    } else {
        result = { blob: outputBlob, format: getSelectedFormat(), size: computeTargetSize() };
    }
    if (!result) return;

    const { blob } = result;
    const format = getSelectedFormat();
    const baseName = (fileBaseNameInput.value || basenameWithoutExt(currentImage.name)).trim() || "converted-image";
    const ext = extensionFromFormat(format);
    const filename = `${baseName}.${ext}`;

    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = filename;
    a.click();
    setStatus("ダウンロード完了");
}

// Event bindings

fileSelect.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", event => {
    const [file] = event.target.files || [];
    handleFile(file);
});

dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));

dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (event.dataTransfer?.files?.length) {
        handleFile(event.dataTransfer.files[0]);
    }
});

["dragover", "drop"].forEach(evt => {
    window.addEventListener(evt, e => {
        e.preventDefault();
    });
});

formatRadios.forEach(radio => radio.addEventListener("change", () => {
    updateQualityHint();
    invalidateOutput();
}));

qualityInput.addEventListener("input", () => {
    updateQualityHint();
    invalidateOutput();
});

resizeToggle.addEventListener("change", () => {
    const enabled = resizeToggle.checked;
    toggleResize(enabled);
    if (!enabled) {
        resizeWidth.value = "";
        resizeHeight.value = "";
    }
    invalidateOutput();
});

resizeUnitRadios.forEach(radio => radio.addEventListener("change", () => {
    updateResizePlaceholders();
    invalidateOutput();
}));

resizeWidth.addEventListener("input", () => { handleRatioLockChange("width"); invalidateOutput(); });
resizeHeight.addEventListener("input", () => { handleRatioLockChange("height"); invalidateOutput(); });
lockRatio.addEventListener("change", () => { handleRatioLockChange("lock"); invalidateOutput(); });

bgColorInput.addEventListener("input", () => { updateBgColorLabel(); invalidateOutput(); });

previewButton.addEventListener("click", handlePreview);
downloadButton.addEventListener("click", handleDownload);
clearButton.addEventListener("click", resetUI);

updateQualityHint();
updateBgColorLabel();
resetUI();
