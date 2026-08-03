const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraSelect = document.getElementById("cameraSelect");
const filterSelect = document.getElementById("filterSelect");
const toggleBtn = document.getElementById("toggleBtn");
const flipBtn = document.getElementById("flipBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const statusEl = document.getElementById("status");
const snapshotsEl = document.getElementById("snapshots");

const FILTERS = [
  { name: "Normal", css: "none" },
  { name: "Noir", css: "grayscale(1) contrast(1.3) brightness(0.9)" },
  { name: "Mono", css: "grayscale(1)" },
  { name: "Sepia", css: "sepia(0.75) saturate(1.3) contrast(1.05)" },
  { name: "Vintage", css: "sepia(0.35) contrast(1.1) brightness(1.05) saturate(1.35)" },
  { name: "Cool", css: "hue-rotate(180deg) saturate(1.4)" },
  { name: "Warm", css: "hue-rotate(-20deg) saturate(1.3) brightness(1.05)" },
  { name: "Vivid", css: "saturate(2) contrast(1.15)" },
  { name: "Dream", css: "brightness(1.1) contrast(0.9) saturate(1.2) blur(0.5px)" },
  { name: "Invert", css: "invert(1)" },
];

let currentStream = null;
let currentFacingMode = null;
let statusTimeout = null;
let currentFilterCss = FILTERS[0].css;

function showStatus(text, { sticky = false } = {}) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  clearTimeout(statusTimeout);
  if (!sticky) {
    statusTimeout = setTimeout(() => statusEl.classList.remove("visible"), 2500);
  }
}

function populateFilters() {
  FILTERS.forEach((filter, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = filter.name;
    filterSelect.appendChild(option);
  });
}
populateFilters();

function applyFilter(index) {
  currentFilterCss = FILTERS[index].css;
  video.style.filter = currentFilterCss;
}

function stopTracksOnly() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

function applyMirror(facingMode) {
  video.classList.toggle("mirror", facingMode !== "environment");
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");

  cameraSelect.innerHTML = "";
  cameras.forEach((cam, i) => {
    const option = document.createElement("option");
    option.value = cam.deviceId;
    option.textContent = cam.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(option);
  });
  // Only show the picker when it's actually useful (e.g. multiple laptop webcams);
  // front/back on phones is handled by the flip button instead.
  cameraSelect.hidden = cameras.length < 2;
}

async function startCamera({ facingMode } = {}) {
  try {
    const deviceId = cameraSelect.value;
    const constraints = facingMode
      ? { video: { facingMode: { ideal: facingMode } }, audio: false }
      : { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };

    stopTracksOnly();
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    const settings = currentStream.getVideoTracks()[0].getSettings();
    currentFacingMode = settings.facingMode || facingMode || null;
    applyMirror(currentFacingMode);

    await listCameras();
    if (settings.deviceId) cameraSelect.value = settings.deviceId;

    toggleBtn.textContent = "Stop";
    toggleBtn.title = "Stop camera";
    flipBtn.disabled = false;
    snapshotBtn.disabled = false;
    showStatus("Camera live.");
  } catch (err) {
    showStatus(`Could not access camera: ${err.message}`, { sticky: true });
  }
}

function stopCamera() {
  stopTracksOnly();
  video.srcObject = null;

  toggleBtn.textContent = "Start";
  toggleBtn.title = "Start camera";
  flipBtn.disabled = true;
  snapshotBtn.disabled = true;
  showStatus("Camera stopped.");
}

function toggleCamera() {
  if (currentStream) {
    stopCamera();
  } else {
    startCamera();
  }
}

function flipCamera() {
  const nextFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  startCamera({ facingMode: nextFacingMode });
}

function takeSnapshot() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.filter = currentFilterCss; // bake the active filter into the snapshot
  if (video.classList.contains("mirror")) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // match the mirrored preview
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.title = "Tap to turn into a stamp";
  snapshotsEl.prepend(img);
  showStatus("Snapshot saved — tap it to make a stamp.");
}

toggleBtn.addEventListener("click", toggleCamera);
flipBtn.addEventListener("click", flipCamera);
snapshotBtn.addEventListener("click", takeSnapshot);
cameraSelect.addEventListener("change", () => {
  if (currentStream) startCamera();
});
filterSelect.addEventListener("change", () => applyFilter(filterSelect.value));

navigator.mediaDevices
  .enumerateDevices()
  .then((devices) => {
    if (devices.some((d) => d.kind === "videoinput")) {
      listCameras();
    } else {
      showStatus("No camera found on this device.", { sticky: true });
      toggleBtn.disabled = true;
    }
  })
  .catch(() => {
    showStatus("Camera access is not available in this browser.", { sticky: true });
    toggleBtn.disabled = true;
  });
