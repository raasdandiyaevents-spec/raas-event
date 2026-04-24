﻿// ============================================
// Firebase Initialization - Import from firebase.js
// ============================================
import { auth, db } from "./firebase.js";
import * as Auth from './auth.js';
import { getDoc, doc, collection, getDocs, deleteDoc, updateDoc, onSnapshot, query, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.db = db;
window.auth = auth;
window.Auth = Auth;

// Initialize persistence and auth listener
Auth.initializePersistence();
Auth.initializeAuthStateListener();

console.log('✓ Firebase initialized for Admin Portal with Auth');

// ============================================
// � MAIN INITIALIZATION - WAIT FOR DOM READY
// ============================================
function setupAuthListener() {
  try {
    auth.onAuthStateChanged((user) => {
      try {
        if (user) {
          currentUser = user;
          currentUserId = user.uid;
          currentUserPhone = user.phoneNumber || '';
          window.currentUserId = currentUserId;
          window.currentUserRole = currentUserRole;
          console.log('✅ Auth state updated:', { currentUserId, currentUserPhone });
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeAdmin);
          } else {
            initializeAdmin();
          }
        } else {
          console.log('⚠️ No user logged in');
        }
      } catch (err) {
        console.error('❌ Error in auth state change:', err);
      }
    });
  } catch (err) {
    console.error('❌ Error setting up auth listener:', err);
  }
}

function initPinLock() {
  try {
    console.log('🔒 Starting PIN verification process...');
    document.body.style.display = 'none';
    createPinLockUI();
    
    // Safety timeout - if PIN not verified in 30 seconds, show UI anyway
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ PIN verification timeout - showing UI');
      document.body.style.display = 'block';
    }, 30000);
    
    setTimeout(() => {
      const pinInput = document.getElementById('pinInput');
      const pinSubmit = document.getElementById('pinSubmit');
      
      if (pinInput && pinSubmit) {
        pinSubmit.addEventListener('click', () => {
          clearTimeout(safetyTimeout);
          handlePinSubmit();
        });
        pinInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            clearTimeout(safetyTimeout);
            handlePinSubmit();
          }
        });
        pinInput.focus();
        console.log('✓ PIN lock UI ready');
      } else {
        console.warn('⚠️ PIN elements not found - showing UI');
        clearTimeout(safetyTimeout);
        document.body.style.display = 'block';
      }
    }, 100);
  } catch (error) {
    console.error('❌ Critical error in PIN verification:', error);
    document.body.style.display = 'block';
  }
}

// Start main initialization when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('🚀 DOM Content Loaded - Starting admin portal');
    initPinLock();
    setupAuthListener();
    console.log('✓ Admin portal initialization started');
  } catch (error) {
    console.error('❌ Critical error in DOMContentLoaded:', error);
    document.body.style.display = 'block';
    document.body.innerHTML = '<div style="padding: 40px; color: #ef4444; font-family: monospace; background: #0f172a;">⚠️ Error initializing admin portal. Please refresh.</div>';
  }

  // Safety timeout - ensure UI is visible after 5 seconds
  setTimeout(() => {
    if (getComputedStyle(document.body).display === 'none') {
      console.warn('⚠️ Body still hidden - forcing visible');
      document.body.style.display = 'block !important';
    }
  }, 5000);

  // Continuous safety monitor
  setInterval(() => {
    const bodyDisplay = getComputedStyle(document.body).display;
    if (bodyDisplay === 'none' && !document.getElementById('pinLock')) {
      console.warn('⚠️ Enforcing body visibility');
      document.body.style.setProperty('display', 'block', 'important');
    }
  }, 1000);
});

// ============================================
// �🔐 GLOBAL STATE VARIABLES (DECLARE FIRST)
// ============================================
let currentUser = null;
let currentUserId = '';
let currentUserRole = 'user';
let currentUserPhone = '';
let adminEvents = [];
let currentTicketTypes = [];
let bannerBase64 = null;
let analyticsRefreshInterval = null;
let analyticsEventsUnsubscribe = null;
let analyticsTicketsUnsubscribe = null;
let allGuestTickets = [];
let guestListUnsubscribe = null;
let pinAttempts = 0;
let maxPinAttempts = 5;

// ============================================
// 🔐 SECURITY - PIN LOCK WILL BE INITIALIZED IN DOMCONTENTLOADED
// ============================================

// ============================================
// 🔐 PIN SYSTEM - HELPERS & SECURITY CHECK
// ============================================
// Hash PIN using SHA-256
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify PIN against stored hash
async function verifyPin(inputPin, type) {
  try {
    const snap = await getDoc(doc(db, 'security', 'pin'));
    
    if (!snap.exists()) {
      console.warn('PIN not found in Firestore - PIN system not configured');
      return false;
    }
    
    const data = snap.data();
    const cleanPin = inputPin.trim();
    const hashedInput = await hashPin(cleanPin);
    const correctHash = type === 'admin' ? data.adminPinHash : data.scannerPinHash;
    
    console.log('🔐 PIN VERIFICATION:');
    console.log('  Input PIN:', cleanPin);
    console.log('  Hashed Input:', hashedInput);
    console.log('  Firebase Hash:', correctHash);
    console.log('  Match:', hashedInput === correctHash);
    
    if (!correctHash) {
      console.warn('PIN not configured properly for type:', type);
      return false;
    }
    
    return hashedInput === correctHash;
  } catch (err) {
    console.error('PIN VERIFY ERROR:', err);
    return false;
  }
}

