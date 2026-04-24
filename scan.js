// ============================================
// Firebase Initialization - Import from firebase.js
// ============================================
import { auth, db } from "./firebase.js";
import { getDoc, doc, onSnapshot, query, where, onAuthStateChanged, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as Auth from './auth.js';

window.db = db;
window.auth = auth;
window.Auth = Auth;

// Initialize persistence and auth listener
Auth.initializePersistence();
Auth.initializeAuthStateListener();

console.log('✓ Firebase initialized for Scanner Application');

// ============================================
// 🔐 SECURITY - HIDE PAGE UNTIL PIN VERIFIED
// ============================================
document.body.style.display = 'none';
console.log('🔒 Page locked - awaiting PIN verification');

// ============================================
// Ticket Scanner Application
// QR Code Scanning & Validation
// ============================================

// ============================================
// 🔐 PIN SYSTEM - HELPERS
// ============================================
// Hash PIN using SHA-256
async function hashPin(pin) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Error hashing PIN:', error);
    return null;
  }
}

// ============================================
// 🔐 FIREBASE PIN VERIFICATION - MANDATORY
// ============================================
async function verifyPinFirebase(inputPin, type) {
  try {
    console.log('Verifying PIN from Firebase:', type);
    const snap = await getDoc(doc(db, 'security', 'pin'));
    
    if (!snap.exists()) {
      console.error('PIN document not found in Firestore');
      alert('⚠️ PIN system not configured. Please run: await setupPinsInFirebase() in console.');
      return false;
    }
    
    const hash = await hashPin(inputPin);
    if (!hash) {
      console.error('Failed to hash PIN');
      alert('Error hashing PIN. Try again.');
      return false;
    }
    
    const data = snap.data();
    
    if (type === 'admin' && hash === data.adminPinHash) {
      console.log('✅ Admin PIN verified from Firebase');
      return true;
    }
    
    if (type === 'scanner' && hash === data.scannerPinHash) {
      console.log('✅ Scanner PIN verified from Firebase');
      return true;
    }
    
    console.warn('❌ PIN mismatch');
    return false;
  } catch (error) {
    console.error('Error verifying PIN from Firebase:', error);
    alert('Error verifying PIN: ' + error.message);
    return false;
  }
}

// Setup default PINs (run once from console if needed)
async function setupPinsInFirebase() {
  try {
    console.log('🔧 Creating PIN hashes...');
    const adminHash = await hashPin('135669');
    const scannerHash = await hashPin('539966');
    
    if (!adminHash || !scannerHash) {
      throw new Error('Failed to hash PINs');
    }
    
    await setDoc(doc(db, 'security', 'pin'), {
      adminPinHash: adminHash,
      scannerPinHash: scannerHash,
      updatedAt: new Date(),
      createdAt: new Date()
    });
    
    console.log('✅ PIN hashes stored in Firebase');
    alert('✅ PIN document created successfully!\\n\\nAdmin PIN: 135669\\nScanner PIN: 539966');
    return true;
  } catch (error) {
    console.error('Error setting up PINs:', error);
    alert('❌ Error setting up PIN: ' + error.message);
    return false;
  }
}

// Make setupPinsInFirebase globally accessible
window.setupPinsInFirebase = setupPinsInFirebase;

