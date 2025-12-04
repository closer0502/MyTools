const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const jsonInput = document.getElementById("jsonInput");
const formatButton = document.getElementById("formatButton");
const indentRange = document.getElementById("indentRange");
const indentValue = document.getElementById("indentValue");
const output = document.getElementById("output");
const errorBanner = document.getElementById("errorBanner");
const copyButton = document.getElementById("copyButton");
const statusLabel = document.getElementById("statusLabel");

function updateIndentLabel() {
    const value = Number(indentRange.value);
    indentValue.textContent = value === 0 ? "0 (圧縮)" : `${value}スペース`;
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

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
    statusLabel.textContent = "準備完了";
}

function formatAndRender(auto = false) {
    const source = jsonInput.value.trim();
    if (!source) {
        output.textContent = "";
        statusLabel.textContent = "入力待ち";
        clearError();
        return;
    }

    try {
        const indent = Number(indentRange.value);
        const parsed = JSON.parse(source);
        const formatted = JSON.stringify(parsed, null, indent);
        output.innerHTML = syntaxHighlight(formatted);
        clearError();
        statusLabel.textContent = "表示中";
        if (!auto) {
            output.scrollTop = 0;
        }
    } catch (err) {
        output.textContent = "";
        showError(`パースに失敗しました: ${err.message}`);
    }
}

function handleFiles(files) {
    const [file] = files;
    if (!file) return;

    file.text().then(text => {
        jsonInput.value = text;
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