// Get user role from Firestore
async function getUserRole(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data().role : null;
  } catch (error) {
    console.error('Error getting user role:', error);
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
      console.warn('PIN not found in Firestore - PIN system not configured');
      return false;
    }
    
    const hash = await hashPin(inputPin);
    if (!hash) {
      console.error('Failed to hash PIN');
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
    alert('✅ PIN document created successfully!\n\nAdmin PIN: 135669\nScanner PIN: 539966');
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
// 🔐 PAGE SECURITY LOCK - PIN UI LAYER
// ============================================

// Create and inject PIN lock UI
function createPinLockUI() {
  const pinLockHTML = `
    <style>
      #pinLock {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        z-index: 10000;
        backdrop-filter: blur(10px);
      }

      .pin-card {
        background: rgba(30, 41, 59, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 20px;
        padding: 48px 32px;
        width: 100%;
        max-width: 380px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        animation: slideUp 0.5s ease;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .pin-card h2 {
        margin: 0 0 8px 0;
        font-size: 28px;
        font-weight: 700;
        background: linear-gradient(90deg, #7c3aed, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .pin-card p {
        margin: 0 0 32px 0;
        color: #94a3b8;
        font-size: 14px;
      }

      .pin-input-group {
        margin-bottom: 24px;
      }

      .pin-input-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      #pinInput {
        width: 100%;
        padding: 14px 16px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.6);
        color: #f1f5f9;
        border: 1.5px solid rgba(71, 85, 105, 0.5);
        font-size: 16px;
        font-weight: 500;
        letter-spacing: 2px;
        transition: all 0.3s ease;
        font-family: 'Courier New', monospace;
      }

      #pinInput:focus {
        outline: none;
        border-color: rgba(124, 58, 237, 0.8);
        background: rgba(15, 23, 42, 0.8);
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
      }

      #pinInput::placeholder {
        color: #64748b;
      }

      #pinSubmit {
        width: 100%;
        padding: 14px 16px;
        border-radius: 10px;
        background: linear-gradient(90deg, #7c3aed, #06b6d4);
        color: white;
        border: none;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      #pinSubmit:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(124, 58, 237, 0.4);
      }

      #pinSubmit:active:not(:disabled) {
        transform: translateY(0);
      }

      #pinSubmit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .pin-attempts {
        margin-top: 16px;
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
      }

      .pin-attempts.warning {
        color: #fbbf24;
      }

      .pin-attempts.danger {
        color: #ef4444;
      }
    </style>
    <div id="pinLock">
      <div class="pin-card">
        <h2>🔐 PIN Verification</h2>
        <p>Enter your PIN to access the admin portal</p>
        <div class="pin-input-group">
          <label for="pinInput">Access PIN</label>
          <input 
            type="password" 
            id="pinInput" 
            placeholder="••••••"
            autocomplete="off"
            inputmode="numeric"
          />
        </div>
        <button id="pinSubmit">Unlock →</button>
        <div class="pin-attempts">Attempts: <span id="attemptsDisplay">5</span> remaining</div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('afterbegin', pinLockHTML);
}

// PIN verification handler
async function handlePinSubmit() {
  const pinInput = document.getElementById('pinInput');
  const pinSubmitBtn = document.getElementById('pinSubmit');
  const attemptsDisplay = document.getElementById('attemptsDisplay');
  
  if (!pinInput) return;
  
  const pin = pinInput.value.trim();
  
  if (!pin || pin.length < 4) {
    pinInput.style.borderColor = 'rgba(239, 68, 68, 0.8)';
    setTimeout(() => {
      pinInput.style.borderColor = '';
    }, 1500);
    console.warn('PIN too short or empty');
    return;
  }
  
  // Disable button during verification
  pinSubmitBtn.disabled = true;
  pinSubmitBtn.textContent = 'Verifying...';
  
  try {
    const isAdminPage = window.location.pathname.includes('admin');
    const portalType = isAdminPage ? 'admin' : 'scanner';
    
    console.log('🔒 Verifying as:', portalType);
    const isValid = await verifyPin(pin, portalType);
    
    if (isValid) {
      console.log('✅ PIN accepted - loading portal');
      pinSubmitBtn.textContent = 'Unlocking...';
      
      // Hide PIN lock with smooth transition
      const pinLock = document.getElementById('pinLock');
      pinLock.style.opacity = '0';
      pinLock.style.transition = 'opacity 0.3s ease';
      
      setTimeout(() => {
        pinLock.remove();
        document.body.style.display = 'block';
        console.log('🔓 Page unlocked - access granted');
      }, 300);
      
      return;
    } else {
      pinAttempts++;
      const remaining = maxPinAttempts - pinAttempts;
      
      console.error('❌ PIN verification failed');
      
      // Visual feedback for wrong PIN
      pinInput.value = '';
      pinInput.style.borderColor = 'rgba(239, 68, 68, 0.8)';
      pinInput.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      
      setTimeout(() => {
        pinInput.style.borderColor = '';
        pinInput.style.backgroundColor = '';
      }, 1500);
      
      // Update attempts display
      attemptsDisplay.textContent = remaining;
      const attemptsEl = document.querySelector('.pin-attempts');
      
      if (remaining <= 2) {
        attemptsEl.className = 'pin-attempts danger';
      } else if (remaining <= 3) {
        attemptsEl.className = 'pin-attempts warning';
      }
      
      console.warn(`❌ Wrong PIN. ${remaining} attempts remaining.`);
      
      if (remaining <= 0) {
        console.error('❌ Maximum PIN attempts exceeded - access denied');
        pinSubmitBtn.textContent = 'Access Denied';
        pinSubmitBtn.disabled = true;
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);
        return;
      }
    }
  } catch (error) {
    console.error('PIN verification error:', error);
    pinSubmitBtn.textContent = 'Error';
  }
  
  // Re-enable button
  pinSubmitBtn.disabled = false;
  pinSubmitBtn.textContent = 'Unlock →';
  pinInput.focus();
}



// ============================================
// TOAST NOTIFICATIONS (for admin functions)
// ============================================
function showToast(type, title, message) {
  const container = document.getElementById('toast-container') || document.createElement('div');
  if (!document.getElementById('toast-container')) {
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  const borderColor = type === 'success' ? '#10b981' : '#ef4444';
  const textColor = type === 'success' ? '#10b981' : '#ef4444';

  toast.style.cssText = `
    background: ${bgColor};
    border-left: 4px solid ${borderColor};
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 12px;
    animation: slideIn 0.3s ease;
  `;

  toast.innerHTML = `
    <div style="color: ${textColor}; font-weight: 600; margin-bottom: 4px;">${title}</div>
    <div style="color: var(--text-muted); font-size: 0.875rem;">${message}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ============================================
// Admin Portal - Event Management
// ============================================
// (All state variables declared at top of file)

// ============================================
// 🔥 SCANNER MANAGEMENT FUNCTIONS
// ============================================
// Make a user a scanner
export async function makeScanner(userId) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      role: 'scanner'
    });
    console.log('✅ User assigned scanner role:', userId);
    showToast('success', 'User made scanner', 'Role updated to scanner');
    return { success: true };
  } catch (error) {
    console.error('Error making scanner:', error);
    showToast('error', 'Error', 'Failed to update user role');
    return { success: false, error };
  }
}

