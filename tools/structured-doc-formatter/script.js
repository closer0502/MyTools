"use strict";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const sourceInput = document.getElementById("sourceInput");
const formatButton = document.getElementById("formatButton");
const indentRange = document.getElementById("indentRange");
const indentValue = document.getElementById("indentValue");
const output = document.getElementById("output");
const errorBanner = document.getElementById("errorBanner");
const noticeBanner = document.getElementById("noticeBanner");
const copyButton = document.getElementById("copyButton");
const statusLabel = document.getElementById("statusLabel");
const allowTrailingCommaFix = document.getElementById("allowTrailingCommaFix");
const formatBadge = document.getElementById("formatBadge");
const fileStatus = document.getElementById("fileStatus");
const outputHint = document.getElementById("outputHint");

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FORMAT_LABELS = {
    json: "JSON",
    html: "HTML",
    xml: "XML",
    unknown: "自動判定待ち"
};
const HTML_ROOT_NAMES = new Set([
    "html", "head", "body", "title", "meta", "link", "style", "script",
    "main", "header", "footer", "nav", "section", "article", "aside",
    "div", "span", "p", "a", "img", "picture", "video", "audio",
    "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "form", "label", "input", "button",
    "select", "option", "textarea", "template", "canvas"
]);
const HTML_VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
]);

const state = {
    sourceFileName: "",
    format: "unknown",
    formattedText: ""
};

function updateIndentLabel() {
    const value = Number(indentRange.value);
    indentValue.textContent = value === 0 ? "0 (圧縮)" : `${value}スペース`;
}

function normalizeSmartQuotes(text) {
    return text.replace(/[“”]/g, "\"");
}

function escapeHtml(text) {
    return text.replace(/[&<>]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;"
    }[character]));
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    statusLabel.textContent = "パース失敗";
}

function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
}

function showNotice(message) {
    noticeBanner.textContent = message;
    noticeBanner.classList.remove("hidden");
}

function clearNotice() {
    noticeBanner.textContent = "";
    noticeBanner.classList.add("hidden");
}

function updateFormatDisplay(format) {
    state.format = format;
    formatBadge.textContent = FORMAT_LABELS[format];
    formatBadge.dataset.format = format;
    outputHint.textContent = format === "unknown"
        ? "判定した形式に合わせてハイライト表示します。"
        : `${FORMAT_LABELS[format]}として整形し、ハイライト表示します。`;
}

function detectDocumentFormat(source, fileName = "") {
    const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || "";
    if (extension === "json") return "json";
    if (["html", "htm"].includes(extension)) return "html";
    if (["xml", "xhtml", "svg", "vsqx"].includes(extension)) return "xml";

    const trimmed = String(source || "").replace(/^\uFEFF/, "").trim();
    if (!trimmed) return "unknown";

    if (/^[{\[]/.test(trimmed)) return "json";
    try {
        JSON.parse(trimmed);
        return "json";
    } catch {
        // JSON以外の可能性を続けて判定する。
    }

    if (!trimmed.startsWith("<")) return "unknown";
    if (/^<\?xml(?:\s|\?>)/i.test(trimmed)) return "xml";

    const doctype = trimmed.match(/^<!doctype\s+([^\s>]+)/i);
    if (doctype) return doctype[1].toLowerCase() === "html" ? "html" : "xml";

    const withoutLeadingComments = trimmed.replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");
    const rootName = withoutLeadingComments.match(/^<([A-Za-z][\w:-]*)[\s/>]/)?.[1]?.toLowerCase();
    if (!rootName) return "xml";
    return HTML_ROOT_NAMES.has(rootName) ? "html" : "xml";
}

function refreshDetectedFormat() {
    const format = detectDocumentFormat(sourceInput.value, state.sourceFileName);
    updateFormatDisplay(format);
    return format;
}

function syntaxHighlightJson(json) {
    const escaped = escapeHtml(json);
    return escaped.replace(
        /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        match => {
            let className = "number";
            if (/^"/.test(match)) {
                className = /:$/.test(match) ? "key" : "string";
            } else if (/true|false/.test(match)) {
                className = "boolean";
            } else if (/null/.test(match)) {
                className = "null";
            }
            return `<span class="${className}">${match}</span>`;
        }
    );
}

function safeParseJson(source) {
    try {
        return { parsed: JSON.parse(source), fixed: false, cleaned: source };
    } catch (originalError) {
        if (!allowTrailingCommaFix.checked) throw originalError;
        const cleaned = source.replace(/,\s*(?=[}\]])/g, "");
        if (cleaned === source) throw originalError;
        try {
            return { parsed: JSON.parse(cleaned), fixed: true, cleaned };
        } catch {
            throw originalError;
        }
    }
}

