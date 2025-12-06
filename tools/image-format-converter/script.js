const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
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
const applyBgToggle = document.getElementById("applyBgToggle");
const fileBaseNameInput = document.getElementById("fileBaseName");
const inputImageEl = document.getElementById("inputImage");
const outputImageEl = document.getElementById("outputImage");
const inputInfoEl = document.getElementById("inputInfo");
const outputInfoEl = document.getElementById("outputInfo");
const previewRow = document.getElementById("previewRow");
const singleModeBtn = document.getElementById("singleModeBtn");
const batchModeBtn = document.getElementById("batchModeBtn");
const modeHintEl = document.getElementById("modeHint");
const dropPrimary = document.getElementById("dropPrimary");
const dropSecondary = document.getElementById("dropSecondary");
const dropHint = document.getElementById("dropHint");
const batchInfoBox = document.getElementById("batchInfo");
const fileInfoBox = document.getElementById("fileInfo");
const folderNameEl = document.getElementById("folderName");
const batchCountEl = document.getElementById("batchCount");
const batchSizeEl = document.getElementById("batchSize");
const batchMetaEl = document.getElementById("batchMeta");
const fileNameOption = document.getElementById("fileNameOption");

const ACCEPT_TYPES = ["image/webp", "image/png", "image/jpeg", "image/jpg"];

let currentImage = null; // { file, width, height, objectUrl, bitmap? }
let outputUrl = null;
let outputBlob = null;
let mode = "single"; // single | batch
let batchFiles = [];

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

function replaceExt(path, newExt) {
    const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const dot = path.lastIndexOf(".");
    const hasExt = dot > slash;
    const stem = hasExt ? path.slice(0, dot) : path;
    return `${stem}.${newExt}`;
}

function folderLabelFromFile(file) {
    if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/").filter(Boolean);
        if (parts.length) return parts[0];
    }
    return file.name ? "選択フォルダ" : "未選択";
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

function switchMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    const isBatch = mode === "batch";
    singleModeBtn.classList.toggle("is-active", !isBatch);
    batchModeBtn.classList.toggle("is-active", isBatch);
    fileInfoBox.classList.toggle("hidden", isBatch);
    batchInfoBox.classList.toggle("hidden", !isBatch);
    fileNameOption.classList.toggle("hidden", isBatch);
    previewButton.classList.toggle("hidden", isBatch);
    previewRow.classList.toggle("hidden", isBatch);

    dropPrimary.textContent = isBatch ? "ここにフォルダをドロップ" : "ここに画像をドロップ";
    dropSecondary.textContent = isBatch ? "またはフォルダを選択（サブフォルダ含む）" : "またはファイルを選択（WEBP / PNG / JPG）";
    dropHint.textContent = isBatch ? "WEBP / PNG / JPG のみ対象。フォルダごと処理します。" : "ローカルファイルのみ対応。複数指定は先頭1枚を使用します。";
    modeHintEl.textContent = isBatch ? "まとめて変換。プレビューなし。" : "プレビュー付きで1枚ずつ確認";
    statusEl.textContent = isBatch ? "フォルダを選択してください" : "準備完了";
    downloadButton.textContent = isBatch ? "一括変換してZIP保存" : "ダウンロード";

    if (isBatch) {
        resetBatchUI();
    } else {
        resetUI();
    }
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

function resetBatchUI() {
    batchFiles = [];
    revokeUrl(currentImage?.objectUrl);
    invalidateOutput();
    currentImage = null;
    folderNameEl.textContent = "未選択";
    batchCountEl.textContent = "0 枚";
    batchSizeEl.textContent = "-";
    batchMetaEl.textContent = "WEBP / PNG / JPG のみを対象。サブフォルダも含めます。";
    fileBaseNameInput.value = "";
    inputImageEl.src = "";
    outputImageEl.src = "";
    inputInfoEl.textContent = "-";
    outputInfoEl.textContent = "-";
    clearError();
    setStatus("フォルダを選択してください");
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

function updateBatchInfoBox(files, label) {
    const count = files.length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    folderNameEl.textContent = label || (count ? folderLabelFromFile(files[0]) : "未選択");
    batchCountEl.textContent = `${count} 枚`;
    batchSizeEl.textContent = count ? formatBytes(totalSize) : "-";
    batchMetaEl.textContent = count ? "サブフォルダを含めて処理します。" : "WEBP / PNG / JPG のみを対象。サブフォルダも含めます。";
}

function updateQualityHint() {
    const format = getSelectedFormat();
    const isLossy = format === "image/jpeg" || format === "image/webp";
    qualityInput.disabled = !isLossy;
    qualityValueEl.textContent = `${qualityInput.value}%` + (isLossy ? "" : " (非適用)");

    // JPEGは必ず背景を適用。PNG/WEBPはユーザー設定に任せるが、切り替え時の状態を自然にする。
    if (format === "image/jpeg") {
        applyBgToggle.checked = true;
        applyBgToggle.disabled = true;
    } else {
        applyBgToggle.disabled = false;
    }
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
    if (mode !== "single") return;
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
    if (mode === "batch") return;
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
        updateQualityHint();
    } catch (err) {
        console.error(err);
        showError("画像の読み込みに失敗しました。");
        setStatus("失敗");
    }
}