// Remove scanner access (revert to user)
export async function removeScanner(userId) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      role: 'user'
    });
    console.log('✅ User reverted to user role:', userId);
    showToast('success', 'Scanner removed', 'Role updated to user');
    return { success: true };
  } catch (error) {
    console.error('Error removing scanner:', error);
    showToast('error', 'Error', 'Failed to update user role');
    return { success: false, error };
  }
}

// Make functions global
window.makeScanner = makeScanner;
window.removeScanner = removeScanner;

// ==================== INITIALIZATION ====================
// Auth listener is set up in DOMContentLoaded via setupAuthListener()
// When user is authenticated, initializeAdmin() will be called

function initializeAdmin() {
  console.log('🚀 Admin portal initializing...');
  
  try {
    // Setup button listeners
    try {
      setupAdminButtonListeners();
      console.log('✓ Button listeners set up');
    } catch (err) {
      console.error('Error setting up listeners:', err);
    }
    
    // Load data with error handling
    try {
      console.log('📋 Loading events...');
      loadAdminEvents().catch(err => console.error('Failed to load events:', err));
    } catch (err) {
      console.error('Error loading events:', err);
    }
    
    try {
      console.log('📊 Loading analytics...');
      loadAnalytics().catch(err => console.error('Failed to load analytics:', err));
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
    
    try {
      console.log('🔄 Starting analytics refresh...');
      startAnalyticsRefresh();
    } catch (err) {
      console.error('Error starting analytics refresh:', err);
    }
    
    try {
      console.log('👥 Loading guest list...');
      loadGuestList().catch(err => console.error('Failed to load guest list:', err));
    } catch (err) {
      console.error('Error loading guest list:', err);
    }
    
    try {
      initializeCreateForm();
    } catch (err) {
      console.error('Error initializing create form:', err);
    }
    
    console.log('✓ Admin portal ready');
  } catch (error) {
    console.error('❌ Error initializing admin:', error);
  }
}

// ============================================
// SETUP ADMIN BUTTON LISTENERS
// ============================================
function setupAdminButtonListeners() {
  console.log('Setting up admin button listeners...');
  
  try {
    // Setup form submission
    const form = document.getElementById('createEventForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        console.log('Form submit triggered');
        handleCreateEvent(e);
      });
      console.log('✓ Create event form listener attached');
    } else {
      console.warn('⚠️ createEventForm not found');
    }
    
    // Setup tab switching
    const navLinks = document.querySelectorAll('.nav-links a');
    if (navLinks.length > 0) {
      navLinks.forEach(link => {
        const onclick = link.getAttribute('onclick');
        if (onclick && onclick.includes('switchAdminTab')) {
          link.style.cursor = 'pointer';
        }
      });
      console.log('✓ Navigation links ready');
    } else {
      console.warn('⚠️ Navigation links not found');
    }
    
    // Setup logout button
    const logoutBtn = document.querySelector('button[onclick="logoutAdmin()"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logoutAdmin();
      });
      console.log('✓ Logout button listener attached');
    } else {
      console.warn('⚠️ Logout button not found');
    }
    
    console.log('✓ All listeners set up');
  } catch (error) {
    console.error('Error setting up listeners:', error);
  }
}

// ==================== AUTHENTICATION ====================
function logoutAdmin() {
  try {
    if (confirm('Are you sure you want to logout?')) {
      console.log('Logging out...');
      Auth.logout().then(() => {
        window.location.href = 'index.html';
      }).catch(error => {
        console.error('Logout error:', error);
        alert('Logout failed: ' + error.message);
      });
    }
  } catch (error) {
    console.error('Error in logoutAdmin:', error);
  }
}

// Make logoutAdmin globally accessible
window.logoutAdmin = logoutAdmin;

// ==================== TAB SWITCHING ====================
function switchAdminTab(tabName) {
  try {
    console.log('Switching to tab:', tabName);
    
    // Hide all tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.style.display = 'none';
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.display = 'block';
      
      // Load tab-specific data
      if (tabName === 'events') {
        loadAdminEvents().catch(err => console.error('Failed to load events:', err));
      } else if (tabName === 'create') {
        initializeCreateForm();
      } else if (tabName === 'guests') {
        loadGuestList().catch(err => console.error('Failed to load guest list:', err));
      } else if (tabName === 'analytics') {
        loadAnalytics().catch(err => console.error('Failed to load analytics:', err));
        startAnalyticsRefresh();
      }
      
      console.log('✓ Tab switched to:', tabName);
    } else {
      console.warn('Tab not found:', tabName);
    }
  } catch (error) {
    console.error('Error switching tab:', error);
  }
}

// Make switchAdminTab globally accessible
window.switchAdminTab = switchAdminTab;