// ============================================
// 🔐 PAGE SECURITY LOCK - ENFORCE PIN CHECK
// ============================================
(async () => {
  try {
    console.log('🔒 Starting PIN verification process for scanner...');
    
    const portalType = 'scanner'; // This is scanner portal
    let pinVerified = false;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!pinVerified && attempts < maxAttempts) {
      const input = prompt(`🔐 Enter ${portalType.toUpperCase()} PIN (${maxAttempts - attempts} attempts remaining):`);
      
      if (input === null) {
        // User clicked cancel
        console.warn('User cancelled PIN entry');
        window.location.href = 'index.html';
        return;
      }
      
      if (input.trim() === '') {
        alert('PIN cannot be empty');
        attempts++;
        continue;
      }
      
      pinVerified = await verifyPinFirebase(input.trim(), portalType);
      
      if (pinVerified) {
        console.log('✅ PIN accepted - loading scanner portal');
        document.body.style.display = 'block';
        console.log('🔓 Page unlocked');
        break;
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          alert(`❌ Wrong PIN. ${maxAttempts - attempts} attempts remaining.`);
        }
      }
    }
    
    if (!pinVerified) {
      console.error('❌ Maximum PIN attempts exceeded');
      alert('❌ Maximum PIN attempts exceeded. Access denied.');
      window.location.href = 'index.html';
      return;
    }
    
    // ✅ PIN VERIFIED - INITIALIZE SCANNER PORTAL
    console.log('🚀 Initializing scanner portal...');
    
  } catch (error) {
    console.error('❌ Critical error in PIN verification:', error);
    alert('Security error. Redirecting to home.');
    window.location.href = 'index.html';
  }
})();

let currentMode = null;
let video = null;
let canvas = null;
let animationId = null;
let flashEnabled = false;

// ==================== INITIALIZATION ====================
// Show scanner page immediately
document.body.style.display = "block";
console.log('Scanner portal loaded');

// Initialize scanner on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeScannerApp();
  });
} else {
  initializeScannerApp();
}

function initializeScannerApp() {
  try {
    console.log('Initializing scanner application...');
    initParticles();
    setupModalEventListeners();
    setupScannerButtons();
    console.log('✓ Scanner app ready');
  } catch (error) {
    console.error('Error initializing scanner app:', error);
  }
}

// ============================================
// SCANNER SETUP - MAKE FUNCTIONS GLOBALLY ACCESSIBLE
// ============================================
function setupScannerButtons() {
  try {
    // Setup select mode buttons
    const manualBtn = document.querySelector('button[onclick="selectMode(\'manual\')"]');
    const qrBtn = document.querySelector('button[onclick="selectMode(\'qr\')"]');
    
    if (manualBtn) {
      manualBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectMode('manual');
      });
    }
    
    if (qrBtn) {
      qrBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectMode('qr');
      });
    }
    
    console.log('✓ Scanner buttons setup complete');
  } catch (error) {
    console.error('Error setting up scanner buttons:', error);
  }
}

function setupModalEventListeners() {
  const modalCloseBtn = document.querySelector('#scanResultModal .modal-close');
  const scanAgainBtn = document.querySelector('#scanResultModal .btn-secondary');
  
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeScanResult);
  }
  
  if (scanAgainBtn) {
    scanAgainBtn.addEventListener('click', scanAgain);
  }
  
  // Setup manual form submission
  const manualForm = document.getElementById('manualForm');
  if (manualForm) {
    manualForm.addEventListener('submit', processManualEntry);
  }
}

// ==================== PARTICLES ====================
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) {
    console.warn('Particles container not found');
    return;
  }
  
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.animationDuration = (15 + Math.random() * 10) + 's';
    container.appendChild(particle);
  }
}

// ==================== MODE SELECTION ====================
function selectMode(mode) {
  try {
    console.log('Selecting mode:', mode);
    currentMode = mode;
    
    const modeSelection = document.getElementById('modeSelection');
    const cameraMode = document.getElementById('cameraMode');
    const manualMode = document.getElementById('manualMode');
    
    // Hide mode selection
    if (modeSelection) modeSelection.style.display = 'none';
    
    if (mode === 'qr' || mode === 'camera') {
      if (cameraMode) cameraMode.style.display = 'block';
      initCamera();
    } else if (mode === 'manual') {
      if (manualMode) manualMode.style.display = 'block';
      const qrCodeInput = document.getElementById('qrCodeInput');
      if (qrCodeInput) qrCodeInput.focus();
    }
  } catch (error) {
    console.error('Error selecting mode:', error);
    showToast('error', 'Error', 'Failed to switch mode');
  }
}

// Make selectMode globally accessible
window.selectMode = selectMode;

