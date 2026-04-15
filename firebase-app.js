// Importation des SDKs Firebase (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, setDoc, getDoc, deleteDoc, updateDoc, runTransaction, writeBatch, arrayUnion, increment, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// New function to record a product view
export const recordProductView = async (productId, sellerId) => {
  if (!productId || !sellerId) {
    console.warn("Cannot record product view: missing productId or sellerId.");
    return;
  }

  const today = new Date();
  const todayString = today.toISOString().split('T')[0]; // Format YYYY-MM-DD

  // Crée un document unique pour chaque produit et chaque jour
  const docRef = doc(db, "product_daily_views", `${productId}_${todayString}`);

  try {
    await setDoc(docRef, {
      productId: productId,
      sellerId: sellerId,
      date: todayString,
      type: "product",
      views: increment(1) // Incrémente atomiquement le compteur de vues
    }, { merge: true }); // Utilise merge: true pour créer le document s'il n'existe pas, ou le mettre à jour s'il existe
  } catch (error) {
    console.error("Error recording product view:", error);
  }
};

// New function to record a shop view
export const recordShopView = async (shopId, sellerId) => {
  if (!shopId || !sellerId) return;

  const today = new Date();
  const todayString = today.toISOString().split('T')[0];

  // On utilise la même collection pour que l'agrégation globale fonctionne
  const docRef = doc(db, "product_daily_views", `${shopId}_${todayString}`);

  try {
    await setDoc(docRef, {
      shopId: shopId,
      sellerId: sellerId,
      date: todayString,
      type: "shop",
      views: increment(1)
    }, { merge: true });
  } catch (error) {
    console.error("Error recording shop view:", error);
  }
};

// New function to get daily product views for a seller
export const getSellerDailyProductViews = async (sellerId, days = 7) => {
  if (!sellerId) {
    console.warn("Cannot get seller daily product views: missing sellerId.");
    return [];
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - (days - 1)); // Récupère les données pour les 'days' derniers jours

  const startDateString = startDate.toISOString().split('T')[0];
  const endDateString = endDate.toISOString().split('T')[0];

  try {
    const q = query(
      collection(db, "product_daily_views"),
      where("sellerId", "==", sellerId),
      where("type", "==", "shop"),
      where("date", ">=", startDateString),
      where("date", "<=", endDateString),
      orderBy("date", "asc")
    );
    const snapshot = await getDocs(q);

    const dailyViews = {};
    // Initialise les vues pour chaque jour de la période à 0
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      dailyViews[d.toISOString().split('T')[0]] = 0;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      dailyViews[data.date] = (dailyViews[data.date] || 0) + data.views;
    });

    // Convertit l'objet en un tableau trié pour Chart.js
    const result = Object.keys(dailyViews).sort().map(date => ({
      date: date,
      views: dailyViews[date]
    }));

    return result;
  } catch (error) {
    console.error("Error getting seller daily product views:", error);
    return [];
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    // On retire le orderBy ici pour éviter les erreurs si les formats de dates sont mélangés
    const q = query(collection(db, "products"));
    const snapshot = await getDocs(q);
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Tri robuste en JavaScript (gère String ISO et Timestamp Firestore)
    return products.sort((a, b) => {
      const getDate = (d) => {
        if (!d) return 0;
        if (typeof d.toDate === 'function') return d.toDate().getTime(); // Timestamp Firestore
        return new Date(d).getTime(); // String ISO
      };
      return getDate(b.createdAt) - getDate(a.createdAt);
    });
  } catch (error) {
    console.error("Erreur récupération produits:", error);
    return null;
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
  } catch (error) { console.error(error); return null; }
};

export const saveShopToFirestore = async (data, id = null) => {
  if (id) { // Mise à jour
    await setDoc(doc(db, "shops", id), data, { merge: true });
    return id;
  }
  return (await addDoc(collection(db, "shops"), data)).id; // Création
};

