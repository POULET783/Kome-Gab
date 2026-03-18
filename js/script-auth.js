// --- MODULES FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  getDocs,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  limit,
  query
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";


// --- CONFIGURATION ---
// IMPORTANT: Remplacez ces valeurs par votre propre configuration Firebase.
// ATTENTION: Ne partagez jamais votre clé API (apiKey) publiquement. Utilisez des variables d'environnement pour un projet en production.
const firebaseConfig = {
  apiKey: "AIzaSyD--iAfeqNnEqPgmkCOV1Uma2fbxlACPgY",
  authDomain: "kome-gab.firebaseapp.com",
  projectId: "kome-gab",
  storageBucket: "kome-gab.firebasestorage.app",
  messagingSenderId: "580637895554",
  appId: "1:580637895554:web:cb4845bc08ba85ad8ebd9b",
  measurementId: "G-LZPFQ4TN6P"
};

// IMPORTANT: Remplacez par votre configuration Cloudinary
const CLOUDINARY_CONFIG = {
    CLOUD_NAME: 'dzvvkr5kv', // À REMPLACER par votre nom de cloud
    UPLOAD_PRESET: 'komegab-preset' // À REMPLACER par votre preset d'upload
};


// --- INITIALISATION FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);



// Fonction pour créer un compte utilisateur
window.createUser = async function(email, password, userData) {
  try {
    // Créer l'utilisateur dans Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Ajouter les données utilisateur dans Firestore
    await setDoc(doc(db, "users", user.uid), {
      email: email,
      uid: user.uid,
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log("Utilisateur créé avec succès:", user.uid);
    return { success: true, user };
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    return { success: false, error: error.message };
  }
};

// Fonction pour connecter un utilisateur
window.signInUser = async function(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Utilisateur connecté:", userCredential.user.uid);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error("Erreur de connexion:", error);
    return { success: false, error: error.message };
  }
};

// Fonction pour déconnecter un utilisateur
window.signOutUser = async function() {
  try {
    await signOut(auth);
    console.log("Utilisateur déconnecté");
    return { success: true };
  } catch (error) {
    console.error("Erreur de déconnexion:", error);
    return { success: false, error: error.message };
  }
};

// Fonction pour récupérer les données utilisateur
window.getUserData = async function(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { success: true, data: docSnap.data() };
    } else {
      return { success: false, error: "Utilisateur non trouvé" };
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    return { success: false, error: error.message };
  }
};