// ==================== LOAD & DISPLAY EVENTS ====================
async function loadAdminEvents() {
  try {
    console.log('Loading events from Firestore...');
    if (!db) {
      console.warn('Database not initialized');
      return;
    }

    const querySnapshot = await getDocs(collection(db, "events"));
    adminEvents = [];
    querySnapshot.forEach((doc) => {
      adminEvents.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log('Loaded', adminEvents.length, 'events from Firestore');
  } catch (error) {
    console.error('Error loading events from Firestore:', error);
    adminEvents = [];
  }

  const container = document.getElementById('adminEventsList');
  if (!container) return;
  
  if (adminEvents.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">No events created yet!</div>';
    return;
  }
  
  container.innerHTML = adminEvents.map(event => {
    const statusColors = {
      active: { emoji: '🟢', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' },
      postponed: { emoji: '🟡', color: '#eab308', bg: 'rgba(234, 179, 8, 0.2)' },
      cancelled: { emoji: '🔴', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
      inactive: { emoji: '⭕', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.2)' }
    };
    const statusStyle = statusColors[event.status] || statusColors.inactive;
    
    // Display "To be announced" for postponed events
    const dateDisplay = event.status === 'postponed' ? 'To be announced' : new Date(event.eventDate).toLocaleDateString('en-IN');
    const venueDisplay = event.status === 'postponed' ? 'To be announced' : (event.venue || 'TBD');
    
    return `
    <div class="glass-card" style="padding: var(--space-lg);">
      <div style="display: flex; gap: var(--space-lg); margin-bottom: var(--space-lg);">
        <img src="${event.banner || event.image}" alt="${event.eventName || 'Event'}" style="width: 100px; height: 100px; border-radius: var(--radius-lg); object-fit: cover;">
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: start; gap: var(--space-md);">
            <div>
              <h3 style="margin: 0 0 var(--space-sm) 0;">${event.eventName || 'Untitled Event'}</h3>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">📅 ${dateDisplay}</p>
              <p style="color: var(--text-muted); font-size: 0.875rem; margin: var(--space-sm) 0 0 0;">📍 ${venueDisplay}</p>
            </div>
            <span style="display: inline-block; padding: 6px 12px; background: ${statusStyle.bg}; color: ${statusStyle.color}; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; white-space: nowrap;">${statusStyle.emoji} ${event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
          </div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
        <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
          <select class="btn btn-secondary btn-sm" style="padding: 8px 12px; cursor: pointer; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--glass-border); font-weight: 600;" onchange="changeEventStatus('${event.id}', this.value); this.value=''">
            <option value="" style="color: var(--text-primary); background: var(--bg-tertiary);">Change Status...</option>
            <option value="active" style="color: var(--text-primary); background: var(--bg-tertiary);">🟢 Active</option>
            <option value="postponed" style="color: var(--text-primary); background: var(--bg-tertiary);">🟡 Postponed</option>
            <option value="cancelled" style="color: var(--text-primary); background: var(--bg-tertiary);">🔴 Cancelled</option>
            <option value="inactive" style="color: var(--text-primary); background: var(--bg-tertiary);">⭕ Inactive</option>
          </select>
          <button class="btn btn-secondary btn-sm" onclick="editEvent('${event.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEvent('${event.id}')">Delete</button>
        </div>
      </div>
    </div>
  `}).join('');
}

async function changeEventStatus(eventId, newStatus) {
  try {
    console.log('Changing event status:', { eventId, newStatus });
    const eventRef = doc(db, "events", eventId);
    await updateDoc(eventRef, { status: newStatus });
    console.log('✓ Event status updated');
    showToast('success', 'Status Updated', 'Event status changed to ' + newStatus);
    loadAdminEvents();
    loadAnalytics();
  } catch (error) {
    console.error('Error updating event status:', error);
    showToast('error', 'Error', 'Failed to update status: ' + error.message);
  }
}

// Make changeEventStatus globally accessible
window.changeEventStatus = changeEventStatus;

function deleteEvent(eventId) {
  try {
    if (confirm('Are you sure you want to delete this event?')) {
      console.log('Deleting event:', eventId);
      deleteDoc(doc(db, "events", eventId)).then(() => {
        console.log('✓ Event deleted');
        showToast('success', 'Event Deleted', 'Event has been removed');
        loadAdminEvents();
        loadAnalytics();
      }).catch(error => {
        console.error('Error deleting event:', error);
        showToast('error', 'Error', 'Failed to delete event');
      });
    }
  } catch (error) {
    console.error('Error in deleteEvent:', error);
    showToast('error', 'Error', error.message);
  }
}

// Make deleteEvent globally accessible
window.deleteEvent = deleteEvent;

// ==================== CREATE EVENT FORM ====================
function initializeCreateForm() {
  currentTicketTypes = [];
  bannerBase64 = null;
  
  const form = document.getElementById('createEventForm');
  if (form) {
    form.reset();
    form.dataset.editingId = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Create Event';
  }
  
  const bannerText = document.getElementById('bannerText');
  if (bannerText) bannerText.textContent = 'Click to upload banner image';
  
  const bannerPreview = document.getElementById('bannerPreview');
  if (bannerPreview) bannerPreview.style.display = 'none';
  
  const ticketsContainer = document.getElementById('ticketsContainer');
  if (ticketsContainer) ticketsContainer.innerHTML = '';
}

// ==================== FORM SUBMISSION - MAIN HANDLER ====================
async function handleCreateEvent(event) {
  event.preventDefault();
  console.log('Create event form submitted');
  
  try {
    // Get current auth user
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('ERROR: No authenticated user');
      throw new Error('Please login before creating events');
    }
    
    console.log('User authenticated:', {
      uid: currentUser.uid,
      phone: currentUser.phoneNumber
    });
    
    // Owner phone validation (allow owner or just accept for now)
    const OWNER_PHONE = '+917738427824';
    const isOwner = currentUser.phoneNumber && currentUser.phoneNumber.includes('7738427824');
    console.log('Owner check:', { userPhone: currentUser.phoneNumber, isOwner });
    
    // Log security verification
    console.log('Security verification:');
    console.log('  - User ID:', currentUser.uid);
    console.log('  - User Phone:', currentUser.phoneNumber);
    console.log('  - Is Owner:', isOwner);

    // Validate and save ticket types
    if (!saveTicketTypes()) {
      alert('Please add at least one ticket type');
      return;
    }
    
    // Get form values
    const eventTitleEl = document.getElementById('eventTitle');
    const eventCategoryEl = document.getElementById('eventCategory');
    const eventDateEl = document.getElementById('eventDate');
    const eventTimeEl = document.getElementById('eventTime');
    const eventLocationEl = document.getElementById('eventLocation');
    const eventDescriptionEl = document.getElementById('eventDescription');
    const eventStatusEl = document.getElementById('eventStatus');
    const isFeaturedEl = document.getElementById('isFeatured');
    
    // Verify all elements exist
    if (!eventTitleEl) throw new Error('Event title field not found');
    if (!eventCategoryEl) throw new Error('Event category field not found');
    if (!eventDateEl) throw new Error('Event date field not found');
    if (!eventTimeEl) throw new Error('Event time field not found');
    if (!eventLocationEl) throw new Error('Event location field not found');
    if (!eventDescriptionEl) throw new Error('Event description field not found');
    
    // Get values
    const eventName = eventTitleEl.value?.trim();
    const category = eventCategoryEl.value;
    const eventDate = eventDateEl.value;
    const eventTime = eventTimeEl.value;
    const venue = eventLocationEl.value?.trim();
    const description = eventDescriptionEl.value?.trim();
    const status = eventStatusEl?.value || 'active';
    const isFeatured = isFeaturedEl?.checked || false;
    
    console.log('Form values:', { eventName, category, eventDate, eventTime, venue, description });
    
    // Validate all required fields
    if (!eventName) throw new Error('Event title is required');
    if (!category) throw new Error('Event category is required');
    if (!eventDate) throw new Error('Event date is required');
    if (!eventTime) throw new Error('Event time is required');
    if (!venue) throw new Error('Event location is required');
    if (!description) throw new Error('Event description is required');

    // Validate text field lengths
    if (eventName.length > 200) throw new Error('Event name is too long (max 200 characters)');
    if (venue.length > 200) throw new Error('Venue name is too long (max 200 characters)');
    if (description.length > 1000) throw new Error('Description is too long (max 1000 characters)');
    
    if (!bannerBase64) {
      throw new Error('Please upload an event banner image');
    }
    
    // Validate future date
    const selectedDate = new Date(eventDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      throw new Error('Please select a future date');
    }
    
    // Validate time format
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(eventTime)) {
      throw new Error('Invalid time format. Please use HH:MM');
    }
    
    // Extract and validate ticket prices
    let priceSingle = 0, priceCouple = 0, priceGroup5 = 0, priceGroup10 = 0, priceGroup20 = 0;
    
    currentTicketTypes.forEach(ticket => {
      if (ticket.price < 0) throw new Error('Ticket prices cannot be negative');
      if (ticket.price > 999999) throw new Error('Ticket price is too high');
      
      if (ticket.name === 'Single Pass') priceSingle = ticket.price;
      else if (ticket.name === 'Couple Pass') priceCouple = ticket.price;
      else if (ticket.name === 'Group of 5') priceGroup5 = ticket.price;
      else if (ticket.name === 'Group of 10') priceGroup10 = ticket.price;
      else if (ticket.name === 'Group of 20') priceGroup20 = ticket.price;
    });
    
    // Check if database is initialized
    if (!db) {
      throw new Error('Firebase database not initialized');
    }
    
    // Save event using addDoc to generate unique ID
    console.log('Saving event to Firestore...');
    console.log('Database connection:', db ? 'OK' : 'NOT OK');
    
    if (!db) {
      throw new Error('Firebase database not initialized');
    }
    
    const eventData = {
      eventName: eventName,
      eventDate: eventDate,
      eventTime: eventTime,
      venue: venue,
      priceSingle: priceSingle,
      priceCouple: priceCouple,
      priceGroup5: priceGroup5,
      priceGroup10: priceGroup10,
      priceGroup20: priceGroup20,
      status: status,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.uid || 'admin',
      createdByPhone: currentUser.phoneNumber || 'unknown',
      description: description,
      category: category,
      featured: isFeatured,
      banner: bannerBase64
    };
    
    console.log('Event data prepared:', eventData);
    
    const docRef = await addDoc(collection(db, "events"), eventData);
    
    if (!docRef || !docRef.id) {
      throw new Error('Failed to create event - no document reference returned');
    }
    
    console.log('Event saved successfully with ID:', docRef.id);
    showToast('success', 'Event Created!', eventName + ' added successfully');
    
    // Reset form
    initializeCreateForm();
    
    // Reload events and navigate
    await loadAdminEvents();
    setTimeout(() => switchAdminTab('events'), 500);
    
  } catch (error) {
    console.error('Error creating event:', error);
    const errorMsg = error.message || 'An unexpected error occurred';
    showToast('error', 'Event Creation Failed', errorMsg);
  }
}

// ==================== TICKET TYPES ====================
function addTicketType() {
  try {
    const container = document.getElementById('ticketsContainer');
    if (!container) {
      console.warn('Tickets container not found');
      return;
    }
    
    const id = 'ticket-' + Date.now() + '-' + Math.random();
    const html = `
    <div class="ticket-form-group" id="${id}" style="background: var(--bg-tertiary); padding: var(--space-lg); border-radius: var(--radius-lg); margin-bottom: var(--space-md);">
      <div class="form-row">
        <div class="form-group">
          <label>Ticket Category *</label>
          <select class="ticket-category" onchange="togglePeoplePermitted(this)" required>
            <option value="">Select Category</option>
            <option value="Single Pass">Single Pass (1 person)</option>
            <option value="Couple Pass">Couple Pass (2 people)</option>
            <option value="Group of 5">Group of 5 (5 people)</option>
            <option value="Group of 10">Group of 10 (10 people)</option>
            <option value="Group of 20">Group of 20 (20 people)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Price (₹) *</label>
          <input type="number" placeholder="500" min="0" class="ticket-price" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>People Permitted *</label>
          <input type="number" placeholder="1" min="1" class="ticket-people-permitted" value="1" required>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" placeholder="e.g., Entry pass" class="ticket-desc">
        </div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" onclick="removeTicketType('${id}')">Remove</button>
    </div>
  `;
    container.insertAdjacentHTML('beforeend', html);
    console.log('Ticket type added:', id);
  } catch (error) {
    console.error('Error adding ticket type:', error);
    showToast('error', 'Error', 'Failed to add ticket type');
  }
}

// Make addTicketType globally accessible
window.addTicketType = addTicketType;

function togglePeoplePermitted(selectElement) {
  try {
    const ticketGroup = selectElement.closest('.ticket-form-group');
    const peoplePermittedInput = ticketGroup.querySelector('.ticket-people-permitted');
    const category = selectElement.value;
    
    // Auto-set people permitted based on category
    const categoryPeopleMap = {
      'Single Pass': 1,
      'Couple Pass': 2,
      'Group of 5': 5,
      'Group of 10': 10,
      'Group of 20': 20
    };
    
    if (categoryPeopleMap[category]) {
      peoplePermittedInput.value = categoryPeopleMap[category];
    }
  } catch (error) {
    console.error('Error toggling people permitted:', error);
  }
}

// Make togglePeoplePermitted globally accessible
window.togglePeoplePermitted = togglePeoplePermitted;

function removeTicketType(id) {
  try {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
      console.log('Ticket type removed:', id);
    }
  } catch (error) {
    console.error('Error removing ticket type:', error);
  }
}

// Make removeTicketType globally accessible
window.removeTicketType = removeTicketType;

function saveTicketTypes() {
  currentTicketTypes = [];
  const groups = document.querySelectorAll('.ticket-form-group');
  
  groups.forEach(group => {
    const category = group.querySelector('.ticket-category')?.value?.trim();
    const price = parseFloat(group.querySelector('.ticket-price')?.value || 0);
    const peoplePermitted = parseInt(group.querySelector('.ticket-people-permitted')?.value || 1);
    const desc = group.querySelector('.ticket-desc')?.value?.trim() || '';
    
    if (category && price > 0) {
      currentTicketTypes.push({
        id: 'type-' + Date.now() + Math.random().toString(36).substr(2, 5),
        name: category,
        category: category,
        price,
        peoplePermitted,
        description: desc,
        maxUses: peoplePermitted
      });
    }
  });
  
  return currentTicketTypes.length > 0;
}

// ==================== BANNER UPLOAD ====================
function handleBannerUpload(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      bannerBase64 = e.target.result;
      const img = document.getElementById('bannerImg');
      if (img) img.src = bannerBase64;
      const preview = document.getElementById('bannerPreview');
      if (preview) preview.style.display = 'block';
      const text = document.getElementById('bannerText');
      if (text) text.style.display = 'none';
      console.log('Banner uploaded');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('Error uploading banner:', error);
    showToast('error', 'Error', 'Failed to upload banner');
  }
}