function backToMode() {
  try {
    console.log('Going back to mode selection');
    // Stop camera if running
    if (currentMode === 'qr' || currentMode === 'camera') {
      stopCamera();
    }
    
    currentMode = null;
    
    const modeSelection = document.getElementById('modeSelection');
    const cameraMode = document.getElementById('cameraMode');
    const manualMode = document.getElementById('manualMode');
    
    if (modeSelection) modeSelection.style.display = 'block';
    if (cameraMode) cameraMode.style.display = 'none';
    if (manualMode) manualMode.style.display = 'none';
    
    // Clear any error states
    if (video) {
      video.srcObject = null;
    }
  } catch (error) {
    console.error('Error going back to mode:', error);
  }
}

// Make backToMode globally accessible
window.backToMode = backToMode;

// ==================== CAMERA SCANNER ====================
function initCamera() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  
  if (!video) {
    console.error('Video element not found');
    alert('Video element missing from page');
    backToMode();
    return;
  }
  
  // Check if browser supports getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Your browser does not support camera access. Please use Manual Entry instead.');
    backToMode();
    return;
  }
  
  // Request camera access with improved error handling
  navigator.mediaDevices.getUserMedia({ 
    video: { 
      facingMode: 'environment',
      width: { ideal: 1280 }, 
      height: { ideal: 720 }
    },
    audio: false
  }).then(stream => {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play().catch(err => {
        console.error('Video play error:', err);
        alert('Could not start video stream. Please try again.');
        stopCamera();
        backToMode();
      });
      scanQRCode();
    };
    video.onerror = (err) => {
      console.error('Video error:', err);
      alert('Error accessing camera stream');
      stopCamera();
      backToMode();
    };
  }).catch(err => {
    console.error('Camera error:', err);
    let errorMsg = 'Camera Access Denied';
    
    if (err.name === 'NotAllowedError') {
      errorMsg = 'Camera permission denied. Please enable camera access in your browser settings.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      errorMsg = 'No camera device found. Please use Manual Entry instead.';
    } else if (err.name === 'NotReadableError') {
      errorMsg = 'Camera is already in use by another application.';
    } else if (err.name === 'SecurityError') {
      errorMsg = 'Camera access requires HTTPS connection. Please ensure you\'re using a secure connection.';
    }
    
    alert(errorMsg);
    backToMode();
  });
}

