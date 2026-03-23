// Importation des SDKs Firebase (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, setDoc, getDoc, deleteDoc, updateDoc, runTransaction, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURATION ---

// TODO: Remplacez par vos identifiants Firebase (disponibles dans la console Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyD--iAfeqNnEqPgmkCOV1Uma2fbxlACPgY",
  authDomain: "kome-gab.firebaseapp.com",
  projectId: "kome-gab",
  storageBucket: "kome-gab.firebasestorage.app",
  messagingSenderId: "580637895554",
  appId: "1:580637895554:web:cb4845bc08ba85ad8ebd9b",
  measurementId: "G-LZPFQ4TN6P"
};

// Configuration Cloudinary
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dzvvkr5kv/auto/upload"; // Changé 'image' par 'auto' pour supporter les vidéos
const CLOUDINARY_UPLOAD_PRESET = "komegab-preset"; // Créer un "unsigned preset" dans Cloudinary

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1. FIREBASE AUTHENTICATION ---

export const logoutUser = async () => {
  await signOut(auth);
};

// Fonctions exportables pour être utilisées dans d'autres pages (Login/Register)
export const registerUser = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Erreur création compte:", error);
    throw error;
  }
};

export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Erreur connexion:", error);
    throw error;
  }
};

// Sauvegarder les infos utilisateur dans Firestore (après inscription)
export const saveUserToFirestore = async (user, additionalData) => {
  try {
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      ...additionalData,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Erreur sauvegarde user:", error);
    throw error;
  }
};

// Récupérer les infos utilisateur depuis Firestore (après connexion)
export const getUserFromFirestore = async (uid) => {
  try {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Erreur récupération user:", error);
    throw error;
  }
};

/**
 * Récupère les données de plusieurs utilisateurs par leurs IDs
 */
export const getUsersByIds = async (ids) => {
  if (!ids || ids.length === 0) return [];
  try {
    // On récupère chaque utilisateur individuellement
    const promises = ids.map(id => getDoc(doc(db, "users", id)));
    const snapshots = await Promise.all(promises);
    return snapshots.map(snap => snap.exists() ? snap.data() : null).filter(u => u !== null);
  } catch (error) {
    console.error("Erreur getUsersByIds:", error);
    return [];
  }
};

// --- 2. CLOUDINARY UPLOAD ---

/**
 * Upload une image vers Cloudinary
 * @param {File} file - L'objet File provenant d'un input type="file"
 * @returns {Promise<object>} - L'objet contenant l'URL et le type (image/video)
 */
export const uploadMediaToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // force le resource_type à auto pour détecter image ou video
  formData.append('resource_type', 'auto'); 

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    // On retourne l'url sécurisée et le type (image ou video)
    return { 
      url: data.secure_url, 
      type: data.resource_type // 'image' ou 'video'
    };
  } catch (error) {
    console.error("Erreur upload Cloudinary:", error);
    throw error;
  }
};

// Garder la compatibilité pour l'ancien nom de fonction, mais utilise la nouvelle logique
export const uploadImageToCloudinary = async (file) => {
  const res = await uploadMediaToCloudinary(file);
  return res.url;
};