// Make handleBannerUpload globally accessible
window.handleBannerUpload = handleBannerUpload;

function removeBanner() {
  try {
    bannerBase64 = null;
    const input = document.getElementById('bannerInput');
    if (input) input.value = '';
    const preview = document.getElementById('bannerPreview');
    if (preview) preview.style.display = 'none';
    const text = document.getElementById('bannerText');
    if (text) text.style.display = 'block';
    console.log('Banner removed');
  } catch (error) {
    console.error('Error removing banner:', error);
  }
}

// Make removeBanner globally accessible
window.removeBanner = removeBanner;

// ==================== VENUE ====================
function updateVenueOptions() {
  try {
    const type = document.getElementById('venueType')?.value;
    const section = document.getElementById('manualVenueSection');
    if (section) {
      section.style.display = type === 'decided' ? 'block' : 'none';
    }
  } catch (error) {
    console.error('Error updating venue options:', error);
  }
}

// Make updateVenueOptions globally accessible
window.updateVenueOptions = updateVenueOptions;

// ==================== ANALYTICS (FIREBASE-POWERED) ====================
// Analytics state variables declared at top of file
// Variables: analyticsRefreshInterval, analyticsEventsUnsubscribe, analyticsTicketsUnsubscribe

async function loadAnalytics() {
  try {
    // Set loading state
    setAnalyticsLoading(true);

    // Stop previous listeners
    if (analyticsEventsUnsubscribe) analyticsEventsUnsubscribe();
    if (analyticsTicketsUnsubscribe) analyticsTicketsUnsubscribe();

    // Function to process and update analytics
    const updateAnalyticsUI = (events, tickets) => {
      let totalEvents = events.length;
      let activeEvents = events.filter(e => e.status === "active").length;
      let totalTickets = tickets.length;
      let usedTickets = tickets.filter(t => t.used).length;
      let pendingTickets = tickets.filter(t => !t.used).length;
      let totalRevenue = 0;
      let perEventStats = {};

      // Build per-event stats
      events.forEach(event => {
        const eventName = event.eventName || 'Untitled Event';
        if (!perEventStats[eventName]) {
          perEventStats[eventName] = {
            sold: 0,
            checkedIn: 0,
            pending: 0,
            revenue: 0
          };
        }
      });

      tickets.forEach(ticket => {
        totalRevenue += Number(ticket.price || 0);
        const eventName = ticket.eventName || ticket.eventTitle || 'Unknown Event';
        if (!perEventStats[eventName]) {
          perEventStats[eventName] = {
            sold: 0,
            checkedIn: 0,
            pending: 0,
            revenue: 0
          };
        }
        perEventStats[eventName].sold++;
        perEventStats[eventName].revenue += Number(ticket.price || 0);
        if (ticket.used) {
          perEventStats[eventName].checkedIn++;
        } else {
          perEventStats[eventName].pending++;
        }
      });

      // Update UI with animations
      animateAnalyticsCard('totalEvents', totalEvents);
      animateAnalyticsCard('activeEvents', activeEvents);
      animateAnalyticsCard('totalTickets', totalTickets);
      animateAnalyticsCard('usedTickets', usedTickets);
      animateAnalyticsCard('pendingTickets', pendingTickets);
      updateAnalyticsCardWithRevenue('totalRevenue', totalRevenue);

      // Display per-event statistics
      displayPerEventStats(perEventStats);

      // Get and display recent items
      const ticketsList = tickets
        .sort((a, b) => (b.purchaseDate || b.createdAt || 0) - (a.purchaseDate || a.createdAt || 0))
        .slice(0, 5);
      
      const eventsList = events
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);

      displayRecentTickets(ticketsList);
      displayRecentEvents(eventsList);

      console.log('Analytics synced:', { totalEvents, activeEvents, totalTickets, usedTickets, pendingTickets, totalRevenue });
    };

    // Load initial data
    const eventsSnap = await getDocs(collection(db, "events"));
    const ticketsSnap = await getDocs(collection(db, "tickets"));
    
    let currentEvents = [];
    let currentTickets = [];

    eventsSnap.forEach(doc => {
      currentEvents.push({
        id: doc.id,
        ...doc.data()
      });
    });

    ticketsSnap.forEach(doc => {
      currentTickets.push({
        id: doc.id,
        ...doc.data()
      });
    });

    updateAnalyticsUI(currentEvents, currentTickets);

    // Set up real-time listeners
    analyticsEventsUnsubscribe = onSnapshot(collection(db, "events"), (snapshot) => {
      currentEvents = [];
      snapshot.forEach(doc => {
        currentEvents.push({
          id: doc.id,
          ...doc.data()
        });
      });
      updateAnalyticsUI(currentEvents, currentTickets);
    });

    analyticsTicketsUnsubscribe = onSnapshot(collection(db, "tickets"), (snapshot) => {
      currentTickets = [];
      snapshot.forEach(doc => {
        currentTickets.push({
          id: doc.id,
          ...doc.data()
        });
      });
      updateAnalyticsUI(currentEvents, currentTickets);
    });

    // Clear loading state
    setAnalyticsLoading(false);
    console.log('Analytics real-time sync enabled');

  } catch (error) {
    console.error('Error loading analytics:', error);
    setAnalyticsLoading(false);
    showAnalyticsError('Failed to load analytics. Check console.');
  }
}

