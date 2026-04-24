// ============================================
// Firebase Initialization - Import from firebase.js
// ============================================
import { auth, db } from "./firebase.js";
import {
  getFirestore,
  addDoc,
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as Auth from './auth.js';

// Export all Firebase functions globally
window.db = db;
window.auth = auth;
window.Auth = Auth;
window.getFirestore = getFirestore;
window.addDoc = addDoc;
window.collection = collection;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.doc = doc;
window.updateDoc = updateDoc;

console.log('✓ Firebase initialized with all Firestore methods');

// ============================================
// RAAS DANDIYA EVENT - Premium Event Ticketing
// Complete JavaScript Application - Dynamic & INR Based
// ============================================

// ==================== UTILITIES ====================
function formatINR(amount) {
  return '₹' + amount.toLocaleString('en-IN');
}

// ==================== DATA ====================
// Events will be loaded from Firebase in loadEventsFromFirebase()
let events = [];
let userTickets = []; // In-memory only, NOT using localStorage

// State
let currentPage = 'landing';
let selectedEvent = null;
let selectedTickets = { single: 0, couple: 0, group: 0 };
let checkoutStep = 1;

// ==================== INITIALIZATION ====================
// Set initial opacity to 0 to prevent flicker
document.body.style.opacity = "0";

// Initialize persistence and auth listeners from auth.js
Auth.initializePersistence();
Auth.initializeAuthStateListener();

// ============================================
// 🔥 GLOBAL AUTH STATE MANAGEMENT
// Handles redirects based on user role + page location
// ============================================
let authCheckComplete = false;

onAuthStateChanged(auth, async (user) => {
  console.log('📱 Auth state changed. User:', user ? user.uid : 'none');
  
  // ❌ NOT LOGGED IN → Go to login
  if (!user) {
    console.log('❌ No user logged in - redirecting to login');
    if (!window.location.pathname.includes('login')) {
      window.location.href = 'login.html';
    }
    return;
  }

  // ✅ LOGGED IN → Get role and handle redirects
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.warn('⚠ User document not found');
      document.body.style.opacity = "1";
      return;
    }

    const role = userSnap.data().role;
    const phone = user.phoneNumber;

    console.log('✅ Auth check complete:', {
      phone: phone,
      role: role,
      path: window.location.pathname
    });

    const path = window.location.pathname;

    // 🔥 OWNER - Force role and redirect appropriately
    if (phone === '+917738427824') {
      console.log('✅ OWNER detected - forcing role');
      
      // Force owner role in Firestore
      await setDoc(userRef, {
        phone: phone,
        role: 'owner',
        isOwner: true
      }, { merge: true });

      // Redirect from login pages to admin
      if (path.includes('login') || path.includes('admin-login') || path.includes('scan-login')) {
        console.log('👉 Redirecting owner to admin.html');
        window.location.href = 'admin.html';
        return;
      }

      // Allow access to admin/scan/events
      console.log('✅ Owner access granted');
    }

    // 🔥 SCANNER - Redirect appropriately
    else if (role === 'scanner') {
      console.log('✅ SCANNER detected');

      // Redirect from login pages to scanner
      if (path.includes('login') || path.includes('admin-login') || path.includes('scan-login')) {
        console.log('👉 Redirecting scanner to scan.html');
        window.location.href = 'scan.html';
        return;
      }

      // Block admin access
      if (path.includes('admin')) {
        console.log('❌ Scanner trying to access admin - blocking');
        window.location.href = 'index.html';
        return;
      }

      // Allow scan + events
      console.log('✅ Scanner access granted');
    }

    // 🔥 NORMAL USER
    else if (role === 'user') {
      console.log('✅ USER (normal) detected');

      // Block admin access
      if (path.includes('admin')) {
        console.log('❌ User trying to access admin - blocking');
        window.location.href = 'index.html';
        return;
      }

      // Block scanner access
      if (path.includes('scan')) {
        console.log('❌ User trying to access scanner - blocking');
        window.location.href = 'index.html';
        return;
      }

      // Allow events page
      console.log('✅ User access granted');
    }

    // Show page content
    document.body.style.opacity = "1";
    authCheckComplete = true;

    // Initialize page (events page)
    console.log('✓ User authenticated, initializing app with ID:', user.uid);
    updateRoleBasedUI(role);
    initParticles();
    loadEventsFromFirebase();
    renderUserTickets();
    renderEventsTable();
    initScrollEffects();
    drawChart();

  } catch (error) {
    console.error('❌ Auth check error:', error);
    document.body.style.opacity = "1";
  }
});

// ============================================
// UPDATE UI BASED ON USER ROLE
// ============================================
function updateRoleBasedUI(role) {
  // Show admin button only for owner
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.style.display = role === 'owner' ? 'inline-flex' : 'none';
    adminBtn.onclick = () => window.location.href = 'admin.html';
  }
  
  // Show scanner button for scanner and owner
  const scannerBtn = document.getElementById('scannerBtn');
  if (scannerBtn) {
    scannerBtn.style.display = (role === 'scanner' || role === 'owner') ? 'inline-flex' : 'none';
    scannerBtn.onclick = () => window.location.href = 'scan.html';
  }
}

