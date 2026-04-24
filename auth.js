// ============================================
// Firebase Authentication Module
// Phone OTP Login, Session Management, Role-Based Access
// ============================================

// Import Firebase auth and db
import { auth, db } from "./firebase.js";
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  signOut,
  deleteUser,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDoc,
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Global state
window.currentUserId = null;
window.currentUserRole = null;
window.currentUserPhone = null;
let confirmationResult = null;

// ============================================
// SET PERSISTENCE (KEEPS USER LOGGED IN)
// ============================================
export async function initializePersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    console.log('✓ Firebase persistence initialized');
  } catch (error) {
    console.error('Error setting persistence:', error);
  }
}

// ============================================
// AUTH STATE LISTENER
// ============================================
export function initializeAuthStateListener() {
  if (!auth) {
    console.error('Firebase Auth not initialized');
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in
      window.currentUserId = user.uid;
      window.currentUserPhone = user.phoneNumber;

      // Fetch user role from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          window.currentUserRole = userDoc.data().role || 'user';
          console.log('✓ Auth State: User logged in', {
            uid: user.uid,
            phone: user.phoneNumber,
            role: window.currentUserRole
          });
          
          // Dispatch custom event for auth change
          window.dispatchEvent(new CustomEvent('authStateChanged', { 
            detail: { user, role: window.currentUserRole } 
          }));
        } else {
          console.warn('User document not found');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    } else {
      // User is logged out
      window.currentUserId = null;
      window.currentUserRole = null;
      window.currentUserPhone = null;
      console.log('✓ Auth State: User logged out');
      
      window.dispatchEvent(new CustomEvent('authStateChanged', { 
        detail: { user: null, role: null } 
      }));
    }
  });
}

// ============================================
// PHONE OTP LOGIN
// ============================================
export async function sendOTP(phoneNumber) {
  try {
    // CRITICAL: Format must be +917738427824 (NO SPACES)
    let formattedPhone = phoneNumber;
    
    // Remove any spaces or formatting
    formattedPhone = formattedPhone.replace(/\s/g, ''); // Remove all spaces
    formattedPhone = formattedPhone.replace(/[^\d+]/g, ''); // Keep only digits and +
    
    // Ensure it starts with +91
    if (!formattedPhone.startsWith('+91')) {
      const digitsOnly = formattedPhone.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        formattedPhone = '+91' + digitsOnly.slice(-10); // Take last 10 digits
      } else {
        throw new Error('Invalid phone number length');
      }
    }

    // Validate format
    if (!/^\+91\d{10}$/.test(formattedPhone)) {
      throw new Error('Phone must be in format +91XXXXXXXXXX (10 digits after +91, NO SPACES)');
    }

    console.log('📱 Sending OTP to:', formattedPhone);

    // Setup reCAPTCHA
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: (response) => {
          console.log('✓ reCAPTCHA verified');
        },
        'expired-callback': () => {
          console.log('⚠ reCAPTCHA expired');
          window.recaptchaVerifier = null;
        }
      });
    }

    // Send OTP
    confirmationResult = await signInWithPhoneNumber(
      auth,
      formattedPhone,
      window.recaptchaVerifier
    );

    console.log('✓ OTP sent to', formattedPhone);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ Error sending OTP:', error);
    
    // Clear reCAPTCHA on error
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }

    let errorMessage = 'Failed to send OTP';
    if (error.code === 'auth/invalid-phone-number') {
      errorMessage = 'Invalid phone number. Format must be +91XXXXXXXXXX (NO SPACES)';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many attempts. Please try again later';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, message: errorMessage, error };
  }
}

