// ============================================
// Firebase Initialization - Import from firebase.js
// ============================================
import { auth, db } from "./firebase.js";

// ✅ FIXED IMPORTS (MAIN ISSUE)
import { 
  getDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  setDoc, 
  getDocs, 
  collection, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import * as Auth from './auth.js';

window.db = db;
window.auth = auth;
window.Auth = Auth;


// ============================================
// VARIABLES
// ============================================
let videoStream = null;


// ============================================
// MODE SWITCHING
// ============================================
function selectMode(mode) {
  console.log("MODE CLICKED:", mode);

  document.getElementById("modeSelection").style.display = "none";

  if (mode === "qr") {
    document.getElementById("cameraMode").style.display = "block";
    initCamera();
  } else {
    document.getElementById("manualMode").style.display = "block";
  }
}

function backToMode() {
  stopCamera();

  document.getElementById("modeSelection").style.display = "block";
  document.getElementById("cameraMode").style.display = "none";
  document.getElementById("manualMode").style.display = "none";
}


// ============================================
// CAMERA FUNCTIONS
// ============================================
async function initCamera() {
  try {
    const video = document.getElementById("video");

    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    video.srcObject = videoStream;
    await video.play();

    console.log("✅ Camera started");

    scanQRCode();

  } catch (err) {
    console.error("❌ Camera error:", err);
    alert("Camera access denied or not available");
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
}


// ============================================
// QR SCANNING
// ============================================
function scanQRCode() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  function scan() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code) {
        console.log("QR FOUND:", code.data);
        handleScan(code.data);
        return;
      }
    }

    requestAnimationFrame(scan);
  }

  scan();
}


// ============================================
// HANDLE SCAN RESULT
// ============================================
function handleScan(data) {
  stopCamera();

  alert("Scanned: " + data);

  // 👉 Your existing ticket validation logic continues here
}


// ============================================
// MANUAL ENTRY
// ============================================
function processManualEntry(event) {
  event.preventDefault();

  const ticketId = document.getElementById("ticketIdInput").value.trim();
  const qrData = document.getElementById("qrCodeInput").value.trim();

  if (!ticketId && !qrData) {
    alert("Enter ticket data");
    return;
  }

  handleScan(ticketId || qrData);
}


// ============================================
// MAKE FUNCTIONS GLOBAL (IMPORTANT FIX)
// ============================================
window.selectMode = selectMode;
window.backToMode = backToMode;
window.processManualEntry = processManualEntry;
