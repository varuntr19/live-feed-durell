import {
  FilesetResolver,
  InteractiveSegmenterLegacy,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite";

const snapshotsEl = document.getElementById("snapshots");
const stampsEl = document.getElementById("stamps");
const overlay = document.getElementById("stampOverlay");
const overlayImg = document.getElementById("stampSourceImg");
const overlayHint = document.getElementById("stampHint");
const closeBtn = document.getElementById("stampCloseBtn");
const statusEl = document.getElementById("status");

const MAX_STAMP_SIDE = 360;
const STAMP_MARGIN = 22;
const PERF_RADIUS = 5;
const PERF_GAP = 15;

let segmenterPromise = null;
let statusTimeout = null;
let busy = false;

function showStatus(text, { sticky = false } = {}) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  clearTimeout(statusTimeout);
  if (!sticky) {
    statusTimeout = setTimeout(() => statusEl.classList.remove("visible"), 2500);
  }
}

function getSegmenter() {
  if (!segmenterPromise) {
    showStatus("Loading stamp model…", { sticky: true });
    segmenterPromise = FilesetResolver.forVisionTasks(WASM_BASE)
      .then((vision) =>
        InteractiveSegmenterLegacy.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL },
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })
      )
      .then((segmenter) => {
        showStatus("Tap the thing you want as your stamp.");
        return segmenter;
      })
      .catch((err) => {
        segmenterPromise = null;
        showStatus(`Couldn't load the stamp model: ${err.message}`, { sticky: true });
        throw err;
      });
  }
  return segmenterPromise;
}

function openOverlay(src) {
  overlayImg.src = src;
  overlayHint.textContent = "Tap the thing you want as your stamp";
  overlay.hidden = false;
  getSegmenter().catch(() => {});
}

function closeOverlay() {
  overlay.hidden = true;
  overlayImg.src = "";
}

// Maps a click on the (object-fit: contain) overlay image back to normalized [0,1] image coordinates.
function imageCoordsFromEvent(e) {
  const rect = overlayImg.getBoundingClientRect();
  const iw = overlayImg.naturalWidth;
  const ih = overlayImg.naturalHeight;
  if (!iw || !ih) return null;

  const boxRatio = rect.width / rect.height;
  const imgRatio = iw / ih;
  let dispW, dispH, offX, offY;
  if (imgRatio > boxRatio) {
    dispW = rect.width;
    dispH = rect.width / imgRatio;
    offX = 0;
    offY = (rect.height - dispH) / 2;
  } else {
    dispH = rect.height;
    dispW = rect.height * imgRatio;
    offY = 0;
    offX = (rect.width - dispW) / 2;
  }

  const px = e.clientX - rect.left - offX;
  const py = e.clientY - rect.top - offY;
  if (px < 0 || py < 0 || px > dispW || py > dispH) return null;
  return { x: px / dispW, y: py / dispH };
}

async function handleTap(e) {
  if (busy) return;
  const norm = imageCoordsFromEvent(e);
  if (!norm) return;

  busy = true;
  overlayHint.textContent = "Working on it…";
  try {
    const segmenter = await getSegmenter();
    const result = segmenter.segment(overlayImg, { keypoint: norm });
    const mask = result.categoryMask;
    if (!mask) throw new Error("no mask returned");

    const maskArr = mask.getAsUint8Array();
    const maskW = mask.width;
    const maskH = mask.height;
    result.close();

    const made = makeStamp(overlayImg, maskArr, maskW, maskH, norm);
    if (made) closeOverlay();
    else overlayHint.textContent = "Couldn't find an element there — try tapping directly on it.";
  } catch (err) {
    showStatus(`Couldn't make a stamp there: ${err.message}`, { sticky: true });
  } finally {
    busy = false;
  }
}