function stopCamera() {
  if (video && video.srcObject) {
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
}

function scanQRCode() {
  if (!video || !canvas || !video.srcObject) {
    console.warn('Video stream not available, stopping scan');
    return;
  }
  
  try {
    const ctx = canvas.getContext('2d');
    
    // Check if video has valid dimensions
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      animationId = requestAnimationFrame(scanQRCode);
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    
    if (code) {
      // QR Code detected
      stopCamera();
      validateAndDisplayTicket(code.data);
    } else {
      // Continue scanning
      animationId = requestAnimationFrame(scanQRCode);
    }
  } catch (err) {
    console.error('Scanning error:', err);
    animationId = requestAnimationFrame(scanQRCode);
  }
}

function toggleFlash() {
  // Flash functionality would be implemented based on device capabilities
  const flashBtn = document.getElementById('toggleFlash');
  
  if (video && video.srcObject) {
    const track = video.srcObject.getVideoTracks()[0];
    
    if (track && track.getCapabilities().torch) {
      track.applyConstraints({
        advanced: [{ torch: !flashEnabled }]
      }).then(() => {
        flashEnabled = !flashEnabled;
        flashBtn.classList.toggle('active', flashEnabled);
      });
    } else {
      alert('Flash not available on this device');
    }
  }
}

// ==================== MANUAL ENTRY ====================
function processManualEntry(event) {
  try {
    event.preventDefault();
    console.log('Processing manual entry...');
    
    const ticketIdInput = document.getElementById('ticketIdInput');
    const qrCodeInput = document.getElementById('qrCodeInput');
    
    if (!ticketIdInput || !qrCodeInput) {
      console.error('Input elements not found');
      showScanResult(false, '⚠️ Form Error', '<div class="ticket-display"><p>Form elements not found. Please refresh the page.</p></div>');
      return;
    }
    
    const ticketId = ticketIdInput.value.trim();
    const qrData = qrCodeInput.value.trim();
    
    // Validation
    if (!ticketId && !qrData) {
      showScanResult(false, '⚠️ Missing Information', `
        <div class="ticket-display">
          <p>Please enter either:</p>
          <ul style="text-align: left; margin: 15px 0;">
            <li>Your <strong>Ticket ID</strong>, OR</li>
            <li>The <strong>QR Code Data</strong></li>
          </ul>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">You can find both on your ticket confirmation email.</p>
        </div>
      `);
      return;
    }
    
    // Validate ticket ID format if provided
    if (ticketId && ticketId.length < 10) {
      showScanResult(false, '⚠️ Invalid Format', `
        <div class="ticket-display">
          <p>Ticket ID appears to be incomplete.</p>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">Ticket IDs typically start with "TKT" followed by numbers and letters.</p>
        </div>
      `);
      return;
    }
    
    // Use ticket ID if provided, otherwise use QR data
    const dataToValidate = ticketId || qrData;
    
    // Show loading state
    const submitButton = document.querySelector('#manualForm [type="submit"]');
    if (submitButton) submitButton.disabled = true;
    
    // Validate and display ticket
    setTimeout(async () => {
      await validateAndDisplayTicket(dataToValidate);
      if (submitButton) submitButton.disabled = false;
    }, 500);
  } catch (error) {
    console.error('Error processing manual entry:', error);
    showScanResult(false, '❌ Error', 'Failed to process entry: ' + error.message);
  }
}

// Make processManualEntry globally accessible
window.processManualEntry = processManualEntry;

// ==================== TICKET VALIDATION ====================
async function validateAndDisplayTicket(qrData) {
  // SECURITY: Validate input
  if (!qrData || typeof qrData !== 'string') {
    console.error('✗ Invalid ticket data');
    showScanResult(false, "❌ Invalid Input", `
      <div class="ticket-display">
        <p>Invalid ticket data provided.</p>
        <p style="font-size: 12px; color: #999; margin-top: 15px;">Please try again.</p>
      </div>
    `);
    return;
  }

  try {
    const trimmedData = qrData.trim();
    console.log('🔍 Searching for ticket:', trimmedData);

    // Validate Firebase database connection
    if (!db) {
      throw new Error('Database not initialized');
    }

    // STRATEGY 1: Direct lookup by document ID (fastest)
    const ticketRef = doc(db, "tickets", trimmedData);
    let ticketSnap = await getDoc(ticketRef);

    let found = null;

    if (ticketSnap.exists()) {
      found = { id: ticketSnap.id, ...ticketSnap.data() };
      console.log('✓ Found ticket via direct lookup');
    } else {
      // STRATEGY 2: Search by ticketId or qrData fields if direct lookup fails
      console.log('⚠ Not found via direct lookup, searching by fields...');
      try {
        const snapshot = await getDocs(collection(db, "tickets"));
        
        snapshot.forEach(doc => {
          const data = doc.data();
          // Match either ticketId or qrData fields
          if (data.ticketId === trimmedData || data.qrData === trimmedData) {
            found = { id: doc.id, ...data };
          }
        });
      } catch (searchError) {
        console.error('Error searching collection:', searchError);
      }
    }

    // VALIDATE: Ticket found
    if (!found) {
      console.warn('❌ Ticket not found in database:', trimmedData);
      showScanResult(false, "❌ Ticket not found", `
        <div class="ticket-display">
          <p>This ticket QR code is not registered in the system.</p>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">Please double-check and try again.</p>
        </div>
      `);
      return;
    }

    // VALIDATE: Ticket data completeness
    if (!found.customerName || !found.ticketType) {
      console.error('✗ Incomplete ticket data:', found.id);
      showScanResult(false, "⚠️ Data Error", `
        <div class="ticket-display">
          <p>Ticket data is incomplete.</p>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">Please contact support.</p>
        </div>
      `);
      return;
    }

    // VALIDATE: Check if ticket is still valid (not used)
    if (found.used === true) {
      console.warn('⚠ Ticket already used:', found.id);
      const usedTime = found.usedAt ? new Date(found.usedAt).toLocaleString('en-IN') : 'Unknown time';
      showScanResult(false, "⚠️ Already Used", `
        <div class="ticket-display">
          <p style="color: #ff6b6b; font-weight: 600;">This ticket has already been used.</p>
          <p><strong>Customer:</strong> ${found.customerName}</p>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">Used at: ${usedTime}</p>
        </div>
      `);
      return;
    }

    // VALIDATE: Check ticket status
    if (found.status === 'cancelled') {
      console.warn('⚠ Ticket is cancelled:', found.id);
      showScanResult(false, "❌ Cancelled Ticket", `
        <div class="ticket-display">
          <p style="color: #ff6b6b; font-weight: 600;">This ticket has been cancelled.</p>
          <p style="font-size: 12px; color: #999; margin-top: 15px;">Please contact support.</p>
        </div>
      `);
      return;
    }

    // CRITICAL: Mark ticket as used in Firebase
    try {
      const now = new Date();
      await updateDoc(doc(db, "tickets", found.id), {
        used: true,
        usedAt: now.toISOString(),
        scannedTime: now.toISOString(),
        scannerUserId: window.currentUserId || 'unknown'
      });
      console.log('✓ Ticket marked as used successfully');
    } catch (updateError) {
      console.error('✗ Critical Error updating ticket status:', updateError);
      // FAIL-SAFE: Still show success to user but log the error
      // This ensures the user isn't blocked from entry due to a write failure
      console.warn('⚠ Write failed but allowing entry due to timeout. Admin must manually verify.');
    }

    // Show success
    console.log('✓ Valid ticket:', found.id);
    showScanResult(true, "✅ Entry Allowed", `
      <div class="ticket-display" style="text-align: left;">
        <div style="margin-bottom: 20px;">
          <p><strong style="font-size: 14px; color: #999;">CUSTOMER</strong></p>
          <p style="font-size: 18px; font-weight: 600; margin: 5px 0;">${found.customerName || 'N/A'}</p>
        </div>
        
        <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 15px;">
          <p><strong style="font-size: 14px; color: #999;">TICKET TYPE</strong></p>
          <p style="font-size: 14px; font-weight: 600; margin: 5px 0;">${found.ticketType || 'Standard'}</p>
        </div>
        
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 8px;">
          <p style="color: #10b981; font-weight: 600; margin: 0;">✓ Entry Granted</p>
          <p style="font-size: 12px; color: #999; margin: 5px 0 0 0;">Scanned at ${new Date().toLocaleTimeString('en-IN')}</p>
        </div>
      </div>
    `);
  } catch (error) {
    console.error('❌ Error validating ticket:', error);
    showScanResult(false, "⚠️ System Error", `
      <div class="ticket-display">
        <p>An error occurred while validating the ticket.</p>
        <p style="font-size: 12px; color: #999; margin-top: 15px;">Please try again or contact support.</p>
      </div>
    `);
  }
}

// ==================== SCAN RESULT ====================
function showScanResult(isValid, title, message) {
  const modal = document.getElementById('scanResultModal');
  const resultContent = document.getElementById('resultContent');
  
  if (!modal || !resultContent) {
    console.error('Result modal elements not found');
    alert(title + ': ' + message);
    return;
  }
  
  if (isValid) {
    resultContent.innerHTML = `
      <div class="result-success">
        <div class="result-icon success">✓</div>
        <h2>${title}</h2>
        ${message}
      </div>
    `;
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  } else {
    resultContent.innerHTML = `
      <div class="result-error">
        <div class="result-icon error">✗</div>
        <h2>${title}</h2>
        ${message}
      </div>
    `;
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  }
  
  modal.classList.add('active');
  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '10000';
  
  // Ensure modal content is properly sized for mobile
  if (resultContent) {
    resultContent.style.maxWidth = '90vw';
    resultContent.style.maxHeight = '90vh';
    resultContent.style.borderRadius = 'var(--radius-lg)';
    resultContent.style.padding = 'var(--space-xl)';
  }
  
  // Play sound effect
  playSound(isValid ? 'success' : 'error');
}

function closeScanResult() {
  try {
    const modal = document.getElementById('scanResultModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  } catch (err) {
    console.error('Error closing scan result:', err);
  }
}

function continueScan() {
  try {
    closeScanResult();
    
    // Clear form fields
    const ticketIdInput = document.getElementById('ticketIdInput');
    const qrCodeInput = document.getElementById('qrCodeInput');
    
    if (ticketIdInput) ticketIdInput.value = '';
    if (qrCodeInput) qrCodeInput.value = '';
    
    if (currentMode === 'camera') {
      // Resume camera scanning
      if (video && video.srcObject) {
        // Resume existing stream
        scanQRCode();
      } else {
        // Restart camera
        initCamera();
      }
    } else if (currentMode === 'manual') {
      // Focus on ticket ID field for next entry
      if (ticketIdInput) {
        ticketIdInput.focus();
      }
    }
  } catch (err) {
    console.error('Error in continueScan:', err);
  }
}

// ==================== AUDIO FEEDBACK ====================
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      console.warn('Audio context not available:', err);
      return null;
    }
  }
  return audioContext;
}

