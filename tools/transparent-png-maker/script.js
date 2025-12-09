const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileName = document.getElementById("fileName");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const distanceMethodSelect = document.getElementById("distanceMethod");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasFrame = document.getElementById("canvasFrame");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const viewResetBtn = document.getElementById("viewResetBtn");
const zoomDisplay = document.getElementById("zoomDisplay");
const selectedColorChip = document.getElementById("selectedColor");
const selectedColorLabel = document.getElementById("selectedColorLabel");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const helperText = document.getElementById("helperText");

let img = null;
let targetColor = null;
const targetSpaces = {
  hsv: null,
  lab: null,
};
const viewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};
const MIN_ZOOM = 0.1;
const DEFAULT_MAX_ZOOM = 8;
let dynamicMaxZoom = DEFAULT_MAX_ZOOM;
const ZOOM_STEP = 0.2;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let hasPanned = false;
let suppressClick = false;

const Status = {
  idle: "idle",
  ready: "ready",
  applied: "applied",
  error: "error",
};

const DistanceMethod = {
  rgbEuclidean: "rgb-euclidean",
  weightedRgb: "weighted-rgb",
  manhattan: "manhattan",
  chebyshev: "chebyshev",
  hsv: "hsv",
  lab: "lab",
};

const WEIGHTED_RGB_WEIGHTS = {
  r: 0.299,
  g: 0.587,
  b: 0.114,
};

function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function rgbToLab(r, g, b) {
  const pivotRgb = (value) =>
    value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
  const rn = pivotRgb(r / 255);
  const gn = pivotRgb(g / 255);
  const bn = pivotRgb(b / 255);

  const x = (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) * 100;
  const y = (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) * 100;
  const z = (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) * 100;

  const refX = 95.047;
  const refY = 100;
  const refZ = 108.883;

  const pivotLab = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);

  const fx = pivotLab(x / refX);
  const fy = pivotLab(y / refY);
  const fz = pivotLab(z / refZ);

  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return { l, a, b: bVal };
}

function createDistanceCalculator(method) {
  const tr = targetColor.r;
  const tg = targetColor.g;
  const tb = targetColor.b;

  const targetHsv = targetSpaces.hsv || rgbToHsv(tr, tg, tb);
  const targetLab = targetSpaces.lab || rgbToLab(tr, tg, tb);

  switch (method) {
    case DistanceMethod.weightedRgb:
      return (r, g, b) => {
        const dr = r - tr;
        const dg = g - tg;
        const db = b - tb;
        return Math.sqrt(
          WEIGHTED_RGB_WEIGHTS.r * dr * dr +
            WEIGHTED_RGB_WEIGHTS.g * dg * dg +
            WEIGHTED_RGB_WEIGHTS.b * db * db
        );
      };
    case DistanceMethod.manhattan:
      return (r, g, b) => Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb);
    case DistanceMethod.chebyshev:
      return (r, g, b) => Math.max(Math.abs(r - tr), Math.abs(g - tg), Math.abs(b - tb));
    case DistanceMethod.hsv:
      return (r, g, b) => {
        const { h, s, v } = rgbToHsv(r, g, b);
        const dh = hueDistance(targetHsv.h, h);
        const ds = (s - targetHsv.s) * 100;
        const dv = (v - targetHsv.v) * 100;
        return Math.sqrt(dh * dh + ds * ds + dv * dv);
      };
    case DistanceMethod.lab:
      return (r, g, b) => {
        const { l, a, b: labB } = rgbToLab(r, g, b);
        const dl = l - targetLab.l;
        const da = a - targetLab.a;
        const db = labB - targetLab.b;
        return Math.sqrt(dl * dl + da * da + db * db);
      };
    case DistanceMethod.rgbEuclidean:
    default:
      return (r, g, b) => {
        const dr = r - tr;
        const dg = g - tg;
        const db = b - tb;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };
  }
}

function clampZoom(value) {
  return Math.min(dynamicMaxZoom, Math.max(MIN_ZOOM, value));
}

function setZoomControlsEnabled(enabled) {
  zoomInBtn.disabled = !enabled;
  zoomOutBtn.disabled = !enabled;
  viewResetBtn.disabled = !enabled;
}

function updateZoomDisplay() {
  zoomDisplay.textContent = `${Math.round(viewState.zoom * 100)}%`;
}

function applyViewTransform() {
  canvas.style.transform = `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`;
  updateZoomDisplay();
}

function centerView(nextZoom = viewState.zoom) {
  if (!img || !canvasFrame) return;
  const frameRect = canvasFrame.getBoundingClientRect();
  viewState.zoom = clampZoom(nextZoom);
  const scaledWidth = canvas.width * viewState.zoom;
  const scaledHeight = canvas.height * viewState.zoom;
  viewState.panX = (frameRect.width - scaledWidth) / 2;
  viewState.panY = (frameRect.height - scaledHeight) / 2;
  applyViewTransform();
}

function setInitialView() {
  if (!img || !canvasFrame) return;
  const frameRect = canvasFrame.getBoundingClientRect();
  const fitScale = Math.min(frameRect.width / img.width, frameRect.height / img.height) || 1;
  const initialZoom = Math.max(MIN_ZOOM, fitScale);
  dynamicMaxZoom = Math.max(DEFAULT_MAX_ZOOM, initialZoom * 2);
  centerView(initialZoom);
}