function makeStamp(img, maskArr, maskW, maskH, norm) {
  const tapX = Math.min(maskW - 1, Math.max(0, Math.round(norm.x * maskW)));
  const tapY = Math.min(maskH - 1, Math.max(0, Math.round(norm.y * maskH)));
  const label = maskArr[tapY * maskW + tapX];

  let minX = maskW, minY = maskH, maxX = -1, maxY = -1;
  for (let y = 0; y < maskH; y++) {
    const row = y * maskW;
    for (let x = 0; x < maskW; x++) {
      if (maskArr[row + x] === label) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return false;

  const padX = (maxX - minX) * 0.08 + 4;
  const padY = (maxY - minY) * 0.08 + 4;
  minX = Math.max(0, minX - padX);
  maxX = Math.min(maskW - 1, maxX + padX);
  minY = Math.max(0, minY - padY);
  maxY = Math.min(maskH - 1, maxY + padY);

  const scaleX = img.naturalWidth / maskW;
  const scaleY = img.naturalHeight / maskH;
  const sx = minX * scaleX;
  const sy = minY * scaleY;
  const sw = (maxX - minX) * scaleX;
  const sh = (maxY - minY) * scaleY;

  const scale = Math.min(1, MAX_STAMP_SIDE / Math.max(sw, sh));
  const cropW = Math.max(1, Math.round(sw * scale));
  const cropH = Math.max(1, Math.round(sh * scale));

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, cropW, cropH);

  // Build a same-resolution-as-mask alpha map, then scale it onto the crop
  // with smoothing so the cutout edge anti-aliases instead of looking blocky.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskW;
  maskCanvas.height = maskH;
  const maskCtx = maskCanvas.getContext("2d");
  const maskImageData = maskCtx.createImageData(maskW, maskH);
  for (let i = 0; i < maskArr.length; i++) {
    maskImageData.data[i * 4 + 3] = maskArr[i] === label ? 255 : 0;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  cropCtx.globalCompositeOperation = "destination-in";
  cropCtx.imageSmoothingEnabled = true;
  cropCtx.drawImage(maskCanvas, minX, minY, maxX - minX, maxY - minY, 0, 0, cropW, cropH);
  cropCtx.globalCompositeOperation = "source-over";

  renderStampCanvas(cropCanvas);
  return true;
}

function renderStampCanvas(subjectCanvas) {
  const w = subjectCanvas.width + STAMP_MARGIN * 2;
  const h = subjectCanvas.height + STAMP_MARGIN * 2;

  const stamp = document.createElement("canvas");
  stamp.width = w;
  stamp.height = h;
  const ctx = stamp.getContext("2d");

  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(subjectCanvas, STAMP_MARGIN, STAMP_MARGIN);

  ctx.strokeStyle = "rgba(20, 20, 20, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    STAMP_MARGIN - 0.5,
    STAMP_MARGIN - 0.5,
    subjectCanvas.width + 1,
    subjectCanvas.height + 1
  );

  punchPerforations(ctx, w, h);

  addStampToStrip(stamp.toDataURL("image/png"));
}

// Cuts semicircular notches around the outer edge, the classic postage-stamp perforation look.
function punchPerforations(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";

  const drawRow = (yEdge) => {
    for (let x = PERF_GAP / 2; x < w; x += PERF_GAP) {
      ctx.beginPath();
      ctx.arc(x, yEdge, PERF_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const drawCol = (xEdge) => {
    for (let y = PERF_GAP / 2; y < h; y += PERF_GAP) {
      ctx.beginPath();
      ctx.arc(xEdge, y, PERF_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawRow(0);
  drawRow(h);
  drawCol(0);
  drawCol(w);
  ctx.restore();
}

function addStampToStrip(dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `stamp-${Math.random().toString(36).slice(2)}.png`;
  link.className = "stamp-link";
  link.title = "Tap to save";
  link.style.setProperty("--tilt", `${(Math.random() * 8 - 4).toFixed(1)}deg`);

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Your stamp";
  link.appendChild(img);
  stampsEl.prepend(link);

  showStatus("Stamp ready — tap it to save.");
}

snapshotsEl.addEventListener("click", (e) => {
  if (e.target.tagName === "IMG") openOverlay(e.target.src);
});
overlayImg.addEventListener("click", handleTap);
closeBtn.addEventListener("click", closeOverlay);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeOverlay();
});
