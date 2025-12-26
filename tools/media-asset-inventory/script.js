
(() => {
    const CATEGORY_DEFS = [
        { id: "image", label: "画像" },
        { id: "audio", label: "音声" },
        { id: "video", label: "動画" },
        { id: "embed", label: "埋め込み" },
        { id: "svg", label: "SVG" },
        { id: "canvas", label: "canvas" },
        { id: "text", label: "テキスト" },
        { id: "link", label: "リンク" }
    ];

    const ASSET_EXTENSIONS = new Set([
        "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico",
        "mp3", "wav", "ogg", "flac", "m4a", "aac",
        "mp4", "webm", "ogv", "avi", "mov", "mkv", "mpg", "mpeg",
        "pdf", "zip", "rar", "7z", "gz", "tar", "apk",
        "m3u8", "mpd"
    ]);

    const IMAGE_EXTENSIONS = new Set([
        "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"
    ]);

    const EXTENSION_TO_TYPE = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        avif: "image/avif",
        bmp: "image/bmp",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
        m4a: "audio/mp4",
        aac: "audio/aac",
        mp4: "video/mp4",
        webm: "video/webm",
        ogv: "video/ogg",
        mov: "video/quicktime",
        mkv: "video/x-matroska",
        pdf: "application/pdf"
    };

    const ACTION_ICONS = {
        copy: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <rect x="9" y="9" width="11" height="12" rx="2"></rect>
  <rect x="4" y="3" width="11" height="12" rx="2"></rect>
</svg>`,
        open: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M14 4h6v6"></path>
  <path d="M10 14L20 4"></path>
  <path d="M20 14v6H4V4h6"></path>
</svg>`,
        download: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 3v12"></path>
  <path d="M7 10l5 5 5-5"></path>
  <path d="M5 21h14"></path>
</svg>`
    };

    const SAMPLE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <base href="https://example.com/assets/">
  <style>
    .hero { background-image: url("hero-bg.jpg"); }
    .badge { background: url('icons/badge.svg') no-repeat; }
  </style>
</head>
<body>
  <img src="hero.jpg" srcset="hero.jpg 1x, hero@2x.jpg 2x" width="800" height="400" loading="lazy">
  <picture>
    <source srcset="cover.webp 1x, cover@2x.webp 2x" type="image/webp">
    <img src="cover.jpg" alt="cover">
  </picture>

  <video controls poster="poster.jpg" width="640" height="360">
    <source src="movie.mp4" type="video/mp4">
    <track src="subtitles.vtt" kind="subtitles">
  </video>

  <audio controls src="soundtrack.mp3"></audio>

  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
  <embed src="promo.swf" type="application/x-shockwave-flash">

  <svg width="120" height="40">
    <use href="sprite.svg#logo"></use>
  </svg>

  <canvas width="300" height="200"></canvas>

  <a href="manual.pdf">マニュアルPDF</a>
</body>
</html>`;

    const state = {
        occurrences: [],
        groups: [],
        filteredRows: [],
        activeCategory: "image",
        baseUrl: "",
        sourceUrl: "",
        previewReady: false,
        elementIdCounter: 0,
        usedElementIds: new Set(),
        metaCache: new Map(),
        pendingMeta: new Set(),
        selectedGroupId: null,
        pagination: {
            page: 1,
            perPage: 50
        },
        filters: {
            search: "",
            domain: "all",
            extension: "all",
            dataAttr: "all",
            duplicatesOnly: false,
            minWidth: "",
            minHeight: "",
            minArea: "",
            ignoreQuery: false,
            fetchMeta: true,
            sort: "count-desc"
        },
        advanced: {
            running: false,
            cancel: false,
            total: 0,
            processed: 0
        }
    };

    let ui = {};
    let renderQueued = false;

    document.addEventListener("DOMContentLoaded", () => {
        ui = {
            urlInput: document.getElementById("url-input"),
            htmlInput: document.getElementById("html-input"),
            analyzeBtn: document.getElementById("analyze-btn"),
            sampleBtn: document.getElementById("sample-btn"),
            clearBtn: document.getElementById("clear-btn"),
            statusText: document.getElementById("status-text"),
            errorBanner: document.getElementById("error-banner"),
            categoryList: document.getElementById("category-list"),
            summaryBase: document.getElementById("summary-base"),
            summaryTotal: document.getElementById("summary-total"),
            summaryUnique: document.getElementById("summary-unique"),
            searchInput: document.getElementById("search-input"),
            domainFilter: document.getElementById("domain-filter"),
            extFilter: document.getElementById("ext-filter"),
            dataFilter: document.getElementById("data-filter"),
            dupeFilter: document.getElementById("dupe-filter"),
            ignoreQuery: document.getElementById("ignore-query"),
            fetchMeta: document.getElementById("fetch-meta"),
            minWidth: document.getElementById("min-width"),
            minHeight: document.getElementById("min-height"),
            minArea: document.getElementById("min-area"),
            sortSelect: document.getElementById("sort-select"),
            exportJson: document.getElementById("export-json"),
            exportCsv: document.getElementById("export-csv"),
            filteredCount: document.getElementById("filtered-count"),
            totalCount: document.getElementById("total-count"),
            pagePrev: document.getElementById("page-prev"),
            pageNext: document.getElementById("page-next"),
            pageInfo: document.getElementById("page-info"),
            pageSize: document.getElementById("page-size"),
            tableHead: document.getElementById("asset-table-head"),
            tableBody: document.getElementById("asset-table-body"),
            tableEmpty: document.getElementById("table-empty"),
            detailContent: document.getElementById("detail-content"),
            previewFrame: document.getElementById("preview-frame"),
            previewBase: document.getElementById("preview-base"),
            previewStatus: document.getElementById("preview-status"),
            advancedToggle: document.getElementById("advanced-toggle"),
            cancelAdvanced: document.getElementById("cancel-advanced")
        };

        ui.analyzeBtn.addEventListener("click", handleAnalyze);
        ui.sampleBtn.addEventListener("click", () => {
            ui.htmlInput.value = SAMPLE_HTML.trim();
            setStatus("サンプルHTMLを読み込みました。");
        });
        ui.clearBtn.addEventListener("click", resetAll);

        const searchHandler = debounce(() => {
            state.filters.search = ui.searchInput.value.trim().toLowerCase();
            state.pagination.page = 1;
            renderTable();
        }, 200);
        ui.searchInput.addEventListener("input", searchHandler);
        ui.domainFilter.addEventListener("change", () => {
            state.filters.domain = ui.domainFilter.value;
            state.pagination.page = 1;
            renderTable();
        });
        ui.extFilter.addEventListener("change", () => {
            state.filters.extension = ui.extFilter.value;
            state.pagination.page = 1;
            renderTable();
        });
        ui.dataFilter.addEventListener("change", () => {
            state.filters.dataAttr = ui.dataFilter.value;
            state.pagination.page = 1;
            renderTable();
        });
        ui.dupeFilter.addEventListener("change", () => {
            state.filters.duplicatesOnly = ui.dupeFilter.checked;
            state.pagination.page = 1;
            renderTable();
        });
        ui.ignoreQuery.addEventListener("change", () => {
            state.filters.ignoreQuery = ui.ignoreQuery.checked;
            state.pagination.page = 1;
            rebuildGroups();
            updateCategoryList();
            updateSummary();
            updateFilterOptions();
            renderTable();
        });
        ui.fetchMeta.addEventListener("change", () => {
            state.filters.fetchMeta = ui.fetchMeta.checked;
            if (state.filters.fetchMeta) {
                queueMetadataFetch();
            }
        });
        [ui.minWidth, ui.minHeight, ui.minArea].forEach((input) => {
            input.addEventListener("input", () => {
                state.filters.minWidth = ui.minWidth.value;
                state.filters.minHeight = ui.minHeight.value;
                state.filters.minArea = ui.minArea.value;
                state.pagination.page = 1;
                renderTable();
            });
        });
        ui.sortSelect.addEventListener("change", () => {
            state.filters.sort = ui.sortSelect.value;
            state.pagination.page = 1;
            renderTable();
        });
        ui.pagePrev.addEventListener("click", () => {
            if (state.pagination.page > 1) {
                state.pagination.page -= 1;
                renderTable();
            }
        });
        ui.pageNext.addEventListener("click", () => {
            state.pagination.page += 1;
            renderTable();
        });
        ui.pageSize.addEventListener("change", () => {
            state.pagination.perPage = parseInt(ui.pageSize.value, 10) || 50;
            state.pagination.page = 1;
            renderTable();
        });
        ui.exportJson.addEventListener("click", exportJson);
        ui.exportCsv.addEventListener("click", exportCsv);
        ui.advancedToggle.addEventListener("change", () => {
            if (ui.advancedToggle.checked) {
                startAdvancedScan();
            } else {
                cancelAdvancedScan();
            }
        });
        ui.cancelAdvanced.addEventListener("click", cancelAdvancedScan);

        updateCategoryList();
        updateSummary();
        renderTable();
    });

    async function handleAnalyze() {
        clearError();
        setStatus("解析準備中...");
        state.advanced.cancel = true;
        state.advanced.running = false;
        ui.cancelAdvanced.disabled = true;
        ui.advancedToggle.checked = false;
        state.selectedGroupId = null;
        state.metaCache = new Map();
        state.pendingMeta = new Set();
        state.pagination.page = 1;

        const urlInput = ui.urlInput.value.trim();
        const htmlInput = ui.htmlInput.value.trim();

        let html = htmlInput;
        if (!html && urlInput) {
            try {
                html = await fetchHtml(urlInput);
            } catch (error) {
                showError("このURLはブラウザから取得できないのでHTMLを貼り付けてください。（CORS制約）");
                setStatus("URL取得に失敗しました。");
                return;
            }
        }

        if (!html) {
            showError("HTMLを貼り付けるか、取得したいURLを入力してください。");
            setStatus("入力待ち");
            return;
        }

        const { doc } = sanitizeHtml(html);
        state.baseUrl = resolveBaseUrl(doc, urlInput);
        state.sourceUrl = urlInput;

        applyBaseToDoc(doc, state.baseUrl);
        injectPreviewStyle(doc);

        setStatus("解析中...");
        state.occurrences = await extractOccurrences(doc, state.baseUrl);
        rebuildGroups();
        updateCategoryList();
        updateSummary();
        updateFilterOptions();

        renderTable();
        renderDetails(null);
        updatePreview(doc);

        if (state.filters.fetchMeta) {
            queueMetadataFetch();
        }

        setStatus(`解析完了: ${state.occurrences.length} 件`);
    }

    function resetAll() {
        ui.urlInput.value = "";
        ui.htmlInput.value = "";
        ui.searchInput.value = "";
        ui.domainFilter.value = "all";
        ui.extFilter.value = "all";
        ui.dataFilter.value = "all";
        ui.dupeFilter.checked = false;
        ui.ignoreQuery.checked = false;
        ui.fetchMeta.checked = true;
        ui.minWidth.value = "";
        ui.minHeight.value = "";
        ui.minArea.value = "";
        ui.sortSelect.value = "count-desc";
        ui.advancedToggle.checked = false;
        ui.cancelAdvanced.disabled = true;

        state.occurrences = [];
        state.groups = [];
        state.filteredRows = [];
        state.selectedGroupId = null;
        state.baseUrl = "";
        state.sourceUrl = "";
        state.previewReady = false;
        state.metaCache = new Map();
        state.pendingMeta = new Set();
        state.pagination.page = 1;
        state.pagination.perPage = 50;
        state.filters.search = "";
        state.filters.domain = "all";
        state.filters.extension = "all";
        state.filters.dataAttr = "all";
        state.filters.duplicatesOnly = false;
        state.filters.minWidth = "";
        state.filters.minHeight = "";
        state.filters.minArea = "";
        state.filters.ignoreQuery = false;
        state.filters.fetchMeta = true;
        state.filters.sort = "count-desc";
        state.advanced.running = false;
        state.advanced.cancel = false;

        updateCategoryList();
        updateSummary();
        updateFilterOptions();
        renderTable();
        renderDetails(null);
        ui.previewFrame.srcdoc = "";
        ui.previewBase.textContent = "-";
        setPreviewStatus("プレビューは解析後に表示されます。");
        setStatus("待機中");
        clearError();
    }

    function updatePreview(doc) {
        state.previewReady = false;
        const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        ui.previewFrame.onload = () => {
            state.previewReady = true;
            setPreviewStatus("プレビュー準備完了");
            if (state.selectedGroupId) {
                const selected = state.groups.find((group) => group.id === state.selectedGroupId);
                highlightGroup(selected);
            }
        };
        ui.previewFrame.srcdoc = html;
        ui.previewBase.textContent = state.baseUrl || "-";
        setPreviewStatus("プレビュー読み込み中...");
    }

    function setActiveCategory(categoryId) {
        state.activeCategory = categoryId;
        state.pagination.page = 1;
        updateCategoryList();
        updateFilterOptions();
        renderTable();
        renderDetails(null);
    }

    function updateCategoryList() {
        ui.categoryList.innerHTML = "";
        const { totals, uniques } = computeCategoryStats();

        CATEGORY_DEFS.forEach((category) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "category-button" + (category.id === state.activeCategory ? " is-active" : "");
            button.addEventListener("click", () => setActiveCategory(category.id));

            const label = document.createElement("span");
            label.textContent = category.label;

            const count = document.createElement("span");
            count.className = "category-count";
            count.textContent = `${totals[category.id] || 0} / ${uniques[category.id] || 0}`;

            button.append(label, count);
            ui.categoryList.appendChild(button);
        });
    }

    function updateSummary() {
        ui.summaryBase.textContent = state.baseUrl || "-";
        ui.summaryTotal.textContent = state.occurrences.length.toString();
        ui.summaryUnique.textContent = state.groups.length.toString();
    }

    function updateFilterOptions() {
        const groups = state.groups.filter((group) => group.countByCategory[state.activeCategory]);
        const domains = new Set();
        const extensions = new Set();

        groups.forEach((group) => {
            if (group.host) {
                domains.add(group.host);
            }
            if (group.extension) {
                extensions.add(group.extension);
            }
        });

        populateSelect(ui.domainFilter, "ドメイン: すべて", Array.from(domains).sort());
        populateSelect(ui.extFilter, "拡張子: すべて", Array.from(extensions).sort(), (value) => `.${value}`);
    }

    function populateSelect(select, defaultLabel, values, formatter) {
        const current = select.value;
        select.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "all";
        defaultOption.textContent = defaultLabel;
        select.appendChild(defaultOption);

        values.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = formatter ? formatter(value) : value;
            select.appendChild(option);
        });

        select.value = values.includes(current) ? current : "all";
        if (select === ui.domainFilter) {
            state.filters.domain = select.value;
        }
        if (select === ui.extFilter) {
            state.filters.extension = select.value;
        }
    }

    function renderTable() {
        updateTableHeader();
        const rows = getFilteredRows();
        state.filteredRows = rows;
        ui.tableBody.innerHTML = "";

        if (!rows.length) {
            updateCounts(0);
            updatePagination(0);
            ui.tableEmpty.classList.remove("hidden");
            return;
        }

        ui.tableEmpty.classList.add("hidden");

        const pagedRows = paginateRows(rows);
        updateCounts(rows.length);
        updatePagination(rows.length);

        pagedRows.forEach((row) => {
            const tr = document.createElement("tr");
            tr.dataset.groupId = row.group.id;
            if (row.group.id === state.selectedGroupId) {
                tr.classList.add("is-selected");
            }

            if (state.activeCategory === "text") {
                const snippetCell = document.createElement("td");
                snippetCell.textContent = row.textSnippet || "(text)";

                const tagCell = document.createElement("td");
                tagCell.textContent = row.elementTag || "-";

                const countCell = document.createElement("td");
                countCell.textContent = row.count.toString();

                const lengthCell = document.createElement("td");
                lengthCell.textContent = row.textLength ? row.textLength.toString() : "-";

                const pathCell = document.createElement("td");
                const pathSpan = document.createElement("span");
                pathSpan.className = "mono";
                pathSpan.textContent = row.domPath || "-";
                pathCell.appendChild(pathSpan);

                tr.append(snippetCell, tagCell, countCell, lengthCell, pathCell);
            } else {
                const thumbCell = document.createElement("td");
                thumbCell.className = "thumb-cell";
                thumbCell.appendChild(buildThumbnail(row.group));

                const typeCell = document.createElement("td");
                typeCell.textContent = row.typeLabel;

                const urlCell = document.createElement("td");
                const urlSpan = document.createElement("span");
                urlSpan.className = "mono";
                urlSpan.textContent = formatDisplayUrl(row.displayUrl);
                urlSpan.title = row.displayUrl;
                urlCell.appendChild(urlSpan);

                const countCell = document.createElement("td");
                countCell.textContent = row.count.toString();

                const extCell = document.createElement("td");
                extCell.textContent = row.extension ? `.${row.extension}` : "-";

                const sizeCell = document.createElement("td");
                sizeCell.textContent = row.sizeLabel;

                const typeMetaCell = document.createElement("td");
                typeMetaCell.textContent = row.contentType || row.fileType || "-";

                tr.append(thumbCell, typeCell, urlCell, countCell, extCell, sizeCell, typeMetaCell);
            }

            tr.addEventListener("click", () => selectGroup(row.group.id));
            ui.tableBody.appendChild(tr);
        });
    }

    function updateTableHeader() {
        if (!ui.tableHead) {
            return;
        }
        ui.tableHead.innerHTML = "";
        const row = document.createElement("tr");
        if (state.activeCategory === "text") {
            ["抜粋", "要素", "回数", "文字数", "DOMパス"].forEach((label) => {
                const th = document.createElement("th");
                th.textContent = label;
                row.appendChild(th);
            });
        } else {
            ["サムネ", "種別", "URL", "回数", "拡張子", "サイズ/時間", "Content-Type"].forEach((label) => {
                const th = document.createElement("th");
                th.textContent = label;
                row.appendChild(th);
            });
        }
        ui.tableHead.appendChild(row);
    }

    function formatDisplayUrl(url) {
        if (!url) {
            return "-";
        }
        const maxLength = 100;
        if (url.length <= maxLength) {
            return url;
        }
        return `${url.slice(0, maxLength - 3)}...`;
    }

    function buildDetailActions(group) {
        const actionUrl = getActionUrl(group);
        if (!actionUrl) {
            return null;
        }

        const actions = document.createElement("div");
        actions.className = "detail-actions";

        const copyButton = createActionButton("URLをコピー", ACTION_ICONS.copy, async () => {
            await copyToClipboard(actionUrl);
            flashButton(copyButton);
        });
        const openButton = createActionButton("新しいタブで開く", ACTION_ICONS.open, () => {
            openInNewTab(actionUrl);
        });
        actions.append(copyButton, openButton);

        if (isDownloadableGroup(group, actionUrl)) {
            const downloadButton = createActionButton("ダウンロード", ACTION_ICONS.download, () => {
                triggerDownload(actionUrl);
            });
            actions.append(downloadButton);
        }

        return actions;
    }

    function createActionButton(label, iconMarkup, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.innerHTML = iconMarkup;
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            Promise.resolve(onClick()).catch(() => {});
        });
        return button;
    }

    function flashButton(button) {
        if (!button) {
            return;
        }
        button.classList.add("is-active");
        window.setTimeout(() => button.classList.remove("is-active"), 900);
    }

    function getActionUrl(group) {
        return pickSafeUrl(group.primaryResolvedUrl, group.primaryRawUrl);
    }

    function isDownloadableGroup(group, url) {
        const extension = getExtension(url);
        if (extension && ASSET_EXTENSIONS.has(extension)) {
            return true;
        }
        const type = group.fileType || group.meta.contentType || "";
        if (/^(image|audio|video)\//.test(type)) {
            return true;
        }
        return group.categories.has("image")
            || group.categories.has("audio")
            || group.categories.has("video")
            || group.categories.has("svg");
    }

    async function copyToClipboard(text) {
        if (!text) {
            return;
        }
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (error) {
            }
        }
        fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
        } catch (error) {
        }
        textarea.remove();
    }

    function openInNewTab(url) {
        if (!url) {
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    }

    function triggerDownload(url) {
        if (!url) {
            return;
        }
        const anchor = document.createElement("a");
        anchor.href = url;
        const filename = getFilenameFromUrl(url);
        anchor.download = filename || "";
        anchor.rel = "noopener";
        anchor.target = "_blank";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    function getFilenameFromUrl(url) {
        try {
            const { pathname } = new URL(url);
            const name = pathname.split("/").pop();
            return name || "";
        } catch (error) {
            return "";
        }
    }

    function updateCounts(filteredCount) {
        const totalInCategory = state.groups.filter((group) => group.countByCategory[state.activeCategory]).length;
        ui.filteredCount.textContent = filteredCount.toString();
        ui.totalCount.textContent = totalInCategory.toString();
    }

    function updatePagination(totalItems) {
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / state.pagination.perPage);
        const currentPage = totalPages === 0 ? 0 : state.pagination.page;
        ui.pageInfo.textContent = `${currentPage} / ${totalPages}`;
        ui.pagePrev.disabled = currentPage <= 1;
        ui.pageNext.disabled = totalPages === 0 || currentPage >= totalPages;
        if (ui.pageSize.value !== String(state.pagination.perPage)) {
            ui.pageSize.value = String(state.pagination.perPage);
        }
    }

    function paginateRows(rows) {
        if (!rows.length) {
            state.pagination.page = 1;
            return [];
        }
        const perPage = state.pagination.perPage;
        const totalPages = Math.ceil(rows.length / perPage);
        if (state.pagination.page > totalPages) {
            state.pagination.page = totalPages;
        }
        const start = (state.pagination.page - 1) * perPage;
        return rows.slice(start, start + perPage);
    }

    function buildThumbnail(group) {
        const wrapper = document.createElement("div");
        wrapper.className = "thumb";
        const info = getThumbnailInfo(group);
        if (info && info.url) {
            const img = document.createElement("img");
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            img.alt = info.label || "thumbnail";
            img.src = info.url;
            wrapper.appendChild(img);
        } else {
            const placeholder = document.createElement("span");
            placeholder.className = "thumb-placeholder";
            placeholder.textContent = info ? info.label : "-";
            wrapper.appendChild(placeholder);
        }
        return wrapper;
    }

    function getThumbnailInfo(group) {
        const representative = getRepresentativeOccurrence(group, state.activeCategory) || group.occurrences[0];
        const category = state.activeCategory;
        let url = "";
        let label = "";

        if (category === "image" || category === "svg") {
            url = pickSafeUrl(group.primaryResolvedUrl, group.primaryRawUrl);
            label = category === "svg" ? "svg" : "img";
        } else if (category === "video") {
            const poster = representative && representative.attributes ? representative.attributes.poster : "";
            const resolvedPoster = poster ? resolveUrl(poster, state.baseUrl) : "";
            url = pickSafeUrl(resolvedPoster, poster);
            label = "video";
        } else if (category === "audio") {
            label = "audio";
        } else if (category === "embed") {
            label = representative && representative.elementTag === "iframe" ? "iframe" : "embed";
        } else if (category === "canvas") {
            label = "canvas";
        } else if (category === "link") {
            const linkUrl = pickSafeUrl(group.primaryResolvedUrl, group.primaryRawUrl);
            if (linkUrl && isImageUrl(linkUrl)) {
                url = linkUrl;
                label = "img";
            } else {
                label = group.extension || "link";
            }
        } else if (category === "text") {
            label = "text";
        }

        return { url, label };
    }

    function pickSafeUrl(...candidates) {
        for (const candidate of candidates) {
            if (candidate && !isUnsafeUrl(candidate)) {
                return candidate;
            }
        }
        return "";
    }
    function renderDetails(group) {
        ui.detailContent.innerHTML = "";
        if (!group) {
            const hint = document.createElement("p");
            hint.className = "muted";
            hint.textContent = "左のカテゴリから一覧を選択すると詳細が表示されます。";
            ui.detailContent.appendChild(hint);
            return;
        }

        const representative = getRepresentativeOccurrence(group, state.activeCategory) || group.occurrences[0];
        const occurrences = group.occurrences.filter((occ) => occ.category === state.activeCategory);

        const summarySection = document.createElement("div");
        summarySection.className = "detail-section";
        const summaryGrid = document.createElement("div");
        summaryGrid.className = "detail-grid";

        addGridRow(summaryGrid, "カテゴリ", state.activeCategory);
        addGridRow(summaryGrid, "要素", representative ? representative.elementTag : "-");
        addGridRow(summaryGrid, "属性", representative ? representative.attrName : "-");
        addGridRow(summaryGrid, "出現回数", `${occurrences.length} / ${group.occurrences.length}`);
        addGridRow(summaryGrid, "推定種別", group.fileType || "-");
        addGridRow(summaryGrid, "ホスト", group.host || "-");
        addGridRow(summaryGrid, "拡張子", group.extension ? `.${group.extension}` : "-");
        if (representative && representative.textLength) {
            addGridRow(summaryGrid, "文字数", representative.textLength.toString());
        }
        if (group.meta && (group.meta.contentLength || group.meta.duration)) {
            addGridRow(summaryGrid, "サイズ", group.meta.contentLength || "-");
            addGridRow(summaryGrid, "時間", group.meta.duration ? formatDuration(group.meta.duration) : "-");
        }

        summarySection.appendChild(summaryGrid);
        ui.detailContent.appendChild(summarySection);

        const urlSection = document.createElement("div");
        urlSection.className = "detail-section";
        const urlGrid = document.createElement("div");
        urlGrid.className = "detail-grid";

        addGridRow(urlGrid, "元URL", uniqueListText(group.rawUrls));
        addGridRow(urlGrid, "解決後URL", uniqueListText(group.resolvedUrls));
        addGridRow(urlGrid, "正規化", group.normalizedUrl || "-");
        urlSection.appendChild(urlGrid);
        const detailActions = buildDetailActions(group);
        if (detailActions) {
            urlSection.appendChild(detailActions);
        }
        ui.detailContent.appendChild(urlSection);

        const attrSection = document.createElement("div");
        attrSection.className = "detail-section";
        const attrTitle = document.createElement("div");
        attrTitle.className = "detail-label";
        attrTitle.textContent = "元の属性";
        const attrList = document.createElement("div");
        attrList.className = "detail-list";
        if (representative && representative.attributes) {
            const entries = Object.entries(representative.attributes)
                .filter(([key]) => key !== "data-asset-el" && key !== "data-tool")
                .slice(0, 12);
            if (!entries.length) {
                const empty = document.createElement("div");
                empty.className = "detail-item muted";
                empty.textContent = "属性はありません。";
                attrList.appendChild(empty);
            } else {
                entries.forEach(([key, value]) => {
                    const item = document.createElement("div");
                    item.className = "detail-item";
                    item.textContent = `${key}: ${value}`;
                    attrList.appendChild(item);
                });
            }
        }
        attrSection.append(attrTitle, attrList);
        ui.detailContent.appendChild(attrSection);

        const occSection = document.createElement("div");
        occSection.className = "detail-section";
        const occTitle = document.createElement("div");
        occTitle.className = "detail-label";
        occTitle.textContent = "同一URLの重複リスト";
        const occList = document.createElement("div");
        occList.className = "detail-list";
        const limited = occurrences.slice(0, 20);
        if (!limited.length) {
            const empty = document.createElement("div");
            empty.className = "detail-item muted";
            empty.textContent = "該当する要素がありません。";
            occList.appendChild(empty);
        } else {
            limited.forEach((occ) => {
                const item = document.createElement("div");
                item.className = "detail-item";
                const label = occ.domPath ? `${occ.elementTag}:${occ.attrName} — ${occ.domPath}` : `${occ.elementTag}:${occ.attrName}`;
                item.textContent = label;
                occList.appendChild(item);
            });
            if (occurrences.length > limited.length) {
                const more = document.createElement("div");
                more.className = "muted";
                more.textContent = `ほか ${occurrences.length - limited.length} 件`;
                occList.appendChild(more);
            }
        }
        occSection.append(occTitle, occList);
        ui.detailContent.appendChild(occSection);

        if (state.activeCategory === "text" && group.textSnippets && group.textSnippets.size) {
            const textSection = document.createElement("div");
            textSection.className = "detail-section";
            const textTitle = document.createElement("div");
            textTitle.className = "detail-label";
            textTitle.textContent = "テキスト抜粋";
            const textList = document.createElement("div");
            textList.className = "detail-list";
            Array.from(group.textSnippets).slice(0, 6).forEach((snippet) => {
                const item = document.createElement("div");
                item.className = "detail-item";
                item.textContent = snippet;
                textList.appendChild(item);
            });
            textSection.append(textTitle, textList);
            ui.detailContent.appendChild(textSection);
        }
    }

    function selectGroup(groupId) {
        state.selectedGroupId = groupId;
        renderTable();
        const group = state.groups.find((item) => item.id === groupId);
        renderDetails(group);
        highlightGroup(group);
    }

    function highlightGroup(group) {
        if (!group || !state.previewReady) {
            return;
        }

        const doc = ui.previewFrame.contentDocument;
        if (!doc) {
            return;
        }

        doc.querySelectorAll(".asset-highlight").forEach((el) => el.classList.remove("asset-highlight"));
        const occurrences = group.occurrences.filter((occ) => occ.elementId);
        let firstTarget = null;

        occurrences.forEach((occ) => {
            const target = doc.querySelector(`[data-asset-el="${occ.elementId}"]`);
            if (target) {
                target.classList.add("asset-highlight");
                if (!firstTarget) {
                    firstTarget = target;
                }
            }
        });

        if (firstTarget) {
            firstTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    function computeCategoryStats() {
        const totals = {};
        const uniques = {};
        CATEGORY_DEFS.forEach((category) => {
            totals[category.id] = 0;
            uniques[category.id] = 0;
        });
        state.occurrences.forEach((occ) => {
            totals[occ.category] = (totals[occ.category] || 0) + 1;
        });
        state.groups.forEach((group) => {
            Object.keys(group.countByCategory).forEach((category) => {
                uniques[category] = (uniques[category] || 0) + 1;
            });
        });
        return { totals, uniques };
    }

    function getFilteredRows() {
        const rows = [];
        const search = state.filters.search;
        const domain = state.filters.domain;
        const extension = state.filters.extension;
        const dataFilter = state.filters.dataAttr;
        const duplicatesOnly = state.filters.duplicatesOnly;
        const minWidth = parseNumber(state.filters.minWidth);
        const minHeight = parseNumber(state.filters.minHeight);
        const minArea = parseNumber(state.filters.minArea);

        state.groups.forEach((group) => {
            const count = group.countByCategory[state.activeCategory] || 0;
            if (!count) {
                return;
            }
            if (duplicatesOnly && count < 2) {
                return;
            }
            if (domain !== "all" && group.host !== domain) {
                return;
            }
            if (extension !== "all" && group.extension !== extension) {
                return;
            }
            if (dataFilter === "with" && !group.hasDataAttributes) {
                return;
            }
            if (dataFilter === "without" && group.hasDataAttributes) {
                return;
            }

            const width = group.meta.width || group.meta.naturalWidth || group.meta.videoWidth || 0;
            const height = group.meta.height || group.meta.naturalHeight || group.meta.videoHeight || 0;
            const area = width && height ? width * height : 0;

            if (minWidth && width < minWidth) {
                return;
            }
            if (minHeight && height < minHeight) {
                return;
            }
            if (minArea && area < minArea) {
                return;
            }

            const displayUrl = getDisplayLabel(group);
            const haystack = `${displayUrl} ${group.primaryElementTag || ""} ${group.primaryAttrName || ""} ${group.fileType || ""}`.toLowerCase();
            if (search && !haystack.includes(search)) {
                return;
            }

            const representative = getRepresentativeOccurrence(group, state.activeCategory) || group.occurrences[0];
            const textSnippet = getTextPreview(group);
            const textLength = group.textLength || (representative && representative.textLength) || 0;
            const domPath = representative ? representative.domPath : "";
            const elementTag = representative ? representative.elementTag : "";

            rows.push({
                group,
                count,
                displayUrl,
                extension: group.extension,
                typeLabel: getTypeLabel(group),
                fileType: group.fileType,
                contentType: group.meta.contentType || "",
                sizeLabel: formatSizeLabel(group),
                textSnippet,
                textLength,
                domPath,
                elementTag
            });
        });

        sortRows(rows, state.filters.sort);
        return rows;
    }

    function getDisplayLabel(group) {
        if (state.activeCategory === "text") {
            const preview = getTextPreview(group);
            return preview || "(text)";
        }
        return group.primaryResolvedUrl || group.primaryRawUrl || "(inline)";
    }

    function getTextPreview(group) {
        if (!group.textSnippets || !group.textSnippets.size) {
            return "";
        }
        const first = Array.from(group.textSnippets)[0];
        if (!first) {
            return "";
        }
        return first.length > 80 ? `${first.slice(0, 80)}...` : first;
    }

    function getRepresentativeOccurrence(group, category) {
        return group.occurrences.find((occ) => occ.category === category);
    }

    function getTypeLabel(group) {
        const representative = getRepresentativeOccurrence(group, state.activeCategory) || group.occurrences[0];
        if (!representative) {
            return state.activeCategory;
        }
        if (!representative.attrName) {
            return representative.elementTag;
        }
        return `${representative.elementTag}:${representative.attrName}`;
    }

    function sortRows(rows, sortMode) {
        const byString = (a, b) => a.localeCompare(b, "en");
        switch (sortMode) {
            case "count-asc":
                rows.sort((a, b) => a.count - b.count);
                break;
            case "count-desc":
                rows.sort((a, b) => b.count - a.count);
                break;
            case "url-asc":
                rows.sort((a, b) => byString(a.displayUrl, b.displayUrl));
                break;
            case "url-desc":
                rows.sort((a, b) => byString(b.displayUrl, a.displayUrl));
                break;
            case "size-asc":
                rows.sort((a, b) => sizeScore(a.group) - sizeScore(b.group));
                break;
            case "size-desc":
                rows.sort((a, b) => sizeScore(b.group) - sizeScore(a.group));
                break;
            default:
                rows.sort((a, b) => b.count - a.count);
        }
    }

    function sizeScore(group) {
        if (state.activeCategory === "text") {
            return group.textLength || 0;
        }
        const width = group.meta.width || group.meta.naturalWidth || group.meta.videoWidth || 0;
        const height = group.meta.height || group.meta.naturalHeight || group.meta.videoHeight || 0;
        return width * height;
    }

    function formatSizeLabel(group) {
        const width = group.meta.width || group.meta.naturalWidth || group.meta.videoWidth || 0;
        const height = group.meta.height || group.meta.naturalHeight || group.meta.videoHeight || 0;
        if (width && height) {
            return `${width}x${height}`;
        }
        if (group.meta.duration) {
            return formatDuration(group.meta.duration);
        }
        return "-";
    }
    function rebuildGroups() {
        const map = new Map();
        let groupCounter = 1;

        state.occurrences.forEach((occ) => {
            const key = buildGroupKey(occ);
            if (!map.has(key)) {
                map.set(key, {
                    id: `group-${groupCounter++}`,
                    key,
                    normalizedUrl: occ.resolvedUrl ? normalizeUrl(occ.resolvedUrl, state.filters.ignoreQuery) : "",
                    primaryResolvedUrl: occ.resolvedUrl || "",
                    primaryRawUrl: occ.rawUrl || "",
                    primaryElementTag: occ.elementTag,
                    primaryAttrName: occ.attrName,
                    host: "",
                    extension: "",
                    fileType: "",
                    categories: new Set(),
                    countByCategory: {},
                    occurrences: [],
                    rawUrls: new Set(),
                    resolvedUrls: new Set(),
                    hasDataAttributes: false,
                    meta: {},
                    textSnippets: new Set(),
                    textLength: 0
                });
            }

            const group = map.get(key);
            group.occurrences.push(occ);
            group.categories.add(occ.category);
            group.countByCategory[occ.category] = (group.countByCategory[occ.category] || 0) + 1;
            if (occ.rawUrl) {
                group.rawUrls.add(occ.rawUrl);
            }
            if (occ.resolvedUrl) {
                group.resolvedUrls.add(occ.resolvedUrl);
            }
            if (occ.hasDataAttributes) {
                group.hasDataAttributes = true;
            }
            if (occ.textSnippet) {
                group.textSnippets.add(occ.textSnippet);
                group.textLength = Math.max(group.textLength, occ.textLength || 0);
            }
            if (!group.primaryResolvedUrl && occ.resolvedUrl) {
                group.primaryResolvedUrl = occ.resolvedUrl;
            }
            if (!group.primaryRawUrl && occ.rawUrl) {
                group.primaryRawUrl = occ.rawUrl;
            }
        });

        state.groups = Array.from(map.values()).map((group) => {
            group.host = extractHost(group.primaryResolvedUrl);
            group.extension = getExtension(group.primaryResolvedUrl || group.primaryRawUrl);
            if (group.primaryResolvedUrl && state.metaCache.has(group.primaryResolvedUrl)) {
                group.meta = state.metaCache.get(group.primaryResolvedUrl);
            }
            group.fileType = guessFileType(group.extension, group.meta.contentType);
            return group;
        });
    }

    function buildGroupKey(occ) {
        if (occ.resolvedUrl) {
            return normalizeUrl(occ.resolvedUrl, state.filters.ignoreQuery);
        }
        if (occ.rawUrl) {
            return `raw:${occ.rawUrl}`;
        }
        return `inline:${occ.category}:${occ.elementId || occ.id}`;
    }

    async function extractOccurrences(doc, baseUrl) {
        const occurrences = [];
        let occCounter = 0;
        const cache = new WeakMap();

        resetElementIds(doc);

        const addOccurrence = (element, category, attrName, rawUrl, sourceHint, extra) => {
            if (rawUrl && isUnsafeUrl(rawUrl)) {
                return;
            }
            const resolvedUrl = resolveUrl(rawUrl, baseUrl);
            const info = element ? getElementInfo(element, cache) : null;
            occurrences.push({
                id: `occ-${++occCounter}`,
                category,
                elementTag: info ? info.tagName : "unknown",
                elementId: info ? info.elementId : null,
                domPath: info ? info.domPath : "",
                attributes: info ? info.attributes : {},
                hasDataAttributes: info ? info.hasDataAttributes : false,
                attrName: attrName || "",
                rawUrl: rawUrl || "",
                resolvedUrl,
                sourceHint: sourceHint || "",
                textSnippet: extra && extra.snippet ? extra.snippet : "",
                textLength: extra && extra.length ? extra.length : 0
            });
        };

        const addUrlOccurrence = (element, category, attrName, rawUrl, sourceHint) => {
            if (!rawUrl || rawUrl.trim() === "") {
                return;
            }
            const inferredCategory = category === "image" ? classifyImageCategory(rawUrl) : category;
            addOccurrence(element, inferredCategory, attrName, rawUrl, sourceHint);
        };

        const imageElements = Array.from(doc.querySelectorAll("img"));
        for (const img of imageElements) {
            addUrlOccurrence(img, "image", "src", img.getAttribute("src"));
            addSrcsetOccurrences(img, "image", "srcset", addUrlOccurrence);
        }
        await yieldToMain();

        const pictureSources = Array.from(doc.querySelectorAll("picture source"));
        for (const source of pictureSources) {
            addSrcsetOccurrences(source, "image", "srcset", addUrlOccurrence);
        }
        await yieldToMain();

        const videoElements = Array.from(doc.querySelectorAll("video"));
        for (const video of videoElements) {
            addUrlOccurrence(video, "video", "src", video.getAttribute("src"));
            addUrlOccurrence(video, "image", "poster", video.getAttribute("poster"));
        }
        await yieldToMain();

        const audioElements = Array.from(doc.querySelectorAll("audio"));
        for (const audio of audioElements) {
            addUrlOccurrence(audio, "audio", "src", audio.getAttribute("src"));
        }
        await yieldToMain();

        const sourceElements = Array.from(doc.querySelectorAll("video source, audio source"));
        for (const source of sourceElements) {
            const parentVideo = source.closest("video");
            const category = parentVideo ? "video" : "audio";
            addUrlOccurrence(source, category, "src", source.getAttribute("src"));
        }
        await yieldToMain();

        const trackElements = Array.from(doc.querySelectorAll("track"));
        for (const track of trackElements) {
            const parentVideo = track.closest("video");
            const category = parentVideo ? "video" : "audio";
            addUrlOccurrence(track, category, "src", track.getAttribute("src"));
        }
        await yieldToMain();

        const iframeElements = Array.from(doc.querySelectorAll("iframe"));
        for (const iframe of iframeElements) {
            addUrlOccurrence(iframe, "embed", "src", iframe.getAttribute("src"));
        }

        const embedElements = Array.from(doc.querySelectorAll("embed"));
        for (const embed of embedElements) {
            addUrlOccurrence(embed, "embed", "src", embed.getAttribute("src"));
        }

        const objectElements = Array.from(doc.querySelectorAll("object"));
        for (const objectEl of objectElements) {
            addUrlOccurrence(objectEl, "embed", "data", objectEl.getAttribute("data"));
            addUrlOccurrence(objectEl, "embed", "src", objectEl.getAttribute("src"));
        }
        await yieldToMain();

        const linkElements = Array.from(doc.querySelectorAll("a[href]"));
        for (const link of linkElements) {
            const href = link.getAttribute("href");
            if (href && isAssetLikeLink(href)) {
                addUrlOccurrence(link, "link", "href", href);
            }
        }
        await yieldToMain();

        const svgElements = Array.from(doc.querySelectorAll("svg"));
        for (const svg of svgElements) {
            const uses = Array.from(svg.querySelectorAll("use"));
            let hasExternal = false;
            for (const use of uses) {
                const href = use.getAttribute("href") || use.getAttribute("xlink:href");
                if (href && !href.startsWith("#")) {
                    addUrlOccurrence(use, "svg", "href", href);
                    hasExternal = true;
                }
            }
            if (!hasExternal) {
                addOccurrence(svg, "svg", "inline", "");
            }
        }
        await yieldToMain();

        const canvasElements = Array.from(doc.querySelectorAll("canvas"));
        for (const canvas of canvasElements) {
            addOccurrence(canvas, "canvas", "element", "");
        }

        const styledElements = Array.from(doc.querySelectorAll("[style]"));
        for (const element of styledElements) {
            if (element.hasAttribute("data-tool")) {
                continue;
            }
            const styleText = element.getAttribute("style") || "";
            const urls = extractUrlsFromCss(styleText);
            urls.forEach((url) => {
                addUrlOccurrence(element, "image", "style", url);
            });
        }
        await yieldToMain();

        const styleTags = Array.from(doc.querySelectorAll("style"));
        for (const styleTag of styleTags) {
            if (styleTag.hasAttribute("data-tool")) {
                continue;
            }
            const cssText = styleTag.textContent || "";
            const urls = extractUrlsFromCss(cssText);
            urls.forEach((url) => {
                addUrlOccurrence(styleTag, "image", "style-tag", url);
            });
        }

        const textElements = new Map();
        const root = doc.body || doc;
        if (root && root.nodeType === 1) {
            const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let textCounter = 0;
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const parent = node.parentElement;
                if (!parent || parent.hasAttribute("data-tool")) {
                    continue;
                }
                const tag = parent.tagName ? parent.tagName.toLowerCase() : "";
                if (isTextIgnoredTag(tag)) {
                    continue;
                }
                const text = node.textContent ? node.textContent.replace(/\s+/g, " ").trim() : "";
                if (!text) {
                    continue;
                }
                if (!textElements.has(parent)) {
                    textElements.set(parent, []);
                }
                textElements.get(parent).push(text);
                textCounter += 1;
                if (textCounter % 400 === 0) {
                    await yieldToMain();
                }
            }
        }

        let elementCounter = 0;
        for (const [element, texts] of textElements.entries()) {
            const joined = texts.join(" ").replace(/\s+/g, " ").trim();
            if (!joined) {
                continue;
            }
            const snippet = joined.length > 120 ? `${joined.slice(0, 120)}...` : joined;
            addOccurrence(element, "text", "text", "", "", { snippet, length: joined.length });
            elementCounter += 1;
            if (elementCounter % 200 === 0) {
                await yieldToMain();
            }
        }

        return occurrences;
    }

    function addSrcsetOccurrences(element, category, attrName, addUrlOccurrence) {
        const srcset = element.getAttribute(attrName);
        if (!srcset) {
            return;
        }
        const candidates = parseSrcset(srcset);
        candidates.forEach((candidate) => {
            addUrlOccurrence(element, category, attrName, candidate.url, candidate.descriptor);
        });
    }

    function resetElementIds(doc) {
        state.elementIdCounter = 0;
        state.usedElementIds = new Set();
        const all = Array.from(doc.querySelectorAll("*"));
        all.forEach((el) => {
            const existing = el.getAttribute("data-asset-el");
            if (existing) {
                state.usedElementIds.add(existing);
                return;
            }
            el.setAttribute("data-asset-el", generateElementId());
        });
    }

    function generateElementId() {
        let id;
        do {
            state.elementIdCounter += 1;
            id = `asset-${state.elementIdCounter}`;
        } while (state.usedElementIds.has(id));
        state.usedElementIds.add(id);
        return id;
    }

    function getElementInfo(element, cache) {
        if (cache && cache.has(element)) {
            return cache.get(element);
        }
        const info = captureElementInfo(element);
        if (cache) {
            cache.set(element, info);
        }
        return info;
    }

    function captureElementInfo(element) {
        if (!element.getAttribute("data-asset-el")) {
            element.setAttribute("data-asset-el", generateElementId());
        }
        const attributes = {};
        let hasDataAttributes = false;
        Array.from(element.attributes).forEach((attr) => {
            if (attr.name.startsWith("on")) {
                return;
            }
            attributes[attr.name] = attr.value;
            if (attr.name.startsWith("data-")) {
                hasDataAttributes = true;
            }
        });
        return {
            elementId: element.getAttribute("data-asset-el"),
            domPath: buildDomPath(element),
            attributes,
            hasDataAttributes,
            tagName: element.tagName.toLowerCase()
        };
    }

    function buildDomPath(element) {
        const parts = [];
        let current = element;
        let depth = 0;
        while (current && current.nodeType === 1 && depth < 6) {
            let label = current.tagName.toLowerCase();
            if (current.id) {
                label += `#${current.id}`;
            } else if (current.classList && current.classList.length) {
                label += `.${current.classList[0]}`;
            }
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    label += `:nth-of-type(${index})`;
                }
            }
            parts.unshift(label);
            current = current.parentElement;
            depth += 1;
        }
        return parts.join(" > ");
    }
    function classifyImageCategory(url) {
        const ext = getExtension(url);
        if (ext === "svg") {
            return "svg";
        }
        return "image";
    }

    function parseSrcset(value) {
        const candidates = [];
        let current = "";
        let quote = "";
        let depth = 0;

        for (let i = 0; i < value.length; i += 1) {
            const char = value[i];
            if (quote) {
                if (char === quote) {
                    quote = "";
                }
                current += char;
                continue;
            }
            if (char === "\"" || char === "'") {
                quote = char;
                current += char;
                continue;
            }
            if (char === "(") {
                depth += 1;
                current += char;
                continue;
            }
            if (char === ")") {
                depth = Math.max(0, depth - 1);
                current += char;
                continue;
            }
            if (char === "," && depth === 0) {
                if (current.trim()) {
                    candidates.push(current.trim());
                }
                current = "";
                continue;
            }
            current += char;
        }
        if (current.trim()) {
            candidates.push(current.trim());
        }

        return candidates
            .map((item) => {
                const parts = item.split(/\s+/);
                const url = parts.shift();
                if (!url) {
                    return null;
                }
                return {
                    url: url.replace(/^['"]|['"]$/g, ""),
                    descriptor: parts.join(" ")
                };
            })
            .filter(Boolean);
    }

    function extractUrlsFromCss(cssText) {
        const urls = [];
        const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
        let match;
        while ((match = pattern.exec(cssText)) !== null) {
            const url = match[2].trim();
            if (!url || url.toLowerCase() === "none") {
                continue;
            }
            urls.push(url);
        }
        return urls;
    }

    function sanitizeHtml(html) {
        if (window.DOMPurify) {
            const sanitized = window.DOMPurify.sanitize(html, {
                WHOLE_DOCUMENT: true,
                USE_PROFILES: { html: true, svg: true },
                ADD_TAGS: ["base", "source", "track"],
                ADD_ATTR: [
                    "srcset",
                    "sizes",
                    "poster",
                    "loading",
                    "decoding",
                    "fetchpriority",
                    "playsinline",
                    "preload",
                    "crossorigin",
                    "referrerpolicy",
                    "data",
                    "type",
                    "width",
                    "height",
                    "style",
                    "xlink:href"
                ]
            });
            const parser = new DOMParser();
            const doc = parser.parseFromString(sanitized, "text/html");
            scrubDocument(doc);
            return { doc };
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        scrubDocument(doc);
        return { doc };
    }

    function scrubDocument(doc) {
        doc.querySelectorAll("script, noscript").forEach((el) => el.remove());
        doc.querySelectorAll("meta[http-equiv=\"refresh\"]").forEach((el) => el.remove());
        doc.querySelectorAll("*").forEach((el) => {
            Array.from(el.attributes).forEach((attr) => {
                if (attr.name.startsWith("on")) {
                    el.removeAttribute(attr.name);
                }
                if (attr.name === "srcdoc") {
                    el.removeAttribute(attr.name);
                }
                if (["src", "href", "xlink:href", "poster", "data"].includes(attr.name)) {
                    if (isUnsafeUrl(attr.value)) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
        });
    }

    function resolveBaseUrl(doc, inputUrl) {
        let base = "";
        if (isAbsoluteUrl(inputUrl)) {
            base = inputUrl;
        }
        const baseTag = doc.querySelector("base[href]");
        if (baseTag) {
            const href = baseTag.getAttribute("href");
            if (href) {
                if (base) {
                    try {
                        base = new URL(href, base).toString();
                    } catch (error) {
                        base = base;
                    }
                } else if (isAbsoluteUrl(href)) {
                    base = href;
                }
            }
        }
        return base;
    }

    function applyBaseToDoc(doc, baseUrl) {
        if (!baseUrl) {
            return;
        }
        let base = doc.querySelector("base");
        if (!base) {
            base = doc.createElement("base");
            base.setAttribute("data-tool", "true");
            doc.head.insertBefore(base, doc.head.firstChild);
        }
        base.setAttribute("href", baseUrl);
    }

    function injectPreviewStyle(doc) {
        if (!doc.head) {
            return;
        }
        const style = doc.createElement("style");
        style.setAttribute("data-tool", "true");
        style.textContent = `
            .asset-highlight {
                position: relative;
                z-index: 0;
                outline: 1px solid rgba(56, 189, 248, 0.35);
                box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
            }

            .asset-highlight::after {
                content: "";
                position: absolute;
                inset: -4px;
                border-radius: 10px;
                padding: 2px;
                background: linear-gradient(120deg, #38bdf8, #f472b6, #22d3ee, #38bdf8);
                background-size: 300% 300%;
                animation: asset-glow 2.4s ease infinite;
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                pointer-events: none;
            }

            @keyframes asset-glow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
        `;
        doc.head.appendChild(style);
    }
    function resolveUrl(rawUrl, baseUrl) {
        if (!rawUrl) {
            return "";
        }
        const trimmed = rawUrl.trim();
        if (!trimmed) {
            return "";
        }
        if (isUnsafeUrl(trimmed)) {
            return "";
        }
        if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
            return trimmed;
        }
        if (trimmed.startsWith("#")) {
            return "";
        }
        if (trimmed.startsWith("//")) {
            if (baseUrl) {
                try {
                    const base = new URL(baseUrl);
                    return `${base.protocol}${trimmed}`;
                } catch (error) {
                    return "";
                }
            }
        }
        try {
            if (baseUrl) {
                return new URL(trimmed, baseUrl).toString();
            }
            return new URL(trimmed).toString();
        } catch (error) {
            return "";
        }
    }

    function normalizeUrl(url, ignoreQuery) {
        if (!url) {
            return "";
        }
        if (url.startsWith("data:") || url.startsWith("blob:")) {
            return url;
        }
        try {
            const parsed = new URL(url);
            parsed.hash = "";
            if (ignoreQuery) {
                parsed.search = "";
            }
            if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
                parsed.pathname = parsed.pathname.replace(/\/+$/, "");
            }
            return parsed.toString();
        } catch (error) {
            return url;
        }
    }

    function isAssetLikeLink(url) {
        return ASSET_EXTENSIONS.has(getExtension(url));
    }

    function isImageUrl(url) {
        return IMAGE_EXTENSIONS.has(getExtension(url));
    }

    function getExtension(url) {
        if (!url) {
            return "";
        }
        const clean = url.split(/[?#]/)[0];
        const match = clean.match(/\.([a-z0-9]+)$/i);
        if (match) {
            return match[1].toLowerCase();
        }
        return "";
    }

    function extractHost(url) {
        if (!url) {
            return "";
        }
        try {
            return new URL(url).host;
        } catch (error) {
            return "";
        }
    }

    function guessFileType(extension, contentType) {
        if (contentType) {
            return contentType.split(";")[0];
        }
        if (extension && EXTENSION_TO_TYPE[extension]) {
            return EXTENSION_TO_TYPE[extension];
        }
        return "";
    }

    function isUnsafeUrl(url) {
        return /^(javascript|vbscript):/i.test(url);
    }

    function isAbsoluteUrl(url) {
        return /^[a-z][a-z0-9+.-]*:/i.test(url);
    }

    function isTextIgnoredTag(tag) {
        return ["script", "style", "noscript", "head", "title"].includes(tag);
    }

    async function fetchHtml(url) {
        const response = await fetch(url, {
            mode: "cors",
            redirect: "follow",
            referrerPolicy: "no-referrer"
        });
        if (!response.ok) {
            throw new Error("Fetch failed");
        }
        return response.text();
    }

    function setStatus(message) {
        ui.statusText.textContent = message;
    }

    function setPreviewStatus(message) {
        ui.previewStatus.textContent = message;
    }

    function showError(message) {
        ui.errorBanner.textContent = message;
        ui.errorBanner.classList.remove("hidden");
    }

    function clearError() {
        ui.errorBanner.textContent = "";
        ui.errorBanner.classList.add("hidden");
    }

    function parseNumber(value) {
        const number = parseFloat(value);
        return Number.isFinite(number) ? number : 0;
    }

    function formatDuration(seconds) {
        if (!Number.isFinite(seconds)) {
            return "-";
        }
        const total = Math.floor(seconds);
        const minutes = Math.floor(total / 60);
        const remainder = total % 60;
        return `${minutes}:${remainder.toString().padStart(2, "0")}`;
    }

    function addGridRow(grid, label, value) {
        const labelEl = document.createElement("div");
        labelEl.className = "detail-label";
        labelEl.textContent = label;

        const valueEl = document.createElement("div");
        valueEl.className = "detail-value";
        valueEl.textContent = value || "-";

        grid.append(labelEl, valueEl);
    }

    function uniqueListText(set) {
        if (!set || !set.size) {
            return "-";
        }
        const items = Array.from(set).slice(0, 3).join(" / ");
        if (set.size > 3) {
            return `${items} ほか${set.size - 3}件`;
        }
        return items;
    }

    function debounce(callback, delay) {
        let timer = null;
        return (...args) => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => callback(...args), delay);
        };
    }

    function yieldToMain() {
        return new Promise((resolve) => {
            if ("requestIdleCallback" in window) {
                requestIdleCallback(() => resolve(), { timeout: 200 });
            } else {
                setTimeout(resolve, 0);
            }
        });
    }
    async function queueMetadataFetch() {
        const requests = new Map();
        state.groups.forEach((group) => {
            const url = group.primaryResolvedUrl;
            if (!url || state.metaCache.has(url) || state.pendingMeta.has(url)) {
                return;
            }
            if (!url.startsWith("http")) {
                return;
            }
            if (!requests.has(url)) {
                requests.set(url, {
                    url,
                    wantsImage: false,
                    wantsAudio: false,
                    wantsVideo: false
                });
            }
            const request = requests.get(url);
            if (group.categories.has("image") || group.categories.has("svg")) {
                request.wantsImage = true;
            }
            if (group.categories.has("audio")) {
                request.wantsAudio = true;
            }
            if (group.categories.has("video")) {
                request.wantsVideo = true;
            }
        });

        const tasks = Array.from(requests.values());
        if (!tasks.length) {
            return;
        }

        tasks.forEach((task) => state.pendingMeta.add(task.url));

        await runLimited(tasks, 4, async (task) => {
            const meta = await fetchMetadata(task);
            state.pendingMeta.delete(task.url);
            if (meta) {
                state.metaCache.set(task.url, meta);
                state.groups.forEach((group) => {
                    if (group.primaryResolvedUrl === task.url) {
                        group.meta = meta;
                        group.fileType = guessFileType(group.extension, meta.contentType);
                    }
                });
                requestRender();
            }
        });
    }

    async function fetchMetadata(task) {
        const meta = {
            contentType: "",
            contentLength: "",
            width: 0,
            height: 0,
            duration: 0
        };

        try {
            const response = await fetch(task.url, {
                method: "HEAD",
                mode: "cors",
                referrerPolicy: "no-referrer"
            });
            if (response.ok) {
                meta.contentType = response.headers.get("content-type") || "";
                meta.contentLength = response.headers.get("content-length") || "";
            }
        } catch (error) {
            // ignore
        }

        if (task.wantsImage) {
            const imageMeta = await loadImageMetadata(task.url);
            if (imageMeta) {
                meta.width = imageMeta.width;
                meta.height = imageMeta.height;
            }
        }

        if (task.wantsVideo || task.wantsAudio) {
            const mediaMeta = await loadMediaMetadata(task.url, task.wantsVideo);
            if (mediaMeta) {
                if (mediaMeta.width) {
                    meta.width = mediaMeta.width;
                }
                if (mediaMeta.height) {
                    meta.height = mediaMeta.height;
                }
                if (mediaMeta.duration) {
                    meta.duration = mediaMeta.duration;
                }
            }
        }

        return meta;
    }

    function loadImageMetadata(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    function loadMediaMetadata(url, isVideo) {
        return new Promise((resolve) => {
            const media = document.createElement(isVideo ? "video" : "audio");
            media.preload = "metadata";
            media.crossOrigin = "anonymous";
            media.referrerPolicy = "no-referrer";
            media.onloadedmetadata = () => {
                resolve({
                    duration: Number.isFinite(media.duration) ? media.duration : 0,
                    width: isVideo ? media.videoWidth : 0,
                    height: isVideo ? media.videoHeight : 0
                });
            };
            media.onerror = () => resolve(null);
            media.src = url;
        });
    }

    async function runLimited(items, limit, worker) {
        let index = 0;
        const runners = Array.from({ length: limit }, async () => {
            while (index < items.length) {
                const current = items[index];
                index += 1;
                await worker(current);
            }
        });
        await Promise.all(runners);
    }

    function requestRender() {
        if (renderQueued) {
            return;
        }
        renderQueued = true;
        requestAnimationFrame(() => {
            renderQueued = false;
            renderTable();
            const selected = state.groups.find((group) => group.id === state.selectedGroupId);
            if (selected) {
                renderDetails(selected);
            }
        });
    }

    function exportJson() {
        if (!state.filteredRows.length) {
            return;
        }
        const payload = {
            generatedAt: new Date().toISOString(),
            baseUrl: state.baseUrl,
            category: state.activeCategory,
            items: state.filteredRows.map((row) => serializeGroup(row.group))
        };
        const json = JSON.stringify(payload, null, 2);
        downloadFile(json, "media-assets.json", "application/json");
    }

    function exportCsv() {
        if (!state.filteredRows.length) {
            return;
        }
        const headers = [
            "category",
            "url",
            "normalized_url",
            "count",
            "host",
            "extension",
            "file_type",
            "content_type",
            "content_length",
            "width",
            "height",
            "duration",
            "dom_paths"
        ];
        const rows = [headers.join(",")];

        state.filteredRows.forEach((row) => {
            const group = row.group;
            const occurrences = group.occurrences.filter((occ) => occ.category === state.activeCategory);
            const domPaths = occurrences.map((occ) => occ.domPath).filter(Boolean).join(" | ");
            const width = group.meta.width || group.meta.naturalWidth || group.meta.videoWidth || "";
            const height = group.meta.height || group.meta.naturalHeight || group.meta.videoHeight || "";
            const line = [
                state.activeCategory,
                group.primaryResolvedUrl || group.primaryRawUrl || "",
                group.normalizedUrl || "",
                group.countByCategory[state.activeCategory] || 0,
                group.host || "",
                group.extension || "",
                group.fileType || "",
                group.meta.contentType || "",
                group.meta.contentLength || "",
                width,
                height,
                group.meta.duration ? formatDuration(group.meta.duration) : "",
                domPaths
            ].map(csvEscape);
            rows.push(line.join(","));
        });

        downloadFile(rows.join("\n"), "media-assets.csv", "text/csv");
    }

    function serializeGroup(group) {
        const occurrences = group.occurrences.filter((occ) => occ.category === state.activeCategory);
        return {
            category: state.activeCategory,
            url: group.primaryResolvedUrl || group.primaryRawUrl || "",
            normalizedUrl: group.normalizedUrl || "",
            count: group.countByCategory[state.activeCategory] || 0,
            host: group.host || "",
            extension: group.extension || "",
            fileType: group.fileType || "",
            contentType: group.meta.contentType || "",
            contentLength: group.meta.contentLength || "",
            width: group.meta.width || group.meta.naturalWidth || group.meta.videoWidth || null,
            height: group.meta.height || group.meta.naturalHeight || group.meta.videoHeight || null,
            duration: group.meta.duration || null,
            occurrences: occurrences.map((occ) => ({
                element: occ.elementTag,
                attribute: occ.attrName,
                rawUrl: occ.rawUrl,
                resolvedUrl: occ.resolvedUrl,
                domPath: occ.domPath,
                textSnippet: occ.textSnippet || "",
                textLength: occ.textLength || null
            }))
        };
    }

    function csvEscape(value) {
        const stringValue = String(value ?? "");
        if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\"")) {
            return `"${stringValue.replace(/"/g, "\"\"")}"`;
        }
        return stringValue;
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }
    async function startAdvancedScan() {
        if (state.advanced.running) {
            return;
        }
        if (!state.previewReady) {
            ui.advancedToggle.checked = false;
            setPreviewStatus("プレビューが準備できていません。");
            return;
        }

        const doc = ui.previewFrame.contentDocument;
        if (!doc) {
            ui.advancedToggle.checked = false;
            setPreviewStatus("プレビューが読み込めませんでした。");
            return;
        }

        state.advanced.running = true;
        state.advanced.cancel = false;
        ui.cancelAdvanced.disabled = false;
        const elements = Array.from(doc.body.querySelectorAll("*"));
        state.advanced.total = elements.length;
        state.advanced.processed = 0;

        const newOccurrences = [];
        const seen = new Set();

        for (let i = 0; i < elements.length; i += 1) {
            if (state.advanced.cancel) {
                break;
            }
            const element = elements[i];
            if (element.hasAttribute("data-tool")) {
                continue;
            }
            const style = doc.defaultView.getComputedStyle(element);
            const cssText = `${style.getPropertyValue("background-image")} ${style.getPropertyValue("mask-image")}`;
            const urls = extractUrlsFromCss(cssText);
            urls.forEach((url) => {
                const key = `${element.getAttribute("data-asset-el") || ""}|${url}`;
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
                newOccurrences.push({
                    element,
                    url
                });
            });

            state.advanced.processed += 1;
            if (i % 200 === 0) {
                setPreviewStatus(`高度モード解析中... ${state.advanced.processed}/${state.advanced.total}`);
                await yieldToMain();
            }
        }

        if (!state.advanced.cancel && newOccurrences.length) {
            const cache = new WeakMap();
            newOccurrences.forEach((item) => {
                const urlCategory = classifyImageCategory(item.url);
                const info = getElementInfo(item.element, cache);
                const resolvedUrl = resolveUrl(item.url, state.baseUrl);
                state.occurrences.push({
                    id: `occ-advanced-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    category: urlCategory,
                    elementTag: info.tagName,
                    elementId: info.elementId,
                    domPath: info.domPath,
                    attributes: info.attributes,
                    hasDataAttributes: info.hasDataAttributes,
                    attrName: "computed-style",
                    rawUrl: item.url,
                    resolvedUrl,
                    sourceHint: "computed"
                });
            });
            rebuildGroups();
            updateCategoryList();
            updateSummary();
            updateFilterOptions();
            renderTable();
            if (state.filters.fetchMeta) {
                queueMetadataFetch();
            }
        }

        state.advanced.running = false;
        ui.cancelAdvanced.disabled = true;
        if (state.advanced.cancel) {
            setPreviewStatus("高度モードを中断しました。");
        } else {
            setPreviewStatus("高度モード解析が完了しました。");
        }
    }

    function cancelAdvancedScan() {
        if (!state.advanced.running) {
            return;
        }
        state.advanced.cancel = true;
    }
})();
