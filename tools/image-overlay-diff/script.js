const imageAInput = document.getElementById("imageAInput");
const imageBInput = document.getElementById("imageBInput");
const opacityRange = document.getElementById("opacityRange");
const opacityValue = document.getElementById("opacityValue");
const zoomRange = document.getElementById("zoomRange");
const zoomValue = document.getElementById("zoomValue");
const showBCheck = document.getElementById("showBCheck");
const differenceCheck = document.getElementById("differenceCheck");
const offsetXRange = document.getElementById("offsetXRange");
const offsetYRange = document.getElementById("offsetYRange");
const offsetXValue = document.getElementById("offsetXValue");
const offsetYValue = document.getElementById("offsetYValue");
const offsetXMinusBtn = document.getElementById("offsetXMinusBtn");
const offsetXPlusBtn = document.getElementById("offsetXPlusBtn");
const offsetYMinusBtn = document.getElementById("offsetYMinusBtn");
const offsetYPlusBtn = document.getElementById("offsetYPlusBtn");
const fitBtn = document.getElementById("fitBtn");
const resetBtn = document.getElementById("resetBtn");

const viewerStage = document.getElementById("viewerStage");
const imageALayer = document.getElementById("imageALayer");
const imageBLayer = document.getElementById("imageBLayer");
const emptyState = document.getElementById("emptyState");
const metaInfo = document.getElementById("metaInfo");

const state = {
    imageAUrl: null,
    imageBUrl: null,
    imageAFile: null,
    imageBFile: null,
    scale: 1,
    panX: 0,
    panY: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartX: 0,
    panStartY: 0,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const revokeUrl = (url) => {
    if (url) {
        URL.revokeObjectURL(url);
    }
};

const updateStageVars = () => {
    viewerStage.style.setProperty("--scale", String(state.scale));
    viewerStage.style.setProperty("--pan-x", `${state.panX}px`);
    viewerStage.style.setProperty("--pan-y", `${state.panY}px`);
    viewerStage.style.setProperty("--offset-x", `${state.offsetX}px`);
    viewerStage.style.setProperty("--offset-y", `${state.offsetY}px`);
    viewerStage.style.setProperty("--overlay-opacity", `${Number(opacityRange.value) / 100}`);
};

const updateLabels = () => {
    opacityValue.textContent = `${opacityRange.value}%`;
    zoomValue.textContent = `${Math.round(state.scale * 100)}%`;
    offsetXValue.textContent = `${state.offsetX}px`;
    offsetYValue.textContent = `${state.offsetY}px`;
};

const updateLayerVisibility = () => {
    const hasA = Boolean(state.imageAUrl);
    const hasB = Boolean(state.imageBUrl);

    imageALayer.classList.toggle("is-hidden", !hasA);
    imageBLayer.classList.toggle("is-hidden", !hasB || !showBCheck.checked);
    imageBLayer.classList.toggle("is-difference", differenceCheck.checked);

    emptyState.style.display = hasA || hasB ? "none" : "grid";
};

const updateMeta = () => {
    const fileA = state.imageAFile ? state.imageAFile.name : "未選択";
    const fileB = state.imageBFile ? state.imageBFile.name : "未選択";
    const sizeA = imageALayer.naturalWidth && imageALayer.naturalHeight
        ? `${imageALayer.naturalWidth}x${imageALayer.naturalHeight}`
        : "-";
    const sizeB = imageBLayer.naturalWidth && imageBLayer.naturalHeight
        ? `${imageBLayer.naturalWidth}x${imageBLayer.naturalHeight}`
        : "-";

    metaInfo.textContent = `A: ${fileA} (${sizeA}) / B: ${fileB} (${sizeB})`;
};

const resetPanAndOffsets = () => {
    state.panX = 0;
    state.panY = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    offsetXRange.value = "0";
    offsetYRange.value = "0";
    updateLabels();
    updateStageVars();
};

const getReferenceSize = () => {
    const widths = [imageALayer.naturalWidth, imageBLayer.naturalWidth].filter(Boolean);
    const heights = [imageALayer.naturalHeight, imageBLayer.naturalHeight].filter(Boolean);
    if (!widths.length || !heights.length) {
        return null;
    }
    return {
        width: Math.max(...widths),
        height: Math.max(...heights),
    };
};

const fitToStage = () => {
    const size = getReferenceSize();
    if (!size) {
        return;
    }
    const stageRect = viewerStage.getBoundingClientRect();
    const fitScale = Math.min(stageRect.width / size.width, stageRect.height / size.height);
    state.scale = clamp(fitScale, 0.1, 4);
    zoomRange.value = String(Math.round(state.scale * 100));
    state.panX = 0;
    state.panY = 0;
    updateLabels();
    updateStageVars();
};

const loadImage = (file, target) => {
    if (!file) {
        return;
    }
    const oldUrlKey = target === "A" ? "imageAUrl" : "imageBUrl";
    const oldFileKey = target === "A" ? "imageAFile" : "imageBFile";
    const layer = target === "A" ? imageALayer : imageBLayer;

    revokeUrl(state[oldUrlKey]);
    const nextUrl = URL.createObjectURL(file);
    state[oldUrlKey] = nextUrl;
    state[oldFileKey] = file;
    layer.src = nextUrl;

    layer.onload = () => {
        updateLayerVisibility();
        updateMeta();
        fitToStage();
    };
};

const zoomBy = (deltaY) => {
    const currentPercent = Number(zoomRange.value);
    const step = deltaY > 0 ? -8 : 8;
    const nextPercent = clamp(currentPercent + step, 10, 400);
    zoomRange.value = String(nextPercent);
    state.scale = nextPercent / 100;
    updateLabels();
    updateStageVars();
};

const nudgeOffset = (axis, delta) => {
    if (axis === "x") {
        state.offsetX = clamp(state.offsetX + delta, -400, 400);
        offsetXRange.value = String(state.offsetX);
    } else {
        state.offsetY = clamp(state.offsetY + delta, -400, 400);
        offsetYRange.value = String(state.offsetY);
    }
    updateLabels();
    updateStageVars();
};

imageAInput.addEventListener("change", (event) => {
    loadImage(event.target.files[0], "A");
});

imageBInput.addEventListener("change", (event) => {
    loadImage(event.target.files[0], "B");
});

opacityRange.addEventListener("input", () => {
    updateLabels();
    updateStageVars();
});

zoomRange.addEventListener("input", () => {
    state.scale = Number(zoomRange.value) / 100;
    updateLabels();
    updateStageVars();
});

showBCheck.addEventListener("change", updateLayerVisibility);
differenceCheck.addEventListener("change", updateLayerVisibility);

offsetXRange.addEventListener("input", () => {
    state.offsetX = Number(offsetXRange.value);
    updateLabels();
    updateStageVars();
});

offsetYRange.addEventListener("input", () => {
    state.offsetY = Number(offsetYRange.value);
    updateLabels();
    updateStageVars();
});

offsetXMinusBtn.addEventListener("click", () => nudgeOffset("x", -1));
offsetXPlusBtn.addEventListener("click", () => nudgeOffset("x", 1));
offsetYMinusBtn.addEventListener("click", () => nudgeOffset("y", -1));
offsetYPlusBtn.addEventListener("click", () => nudgeOffset("y", 1));

fitBtn.addEventListener("click", fitToStage);

resetBtn.addEventListener("click", () => {
    state.scale = 1;
    zoomRange.value = "100";
    resetPanAndOffsets();
    updateLabels();
    updateStageVars();
});

viewerStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomBy(event.deltaY);
}, { passive: false });

