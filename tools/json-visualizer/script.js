const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const jsonInput = document.getElementById("jsonInput");
const formatButton = document.getElementById("formatButton");
const indentRange = document.getElementById("indentRange");
const indentValue = document.getElementById("indentValue");
const output = document.getElementById("output");
const errorBanner = document.getElementById("errorBanner");
const noticeBanner = document.getElementById("noticeBanner");
const copyButton = document.getElementById("copyButton");
const statusLabel = document.getElementById("statusLabel");
const allowTrailingCommaFix = document.getElementById("allowTrailingCommaFix");

function updateIndentLabel() {
    const value = Number(indentRange.value);
    indentValue.textContent = value === 0 ? "0 (圧縮)" : `${value}スペース`;
}

function normalizeSmartQuotes(text) {
    return text.replace(/[“”]/g, "\"");
}

function syntaxHighlight(json) {
    const escaped = json.replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
    return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, match => {
        let cls = "number";
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? "key" : "string";
        } else if (/true|false/.test(match)) {
            cls = "boolean";
        } else if (/null/.test(match)) {
            cls = "null";
        }
        return `<span class="${cls}">${match}</span>`;
    });
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    statusLabel.textContent = "パース失敗";
}

function showNotice(message) {
    noticeBanner.textContent = message;
    noticeBanner.classList.remove("hidden");
}

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
    statusLabel.textContent = "準備完了";
}

function clearNotice() {
    noticeBanner.textContent = "";
    noticeBanner.classList.add("hidden");
}

function safeParse(source) {
    try {
        return { parsed: JSON.parse(source), fixed: false, cleaned: source, originalError: null };
    } catch (originalError) {
        if (!allowTrailingCommaFix.checked) {
            throw originalError;
        }

        const cleaned = source.replace(/,\s*(?=[}\]])/g, "");
        if (cleaned === source) {
            throw originalError;
        }

        try {
            return { parsed: JSON.parse(cleaned), fixed: true, cleaned, originalError };
        } catch {
            throw originalError;
        }
    }
}

function formatAndRender(auto = false) {
    const raw = jsonInput.value.trim();
    const source = normalizeSmartQuotes(raw);

    if (source !== raw) {
        jsonInput.value = source;
    }

    if (!source) {
        output.textContent = "";
        statusLabel.textContent = "入力待ち";
        clearError();
        clearNotice();
        return;
    }

    try {
        const indent = Number(indentRange.value);
        const { parsed, fixed, cleaned } = safeParse(source);
        if (fixed) {
            jsonInput.value = cleaned;
            showNotice("警告: トレーリングカンマを除去して表示しています。元データも確認してください。");
            statusLabel.textContent = "自動修正して表示中";
        } else {
            clearNotice();
            statusLabel.textContent = "表示中";
        }

        const formatted = JSON.stringify(parsed, null, indent);
        output.innerHTML = syntaxHighlight(formatted);
        clearError();
        if (!auto) {
            output.scrollTop = 0;
        }
    } catch (err) {
        output.textContent = "";
        clearNotice();
        showError(`パースに失敗しました: ${err.message}`);
    }
}

function handleFiles(files) {
    const [file] = files;
    if (!file) return;

    file.text().then(text => {
        const normalized = normalizeSmartQuotes(text);
        jsonInput.value = normalized;
        formatAndRender();
    }).catch(() => {
        showError("ファイルの読み込みに失敗しました。別のファイルでお試しください。");
    });
}

dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
    }
});

fileSelect.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", event => handleFiles(event.target.files));

formatButton.addEventListener("click", () => formatAndRender());
indentRange.addEventListener("input", () => {
    updateIndentLabel();
    formatAndRender(true);
});

jsonInput.addEventListener("input", () => {
    statusLabel.textContent = jsonInput.value.trim() ? "入力中" : "入力待ち";
    clearError();
});

copyButton.addEventListener("click", () => {
    const text = output.textContent.trim();
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        const original = copyButton.textContent;
        copyButton.textContent = "コピーしました";
        copyButton.classList.add("copied");
        setTimeout(() => {
            copyButton.textContent = original;
            copyButton.classList.remove("copied");
        }, 1400);
    }).catch(() => {
        showError("クリップボードへのコピーに失敗しました。");
    });
});

updateIndentLabel();
