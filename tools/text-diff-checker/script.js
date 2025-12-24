const textAInput = document.getElementById("textA");
const textBInput = document.getElementById("textB");
const compareBtn = document.getElementById("compareBtn");
const swapBtn = document.getElementById("swapBtn");
const clearBtn = document.getElementById("clearBtn");

const addedCountEl = document.getElementById("addedCount");
const removedCountEl = document.getElementById("removedCount");
const movedCountEl = document.getElementById("movedCount");
const sameCountEl = document.getElementById("sameCount");
const totalCountEl = document.getElementById("totalCount");
const diffOutput = document.getElementById("diffOutput");
const resultMeta = document.getElementById("resultMeta");

// 空の比較表示時に使うメッセージ
const EMPTY_STATE = "Run a comparison to see the sentence differences.";
// 移動（移動元／移動先）を表示する際に使う色の配列
const MOVE_COLORS = ["#38bdf8", "#f472b6", "#4ade80", "#facc15", "#fb923c", "#a78bfa"];

/**
 * テキストを文単位に分割する
 * - 改行で分割して各行ごとに正規表現で文を切り出す。
 * - 日本語句点（。！？など）や英語の終端記号も考慮する。
 * - 空行は無視し、トリム後に空でない文のみを返す。
 * @param {string} text 入力テキスト
 * @returns {string[]} 文の配列（順序保持）
 */
function splitSentences(text) {
    if (!text) {
        return [];
    }
    const normalized = text.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    const sentences = [];
    const sentenceRegex = /[^\u3002\uFF01\uFF1F.!?]+[\u3002\uFF01\uFF1F.!?]+[\u300D\u300F\u3011\u300B\uFF09\uFF3D"')\]]*|[^\u3002\uFF01\uFF1F.!?]+$/g;

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        const matches = trimmed.match(sentenceRegex);
        if (!matches) {
            sentences.push(trimmed);
            return;
        }
        matches.forEach((sentence) => {
            const cleaned = sentence.trim();
            if (cleaned) {
                sentences.push(cleaned);
            }
        });
    });

    return sentences;
}

/**
 * 移動検出用にテキストを正規化する
 * - 連続する空白を単一スペースへ置換し、前後の空白を除去する。
 * - 完全一致で移動を判定する際に使う。
 */
