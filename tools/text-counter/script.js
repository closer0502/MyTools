"use strict";

const input = document.getElementById("textInput");
const charCount = document.getElementById("charCount");
const fileDropStatus = document.getElementById("fileDropStatus");
const clearButton = document.getElementById("clearButton");
const inputArea = input.closest(".input-area");

const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_FILE_DROP_STATUS = "テキストファイルをドロップできます";

function updateCount() {
    charCount.textContent = String(input.value.length);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setFileDropStatus(message, state = "") {
    fileDropStatus.textContent = message;
    fileDropStatus.classList.toggle("is-loaded", state === "loaded");
    fileDropStatus.classList.toggle("is-error", state === "error");
}

function detectUtf16Encoding(bytes) {
    const sampleLength = Math.min(bytes.length, 4096);
    const pairCount = Math.floor(sampleLength / 2);
    if (pairCount < 4) return "";

    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < pairCount * 2; index += 2) {
        if (bytes[index] === 0) evenZeros += 1;
        if (bytes[index + 1] === 0) oddZeros += 1;
    }

    if (oddZeros / pairCount > 0.3 && evenZeros / pairCount < 0.1) return "utf-16le";
    if (evenZeros / pairCount > 0.3 && oddZeros / pairCount < 0.1) return "utf-16be";
    return "";
}

function looksLikeBinaryBytes(bytes) {
    const sampleLength = Math.min(bytes.length, 8192);
    let suspiciousControls = 0;

    for (let index = 0; index < sampleLength; index += 1) {
        const byte = bytes[index];
        if (byte === 0) return true;
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0c && byte !== 0x0d) {
            suspiciousControls += 1;
        }
    }

    return suspiciousControls > 8 && suspiciousControls / Math.max(sampleLength, 1) > 0.01;
}

function looksLikeBinaryText(text) {
    const sample = text.slice(0, 8192);
    let suspiciousControls = 0;

    for (const character of sample) {
        const code = character.codePointAt(0);
        if (code === 0) return true;
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d) {
            suspiciousControls += 1;
        }
    }

    return suspiciousControls > 8 && suspiciousControls / Math.max(sample.length, 1) > 0.01;
}

async function readTextFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let text;

    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder("utf-16le").decode(buffer);
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder("utf-16be").decode(buffer);
    } else {
        const detectedUtf16 = detectUtf16Encoding(bytes);
        if (detectedUtf16) {
            text = new TextDecoder(detectedUtf16, { fatal: true }).decode(buffer);
        } else {
            if (looksLikeBinaryBytes(bytes)) {
                throw new Error("バイナリファイルの可能性があるため読み込みませんでした。");
            }
            try {
                text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
            } catch {
                try {
                    text = new TextDecoder("shift_jis", { fatal: true }).decode(buffer);
                } catch {
                    throw new Error("テキストとして文字コードを判定できませんでした。");
                }
            }
        }
    }

    if (looksLikeBinaryText(text)) {
        throw new Error("バイナリファイルの可能性があるため読み込みませんでした。");
    }
    return text;
}

function clearDragState() {
    inputArea.classList.remove("is-dragover");
}

input.addEventListener("dragenter", event => {
    event.preventDefault();
    inputArea.classList.add("is-dragover");
});

input.addEventListener("dragover", event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    inputArea.classList.add("is-dragover");
});

input.addEventListener("dragleave", clearDragState);

input.addEventListener("drop", async event => {
    event.preventDefault();
    clearDragState();

    const [file] = Array.from(event.dataTransfer?.files || []);
    if (!file) {
        setFileDropStatus("テキストとして読み込むファイルをドロップしてください。", "error");
        return;
    }
    if (file.size > MAX_TEXT_FILE_BYTES) {
        setFileDropStatus(`${file.name} は10 MBを超えています。`, "error");
        return;
    }

    setFileDropStatus(`${file.name} を読み込んでいます…`);
    try {
        input.value = await readTextFile(file);
        updateCount();
        setFileDropStatus(`${file.name} · ${formatFileSize(file.size)}`, "loaded");
        input.focus();
    } catch (error) {
        setFileDropStatus(
            error.message || `${file.name} の読み込みに失敗しました。`,
            "error"
        );
    }
});

input.addEventListener("input", () => {
    updateCount();
    setFileDropStatus(
        input.value ? "手入力または編集済みです" : DEFAULT_FILE_DROP_STATUS
    );
});

clearButton.addEventListener("click", () => {
    input.value = "";
    updateCount();
    setFileDropStatus(DEFAULT_FILE_DROP_STATUS);
    input.focus();
});

updateCount();
