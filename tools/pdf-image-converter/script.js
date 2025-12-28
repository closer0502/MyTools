/* global pdfjsLib, JSZip */

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const pageCountEl = document.getElementById("pageCount");
const pageList = document.getElementById("pageList");
const pageEmpty = document.getElementById("pageEmpty");
const selectionCountEl = document.getElementById("selectionCount");
const selectAllBtn = document.getElementById("selectAll");
const clearSelectionBtn = document.getElementById("clearSelection");
const invertSelectionBtn = document.getElementById("invertSelection");
const imageFormat = document.getElementById("imageFormat");
const qualityRow = document.getElementById("qualityRow");
const qualityInput = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const scaleSelect = document.getElementById("scale");
const bgColorInput = document.getElementById("bgColor");
const bgColorValue = document.getElementById("bgColorValue");
const applyBg = document.getElementById("applyBg");
const filePrefixInput = document.getElementById("filePrefix");
const scaledSizeEl = document.getElementById("scaledSize");
const statusEl = document.getElementById("status");
const convertSelectedBtn = document.getElementById("convertSelected");
const convertAllBtn = document.getElementById("convertAll");
const resetAllBtn = document.getElementById("resetAll");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const errorBanner = document.getElementById("errorBanner");

const state = {
    pdfDoc: null,
    file: null,
    baseName: "",
    isBusy: false,
    pageItems: []
};

const THUMB_MAX_WIDTH = 180;

if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
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

function setProgress(current, total) {
    if (total <= 0) {
        progressBar.classList.add("hidden");
        progressFill.style.width = "0%";
        return;
    }
    const percent = Math.min(100, Math.round((current / total) * 100));
    progressBar.classList.remove("hidden");
    progressFill.style.width = `${percent}%`;
}

function resetProgress() {
    progressBar.classList.add("hidden");
    progressFill.style.width = "0%";
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "-";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function sanitizeName(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.replace(/[\\/:*?"<>|]+/g, "_");
}

function getOutputPrefix() {
    const inputValue = sanitizeName(filePrefixInput.value);
    if (inputValue) return inputValue;
    return sanitizeName(state.baseName) || "pdf-pages";
}

function updateSelectionCount() {
    const checkboxes = pageList.querySelectorAll("input[type='checkbox']");
    const selected = Array.from(checkboxes).filter((item) => item.checked).length;
    selectionCountEl.textContent = `${selected} / ${checkboxes.length}`;
    const hasPdf = Boolean(state.pdfDoc);
    convertSelectedBtn.disabled = state.isBusy || !hasPdf || selected === 0;
    convertAllBtn.disabled = state.isBusy || !hasPdf;
    selectAllBtn.disabled = state.isBusy || !hasPdf;
    clearSelectionBtn.disabled = state.isBusy || !hasPdf;
    invertSelectionBtn.disabled = state.isBusy || !hasPdf;
}

function setBusy(isBusy) {
    state.isBusy = isBusy;
    fileInput.disabled = isBusy;
    fileSelect.disabled = isBusy;
    resetAllBtn.disabled = isBusy;
    imageFormat.disabled = isBusy;
    qualityInput.disabled = isBusy;
    scaleSelect.disabled = isBusy;
    bgColorInput.disabled = isBusy;
    filePrefixInput.disabled = isBusy;
    if (isBusy) {
        dropZone.classList.add("is-disabled");
    } else {
        dropZone.classList.remove("is-disabled");
    }
    updateFormatUI();
    updateSelectionCount();
}

function updateFormatUI() {
    const isJpeg = imageFormat.value === "image/jpeg";
    qualityRow.classList.toggle("hidden", !isJpeg);
    if (isJpeg) {
        applyBg.checked = true;
    }
    applyBg.disabled = state.isBusy || isJpeg;
}

function updateColorValue() {
    bgColorValue.textContent = bgColorInput.value.toLowerCase();
}

function updateQualityValue() {
    qualityValue.textContent = `${qualityInput.value}%`;
}

function updateScaledSize() {
    if (!scaledSizeEl) return;
    const reference = state.pageItems.find((item) => item.size);
    if (!reference) {
        scaledSizeEl.textContent = "変換後サイズ: -";
        return;
    }
    const scale = Number.parseFloat(scaleSelect.value);
    const width = Math.round(reference.size.width * scale);
    const height = Math.round(reference.size.height * scale);
    scaledSizeEl.textContent = `変換後サイズ: ${width} x ${height}px`;
}

function getSelectedPages() {
    const pages = [];
    state.pageItems.forEach((item, index) => {
        if (item.checkbox.checked) {
            pages.push(index + 1);
        }
    });
    return pages;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function renderThumbnail(pageNumber) {
    const page = await state.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1, THUMB_MAX_WIDTH / viewport.width);
    const thumbViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(thumbViewport.width);
    canvas.height = Math.floor(thumbViewport.height);
    const ctx = canvas.getContext("2d", { alpha: true });
    await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    page.cleanup();
    return {
        dataUrl,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height)
    };
}

async function renderPageToBlob(pageNumber, options) {
    const page = await state.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: options.scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: !options.applyBackground });
    if (options.applyBackground) {
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, options.format, options.quality);
    });
    return blob;
}