function normalizeForMove(text) {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * LCS（最長共通部分列）テーブルを構築する
 * - シーケンスaLines, bLinesに対して動的計画法でテーブルを作る。
 * - buildDiff で差分を決めるために利用する。
 * @returns {number[][]} DPテーブル
 */
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

/**
 * 文列の差分を LCS に基づいて構築する
 * - 同一文は `same`、aにあってbにない文は `removed`、逆は `added` とする。
 * - テーブルから前向きに歩いて差分エントリの配列を返す。
 * @returns {Array<Object>} diff エントリの配列
 */
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

/**
 * 同一の文が順序を変えて移動したケースに対して move 情報を付与する
 * - `normalizeForMove` で正規化した文字列をキーにして、removed/added のインデックスを収集
 * - 同じキーが removed と added に存在する限りペアリングし `moveId`/`moveRole`/`moveColor` を設定する
 */
function annotateMoves(diff) {
    const removedMap = new Map();
    const addedMap = new Map();

    diff.forEach((entry, index) => {
        if (entry.type !== "added" && entry.type !== "removed") {
            return;
        }
        const key = normalizeForMove(entry.text);
        if (!key) {
            return;
        }
        const map = entry.type === "removed" ? removedMap : addedMap;
        const list = map.get(key) || [];
        list.push(index);
        map.set(key, list);
    });

    let moveId = 1;
    removedMap.forEach((removedList, key) => {
        const addedList = addedMap.get(key);
        if (!addedList || addedList.length === 0) {
            return;
        }
        const count = Math.min(removedList.length, addedList.length);
        for (let i = 0; i < count; i += 1) {
            const removedIndex = removedList[i];
            const addedIndex = addedList[i];
            const color = MOVE_COLORS[(moveId - 1) % MOVE_COLORS.length];
            diff[removedIndex].moveId = moveId;
            diff[removedIndex].moveRole = "from";
            diff[removedIndex].moveColor = color;
            diff[addedIndex].moveId = moveId;
            diff[addedIndex].moveRole = "to";
            diff[addedIndex].moveColor = color;
            moveId += 1;
        }
    });
}

/**
 * 類似度計算用の正規化
 * - 句読点や各種括弧・引用記号を除去し、空白も削除して文字だけを残す。
 * - 主に文字バイグラムによる比較でノイズを減らすための前処理。
 */
function normalizeForSimilarity(text) {
    return text
        .replace(/[「」『』【】()（）［］\[\]"'”“’‘]/g, "")
        .replace(/\s+/g, "")
        .trim();
}

/**
 * 文字バイグラムを生成する（文字列 -> 隣接2文字のペア配列）
 * - 文字列長が1の場合はその文字自身を配列で返す（特殊扱い）
 * - Unicode文字（サロゲート対含む）に対応するため Array.from を使う
 */
function buildBigrams(text) {
    if (!text) {
        return [];
    }
    const chars = Array.from(text);
    if (chars.length === 1) {
        return [chars[0]];
    }
    const bigrams = [];
    for (let i = 0; i < chars.length - 1; i += 1) {
        bigrams.push(chars[i] + chars[i + 1]);
    }
    return bigrams;
}

/**
 * 2つの文の類似度を計算する
 * - 正規化 -> バイグラム生成 -> 集合のJaccard類似度（|A∩B| / |A∪B|）を返す
 * - 出現回数は無視して集合として扱うため、頻度情報は失われる点に注意
 * @returns {number} 0.0〜1.0 の類似度スコア
 */
function similarityScore(aText, bText) {
    const aNorm = normalizeForSimilarity(aText);
    const bNorm = normalizeForSimilarity(bText);
    if (!aNorm || !bNorm) {
        return 0;
    }
    const aBigrams = buildBigrams(aNorm);
    const bBigrams = buildBigrams(bNorm);
    const aSet = new Set(aBigrams);
    const bSet = new Set(bBigrams);
    let intersection = 0;
    aSet.forEach((item) => {
        if (bSet.has(item)) {
            intersection += 1;
        }
    });
    const union = aSet.size + bSet.size - intersection;
    if (union === 0) {
        return 0;
    }
    return intersection / union;
}

/**
 * 削除/追加の差分から類似度に基づいて変更（modified）ペアを作る
 * - 移動として既にマークされたものは無視
 * - インデックス差が `window` 以下の追加エントリのみを候補にし、類似度が `threshold` 以上ならペアリングする
 * - ペアになった削除/追加は `modified` としてまとめて返す
 */
function pairSimilarChanges(diff) {
    const removedIndices = [];
    const addedIndices = [];
    diff.forEach((entry, index) => {
        if (entry.moveId) {
            return;
        }
        if (entry.type === "removed") {
            removedIndices.push(index);
        } else if (entry.type === "added") {
            addedIndices.push(index);
        }
    });

    const pairedAdded = new Set();
    const pairMap = new Map();
    const window = 6;
    const threshold = 0.35;

    removedIndices.forEach((removedIndex) => {
        let bestScore = 0;
        let bestAddedIndex = null;
        addedIndices.forEach((addedIndex) => {
            if (pairedAdded.has(addedIndex)) {
                return;
            }
            if (Math.abs(addedIndex - removedIndex) > window) {
                return;
            }
            const score = similarityScore(diff[removedIndex].text, diff[addedIndex].text);
            if (score > bestScore) {
                bestScore = score;
                bestAddedIndex = addedIndex;
            }
        });

        if (bestAddedIndex !== null && bestScore >= threshold) {
            pairMap.set(removedIndex, bestAddedIndex);
            pairedAdded.add(bestAddedIndex);
        }
    });

    const merged = [];
    diff.forEach((entry, index) => {
        if (entry.type === "removed" && pairMap.has(index)) {
            const addedIndex = pairMap.get(index);
            const addedEntry = diff[addedIndex];
            merged.push({
                type: "modified",
                aLine: entry.aLine,
                bLine: addedEntry.bLine,
                aText: entry.text,
                bText: addedEntry.text,
            });
            return;
        }
        if (entry.type === "added" && pairedAdded.has(index)) {
            return;
        }
        merged.push(entry);
    });

    return merged;
}

/**
 * 文字単位の差分セグメントをマージして出力用のセグメント配列にする
 * - 同じタイプ（same/remove/add）が連続する場合は文字列を連結して1つのセグメントにまとめる
 */
function pushSegment(list, type, text) {
    if (!text) {
        return;
    }
    const last = list[list.length - 1];
    if (last && last.type === type) {
        last.text += text;
        return;
    }
    list.push({ type, text });
}

/**
 * 2つの文の文字単位の差分セグメントを作る
 * - 文字配列に対して LCS を取り、追加/削除/同一のオペレーション列を作成
 * - そのオペレーション列から表示用のセグメント（a側/b側）を構築して返す
 * @returns {{aSegments: Array, bSegments: Array}}
 */
function buildCharDiffSegments(aText, bText) {
    const aChars = Array.from(aText);
    const bChars = Array.from(bText);
    const table = buildLcsTable(aChars, bChars);
    const ops = [];
    let i = 0;
    let j = 0;

    while (i < aChars.length && j < bChars.length) {
        if (aChars[i] === bChars[j]) {
            ops.push({ type: "same", text: aChars[i] });
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            ops.push({ type: "remove", text: aChars[i] });
            i += 1;
        } else {
            ops.push({ type: "add", text: bChars[j] });
            j += 1;
        }
    }

    while (i < aChars.length) {
        ops.push({ type: "remove", text: aChars[i] });
        i += 1;
    }

    while (j < bChars.length) {
        ops.push({ type: "add", text: bChars[j] });
        j += 1;
    }

    const aSegments = [];
    const bSegments = [];

    ops.forEach((op) => {
        if (op.type === "same") {
            pushSegment(aSegments, "same", op.text);
            pushSegment(bSegments, "same", op.text);
        } else if (op.type === "remove") {
            pushSegment(aSegments, "remove", op.text);
        } else {
            pushSegment(bSegments, "add", op.text);
        }
    });

    return { aSegments, bSegments };
}

/**
 * 差分情報に基づいて統計（追加/削除/移動/同一/合計）を更新し返す
 * - `moveId` を持つエントリは移動としてカウントする（個別ID扱い）
 * - DOM内のカウンタ表示も更新する
 */
function updateStats(diff) {
    let added = 0;
    let removed = 0;
    let same = 0;
    const movedIds = new Set();

    diff.forEach((entry) => {
        if (entry.moveId) {
            movedIds.add(entry.moveId);
            return;
        }
        if (entry.type === "modified") {
            added += 1;
            removed += 1;
        } else if (entry.type === "added") {
            added += 1;
        } else if (entry.type === "removed") {
            removed += 1;
        } else {
            same += 1;
        }
    });

    const moved = movedIds.size;

    addedCountEl.textContent = added;
    removedCountEl.textContent = removed;
    movedCountEl.textContent = moved;
    sameCountEl.textContent = same;
    totalCountEl.textContent = diff.length;

    return {
        added,
        removed,
        moved,
        same,
        total: diff.length,
    };
}

/**
 * 差分を HTML としてレンダリングする
 * - ヘッダ、グリッド行、セルの構築
 * - 文字差分がある場合は `buildCharDiffSegments` を使って強調表示
 * - 移動ペアにはジャンプボタンを付け、クリックで相互にスクロールする挙動を与える
 */
function renderDiff(diff) {
    diffOutput.innerHTML = "";

    if (diff.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = EMPTY_STATE;
        diffOutput.appendChild(empty);
        resultMeta.textContent = "No sentences to compare.";
        return;
    }

    const head = document.createElement("div");
    head.className = "diff-head";
    head.innerHTML = '<div class="diff-head-cell">Text A</div><div class="diff-head-cell">Text B</div>';
    diffOutput.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "diff-grid";
    diffOutput.appendChild(grid);

    const movePairs = new Map();

    const renderSegments = (target, segments) => {
        segments.forEach((segment) => {
            if (segment.type === "same") {
                target.appendChild(document.createTextNode(segment.text));
                return;
            }
            const span = document.createElement("span");
            span.className = segment.type === "remove" ? "diff-remove" : "diff-add";
            span.textContent = segment.text;
            target.appendChild(span);
        });
    };

    const buildCell = (sideLabel, lineNumber, text, type, entry, placeholder, segments) => {
        const cell = document.createElement("div");
        cell.className = `diff-cell ${type}`;

        if (entry && entry.moveId && text) {
            cell.classList.add("moved");
            cell.style.setProperty("--move-color", entry.moveColor);
        }

        const meta = document.createElement("div");
        meta.className = "cell-meta";
        meta.textContent = `${sideLabel} ${lineNumber || "-"}`;

        const body = document.createElement("div");
        body.className = "cell-body";

        if (text || segments) {
            const textSpan = document.createElement("span");
            textSpan.className = "cell-text";
            if (segments) {
                renderSegments(textSpan, segments);
            } else {
                textSpan.textContent = text;
            }
            body.appendChild(textSpan);

            if (entry && entry.moveId) {
                const moveLink = document.createElement("button");
                moveLink.type = "button";
                moveLink.className = "move-link";
                moveLink.textContent = `Move ${entry.moveId}`;
                moveLink.setAttribute("aria-label", "Jump to paired sentence");
                body.appendChild(moveLink);
            }
        } else {
            const placeholderSpan = document.createElement("span");
            placeholderSpan.className = "cell-placeholder";
            placeholderSpan.textContent = placeholder;
            body.appendChild(placeholderSpan);
        }

        cell.append(meta, body);
        return cell;
    };

    diff.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "diff-row";

        const displayText = entry.text === "" ? "(empty sentence)" : entry.text;
        let leftCell;
        let rightCell;

        if (entry.type === "same") {
            leftCell = buildCell("A", entry.aLine, displayText, "same", entry);
            rightCell = buildCell("B", entry.bLine, displayText, "same", entry);
        } else if (entry.type === "modified") {
            const { aSegments, bSegments } = buildCharDiffSegments(entry.aText, entry.bText);
            leftCell = buildCell("A", entry.aLine, "", "removed", entry, "", aSegments);
            rightCell = buildCell("B", entry.bLine, "", "added", entry, "", bSegments);
        } else if (entry.type === "removed") {
            leftCell = buildCell("A", entry.aLine, displayText, "removed", entry);
            rightCell = buildCell("B", entry.bLine, "", "empty", entry, "Missing in B");
        } else {
            leftCell = buildCell("A", entry.aLine, "", "empty", entry, "Missing in A");
            rightCell = buildCell("B", entry.bLine, displayText, "added", entry);
        }

        row.append(leftCell, rightCell);
        grid.appendChild(row);

        if (entry.moveId) {
            const pair = movePairs.get(entry.moveId) || {};
            pair[entry.moveRole] = row;
            movePairs.set(entry.moveId, pair);
        }
    });

    movePairs.forEach((pair) => {
        if (!pair.from || !pair.to) {
            return;
        }
        const focusRow = (row) => {
            row.classList.add("is-target");
            row.scrollIntoView({ block: "center", behavior: "smooth" });
            window.setTimeout(() => {
                row.classList.remove("is-target");
            }, 1200);
        };
        const fromLink = pair.from.querySelector(".move-link");
        const toLink = pair.to.querySelector(".move-link");
        if (fromLink) {
            fromLink.addEventListener("click", () => focusRow(pair.to));
        }
        if (toLink) {
            toLink.addEventListener("click", () => focusRow(pair.from));
        }
    });
}

/**
 * 比較処理のエントリポイント
 * - 入力テキストを文に分割し、差分生成→移動注釈→類似度ペアリング→統計更新→描画の順に処理する
 * - 結果メタ情報（差分件数や移動の有無）を更新する
 */
function runComparison() {
    const aLines = splitSentences(textAInput.value);
    const bLines = splitSentences(textBInput.value);
    const diff = buildDiff(aLines, bLines);
    annotateMoves(diff);
    const mergedDiff = pairSimilarChanges(diff);
    const counts = updateStats(mergedDiff);
    renderDiff(mergedDiff);

    const changeRows = mergedDiff.filter((entry) => entry.type !== "same").length;
    if (mergedDiff.length === 0) {
        resultMeta.textContent = "No sentences to compare.";
    } else if (changeRows === 0) {
        resultMeta.textContent = "No differences found.";
    } else {
        const movedLabel = counts.moved > 0 ? ` (${counts.moved} moved)` : "";
        resultMeta.textContent = `${changeRows} change${changeRows === 1 ? "" : "s"} detected${movedLabel}.`;
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
