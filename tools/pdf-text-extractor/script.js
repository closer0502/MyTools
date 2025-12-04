const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const pageCountEl = document.getElementById("pageCount");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const errorBanner = document.getElementById("errorBanner");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const clearButton = document.getElementById("clearButton");
const progressFill = document.getElementById("progressFill");

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

let pdfReady = false;
try {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js が読み込めませんでした");
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    pdfReady = true;
} catch (err) {
    console.error(err);
    showError("PDF.jsの読み込みに失敗しました。ネットワーク環境を確認して再読み込みしてください。");
    setStatus("ライブラリ未ロード");
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

function resetUI() {
    fileNameEl.textContent = "未選択";
    fileMetaEl.textContent = "サイズ上限の目安: 30MB";
    pageCountEl.textContent = "-";
    outputEl.textContent = "";
    setStatus("準備完了");
    progressFill.style.width = "0%";
    clearError();
    copyButton.disabled = true;
    downloadButton.disabled = true;
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

async function extractText(arrayBuffer) {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    pageCountEl.textContent = pdf.numPages.toString();

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        setStatus(`抽出中... (${pageNum}/${pdf.numPages})`);
        progressFill.style.width = `${(pageNum - 1) / pdf.numPages * 100}%`;

        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        const pageText = strings.join("").trim();

        fullText += `--- Page ${pageNum} / ${pdf.numPages} ---\n`;
        fullText += pageText ? `${pageText}\n\n` : "(このページには抽出可能なテキストがありません)\n\n";
        fullText += "────────────────────────────\n\n";
    }

    progressFill.style.width = "100%";
    setStatus("抽出完了");
    outputEl.textContent = fullText.trim();
    copyButton.disabled = false;
    downloadButton.disabled = false;
}

function handleFile(file) {
    resetUI();

    if (!file) return;
    if (!pdfReady) {
        showError("PDF.jsが読み込まれていません。ページを再読み込みしてからお試しください。");
        setStatus("ライブラリ未ロード");
        return;
    }
    if (file.type !== "application/pdf") {
        showError("PDFファイルを選択してください。");
        return;
    }

    const size = file.size;
    fileNameEl.textContent = file.name;
    fileMetaEl.textContent = `サイズ: ${formatBytes(size)} (推奨上限 30MB)`;

    if (size > MAX_BYTES) {
        showError("ファイルサイズが大きすぎます。30MB以下のPDFでお試しください。");
        setStatus("サイズ超過");
        return;
    }

    setStatus("読み込み中...");
    clearError();

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            await extractText(new Uint8Array(reader.result));
        } catch (err) {
            console.error(err);
            showError("読み込みまたは抽出に失敗しました。PDFの内容を確認してください。");
            setStatus("失敗");
        }
    };
    reader.onerror = () => {
        showError("ファイルの読み込みに失敗しました。");
        setStatus("失敗");
    };
    reader.readAsArrayBuffer(file);
}

function handleFiles(files) {
    const [file] = files;
    handleFile(file);
}

// Drag & drop events
dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
    }
});

fileSelect.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", event => handleFiles(event.target.files));

// ブラウザがファイルを開いてしまうのを防ぐために全体で抑止
["dragover", "drop"].forEach(evt => {
    window.addEventListener(evt, e => {
        e.preventDefault();
    });
});

copyButton.addEventListener("click", () => {
    const text = outputEl.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        setStatus("コピーしました");
        setTimeout(() => setStatus("抽出完了"), 1200);
    }).catch(() => {
        showError("クリップボードへのコピーに失敗しました。");
    });
});

downloadButton.addEventListener("click", () => {
    const text = outputEl.textContent;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileNameEl.textContent || "extracted"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

clearButton.addEventListener("click", resetUI);

resetUI();
