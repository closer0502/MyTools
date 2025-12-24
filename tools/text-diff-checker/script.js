const textAInput = document.getElementById("textA");
const textBInput = document.getElementById("textB");
const compareBtn = document.getElementById("compareBtn");
const swapBtn = document.getElementById("swapBtn");
const clearBtn = document.getElementById("clearBtn");

const addedCountEl = document.getElementById("addedCount");
const removedCountEl = document.getElementById("removedCount");
const sameCountEl = document.getElementById("sameCount");
const totalCountEl = document.getElementById("totalCount");
const diffOutput = document.getElementById("diffOutput");
const resultMeta = document.getElementById("resultMeta");

const EMPTY_STATE = "Run a comparison to see the differences.";

function splitLines(text) {
    if (!text) {
        return [];
    }
    return text.replace(/\r\n/g, "\n").split("\n");
}

function buildLcsTable(aLines, bLines) {
    const aLen = aLines.length;
    const bLen = bLines.length;
    const table = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));

    for (let i = aLen - 1; i >= 0; i -= 1) {
        for (let j = bLen - 1; j >= 0; j -= 1) {
            if (aLines[i] === bLines[j]) {
                table[i][j] = table[i + 1][j + 1] + 1;
            } else {
                table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
            }
        }
    }

    return table;
}

function buildDiff(aLines, bLines) {
    const table = buildLcsTable(aLines, bLines);
    const diff = [];
    let i = 0;
    let j = 0;

    while (i < aLines.length && j < bLines.length) {
        if (aLines[i] === bLines[j]) {
            diff.push({ type: "same", aLine: i + 1, bLine: j + 1, text: aLines[i] });
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            diff.push({ type: "removed", aLine: i + 1, bLine: null, text: aLines[i] });
            i += 1;
        } else {
            diff.push({ type: "added", aLine: null, bLine: j + 1, text: bLines[j] });
            j += 1;
        }
    }

    while (i < aLines.length) {
        diff.push({ type: "removed", aLine: i + 1, bLine: null, text: aLines[i] });
        i += 1;
    }

    while (j < bLines.length) {
        diff.push({ type: "added", aLine: null, bLine: j + 1, text: bLines[j] });
        j += 1;
    }

    return diff;
}

function updateStats(diff) {
    let added = 0;
    let removed = 0;
    let same = 0;

    diff.forEach((entry) => {
        if (entry.type === "added") {
            added += 1;
        } else if (entry.type === "removed") {
            removed += 1;
        } else {
            same += 1;
        }
    });

    addedCountEl.textContent = added;
    removedCountEl.textContent = removed;
    sameCountEl.textContent = same;
    totalCountEl.textContent = diff.length;
}

function markerFor(type) {
    if (type === "added") {
        return "+";
    }
    if (type === "removed") {
        return "-";
    }
    return "=";
}

function renderDiff(diff) {
    diffOutput.innerHTML = "";

    if (diff.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = EMPTY_STATE;
        diffOutput.appendChild(empty);
        resultMeta.textContent = "No lines to compare.";
        return;
    }

    diff.forEach((entry) => {
        const row = document.createElement("div");
        row.className = `diff-row ${entry.type}`;

        const aLine = document.createElement("span");
        aLine.className = "line-num";
        aLine.textContent = entry.aLine ? `A ${entry.aLine}` : "A -";

        const bLine = document.createElement("span");
        bLine.className = "line-num";
        bLine.textContent = entry.bLine ? `B ${entry.bLine}` : "B -";

        const marker = document.createElement("span");
        marker.className = "marker";
        marker.textContent = markerFor(entry.type);

        const text = document.createElement("span");
        text.className = "line-text";
        text.textContent = entry.text === "" ? "(empty line)" : entry.text;

        row.append(aLine, bLine, marker, text);
        diffOutput.appendChild(row);
    });
}

function runComparison() {
    const aLines = splitLines(textAInput.value);
    const bLines = splitLines(textBInput.value);
    const diff = buildDiff(aLines, bLines);
    updateStats(diff);
    renderDiff(diff);

    const changes = diff.filter((entry) => entry.type !== "same").length;
    if (diff.length === 0) {
        resultMeta.textContent = "No lines to compare.";
    } else if (changes === 0) {
        resultMeta.textContent = "No differences found.";
    } else {
        resultMeta.textContent = `${changes} change${changes === 1 ? "" : "s"} detected.`;
    }
}

compareBtn.addEventListener("click", runComparison);

swapBtn.addEventListener("click", () => {
    const temp = textAInput.value;
    textAInput.value = textBInput.value;
    textBInput.value = temp;
    runComparison();
});

clearBtn.addEventListener("click", () => {
    textAInput.value = "";
    textBInput.value = "";
    updateStats([]);
    diffOutput.innerHTML = `<div class="empty-state">${EMPTY_STATE}</div>`;
    resultMeta.textContent = "No comparison yet.";
});