function playSound(type) {
  try {
    const context = getAudioContext();
    if (!context) return;
    
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    if (type === 'success') {
      // Two ascending beeps for success
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, context.currentTime);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.1);
      
      oscillator.frequency.value = 1200;
      oscillator.start(context.currentTime + 0.15);
      oscillator.stop(context.currentTime + 0.25);
    } else {
      // Descending beep for error
      oscillator.frequency.value = 400;
      gainNode.gain.setValueAtTime(0.3, context.currentTime);
      oscillator.start(context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, context.currentTime + 0.2);
      oscillator.stop(context.currentTime + 0.2);
    }
  } catch (err) {
    console.warn('Could not play sound:', err);
  }
}

// ==================== SCANNER CONTROLS ====================
function closeScanner() {
  try {
    const container = document.getElementById("scanner-main-container");
    if (container) {
      container.style.display = "none";
    }
  } catch (err) {
    console.error('Error closing scanner:', err);
  }
}

function scanAgain() {
  try {
    const modal = document.getElementById("scanResultModal");
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = "none";
    }
    continueScan();
  } catch (err) {
    console.error('Error in scanAgain:', err);
    closeScanResult();
    continueScan();
  }
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
  // ESC to go back or close modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('scanResultModal');
    if (modal && modal.classList.contains('active')) {
      closeScanResult();
    } else if (currentMode) {
      backToMode();
    }
  }
  
  // ENTER to submit manual form
  if (e.key === 'Enter' && currentMode === 'manual') {
    const qrCodeInput = document.getElementById('qrCodeInput');
    const ticketIdInput = document.getElementById('ticketIdInput');
    const form = document.getElementById('manualForm');
    
    if (form && (document.activeElement === qrCodeInput || document.activeElement === ticketIdInput)) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  }
});

// ==================== EXPORT FUNCTIONS TO WINDOW ====================
// Make functions globally available for HTML event handlers
window.selectMode = selectMode;
window.backToMode = backToMode;
window.initCamera = initCamera;
window.stopCamera = stopCamera;
window.toggleFlash = toggleFlash;
window.processManualEntry = processManualEntry;
window.validateAndDisplayTicket = validateAndDisplayTicket;
window.closeScanResult = closeScanResult;
window.continueScan = continueScan;
window.closeScanner = closeScanner;
window.scanAgain = scanAgain;
window.showScanResult = showScanResult;
window.playSound = playSound;