function setZoom(nextZoom, anchor) {
  if (!img || !canvasFrame) return;
  const frameRect = canvasFrame.getBoundingClientRect();
  const pointer = anchor || {
    clientX: frameRect.left + frameRect.width / 2,
    clientY: frameRect.top + frameRect.height / 2,
  };
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    centerView(nextZoom);
    return;
  }

  const targetZoom = clampZoom(nextZoom);
  const imageX = ((pointer.clientX - rect.left) / rect.width) * canvas.width;
  const imageY = ((pointer.clientY - rect.top) / rect.height) * canvas.height;

  viewState.zoom = targetZoom;
  viewState.panX = pointer.clientX - frameRect.left - imageX * viewState.zoom;
  viewState.panY = pointer.clientY - frameRect.top - imageY * viewState.zoom;
  applyViewTransform();
}

function setStatus(message, state = Status.idle) {
  statusLabel.textContent = message;
  const colorMap = {
    [Status.idle]: "var(--muted)",
    [Status.ready]: "var(--accent)",
    [Status.applied]: "var(--accent-strong)",
    [Status.error]: "#fda4af",
  };
  statusDot.style.background = colorMap[state] || "var(--muted)";
}

function setSelectedColor(color) {
  if (!color) {
    selectedColorChip.style.background = "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))";
    selectedColorLabel.textContent = "未選択";
    targetColor = null;
    targetSpaces.hsv = null;
    targetSpaces.lab = null;
    downloadBtn.disabled = true;
    return;
  }

  const { r, g, b } = color;
  selectedColorChip.style.background = `rgb(${r}, ${g}, ${b})`;
  selectedColorLabel.textContent = `RGB(${r}, ${g}, ${b})`;
  targetColor = color;
  targetSpaces.hsv = rgbToHsv(r, g, b);
  targetSpaces.lab = rgbToLab(r, g, b);
}

function handleFiles(files) {
  const file = files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("画像ファイルを選択してください。", Status.error);
    return;
  }

  fileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    loadImage(event.target.result);
  };
  reader.readAsDataURL(file);
}

function loadImage(src) {
  const image = new Image();
  image.onload = () => {
    img = image;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.imageSmoothingEnabled = true;

    setSelectedColor(null);
    resetBtn.disabled = false;
    setZoomControlsEnabled(true);
    setInitialView();
    helperText.textContent = "画像をクリックで透過色指定、ドラッグで移動、ホイールでズームできます。";
    setStatus("透過したい色をクリックしてください。", Status.ready);
  };
  image.onerror = () => {
    setStatus("画像の読み込みに失敗しました。", Status.error);
    setZoomControlsEnabled(false);
  };
  image.src = src;
}

function applyTransparency() {
  if (!img || !targetColor) return;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const t = Number(thresholdInput.value);
  const method = distanceMethodSelect?.value || DistanceMethod.rgbEuclidean;
  const distance = createDistanceCalculator(method);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = distance(r, g, b);

    if (dist <= t) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  downloadBtn.disabled = false;
  setStatus("透過処理を適用しました。", Status.applied);
  helperText.textContent = "別の色をクリックすると再計算します。ドラッグで移動、ホイールでズームできます。";
}

function resetImage() {
  if (!img) return;
  ctx.drawImage(img, 0, 0);
  setSelectedColor(null);
  helperText.textContent = "画像をクリックで透過色指定、ドラッグで移動、ホイールでズームできます。";
  setStatus("元の画像に戻しました。色を選択してください。", Status.ready);
}

// Event bindings
fileSelect.addEventListener("click", (e) => {
  // Prevent bubbling to the drop zone so the file dialog doesn't open twice
  e.stopPropagation();
  // Clear value so picking the same file again still triggers change
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = thresholdInput.value;
  if (img && targetColor) {
    applyTransparency();
  }
});

distanceMethodSelect.addEventListener("change", () => {
  if (img && targetColor) {
    applyTransparency();
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("is-dragover");
  const files = e.dataTransfer?.files;
  handleFiles(files);
});

dropZone.addEventListener("click", () => {
  // Clear value so picking the same file again still triggers change
  fileInput.value = "";
  fileInput.click();
});

canvasFrame.addEventListener(
  "wheel",
  (e) => {
    if (!img) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + ZOOM_STEP * delta;
    setZoom(viewState.zoom * factor, { clientX: e.clientX, clientY: e.clientY });
  },
  { passive: false }
);

canvasFrame.addEventListener("mousedown", (e) => {
  if (!img || e.button !== 0) return;
  isPanning = true;
  hasPanned = false;
  panStart = { x: e.clientX - viewState.panX, y: e.clientY - viewState.panY };
  canvas.classList.add("is-panning");
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  viewState.panX = e.clientX - panStart.x;
  viewState.panY = e.clientY - panStart.y;
  hasPanned = true;
  applyViewTransform();
});

window.addEventListener("mouseup", () => {
  if (!isPanning) return;
  isPanning = false;
  canvas.classList.remove("is-panning");
  if (hasPanned) {
    suppressClick = true;
  }
});

canvas.addEventListener("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (!img) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  const pixel = ctx.getImageData(x, y, 1, 1).data;
  setSelectedColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
  applyTransparency();
});

downloadBtn.addEventListener("click", () => {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "transparent.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

resetBtn.addEventListener("click", resetImage);

zoomInBtn.addEventListener("click", () => setZoom(viewState.zoom * (1 + ZOOM_STEP)));
zoomOutBtn.addEventListener("click", () => setZoom(viewState.zoom * (1 - ZOOM_STEP)));
viewResetBtn.addEventListener("click", setInitialView);

window.addEventListener("resize", () => {
  if (!img) return;
  const frameRect = canvasFrame?.getBoundingClientRect();
  const fitScale =
    frameRect && img ? Math.min(frameRect.width / img.width, frameRect.height / img.height) || 1 : 1;
  dynamicMaxZoom = Math.max(DEFAULT_MAX_ZOOM, fitScale * 2);
  centerView(clampZoom(viewState.zoom));
});

setZoomControlsEnabled(false);
setStatus("画像を読み込んでください。", Status.idle);