function handleBatchFiles(fileList, label) {
    resetBatchUI();
    const files = Array.from(fileList || []).filter(f => ACCEPT_TYPES.includes(f.type));
    if (!files.length) {
        showError("対象フォーマットの画像が見つかりませんでした。");
        setStatus("未選択");
        return;
    }

    batchFiles = files;
    updateBatchInfoBox(files, label);
    clearError();
    setStatus(`${files.length} 件を読み込みました`);
}

function computeTargetSize(image = currentImage) {
    if (!image) return null;
    const { width: origW, height: origH } = image;
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

function canvasFromSource(image, targetSize) {
    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const ctx = canvas.getContext("2d");

    const format = getSelectedFormat();
    const shouldApplyBg = applyBgToggle.checked || format === "image/jpeg";
    if (shouldApplyBg) {
        ctx.fillStyle = bgColorInput.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const source = image.bitmap || image.img;
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

    const canvas = canvasFromSource(currentImage, size);
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

async function convertFileToBlob(file, format) {
    const loaded = await loadImage(file);
    const image = { file, ...loaded, type: file.type, name: file.name };
    const size = computeTargetSize(image);
    if (!size || size.width <= 0 || size.height <= 0) {
        throw new Error("リサイズ値が正しくありません。");
    }

    const canvas = canvasFromSource(image, size);
    if (!canvas) throw new Error("描画に失敗しました。");

    const quality = qualityValue(format);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, quality));
    if (!blob) throw new Error("出力の生成に失敗しました。");
    revokeUrl(image.objectUrl);
    return { blob, size, image };
}

async function handlePreview() {
    await generateOutput();
}

async function handleDownload() {
    if (mode === "batch") {
        await handleBatchDownload();
        return;
    }

    let result = null;
    if (!outputBlob) {
        result = await generateOutput();
    } else {
        result = { blob: outputBlob, format: getSelectedFormat(), size: computeTargetSize() };
    }
    if (!result) return;

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

fileSelect.addEventListener("click", () => {
    if (mode === "batch") {
        folderInput.click();
    } else {
        fileInput.click();
    }
});

fileInput.addEventListener("change", event => {
    if (mode !== "single") return;
    const [file] = event.target.files || [];
    handleFile(file);
    event.target.value = "";
});

folderInput.addEventListener("change", event => {
    if (mode !== "batch") return;
    handleBatchFiles(event.target.files, "選択フォルダ");
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
    if (event.dataTransfer?.files?.length) {
        if (mode === "batch") {
            handleBatchFiles(event.dataTransfer.files, "ドロップされたフォルダ/ファイル");
        } else {
            handleFile(event.dataTransfer.files[0]);
        }
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
applyBgToggle.addEventListener("change", invalidateOutput);

previewButton.addEventListener("click", handlePreview);
downloadButton.addEventListener("click", handleDownload);
clearButton.addEventListener("click", () => mode === "batch" ? resetBatchUI() : resetUI());

singleModeBtn.addEventListener("click", () => switchMode("single"));
batchModeBtn.addEventListener("click", () => switchMode("batch"));

async function handleBatchDownload() {
    if (!batchFiles.length) {
        showError("まずフォルダを選択してください。");
        return;
    }
    if (typeof JSZip === "undefined") {
        showError("JSZip の読み込みに失敗しました。ネットワーク接続を確認してください。");
        return;
    }

    clearError();
    const format = getSelectedFormat();
    const ext = extensionFromFormat(format);
    const zip = new JSZip();

    for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        try {
            setStatus(`変換中... (${i + 1}/${batchFiles.length})`);
            const { blob, image } = await convertFileToBlob(file, format);
            const relative = file.webkitRelativePath || file.name;
            const outPath = replaceExt(relative, ext);
            zip.file(outPath, blob);
        } catch (err) {
            console.error(err);
            showError(`変換に失敗したファイルがあります: ${file.name}`);
        }
    }

    setStatus("ZIP を生成しています...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    const anchor = document.createElement("a");
    anchor.href = zipUrl;
    anchor.download = `${folderNameEl.textContent || "converted"}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);
    setStatus("バッチ変換が完了しました");
}

updateQualityHint();
updateBgColorLabel();
resetUI();