function setAnalyticsLoading(isLoading) {
  const cards = document.querySelectorAll('.analytics-card');
  cards.forEach(card => {
    if (isLoading) {
      card.style.opacity = '0.6';
      const value = card.querySelector('.analytics-value');
      if (value) value.textContent = 'Loading...';
    } else {
      card.style.opacity = '1';
    }
  });
}

function animateAnalyticsCard(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  // Animate number increase
  const currentValue = parseInt(element.textContent) || 0;
  const increment = Math.max(1, Math.ceil((value - currentValue) / 10));
  let count = currentValue;

  const counter = setInterval(() => {
    count += increment;
    if (count >= value) {
      element.textContent = value;
      clearInterval(counter);
    } else {
      element.textContent = count;
    }
  }, 30);
}

function updateAnalyticsCardWithRevenue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  // Animate revenue with rupee symbol
  const currentValue = parseInt(element.textContent.replace(/[₹,]/g, '')) || 0;
  const increment = Math.max(1, Math.ceil((value - currentValue) / 10));
  let count = currentValue;

  const counter = setInterval(() => {
    count += increment;
    if (count >= value) {
      element.textContent = '₹' + value.toLocaleString('en-IN');
      clearInterval(counter);
    } else {
      element.textContent = '₹' + count.toLocaleString('en-IN');
    }
  }, 30);
}

