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

const markupDropZone = document.getElementById("markupDropZone");
const markupFileInput = document.getElementById("markupFileInput");
const markupFileSelect = document.getElementById("markupFileSelect");
const markupInput = document.getElementById("markupInput");
const markupFormatButton = document.getElementById("markupFormatButton");
const markupIndentRange = document.getElementById("markupIndentRange");
const markupIndentValue = document.getElementById("markupIndentValue");
const markupOutput = document.getElementById("markupOutput");
const markupErrorBanner = document.getElementById("markupErrorBanner");
const markupCopyButton = document.getElementById("markupCopyButton");
const markupStatusLabel = document.getElementById("markupStatusLabel");
const markupMode = document.getElementById("markupMode");

if (markupDropZone) {
    const htmlVoidTags = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"
    ]);

    function updateMarkupIndentLabel() {
        const value = Number(markupIndentRange.value);
        markupIndentValue.textContent = value === 0 ? "0 (minify)" : `${value} spaces`;
    }

    function setMarkupStatus(message) {
        markupStatusLabel.textContent = message;
    }

    function showMarkupError(message) {
        markupErrorBanner.textContent = message;
        markupErrorBanner.classList.remove("hidden");
        setMarkupStatus("Parse error");
    }

    function clearMarkupError() {
        markupErrorBanner.textContent = "";
        markupErrorBanner.classList.add("hidden");
    }

    function escapeText(text) {
        return text.replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
    }

    function escapeAttributeValue(text) {
        return text.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
    }

    function highlightAttributes(attributes) {
        if (!attributes) return "";
        return attributes.replace(/([A-Za-z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*')?/g, (match, name, eq, value) => {
            if (!value) {
                return `<span class="attr-name">${name}</span>`;
            }
            return `<span class="attr-name">${name}</span><span class="attr-eq">${eq}</span><span class="attr-value">${value}</span>`;
        });
    }

    function highlightMarkup(source) {
        const escaped = source.replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
        return escaped.replace(
            /(&lt;!--[\s\S]*?--&gt;)|(&lt;!\[CDATA\[[\s\S]*?\]\]&gt;)|(&lt;!DOCTYPE[\s\S]*?&gt;)|(&lt;\/?[A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
            (match, comment, cdata, doctype, tagStart, attrs, tagEnd) => {
                if (comment || cdata) {
                    return `<span class="comment">${comment || cdata}</span>`;
                }
                if (doctype) {
                    return `<span class="doctype">${doctype}</span>`;
                }
                if (!tagStart) {
                    return match;
                }
                return `<span class="tag">${tagStart}</span>${highlightAttributes(attrs)}<span class="tag">${tagEnd}</span>`;
            }
        );
    }

    function formatDoctype(doctype) {
        if (!doctype) return "";
        const name = doctype.name || "html";
        if (doctype.publicId) {
            const systemPart = doctype.systemId ? ` "${doctype.systemId}"` : "";
            return `<!DOCTYPE ${name} PUBLIC "${doctype.publicId}"${systemPart}>`;
        }
        if (doctype.systemId) {
            return `<!DOCTYPE ${name} SYSTEM "${doctype.systemId}">`;
        }
        return `<!DOCTYPE ${name}>`;
    }

    function parseMarkup(source, mode) {
        const parser = new DOMParser();
        if (mode === "xml") {
            const doc = parser.parseFromString(source, "application/xml");
            const errorNode = doc.querySelector("parsererror");
            if (errorNode) {
                const message = errorNode.textContent.replace(/\s+/g, " ").trim();
                throw new Error(message || "Invalid XML");
            }
            if (!doc.documentElement) {
                throw new Error("No root element found.");
            }
            return { roots: [doc.documentElement], isXml: true, doctype: doc.doctype };
        }

        const doc = parser.parseFromString(source, "text/html");
        const hasDoctype = /<!doctype/i.test(source);
        const hasHtmlRoot = /<html[\s>]/i.test(source);
        const hasHeadBody = /<head[\s>]|<body[\s>]/i.test(source);
        const roots = hasDoctype || hasHtmlRoot || hasHeadBody
            ? [doc.documentElement]
            : Array.from(doc.body.childNodes);
        return { roots, isXml: false, doctype: hasDoctype ? doc.doctype : null };
    }

    function formatNode(node, indent, depth, isXml) {
        switch (node.nodeType) {
            case Node.ELEMENT_NODE:
                return formatElement(node, indent, depth, isXml);
            case Node.TEXT_NODE: {
                const text = node.nodeValue.replace(/\s+/g, " ").trim();
                if (!text) return "";
                const escaped = escapeText(text);
                if (indent === 0) return escaped;
                return `${" ".repeat(indent * depth)}${escaped}`;
            }
            case Node.COMMENT_NODE: {
                const comment = `<!--${node.nodeValue.trim()}-->`;
                if (indent === 0) return comment;
                return `${" ".repeat(indent * depth)}${comment}`;
            }
            case Node.CDATA_SECTION_NODE: {
                const cdata = `<![CDATA[${node.nodeValue}]]>`;
                if (indent === 0) return cdata;
                return `${" ".repeat(indent * depth)}${cdata}`;
            }
            default:
                return "";
        }
    }

    function formatElement(element, indent, depth, isXml) {
        const indentText = indent === 0 ? "" : " ".repeat(indent * depth);
        const tagName = isXml ? element.tagName : element.tagName.toLowerCase();
        const attributes = Array.from(element.attributes).map(attr => {
            const value = escapeAttributeValue(attr.value);
            return `${attr.name}="${value}"`;
        }).join(" ");
        const openTag = attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;
        const isVoid = !isXml && htmlVoidTags.has(tagName.toLowerCase());
        if (isVoid) {
            return indent === 0 ? openTag : `${indentText}${openTag}`;
        }

        const meaningfulChildren = Array.from(element.childNodes).filter(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                return child.nodeValue.trim() !== "";
            }
            return true;
        });

        if (meaningfulChildren.length === 0) {
            if (isXml) {
                const selfClosing = attributes ? `<${tagName} ${attributes}/>` : `<${tagName}/>`;
                return indent === 0 ? selfClosing : `${indentText}${selfClosing}`;
            }
            const closing = `</${tagName}>`;
            return indent === 0 ? `${openTag}${closing}` : `${indentText}${openTag}${closing}`;
        }

        if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
            const text = escapeText(meaningfulChildren[0].nodeValue.trim());
            if (indent === 0) {
                return `${openTag}${text}</${tagName}>`;
            }
            return `${indentText}${openTag}${text}</${tagName}>`;
        }

        const childLines = meaningfulChildren
            .map(child => formatNode(child, indent, depth + 1, isXml))
            .filter(Boolean);

        if (indent === 0) {
            return `${openTag}${childLines.join("")}</${tagName}>`;
        }

        return `${indentText}${openTag}\n${childLines.join("\n")}\n${indentText}</${tagName}>`;
    }

    function buildMarkup(source, mode, indent) {
        const { roots, isXml, doctype } = parseMarkup(source, mode);
        const blocks = [];
        if (isXml) {
            const xmlDecl = source.match(/^\s*<\?xml[^>]*\?>/i);
            if (xmlDecl) {
                blocks.push(xmlDecl[0].trim());
            }
        } else if (doctype) {
            blocks.push(formatDoctype(doctype));
        }
        roots.forEach(node => {
            const formatted = formatNode(node, indent, 0, isXml);
            if (formatted) {
                blocks.push(formatted);
            }
        });
        const joiner = indent === 0 ? "" : "\n";
        return blocks.join(joiner);
    }

    function formatMarkup(auto = false) {
        const raw = markupInput.value.trim();
        const source = normalizeSmartQuotes(raw);

        if (source !== raw) {
            markupInput.value = source;
        }

        if (!source) {
            markupOutput.textContent = "";
            clearMarkupError();
            setMarkupStatus("Empty");
            return;
        }

        try {
            const indent = Number(markupIndentRange.value);
            const mode = markupMode.value;
            const formatted = buildMarkup(source, mode, indent);
            markupOutput.innerHTML = highlightMarkup(formatted);
            clearMarkupError();
            setMarkupStatus("Preview");
            if (!auto) {
                markupOutput.scrollTop = 0;
            }
        } catch (err) {
            markupOutput.textContent = "";
            showMarkupError(`Failed to parse: ${err.message}`);
        }
    }

    function handleMarkupFiles(files) {
        const [file] = files;
        if (!file) return;

        file.text().then(text => {
            markupInput.value = normalizeSmartQuotes(text);
            formatMarkup();
        }).catch(() => {
            showMarkupError("Failed to read the file.");
        });
    }

    markupDropZone.addEventListener("dragover", event => {
        event.preventDefault();
        markupDropZone.classList.add("is-dragover");
    });

    markupDropZone.addEventListener("dragleave", () => {
        markupDropZone.classList.remove("is-dragover");
    });

    markupDropZone.addEventListener("drop", event => {
        event.preventDefault();
        markupDropZone.classList.remove("is-dragover");
        if (event.dataTransfer?.files?.length) {
            handleMarkupFiles(event.dataTransfer.files);
        }
    });

    markupFileSelect.addEventListener("click", () => markupFileInput.click());
    markupFileInput.addEventListener("change", event => handleMarkupFiles(event.target.files));

    markupFormatButton.addEventListener("click", () => formatMarkup());
    markupIndentRange.addEventListener("input", () => {
        updateMarkupIndentLabel();
        formatMarkup(true);
    });
    markupMode.addEventListener("change", () => {
        if (markupInput.value.trim()) {
            formatMarkup(true);
        }
    });

    markupInput.addEventListener("input", () => {
        setMarkupStatus(markupInput.value.trim() ? "Editing" : "Empty");
        clearMarkupError();
    });

    markupCopyButton.addEventListener("click", () => {
        const text = markupOutput.textContent.trim();
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            const original = markupCopyButton.textContent;
            markupCopyButton.textContent = "Copied";
            markupCopyButton.classList.add("copied");
            setTimeout(() => {
                markupCopyButton.textContent = original;
                markupCopyButton.classList.remove("copied");
            }, 1400);
        }).catch(() => {
            showMarkupError("Failed to copy to clipboard.");
        });
    });

    updateMarkupIndentLabel();
    setMarkupStatus("Ready");
}
