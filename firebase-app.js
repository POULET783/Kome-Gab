// Importation des SDKs Firebase (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, setDoc, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dzvvkr5kv/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "komegab-preset"; // Créer un "unsigned preset" dans Cloudinary

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1. FIREBASE AUTHENTICATION ---

// Surveiller l'état de connexion
onAuthStateChanged(auth, (user) => {
  const profileAvatar = document.getElementById('headerProfileAvatar');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    // Utilisateur connecté
    console.log("Utilisateur connecté:", user.email);
    if (profileAvatar) {
      // Utiliser l'image de profil de l'utilisateur ou une par défaut
      profileAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=3b82f6&color=fff&size=32`;
    }
  } else {
    // Utilisateur déconnecté
    console.log("Utilisateur non connecté");
    // Redirection si nécessaire ou ajustement de l'UI
    // window.location.href = 'index-no-connexion.html'; // Optionnel
  }
});

// Fonction de déconnexion
const handleLogout = async (e) => {
  e.preventDefault();
  try {
    await signOut(auth);
    console.log("Déconnexion réussie");
    window.location.href = 'index-no-connexion.html';
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

// Attacher l'événement au bouton de déconnexion s'il existe
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', handleLogout);
}

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

// --- 2. CLOUDINARY UPLOAD ---

/**
 * Upload une image vers Cloudinary
 * @param {File} file - L'objet File provenant d'un input type="file"
 * @returns {Promise<string>} - L'URL de l'image uploadée
 */
export const uploadImageToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Erreur upload Cloudinary:", error);
    throw error;
  }
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

// --- 3. FIRESTORE (Affichage des produits) ---

const loadOccasionProducts = async () => {
  const occasionList = document.getElementById('occasionList');
  const emptyMsg = document.getElementById('emptyOccasion');

  if (!occasionList) return; // Si on n'est pas sur la page occasion

  try {
    // Récupérer les produits depuis Firestore (collection "products")
    // On suppose qu'il y a un champ 'type' ou 'category' pour filtrer
    // Adaptez "products" au nom de votre collection
    const q = query(collection(db, "products"), where("category", "==", "Occasion")); // Exemple de filtre
    // Si vous voulez tout afficher pour tester, utilisez : const q = query(collection(db, "products"));
    
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      if(emptyMsg) emptyMsg.style.display = 'none';
      occasionList.innerHTML = ''; // Vider la liste

      querySnapshot.forEach((doc) => {
        const product = doc.data();
        // Création de la carte produit
        const card = document.createElement('div');
        card.className = 'card'; // Assurez-vous d'avoir ce style CSS
        card.innerHTML = `
          <img src="${product.imageUrl || 'images/default-product.png'}" alt="${product.name}" class="product-img">
          <div class="card-body">
            <h4>${product.name}</h4>
            <p class="price">${product.price} FCFA</p>
            <p class="desc">${product.description || ''}</p>
          </div>
        `;
        occasionList.appendChild(card);
      });
    } else {
      if(emptyMsg) emptyMsg.style.display = 'block';
    }
  } catch (error) {
    console.error("Erreur chargement produits:", error);
    if(emptyMsg) emptyMsg.textContent = "Erreur lors du chargement des annonces.";
  }
};

// Charger les produits au démarrage si on est sur la page occasion
if (document.body.getAttribute('data-page') === 'occasion') {
  loadOccasionProducts();
}