// ============================================
// VERIFY OTP
// ============================================
export async function verifyOTP(otp) {
  try {
    if (!confirmationResult) {
      return { success: false, message: 'No OTP request found. Please request OTP again.' };
    }

    const result = await confirmationResult.confirm(otp);
    const user = result.user;

    console.log('✓ OTP verified, user:', user.uid);

    // ============================================
    // SIMPLE ROLE ASSIGNMENT
    // ============================================
    // If phone is +917738427824 → owner (admin access)
    // Everyone else → user (website access)
    
    const phone = user.phoneNumber;
    const OWNER_PHONE = '+917738427824';
    
    let role = 'user'; // Default for everyone
    if (phone === OWNER_PHONE) {
      role = 'owner';
      console.log('✅ OWNER VERIFIED:', OWNER_PHONE);
    }
    
    // Store in Firestore for reference
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      // First login - create user
      await setDoc(doc(db, 'users', user.uid), {
        userId: user.uid,
        phone: phone,
        role: role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('✓ New user created with role:', role);
    } else {
      // Update role on login
      await updateDoc(doc(db, 'users', user.uid), {
        phone: phone,
        role: role,
        lastLogin: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('✓ User login with role:', role);
    }

    return { success: true, message: 'Login successful', user };
  } catch (error) {
    console.error('❌ Error verifying OTP:', error);

    let errorMessage = 'Invalid OTP';
    if (error.code === 'auth/invalid-verification-code') {
      errorMessage = 'Invalid OTP. Please try again.';
    } else if (error.code === 'auth/code-expired') {
      errorMessage = 'OTP expired. Please request a new one.';
    }

    return { success: false, message: errorMessage, error };
  }
}

// ============================================
// LOGOUT
// ============================================
export async function logout() {
  try {
    await signOut(auth);
    window.currentUserId = null;
    window.currentUserRole = null;
    window.currentUserPhone = null;
    confirmationResult = null;

    console.log('✓ User logged out');
    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    console.error('❌ Error logging out:', error);
    return { success: false, message: 'Failed to logout', error };
  }
}

// ============================================
// DELETE ACCOUNT
// ============================================
export async function deleteAccount() {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, message: 'No user logged in' };
    }

    const userId = user.uid;

    // 1. Delete all tickets for this user
    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('userId', '==', userId)
    );
    const ticketsSnapshot = await getDocs(ticketsQuery);
    
    for (const docItem of ticketsSnapshot.docs) {
      await deleteDoc(doc(db, 'tickets', docItem.id));
    }

    console.log('✓ Deleted', ticketsSnapshot.docs.length, 'tickets');

    // 2. Delete user document from Firestore
    await deleteDoc(doc(db, 'users', userId));
    console.log('✓ Deleted user document');

    // 3. Delete Firebase Auth user
    await deleteUser(user);
    console.log('✓ Deleted Firebase Auth user');

    window.currentUserId = null;
    window.currentUserRole = null;
    window.currentUserPhone = null;
    confirmationResult = null;

    return { success: true, message: 'Account deleted successfully' };
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    return { success: false, message: 'Failed to delete account', error };
  }
}

// ============================================
// ROLE-BASED ACCESS CHECK
// ============================================
export function hasRole(requiredRole) {
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(window.currentUserRole);
  }
  return window.currentUserRole === requiredRole;
}

// Check if user has admin access (admin OR owner)
export function hasAdminRole() {
  return window.currentUserRole === 'admin' || window.currentUserRole === 'owner';
}

// Check if user has scanner access (scanner OR admin OR owner)
export function hasScannerRole() {
  return window.currentUserRole === 'scanner' || 
         window.currentUserRole === 'admin' || 
         window.currentUserRole === 'owner';
}

// Check if user is owner
export function isOwner() {
  return window.currentUserRole === 'owner';
}

export function isLoggedIn() {
  return auth.currentUser !== null;
}

export function getCurrentUserId() {
  return window.currentUserId;
}

export function getCurrentUserRole() {
  return window.currentUserRole;
}

export function getCurrentUserPhone() {
  return window.currentUserPhone;
}

// ============================================
// PAGE PROTECTION
// ============================================
export async function protectPage(options = {}) {
  const {
    requireLogin = false,
    requiredRoles = null,
    redirectTo = 'index.html'
  } = options;

  return new Promise((resolve) => {
    // Wait for auth state to be ready
    const checkAuth = setInterval(async () => {
      if (auth.currentUser !== null || !requireLogin) {
        clearInterval(checkAuth);

        if (requireLogin && !auth.currentUser) {
          console.warn('Page requires login. Redirecting...');
          window.location.href = redirectTo;
          return;
        }

        if (requiredRoles && auth.currentUser) {
          const user = auth.currentUser;
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userRole = userDoc.data()?.role || 'user';

          if (!requiredRoles.includes(userRole)) {
            console.warn('Insufficient permissions. Redirecting...');
            window.location.href = redirectTo;
            return;
          }
        }

        resolve(true);
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkAuth);
      resolve(false);
    }, 5000);
  });
}

// ============================================
// USER DATA FUNCTIONS
// ============================================
export async function getUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export async function getUserTickets() {
  const user = auth.currentUser;
  if (!user) return [];

  try {
    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('userId', '==', user.uid)
    );
    const snapshot = await getDocs(ticketsQuery);
    return snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    return [];
  }
}

export async function getTicketCount() {
  const tickets = await getUserTickets();
  return tickets.length;
}

export async function getUpcomingTickets() {
  const user = auth.currentUser;
  if (!user) return [];

  try {
    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('userId', '==', user.uid)
    );
    const snapshot = await getDocs(ticketsQuery);
    const now = new Date();

    return snapshot.docs
      .map(docItem => ({ id: docItem.id, ...docItem.data() }))
      .filter(ticket => new Date(ticket.eventDate) >= now)
      .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
  } catch (error) {
    console.error('Error fetching upcoming tickets:', error);
    return [];
  }
}

console.log('✓ Auth module loaded');
