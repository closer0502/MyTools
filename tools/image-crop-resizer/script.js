(() => {
    const $ = (id) => document.getElementById(id);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    // Shared helpers
    const readImageFile = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const bindDropZone = (zone, input, onFile) => {
        const process = (fileList) => {
            if (!fileList || !fileList.length) return;
            const file = fileList[0];
            if (!file.type.startsWith("image/")) {
                onFile(null, new Error("画像ファイルを選択してください"));
                return;
            }
            onFile(file);
        };

        zone.addEventListener("click", () => input.click());
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            zone.classList.add("is-dragover");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
        zone.addEventListener("drop", (e) => {
            e.preventDefault();
            zone.classList.remove("is-dragover");
            process(e.dataTransfer.files);
        });
        input.addEventListener("change", (e) => process(e.target.files));
    };

    const formatDims = (w, h) => `${Math.round(w)} x ${Math.round(h)} px`;
    const formatType = (type) => type?.replace("image/", "").toUpperCase() || "-";

    // --- Cropping ---
    const cropCanvas = $("cropCanvas");
    const cropCtx = cropCanvas.getContext("2d");
    const cropState = {
        image: null,
        fileType: "image/png",
        fileName: "",
        scale: 1,
        selection: { x: 0, y: 0, w: 0, h: 0 },
    };
    const cropEls = {
        fileName: $("cropFileName"),
        fileDims: $("cropFileDims"),
        inputInfo: $("cropInputInfo"),
        outputInfo: $("cropOutputInfo"),
        formatBadge: $("cropFormatBadge"),
        statusText: $("cropStatusText"),
        statusDot: $("cropStatus").querySelector(".status-dot"),
        outputImage: $("cropOutputImage"),
        selectionInfo: $("cropSelectionInfo"),
        btnDownload: $("cropDownloadBtn"),
        inputX: $("inputX"),
        inputY: $("inputY"),
        inputW: $("inputW"),
        inputH: $("inputH"),
    };

    let dragState = { active: false, mode: null, start: null, rect: null };

    const getAspectValue = () => {
        const val = document.querySelector("input[name='aspect']:checked").value;
        if (val === "free") return null;
        const [a, b] = val.split(":").map(Number);
        const ratio = a && b ? a / b : null;
        if (!ratio) return null;
        const flipped = $("aspectSwap")?.checked;
        return flipped ? 1 / ratio : ratio;
    };

    const setCropStatus = (text, tone = "muted") => {
        cropEls.statusText.textContent = text;
        const color =
            tone === "ok" ? "var(--accent-strong)" : tone === "warn" ? "#f59e0b" : "var(--muted)";
        cropEls.statusDot.style.background = color;
    };

    const fitCropCanvas = (img) => {
        const maxW = 900;
        const maxH = 620;
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        cropState.scale = ratio;
        cropCanvas.width = Math.round(img.naturalWidth * ratio);
        cropCanvas.height = Math.round(img.naturalHeight * ratio);
        cropCanvas.style.width = `${cropCanvas.width}px`;
        cropCanvas.style.height = `${cropCanvas.height}px`;
    };

    const normalizeRect = (rect) => {
        const r = { ...rect };
        if (r.w < 0) {
            r.x += r.w;
            r.w *= -1;
        }
        if (r.h < 0) {
            r.y += r.h;
            r.h *= -1;
        }
        return r;
    };

    const clampRect = (rect) => {
        if (!cropState.image) return rect;
        const { naturalWidth: iw, naturalHeight: ih } = cropState.image;
        const r = { ...rect };
        r.w = Math.max(1, Math.min(r.w, iw));
        r.h = Math.max(1, Math.min(r.h, ih));
        r.x = clamp(r.x, 0, iw - r.w);
        r.y = clamp(r.y, 0, ih - r.h);
        return r;
    };

    const enforceAspect = (rect, mode = "se", prefer = "auto") => {
        const ratio = getAspectValue();
        if (!ratio) return normalizeRect(rect);
        const r = normalizeRect(rect);
        let w = r.w;
        let h = r.h;
        if (prefer === "width") {
            h = w / ratio;
        } else if (prefer === "height") {
            w = h * ratio;
        } else {
            if (w / h > ratio) {
                w = h * ratio;
            } else {
                h = w / ratio;
            }
        }

        switch (mode) {
            case "nw":
                r.x = r.x + (r.w - w);
                r.y = r.y + (r.h - h);
                break;
            case "ne":
                r.y = r.y + (r.h - h);
                break;
            case "sw":
                r.x = r.x + (r.w - w);
                break;
            case "n":
                r.y = r.y + (r.h - h);
                r.x = r.x + (r.w - w) / 2;
                break;
            case "s":
                r.x = r.x + (r.w - w) / 2;
                break;
            case "e":
                r.y = r.y + (r.h - h) / 2;
                break;
            case "w":
                r.x = r.x + (r.w - w);
                r.y = r.y + (r.h - h) / 2;
                break;
            default:
                break;
        }

        r.w = w;
        r.h = h;
        return r;
    };

    const setSelection = (rect, mode = "se", prefer = "auto") => {
        const rectAspect = enforceAspect(rect, mode, prefer);
        cropState.selection = clampRect(rectAspect);
        syncSelectionInputs();
        drawCropCanvas();
        updateCropOutput();
    };

    const defaultSelection = () => {
        if (!cropState.image) return;
        const img = cropState.image;
        const ratio = getAspectValue();
        const baseW = img.naturalWidth * 0.7;
        const baseH = ratio ? baseW / ratio : img.naturalHeight * 0.7;
        const w = Math.min(baseW, img.naturalWidth);
        const h = Math.min(baseH, img.naturalHeight);
        const x = (img.naturalWidth - w) / 2;
        const y = (img.naturalHeight - h) / 2;
        setSelection({ x, y, w, h });
    };

    const drawHandles = (sel) => {
        const s = cropState.scale;
        const handleSize = 8;
        const points = [
            { x: sel.x, y: sel.y },
            { x: sel.x + sel.w / 2, y: sel.y },
            { x: sel.x + sel.w, y: sel.y },
            { x: sel.x + sel.w, y: sel.y + sel.h / 2 },
            { x: sel.x + sel.w, y: sel.y + sel.h },
            { x: sel.x + sel.w / 2, y: sel.y + sel.h },
            { x: sel.x, y: sel.y + sel.h },
            { x: sel.x, y: sel.y + sel.h / 2 },
        ];
        cropCtx.fillStyle = "rgba(34, 211, 238, 0.9)";
        points.forEach((p) => {
            const px = p.x * s;
            const py = p.y * s;
            cropCtx.fillRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
        });
    };

    const drawCropCanvas = () => {
        if (!cropState.image) {
            cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
            return;
        }
        const s = cropState.scale;
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        cropCtx.drawImage(
            cropState.image,
            0,
            0,
            cropState.image.naturalWidth,
            cropState.image.naturalHeight,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
        );

        const { x, y, w, h } = cropState.selection;
        cropCtx.strokeStyle = "#22d3ee";
        cropCtx.lineWidth = 2;
        cropCtx.strokeRect(x * s, y * s, w * s, h * s);
        drawHandles({ x, y, w, h });

        cropEls.selectionInfo.textContent = `${Math.round(w)} x ${Math.round(h)} px`;
    };

    const syncSelectionInputs = () => {
        const { x, y, w, h } = cropState.selection;
        cropEls.inputX.value = Math.round(x);
        cropEls.inputY.value = Math.round(y);
        cropEls.inputW.value = Math.round(w);
        cropEls.inputH.value = Math.round(h);
    };

    const updateCropOutput = () => {
        if (!cropState.image || !cropState.selection.w || !cropState.selection.h) {
            cropEls.outputImage.src = "";
            cropEls.outputInfo.textContent = "-";
            cropEls.btnDownload.disabled = true;
            return;
        }
        const { x, y, w, h } = cropState.selection;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = Math.round(w);
        outCanvas.height = Math.round(h);
        const ctx = outCanvas.getContext("2d");
        ctx.drawImage(
            cropState.image,
            x,
            y,
            w,
            h,
            0,
            0,
            outCanvas.width,
            outCanvas.height
        );
        const dataUrl = outCanvas.toDataURL(cropState.fileType || "image/png");
        cropEls.outputImage.src = dataUrl;
        cropEls.outputInfo.textContent = `${formatDims(w, h)}`;
        cropEls.btnDownload.disabled = false;
    };

    const handleCropFile = async (file, error) => {
        if (error) {
            setCropStatus(error.message, "warn");
            return;
        }
        if (!file) return;
        try {
            const img = await readImageFile(file);
            cropState.image = img;
            cropState.fileType = file.type || "image/png";
            cropState.fileName = file.name || "image";
            fitCropCanvas(img);
            defaultSelection();
            drawCropCanvas();
            updateCropOutput();
            cropEls.fileName.textContent = file.name || "-";
            cropEls.fileDims.textContent = formatDims(img.naturalWidth, img.naturalHeight);
            cropEls.inputInfo.textContent = formatDims(img.naturalWidth, img.naturalHeight);
            cropEls.formatBadge.textContent = formatType(cropState.fileType);
            setCropStatus("クロップ範囲を調整できます", "ok");
        } catch (err) {
            setCropStatus("読み込みに失敗しました", "warn");
            console.error(err);
        }
    };

    const downloadCrop = () => {
        if (!cropState.image) return;
        const { x, y, w, h } = cropState.selection;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = Math.round(w);
        outCanvas.height = Math.round(h);
        const ctx = outCanvas.getContext("2d");
        ctx.drawImage(
            cropState.image,
            x,
            y,
            w,
            h,
            0,
            0,
            outCanvas.width,
            outCanvas.height
        );
        outCanvas.toBlob(
            (blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const base = cropState.fileName.replace(/\.[^.]+$/, "");
                const ext = cropState.fileType.replace("image/", "");
                a.download = `${base}-crop.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
            },
            cropState.fileType || "image/png",
            0.95
        );
    };

    let aspectPrefer = "auto";

    const selectionFromInputs = () => {
        const x = Number(cropEls.inputX.value) || 0;
        const y = Number(cropEls.inputY.value) || 0;
        const w = Number(cropEls.inputW.value) || 1;
        const h = Number(cropEls.inputH.value) || 1;
        setSelection({ x, y, w, h }, "se", aspectPrefer);
    };

    const getPointer = (evt) => {
        const rect = cropCanvas.getBoundingClientRect();
        const px = evt.clientX - rect.left;
        const py = evt.clientY - rect.top;
        return {
            px,
            py,
            ix: px / cropState.scale,
            iy: py / cropState.scale,
        };
    };

    const hitHandle = ({ px, py }) => {
        const { x, y, w, h } = cropState.selection;
        const s = cropState.scale;
        const size = 12;
        const handles = [
            { name: "nw", hx: x * s, hy: y * s },
            { name: "n", hx: (x + w / 2) * s, hy: y * s },
            { name: "ne", hx: (x + w) * s, hy: y * s },
            { name: "e", hx: (x + w) * s, hy: (y + h / 2) * s },
            { name: "se", hx: (x + w) * s, hy: (y + h) * s },
            { name: "s", hx: (x + w / 2) * s, hy: (y + h) * s },
            { name: "sw", hx: x * s, hy: (y + h) * s },
            { name: "w", hx: x * s, hy: (y + h / 2) * s },
        ];
        return handles.find((h) => Math.abs(px - h.hx) <= size && Math.abs(py - h.hy) <= size)?.name;
    };

    const isInsideSelection = ({ ix, iy }) => {
        const { x, y, w, h } = cropState.selection;
        return ix >= x && ix <= x + w && iy >= y && iy <= y + h;
    };

    const setCursorByZone = (evt) => {
        if (!cropState.image) {
            cropCanvas.style.cursor = "crosshair";
            return;
        }
        const pointer = getPointer(evt);
        const handle = hitHandle(pointer);
        if (handle) {
            if (handle === "nw" || handle === "se") cropCanvas.style.cursor = "nwse-resize";
            else if (handle === "ne" || handle === "sw") cropCanvas.style.cursor = "nesw-resize";
            else if (handle === "n" || handle === "s") cropCanvas.style.cursor = "ns-resize";
            else cropCanvas.style.cursor = "ew-resize";
            return;
        }
        if (isInsideSelection(pointer)) {
            cropCanvas.style.cursor = "move";
        } else {
            cropCanvas.style.cursor = "crosshair";
        }
    };

    const startDrag = (evt) => {
        if (!cropState.image) return;
        const pointer = getPointer(evt);
        const handle = hitHandle(pointer);
        dragState = {
            active: true,
            mode: handle || (isInsideSelection(pointer) ? "move" : "new"),
            start: pointer,
            rect: { ...cropState.selection },
        };
        cropCanvas.classList.toggle("is-grabbing", dragState.mode === "move");
        if (dragState.mode === "new") {
            cropState.selection = { x: pointer.ix, y: pointer.iy, w: 1, h: 1 };
        }
    };

    const dragMove = (evt) => {
        if (!dragState.active || !cropState.image) return;
        const pointer = getPointer(evt);
        const dx = pointer.ix - dragState.start.ix;
        const dy = pointer.iy - dragState.start.iy;
        const r = { ...dragState.rect };

        switch (dragState.mode) {
            case "move":
                setSelection({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, "move", "auto");
                return;
            case "nw":
                setSelection({ x: r.x + dx, y: r.y + dy, w: r.w - dx, h: r.h - dy }, "nw", "auto");
                return;
            case "n":
                setSelection({ x: r.x, y: r.y + dy, w: r.w, h: r.h - dy }, "n", "height");
                return;
            case "ne":
                setSelection({ x: r.x, y: r.y + dy, w: r.w + dx, h: r.h - dy }, "ne", "auto");
                return;
            case "e":
                setSelection({ x: r.x, y: r.y, w: r.w + dx, h: r.h }, "e", "width");
                return;
            case "se":
                setSelection({ x: r.x, y: r.y, w: r.w + dx, h: r.h + dy }, "se", "auto");
                return;
            case "s":
                setSelection({ x: r.x, y: r.y, w: r.w, h: r.h + dy }, "s", "height");
                return;
            case "sw":
                setSelection({ x: r.x + dx, y: r.y, w: r.w - dx, h: r.h + dy }, "sw", "auto");
                return;
            case "w":
                setSelection({ x: r.x + dx, y: r.y, w: r.w - dx, h: r.h }, "w", "width");
                return;
            case "new": {
                const rect = {
                    x: dragState.start.ix,
                    y: dragState.start.iy,
                    w: dx,
                    h: dy,
                };
                setSelection(rect, "se", "auto");
                return;
            }
            default:
                return;
        }
    };

    const endDrag = () => {
        dragState.active = false;
        cropCanvas.classList.remove("is-grabbing");
    };

    // --- Resize ---
    const resizeState = {
        items: [],
        lastEdited: "width",
        source: "file",
    };

    const resizeEls = {
        fileName: $("resizeFileName"),
        fileDims: $("resizeFileDims"),
        outputInfo: $("resizeOutputInfo"),
        formatBadge: $("resizeFormatBadge"),
        outputImage: $("resizeOutputImage"),
        statusText: $("resizeStatusText"),
        statusDot: $("resizeStatus").querySelector(".status-dot"),
        width: $("resizeWidth"),
        height: $("resizeHeight"),
        percent: $("resizePercent"),
        lock: $("resizeLock"),
        btnDownload: $("resizeDownloadBtn"),
        percentHint: $("resizePercentHint") || $("percentHint"),
        dropPrimary: $("resizeDropPrimary"),
        dropSecondary: $("resizeDropSecondary"),
        fileInput: $("resizeFileInput"),
        folderInput: $("resizeFolderInput"),
        fileButton: $("resizeFileButton"),
        dropZone: $("resizeDropZone"),
        sourceRadios: document.querySelectorAll("input[name='resizeSource']"),
        thumbs: $("resizeThumbs"),
        thumbGrid: $("resizeThumbGrid"),
        thumbCount: $("resizeThumbCount"),
        modeControls: {
            px: $("pxControls"),
            percent: $("percentControls"),
        },
    };

    const setResizeStatus = (text, tone = "muted") => {
        resizeEls.statusText.textContent = text;
        const color =
            tone === "ok" ? "var(--accent-strong)" : tone === "warn" ? "#f59e0b" : "var(--muted)";
        resizeEls.statusDot.style.background = color;
    };

    const getPrimaryItem = () => resizeState.items[0] || null;

    const getFormatLabel = () => {
        if (resizeState.items.length <= 1) {
            const primary = getPrimaryItem();
            return primary ? formatType(primary.type) : "-";
        }
        const firstType = resizeState.items[0].type;
        const same = resizeState.items.every((item) => item.type === firstType);
        return same ? formatType(firstType) : "MIXED";
    };

    const updateResizeSourceUI = () => {
        const isFolder = resizeState.source === "folder";
        resizeEls.dropPrimary.textContent = isFolder ? "ここにフォルダをドロップ" : "ここに画像をドロップ";
        resizeEls.dropSecondary.textContent = isFolder
            ? "またはフォルダを選択（PNG / JPG / WEBP を一括読み込み）"
            : "またはファイルを選択（PNG / JPG / WEBP）";
        resizeEls.fileButton.textContent = isFolder ? "フォルダを選択" : "ファイルを選択";
    };

    const renderResizeThumbs = (items) => {
        if (!items || !items.length) {
            resizeEls.thumbs.classList.add("hidden");
            resizeEls.thumbGrid.innerHTML = "";
            resizeEls.thumbCount.textContent = "0 件";
            return;
        }
        resizeEls.thumbs.classList.remove("hidden");
        resizeEls.thumbGrid.innerHTML = items
            .map(
                (item) => `
                <div class="thumb-card">
                    <div class="thumb-frame">
                        <img src="${item.src}" alt="${item.name}">
                    </div>
                    <div class="thumb-meta">
                        <div class="name">${item.name}</div>
                        <div class="info">${formatDims(item.width, item.height)}</div>
                    </div>
                </div>
            `
            )
            .join("");
        resizeEls.thumbCount.textContent = `${items.length} 件`;
    };

    const loadImages = async (files) => {
        const results = [];
        for (const file of files) {
            if (!file.type.startsWith("image/")) continue;
            try {
                const img = await readImageFile(file);
                results.push({
                    file,
                    image: img,
                    name: file.name || "image",
                    type: file.type || "image/png",
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    src: img.src,
                });
            } catch (err) {
                console.error("Failed to read image", file ? file.name : null, err);
            }
        }
        return results;
    };

    const getResizeMode = () => document.querySelector("input[name='resizeMode']:checked").value;

    const updateResizeModeUI = () => {
        const mode = getResizeMode();
        Object.entries(resizeEls.modeControls).forEach(([key, el]) => {
            el.classList.toggle("hidden", mode !== key);
        });
    };

    const getPercentValue = () => {
        const percent = clamp(Number(resizeEls.percent.value) || 100, 1, 400);
        resizeEls.percent.value = percent;
        return percent;
    };

    const setResizeDefaults = () => {
        const primary = getPrimaryItem();
        if (!primary) return;
        resizeEls.width.value = primary.width;
        resizeEls.height.value = primary.height;
        resizeEls.percent.value = 100;
        if (resizeEls.percentHint) {
            resizeEls.percentHint.textContent = `100% -> ${formatDims(primary.width, primary.height)}`;
        }
    };

    const computeResizeTarget = (item = getPrimaryItem(), opts = {}) => {
        const { suppressHint = false } = opts;
        if (!item) return null;
        const mode = getResizeMode();
        const iw = item.width;
        const ih = item.height;
        const ratio = iw / ih;
        let width = iw;
        let height = ih;

        if (mode === "px") {
            width = Math.max(1, Number(resizeEls.width.value) || iw);
            height = Math.max(1, Number(resizeEls.height.value) || ih);
            if (resizeEls.lock.checked) {
                if (resizeState.lastEdited === "width") {
                    height = Math.round(width / ratio);
                } else {
                    width = Math.round(height * ratio);
                }
            }
            resizeEls.width.value = width;
            resizeEls.height.value = height;
        } else if (mode === "percent") {
            const percent = getPercentValue();
            width = Math.round((iw * percent) / 100);
            height = Math.round((ih * percent) / 100);
            if (!suppressHint && resizeEls.percentHint) {
                resizeEls.percentHint.textContent = `${percent}% -> ${formatDims(width, height)}`;
            }
        }

        return { width, height };
    };

    const updateResizePreview = () => {
        const primary = getPrimaryItem();
        if (!primary) {
            resizeEls.outputImage.src = "";
            resizeEls.outputInfo.textContent = "-";
            resizeEls.btnDownload.disabled = true;
            resizeEls.formatBadge.textContent = "-";
            return;
        }
        const target = computeResizeTarget(primary);
        if (!target) return;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = target.width;
        outCanvas.height = target.height;
        const ctx = outCanvas.getContext("2d");
        ctx.drawImage(primary.image, 0, 0, target.width, target.height);
        const dataUrl = outCanvas.toDataURL(primary.type || "image/png");
        resizeEls.outputImage.src = dataUrl;
        resizeEls.outputInfo.textContent = formatDims(target.width, target.height);
        resizeEls.btnDownload.disabled = false;
        resizeEls.formatBadge.textContent = getFormatLabel();
    };

    const downloadResize = async () => {
        const primary = getPrimaryItem();
        if (!primary) return;
        const mode = getResizeMode();
        const items = resizeState.items;
        const percent = mode === "percent" ? getPercentValue() : null;
        const pixelTarget = mode === "px" ? computeResizeTarget(primary, { suppressHint: true }) : null;

        const renderItem = (item, target) =>
            new Promise((resolve) => {
                const canvas = document.createElement("canvas");
                canvas.width = target.width;
                canvas.height = target.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(item.image, 0, 0, target.width, target.height);
                canvas.toBlob(
                    (blob) => resolve({ blob, item, target }),
                    item.type || "image/png",
                    0.95
                );
            });

        if (items.length <= 1) {
            const target =
                mode === "px"
                    ? pixelTarget
                    : {
                          width: Math.round((primary.width * percent) / 100),
                          height: Math.round((primary.height * percent) / 100),
                      };
            const { blob } = await renderItem(primary, target);
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const base = primary.name.replace(/\.[^.]+$/, "");
            const ext = (primary.type || "image/png").replace("image/", "");
            a.href = url;
            a.download = `${base}-resized.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        if (typeof JSZip === "undefined") {
            setResizeStatus("複数ファイルの保存に必要な JSZip がロードできませんでした", "warn");
            return;
        }

        const zip = new JSZip();
        for (const item of items) {
            const target =
                mode === "px"
                    ? pixelTarget
                    : {
                          width: Math.round((item.width * percent) / 100),
                          height: Math.round((item.height * percent) / 100),
                      };
            const { blob } = await renderItem(item, target);
            if (!blob) continue;
            const base = (item.name || "image").replace(/\.[^.]+$/, "");
            const ext = (item.type || "image/png").replace("image/", "");
            zip.file(`${base}-resized.${ext}`, blob);
        }
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resized-images.zip";
        a.click();
        URL.revokeObjectURL(url);
    };

    const applyResizeFiles = async (files) => {
        if (!files || !files.length) return;
        const images = await loadImages(files);
        resizeState.items = images;
        const primary = getPrimaryItem();
        if (!primary) {
            renderResizeThumbs([]);
            resizeEls.fileName.textContent = "-";
            resizeEls.fileDims.textContent = "-";
            resizeEls.formatBadge.textContent = "-";
            updateResizePreview();
            setResizeStatus("画像ファイルが見つかりませんでした", "warn");
            return;
        }
        resizeEls.fileName.textContent = images.length === 1 ? primary.name : `${images.length} 件の画像`;
        resizeEls.fileDims.textContent = formatDims(primary.width, primary.height);
        resizeEls.formatBadge.textContent = getFormatLabel();
        setResizeDefaults();
        renderResizeThumbs(images);
        updateResizePreview();
        setResizeStatus("リサイズ設定を調整できます", "ok");
    };

    const handleResizeFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        await applyResizeFiles(files);
    };

// --- Event wiring ---
// --- Event wiring ---
    const init = () => {
        // Crop drop zone
        bindDropZone($("cropDropZone"), $("cropFileInput"), handleCropFile);
        $("cropFileButton").addEventListener("click", (e) => {
            e.stopPropagation();
            $("cropFileInput").click();
        });

        cropCanvas.addEventListener("mousedown", startDrag);
        cropCanvas.addEventListener("mousemove", setCursorByZone);
        window.addEventListener("mousemove", dragMove);
        window.addEventListener("mouseup", endDrag);

        ["input", "change"].forEach((evtName) => {
            cropEls.inputX.addEventListener(evtName, () => {
                aspectPrefer = "auto";
                selectionFromInputs();
            });
            cropEls.inputY.addEventListener(evtName, () => {
                aspectPrefer = "auto";
                selectionFromInputs();
            });
            cropEls.inputW.addEventListener(evtName, () => {
                aspectPrefer = "width";
                selectionFromInputs();
            });
            cropEls.inputH.addEventListener(evtName, () => {
                aspectPrefer = "height";
                selectionFromInputs();
            });
        });

        document.querySelectorAll("input[name='aspect']").forEach((el) => {
            el.addEventListener("change", defaultSelection);
        });
        $("aspectSwap").addEventListener("change", defaultSelection);

        cropEls.btnDownload.addEventListener("click", downloadCrop);

        // Resize input handling
        resizeEls.sourceRadios.forEach((el) => {
            el.addEventListener("change", (e) => {
                resizeState.source = e.target.value;
                updateResizeSourceUI();
            });
        });

        resizeEls.dropZone.addEventListener("click", (e) => {
            e.stopPropagation();
            if (resizeState.source === "folder") {
                resizeEls.folderInput.click();
            } else {
                resizeEls.fileInput.click();
            }
        });
        resizeEls.dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            resizeEls.dropZone.classList.add("is-dragover");
        });
        resizeEls.dropZone.addEventListener("dragleave", () => resizeEls.dropZone.classList.remove("is-dragover"));
        resizeEls.dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            resizeEls.dropZone.classList.remove("is-dragover");
            await handleResizeFiles(e.dataTransfer.files);
        });

        resizeEls.fileButton.addEventListener("click", (e) => {
            e.stopPropagation();
            if (resizeState.source === "folder") {
                resizeEls.folderInput.click();
            } else {
                resizeEls.fileInput.click();
            }
        });

        resizeEls.fileInput.addEventListener("change", async (e) => {
            await handleResizeFiles(e.target.files);
            e.target.value = "";
        });
        resizeEls.folderInput.addEventListener("change", async (e) => {
            await handleResizeFiles(e.target.files);
            e.target.value = "";
        });

        document.querySelectorAll("input[name='resizeMode']").forEach((el) => {
            el.addEventListener("change", () => {
                updateResizeModeUI();
                updateResizePreview();
            });
        });

        resizeEls.width.addEventListener("input", () => {
            resizeState.lastEdited = "width";
            updateResizePreview();
        });
        resizeEls.height.addEventListener("input", () => {
            resizeState.lastEdited = "height";
            updateResizePreview();
        });
        resizeEls.percent.addEventListener("input", updateResizePreview);
        resizeEls.lock.addEventListener("change", updateResizePreview);

        resizeEls.btnDownload.addEventListener("click", downloadResize);

        updateResizeModeUI();
        updateResizeSourceUI();
        renderResizeThumbs([]);
    };

    init();
})();