// Fonction pour sauvegarder une annonce dans Firestore
export const saveOccasionProduct = async (productData) => {
  try {
    // On utilise "products" comme collection principale
    const docRef = await addDoc(collection(db, "products"), {
      ...productData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("Annonce publiée avec ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Erreur lors de la publication: ", e);
    throw e;
  }
};

/**
 * Récupère TOUS les produits (Boutique + Occasion)
 */
export const getAllProducts = async () => {
  try {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Erreur récupération produits:", error);
    return [];
  }
};

// Sauvegarder un produit générique (Vendeur)
export const saveProductToFirestore = async (data) => {
  try {
    const docRef = await addDoc(collection(db, "products"), {
      ...data,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) { console.error(error); throw error; }
};

export const deleteProductFirestore = async (id) => {
  await deleteDoc(doc(db, "products", id));
};

export const updateProductFirestore = async (id, data) => {
  await updateDoc(doc(db, "products", id), data);
};

// Gestion des Boutiques
export const getAllShops = async () => {
  try {
    const snapshot = await getDocs(collection(db, "shops"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) { console.error(error); return []; }
};

export const saveShopToFirestore = async (data, id = null) => {
  if (id) { // Mise à jour
    await setDoc(doc(db, "shops", id), data, { merge: true });
    return id;
  }
  return (await addDoc(collection(db, "shops"), data)).id; // Création
};

export const deleteShopAndDissociateProducts = async (shopId) => {
  if (!shopId) throw new Error("L'ID de la boutique est requis.");

  const shopRef = doc(db, "shops", shopId);
  const productsQuery = query(collection(db, "products"), where("shopId", "==", shopId));

  try {
    const batch = writeBatch(db);

    // 1. Dissocier les produits
    const productsSnapshot = await getDocs(productsQuery);
    productsSnapshot.forEach(productDoc => {
      batch.update(productDoc.ref, {
        shopId: null,
        boutique_id: null
      });
    });

    // 2. Supprimer la boutique
    batch.delete(shopRef);

    // 3. Valider le batch
    await batch.commit();
  } catch (error) {
    console.error("Erreur lors de la suppression de la boutique et de la dissociation des produits :", error);
    throw error;
  }
};

/**
 * Gère le système de Follow (User -> Boutique) via Transaction
 * Met à jour à la fois la liste favoriteShops de l'utilisateur ET la liste followers de la boutique
 */
export const toggleShopFollow = async (userId, shopId) => {
  const userRef = doc(db, "users", userId);
  const shopRef = doc(db, "shops", shopId);

  try {
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const shopDoc = await transaction.get(shopRef);

      if (!userDoc.exists() || !shopDoc.exists()) throw "Document introuvable !";

      const userData = userDoc.data();
      const shopData = shopDoc.data();

      const favorites = userData.favoriteShops || [];
      const followers = shopData.followers || [];

      let newFavorites, newFollowers;

      if (favorites.includes(shopId)) {
        // Désabonnement
        newFavorites = favorites.filter(id => id !== shopId);
        newFollowers = followers.filter(id => id !== userId);
      } else {
        // Abonnement
        newFavorites = [...favorites, shopId];
        newFollowers = [...followers, userId]; // On ajoute l'ID de l'user aux followers de la boutique
      }

      transaction.update(userRef, { favoriteShops: newFavorites });
      transaction.update(shopRef, { followers: newFollowers });
    });
  } catch (e) {
    console.error("Erreur Transaction Follow:", e);
    throw e;
  }
};

/**
 * Sauvegarder un avis produit
 */
export const saveReview = async (reviewData) => {
  try {
    await addDoc(collection(db, "reviews"), {
      ...reviewData,
      createdAt: new Date().toISOString()
    });
  } catch (error) { console.error("Erreur save review:", error); throw error; }
};

/**
 * Récupérer les avis d'un produit
 */
export const getReviews = async (productId) => {
  try {
    const q = query(collection(db, "reviews"), where("productId", "==", productId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Erreur get reviews:", error);
    return [];
  }
};

/**
 * Met à jour les informations d'un utilisateur dans Firestore
 */
export const updateUserInFirestore = async (uid, data) => {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } catch (error) { console.error("Erreur update user:", error); throw error; }
};

// --- 3. GESTION DES STORIES ---

export const saveStory = async (storyData) => {
  try {
    await addDoc(collection(db, "stories"), {
      ...storyData,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Expire dans 24h
    });
  } catch (error) { console.error("Erreur save story:", error); throw error; }
};

export const getActiveStories = async () => {
  try {
    const now = new Date().toISOString();
    // On récupère les stories dont la date d'expiration est future
    const q = query(collection(db, "stories"), where("expiresAt", ">", now), orderBy("expiresAt", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) { console.error("Erreur get stories:", error); return []; }
};

export const deleteStory = async (storyId) => {
  try {
    await deleteDoc(doc(db, "stories", storyId));
  } catch (error) {
    console.error("Erreur delete story:", error);
    throw error;
  }
};

/**
 * Enregistre une vue sur une story (ajoute l'ID user à la liste 'viewers')
 */
export const viewStory = async (storyId, userId) => {
  const storyRef = doc(db, "stories", storyId);
  try {
    await updateDoc(storyRef, {
      viewers: arrayUnion(userId)
    });
  } catch (error) {
    // On ignore silencieusement les erreurs de vue pour ne pas bloquer l'UX
    console.warn("Erreur view story:", error);
  }
};

// --- 4. GESTION DES VIDEOS COURTES (SHORTS) ---

export const saveShortVideo = async (videoData) => {
  try {
    await addDoc(collection(db, "short_videos"), {
      ...videoData,
      createdAt: new Date().toISOString()
    });
  } catch (error) { console.error("Erreur save video:", error); throw error; }
};

export const getShortVideos = async () => {
  try {
    const q = query(collection(db, "short_videos"), orderBy("createdAt", "desc"), limit(20));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) { console.error("Erreur get videos:", error); return []; }
};

/**
 * Toggle Like pour une vidéo (Ajoute/Retire l'ID utilisateur du tableau 'likes' de la vidéo)
 */
export const toggleVideoLike = async (videoId, userId) => {
  const videoRef = doc(db, "short_videos", videoId);
  try {
    await runTransaction(db, async (transaction) => {
      const videoDoc = await transaction.get(videoRef);
      if (!videoDoc.exists()) throw "Video not found";
      
      const data = videoDoc.data();
      const likes = data.likes || [];
      
      const newLikes = likes.includes(userId) 
        ? likes.filter(id => id !== userId) 
        : [...likes, userId];
        
      transaction.update(videoRef, { likes: newLikes });
    });
  } catch (e) { console.error("Erreur toggle video like:", e); throw e; }
};