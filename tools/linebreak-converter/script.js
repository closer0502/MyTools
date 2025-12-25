const rawInput = document.getElementById("rawInput");
const escapedInput = document.getElementById("escapedInput");
const rawLines = document.getElementById("rawLines");
const rawChars = document.getElementById("rawChars");
const escapedLines = document.getElementById("escapedLines");
const escapedChars = document.getElementById("escapedChars");
const presetTarget = document.getElementById("presetTarget");
const lastEdited = document.getElementById("lastEdited");
const statusText = document.getElementById("statusText");

const linebreakButtons = Array.from(document.querySelectorAll("[data-linebreak]"));
const tabToggle = document.getElementById("tabToggle");
const fullWidthToggle = document.getElementById("fullWidthToggle");
const presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
const copyButtons = Array.from(document.querySelectorAll("[data-copy]"));
const actionButtons = Array.from(document.querySelectorAll("[data-action]"));

let activeSide = "raw";
let linebreakMode = "lf";
let statusTimeout;

const sideLabels = {
    raw: "生",
    escaped: "エスケープ"
};

const copyLabels = {
    raw: "生",
    escaped: "エスケープ",
    json: "JSON文字列"
};

const linebreakLabel = () => (linebreakMode === "crlf" ? "CRLF" : "LF");
const linebreakToken = () => (linebreakMode === "crlf" ? "\\r\\n" : "\\n");

const normalizeRaw = (text) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const rawToEscaped = (text) => {
    let result = normalizeRaw(text);
    if (tabToggle.checked) {
        result = result.replace(/\t/g, "\\t");
    }
    if (fullWidthToggle.checked) {
        result = result.replace(/\u3000/g, "\\u3000");
    }
    return result.replace(/\n/g, linebreakToken());
};

const escapedToRaw = (text) => {
    let result = text;
    result = result.replace(/\\r\\n/g, "\n");
    result = result.replace(/\\n/g, "\n");
    result = result.replace(/\\r/g, "\n");
    if (tabToggle.checked) {
        result = result.replace(/\\t/g, "\t");
    }
    if (fullWidthToggle.checked) {
        result = result.replace(/\\u3000/g, "\u3000");
    }
    return normalizeRaw(result);
};

const countLines = (text) => {
    if (!text) {
        return 0;
    }
    return normalizeRaw(text).split("\n").length;
};

const setActiveSide = (side) => {
    activeSide = side;
    const label = sideLabels[side] ?? side;
    presetTarget.textContent = label;
    lastEdited.textContent = label;
};

const updateStats = () => {
    const rawValue = rawInput.value;
    rawLines.textContent = countLines(rawValue).toString();
    rawChars.textContent = rawValue.length.toString();

    const escapedValue = escapedInput.value;
    const escapedAsRaw = escapedToRaw(escapedValue);
    escapedLines.textContent = countLines(escapedAsRaw).toString();
    escapedChars.textContent = escapedValue.length.toString();
};

const syncFrom = (side) => {
    if (side === "raw") {
        escapedInput.value = rawToEscaped(rawInput.value);
    } else {
        rawInput.value = escapedToRaw(escapedInput.value);
    }
    updateStats();
};

const setStatus = (message) => {
    statusText.textContent = message;
    statusText.parentElement.classList.add("is-active");
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
        statusText.parentElement.classList.remove("is-active");
    }, 1600);
};

const copyText = async (text) => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        // Fall back to execCommand.
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    helper.style.top = "0";
    document.body.appendChild(helper);
    helper.select();
    const success = document.execCommand("copy");
    document.body.removeChild(helper);
    return success;
};

rawInput.addEventListener("focus", () => setActiveSide("raw"));
escapedInput.addEventListener("focus", () => setActiveSide("escaped"));

rawInput.addEventListener("input", () => {
    setActiveSide("raw");
    syncFrom("raw");
});

escapedInput.addEventListener("input", () => {
    setActiveSide("escaped");
    syncFrom("escaped");
});

linebreakButtons.forEach((button) => {
    button.addEventListener("click", () => {
        linebreakMode = button.dataset.linebreak;
        linebreakButtons.forEach((btn) => {
            btn.classList.toggle("is-active", btn === button);
        });
        syncFrom(activeSide);
        setStatus(`改行トークンを${linebreakLabel()}に設定しました。`);
    });
});

[tabToggle, fullWidthToggle].forEach((toggle) => {
    toggle.addEventListener("change", () => {
        syncFrom(activeSide);
        setStatus("置換ルールを更新しました。");
    });
});

const presetActions = {
    "trim-trailing": (text) => text.replace(/[ \t]+$/gm, ""),
    "collapse-blank": (text) => text.replace(/\n{3,}/g, "\n\n"),
    "trim-edges": (text) => text.trim()
};

presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const preset = button.dataset.preset;
        const action = presetActions[preset];
        if (!action) {
            return;
        }
        const rawText = activeSide === "raw" ? rawInput.value : escapedToRaw(escapedInput.value);
        const updated = action(normalizeRaw(rawText));
        if (activeSide === "raw") {
            rawInput.value = updated;
        } else {
            escapedInput.value = rawToEscaped(updated);
        }
        syncFrom(activeSide);
        setStatus(`${sideLabels[activeSide]}側にプリセットを適用しました。`);
    });
});

copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        const mode = button.dataset.copy;
        let text = "";
        if (mode === "raw") {
            text = rawInput.value;
        } else if (mode === "escaped") {
            text = escapedInput.value;
        } else if (mode === "json") {
            text = JSON.stringify(rawInput.value);
        }
        const success = await copyText(text);
        if (success) {
            const label = copyLabels[mode] ?? mode;
            setStatus(`${label}をクリップボードにコピーしました。`);
        } else {
            setStatus("コピーに失敗しました。手動で選択してコピーしてください。");
        }
    });
});

actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "clear-raw") {
            rawInput.value = "";
            syncFrom("raw");
            setStatus("生テキストをクリアしました。");
            return;
        }
        if (action === "clear-escaped") {
            escapedInput.value = "";
            syncFrom("escaped");
            setStatus("エスケープ表現をクリアしました。");
        }
    });
});

setActiveSide("raw");
syncFrom("raw");