viewerStage.addEventListener("pointerdown", (event) => {
    viewerStage.focus();
    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.panStartX = state.panX;
    state.panStartY = state.panY;
    viewerStage.setPointerCapture(event.pointerId);
});

viewerStage.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
        return;
    }
    state.panX = state.panStartX + (event.clientX - state.dragStartX);
    state.panY = state.panStartY + (event.clientY - state.dragStartY);
    updateStageVars();
});

viewerStage.addEventListener("pointerup", (event) => {
    state.dragging = false;
    if (viewerStage.hasPointerCapture(event.pointerId)) {
        viewerStage.releasePointerCapture(event.pointerId);
    }
});

viewerStage.addEventListener("pointercancel", (event) => {
    state.dragging = false;
    if (viewerStage.hasPointerCapture(event.pointerId)) {
        viewerStage.releasePointerCapture(event.pointerId);
    }
});

window.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : "";
    const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
    if (isTyping || !state.imageBUrl) {
        return;
    }

    const unit = event.shiftKey ? 10 : 1;
    let handled = true;

    if (event.key === "ArrowLeft") {
        state.offsetX -= unit;
    } else if (event.key === "ArrowRight") {
        state.offsetX += unit;
    } else if (event.key === "ArrowUp") {
        state.offsetY -= unit;
    } else if (event.key === "ArrowDown") {
        state.offsetY += unit;
    } else {
        handled = false;
    }

    if (handled) {
        event.preventDefault();
        state.offsetX = clamp(state.offsetX, -400, 400);
        state.offsetY = clamp(state.offsetY, -400, 400);
        offsetXRange.value = String(state.offsetX);
        offsetYRange.value = String(state.offsetY);
        updateLabels();
        updateStageVars();
    }
});

window.addEventListener("beforeunload", () => {
    revokeUrl(state.imageAUrl);
    revokeUrl(state.imageBUrl);
});

updateLabels();
updateLayerVisibility();
updateMeta();
updateStageVars();
