// ============================================
// Firebase Initialization - CLEAN & SINGLE
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, 
  addDoc, 
  collection, 
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Configuration - COMPLETE & CORRECT
const firebaseConfig = {
  apiKey: "AIzaSyBzQhNZntZGFUj8rRCa2i7F1w9MMzeR-0c",
  authDomain: "raas-dandiya-events-7afe1.firebaseapp.com",
  projectId: "raas-dandiya-events-7afe1",
  storageBucket: "raas-dandiya-events-7afe1.firebasestorage.app",
  messagingSenderId: "213808614338",
  appId: "1:213808614338:web:d0d2e2f8342e5ef4a9a45b",
  measurementId: "G-JE10EHLY6Q"
};

// Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export for use in other modules
export { auth, db };

// Export all necessary Firebase functions globally for legacy code
window.auth = auth;
window.db = db;
window.getAuth = getAuth;
window.signInWithPhoneNumber = signInWithPhoneNumber;
window.RecaptchaVerifier = RecaptchaVerifier;
window.onAuthStateChanged = onAuthStateChanged;
window.signOut = signOut;
window.deleteUser = deleteUser;

// Firestore exports
window.getFirestore = getFirestore;
window.addDoc = addDoc;
window.collection = collection;
window.getDocs = getDocs;
window.getDoc = getDoc;
window.doc = doc;
window.setDoc = setDoc;
window.updateDoc = updateDoc;
window.query = query;
window.where = where;
window.deleteDoc = deleteDoc;
window.serverTimestamp = serverTimestamp;

console.log('✓ Firebase initialized (auth + firestore)');