// Propager le numéro WhatsApp vendeur vers les contenus liés
export const syncSellerWhatsappNumber = async (sellerId, whatsappNumber) => {
  if (!sellerId) throw new Error("sellerId requis.");
  const normalized = String(whatsappNumber || "").replace(/\D/g, "");
  if (!normalized) throw new Error("Numéro WhatsApp invalide.");

  try {
    const productsQ = query(collection(db, "products"), where("vendeur_id", "==", sellerId));
    const productsSnap = await getDocs(productsQ);
    for (const docSnap of productsSnap.docs) {
      await updateDoc(docSnap.ref, {
        phone: normalized,
        numero_whatsapp: normalized
      });
    }

    const shopsQ = query(collection(db, "shops"), where("vendeur_id", "==", sellerId));
    const shopsSnap = await getDocs(shopsQ);
    for (const docSnap of shopsSnap.docs) {
      await updateDoc(docSnap.ref, {
        contact_whatsapp: normalized
      });
    }

    const videosQ = query(collection(db, "short_videos"), where("userId", "==", sellerId));
    const videosSnap = await getDocs(videosQ);
    for (const docSnap of videosSnap.docs) {
      await updateDoc(docSnap.ref, {
        userPhone: normalized
      });
    }
  } catch (error) {
    console.error("Erreur syncSellerWhatsappNumber:", error);
    throw error;
  }
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

/**
 * Ajouter un commentaire à une vidéo courte
 */
export const addVideoComment = async (videoId, commentData) => {
  const videoRef = doc(db, "short_videos", videoId);
  try {
    await runTransaction(db, async (transaction) => {
      const videoDoc = await transaction.get(videoRef);
      if (!videoDoc.exists()) throw new Error("Vidéo introuvable.");

      const data = videoDoc.data();
      const comments = Array.isArray(data.comments) ? data.comments : [];
      const createdAt = new Date().toISOString();
      const nextComment = {
        id: commentData.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: commentData.userId,
        userName: commentData.userName || "Utilisateur",
        text: commentData.text || "",
        parentId: commentData.parentId || null,
        replyToUserName: commentData.replyToUserName || null,
        likes: [],
        createdAt
      };

      transaction.update(videoRef, { comments: [...comments, nextComment] });
    });
  } catch (e) {
    console.error("Erreur add video comment:", e);
    throw e;
  }
};

/**
 * Like/Unlike un commentaire vidéo (coeur)
 */
export const toggleVideoCommentLike = async (videoId, commentId, userId) => {
  const videoRef = doc(db, "short_videos", videoId);
  try {
    await runTransaction(db, async (transaction) => {
      const videoDoc = await transaction.get(videoRef);
      if (!videoDoc.exists()) throw new Error("Vidéo introuvable.");

      const data = videoDoc.data();
      const comments = Array.isArray(data.comments) ? data.comments : [];
      const idx = comments.findIndex((c) => c.id === commentId);
      if (idx < 0) throw new Error("Commentaire introuvable.");

      const target = comments[idx];
      const likes = Array.isArray(target.likes) ? target.likes : [];
      const nextLikes = likes.includes(userId)
        ? likes.filter((id) => id !== userId)
        : [...likes, userId];

      const nextComments = [...comments];
      nextComments[idx] = { ...target, likes: nextLikes };
      transaction.update(videoRef, { comments: nextComments });
    });
  } catch (e) {
    console.error("Erreur toggle video comment like:", e);
    throw e;
  }
};

/**
 * Supprimer un commentaire vidéo (uniquement son auteur).
 * Supprime aussi ses réponses enfants pour éviter les fils orphelins.
 */
export const deleteVideoComment = async (videoId, commentId, userId) => {
  const videoRef = doc(db, "short_videos", videoId);
  try {
    await runTransaction(db, async (transaction) => {
      const videoDoc = await transaction.get(videoRef);
      if (!videoDoc.exists()) throw new Error("Vidéo introuvable.");

      const data = videoDoc.data();
      const comments = Array.isArray(data.comments) ? data.comments : [];
      const target = comments.find((c) => c.id === commentId);
      if (!target) throw new Error("Commentaire introuvable.");
      if (target.userId !== userId) throw new Error("Action non autorisée.");

      const idsToDelete = new Set([commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        comments.forEach((c) => {
          if (c.parentId && idsToDelete.has(c.parentId) && !idsToDelete.has(c.id)) {
            idsToDelete.add(c.id);
            changed = true;
          }
        });
      }

      const nextComments = comments.filter((c) => !idsToDelete.has(c.id));
      transaction.update(videoRef, { comments: nextComments });
    });
  } catch (e) {
    console.error("Erreur delete video comment:", e);
    throw e;
  }
};

/**
 * Supprimer une vidéo courte (uniquement son propriétaire)
 */
export const deleteShortVideo = async (videoId, userId) => {
  const videoRef = doc(db, "short_videos", videoId);
  try {
    const videoDoc = await getDoc(videoRef);
    if (!videoDoc.exists()) throw new Error("Vidéo introuvable.");

    const data = videoDoc.data();
    if (data.userId !== userId) {
      throw new Error("Action non autorisée.");
    }

    await deleteDoc(videoRef);
  } catch (e) {
    console.error("Erreur delete short video:", e);
    throw e;
  }
};