function highlightAttributes(attributes) {
    if (!attributes) return "";
    return attributes.replace(
        /([A-Za-z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*')?/g,
        (match, name, equals, value) => {
            if (!value) return `<span class="attr-name">${name}</span>`;
            return `<span class="attr-name">${name}</span><span class="attr-eq">${equals}</span><span class="attr-value">${value}</span>`;
        }
    );
}

function highlightMarkup(source) {
    const escaped = escapeHtml(source);
    return escaped.replace(
        /(&lt;!--[\s\S]*?--&gt;)|(&lt;!\[CDATA\[[\s\S]*?\]\]&gt;)|(&lt;!DOCTYPE[\s\S]*?&gt;)|(&lt;\?xml[\s\S]*?\?&gt;)|(&lt;\/?[A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/gi,
        (match, comment, cdata, doctype, declaration, tagStart, attributes, tagEnd) => {
            if (comment || cdata) return `<span class="comment">${comment || cdata}</span>`;
            if (doctype || declaration) return `<span class="doctype">${doctype || declaration}</span>`;
            if (!tagStart) return match;
            return `<span class="tag">${tagStart}</span>${highlightAttributes(attributes)}<span class="tag">${tagEnd}</span>`;
        }
    );
}

function escapeText(text) {
    return escapeHtml(text);
}

function escapeAttributeValue(text) {
    return text.replace(/[&<>"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    }[character]));
}

function formatDoctype(doctype) {
    if (!doctype) return "";
    const name = doctype.name || "html";
    if (doctype.publicId) {
        const systemPart = doctype.systemId ? ` "${doctype.systemId}"` : "";
        return `<!DOCTYPE ${name} PUBLIC "${doctype.publicId}"${systemPart}>`;
    }
    if (doctype.systemId) return `<!DOCTYPE ${name} SYSTEM "${doctype.systemId}">`;
    return `<!DOCTYPE ${name}>`;
}

function parseMarkup(source, format) {
    const parser = new DOMParser();
    if (format === "xml") {
        const documentNode = parser.parseFromString(source, "application/xml");
        const errorNode = documentNode.querySelector("parsererror");
        if (errorNode) {
            const message = errorNode.textContent.replace(/\s+/g, " ").trim();
            throw new Error(message || "XMLが整形式ではありません。");
        }
        if (!documentNode.documentElement) throw new Error("ルート要素がありません。");
        return {
            roots: [documentNode.documentElement],
            isXml: true,
            doctype: documentNode.doctype
        };
    }

    const documentNode = parser.parseFromString(source, "text/html");
    const hasDoctype = /<!doctype/i.test(source);
    const hasHtmlRoot = /<html[\s>]/i.test(source);
    const hasHeadOrBody = /<head[\s>]|<body[\s>]/i.test(source);
    return {
        roots: hasDoctype || hasHtmlRoot || hasHeadOrBody
            ? [documentNode.documentElement]
            : Array.from(documentNode.body.childNodes),
        isXml: false,
        doctype: hasDoctype ? documentNode.doctype : null
    };
}

function formatNode(node, indent, depth, isXml) {
    switch (node.nodeType) {
        case Node.ELEMENT_NODE:
            return formatElement(node, indent, depth, isXml);
        case Node.TEXT_NODE: {
            const text = node.nodeValue.replace(/\s+/g, " ").trim();
            if (!text) return "";
            const escaped = escapeText(text);
            return indent === 0 ? escaped : `${" ".repeat(indent * depth)}${escaped}`;
        }
        case Node.COMMENT_NODE: {
            const comment = `<!--${node.nodeValue.trim()}-->`;
            return indent === 0 ? comment : `${" ".repeat(indent * depth)}${comment}`;
        }
        case Node.CDATA_SECTION_NODE: {
            const cdata = `<![CDATA[${node.nodeValue}]]>`;
            return indent === 0 ? cdata : `${" ".repeat(indent * depth)}${cdata}`;
        }
        default:
            return "";
    }
}

function formatElement(element, indent, depth, isXml) {
    const indentation = indent === 0 ? "" : " ".repeat(indent * depth);
    const tagName = isXml ? element.tagName : element.tagName.toLowerCase();
    const attributes = Array.from(element.attributes).map(attribute =>
        `${attribute.name}="${escapeAttributeValue(attribute.value)}"`
    ).join(" ");
    const openTag = attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;

    if (!isXml && HTML_VOID_TAGS.has(tagName.toLowerCase())) {
        return indent === 0 ? openTag : `${indentation}${openTag}`;
    }

    const meaningfulChildren = Array.from(element.childNodes).filter(child =>
        child.nodeType !== Node.TEXT_NODE || child.nodeValue.trim() !== ""
    );

    if (!meaningfulChildren.length) {
        if (isXml) {
            const selfClosing = attributes ? `<${tagName} ${attributes}/>` : `<${tagName}/>`;
            return indent === 0 ? selfClosing : `${indentation}${selfClosing}`;
        }
        return `${indentation}${openTag}</${tagName}>`;
    }

    if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
        const text = escapeText(meaningfulChildren[0].nodeValue.trim());
        return `${indentation}${openTag}${text}</${tagName}>`;
    }

    const children = meaningfulChildren
        .map(child => formatNode(child, indent, depth + 1, isXml))
        .filter(Boolean);
    if (indent === 0) return `${openTag}${children.join("")}</${tagName}>`;
    return `${indentation}${openTag}\n${children.join("\n")}\n${indentation}</${tagName}>`;
}

function buildMarkup(source, format, indent) {
    const { roots, isXml, doctype } = parseMarkup(source, format);
    const blocks = [];
    if (isXml) {
        const declaration = source.match(/^\s*<\?xml[^>]*\?>/i);
        if (declaration) blocks.push(declaration[0].trim());
    } else if (doctype) {
        blocks.push(formatDoctype(doctype));
    }
    roots.forEach(node => {
        const formatted = formatNode(node, indent, 0, isXml);
        if (formatted) blocks.push(formatted);
    });
    return blocks.join(indent === 0 ? "" : "\n");
}

function formatAndRender(auto = false) {
    const raw = sourceInput.value.trim();
    if (!raw) {
        output.textContent = "";
        state.formattedText = "";
        updateFormatDisplay("unknown");
        clearError();
        clearNotice();
        statusLabel.textContent = "入力待ち";
        return;
    }

    const format = refreshDetectedFormat();
    if (format === "unknown") {
        output.textContent = "";
        state.formattedText = "";
        clearNotice();
        showError("JSON、HTML、XMLのいずれかとして判定できませんでした。");
        return;
    }

    try {
        const indent = Number(indentRange.value);
        let formatted;
        if (format === "json") {
            const normalized = normalizeSmartQuotes(raw);
            if (normalized !== raw) sourceInput.value = normalized;
            const result = safeParseJson(normalized);
            if (result.fixed) {
                sourceInput.value = result.cleaned;
                showNotice("警告: JSONのトレーリングカンマを除去して表示しています。");
            } else {
                clearNotice();
            }
            formatted = JSON.stringify(result.parsed, null, indent);
            output.innerHTML = syntaxHighlightJson(formatted);
        } else {
            clearNotice();
            formatted = buildMarkup(raw, format, indent);
            output.innerHTML = highlightMarkup(formatted);
        }

        state.formattedText = formatted;
        clearError();
        statusLabel.textContent = `${FORMAT_LABELS[format]}を表示中`;
        if (!auto) output.scrollTop = 0;
    } catch (error) {
        output.textContent = "";
        state.formattedText = "";
        clearNotice();
        showError(`${FORMAT_LABELS[format]}のパースに失敗しました: ${error.message}`);
    }
}

async function handleFiles(files) {
    const [file] = files;
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
        showError("20 MB以下のファイルを選択してください。");
        return;
    }

    fileStatus.textContent = `${file.name} を読み込んでいます…`;
    try {
        const text = await file.text();
        state.sourceFileName = file.name;
        sourceInput.value = text;
        fileStatus.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
        refreshDetectedFormat();
        formatAndRender();
    } catch {
        showError("ファイルの読み込みに失敗しました。");
        fileStatus.textContent = "別のファイルでお試しください。";
    } finally {
        fileInput.value = "";
    }
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
    handleFiles(event.dataTransfer?.files || []);
});

fileSelect.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", event => handleFiles(event.target.files));
formatButton.addEventListener("click", () => formatAndRender());

sourceInput.addEventListener("input", () => {
    state.sourceFileName = "";
    refreshDetectedFormat();
    clearError();
    clearNotice();
    statusLabel.textContent = sourceInput.value.trim() ? "入力中" : "入力待ち";
});

indentRange.addEventListener("input", () => {
    updateIndentLabel();
    if (sourceInput.value.trim()) formatAndRender(true);
});

allowTrailingCommaFix.addEventListener("change", () => {
    if (state.format === "json" && sourceInput.value.trim()) formatAndRender(true);
});

copyButton.addEventListener("click", async () => {
    if (!state.formattedText) return;
    try {
        await navigator.clipboard.writeText(state.formattedText);
        const original = copyButton.textContent;
        copyButton.textContent = "コピーしました";
        copyButton.classList.add("copied");
        setTimeout(() => {
            copyButton.textContent = original;
            copyButton.classList.remove("copied");
        }, 1400);
    } catch {
        showError("クリップボードへのコピーに失敗しました。");
    }
});

updateIndentLabel();
updateFormatDisplay("unknown");