async function loadPdf(file) {
    if (!file) return;
    if (typeof pdfjsLib === "undefined") {
        showError("PDF.jsの読み込みに失敗しました。ネットワーク接続を確認してください。");
        return;
    }
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        showError("PDFファイルを選択してください。");
        return;
    }

    clearError();
    setBusy(true);
    setStatus("PDFを読み込み中...");
    resetProgress();

    try {
        if (state.pdfDoc) {
            await state.pdfDoc.destroy();
        }
        const data = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data });
        state.pdfDoc = await loadingTask.promise;
        state.file = file;
        state.baseName = file.name.replace(/\.[^.]+$/, "");

        fileNameEl.textContent = file.name;
        fileMetaEl.textContent = `サイズ: ${formatBytes(file.size)}`;
        pageCountEl.textContent = state.pdfDoc.numPages;
        filePrefixInput.placeholder = `例: ${state.baseName || "pdf-pages"}`;

        pageList.innerHTML = "";
        state.pageItems = [];
        pageEmpty.classList.add("hidden");
        updateScaledSize();

        const fragment = document.createDocumentFragment();
        for (let pageNumber = 1; pageNumber <= state.pdfDoc.numPages; pageNumber += 1) {
            const listItem = document.createElement("li");
            listItem.className = "page-card";
            listItem.innerHTML = `
                <div class="page-card-head">
                    <label class="page-toggle">
                        <input type="checkbox" class="page-check" data-page="${pageNumber}" checked>
                    <span>ページ ${pageNumber}</span>
                    </label>
                    <span class="mono" data-meta>...</span>
                </div>
                <div class="page-thumb">
                    <span class="thumb-placeholder">描画中...</span>
                    <img class="hidden" alt="ページ${pageNumber}のプレビュー">
                </div>
            `;
            fragment.appendChild(listItem);
            state.pageItems.push({
                checkbox: listItem.querySelector("input"),
                meta: listItem.querySelector("[data-meta]"),
                placeholder: listItem.querySelector(".thumb-placeholder"),
                img: listItem.querySelector("img"),
                size: null
            });
        }
        pageList.appendChild(fragment);
        updateSelectionCount();

        setStatus("サムネイルを生成中...");
        for (let i = 0; i < state.pageItems.length; i += 1) {
            const pageNumber = i + 1;
            const { dataUrl, width, height } = await renderThumbnail(pageNumber);
            const item = state.pageItems[i];
            if (item) {
                item.img.src = dataUrl;
                item.img.classList.remove("hidden");
                item.placeholder.classList.add("hidden");
                item.meta.textContent = `${width} x ${height}px`;
                item.size = { width, height };
                updateScaledSize();
            }
            setProgress(pageNumber, state.pageItems.length);
        }
        setStatus("書き出し準備完了。");
        setTimeout(resetProgress, 400);
    } catch (error) {
        showError("PDFの読み込みに失敗しました。サイズの小さいPDFで試してください。");
        setStatus("読み込みに失敗しました。");
    } finally {
        setBusy(false);
    }
}