// Load events from Firebase Firestore
async function loadEventsFromFirebase() {
  try {
    if (!window.db) {
      throw new Error('Firebase database not initialized');
    }

    const querySnapshot = await getDocs(collection(window.db, "events"));
    events = [];
    
    querySnapshot.forEach((doc) => {
      const eventData = doc.data();
      const eventId = doc.id;
      
      // Filter: Only load active, postponed, and inactive events
      // Hidden: cancelled events
      if (eventData.status === 'cancelled') {
        console.log('⊘ Skipping cancelled event:', eventId);
        return;
      }
        
      // Transform Firestore data to app format
      const ticketTypes = [];
      if (eventData.priceSingle) ticketTypes.push({ id: 'single', name: 'Single Pass', price: eventData.priceSingle, description: 'Entry pass' });
      if (eventData.priceCouple) ticketTypes.push({ id: 'couple', name: 'Couple Pass', price: eventData.priceCouple, description: 'Entry pass for 2' });
      if (eventData.priceGroup5) ticketTypes.push({ id: 'group5', name: 'Group of 5', price: eventData.priceGroup5, description: 'Entry pass for 5' });
      if (eventData.priceGroup10) ticketTypes.push({ id: 'group10', name: 'Group of 10', price: eventData.priceGroup10, description: 'Entry pass for 10' });
      if (eventData.priceGroup20) ticketTypes.push({ id: 'group20', name: 'Group of 20', price: eventData.priceGroup20, description: 'Entry pass for 20' });
      
      const basePrice = ticketTypes.length > 0 ? Math.min(...ticketTypes.map(t => t.price)) : 0;
      const eventStatus = eventData.status || 'active';
      
      events.push({
        id: eventId,
        title: eventData.eventName || 'Untitled Event',
        date: eventData.eventDate || new Date().toISOString().split('T')[0],
        time: eventData.eventTime || '00:00',
        image: eventData.banner || eventData.image || 'https://via.placeholder.com/400x300?text=Event',
        category: eventData.category || 'Other',
        description: eventData.description || '',
        venue: { name: eventData.venue || 'Venue TBD', type: 'decided' },
        ticketTypes: ticketTypes,
        basePrice: basePrice,
        featured: eventData.featured || false,
        status: eventStatus,
        createdAt: eventData.createdAt || new Date(),
        bookingDisabled: eventStatus === 'inactive',
        isPostponed: eventStatus === 'postponed'
      });
    });
    
    console.log('✓ Loaded', events.length, 'active events from Firestore');
    
    // Sort by date
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Render featured and all events
    renderFeaturedEvents();
    renderAllEvents();
  } catch (error) {
    console.error('Error loading events from Firebase:', error);
    // Fallback to empty events
    events = [];
    renderFeaturedEvents();
    renderAllEvents();
  }
}

// ==================== PARTICLES ====================
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.animationDuration = (15 + Math.random() * 10) + 's';
    container.appendChild(particle);
  }
}

// ==================== SCROLL EFFECTS ====================
function initScrollEffects() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ==================== PAGE NAVIGATION ====================
function showPage(pageName) {
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => {
    page.classList.remove('active');
    page.style.display = 'none';
  });
  
  const targetPage = document.getElementById(pageName + '-page');
  if (targetPage) {
    targetPage.classList.add('active');
    targetPage.style.display = 'block';
    targetPage.classList.add('page-transition');
    currentPage = pageName;
    
    // Reload tickets when dashboard is viewed
    if (pageName === 'user-dashboard') {
      // Reload from Firebase (no localStorage)
      renderUserTickets();
    }
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToSection(sectionId) {
  setTimeout(() => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  }, 100);
}

// ==================== RENDER EVENTS ====================
function renderFeaturedEvents() {
  const container = document.getElementById('featured-events-grid');
  if (!container) return;
  
  const featured = events.filter(e => e.featured).slice(0, 4);
  
  if (featured.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">No featured events yet. Check back soon!</div>';
    return;
  }
  
  container.innerHTML = featured.map(event => createEventCard(event)).join('');
}

function renderAllEvents() {
  const container = document.getElementById('all-events-grid');
  if (!container) return;
  
  if (events.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">No events available yet.</div>';
    return;
  }
  
  container.innerHTML = events.map(event => createEventCard(event)).join('');
}