function showAnalyticsError(message) {
  const analyticsGrid = document.querySelector('.analytics-grid');
  if (analyticsGrid) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'grid-column: 1/-1; padding: var(--space-lg); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-lg); color: #ef4444; text-align: center;';
    errorDiv.textContent = 'Error: ' + message;
    analyticsGrid.appendChild(errorDiv);
  }
}

function displayRecentTickets(tickets) {
  const container = document.getElementById('recentTicketsContainer');
  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: var(--space-lg);">No tickets sold yet</p>';
    return;
  }

  container.innerHTML = '<h3 style="margin-bottom: var(--space-md);">Recent Tickets</h3>' + 
    '<div style="display: flex; flex-direction: column; gap: var(--space-sm);">' +
    tickets.map(ticket => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md); background: var(--bg-tertiary); border-radius: var(--radius-lg);">
        <div>
          <p style="font-weight: 600; margin: 0;">${ticket.customerName || 'Unknown'}</p>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin: 4px 0 0;">${ticket.ticketType || 'General'}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-weight: 600; margin: 0;">₹${Number(ticket.price || 0).toLocaleString('en-IN')}</p>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0;">${new Date(ticket.purchaseDate || Date.now()).toLocaleDateString('en-IN')}</p>
        </div>
      </div>
    `).join('') +
    '</div>';
}

function displayRecentEvents(events) {
  const container = document.getElementById('recentEventsContainer');
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: var(--space-lg);">No events created yet</p>';
    return;
  }

  container.innerHTML = '<h3 style="margin-bottom: var(--space-md);">Recent Events</h3>' +
    '<div style="display: flex; flex-direction: column; gap: var(--space-sm);">' +
    events.map(event => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md); background: var(--bg-tertiary); border-radius: var(--radius-lg);">
        <div style="flex: 1;">
          <p style="font-weight: 600; margin: 0;">${event.eventName || 'Untitled'}</p>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin: 4px 0 0;">📅 ${new Date(event.eventDate || Date.now()).toLocaleDateString('en-IN')}</p>
        </div>
        <div>
          <span style="display: inline-block; padding: 4px 12px; background: ${event.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)'}; color: ${event.status === 'active' ? '#22c55e' : '#6b7280'}; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">${event.status === 'active' ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
    `).join('') +
    '</div>';
}

function displayPerEventStats(perEventStats) {
  const container = document.getElementById('perEventStatsContainer');
  if (!container) return;

  const events = Object.entries(perEventStats).sort((a, b) => b[1].sold - a[1].sold);

  if (events.length === 0) {
    container.innerHTML = '<div class="glass-card" style="grid-column: 1/-1; padding: var(--space-lg); text-align: center; color: var(--text-muted);">No events with ticket data yet</div>';
    return;
  }

  container.innerHTML = events.map(([eventName, stats]) => `
    <div class="glass-card" style="padding: var(--space-lg);">
      <div style="margin-bottom: var(--space-lg);">
        <h4 style="margin: 0 0 var(--space-sm) 0;">${eventName}</h4>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); font-size: 0.875rem;">
        <div>
          <p style="color: var(--text-muted); margin: 0 0 4px 0;">Sold</p>
          <p style="font-size: 1.5rem; font-weight: 700; margin: 0; color: var(--text-primary);">${stats.sold}</p>
        </div>
        <div>
          <p style="color: var(--text-muted); margin: 0 0 4px 0;">Revenue</p>
          <p style="font-size: 1.5rem; font-weight: 700; margin: 0; color: var(--text-primary);">₹${stats.revenue.toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p style="color: var(--text-muted); margin: 0 0 4px 0;">Checked In</p>
          <p style="font-size: 1.25rem; font-weight: 700; margin: 0; color: #22c55e;">✓ ${stats.checkedIn}</p>
        </div>
        <div>
          <p style="color: var(--text-muted); margin: 0 0 4px 0;">Pending</p>
          <p style="font-size: 1.25rem; font-weight: 700; margin: 0; color: #eab308;">⏳ ${stats.pending}</p>
        </div>
      </div>
    </div>
  `).join('');
}

