(() => {
    const $ = (id) => document.getElementById(id);
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    const extensionByType = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
    };
    const typeByExtension = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
    };

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
            onFile(fileList[0]);
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
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const toInt = (value, fallback = 0) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.round(num);
    };

    const els = {
        dropZone: $("dropZone"),
        fileInput: $("fileInput"),
        fileButton: $("fileButton"),
        fileName: $("fileName"),
        fileDims: $("fileDims"),
        brushSize: $("brushSize"),
        brushValue: $("brushValue"),
        maskOpacity: $("maskOpacity"),
        maskOpacityValue: $("maskOpacityValue"),
        inpaintRadius: $("inpaintRadius"),
        radiusValue: $("radiusValue"),
        applyBtn: $("applyBtn"),
        clearMaskBtn: $("clearMaskBtn"),
        resetBtn: $("resetBtn"),
        downloadBtn: $("downloadBtn"),
        status: $("status"),
        statusText: $("statusText"),
        cvBadge: $("cvBadge"),
        previewInfo: $("previewInfo"),
        previewFrame: $("previewFrame"),
        drawModeRadios: document.querySelectorAll("input[name='drawMode']"),
        algoRadios: document.querySelectorAll("input[name='inpaintAlgo']"),
    };

    const previewCanvas = $("previewCanvas");
    const overlayCanvas = $("overlayCanvas");
    const cursorCanvas = $("cursorCanvas");
    const previewCtx = previewCanvas.getContext("2d");
    const overlayCtx = overlayCanvas.getContext("2d");
    const cursorCtx = cursorCanvas.getContext("2d");
    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    const resultCanvas = document.createElement("canvas");

    const state = {
        image: null,
        fileName: "",
        fileType: "image/png",
        fileExtension: "png",
        displayScale: 1,
        brushSize: 32,
        overlayOpacity: 0.45,
        drawMode: "paint",
        inpaintRadius: 6,
        algorithm: "telea",
        isCvReady: false,
        isDrawing: false,
        isProcessing: false,
        hasMask: false,
        lastPoint: null,
        cursorPoint: null,
        baseCanvas: null,
    };

    const setStatus = (text, tone = "muted") => {
        const colors = {
            ok: "var(--accent-strong)",
            warn: "var(--warm)",
            error: "#f87171",
            muted: "var(--muted)",
        };
        els.statusText.textContent = text;
        els.status.querySelector(".status-dot").style.background = colors[tone] || colors.muted;
    };

    const setCvBadge = (ready) => {
        els.cvBadge.textContent = ready ? "OpenCV: Ready" : "OpenCV: Loading";
    };

    const syncControls = () => {
        const hasImage = !!state.image;
        const canEdit = hasImage && !state.isProcessing;
        [
            els.brushSize,
            els.maskOpacity,
            els.inpaintRadius,
            ...els.drawModeRadios,
            ...els.algoRadios,
        ].forEach((el) => {
            if (!el) return;
            el.disabled = !hasImage;
        });

        els.applyBtn.disabled =
            !hasImage || !state.isCvReady || !state.hasMask || state.isProcessing;
        els.clearMaskBtn.disabled = !canEdit || !state.hasMask;
        els.resetBtn.disabled = !canEdit;
        els.downloadBtn.disabled = !canEdit;
    };

    const updateBrushLabel = () => {
        els.brushValue.textContent = `${state.brushSize}px`;
    };

    const updateOpacityLabel = () => {
        els.maskOpacityValue.textContent = `${Math.round(state.overlayOpacity * 100)}%`;
    };

    const updateRadiusLabel = () => {
        els.radiusValue.textContent = `${state.inpaintRadius}px`;
    };

    const updatePreviewInfo = () => {
        if (!state.image) {
            els.previewInfo.textContent = "-";
            return;
        }
        els.previewInfo.textContent = `表示 ${formatDims(
            previewCanvas.width,
            previewCanvas.height
        )}`;
    };

    const clearMask = () => {
        if (!state.image) return;
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        state.hasMask = false;
        syncControls();
    };

    const clearCursor = () => {
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    };

    const drawCursor = (displayPoint) => {
        if (!state.image || !displayPoint || state.drawMode === "fill") {
            clearCursor();
            return;
        }
        const scale = state.displayScale || 1;
        const radius = Math.max(2, (state.brushSize * scale) / 2);
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        cursorCtx.save();
        cursorCtx.strokeStyle = "rgba(56, 189, 248, 0.9)";
        cursorCtx.lineWidth = 1.5;
        cursorCtx.beginPath();
        cursorCtx.arc(displayPoint.x, displayPoint.y, radius, 0, Math.PI * 2);
        cursorCtx.stroke();
        cursorCtx.restore();
    };

    const fillMaskAt = (displayPoint) => {
        if (!state.image) return;
        const scale = state.displayScale || 1;
        const width = maskCanvas.width;
        const height = maskCanvas.height;
        const x = clamp(Math.floor(displayPoint.x / scale), 0, width - 1);
        const y = clamp(Math.floor(displayPoint.y / scale), 0, height - 1);
        const imageData = maskCtx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const startIndex = (y * width + x) * 4 + 3;
        if (data[startIndex] !== 0) {
            return;
        }
        const stack = [x, y];
        let filled = false;
        while (stack.length) {
            const cy = stack.pop();
            const cx = stack.pop();
            const idx = (cy * width + cx) * 4;
            if (data[idx + 3] !== 0) continue;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
            filled = true;
            if (cx > 0) stack.push(cx - 1, cy);
            if (cx < width - 1) stack.push(cx + 1, cy);
            if (cy > 0) stack.push(cx, cy - 1);
            if (cy < height - 1) stack.push(cx, cy + 1);
        }
        if (filled) {
            maskCtx.putImageData(imageData, 0, 0);
            state.hasMask = true;
            redrawOverlay();
            syncControls();
        }
    };

    const renderPreview = () => {
        if (!state.baseCanvas || !state.image) {
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            return;
        }
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.imageSmoothingEnabled = true;
        previewCtx.drawImage(
            state.baseCanvas,
            0,
            0,
            state.baseCanvas.width,
            state.baseCanvas.height,
            0,
            0,
            previewCanvas.width,
            previewCanvas.height
        );
    };

    const redrawOverlay = () => {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        if (!state.image) return;
        overlayCtx.save();
        overlayCtx.drawImage(
            maskCanvas,
            0,
            0,
            maskCanvas.width,
            maskCanvas.height,
            0,
            0,
            overlayCanvas.width,
            overlayCanvas.height
        );
        overlayCtx.globalCompositeOperation = "source-in";
        overlayCtx.fillStyle = `rgba(56, 189, 248, ${state.overlayOpacity})`;
        overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        overlayCtx.restore();
    };

    const fitPreviewCanvas = () => {
        if (!state.image) {
            previewCanvas.width = 0;
            previewCanvas.height = 0;
            overlayCanvas.width = 0;
            overlayCanvas.height = 0;
            cursorCanvas.width = 0;
            cursorCanvas.height = 0;
            return;
        }
        const maxW = Math.max(320, els.previewFrame.clientWidth - 2);
        const maxH = 640;
        const iw = state.image.naturalWidth;
        const ih = state.image.naturalHeight;
        const scale = Math.min(maxW / iw, maxH / ih, 1);
        state.displayScale = scale;
        const displayW = Math.max(1, Math.round(iw * scale));
        const displayH = Math.max(1, Math.round(ih * scale));
        previewCanvas.width = displayW;
        previewCanvas.height = displayH;
        overlayCanvas.width = displayW;
        overlayCanvas.height = displayH;
        cursorCanvas.width = displayW;
        cursorCanvas.height = displayH;
        previewCanvas.style.width = `${displayW}px`;
        previewCanvas.style.height = `${displayH}px`;
        overlayCanvas.style.width = `${displayW}px`;
        overlayCanvas.style.height = `${displayH}px`;
        cursorCanvas.style.width = `${displayW}px`;
        cursorCanvas.style.height = `${displayH}px`;
        renderPreview();
        redrawOverlay();
        drawCursor(state.cursorPoint);
        updatePreviewInfo();
    };

    const getFileType = (file) => {
        if (allowedTypes.has(file.type)) return file.type;
        const ext = file.name.split(".").pop().toLowerCase();
        return typeByExtension[ext] || "";
    };

    const setImage = (img, file) => {
        state.image = img;
        state.fileName = file.name;
        state.fileType = getFileType(file);
        const ext = file.name.split(".").pop().toLowerCase();
        state.fileExtension = typeByExtension[ext]
            ? ext
            : extensionByType[state.fileType] || "png";
        const average = (img.naturalWidth + img.naturalHeight) / 2;
        const maxBrush = Math.max(1, Math.round(average / 4));
        const minBrush = Math.min(4, maxBrush);
        els.brushSize.max = String(maxBrush);
        els.brushSize.min = String(minBrush);
        state.brushSize = Math.min(
            Math.max(state.brushSize, minBrush),
            maxBrush
        );
        els.brushSize.value = String(state.brushSize);
        updateBrushLabel();
        sourceCanvas.width = img.naturalWidth;
        sourceCanvas.height = img.naturalHeight;
        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceCtx.drawImage(img, 0, 0);
        maskCanvas.width = img.naturalWidth;
        maskCanvas.height = img.naturalHeight;
        clearMask();
        state.baseCanvas = sourceCanvas;
        state.cursorPoint = null;
        els.fileName.textContent = state.fileName;
        els.fileDims.textContent = formatDims(img.naturalWidth, img.naturalHeight);
        fitPreviewCanvas();
        clearCursor();
        setStatus("マスクを塗ってください", "muted");
        syncControls();
    };

    const getCanvasPoint = (event) => {
        const rect = overlayCanvas.getBoundingClientRect();
        const scaleX = overlayCanvas.width / rect.width;
        const scaleY = overlayCanvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    };

    const drawStroke = (from, to) => {
        if (!state.image) return;
        const scale = state.displayScale || 1;
        const maskFrom = { x: from.x / scale, y: from.y / scale };
        const maskTo = { x: to.x / scale, y: to.y / scale };
        const isErase = state.drawMode === "erase";

        maskCtx.save();
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";
        maskCtx.lineWidth = state.brushSize;
        maskCtx.strokeStyle = "#ffffff";
        maskCtx.globalCompositeOperation = isErase ? "destination-out" : "source-over";
        maskCtx.beginPath();
        maskCtx.moveTo(maskFrom.x, maskFrom.y);
        maskCtx.lineTo(maskTo.x, maskTo.y);
        maskCtx.stroke();
        maskCtx.restore();

        overlayCtx.save();
        overlayCtx.lineCap = "round";
        overlayCtx.lineJoin = "round";
        overlayCtx.lineWidth = state.brushSize * scale;
        overlayCtx.strokeStyle = `rgba(56, 189, 248, ${state.overlayOpacity})`;
        overlayCtx.globalCompositeOperation = isErase ? "destination-out" : "source-over";
        overlayCtx.beginPath();
        overlayCtx.moveTo(from.x, from.y);
        overlayCtx.lineTo(to.x, to.y);
        overlayCtx.stroke();
        overlayCtx.restore();

        if (!isErase) {
            state.hasMask = true;
            syncControls();
        }
    };

    const handlePointerDown = (event) => {
        if (!state.image || state.isProcessing) return;
        event.preventDefault();
        const point = getCanvasPoint(event);
        state.cursorPoint = point;
        if (state.drawMode === "fill") {
            fillMaskAt(point);
            clearCursor();
            return;
        }
        overlayCanvas.setPointerCapture(event.pointerId);
        state.isDrawing = true;
        state.lastPoint = point;
        drawCursor(point);
        drawStroke(point, point);
    };

    const handlePointerMove = (event) => {
        if (!state.image) return;
        event.preventDefault();
        const point = getCanvasPoint(event);
        state.cursorPoint = point;
        drawCursor(point);
        if (!state.isDrawing || !state.lastPoint) return;
        drawStroke(state.lastPoint, point);
        state.lastPoint = point;
    };

    const handlePointerUp = (event) => {
        if (!state.isDrawing) return;
        event.preventDefault();
        state.isDrawing = false;
        state.lastPoint = null;
        overlayCanvas.releasePointerCapture(event.pointerId);
    };

    const waitForOpenCv = () =>
        new Promise((resolve) => {
            if (window.cv && cv.Mat) {
                resolve();
                return;
            }
            window.addEventListener(
                "opencv-ready",
                () => {
                    resolve();
                },
                { once: true }
            );
        });

    const applyInpaint = async () => {
        if (!state.image || !state.isCvReady || state.isProcessing) return;
        if (!state.hasMask) {
            setStatus("マスクを塗ってください", "warn");
            return;
        }
        state.isProcessing = true;
        syncControls();
        setStatus("処理中...", "warn");

        await new Promise((resolve) => requestAnimationFrame(resolve));

        let src;
        let srcRgb;
        let mask;
        let maskGray;
        let maskBin;
        let dstRgb;
        let alpha;
        let srcChannels;
        let dstChannels;
        let mergedChannels;
        let dstRgba;
        try {
            src = cv.imread(state.baseCanvas);
            srcRgb = new cv.Mat();
            cv.cvtColor(src, srcRgb, cv.COLOR_RGBA2RGB);
            mask = cv.imread(maskCanvas);
            maskGray = new cv.Mat();
            maskBin = new cv.Mat();
            cv.cvtColor(mask, maskGray, cv.COLOR_RGBA2GRAY);
            cv.threshold(maskGray, maskBin, 10, 255, cv.THRESH_BINARY);
            dstRgb = new cv.Mat();
            const radius = Math.max(1, state.inpaintRadius);
            const algo = state.algorithm === "ns" ? cv.INPAINT_NS : cv.INPAINT_TELEA;
            cv.inpaint(srcRgb, maskBin, dstRgb, radius, algo);

            const hasAlpha = src.channels() === 4;
            if (hasAlpha) {
                srcChannels = new cv.MatVector();
                cv.split(src, srcChannels);
                alpha = srcChannels.get(3).clone();
                for (let i = 0; i < srcChannels.size(); i += 1) {
                    srcChannels.get(i).delete();
                }
                srcChannels.delete();
                srcChannels = null;

                dstChannels = new cv.MatVector();
                cv.split(dstRgb, dstChannels);
                mergedChannels = new cv.MatVector();
                for (let i = 0; i < 3; i += 1) {
                    mergedChannels.push_back(dstChannels.get(i));
                }
                mergedChannels.push_back(alpha);
                dstRgba = new cv.Mat();
                cv.merge(mergedChannels, dstRgba);
                cv.imshow(resultCanvas, dstRgba);
            } else {
                cv.imshow(resultCanvas, dstRgb);
            }
            state.baseCanvas = resultCanvas;
            renderPreview();
            clearMask();
            setStatus("完了しました", "ok");
        } catch (error) {
            console.error(error);
            setStatus("処理に失敗しました", "error");
        } finally {
            if (src) src.delete();
            if (srcRgb) srcRgb.delete();
            if (mask) mask.delete();
            if (maskGray) maskGray.delete();
            if (maskBin) maskBin.delete();
            if (dstRgb) dstRgb.delete();
            if (alpha) alpha.delete();
            if (srcChannels) srcChannels.delete();
            if (dstChannels) {
                for (let i = 0; i < dstChannels.size(); i += 1) {
                    dstChannels.get(i).delete();
                }
                dstChannels.delete();
            }
            if (mergedChannels) mergedChannels.delete();
            if (dstRgba) dstRgba.delete();
            state.isProcessing = false;
            syncControls();
        }
    };

    const handleDownload = () => {
        if (!state.image || state.isProcessing) return;
        const type = state.fileType || "image/png";
        const baseName = state.fileName.replace(/\.[^/.]+$/, "") || "image";
        const ext = state.fileExtension || extensionByType[type] || "png";
        const filename = `${baseName}-erased.${ext}`;
        const quality =
            type === "image/jpeg" || type === "image/webp" ? 0.92 : undefined;
        const canvas = state.baseCanvas || sourceCanvas;

        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    setStatus("保存に失敗しました", "error");
                    return;
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
            },
            type,
            quality
        );
    };

    bindDropZone(els.dropZone, els.fileInput, async (file) => {
        if (!file) return;
        const type = getFileType(file);
        if (!type) {
            setStatus("PNG / JPG / WEBPのみ対応です", "warn");
            return;
        }
        try {
            const img = await readImageFile(file);
            setImage(img, file);
        } catch (error) {
            console.error(error);
            setStatus("画像の読み込みに失敗しました", "error");
        }
    });

    els.fileButton.addEventListener("click", (event) => {
        event.stopPropagation();
        els.fileInput.click();
    });
    els.brushSize.addEventListener("input", () => {
        state.brushSize = toInt(els.brushSize.value, 32);
        updateBrushLabel();
        drawCursor(state.cursorPoint);
    });
    els.maskOpacity.addEventListener("input", () => {
        state.overlayOpacity = Math.max(0.1, toInt(els.maskOpacity.value, 45) / 100);
        updateOpacityLabel();
        redrawOverlay();
    });
    els.inpaintRadius.addEventListener("input", () => {
        state.inpaintRadius = Math.max(1, toInt(els.inpaintRadius.value, 6));
        updateRadiusLabel();
    });
    els.applyBtn.addEventListener("click", applyInpaint);
    els.clearMaskBtn.addEventListener("click", () => {
        clearMask();
        setStatus("マスクをクリアしました", "muted");
    });
    els.resetBtn.addEventListener("click", () => {
        if (!state.image) return;
        state.baseCanvas = sourceCanvas;
        renderPreview();
        clearMask();
        setStatus("元画像に戻しました", "muted");
    });
    els.downloadBtn.addEventListener("click", handleDownload);

    els.drawModeRadios.forEach((radio) => {
        radio.addEventListener("change", (event) => {
            state.drawMode = event.target.value;
            drawCursor(state.cursorPoint);
        });
    });
    els.algoRadios.forEach((radio) => {
        radio.addEventListener("change", (event) => {
            state.algorithm = event.target.value;
        });
    });

    overlayCanvas.addEventListener("pointerdown", handlePointerDown);
    overlayCanvas.addEventListener("pointermove", handlePointerMove);
    overlayCanvas.addEventListener("pointerup", handlePointerUp);
    overlayCanvas.addEventListener("pointerleave", handlePointerUp);
    overlayCanvas.addEventListener("pointercancel", handlePointerUp);
    overlayCanvas.addEventListener("pointerleave", clearCursor);
    overlayCanvas.addEventListener("pointercancel", clearCursor);

    window.addEventListener("resize", () => {
        if (!state.image) return;
        fitPreviewCanvas();
    });

    updateBrushLabel();
    updateOpacityLabel();
    updateRadiusLabel();
    syncControls();
    setCvBadge(false);

    waitForOpenCv().then(() => {
        state.isCvReady = true;
        setCvBadge(true);
        if (!state.image) {
            setStatus("ファイル待機中", "muted");
        }
        syncControls();
    });
})();