function createEventCard(event) {
  const date = new Date(event.date);
  const formattedDate = date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  const minPrice = Math.min(
    event.ticketTypes.length > 0 ? Math.min(...event.ticketTypes.map(t => t.price)) : event.basePrice || 0,
    event.basePrice || 0
  );
  
  // Handle postponed events
  let displayDate = formattedDate;
  let displayTime = event.time;
  let statusBadge = '';
  let bookingDisabled = false;
  
  if (event.status === 'postponed') {
    displayDate = 'To Be Announced';
    displayTime = '';
    statusBadge = '<span style="position: absolute; top: 10px; right: 10px; background: rgba(234, 179, 8, 0.9); color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">🔄 POSTPONED</span>';
    bookingDisabled = true;
  } else if (event.status === 'inactive') {
    statusBadge = '<span style="position: absolute; top: 10px; right: 10px; background: rgba(107, 114, 128, 0.9); color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">⭕ INACTIVE</span>';
    bookingDisabled = true;
  } else if (event.status === 'cancelled') {
    statusBadge = '<span style="position: absolute; top: 10px; right: 10px; background: rgba(239, 68, 68, 0.9); color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700;">❌ CANCELLED</span>';
    bookingDisabled = true;
  }
  
  return `
    <div class="event-card hover-lift" onclick="${bookingDisabled ? '' : `openEventDetails('${event.id}')`}" style="${bookingDisabled ? 'opacity: 0.7; cursor: not-allowed;' : 'cursor: pointer;'}">
      <div class="event-card-image">
        <img src="${event.image || 'https://via.placeholder.com/400x300?text=Event+Image'}" alt="${event.title}" loading="lazy">
        <span class="event-card-badge">${event.category}</span>
        ${statusBadge}
        <button class="event-card-favorite" onclick="event.stopPropagation(); toggleFavorite('${event.id}')" ${bookingDisabled ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="event-card-content">
        <div class="event-card-date">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${displayDate}${displayTime ? ' • ' + displayTime : ''}
        </div>
        <h3 class="event-card-title">${event.title}</h3>
        <div class="event-card-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${event.venue && event.venue.name ? event.venue.name : 'Venue TBD'}
        </div>
        <div class="event-card-footer">
          <div class="event-card-price">
            ${formatINR(minPrice)} <span>onwards</span>
          </div>
          <button class="btn btn-primary" style="padding: 8px 16px; font-size: 0.875rem;" onclick="event.stopPropagation(); ${bookingDisabled ? 'showToast(\"info\", \"Event Not Available\", \"' + (event.status === 'postponed' ? 'This event has been postponed' : event.status === 'cancelled' ? 'This event has been cancelled' : 'Bookings not available') + '.\");' : `openEventDetails('${event.id}');`}" ${bookingDisabled ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
            ${bookingDisabled ? 'Not Available' : 'Book Now'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==================== EVENT DETAILS ====================
function openEventDetails(eventId) {
  selectedEvent = events.find(e => e.id === eventId);
  if (!selectedEvent) return;
  
  // Don't allow opening cancelled events
  if (selectedEvent.status === 'cancelled') {
    showToast('error', 'Event Cancelled', 'This event has been cancelled');
    return;
  }
  
  const date = new Date(selectedEvent.date);
  const formattedDate = selectedEvent.status === 'postponed' 
    ? 'To Be Announced' 
    : date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const container = document.getElementById('event-details-content');
  if (!container) return;
  
  const venueDisplay = selectedEvent.status === 'postponed' 
    ? 'To Be Announced'
    : (selectedEvent.venue && selectedEvent.venue.name ? selectedEvent.venue.name : 'Venue to be decided');
  
  const timeDisplay = selectedEvent.status === 'postponed' ? '' : selectedEvent.time;
  const isBookingDisabled = selectedEvent.status === 'inactive' || selectedEvent.status === 'postponed';
  
  const ticketTypesHTML = selectedEvent.ticketTypes.map(type => `
    <div class="ticket-type" id="ticket-${type.id}" ${isBookingDisabled ? 'style="opacity: 0.5;"' : ''}>
      <div class="ticket-info">
        <h4>${type.name}</h4>
        <p>${type.description || 'Entry pass'}</p>
      </div>
      <div style="display: flex; align-items: center; gap: var(--space-lg);">
        <span class="ticket-price">${formatINR(type.price)}</span>
        <div class="ticket-quantity">
          <button class="qty-btn" onclick="updateQuantity('${type.id}', -1)" ${isBookingDisabled ? 'disabled' : ''}>−</button>
          <span class="qty-value" id="qty-${type.id}">0</span>
          <button class="qty-btn" onclick="updateQuantity('${type.id}', 1)" ${isBookingDisabled ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div style="max-width: 1400px; margin: 0 auto; padding: var(--space-lg);">
      <button class="btn btn-secondary" style="margin-bottom: var(--space-lg);" onclick="window.history.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back
      </button>
    </div>
    <div class="relative" style="height: 400px; overflow: hidden; position: relative;">
      <img src="${selectedEvent.image}" alt="${selectedEvent.title}" style="width: 100%; height: 100%; object-fit: cover; filter: brightness(0.5);">
      ${isBookingDisabled ? `<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><div style="background: rgba(0,0,0,0.7); padding: var(--space-lg); border-radius: var(--radius-lg); text-align: center; color: white;"><p style="margin: 0; font-size: 1.25rem; font-weight: 700;">${selectedEvent.status === 'postponed' ? '🔄 Event Postponed' : '⭕ Event Inactive'}</p><p style="margin: var(--space-sm) 0 0 0; color: rgba(255,255,255,0.8);">${selectedEvent.status === 'postponed' ? 'This event has been postponed. Date TBA.' : 'Bookings are not available for this event.'}</p></div></div>` : ''}
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: var(--space-2xl); background: linear-gradient(transparent, var(--bg-primary));">
        <div style="max-width: 1400px; margin: 0 auto;">
          <span class="section-badge" style="margin-bottom: var(--space-md); display: inline-block;">${selectedEvent.category}</span>
          <h1 style="font-size: clamp(2rem, 5vw, 3.5rem); margin-bottom: var(--space-md);">${selectedEvent.title}</h1>
          <div style="display: flex; gap: var(--space-xl); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>${formattedDate}</span>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${timeDisplay}</span>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>${venueDisplay}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div style="max-width: 1400px; margin: 0 auto; padding: clamp(var(--space-lg), 3vw, var(--space-2xl)); display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-2xl); width: 100%; box-sizing: border-box;">
      <!-- Left Column -->
      <div>
        <div class="glass-card" style="padding: var(--space-xl); margin-bottom: var(--space-xl);">
          <h3 style="margin-bottom: var(--space-lg);">About This Event</h3>
          <p style="line-height: 1.8;">${selectedEvent.description}</p>
        </div>
        
        ${selectedEvent.venue && selectedEvent.venue.mapUrl ? `
          <div class="glass-card" style="padding: var(--space-xl);">
            <h3 style="margin-bottom: var(--space-lg);">Venue Location</h3>
            <div style="height: 300px; border-radius: var(--radius-lg); overflow: hidden;">
              <iframe src="${selectedEvent.venue.mapUrl}" width="100%" height="100%" style="border: none;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            </div>
          </div>
        ` : `
          <div class="glass-card" style="padding: var(--space-xl);">
            <h3 style="margin-bottom: var(--space-lg);">Venue</h3>
            <div style="height: 200px; background: var(--bg-tertiary); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
              <span>${selectedEvent.status === 'postponed' ? 'Venue details will be announced soon' : 'Venue details will be announced soon'}</span>
            </div>
          </div>
        `}
      </div>
      
      <!-- Right Column - Ticket Selection -->
      <div>
        <div class="glass-card" style="padding: var(--space-xl); position: sticky; top: 100px;">
          ${isBookingDisabled ? `
            <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.3); padding: var(--space-lg); border-radius: var(--radius-lg); margin-bottom: var(--space-lg); text-align: center;">
              <p style="margin: 0; color: #eab308; font-weight: 600;">
                ${selectedEvent.status === 'postponed' ? '🔄 Event Postponed' : '⭕ Event Inactive'}
              </p>
              <p style="margin: var(--space-sm) 0 0 0; color: var(--text-muted); font-size: 0.875rem;">
                ${selectedEvent.status === 'postponed' ? 'New date will be announced soon' : 'Bookings are not available'}
              </p>
            </div>
          ` : ''}
          
          <h3 style="margin-bottom: var(--space-lg);">Select Tickets</h3>
          
          <div class="ticket-selector">
            ${ticketTypesHTML}
          </div>
          
          <div class="checkout-total">
            <span class="checkout-total-label">Total Amount</span>
            <span class="checkout-total-value" id="total-price">${formatINR(0)}</span>
          </div>
          
          <button class="btn btn-primary w-full" style="margin-top: var(--space-lg);" onclick="proceedToCheckout()" ${isBookingDisabled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            ${isBookingDisabled ? `${selectedEvent.status === 'postponed' ? 'Postponed' : 'Not Available'}` : 'Proceed to Checkout'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          
          <div class="trust-badges">
            <div class="trust-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Secure Payment
            </div>
            <div class="trust-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Instant Ticket
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  selectedTickets = {};
  selectedEvent.ticketTypes.forEach(type => {
    selectedTickets[type.id] = 0;
  });
  
  showPage('event-details');
}

// ==================== TICKET SELECTION ====================
function updateQuantity(typeId, change) {
  selectedTickets[typeId] = Math.max(0, (selectedTickets[typeId] || 0) + change);
  document.getElementById(`qty-${typeId}`).textContent = selectedTickets[typeId];
  
  const ticketEl = document.getElementById(`ticket-${typeId}`);
  if (selectedTickets[typeId] > 0) {
    ticketEl.classList.add('selected');
  } else {
    ticketEl.classList.remove('selected');
  }
  
  updateTotal();
}

function updateTotal() {
  if (!selectedEvent) return;
  
  let total = 0;
  selectedEvent.ticketTypes.forEach(type => {
    total += (selectedTickets[type.id] || 0) * type.price;
  });
  
  document.getElementById('total-price').textContent = formatINR(total);
}

// Alias for openEventDetails (used in onclick handlers)
function bookEvent(eventId) {
  return openEventDetails(eventId);
}

// Calculate total price from selected tickets
function getTotalPrice() {
  if (!selectedEvent) return 0;
  
  let total = 0;
  selectedEvent.ticketTypes.forEach(type => {
    total += (selectedTickets[type.id] || 0) * type.price;
  });
  
  return total;
}

// ==================== CHECKOUT ====================
function proceedToCheckout() {
  const total = getTotalPrice();
  
  if (total === 0) {
    showToast('error', 'No Tickets Selected', 'Please select at least one ticket');
    return;
  }

  // CRITICAL: Verify user is authenticated before allowing checkout
  const user = auth.currentUser;
  if (!user) {
    showToast('error', 'Login Required', 'Please login to book tickets');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
    return;
  }
  
  // CRITICAL: Verify window.currentUserId is set (auth state initialized)
  if (!window.currentUserId) {
    showToast('error', 'Authentication Error', 'Please wait for authentication to complete');
    return;
  }
  
  checkoutStep = 1;
  renderCheckout();
  showPage('checkout');
}

function renderCheckout() {
  const container = document.getElementById('checkout-content');
  if (!container) return;
  
  let total = 0;
  selectedEvent.ticketTypes.forEach(type => {
    total += (selectedTickets[type.id] || 0) * type.price;
  });
  
  if (checkoutStep === 1) {
    let ticketSummary = '';
    selectedEvent.ticketTypes.forEach(type => {
      if (selectedTickets[type.id] > 0) {
        ticketSummary += `
          <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
            <span>${type.name} × ${selectedTickets[type.id]}</span>
            <span>${formatINR(selectedTickets[type.id] * type.price)}</span>
          </div>
        `;
      }
    });
    
    container.innerHTML = `
      <div class="checkout-card">
        <h3 style="margin-bottom: var(--space-xl);">Order Summary</h3>
        
        <div style="margin-bottom: var(--space-xl);">
          <h4 style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: var(--space-sm);">EVENT</h4>
          <p style="font-size: 1.125rem; font-weight: 600;">${selectedEvent.title}</p>
          <p style="color: var(--text-muted);">${new Date(selectedEvent.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })} • ${selectedEvent.time}</p>
        </div>
        
        <div style="border-top: 1px solid var(--glass-border); padding-top: var(--space-lg); margin-bottom: var(--space-lg);">
          ${ticketSummary}
        </div>
        
        <div class="checkout-total">
          <span class="checkout-total-label">Total</span>
          <span class="checkout-total-value">${formatINR(total)}</span>
        </div>
        
        <button class="btn btn-primary w-full" style="margin-top: var(--space-xl);" onclick="goToPayment()">
          Continue to Payment
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    `;
  } else if (checkoutStep === 2) {
    container.innerHTML = `
      <div class="checkout-card">
        <h3 style="margin-bottom: var(--space-xl);">Payment Details</h3>
        
        <div class="input-group">
          <label>Full Name</label>
          <input type="text" id="paymentName" placeholder="Enter your full name" required>
        </div>
        
        <div class="input-group">
          <label>Email</label>
          <input type="email" id="paymentEmail" placeholder="your@email.com" required>
        </div>
        
        <div class="input-group">
          <label>Phone Number</label>
          <input type="tel" id="paymentPhone" placeholder="+91 XXXXXXXXXX" required>
        </div>
        
        <div class="checkout-total" style="margin-top: var(--space-xl);">
          <span class="checkout-total-label">Amount to Pay</span>
          <span class="checkout-total-value">${formatINR(total)}</span>
        </div>
        
        <button class="btn btn-primary w-full" style="margin-top: var(--space-xl);" onclick="processPayment(${total})">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Proceed to Payment - ${formatINR(total)}
        </button>
        
        <div class="trust-badges">
          <div class="trust-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            256-bit SSL
          </div>
          <div class="trust-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Secure
          </div>
        </div>
      </div>
    `;
  }
  
  updateProgressSteps();
}

function goToPayment() {
  checkoutStep = 2;
  renderCheckout();
}

async function processPayment(total) {
  const name = document.getElementById('paymentName')?.value;
  const email = document.getElementById('paymentEmail')?.value;
  const phone = document.getElementById('paymentPhone')?.value;
  
  if (!name || !email || !phone) {
    showToast('error', 'Missing Information', 'Please fill in all details');
    return;
  }

  if (!selectedEvent) {
    showToast('error', 'Event Error', 'Event data missing');
    return;
  }

  // CRITICAL: Verify user is still authenticated
  const user = auth.currentUser;
  if (!user) {
    showToast('error', 'Authentication Lost', 'Your session expired. Please login again.');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
    return;
  }

  // CRITICAL: Verify window.currentUserId is set
  if (!window.currentUserId) {
    showToast('error', 'Authentication Error', 'User ID not initialized. Please refresh and try again.');
    return;
  }

  // Show loading state
  showToast('info', 'Processing', 'Creating your tickets...');

  try {
    // Create tickets directly in Firebase
    await generateAndSaveTickets(name, email, phone, total);
    
    showToast('success', 'Tickets Created!', 'Your tickets have been saved');
    
    // Redirect to My Tickets
    setTimeout(() => {
      window.location.href = 'tickets.html';
    }, 1500);
  } catch (error) {
    console.error('❌ Error creating tickets:', error);
    
    // Handle specific Firebase permission errors
    if (error.message.includes('Missing or insufficient permissions')) {
      showToast('error', 'Permission Error', 'Unable to save tickets. Please try again.');
    } else if (error.message.includes('not authenticated')) {
      showToast('error', 'Authentication Error', 'Please login and try again.');
    } else {
      showToast('error', 'Error', error.message || 'Failed to create tickets');
    }
  }
}

// Generate unique formatted ticket code for display
function generateTicketCode(ticketId) {
  const hash = ticketId.replace(/[^0-9]/g, '').slice(-12).padStart(12, '0');
  const parts = [
    hash.slice(0, 2).toUpperCase(),
    hash.slice(2, 5),
    hash.slice(5, 8),
    hash.slice(8, 11)
  ];
  return parts.join(' ');
}

async function generateAndSaveTickets(name, email, phone, totalAmount) {
  const generatedTickets = [];
  let ticketsCreated = 0;

  // CRITICAL SECURITY: Verify user is authenticated from BOTH sources
  const user = auth.currentUser;
  if (!user || !window.currentUserId) {
    console.error('✗ Security Error: No authenticated user');
    console.error('  - auth.currentUser:', user?.uid || 'null');
    console.error('  - window.currentUserId:', window.currentUserId || 'null');
    throw new Error('User not authenticated');
  }
  
  // Verify IDs match
  if (user.uid !== window.currentUserId) {
    console.error('✗ Security Error: User ID mismatch');
    throw new Error('Authentication state mismatch');
  }

  try {
    for (const typeId of Object.keys(selectedTickets)) {
      const quantity = selectedTickets[typeId];

      if (quantity > 0) {
        const type = selectedEvent.ticketTypes.find(t => t.id === typeId);
        if (!type) throw new Error('Invalid ticket type selected');

        for (let i = 0; i < quantity; i++) {
          // CRITICAL: Generate unique ticketId BEFORE creating document
          // Format: TKT_userId_timestamp_counter (ensures uniqueness and queryability)
          const generatedTicketId = `TKT_${user.uid.slice(-6)}_${Date.now()}_${i}`;
          
          // Create ticket object with complete information
          // MANDATORY: Always include userId for Firestore security rules
          const ticket = {
            ticketId: generatedTicketId, // MUST be string for Firestore rules
            userId: user.uid, // CRITICAL: Use auth.currentUser.uid for reliability
            eventId: selectedEvent.id,
            eventTitle: selectedEvent.title,
            eventName: selectedEvent.title,
            eventDate: selectedEvent.date,
            eventTime: selectedEvent.time,
            venue: selectedEvent.venue?.name || 'Venue TBD',
            ticketType: type.name, // MUST be string for Firestore rules
            price: type.price,
            customerName: name,
            customerEmail: email,
            customerPhone: phone || user.phoneNumber || '',
            used: false, // MUST be false for Firestore rules
            usedAt: null,
            createdAt: serverTimestamp(),
            purchaseDate: serverTimestamp(),
            qrData: generatedTicketId, // Use same ID for QR code
            status: 'active'
          };
          
          // Validate ticket object has required fields for Firestore rules
          if (!ticket.userId || !ticket.eventId || !ticket.ticketType || !ticket.ticketId) {
            throw new Error('Incomplete ticket data: missing userId, eventId, ticketType, or ticketId');
          }
          
          if (typeof ticket.ticketId !== 'string' || typeof ticket.ticketType !== 'string') {
            throw new Error('ticketId and ticketType must be strings');
          }
          
          if (ticket.used !== false) {
            throw new Error('Ticket must have used: false');
          }

          // FIX: Use addDoc to ensure unique ID and prevent overwrites
          try {
            // Verify Firestore connection before creating ticket
            if (!window.db) {
              throw new Error('Firebase database not initialized');
            }
            
            // Create ticket with full data (no need for update after)
            const docRef = await addDoc(collection(window.db, "tickets"), ticket);
            const firestoreDocId = docRef.id;
            
            console.log('✓ Ticket created in Firebase');
            console.log('  - Ticket ID:', ticket.ticketId);
            console.log('  - Firestore Doc ID:', firestoreDocId);
            console.log('  - User ID:', ticket.userId);
            console.log('  - Event ID:', ticket.eventId);
            
          } catch (firebaseError) {
            console.error('✗ Error saving ticket to Firebase:', firebaseError);
            console.error('  - Error code:', firebaseError.code);
            console.error('  - Error message:', firebaseError.message);
            console.error('  - Ticket data:', {
              userId: ticket.userId,
              eventId: ticket.eventId,
              ticketId: ticket.ticketId,
              ticketType: ticket.ticketType,
              used: ticket.used
            });
            
            // Provide helpful error messages
            if (firebaseError.code === 'permission-denied') {
              throw new Error('Permission denied: Unable to create tickets. Ensure you are logged in.');
            } else if (firebaseError.message.includes('not initialized')) {
              throw new Error('Database connection error. Please try again.');
            } else {
              throw new Error(`Failed to save ticket ${i + 1}: ${firebaseError.message}`);
            }
          }

          generatedTickets.push(ticket);
          ticketsCreated++;
        }
      }
    }

    if (ticketsCreated === 0) {
      throw new Error('No tickets were selected');
    }

    console.log('✓ All tickets created successfully:', ticketsCreated);
  } catch (error) {
    console.error('✗ Error generating tickets:', error);
    showToast('error', 'Error Creating Tickets', error.message || 'An unexpected error occurred');
    throw error;
  }

  // Tickets are saved to Firebase
  showConfirmation(generatedTickets, ticketsCreated);
}

function showConfirmation(generatedTickets, ticketsCreated) {
  const container = document.getElementById('confirmation-details');
  if (!container) return;
  
  // Get first ticket for customer info
  const firstTicket = generatedTickets[0];
  
  // Calculate total amount paid
  let totalPaid = 0;
  generatedTickets.forEach(t => totalPaid += t.price);
  
  // Group tickets by type for display
  const ticketsByType = {};
  generatedTickets.forEach(t => {
    if (!ticketsByType[t.ticketType]) {
      ticketsByType[t.ticketType] = 0;
    }
    ticketsByType[t.ticketType]++;
  });
  
  let ticketsSummary = '';
  Object.entries(ticketsByType).forEach(([type, count]) => {
    const ticketInfo = generatedTickets.find(t => t.ticketType === type);
    ticketsSummary += `
      <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
        <div>
          <strong>${type}</strong>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">Valid for ${ticketInfo.peoplePermitted || 1} ${(ticketInfo.peoplePermitted || 1) === 1 ? 'person' : 'people'}</p>
        </div>
        <div style="text-align: right;">
          <strong>×${count}</strong>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">₹${(ticketInfo.price * count).toLocaleString('en-IN')}</p>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = `
    <div style="text-align: center; margin-bottom: var(--space-2xl);">
      <div style="width: 120px; height: 120px; margin: 0 auto var(--space-lg); background: var(--accent-green); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 3rem; box-shadow: 0 0 60px rgba(16, 185, 129, 0.5); animation: scaleIn 0.5s ease;">✓</div>
    </div>
    
    <div class="checkout-card">
      <h3 style="margin-bottom: var(--space-lg);">Booking Confirmed!</h3>
      <p style="color: var(--text-secondary); margin-bottom: var(--space-lg);">
        <strong>${ticketsCreated} Ticket${ticketsCreated > 1 ? 's' : ''}</strong> generated and sent to <strong>${firstTicket.customerEmail}</strong>
      </p>
      
      <div style="background: var(--bg-tertiary); padding: var(--space-lg); border-radius: var(--radius-lg); margin-bottom: var(--space-lg);">
        <div style="margin-bottom: var(--space-md);">
          <h4 style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">EVENT</h4>
          <p style="font-size: 1.125rem; font-weight: 600;">${firstTicket.eventTitle}</p>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 5px 0;">📅 ${new Date(firstTicket.eventDate).toLocaleDateString('en-IN')} • ⏰ ${firstTicket.eventTime}</p>
        </div>
        
        <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: var(--space-lg); margin-bottom: var(--space-lg);">
          <h4 style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">YOUR TICKETS</h4>
          ${ticketsSummary}
        </div>
        
        <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: var(--space-lg);">
          <h4 style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">TOTAL AMOUNT PAID</h4>
          <p style="font-size: 1.25rem; font-weight: 600; color: var(--accent-green);">₹${totalPaid.toLocaleString('en-IN')}</p>
        </div>
      </div>
      
      <div style="background: rgba(16, 185, 129, 0.1); padding: var(--space-lg); border-radius: var(--radius-lg); margin-bottom: var(--space-lg); border-left: 4px solid var(--accent-green);">
        <p style="margin: 0; color: var(--accent-green); font-weight: 600;">✓ Each ticket has a unique QR code</p>
        <p style="margin: 5px 0 0 0; color: var(--text-muted); font-size: 0.875rem;">View all tickets in "My Tickets" and download PDFs</p>
      </div>
      
      <div style="display: flex; gap: var(--space-md);">
        <button class="btn btn-primary" onclick="window.location.href='tickets.html'">
          View My Tickets
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='index.html'">
          Back to Home
        </button>
      </div>
    </div>
  `;
}

function updateProgressSteps() {
  for (let i = 1; i <= 2; i++) {
    const step = document.getElementById(`step-${i}`);
    if (!step) continue;
    
    if (i < checkoutStep) {
      step.classList.add('completed');
      step.classList.remove('active');
    } else if (i === checkoutStep) {
      step.classList.add('active');
      step.classList.remove('completed');
    } else {
      step.classList.remove('active', 'completed');
    }
  }
}

// ==================== USER TICKETS ====================
function renderUserTickets() {
  const container = document.getElementById('user-tickets-container');
  if (!container) return;
  
  if (userTickets.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">You haven\'t booked any tickets yet.</div>';
    return;
  }
  
  container.innerHTML = `<div class="events-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
    ${userTickets.map(ticket => `
    <div class="glass-card" style="padding: var(--space-xl);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-lg);">
        <div>
          <h3>${ticket.eventTitle}</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem;">${ticket.id}</p>
        </div>
        <span class="badge ${ticket.used || ticket.status === 'used' ? 'badge-muted' : ticket.status === 'active' ? 'badge-success' : 'badge-muted'}">${ticket.used || ticket.status === 'used' ? 'USED' : ticket.status}</span>
      </div>
      
      <div style="border-top: 1px solid var(--glass-border); padding-top: var(--space-lg); margin-bottom: var(--space-lg);">
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">📅 ${new Date(ticket.eventDate).toLocaleDateString('en-IN')} • ⏰ ${ticket.eventTime}</p>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">📍 ${ticket.venue}</p>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">🎫 ${ticket.ticketType} (Valid for ${ticket.peoplePermitted || 1} ${(ticket.peoplePermitted || 1) === 1 ? 'person' : 'people'})</p>
        <p style="color: var(--accent-green); font-weight: 600; margin-bottom: var(--space-sm);">Total: ${formatINR(ticket.totalPrice)}</p>
      </div>
      
      <button class="btn btn-primary w-full" onclick="viewTicketDetails('${ticket.id}')" ${ticket.used || ticket.status === 'used' ? 'disabled' : ''}>
        ${ticket.used || ticket.status === 'used' ? '✓ Already Used' : 'View QR Code'}
      </button>
    </div>
  `).join('')}
  </div>`;
}

// Filter tickets by upcoming/past
function filterTickets(filter) {
  let filtered = userTickets;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (filter === 'upcoming') {
    filtered = userTickets.filter(t => new Date(t.eventDate) >= today);
  } else if (filter === 'past') {
    filtered = userTickets.filter(t => new Date(t.eventDate) < today);
  }
  
  const container = document.getElementById('user-tickets-container');
  if (!container) return;
  
  if (filtered.length === 0) {
    const filterText = filter === 'upcoming' ? 'upcoming' : 'past';
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">No ${filterText} tickets found.</div>`;
    return;
  }
  
  container.innerHTML = `<div class="events-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
    ${filtered.map(ticket => `
    <div class="glass-card" style="padding: var(--space-xl);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-lg);">
        <div>
          <h3>${ticket.eventTitle}</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem;">${ticket.id}</p>
        </div>
        <span class="badge ${ticket.used || ticket.status === 'used' ? 'badge-muted' : ticket.status === 'active' ? 'badge-success' : 'badge-muted'}">${ticket.used || ticket.status === 'used' ? 'USED' : ticket.status}</span>
      </div>
      
      <div style="border-top: 1px solid var(--glass-border); padding-top: var(--space-lg); margin-bottom: var(--space-lg);">
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">📅 ${new Date(ticket.eventDate).toLocaleDateString('en-IN')} • ⏰ ${ticket.eventTime}</p>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">📍 ${ticket.venue}</p>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">🎫 ${ticket.ticketType} (Valid for ${ticket.peoplePermitted || 1} ${(ticket.peoplePermitted || 1) === 1 ? 'person' : 'people'})</p>
        <p style="color: var(--accent-green); font-weight: 600; margin-bottom: var(--space-sm);">Total: ${formatINR(ticket.totalPrice)}</p>
      </div>
      
      <button class="btn btn-primary w-full" onclick="viewTicketDetails('${ticket.id}')" ${ticket.used || ticket.status === 'used' ? 'disabled' : ''}>
        ${ticket.used || ticket.status === 'used' ? '✓ Already Used' : 'View QR Code'}
      </button>
    </div>
  `).join('')}
  </div>`;
}

function viewTicketDetails(ticketId) {
  const ticket = userTickets.find(t => t.id === ticketId);
  if (!ticket) return;
  
  const ticketCode = generateTicketCode(ticket.id);
  
  const qrContainer = document.createElement('div');
  qrContainer.id = 'ticket-modal-' + ticket.id;
  qrContainer.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: clamp(12px, 2vw, 20px); box-sizing: border-box;" onclick="if(event.target === this) this.parentElement.remove()">
      <div class="glass-card" style="padding: clamp(var(--space-lg), 3vw, var(--space-2xl)); max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg); gap: var(--space-md);">
          <h2 style="margin: 0; font-size: clamp(1.25rem, 4vw, 1.5rem);">Your Ticket</h2>
          <button onclick="this.closest('[id^=ticket-modal-]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); flex-shrink: 0;">×</button>
        </div>
        
        <!-- Styled Professional QR Block -->
        <div style="background: linear-gradient(135deg, #f5e6d3 0%, #fef3e8 100%); padding: clamp(1rem, 3vw, 2rem); border-radius: clamp(1rem, 2vw, 1.5rem); margin-bottom: var(--space-lg); text-align: center; border: 2px solid #e8d5c4; box-shadow: 0 8px 24px rgba(0,0,0,0.15);">
          <div style="background: white; padding: clamp(1rem, 2vw, 1.5rem); border-radius: 1rem; display: inline-block; margin-bottom: clamp(1rem, 2vw, 1.5rem); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div id="qrcode-${ticket.id}" style="display: inline-block;"></div>
          </div>
          <p style="font-family: 'Courier New', monospace; font-size: clamp(0.875rem, 2vw, 1.125rem); font-weight: 700; color: #2c2c2c; letter-spacing: 0.15em; margin: 0; word-break: break-all;">${ticketCode}</p>
          <p style="font-size: 0.75rem; color: #666; margin-top: 0.5rem; letter-spacing: 0.05em;">TICKET CODE</p>
        </div>
        
        <div style="background: var(--bg-tertiary); padding: clamp(var(--space-md), 2vw, var(--space-lg)); border-radius: var(--radius-lg); margin-bottom: var(--space-lg); overflow-x: auto;">
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">CUSTOMER</p>
          <p style="font-weight: 600; margin-bottom: var(--space-lg); word-break: break-word;">${ticket.customerName}</p>
          
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">TICKET ID</p>
          <p style="font-family: monospace; font-weight: 600; margin-bottom: var(--space-lg); word-break: break-all; font-size: 0.875rem;">${ticket.id}</p>
          
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">EVENT</p>
          <p style="font-weight: 600; margin-bottom: var(--space-lg);">${ticket.eventTitle}</p>
          
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">DATE & TIME</p>
          <p style="font-weight: 600; margin-bottom: var(--space-lg);">${new Date(ticket.eventDate).toLocaleDateString('en-IN')} • ${ticket.eventTime}</p>
          
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">TICKET TYPE</p>
          <p style="font-weight: 600; margin-bottom: var(--space-lg);">${ticket.ticketType} (${ticket.peoplePermitted || 1} ${(ticket.peoplePermitted || 1) === 1 ? 'person' : 'people'})</p>
          
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: var(--space-sm);">AMOUNT PAID</p>
          <p style="font-weight: 600; color: var(--accent-green);">${formatINR(ticket.totalPrice)}</p>
        </div>
        
        <div style="display: flex; gap: var(--space-md);">
          <button class="btn btn-primary" style="flex: 1;" onclick="downloadTicketPDF('${ticket.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PDF
          </button>
          <button class="btn btn-secondary" style="flex: 1;" onclick="this.closest('[id^=ticket-modal-]').remove()">Close</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(qrContainer);
  
  // Generate QR code
  setTimeout(() => {
    new QRCode(document.getElementById(`qrcode-${ticket.id}`), {
      text: ticket.qrData,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }, 100);
}

function downloadTicketPDF(ticketId) {
  const ticket = userTickets.find(t => t.id === ticketId);
  if (!ticket) {
    showToast('error', 'Error', 'Ticket not found');
    return;
  }
  
  const ticketCode = generateTicketCode(ticket.id);
  
  // Create PDF content with optimal styling
  const element = document.createElement('div');
  element.style.padding = '40px';
  element.style.backgroundColor = 'white';
  element.style.fontFamily = 'Arial, sans-serif';
  element.style.width = '800px';
  element.style.margin = '0 auto';
  element.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="margin: 0; color: #8b5cf6; font-size: 28px; letter-spacing: 1px;">RAAS DANDIYA EVENT</h1>
      <p style="margin: 5px 0; color: #666; font-size: 12px;">Premium Event Ticketing Platform</p>
    </div>
    
    <div style="border: 3px solid #8b5cf6; border-radius: 15px; padding: 40px; margin-bottom: 30px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(6, 182, 212, 0.05) 100%);">
      <h2 style="text-align: center; margin-top: 0; color: #333; font-size: 24px;">🎫 EVENT TICKET</h2>
      
      <!-- Professional Styled QR Block -->
      <div style="background: linear-gradient(135deg, #f5e6d3 0%, #fef3e8 100%); padding: 2rem; border-radius: 1.5rem; margin: 30px 0; text-align: center; border: 2px solid #e8d5c4;">
        <div style="background: white; padding: 1.5rem; border-radius: 1rem; display: inline-block; margin-bottom: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 3px solid #f0e5d8;">
          <div id="qrcode-pdf-${ticketId}" style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center;"></div>
        </div>
        <p style="font-family: 'Courier New', monospace; font-size: 1.125rem; font-weight: 700; color: #2c2c2c; letter-spacing: 0.15em; margin: 0; word-break: break-all;">${ticketCode}</p>
        <p style="font-size: 0.75rem; color: #666; margin-top: 0.5rem; letter-spacing: 0.05em;">SCAN THIS QR CODE AT VENUE</p>
      </div>
      
      <!-- Ticket Details Table -->
      <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px; border-bottom: 2px solid #ddd; font-weight: bold; width: 40%; background: #f9f9f9;">Customer Name</td>
          <td style="padding: 12px; border-bottom: 2px solid #ddd; background: #fafafa;">${ticket.customerName || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Customer Email</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa; word-break: break-all;">${ticket.customerEmail || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Customer Phone</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${ticket.customerPhone || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Ticket ID</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-family: monospace; background: #fafafa; font-size: 0.9rem;">${ticket.id}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Event Name</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${ticket.eventTitle || ticket.eventName || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Event Date</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${new Date(ticket.eventDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Event Time</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${ticket.eventTime || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Venue</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${ticket.venue || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Ticket Type</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd; background: #fafafa;">${ticket.ticketType || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 12px; font-weight: bold; font-size: 16px; color: #10b981; background: rgba(16, 185, 129, 0.1);">Total Amount</td>
          <td style="padding: 12px; font-weight: bold; font-size: 16px; color: #10b981; background: rgba(16, 185, 129, 0.1);">₹${ticket.price ? ticket.price.toLocaleString('en-IN') : '0'}</td>
        </tr>
      </table>
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #eee; color: #666; font-size: 11px; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;"><strong>Status:</strong> ${ticket.used || ticket.status === 'used' ? '❌ USED / CHECKED-IN' : '✅ VALID / PENDING'}</p>
        <p style="margin: 0 0 8px 0;"><strong>Purchase Date:</strong> ${new Date(ticket.purchaseDate || ticket.createdAt || Date.now()).toLocaleDateString('en-IN')}</p>
        <p style="margin: 8px 0;"><em style="color: #999;">This is an official ticket. Scan the QR code at the event venue for entry. Please keep this ticket safe.</em></p>
      </div>
    </div>
    
    <div style="text-align: center; color: #999; font-size: 10px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
      <p style="margin: 5px 0;">For support: support@raas-dandiya.com | Phone: +91-XXXX-XXXX</p>
      <p style="margin: 5px 0;">Terms & Conditions: Tickets are non-transferable and valid only for the specified event date.</p>
      <p style="margin: 5px 0; color: #bbb; font-size: 9px;">Generated on: ${new Date().toLocaleString('en-IN')}</p>
    </div>
  `;
  
  document.body.appendChild(element);
  
  // Generate QR code for PDF
  setTimeout(() => {
    try {
      new QRCode(document.getElementById(`qrcode-pdf-${ticketId}`), {
        text: ticket.qrData || ticket.ticketId || ticket.id,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (qrError) {
      console.error('❌ Error generating QR code:', qrError);
    }
    
    // Generate PDF after QR is created
    setTimeout(() => {
      try {
        if (typeof html2pdf === 'undefined') {
          throw new Error('html2pdf library not loaded');
        }

        const opt = {
          margin: 10,
          filename: `ticket-${ticket.id}-${new Date().getTime()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          },
          jsPDF: { 
            orientation: 'portrait', 
            unit: 'mm', 
            format: 'a4'
          }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
          showToast('success', 'Downloaded', 'Ticket PDF downloaded successfully');
        }).catch((err) => {
          console.error('❌ PDF generation error:', err);
          showToast('error', 'Error', 'Failed to generate PDF');
        });
        
        // Clean up
        setTimeout(() => {
          element.remove();
        }, 500);
      } catch (error) {
        console.error('❌ Error generating PDF:', error);
        showToast('error', 'Error', 'Failed to generate PDF: ' + error.message);
        element.remove();
      }
    }, 500);
  }, 100);
}

// ==================== ADMIN DASHBOARD ====================
function renderEventsTable() {
  // This will be called from admin page
}

function drawChart() {
  // Chart rendering
}

// ==================== UTILS ====================
function toggleFavorite(eventId) {
  console.log('Favorited event:', eventId);
}

// ==================== LOGOUT ====================
function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    Auth.logout().then(() => {
      window.location.href = 'login.html';
    }).catch(err => {
      console.error('Logout error:', err);
      showToast('error', 'Logout Error', 'Failed to logout');
    });
  }
}

function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <strong>${title}</strong>
    <p>${message}</p>
  `;
  
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==================== EXPORT FUNCTIONS TO WINDOW ====================
// Make functions globally available for HTML event handlers
window.showPage = showPage;
window.scrollToSection = scrollToSection;
window.bookEvent = bookEvent;
window.openEventDetails = openEventDetails;
window.updateQuantity = updateQuantity;
window.getTotalPrice = getTotalPrice;
window.proceedToCheckout = proceedToCheckout;
window.renderCheckout = renderCheckout;
window.goToPayment = goToPayment;
window.processPayment = processPayment;
window.formatINR = formatINR;
window.generateTicketCode = generateTicketCode;
window.showConfirmation = showConfirmation;
window.viewTicketDetails = viewTicketDetails;
window.downloadTicketPDF = downloadTicketPDF;
window.toggleFavorite = toggleFavorite;
window.handleLogout = handleLogout;
window.updateRoleBasedUI = updateRoleBasedUI;
window.applyFilters = applyFilters;
window.setSort = setSort;
window.filterTickets = filterTickets;
window.showToast = showToast;
window.filterTickets = filterTickets;