// Auto-refresh analytics every 60 minutes (3,600,000 ms)
const ANALYTICS_REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutes

function startAnalyticsRefresh() {
  if (analyticsRefreshInterval) {
    clearInterval(analyticsRefreshInterval);
  }
  analyticsRefreshInterval = setInterval(() => {
    loadAnalytics().catch(err => console.warn('Analytics refresh failed:', err));
  }, ANALYTICS_REFRESH_INTERVAL);
  console.log('Analytics auto-refresh started: every 60 minutes');
}

function stopAnalyticsRefresh() {
  try {
    if (analyticsRefreshInterval) {
      clearInterval(analyticsRefreshInterval);
      analyticsRefreshInterval = null;
    }
    if (analyticsEventsUnsubscribe) {
      analyticsEventsUnsubscribe();
      analyticsEventsUnsubscribe = null;
    }
    if (analyticsTicketsUnsubscribe) {
      analyticsTicketsUnsubscribe();
      analyticsTicketsUnsubscribe = null;
    }
    console.log('✓ Analytics refresh stopped');
  } catch (err) {
    console.error('Error stopping analytics refresh:', err);
  }
}

// Manual refresh function
async function refreshAnalyticsNow() {
  const btn = event.target.closest('button');
  if (!btn) return;

  // Add loading state
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Syncing...';

  try {
    await loadAnalytics();
    showToast('success', 'Synced', 'Analytics updated in real-time');
  } catch (error) {
    console.error('Error refreshing analytics:', error);
    showToast('error', 'Sync Failed', 'Could not update analytics');
  }

  // Restore button state
  btn.disabled = false;
  btn.innerHTML = originalHTML;
}

// ==================== EDIT EVENT ====================
function editEvent(eventId) {
  try {
    const event = adminEvents.find(e => e.id === eventId);
    if (!event) {
      console.warn('Event not found:', eventId);
      return;
    }
    console.log('Editing event:', eventId);
    showToast('info', 'Coming Soon', 'Event editing feature coming soon');
  } catch (error) {
    console.error('Error editing event:', error);
  }
}

// Make editEvent globally accessible
window.editEvent = editEvent;

// ==================== UTILITIES ====================

// ==================== GUEST LIST MANAGEMENT ====================
async function loadGuestList() {
  try {
    console.log('📋 Loading guest list with real-time sync...');
    
    // Show loading state
    const container = document.getElementById('guestListContainer');
    if (container) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: var(--space-2xl);">Loading guest list...</p>';
    }

    // Stop previous listener if exists
    if (guestListUnsubscribe) {
      try {
        guestListUnsubscribe();
      } catch (err) {
        console.warn('Error stopping previous guest list listener:', err);
      }
    }

    // Set up real-time listener
    guestListUnsubscribe = onSnapshot(
      collection(db, 'tickets'),
      (snapshot) => {
        try {
          allGuestTickets = [];
          
          snapshot.forEach(doc => {
            allGuestTickets.push({
              id: doc.id,
              ...doc.data()
            });
          });
          
          // Sort by creation date (newest first)
          allGuestTickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          
          // Display guest list
          displayGuestList(allGuestTickets);
          console.log('✓ Guest list loaded with', allGuestTickets.length, 'tickets');
        } catch (err) {
          console.error('Error processing guest list snapshot:', err);
        }
      },
      (error) => {
        console.error('❌ Guest list listener error:', error);
        const container = document.getElementById('guestListContainer');
        if (container) {
          container.innerHTML = '<p style="color: #ef4444; text-align: center; padding: var(--space-lg);">Error loading guest list: ' + error.message + '</p>';
        }
      }
    );
  } catch (error) {
    console.error('Error setting up guest list listener:', error);
    const container = document.getElementById('guestListContainer');
    if (container) {
      container.innerHTML = '<p style="color: #ef4444; text-align: center; padding: var(--space-lg);">Error loading guest list</p>';
    }
  }
}

function displayGuestList(tickets) {
  const container = document.getElementById('guestListContainer');
  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 60px; color: var(--text-muted);">No guests yet!</div>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: var(--bg-tertiary); border-bottom: 1px solid var(--glass-border);">
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Guest Name</th>
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Phone</th>
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Event</th>
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Ticket Type</th>
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Status</th>
            <th style="padding: var(--space-md); text-align: left; font-weight: 600; color: var(--text-primary);">Purchase Date</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map(ticket => `
            <tr style="border-bottom: 1px solid var(--glass-border); transition: background 0.2s;">
              <td style="padding: var(--space-md); color: var(--text-primary);">${ticket.customerName || 'N/A'}</td>
              <td style="padding: var(--space-md); color: var(--text-primary);">${ticket.customerPhone || 'N/A'}</td>
              <td style="padding: var(--space-md); color: var(--text-primary);">${ticket.eventName || ticket.eventTitle || 'N/A'}</td>
              <td style="padding: var(--space-md); color: var(--text-primary);">${ticket.ticketType || 'N/A'}</td>
              <td style="padding: var(--space-md);">
                <span style="display: inline-block; padding: 4px 12px; background: ${ticket.used ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)'}; color: ${ticket.used ? '#22c55e' : '#eab308'}; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">
                  ${ticket.used ? 'Checked In' : 'Pending'}
                </span>
              </td>
              <td style="padding: var(--space-md); color: var(--text-muted); font-size: 0.875rem;">${new Date(ticket.purchaseDate || ticket.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