async function convertPages(pages, forceZip) {
    if (!state.pdfDoc) {
        showError("先にPDFを読み込んでください。");
        return;
    }
    if (!pages.length) {
        showError("書き出すページを1つ以上選択してください。");
        return;
    }

    clearError();
    setBusy(true);

    const format = imageFormat.value;
    const scale = Number.parseFloat(scaleSelect.value);
    const quality = Number.parseInt(qualityInput.value, 10) / 100;
    const applyBackground = format === "image/jpeg" || applyBg.checked;
    const background = bgColorInput.value;
    const ext = format === "image/png" ? "png" : "jpg";
    const prefix = getOutputPrefix();
    const padLength = String(state.pdfDoc.numPages).length;

    const zipAvailable = typeof JSZip !== "undefined";
    const shouldZip = zipAvailable && (forceZip || pages.length > 1);

    try {
        if (!zipAvailable && pages.length > 1) {
            setStatus("JSZipが利用できないため、個別にダウンロードします。");
        }
        if (shouldZip) {
            setStatus("ZIPを書き出し準備中...");
            const zip = new JSZip();
            for (let index = 0; index < pages.length; index += 1) {
                const pageNumber = pages[index];
                setStatus(`ページ ${index + 1} / ${pages.length} を描画中...`);
                const blob = await renderPageToBlob(pageNumber, {
                    scale,
                    format,
                    quality,
                    applyBackground,
                    background
                });
                if (!blob) {
                    throw new Error("toBlob failed");
                }
                const padded = String(pageNumber).padStart(padLength, "0");
                const fileName = `${prefix}-page-${padded}.${ext}`;
                zip.file(fileName, blob);
                setProgress(index + 1, pages.length);
            }
            const zipBlob = await zip.generateAsync({ type: "blob" });
            downloadBlob(zipBlob, `${prefix}-pages.zip`);
        } else {
            for (let index = 0; index < pages.length; index += 1) {
                const pageNumber = pages[index];
                setStatus(`ページ ${index + 1} / ${pages.length} を描画中...`);
                const blob = await renderPageToBlob(pageNumber, {
                    scale,
                    format,
                    quality,
                    applyBackground,
                    background
                });
                if (!blob) {
                    throw new Error("toBlob failed");
                }
                const padded = String(pageNumber).padStart(padLength, "0");
                const fileName = `${prefix}-page-${padded}.${ext}`;
                downloadBlob(blob, fileName);
                setProgress(index + 1, pages.length);
            }
        }
        setStatus(`${pages.length}ページを書き出しました。`);
        setTimeout(resetProgress, 400);
    } catch (error) {
        showError("書き出しに失敗しました。倍率を下げるか、ページ数を減らしてください。");
        setStatus("書き出しに失敗しました。");
    } finally {
        setBusy(false);
    }
}

function resetAll() {
    clearError();
    resetProgress();
    setStatus("PDFを読み込んでください。");
    fileInput.value = "";
    fileNameEl.textContent = "未選択";
    fileMetaEl.textContent = "サイズ目安: 30MB";
    pageCountEl.textContent = "-";
    pageList.innerHTML = "";
    pageEmpty.classList.remove("hidden");
    state.pageItems = [];
    state.baseName = "";
    filePrefixInput.value = "";
    if (state.pdfDoc) {
        state.pdfDoc.destroy();
    }
    state.pdfDoc = null;
    state.file = null;
    updateSelectionCount();
    updateScaledSize();
}

fileSelect.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    loadPdf(file);
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (state.isBusy) return;
        dropZone.classList.add("is-dragover");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragover");
    });
});

dropZone.addEventListener("drop", (event) => {
    if (state.isBusy) return;
    const [file] = event.dataTransfer.files;
    loadPdf(file);
});

pageList.addEventListener("change", (event) => {
    if (event.target.matches(".page-check")) {
        updateSelectionCount();
    }
});

selectAllBtn.addEventListener("click", () => {
    state.pageItems.forEach((item) => {
        item.checkbox.checked = true;
    });
    updateSelectionCount();
});

clearSelectionBtn.addEventListener("click", () => {
    state.pageItems.forEach((item) => {
        item.checkbox.checked = false;
    });
    updateSelectionCount();
});

invertSelectionBtn.addEventListener("click", () => {
    state.pageItems.forEach((item) => {
        item.checkbox.checked = !item.checkbox.checked;
    });
    updateSelectionCount();
});

convertSelectedBtn.addEventListener("click", () => {
    const pages = getSelectedPages();
    convertPages(pages, false);
});

convertAllBtn.addEventListener("click", () => {
    if (!state.pdfDoc) return;
    const pages = Array.from({ length: state.pdfDoc.numPages }, (_, idx) => idx + 1);
    convertPages(pages, true);
});

resetAllBtn.addEventListener("click", resetAll);

imageFormat.addEventListener("change", updateFormatUI);
qualityInput.addEventListener("input", updateQualityValue);
scaleSelect.addEventListener("change", updateScaledSize);
bgColorInput.addEventListener("input", updateColorValue);

updateFormatUI();
updateQualityValue();
updateColorValue();
updateSelectionCount();
updateScaledSize();
