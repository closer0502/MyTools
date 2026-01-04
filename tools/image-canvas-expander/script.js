(() => {
    const $ = (id) => document.getElementById(id);
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    // Shared helpers (from image-crop-resizer)
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
    const toInt = (value, fallback = 0) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.round(num);
    };

    const editorCanvas = $("editorCanvas");
    const editorFrame = $("editorFrame");
    const editorCtx = editorCanvas.getContext("2d");
    const outputCanvas = document.createElement("canvas");

    const state = {
        image: null,
        fileType: "image/png",
        fileName: "",
        scale: 1,
        output: { width: 0, height: 0 },
        offset: { x: 0, y: 0 },
        background: { mode: "transparent", color: "#ffffff" },
    };

    const els = {
        dropZone: $("dropZone"),
        fileInput: $("fileInput"),
        fileButton: $("fileButton"),
        fileName: $("fileName"),
        fileDims: $("fileDims"),
        inputInfo: $("inputInfo"),
        outputSize: $("outputSize"),
        paddingInfo: $("paddingInfo"),
        statusText: $("statusText"),
        statusDot: $("status").querySelector(".status-dot"),
        outputWidth: $("outputWidth"),
        outputHeight: $("outputHeight"),
        padLeft: $("padLeft"),
        padRight: $("padRight"),
        padTop: $("padTop"),
        padBottom: $("padBottom"),
        padCustom: $("padCustom"),
        padApplyBtn: $("padApplyBtn"),
        bgColor: $("bgColor"),
        downloadBtn: $("downloadBtn"),
        resetBtn: $("resetBtn"),
        bgModeRadios: document.querySelectorAll("input[name='bgMode']"),
        alignButtons: document.querySelectorAll("[data-align]"),
        presetButtons: document.querySelectorAll("[data-pad]"),
    };

    let suppressInputs = false;
    let previewTimer;

    const setStatus = (text, tone = "muted") => {
        els.statusText.textContent = text;
        const color =
            tone === "ok" ? "var(--accent-strong)" : tone === "warn" ? "#f59e0b" : "var(--muted)";
        els.statusDot.style.background = color;
    };

    const getPadding = () => {
        if (!state.image) {
            return { left: 0, right: 0, top: 0, bottom: 0 };
        }
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const left = state.offset.x;
        const top = state.offset.y;
        const right = Math.max(0, state.output.width - left - iw);
        const bottom = Math.max(0, state.output.height - top - ih);
        return { left, right, top, bottom };
    };

    const setControlsEnabled = (enabled) => {
        [
            els.outputWidth,
            els.outputHeight,
            els.padLeft,
            els.padRight,
            els.padTop,
            els.padBottom,
            els.padCustom,
            els.padApplyBtn,
            els.bgColor,
            ...els.alignButtons,
            ...els.presetButtons,
            els.downloadBtn,
            els.resetBtn,
        ].forEach((el) => {
            if (!el) return;
            el.disabled = !enabled;
        });
    };

    const fitEditorCanvas = () => {
        if (!state.image) {
            editorCanvas.width = 0;
            editorCanvas.height = 0;
            return;
        }
        const maxW = editorFrame?.clientWidth || 560;
        const maxH = 640;
        const ratio = Math.min(maxW / state.output.width, maxH / state.output.height, 1);
        state.scale = ratio;
        editorCanvas.width = Math.max(1, Math.round(state.output.width * ratio));
        editorCanvas.height = Math.max(1, Math.round(state.output.height * ratio));
        editorCanvas.style.width = `${editorCanvas.width}px`;
        editorCanvas.style.height = `${editorCanvas.height}px`;
    };

    const drawHandles = () => {
        const w = editorCanvas.width;
        const h = editorCanvas.height;
        const handleSize = 10;
        const points = [
            { x: 0, y: 0, kind: "corner" },
            { x: w / 2, y: 0, kind: "edge" },
            { x: w, y: 0, kind: "corner" },
            { x: w, y: h / 2, kind: "edge" },
            { x: w, y: h, kind: "corner" },
            { x: w / 2, y: h, kind: "edge" },
            { x: 0, y: h, kind: "corner" },
            { x: 0, y: h / 2, kind: "edge" },
        ];
        points.forEach((p) => {
            editorCtx.fillStyle =
                p.kind === "edge" ? "rgba(244, 114, 182, 0.9)" : "rgba(34, 211, 238, 0.9)";
            editorCtx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
        });
    };

    const renderEditor = () => {
        if (!state.image) {
            editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
            return;
        }
        const s = state.scale;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const imgX = state.offset.x * s;
        const imgY = state.offset.y * s;
        const imgW = iw * s;
        const imgH = ih * s;
        const padding = getPadding();

        editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        const bgFill = getBackgroundFill();
        if (bgFill) {
            editorCtx.fillStyle = bgFill;
            editorCtx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
        }

        const overlayColor = "rgba(56, 189, 248, 0.14)";
        editorCtx.fillStyle = overlayColor;
        if (padding.left > 0) {
            editorCtx.fillRect(0, 0, padding.left * s, editorCanvas.height);
        }
        if (padding.right > 0) {
            editorCtx.fillRect(editorCanvas.width - padding.right * s, 0, padding.right * s, editorCanvas.height);
        }
        const innerX = padding.left * s;
        const innerWidth = Math.max(0, editorCanvas.width - (padding.left + padding.right) * s);
        if (padding.top > 0) {
            editorCtx.fillRect(innerX, 0, innerWidth, padding.top * s);
        }
        if (padding.bottom > 0) {
            editorCtx.fillRect(innerX, editorCanvas.height - padding.bottom * s, innerWidth, padding.bottom * s);
        }

        editorCtx.drawImage(state.image, imgX, imgY, imgW, imgH);
        editorCtx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        editorCtx.lineWidth = 1;
        editorCtx.strokeRect(imgX + 0.5, imgY + 0.5, imgW - 1, imgH - 1);

        editorCtx.strokeStyle = "#22d3ee";
        editorCtx.lineWidth = 2;
        editorCtx.strokeRect(1, 1, editorCanvas.width - 2, editorCanvas.height - 2);
        drawHandles();
    };

    const drawOutputCanvas = () => {
        if (!state.image) return;
        outputCanvas.width = state.output.width;
        outputCanvas.height = state.output.height;
        const ctx = outputCanvas.getContext("2d");
        ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        const bgFill = getBackgroundFill();
        if (bgFill) {
            ctx.fillStyle = bgFill;
            ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        }
        ctx.drawImage(state.image, state.offset.x, state.offset.y);
    };

    const updateOutputPreview = () => {
        if (!state.image) return;
        drawOutputCanvas();
    };

    const scheduleOutputPreview = (immediate = false) => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updateOutputPreview, immediate ? 0 : 140);
    };

    const syncInputs = () => {
        suppressInputs = true;
        if (!state.image) {
            els.outputWidth.value = "";
            els.outputHeight.value = "";
            els.padLeft.value = "";
            els.padRight.value = "";
            els.padTop.value = "";
            els.padBottom.value = "";
            els.outputSize.textContent = "-";
            els.paddingInfo.textContent = "-";
            suppressInputs = false;
            return;
        }
        const padding = getPadding();
        els.outputWidth.value = Math.round(state.output.width);
        els.outputHeight.value = Math.round(state.output.height);
        els.padLeft.value = Math.round(padding.left);
        els.padRight.value = Math.round(padding.right);
        els.padTop.value = Math.round(padding.top);
        els.padBottom.value = Math.round(padding.bottom);
        els.outputSize.textContent = formatDims(state.output.width, state.output.height);
        els.paddingInfo.textContent = `L${Math.round(padding.left)} / R${Math.round(padding.right)} / T${Math.round(
            padding.top
        )} / B${Math.round(padding.bottom)}`;
        suppressInputs = false;
    };

    const commitState = ({ width, height, offsetX, offsetY } = {}, opts = {}) => {
        if (!state.image) return;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const nextWidth = Math.max(iw, Math.round(width ?? state.output.width));
        const nextHeight = Math.max(ih, Math.round(height ?? state.output.height));
        const maxX = Math.max(0, nextWidth - iw);
        const maxY = Math.max(0, nextHeight - ih);
        const nextX = clamp(Math.round(offsetX ?? state.offset.x), 0, maxX);
        const nextY = clamp(Math.round(offsetY ?? state.offset.y), 0, maxY);

        state.output.width = nextWidth;
        state.output.height = nextHeight;
        state.offset.x = nextX;
        state.offset.y = nextY;
        fitEditorCanvas();
        syncInputs();
        renderEditor();
        scheduleOutputPreview(opts.immediatePreview);
    };

    const getBackgroundFill = () => {
        switch (state.background.mode) {
            case "white":
                return "#ffffff";
            case "black":
                return "#000000";
            case "custom":
                return state.background.color;
            default:
                return null;
        }
    };

    const updateBackgroundUI = () => {
        const isCustom = state.background.mode === "custom";
        els.bgColor.disabled = !isCustom;
    };

    const handleFile = async (file, error) => {
        if (error) {
            setStatus(error.message, "warn");
            return;
        }
        if (!file) return;
        try {
            const img = await readImageFile(file);
            state.image = img;
            state.fileType = file.type || "image/png";
            state.fileName = file.name || "image";
            state.output.width = img.naturalWidth;
            state.output.height = img.naturalHeight;
            state.offset.x = 0;
            state.offset.y = 0;
            els.fileName.textContent = file.name || "-";
            els.fileDims.textContent = formatDims(img.naturalWidth, img.naturalHeight);
            els.inputInfo.textContent = formatDims(img.naturalWidth, img.naturalHeight);
            setStatus("準備完了", "ok");
            setControlsEnabled(true);
            fitEditorCanvas();
            syncInputs();
            renderEditor();
            updateOutputPreview();
        } catch (err) {
            setStatus("読み込みに失敗しました", "warn");
            console.error(err);
        }
    };

    const updatePaddingFromInputs = () => {
        if (suppressInputs || !state.image) return;
        const padding = getPadding();
        const left = Math.max(0, toInt(els.padLeft.value, padding.left));
        const right = Math.max(0, toInt(els.padRight.value, padding.right));
        const top = Math.max(0, toInt(els.padTop.value, padding.top));
        const bottom = Math.max(0, toInt(els.padBottom.value, padding.bottom));
        const width = state.image.naturalWidth + left + right;
        const height = state.image.naturalHeight + top + bottom;
        commitState({ width, height, offsetX: left, offsetY: top }, { immediatePreview: true });
    };

    const updateSizeFromInputs = () => {
        if (suppressInputs || !state.image) return;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const width = Math.max(iw, toInt(els.outputWidth.value, state.output.width));
        const height = Math.max(ih, toInt(els.outputHeight.value, state.output.height));
        commitState({ width, height }, { immediatePreview: true });
    };

    const applyAlignment = (align) => {
        if (!state.image) return;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const maxX = Math.max(0, state.output.width - iw);
        const maxY = Math.max(0, state.output.height - ih);
        const xRatio = align.includes("w") ? 0 : align.includes("e") ? 1 : 0.5;
        const yRatio = align.includes("n") ? 0 : align.includes("s") ? 1 : 0.5;
        const nextX = Math.round(maxX * xRatio);
        const nextY = Math.round(maxY * yRatio);
        commitState({ offsetX: nextX, offsetY: nextY }, { immediatePreview: true });
    };

    const applyPaddingPreset = (padValue) => {
        if (!state.image) return;
        const pad = Math.max(0, padValue);
        const width = state.image.naturalWidth + pad * 2;
        const height = state.image.naturalHeight + pad * 2;
        commitState({ width, height, offsetX: pad, offsetY: pad }, { immediatePreview: true });
    };

    const applyCustomPadding = () => {
        if (!state.image) return;
        const padValue = Math.max(0, toInt(els.padCustom.value, 0));
        applyPaddingPreset(padValue);
    };

    const downloadOutput = () => {
        if (!state.image) return;
        drawOutputCanvas();
        outputCanvas.toBlob(
            (blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const base = state.fileName.replace(/\.[^.]+$/, "");
                const ext = state.fileType.replace("image/", "");
                a.download = `${base}-expanded.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
            },
            state.fileType || "image/png",
            0.95
        );
    };

    const resetOutput = () => {
        if (!state.image) return;
        commitState(
            {
                width: state.image.naturalWidth,
                height: state.image.naturalHeight,
                offsetX: 0,
                offsetY: 0,
            },
            { immediatePreview: true }
        );
    };

    const getPointer = (evt) => {
        const rect = editorCanvas.getBoundingClientRect();
        const px = evt.clientX - rect.left;
        const py = evt.clientY - rect.top;
        return {
            px,
            py,
            ix: px / state.scale,
            iy: py / state.scale,
        };
    };

    const hitHandle = ({ px, py }) => {
        const size = 12;
        const w = editorCanvas.width;
        const h = editorCanvas.height;
        const handles = [
            { name: "nw", x: 0, y: 0 },
            { name: "n", x: w / 2, y: 0 },
            { name: "ne", x: w, y: 0 },
            { name: "e", x: w, y: h / 2 },
            { name: "se", x: w, y: h },
            { name: "s", x: w / 2, y: h },
            { name: "sw", x: 0, y: h },
            { name: "w", x: 0, y: h / 2 },
        ];
        return handles.find((hnd) => Math.abs(px - hnd.x) <= size && Math.abs(py - hnd.y) <= size)?.name;
    };

    const isInsideImage = ({ ix, iy }) => {
        if (!state.image) return false;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        return (
            ix >= state.offset.x &&
            ix <= state.offset.x + iw &&
            iy >= state.offset.y &&
            iy <= state.offset.y + ih
        );
    };

    const setCursorByZone = (evt) => {
        if (!state.image) {
            editorCanvas.style.cursor = "default";
            return;
        }
        const pointer = getPointer(evt);
        const handle = hitHandle(pointer);
        if (handle) {
            if (handle === "nw" || handle === "se") editorCanvas.style.cursor = "nwse-resize";
            else if (handle === "ne" || handle === "sw") editorCanvas.style.cursor = "nesw-resize";
            else if (handle === "n" || handle === "s") editorCanvas.style.cursor = "ns-resize";
            else editorCanvas.style.cursor = "ew-resize";
            return;
        }
        if (isInsideImage(pointer)) {
            editorCanvas.style.cursor = "grab";
        } else {
            editorCanvas.style.cursor = "default";
        }
    };

    let dragState = {
        active: false,
        mode: null,
        start: null,
        startScale: 1,
        startRect: null,
        startPadding: null,
        startOffset: null,
        startOutput: null,
    };

    const startDrag = (evt) => {
        if (!state.image) return;
        const pointer = getPointer(evt);
        const handle = hitHandle(pointer);
        const mode = handle || (isInsideImage(pointer) ? "move" : null);
        if (!mode) return;
        const rect = editorCanvas.getBoundingClientRect();
        dragState = {
            active: true,
            mode,
            start: pointer,
            startScale: state.scale,
            startRect: rect,
            startPadding: getPadding(),
            startOffset: { ...state.offset },
            startOutput: { ...state.output },
        };
        editorCanvas.classList.toggle("is-grabbing", mode === "move");
        editorCanvas.setPointerCapture?.(evt.pointerId);
    };

    const dragMove = (evt) => {
        if (!dragState.active || !state.image) return;
        const rect = dragState.startRect;
        const px = evt.clientX - rect.left;
        const py = evt.clientY - rect.top;
        const dx = px / dragState.startScale - dragState.start.ix;
        const dy = py / dragState.startScale - dragState.start.iy;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const { left, right, top, bottom } = dragState.startPadding;

        switch (dragState.mode) {
            case "move": {
                const maxX = Math.max(0, dragState.startOutput.width - iw);
                const maxY = Math.max(0, dragState.startOutput.height - ih);
                const nextX = clamp(dragState.startOffset.x + dx, 0, maxX);
                const nextY = clamp(dragState.startOffset.y + dy, 0, maxY);
                commitState(
                    {
                        width: dragState.startOutput.width,
                        height: dragState.startOutput.height,
                        offsetX: nextX,
                        offsetY: nextY,
                    },
                    { immediatePreview: false }
                );
                break;
            }
            case "w": {
                const nextLeft = Math.max(0, left - dx);
                const width = iw + nextLeft + right;
                commitState(
                    { width, height: dragState.startOutput.height, offsetX: nextLeft, offsetY: dragState.startOffset.y },
                    { immediatePreview: false }
                );
                break;
            }
            case "e": {
                const nextRight = Math.max(0, right + dx);
                const width = iw + left + nextRight;
                commitState(
                    { width, height: dragState.startOutput.height, offsetX: left, offsetY: dragState.startOffset.y },
                    { immediatePreview: false }
                );
                break;
            }
            case "n": {
                const nextTop = Math.max(0, top - dy);
                const height = ih + nextTop + bottom;
                commitState(
                    { width: dragState.startOutput.width, height, offsetX: dragState.startOffset.x, offsetY: nextTop },
                    { immediatePreview: false }
                );
                break;
            }
            case "s": {
                const nextBottom = Math.max(0, bottom + dy);
                const height = ih + top + nextBottom;
                commitState(
                    { width: dragState.startOutput.width, height, offsetX: dragState.startOffset.x, offsetY: top },
                    { immediatePreview: false }
                );
                break;
            }
            case "nw": {
                const nextLeft = Math.max(0, left - dx);
                const nextTop = Math.max(0, top - dy);
                const width = iw + nextLeft + right;
                const height = ih + nextTop + bottom;
                commitState({ width, height, offsetX: nextLeft, offsetY: nextTop }, { immediatePreview: false });
                break;
            }
            case "ne": {
                const nextRight = Math.max(0, right + dx);
                const nextTop = Math.max(0, top - dy);
                const width = iw + left + nextRight;
                const height = ih + nextTop + bottom;
                commitState({ width, height, offsetX: left, offsetY: nextTop }, { immediatePreview: false });
                break;
            }
            case "sw": {
                const nextLeft = Math.max(0, left - dx);
                const nextBottom = Math.max(0, bottom + dy);
                const width = iw + nextLeft + right;
                const height = ih + top + nextBottom;
                commitState({ width, height, offsetX: nextLeft, offsetY: top }, { immediatePreview: false });
                break;
            }
            case "se": {
                const nextRight = Math.max(0, right + dx);
                const nextBottom = Math.max(0, bottom + dy);
                const width = iw + left + nextRight;
                const height = ih + top + nextBottom;
                commitState({ width, height, offsetX: left, offsetY: top }, { immediatePreview: false });
                break;
            }
            default:
                break;
        }
    };

    const endDrag = (evt) => {
        if (!dragState.active) return;
        dragState.active = false;
        editorCanvas.classList.remove("is-grabbing");
        editorCanvas.releasePointerCapture?.(evt.pointerId);
        scheduleOutputPreview(true);
    };

    bindDropZone(els.dropZone, els.fileInput, handleFile);
    els.fileButton.addEventListener("click", (e) => {
        e.stopPropagation();
        els.fileInput.click();
    });

    els.outputWidth.addEventListener("input", updateSizeFromInputs);
    els.outputHeight.addEventListener("input", updateSizeFromInputs);
    els.padLeft.addEventListener("input", updatePaddingFromInputs);
    els.padRight.addEventListener("input", updatePaddingFromInputs);
    els.padTop.addEventListener("input", updatePaddingFromInputs);
    els.padBottom.addEventListener("input", updatePaddingFromInputs);

    els.alignButtons.forEach((btn) => {
        btn.addEventListener("click", () => applyAlignment(btn.dataset.align || "c"));
    });

    els.presetButtons.forEach((btn) => {
        btn.addEventListener("click", () => applyPaddingPreset(Number(btn.dataset.pad) || 0));
    });

    els.padApplyBtn.addEventListener("click", applyCustomPadding);
    els.padCustom.addEventListener("keydown", (evt) => {
        if (evt.key !== "Enter") return;
        applyCustomPadding();
    });

    els.bgModeRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (!radio.checked) return;
            state.background.mode = radio.value;
            updateBackgroundUI();
            renderEditor();
            scheduleOutputPreview(true);
        });
    });

    els.bgColor.addEventListener("input", () => {
        state.background.color = els.bgColor.value;
        renderEditor();
        scheduleOutputPreview();
    });

    els.downloadBtn.addEventListener("click", downloadOutput);
    els.resetBtn.addEventListener("click", resetOutput);

    editorCanvas.addEventListener("pointerdown", startDrag);
    editorCanvas.addEventListener("pointermove", (evt) => {
        if (dragState.active) {
            dragMove(evt);
        } else {
            setCursorByZone(evt);
        }
    });
    editorCanvas.addEventListener("pointerup", endDrag);
    editorCanvas.addEventListener("pointerleave", (evt) => {
        if (!dragState.active) return;
        endDrag(evt);
    });

    window.addEventListener("resize", () => {
        if (!state.image) return;
        fitEditorCanvas();
        renderEditor();
    });

    setControlsEnabled(false);
    updateBackgroundUI();
})();
