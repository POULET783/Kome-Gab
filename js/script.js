// Script.js

// Import des fonctions Firebase et Cloudinary
import {
  logoutUser, registerUser, loginUser, saveUserToFirestore, getUserFromFirestore, getUsersByIds,
  uploadMediaToCloudinary, uploadImageToCloudinary, saveOccasionProduct, getAllProducts, saveProductToFirestore, deleteProductFirestore, updateProductFirestore, getAllShops, saveShopToFirestore, deleteShopAndDissociateProducts, toggleShopFollow, saveReview, getReviews, updateUserInFirestore, saveStory, getActiveStories, deleteStory, viewStory,
  saveShortVideo, getShortVideos, toggleVideoLike
} from "../firebase-app.js";

const STORAGE_KEYS = {
  users: "mg_users",
  products: "mg_products",
  shops: "mg_shops",
  occasionProducts: "mg_occasion_products",
  loggedUser: "mg_logged_user",
  cart: "mg_cart"
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 8;
const PLACEHOLDER_IMAGE = "https://placehold.co/640x360?text=Produit";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- SYSTEME DE CACHE SYNCRO FIREBASE ---
// 1. Initialisation immédiate avec les données locales (LocalStorage)
let cachedProducts = read(STORAGE_KEYS.products, []);
let cachedShops = read(STORAGE_KEYS.shops, []);

async function syncData() {
  // 2. Récupération réseau et mise à jour du cache local
  const products = await getAllProducts();
  const shops = await getAllShops();
  
  // Mise à jour mémoire
  cachedProducts = products;
  cachedShops = shops;

  // Mise à jour persistante
  write(STORAGE_KEYS.products, products);
  write(STORAGE_KEYS.shops, shops);
  console.log("Données synchronisées et mises en cache");
}

function currentUser() {
  return read(STORAGE_KEYS.loggedUser, null);
}

function ensureMenu() {
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("mobileMenu");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menu.setAttribute("aria-hidden", open ? "false" : "true");
  });
}

function highlightActiveMenu() {
  const menu = document.getElementById("mobileMenu");
  if (!menu) return;

  const currentFile = window.location.pathname.split("/").pop();
  const links = menu.querySelectorAll("a");

  links.forEach(link => {
    const href = link.getAttribute("href");
    if (!href) return;

    let isActive = false;

    // Correspondance exacte (ex: videos.html === videos.html)
    if (currentFile === href) isActive = true;

    // Cas particuliers pour l'accueil (home.html contient souvent un lien vers index.html)
    if ((currentFile === "home.html" || currentFile === "") && href === "index.html") isActive = true;

    if (isActive) {
      link.classList.add("active");
    }
  });
}

function updateAuthLink() {
  const authLink = document.getElementById("authLink");
  const profileAvatarLink = document.getElementById("profileAvatarLink");
  const profileTextLink = document.getElementById("profileTextLink"); // Peut être null
  const headerProfileAvatar = document.getElementById("headerProfileAvatar");
  
  const logged = currentUser();
  
  if (authLink) {
    if (logged) {
      authLink.textContent = "Déconnexion";
      authLink.href = "#";
      authLink.onclick = async (e) => {
        e.preventDefault();
        if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
          await logoutUser(); // Déconnexion Firebase
          write(STORAGE_KEYS.loggedUser, null);
          window.location.href = "index.html";
        }
      };
    } else {
      authLink.textContent = "Connexion";
      authLink.href = "login.html";
      authLink.onclick = null;
    }
  }
  
  // Gérer l'affichage de la photo de profil dans le header
  if (profileAvatarLink && headerProfileAvatar) {
    if (logged) {
      // Récupérer la photo de profil ou le logo de la boutique
      let profileImage = logged.photo_profil;
      
      // Utiliser l'image trouvée ou un avatar par défaut si vide/placeholder
      if (profileImage && !profileImage.includes("placehold.co")) {
        headerProfileAvatar.src = profileImage;
      } else {
        headerProfileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(logged.nom || "User")}&background=3b82f6&color=fff&size=64`;
      }

        profileAvatarLink.style.display = "inline-flex";
      if (profileTextLink) profileTextLink.style.display = "none";
        
      // Ajouter l'événement pour rediriger vers le profil
      headerProfileAvatar.onclick = (e) => {
          e.preventDefault();
          // Rediriger vers le profil au lieu d'afficher l'image en grand
          window.location.href = "profile.html";
      };
      } else {
        profileAvatarLink.style.display = "none";
      if (profileTextLink) profileTextLink.style.display = "inline-block";
    }
  }
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function formatPrice(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function normalizeImageArray(images, fallbackImage) {
  const result = [];

  if (Array.isArray(images)) {
    images.forEach((src) => {
      if (typeof src === "string" && src.trim()) {
        result.push(src.trim());
      }
    });
  } else if (typeof images === "string" && images.trim()) {
    result.push(images.trim());
}

  if (typeof fallbackImage === "string" && fallbackImage.trim()) {
    result.push(fallbackImage.trim());
}

  return Array.from(new Set(result));
}

function formatTimeAgo(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

// --- OPTIMISATION DES IMAGES CLOUDINARY ---
function optimizeCloudinaryUrl(url, width = 500) {
  if (!url || typeof url !== "string") return "";
  // Si ce n'est pas une URL Cloudinary ou si c'est un placeholder, on retourne tel quel
  if (!url.includes("res.cloudinary.com") || url.includes("placehold.co")) return url;
  
  // On injecte les paramètres de transformation : format auto, qualité auto, redimensionnement
  // 'c_limit' assure qu'on n'agrandit pas une image si elle est plus petite que la cible
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));
    reader.readAsDataURL(file);
  });
}

async function getImagesDataFromInput(inputId) {
  const input = document.getElementById(inputId);
  const files = Array.from(input?.files || []);

  if (!files.length) {
    return [];
  }

  if (files.length > MAX_IMAGES_PER_PRODUCT) {
    throw new Error(`Maximum ${MAX_IMAGES_PER_PRODUCT} images par produit.`);
  }
  
  const images = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Tous les fichiers doivent être des images.");
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Image trop lourde (max 2 Mo par image).");
  }
  
    images.push(await fileToDataUrl(file));
  }

  return images;
}

function renderUploadPreview(previewId, images) {
  const preview = document.getElementById(previewId);
  if (!preview) return;

  if (!images.length) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
    return;
  }

  preview.innerHTML = images
    .map((src, index) => `<img src="${src}" alt="Aperçu ${index + 1}">`)
    .join("");
  preview.classList.remove("hidden");
  }

function setupFilesPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener("change", async () => {
    try {
      const images = await getImagesDataFromInput(inputId);
      renderUploadPreview(previewId, images);
    } catch (error) {
      alert(error.message);
      input.value = "";
      renderUploadPreview(previewId, []);
    }
  });
}

function resetFilesPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  if (input) input.value = "";
  renderUploadPreview(previewId, []);
}

function mapRegularProduct(item) {
  const images = normalizeImageArray(item.images, item.image);

  return {
    ...item,
    id: item.id, // L'ID vient maintenant de Firestore (ex: "7f8s7df8s")
    name: item.name || item.nom || "Produit",
    description: item.description || "",
    price: Number(item.price ?? item.prix ?? 0),
    category: item.category || item.categorie || "Autre",
    phone: item.phone || "",
    image: images[0] || "",
    images,
    status: item.status || "available",
    isOccasion: false
  };
}

function mapOccasionToMarketplace(item) {
  const images = normalizeImageArray(item.images, item.image);

  return {
    ...item,
    id: item.id,
    name: item.nom || item.name || "Produit d'occasion",
    description: item.description || "",
    price: Number(item.prix ?? item.price ?? 0),
    category: item.category || item.categorie || "Autre",
    phone: item.numero_whatsapp || item.phone || "",
    image: images[0] || "",
    images,
    status: item.statut || item.status || "available",
    isOccasion: true
  };
}

function getProductDetailUrl(product) {
  const origin = product.isOccasion ? "occasion" : "regular";
  return `product.html?id=${encodeURIComponent(product.id)}&origin=${origin}`;
}

function cartStorageKey() {
  const user = currentUser();
  return user?.email ? `${STORAGE_KEYS.cart}_${user.email}` : `${STORAGE_KEYS.cart}_guest`;
}

function getCartItems() {
  return read(cartStorageKey(), []);
}

function saveCartItems(items) {
  write(cartStorageKey(), items);
}

function getCartCount() {
  return getCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function setupSidebarCart() {
  // Charger le Smart Wagon
  const container = document.getElementById("cartSidebarContainer");
  if (!container) return;

  fetch("smart-wagon.html")
    .then(response => response.text())
    .then(html => {
      container.innerHTML = html;
      initializeSmartWagon();
    })
    .catch(error => {
      console.error("Erreur lors du chargement du Smart Wagon:", error);
    });
}

/* ===================================
   INITIALISATION SMART WAGON
   =================================== */
function initializeSmartWagon() {
  const wagon = document.getElementById("smartWagon");
  const overlay = document.getElementById("cartOverlay");
  const itemsList = document.getElementById("cartItemsList");
  const emptyMessage = document.getElementById("emptyCartMessage");
  const totalElement = document.getElementById("cartTotal");
  const templateSelect = document.getElementById("orderTemplate");
  const orderAllBtn = document.getElementById("orderAllBtn");
  const badge = document.getElementById("cartBadge");

  // Fonction toggle
  window.toggleCart = function() {
    wagon?.classList.toggle("active");
    overlay?.classList.toggle("active");
    
    // Bloquer/débloquer le scroll en mobile
    if (window.innerWidth <= 768) {
      document.body.classList.toggle("cart-open");
    }
  };

  // Fonction render
  function renderSmartWagon() {
    const items = getCartItems();

    if (!itemsList) return;

    if (!items.length) {
      itemsList.innerHTML = "";
      if (emptyMessage) emptyMessage.style.display = "block";
      if (totalElement) totalElement.textContent = "0";
      if (orderAllBtn) orderAllBtn.style.display = "none";
      updateCartBadge();
      return;
    }

    if (emptyMessage) emptyMessage.style.display = "none";

    itemsList.innerHTML = items.map((item, index) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
      const productUrl = `product.html?id=${encodeURIComponent(item.productId)}&origin=regular`;
      const optimizedImage = optimizeCloudinaryUrl(item.image || PLACEHOLDER_IMAGE, 100); // Miniature 100px
      return `
        <li>
          <a href="${productUrl}" class="cart-item-link">
            <img src="${optimizedImage}" alt="${item.name}" loading="lazy">
          </a>
          <div class="cart-item-details">
            <h4><a href="${productUrl}" class="cart-item-name-link">${item.name}</a></h4>
            <div class="price">Prix unitaire: ${formatPrice(item.price)}</div>
            <div class="subtotal">Sous-total: ${formatPrice(lineTotal)}</div>
            <div class="cart-item-controls">
              <button onclick="updateQuantity('${item.productId}', -1)">-</button>
              <span class="qty">${item.quantity}</span>
              <button onclick="updateQuantity('${item.productId}', 1)">+</button>
              <button class="remove-btn" onclick="removeFromCartById('${item.productId}')">🗑️</button>
            </div>
          </div>
        </li>
      `;
    }).join("");

    const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    if (totalElement) totalElement.textContent = String(total);

    if (orderAllBtn && items.length > 0) {
      orderAllBtn.style.display = "block";
    } else if (orderAllBtn) {
      orderAllBtn.style.display = "none";
    }

    updateCartBadge();
  }

  // Fonctions globales pour les contrôles
  window.updateQuantity = function(productId, delta) {
    updateCartQuantity(productId, delta);
    renderSmartWagon();
  };

  window.removeFromCartById = function(productId) {
    removeFromCart(productId);
    renderSmartWagon();
  };

  // Fonction clearCart améliorée
  window.clearCart = function() {
    if (confirm("Voulez-vous vraiment vider votre panier et supprimer tous les produits ?")) {
      // Vider complètement le panier
      saveCartItems([]);
      // Mettre à jour l'interface
      renderSmartWagon();
      // Mettre à jour les compteurs
      updateCartCountUI();
      alert("Panier vidé avec succès !");
    }
  };

  window.orderAllItems = function() {
    const items = getCartItems();
    if (items.length === 0) {
      alert("Votre panier est vide !");
      return;
    }

    const template = templateSelect?.value || "standard";
    const message = buildMultipleOrderMessage(template, items);
    
    if (items.length > 0) {
      const firstItem = items[0];
      const phone = normalizePhone(firstItem.phone);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    }
  };

  // Mettre à jour le badge
  function updateCartBadge() {
    const count = getCartCount();
    if (badge) {
      if (count > 0) {
        badge.textContent = String(count);
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
  }

  // Initialisation
  renderSmartWagon();

  // Exposer les fonctions globalement
  window.updateSmartWagon = renderSmartWagon;
}

/* ===================================
   MISE À JOUR INTERFACE
   =================================== */
function updateCartCountUI() {
  // Mettre à jour les anciens compteurs s'ils existent
  document.querySelectorAll("#cartCount").forEach((el) => {
    el.textContent = String(getCartCount());
  });

  // Mettre à jour le badge du Smart Wagon
  const badge = document.getElementById("cartBadge");
  if (badge) {
    const count = getCartCount();
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  // Mettre à jour le Smart Wagon s'il est initialisé
  if (window.updateSmartWagon) {
    window.updateSmartWagon();
  }
}

// Appeler la fonction quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
  // Plus besoin de setupResponsiveInterface - le panier fonctionne partout
});

function addToCart(product) {
  if (!product || product.isOccasion) {
    alert("Le panier est réservé aux produits de boutique.");
    return;
  }

  if (product.status === "sold") {
    alert("Ce produit est marqué comme vendu.");
    return;
  }

  const normalized = mapRegularProduct(product);
  const items = getCartItems();
  const existing = items.find((item) => item.productId === normalized.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({
      productId: normalized.id,
      name: normalized.name,
      price: normalized.price,
      image: normalized.image || PLACEHOLDER_IMAGE,
      phone: normalized.phone,
      shopId: normalized.shopId || normalized.boutique_id || "",
      quantity: 1
    });
  }

  saveCartItems(items);
  updateCartCountUI();
  alert("Produit ajouté au panier.");
}

function updateCartQuantity(productId, delta) {
  const items = getCartItems();
  const item = items.find((x) => x.productId === productId);
  if (!item) return;

  item.quantity = Math.max(1, Number(item.quantity || 1) + delta);
  saveCartItems(items);
}

function removeFromCart(productId) {
  const items = getCartItems().filter((x) => x.productId !== productId);
  saveCartItems(items);
}

function clearCart() {
  saveCartItems([]);
}

function buildMultipleOrderMessage(template, items) {
  if (!items || items.length === 0) return "";
  
  if (items.length === 1) {
    return buildOrderMessage(template, items[0]);
  }

  const total = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  
  // Grouper par boutique pour un message plus organisé
  const itemsByShop = {};
  items.forEach(item => {
    const shopInfo = getShopInfo(item.shopId);
    const shopName = shopInfo ? shopInfo.nom : "Boutique inconnue";
    if (!itemsByShop[shopName]) {
      itemsByShop[shopName] = [];
    }
    itemsByShop[shopName].push(item);
  });

  let message = [];

  // Si une seule boutique, commencer directement par son nom
  const shopNames = Object.keys(itemsByShop);
  if (shopNames.length === 1) {
    message.push(`Bonjour, ${shopNames[0]}.`);
    message.push("Je souhaite commander les produits suivants:");
  } else {
    message.push("Bonjour,");
    message.push("Je souhaite commander les produits suivants:");
  }

  message.push("");

  shopNames.forEach(shopName => {
    if (shopNames.length > 1) {
      message.push(`**Boutique: ${shopName}**`);
    }
    
    itemsByShop[shopName].forEach((item, index) => {
      const itemTotal = Number(item.price || 0) * Number(item.quantity || 1);
      const imageUrl = getShareableImageUrl(item.image);
      
      message.push(`${index + 1}. ${item.name}`);
      message.push(`   Quantité: ${item.quantity}`);
      message.push(`   Prix unitaire: ${formatPrice(item.price)}`);
      message.push(`   Sous-total: ${formatPrice(itemTotal)}`);
      
      if (imageUrl) {
        message.push(`   Image: ${imageUrl}`);
      }
      message.push("");
    });
  });

  message.push(`Total général: ${formatPrice(total)}`);

  if (template === "livraison") {
    message.push("");
    message.push("Pouvez-vous confirmer la disponibilité de tous ces produits, le mode de livraison et le délai ?");
  } else if (template === "reservation") {
    message.push("");
    message.push("Merci de me confirmer la réservation de tous ces produits et les prochaines étapes.");
  } else {
    message.push("");
    message.push("Merci de me confirmer la disponibilité de tous ces produits.");
  }
  
  message.push("Merci.");

  return message.join("\n");
}

function getShopInfo(shopId) {
  if (!shopId) return null;
  return getShops().find(s => s.id === shopId) || null;
}

function buildOrderMessage(template, item) {
  const total = Number(item.price || 0) * Number(item.quantity || 1);
  const imageUrl = getShareableImageUrl(item.image);
  const productUrl = getShareableProductUrl(item);
  const shopInfo = getShopInfo(item.shopId);
  const shopName = shopInfo ? shopInfo.nom : "Boutique inconnue";

  const visualHints = [
    imageUrl ? "Image du produit:" : "",
    imageUrl,
    productUrl ? `Fiche produit: ${productUrl}` : ""
  ].filter(Boolean);

  if (template === "livraison") {
    return [
      `Bonjour, ${shopName}.`,
      `Je souhaite commander: ${item.name}.`,
      `Quantité: ${item.quantity}.`,
      `Montant estimé: ${formatPrice(total)}.`,
      ...visualHints,
      "Pouvez-vous confirmer la disponibilité, le mode de livraison et le délai ?",
      "Merci."
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (template === "reservation") {
    return [
      `Bonjour, ${shopName}.`,
      `Je souhaite réserver le produit suivant: ${item.name}.`,
      `Quantité: ${item.quantity}.`,
      `Budget: ${formatPrice(total)}.`,
      ...visualHints,
      "Merci de me confirmer la réservation et les prochaines étapes.",
      "Merci."
    ]
      .filter(Boolean)
      .join("\n");
}

  return [
    `Bonjour, ${shopName}.`,
    `Je souhaite commander le produit: ${item.name}.`,
    `Quantité: ${item.quantity}.`,
    `Montant estimé: ${formatPrice(total)}.`,
    ...visualHints,
    "Merci de me confirmer la disponibilité.",
    "Cordialement."
  ]
    .filter(Boolean)
    .join("\n");
}

function getShareableImageUrl(image) {
  return toAbsoluteUrl(image);
}

function getShareableProductUrl(item) {
  if (!item?.productId) return "";
  const relativePath = getProductDetailUrl({ id: item.productId, isOccasion: false });
  return toAbsoluteUrl(relativePath);
}

function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (/^data:/i.test(pathOrUrl)) return "";

  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch (_) {
    return "";
  }
}

/* ===================================
   GESTION DES FAVORIS (LIKES)
   =================================== */
async function toggleLike(id, type) {
  const user = currentUser();
  if (!user) {
    alert("Veuillez vous connecter pour ajouter des favoris.");
    return;
  }

  // Cas spécifique pour les vidéos (stocké dans le document vidéo, pas user)
  if (type === 'video') {
    try {
      // Update UI optimiste
      const btn = document.querySelector(`.like-btn[data-id="${id}"][data-type="video"]`);
      const countEl = document.querySelector(`.video-like-count[data-id="${id}"]`);
      
      if (btn) {
        const isNowActive = btn.classList.toggle("active");
        if (countEl) {
          let count = parseInt(countEl.textContent || "0");
          countEl.textContent = isNowActive ? count + 1 : Math.max(0, count - 1);
        }
      }

      await toggleVideoLike(id, user.id);
      // On ne recharge pas toute la liste pour ne pas couper la vidéo en cours
    } catch (error) {
      console.error("Erreur like vidéo:", error);
      alert("Erreur lors du like.");
    }
    return;
  }

  const field = type === 'product' ? 'likedProducts' : 'favoriteShops';
  
  let list = user[field] || [];

  if (list.includes(id)) {
    list = list.filter(item => item !== id); // Retirer
  } else {
    list.push(id); // Ajouter
  }

  // Mise à jour locale
  user[field] = list;
  write(STORAGE_KEYS.loggedUser, user);

  // Mise à jour Firestore
  try {
    if (type === 'shop') {
      // Pour les boutiques, on utilise la transaction spéciale (bidirectionnelle)
      await toggleShopFollow(user.id, id);
      // Recharger les données pour avoir les compteurs à jour
      await syncData();
    } else {
      // Pour les produits, simple update
      await updateUserInFirestore(user.id, { [field]: list });
    }
    
    // Mettre à jour l'UI immédiatement (tous les boutons avec cet ID)
    document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(btn => {
      btn.classList.toggle("active");
    });
    
  } catch (error) {
    console.error("Erreur sauvegarde like:", error);
    alert("Erreur lors de la mise à jour des favoris.");
  }
}

/* ===================================
   GESTION DES STORIES
   =================================== */
async function setupStories() {
  const container = document.getElementById("storiesContainer");
  if (!container) return;

  const user = currentUser();
  
  // Récupérer les stories actives depuis Firebase
  const stories = await getActiveStories();
  
  // Regrouper les stories par utilisateur (userId)
  const storiesByUser = {};

  stories.forEach(story => {
    if (!storiesByUser[story.userId]) {
      storiesByUser[story.userId] = {
        userName: story.userName,
        userAvatar: story.userAvatar,
        stories: []
      };
    }
    storiesByUser[story.userId].stories.push(story);
  });

  // Séparer "Mes stories" des autres
  let myStories = [];
  if (user && storiesByUser[user.id]) {
    myStories = storiesByUser[user.id].stories;
    // Trier les stories de la plus récente à la plus ancienne pour trouver la dernière
    myStories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    delete storiesByUser[user.id]; // On retire pour ne pas l'afficher deux fois
  }

  // --- GENERATION HTML ---
  let myStoryHtml = '';
  // Si l'utilisateur a des stories, préparer le cercle "Ma Story"
  if (myStories.length > 0) {
    const latestStory = myStories[0];
    
    // Utiliser la photo de la dernière story. Si c'est une vidéo, on tente de générer une miniature (Cloudinary .jpg)
    let storyThumbnail = user?.photo_profil || 'https://ui-avatars.com/api/?name=Me&background=eee&color=333';
    
    if (latestStory.mediaType === 'image') {
      storyThumbnail = latestStory.mediaUrl;
    } else if (latestStory.mediaType === 'video') {
      // Astuce pour Cloudinary : changer l'extension vidéo par .jpg pour avoir la miniature
      storyThumbnail = latestStory.mediaUrl.replace(/\.[^/.]+$/, ".jpg");
    }

    // Optimisation de la miniature story (100px suffisent pour le cercle)
    storyThumbnail = optimizeCloudinaryUrl(storyThumbnail, 150);

    myStoryHtml = `
      <div class="story-item" id="myStoryBtn">
        <div class="story-ring">
          <img src="${storyThumbnail}" class="story-img" alt="Ma Story">
        </div>
        <span class="story-name">Ma Story</span>
      </div>
    `;
  }

  // Toujours afficher le bouton "Créer story"
  const createStoryHtml = `
    <div class="story-item create" id="addStoryBtn">
      <div class="story-ring">
        <img src="${user?.photo_profil || 'https://ui-avatars.com/api/?name=Me&background=eee&color=333'}" class="story-img" alt="Moi">
        <div class="story-badge-plus">+</div>
      </div>
      <span class="story-name">Créer story</span>
    </div>
  `;
 
  let otherStoriesHtml = '';
  // Afficher les stories des autres utilisateurs
  Object.keys(storiesByUser).forEach(userId => {
    const group = storiesByUser[userId];
    
    // Trier pour être sûr d'avoir la dernière story en premier
    group.stories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = group.stories[0];

    // Par défaut l'avatar, sinon l'image de la dernière story
    let img = group.userAvatar || "https://placehold.co/100x100";
    
    if (latest) {
      if (latest.mediaType === 'image') {
        img = latest.mediaUrl;
      } else if (latest.mediaType === 'video') {
        // Astuce Cloudinary : remplacer l'extension vidéo par .jpg pour la miniature
        img = latest.mediaUrl.replace(/\.[^/.]+$/, ".jpg");
      }
    }
    
    // Optimisation de l'avatar/miniature story
    img = optimizeCloudinaryUrl(img, 150);

    otherStoriesHtml += `
      <div class="story-item view-story" data-userid="${userId}">
        <div class="story-ring">
          <img src="${img}" class="story-img" alt="${group.userName}">
        </div>
        <span class="story-name">${group.userName}</span>
      </div>
    `;
  });
  
  // Assembler le tout: Créer, Ma Story (si elle existe), puis les autres
  container.innerHTML = `<div class="stories-wrapper">${createStoryHtml}${myStoryHtml}${otherStoriesHtml}</div>`;

  // 1. Clic sur "Créer story"
  const addStoryBtn = document.getElementById("addStoryBtn");
  if (addStoryBtn) {
    addStoryBtn.addEventListener("click", () => {
      if (!user) return window.location.href = 'login.html';
      
      // Si j'ai déjà des stories, on ouvre le viewer, sinon l'uploader
      openStoryUploader(); // Ouvre toujours l'uploader
    });
  }

  // 2. Clic sur "Ma Story" (s'il existe)
  const myStoryBtn = document.getElementById("myStoryBtn");
  if (myStoryBtn) {
    myStoryBtn.addEventListener("click", () => {
      if (myStories.length > 0) {
        openStoryViewer(myStories, user);
      } else {
        openStoryUploader();
      }
    });
  }

  // 3. Clic sur les autres stories
  container.querySelectorAll(".view-story").forEach(el => {
    el.addEventListener("click", () => {
      const userId = el.dataset.userid;
      const group = storiesByUser[userId];
      if (group && group.stories.length > 0) {
        openStoryViewer(group.stories, { nom: group.userName, photo_profil: group.userAvatar });
      }
    });
  });
}

// --- LOGIQUE UPLOAD STORY ---
function openStoryUploader() {
  const modal = document.getElementById("storyUploadModal");
  const fileInput = document.getElementById("storyFileInput");
  const previewArea = document.getElementById("storyPreviewArea");
  const triggerBtn = document.getElementById("triggerStoryFileBtn");
  const publishBtn = document.getElementById("publishStoryBtn");
  const closeBtn = modal.querySelector(".close-modal");
  let selectedFile = null;

  modal.classList.add("active");

  // Reset
  fileInput.value = "";
  previewArea.innerHTML = '<p class="meta">Cliquez pour ajouter une photo ou vidéo</p>';
  publishBtn.disabled = true;
  publishBtn.textContent = "Publier la story";

  // Close events
  const closeModal = () => modal.classList.remove("active");
  closeBtn.onclick = closeModal;
  // Click outside to close (optional, maybe annoying if uploading)
  
  // Trigger file select
  triggerBtn.onclick = () => fileInput.click();
  previewArea.onclick = () => fileInput.click();

  // File Selected
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      publishBtn.disabled = true;
      return;
    }

    selectedFile = file;
    publishBtn.disabled = true; // Désactiver par défaut

    const objectUrl = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      previewArea.innerHTML = `<img src="${objectUrl}" style="max-width:100%; max-height:300px;">`;
      publishBtn.disabled = false; // Activer pour les images
    } else if (file.type.startsWith("video/")) {
      // Vérifier la durée de la vidéo
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function() {
        window.URL.revokeObjectURL(video.src); // Libérer la mémoire
        if (video.duration > 60) {
          alert("La vidéo ne doit pas dépasser 60 secondes.");
          fileInput.value = ""; // Vider la sélection
          selectedFile = null;
          previewArea.innerHTML = '<p class="meta">Cliquez pour ajouter une photo ou vidéo</p>';
        } else {
          previewArea.innerHTML = `<video src="${objectUrl}" controls style="max-width:100%; max-height:300px;"></video>`;
          publishBtn.disabled = false; // Activer si la durée est OK
        }
      };
      video.src = objectUrl;
    }
  };

  // Publish
  publishBtn.onclick = async () => {
    if (!selectedFile) return;
    const user = currentUser();
    
    publishBtn.disabled = true;
    publishBtn.textContent = "Envoi en cours (patience)...";

    try {
      // 1. Upload Cloudinary (Video ou Image)
      const mediaData = await uploadMediaToCloudinary(selectedFile);

      // 2. Save to Firestore
      await saveStory({
        userId: user.id,
        userName: user.nom || "Utilisateur",
        userAvatar: user.photo_profil || "",
        mediaUrl: mediaData.url,
        mediaType: mediaData.type // 'image' ou 'video'
      });

      alert("Story publiée !");
      closeModal();
      setupStories(); // Refresh list
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la publication.");
      publishBtn.disabled = false;
      publishBtn.textContent = "Réessayer";
    }
  };
}

// --- LOGIQUE VIEWER STORY ---
let currentStoryTimer = null;

function openStoryViewer(stories, userContext) {
  const modal = document.getElementById("storyViewerModal");
  const contentContainer = document.getElementById("storyContentContainer");
  const progressContainer = document.getElementById("storyProgressContainer");
  const userInfo = document.getElementById("storyUserInfo");
  const closeBtn = modal.querySelector(".close-story-viewer");

  let currentIndex = 0;
  modal.classList.add("active");

  // Créer ou récupérer le bouton de suppression
  let deleteBtn = modal.querySelector(".delete-story-btn");
  if (!deleteBtn) {
    deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-story-btn";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    modal.appendChild(deleteBtn);
  }

  // Générer les segments de progression (1 par story)
  progressContainer.innerHTML = stories.map(() => 
    `<div class="story-segment"><div class="story-segment-fill"></div></div>`
  ).join('');

  const closeViewer = () => {
    modal.classList.remove("active");
    contentContainer.innerHTML = "";
    if (currentStoryTimer) clearTimeout(currentStoryTimer);
  };

  closeBtn.onclick = closeViewer;

  const showStory = (index) => {
    if (index >= stories.length) {
      closeViewer();
      return;
    }

    if (index < 0) index = 0;
    currentIndex = index;

    // IMPORTANT: On définit la story et l'utilisateur COURANT avant de les utiliser
    const story = stories[index];
    const currentUserData = currentUser();

    // --- MISE A JOUR DES INFOS (Temps + Vues) ---
    const timeAgo = formatTimeAgo(story.createdAt);
    const viewers = story.viewers || [];
    const viewCount = viewers.length;
    
    // Incrémenter la vue si ce n'est pas ma story et que je ne l'ai pas encore vue
    if (currentUserData && currentUserData.id !== story.userId) {
        if (!viewers.includes(currentUserData.id)) {
            viewStory(story.id, currentUserData.id);
            // Mise à jour locale pour éviter le double comptage dans la session
            if (!story.viewers) story.viewers = [];
            story.viewers.push(currentUserData.id);
        }
    }

    // Construction de l'affichage info
    let metaInfo = timeAgo;
    // Si c'est ma story, j'affiche le nombre de vues
    if (currentUserData && currentUserData.id === story.userId) {
        metaInfo += ` • ${viewCount} vue${viewCount > 1 ? 's' : ''}`;
    }

    userInfo.innerHTML = `
      <img src="${userContext.photo_profil || "https://placehold.co/50x50"}" style="width:32px; height:32px; border-radius:50%;">
      <div style="display:flex; flex-direction:column; justify-content:center;">
        <span style="line-height:1.2;">${userContext.nom}</span>
        <span style="font-size:0.75rem; opacity:0.8; font-weight:normal;">${metaInfo}</span>
      </div>
    `;

    contentContainer.innerHTML = ""; // Clear previous
    
    // Réinitialiser visuellement les barres
    const fills = progressContainer.querySelectorAll(".story-segment-fill");
    fills.forEach((fill, i) => {
      fill.style.transition = "none";
      fill.style.width = i < index ? "100%" : "0%";
    });

    if (currentStoryTimer) clearTimeout(currentStoryTimer);

    // Gestion du bouton supprimer (si c'est ma story)
    if (currentUserData && currentUserData.id === story.userId) {
      deleteBtn.style.display = "flex";
      deleteBtn.onclick = async (e) => {
        e.stopPropagation(); // Empêcher la navigation
        if (confirm("Voulez-vous vraiment supprimer cette story ?")) {
          // Mettre en pause le timer
          if (currentStoryTimer) clearTimeout(currentStoryTimer);
          
          try {
            await deleteStory(story.id);
            alert("Story supprimée.");
            closeViewer();
            setupStories(); // Recharger la barre des stories
          } catch (error) {
            console.error(error);
            alert("Erreur lors de la suppression.");
          }
        }
      };
    } else {
      deleteBtn.style.display = "none";
    }

    // Create Element
    let mediaEl;
    if (story.mediaType === "video") {
      mediaEl = document.createElement("video");
      mediaEl.src = story.mediaUrl;
      mediaEl.autoplay = true;
      mediaEl.className = "story-media";
      // Mobile autoplay often requires muted
      // mediaEl.muted = false; // User has to unmute usually or we rely on interaction
      
      mediaEl.onloadedmetadata = () => {
        const duration = mediaEl.duration * 1000;
        startProgress(duration);
      };
      mediaEl.onended = () => showStory(currentIndex + 1);
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = story.mediaUrl;
      mediaEl.className = "story-media";
      startProgress(5000); // 5 seconds for images
    }

    contentContainer.appendChild(mediaEl);

    // Navigation Tap zones
    mediaEl.addEventListener("click", (e) => {
      const width = window.innerWidth;
      if (e.clientX < width / 3) {
        showStory(currentIndex - 1); // Prev
      } else {
        showStory(currentIndex + 1); // Next
      }
    });
  };

  const startProgress = (duration) => {
    const fills = progressContainer.querySelectorAll(".story-segment-fill");
    const currentFill = fills[currentIndex];
    
    if (currentFill) {
      // Force reflow pour redémarrer l'animation
      void currentFill.offsetWidth;
      currentFill.style.transition = `width ${duration}ms linear`;
      currentFill.style.width = "100%";
    }

    if (stories[currentIndex].mediaType !== "video") {
        currentStoryTimer = setTimeout(() => {
            showStory(currentIndex + 1);
        }, duration);
    }
  };

  showStory(0);
}

function bindAddToCartButtons(root) {
  if (!root) return;

  root.querySelectorAll("button[data-action='add-cart']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id") || "";
      if (!id) return;

      const regular = getProducts().map(mapRegularProduct);
      const product = regular.find((p) => p.id === id);
      if (!product) {
        alert("Produit introuvable.");
      return;
    }

      addToCart(product);
    });
  });

  // Bind Like Buttons
  root.querySelectorAll(".like-btn").forEach((btn) => {
    // Retirer les anciens listeners pour éviter les doublons (si re-render)
    const newBtn = btn.cloneNode(true); 
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Empêcher le clic sur l'image
      e.stopPropagation();
      const id = newBtn.getAttribute("data-id");
      const type = newBtn.getAttribute("data-type");
      toggleLike(id, type);
    });
  });
}

function buildOccasionWhatsappMessage(product) {
  const reference = product.id ? `Ref: ${product.id}` : "";

  return [
    "Bonjour,",
    `Je suis interesse(e) par votre produit d'occasion: ${product.name}.`,
    `Prix affiche: ${formatPrice(product.price)}.`,
    reference,
    "Est-il toujours disponible ?",
    "Pouvez-vous aussi confirmer l'etat exact du produit, votre localisation et le dernier prix ?",
    "Merci."
  ]
    .filter(Boolean)
    .join("\n");
}

function renderProductCard(product, opts = {}) {
  const normalized = product.isOccasion ? mapOccasionToMarketplace(product) : mapRegularProduct(product);
  const images = normalizeImageArray(normalized.images, normalized.image);
  
  // Optimisation de l'image de couverture (400px de large suffit pour les cartes)
  const coverImage = optimizeCloudinaryUrl(images[0] || PLACEHOLDER_IMAGE, 400);
  
  const shopParam = normalized.shopId ? `?shop=${encodeURIComponent(normalized.shopId)}` : "";
  const isSold = normalized.status === "sold";
  const galleryUrl = getProductDetailUrl(normalized);

  // État du like
  const user = currentUser();
  const isLiked = user && user.likedProducts && user.likedProducts.includes(normalized.id);
  const likeBtn = `<button class="like-btn ${isLiked ? 'active' : ''}" data-id="${normalized.id}" data-type="product" title="${isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}">♥</button>`;

  // Calcul du badge "Nouveau" (moins de 3 jours)
  let isNew = false;
  const dateVal = normalized.createdAt || normalized.date_publication || normalized.date_creation;
  if (dateVal && !isSold) {
    try {
      const pDate = (typeof dateVal.toDate === 'function') ? dateVal.toDate() : new Date(dateVal);
      if ((new Date() - pDate) / (1000 * 60 * 60 * 24) <= 3) isNew = true;
    } catch (e) {}
  }

  const shop = !normalized.isOccasion
    ? getShops().find((s) => s.id === normalized.shopId || s.id === normalized.boutique_id)
    : null;

  let shopLogoUrl = shop ? (shop.logo || "https://placehold.co/50x50/ff6a00/ffffff?text=K") : "";
  if (shopLogoUrl) {
     shopLogoUrl = optimizeCloudinaryUrl(shopLogoUrl, 80); // Petit logo optimisé
  }

  const shopSnippet = shop
    ? `<a class="shop-snippet" href="shop-details.html?id=${encodeURIComponent(shop.id)}"><img src="${shopLogoUrl}" alt="${shop.nom}" loading="lazy"><span>${shop.nom}</span></a>`
    : "";

  const cartAction = !normalized.isOccasion
    ? `<button class="secondary" data-action="add-cart" data-id="${normalized.id}" type="button">Ajouter au panier</button>`
    : "";

  // Créer le message WhatsApp pour commande directe
  const whatsappOrderMessage = !normalized.isOccasion ? buildOrderMessage("standard", {
    name: normalized.name,
    price: normalized.price,
    quantity: 1,
    image: normalized.image,
    shopId: normalized.shopId,
    phone: normalized.phone
  }) : buildOccasionWhatsappMessage(normalized);

  const whatsappHref = `https://wa.me/${normalizePhone(normalized.phone)}?text=${encodeURIComponent(whatsappOrderMessage)}`;

  return `
    <article class="card compact-card">
      <a class="card-image-link" href="${galleryUrl}">
        ${likeBtn}
        <img src="${coverImage}" alt="${normalized.name}" loading="lazy" decoding="async">
      </a>
      <div class="card-body">
        ${shopSnippet}
        <span class="tag ${isSold ? "sold" : ""}">${isSold ? "Vendu" : "Disponible"}</span>
        ${isNew ? `<span class="tag" style="background: #e6f4ea; color: #1e8e3e; margin-left: 4px;">Nouveau</span>` : ""}
        <h4><a class="product-title-link" href="${galleryUrl}">${normalized.name}</a></h4>
        <p class="meta">${formatPrice(normalized.price)} • ${normalized.category || "Autre"}</p>
        <p class="meta clamp-two">${normalized.description || "Sans description"}</p>
        <div class="row-actions">
          <a class="link-btn" href="${whatsappHref}" target="_blank" rel="noopener">Commander</a>
          ${cartAction}
          ${opts.sellerActions ? `
            <button class="warning" data-action="toggle-sold" data-id="${normalized.id}">${isSold ? "Remettre disponible" : "Marquer vendu"}</button>
            <button style="background-color: var(--danger, #d93025); color: white;" data-action="delete-product" data-id="${normalized.id}" data-origin="${normalized.isOccasion ? 'occasion' : 'regular'}">Supprimer le produit</button>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function getProducts() {
  // Retourne les produits qui NE SONT PAS d'occasion (donc boutiques)
  return cachedProducts.filter(p => p.category !== 'Occasion');
}

function getMarketplaceProducts() {
  const regular = getProducts().map(mapRegularProduct);
  const occasion = getOccasionProducts().map(mapOccasionToMarketplace);
  return [...regular, ...occasion];
}

function getShops() {
  return cachedShops;
}

function getOccasionProducts() {
  return cachedProducts.filter(p => p.category === 'Occasion');
}

function setupRegister() {
  const btn = document.getElementById("registerBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const whatsapp = normalizePhone(document.getElementById("whatsapp").value);
    const role = document.getElementById("role").value;

    if (!name || !email || !password || !whatsapp) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    // Validation stricte du mot de passe avant création
    const passwordValid = 
      password.length >= 6 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password);

    if (!passwordValid) {
      alert("Le mot de passe doit respecter tous les critères de sécurité.");
      return;
    }

    // FIREBASE REGISTER
    try {
      const firebaseUser = await registerUser(email, password);
      
      const userData = {
        id: firebaseUser.uid, // On utilise l'ID Firebase
        nom: name,
        email: email,
        // Pas de mot de passe stocké ici
        numero_whatsapp: whatsapp,
        type_compte: role,
        photo_profil: "",
        date_creation: new Date().toISOString()
      };

      await saveUserToFirestore(firebaseUser, userData);
      
      alert("Compte créé avec succès.");
      if (role === "seller") {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "home.html";
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        alert("Cet email est déjà utilisé.");
      } else {
        alert("Erreur lors de l'inscription : " + error.message);
      }
    }
  });
}

function setupLogin() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    try {
      const firebaseUser = await loginUser(email, password);
      const userData = await getUserFromFirestore(firebaseUser.uid);

      if (userData) {
        write(STORAGE_KEYS.loggedUser, userData);
        
        if (userData.type_compte === "seller") {
          window.location.href = "dashboard.html";
        } else {
          window.location.href = "home.html";
        }
      } else {
        alert("Erreur : Impossible de récupérer les données utilisateur.");
      }
    } catch (error) {
      console.error(error);
      alert("Email ou mot de passe incorrect.");
    }
  });
}

function setupPasswordToggle() {
  const toggleButton = document.getElementById("passwordToggle");
  const passwordInput = document.getElementById("password");

  if (!toggleButton || !passwordInput) {
    return;
  }

  toggleButton.addEventListener("click", () => {
    const icon = toggleButton.querySelector("i");
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    } else {
      passwordInput.type = "password";
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  });
}

function setupPasswordValidation() {
  const passwordInput = document.getElementById("password");
  // Vérifier si les éléments de critères existent (page register)
  const lengthCriteria = document.getElementById("length-criteria");
  
  if (!passwordInput || !lengthCriteria) return;

  const criteriaElements = {
    length: document.getElementById("length-criteria"),
    uppercase: document.getElementById("uppercase-criteria"),
    lowercase: document.getElementById("lowercase-criteria"),
    number: document.getElementById("number-criteria")
  };

  passwordInput.addEventListener("input", () => {
    const password = passwordInput.value;
    const checks = {
      length: password.length >= 6,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password)
    };

    for (const key in criteriaElements) {
      const el = criteriaElements[key];
      if (el) {
        const isValid = checks[key];
        el.classList.toggle("valid", isValid);
        const icon = el.querySelector(".criteria-icon");
        if (icon) icon.textContent = isValid ? "✓" : "○";
      }
    }
  });
}

async function setupHome() {
  const container = document.getElementById("products");
  if (!container) return;

  const empty = document.getElementById("emptyProducts");
  const searchBtn = document.getElementById("searchBtn");

  function render() {
    const q = (document.getElementById("searchInput").value || "").trim().toLowerCase();
    const category = document.getElementById("categoryFilter").value;
    const maxPrice = Number(document.getElementById("maxPriceFilter").value || 0);

    const products = getMarketplaceProducts().filter((p) => {
      const byText = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
      let byCategory = !category || p.category === category;
      // Cas spécial pour la catégorie "Occasion" sur la page d'accueil
      if (category === "Occasion") {
        byCategory = p.isOccasion;
      }
      const byPrice = !maxPrice || Number(p.price) <= maxPrice;
      return byText && byCategory && byPrice;
    });

    container.innerHTML = products.map((p) => renderProductCard(p)).join("");
    empty.style.display = products.length ? "none" : "block";
    bindAddToCartButtons(container);
  }

  searchBtn?.addEventListener("click", render);
  
  // Instant Search : on filtre dès que l'utilisateur tape quelque chose
  const searchInput = document.getElementById("searchInput");
  searchInput?.addEventListener("input", render);
  searchInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") render(); });

  document.getElementById("categoryFilter")?.addEventListener("change", render);
  document.getElementById("maxPriceFilter")?.addEventListener("input", render);
  render();
}

function requireSeller() {
  const user = currentUser();
  if (!user || user.type_compte !== "seller") {
    alert("Compte vendeur requis.");
    window.location.href = "login.html";
    return null;
  }
  return user;
}

async function setupDashboard() {
  const list = document.getElementById("productList");
  if (!list) return;

  const user = requireSeller();
  if (!user) return;

  const addProductBtn = document.getElementById("addProductBtn");
  const empty = document.getElementById("emptySellerProducts");

  setupFilesPreview("imageFiles", "imagePreviewList");

  function getSellerShop() {
    return getShops().find((s) => s.vendeur_id === user.id) || null;
  }

  function renderSellerProducts() {
    const products = getProducts().filter((p) => p.vendeur_id === user.id)
      .map(mapRegularProduct);

    list.innerHTML = products.map((p) => renderProductCard(p, { sellerActions: true })).join("");
    empty.style.display = products.length ? "none" : "block";

    list.querySelectorAll("button[data-action='toggle-sold']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const all = getProducts();
        const target = all.find((p) => p.id === id);
        if (!target) return;
        target.status = target.status === "sold" ? "available" : "sold";
        renderSellerProducts();
        
        const newStatus = target.status === "sold" ? "available" : "sold";
        updateProductFirestore(id, { status: newStatus }).then(async () => {
            await syncData();
            renderSellerProducts();
        });
      });
    });

    list.querySelectorAll("button[data-action='delete-product']").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;
        const id = btn.getAttribute("data-id");
        // Pas besoin de sauvegarder localement, syncData s'en chargera après
        renderSellerProducts();
        deleteProductFirestore(id).then(async () => {
            await syncData();
            renderSellerProducts();
        });
      });
    });
  }

  addProductBtn.addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const description = document.getElementById("description").value.trim();
    const price = Number(document.getElementById("price").value || 0);
    const category = document.getElementById("category").value;

    const shop = getSellerShop();
    if (!shop) {
      alert("Créez d'abord votre boutique.");
      return;
    }

    if (!name || !price) {
      alert("Nom et prix sont obligatoires.");
      return;
    }

    let images = [];
    try {
      images = await getImagesDataFromInput("imageFiles");
    } catch (error) {
      alert(error.message);
      return;
    }

    if (!images.length) {
      alert("Veuillez sélectionner au moins une image depuis vos dossiers.");
      return;
    }

    const productData = {
      // id: généré par Firestore
      nom: name,
      name,
      description,
      prix: price,
      price,
      image: images[0],
      images,
      categorie: category,
      category,
      vendeur_id: user.id,
      sellerEmail: user.email,
      boutique_id: shop.id,
      shopId: shop.id,
      phone: user.numero_whatsapp,
      date_publication: new Date().toISOString(),
      // date_publication gérée par createdAt
      status: "available"
    };

    try {
        // NOUVEAU: Proposer de publier en story
        if (confirm("Voulez-vous également publier la première photo de ce produit dans votre story ?")) {
            try {
                await saveStory({
                    userId: user.id,
                    userName: user.nom || "Utilisateur",
                    userAvatar: user.photo_profil || "",
                    mediaUrl: productData.image, // L'URL de la première image
                    mediaType: 'image'
                });
            } catch (storyError) {
                console.error("Erreur lors de la publication de la story:", storyError);
                // Pas d'alerte pour ne pas gêner
            }
        }

        await saveProductToFirestore(productData);
        await syncData();
        renderSellerProducts();
        alert("Produit ajouté.");
        // Vider le formulaire
        document.getElementById("name").value = "";
        document.getElementById("description").value = "";
        document.getElementById("price").value = "";
        document.getElementById("category").value = "Téléphone";
        resetFilesPreview("imageFiles", "imagePreviewList");
    } catch(e) {
        alert("Erreur: " + e.message);
    }
  });

    renderSellerProducts();
}

async function setupBoutiquePage() {
  const container = document.getElementById("shopProducts");
  if (!container) return;

  const empty = document.getElementById("emptyShopProducts");
  const title = document.getElementById("shopName");
  const searchInput = document.getElementById("boutiqueSearchInput");
  const searchBtn = document.getElementById("boutiqueSearchBtn");
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get("shop");
  
  // Déterminer la page cible (boutique.html ou boutique-no-connexion.html) pour rester cohérent
  const targetPage = document.body.dataset.page === 'boutique-no-connexion' ? 'boutique-no-connexion.html' : 'boutique.html';

  const shops = getShops();
  const products = getProducts().map(mapRegularProduct);

  function currentQuery() {
    return (searchInput?.value || "").trim().toLowerCase();
    }

  function renderByShop(selectedShop, query) {
    title.textContent = `Boutique: ${selectedShop.nom}`;

    const list = products
      .filter((p) => p.shopId === selectedShop.id || p.boutique_id === selectedShop.id)
      .filter((p) => {
        if (!query) return true;
        return (
          p.name.toLowerCase().includes(query) ||
          (p.description || "").toLowerCase().includes(query) ||
          (p.category || "").toLowerCase().includes(query)
        );
      });

    container.innerHTML = list.map((p) => renderProductCard(p)).join("");
    empty.style.display = list.length ? "none" : "block";
    bindAddToCartButtons(container);
}

  function renderAllShops(query) {
    title.textContent = "Liste des boutiques";

    const byShop = shops
      .filter((shop) => {
        if (!query) return true;

        const nameMatch = (shop.nom || "").toLowerCase().includes(query);
        const descMatch = (shop.description || "").toLowerCase().includes(query);

        const productMatch = products.some((p) => {
          const sameShop = p.shopId === shop.id || p.boutique_id === shop.id;
          if (!sameShop) return false;
          return (
            p.name.toLowerCase().includes(query) ||
            (p.description || "").toLowerCase().includes(query)
          );
        });


        return nameMatch || descMatch || productMatch;
      })
      .map((shop) => {
        const count = products.filter((p) => p.shopId === shop.id || p.boutique_id === shop.id).length;
        
        // Badge Ouvert/Fermé automatique
        let statusBadge = "";
        try {
          if (shop.openTime && shop.closeTime) {
              const now = new Date();
              const currentMins = now.getHours() * 60 + now.getMinutes();
              const [oH, oM] = shop.openTime.split(':').map(Number);
              const [cH, cM] = shop.closeTime.split(':').map(Number);
              const start = oH * 60 + oM;
              const end = cH * 60 + cM;
              
              const isOpen = end < start ? (currentMins >= start || currentMins < end) : (currentMins >= start && currentMins < end);
              statusBadge = isOpen 
                  ? `<span class="tag" style="background:#e6f4ea; color:#1e8e3e; margin-left:5px;">Ouvert</span>` 
                  : `<span class="tag" style="background:#fce8e6; color:#c5221f; margin-left:5px;">Fermé</span>`;
          }
        } catch (e) { console.error("Erreur calcul horaires", e); }

        // État favori boutique (Déplacé ici pour être accessible dans le HTML)
        const user = currentUser();
        const isFav = user && user.favoriteShops && user.favoriteShops.includes(shop.id);
        const favBtnStr = user ? `<button class="like-btn ${isFav ? 'active' : ''}" data-id="${shop.id}" data-type="shop" style="position:static; width:auto; height:auto; background:none; box-shadow:none;">${isFav ? '♥ Suivi' : '♡ Suivre'}</button>` : '';

        // Optimisation image boutique
        const shopImg = optimizeCloudinaryUrl(shop.logo || "https://placehold.co/640x360?text=Boutique", 400);

    return `
          <article class="card compact-card">
            <img src="${shopImg}" alt="${shop.nom}" loading="lazy" decoding="async">
        <div class="card-body">
          <h4>${shop.nom}</h4>
              <p class="meta clamp-two">${shop.description || "Sans description"}</p>
              ${shop.horaires ? `<p class="meta" style="font-size: 0.85rem; color: var(--primary);">🕒 ${shop.horaires} ${statusBadge}</p>` : (statusBadge ? `<p class="meta">${statusBadge}</p>` : "")}
          <p class="meta">${count} produit(s)</p>
          <div class="row-actions">
                ${favBtnStr}
                <a class="link-btn" href="https://wa.me/${normalizePhone(shop.contact_whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="link-btn secondary" href="shop-details.html?id=${encodeURIComponent(shop.id)}">Visiter la boutique</a>
          </div>
        </div>
      </article>
    `;
      });

    container.innerHTML = byShop.join("");
    
    // Bind des boutons like boutique
    container.querySelectorAll(".like-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        toggleLike(id, 'shop');
        // Mise à jour visuelle spécifique pour le texte du bouton boutique
        const isActive = !btn.classList.contains("active"); // On vient de toggle dans la fonction, mais l'UI n'est pas encore rafraichie ici pour le texte
        btn.textContent = isActive ? '♥ Suivi' : '♡ Suivre';
      });
    });

    empty.style.display = byShop.length ? "none" : "block";
  }

  function render() {
    const query = currentQuery();

    if (shopId) {
      const selectedShop = shops.find((s) => s.id === shopId);
      if (selectedShop) {
        renderByShop(selectedShop, query);
        return;
      }
    }

    renderAllShops(query);
  }

  searchBtn?.addEventListener("click", render);
  searchInput?.addEventListener("input", render);

  render();
}

async function setupOccasionPage() {
  const page = document.body.dataset.page;
  if (page !== 'occasion' && page !== 'occasion-no-connexion') {
    return;
  }

  const container = document.getElementById("occasionList");
  if (!container) return;

  const empty = document.getElementById("emptyOccasion");
  const searchInput = document.getElementById("occasionSearchInput");
  const searchBtn = document.getElementById("occasionSearchBtn");
  const categoryFilter = document.getElementById("categoryFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");

  function render() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const category = categoryFilter?.value || "";
    const maxPrice = Number(maxPriceFilter?.value || 0);

    const products = getOccasionProducts()
      .map(mapOccasionToMarketplace)
      .filter((p) => {
        const byText = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
        const byCategory = !category || p.category === category;
        const byPrice = !maxPrice || Number(p.price) <= maxPrice;
        return byText && byCategory && byPrice;
      });

    container.innerHTML = products.map((p) => renderProductCard(p)).join("");
    bindAddToCartButtons(container); // Important pour attacher les événements like
    if (empty) empty.style.display = products.length ? "none" : "block";
  }

  searchBtn?.addEventListener("click", render);
  searchInput?.addEventListener("input", render);
  categoryFilter?.addEventListener("change", render);
  maxPriceFilter?.addEventListener("input", render);
  render();
}

function setupPublication() {
  const publishBtn = document.getElementById("publishOccasionBtn");
  if (!publishBtn) return;

  const user = currentUser();
  if (!user) {
    alert("Vous devez être connecté pour publier une annonce.");
    window.location.href = 'login.html';
    return;
  }

  setupFilesPreview("occImageFiles", "occImagePreviewList");

  // --- GESTION DES ONGLETS (Photo vs Vidéo) ---
  const tabs = document.querySelectorAll(".tab-btn");
  const forms = document.querySelectorAll(".form-section");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Retirer active partout
      tabs.forEach(t => t.classList.remove("active"));
      forms.forEach(f => f.classList.remove("active"));
      
      // Activer l'onglet cliqué
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  // --- PUBLICATION PRODUIT (PHOTO) ---
  publishBtn.addEventListener("click", async () => {
    const nom = document.getElementById("occName").value.trim();
    const description = document.getElementById("occDescription").value.trim();
    const prix = Number(document.getElementById("occPrice").value || 0);
    const category = document.getElementById("occCategory").value;
    const numero_whatsapp = normalizePhone(document.getElementById("occPhone").value);

    if (!nom || !prix || !numero_whatsapp) {
      alert("Nom, prix et WhatsApp sont obligatoires.");
      return;
    }

    // Récupération des fichiers directement depuis l'input
    const fileInput = document.getElementById("occImageFiles");
    const files = fileInput ? fileInput.files : [];

    if (files.length === 0) {
      alert("Veuillez ajouter au moins une image.");
      return;
    }

    // Feedback utilisateur
    publishBtn.textContent = "Publication en cours...";
    publishBtn.disabled = true;

    try {
      // Upload des images vers Cloudinary
      const imageUrls = [];
      for (const file of files) {
        const url = await uploadImageToCloudinary(file);
        imageUrls.push(url);
      }

      // Création de l'objet produit pour Firestore
      const productData = {
        name: nom,
        nom: nom, // Doublon pour compatibilité
        description: description,
        price: prix,
        category: "Occasion", // Catégorie principale pour le filtre
        subCategory: category, // Catégorie spécifique (Téléphone, etc.)
        imageUrl: imageUrls[0],
        images: imageUrls,
        phone: numero_whatsapp,
        vendeur_id: user.id, // ID local ou UID Firebase selon votre système Auth
        status: "available"
      };

      // Sauvegarde dans Firestore
      await saveOccasionProduct(productData);

      // NOUVEAU : Proposer de publier la photo en story
      if (confirm("Voulez-vous également publier la première photo de cette annonce dans votre story ?")) {
        try {
          await saveStory({
            userId: user.id,
            userName: user.nom || "Utilisateur",
            userAvatar: user.photo_profil || "",
            mediaUrl: imageUrls[0], // On prend la première image uploadée
            mediaType: 'image'
          });
        } catch (storyError) {
          console.error("Erreur lors de la publication de la story:", storyError);
          // On n'affiche pas d'alerte pour ne pas perturber l'utilisateur, l'annonce principale est déjà passée.
        }
      }

      alert("Annonce publiée avec succès !");
      
      // Réinitialisation du formulaire
      document.getElementById("occName").value = "";
      document.getElementById("occDescription").value = "";
      document.getElementById("occPrice").value = "";
      document.getElementById("occCategory").value = "Téléphone";
      document.getElementById("occPhone").value = "";
      resetFilesPreview("occImageFiles", "occImagePreviewList");
      
      // Redirection vers la liste
      window.location.href = "occasion.html";

    } catch (error) {
      console.error(error);
      alert("Erreur lors de la publication : " + error.message);
    } finally {
      publishBtn.textContent = "Publier l'annonce";
      publishBtn.disabled = false;
    }
  });

  // --- PUBLICATION VIDEO ---
  const videoBtn = document.getElementById("publishVideoBtn");
  const videoInput = document.getElementById("videoFile");
  const videoPreview = document.getElementById("videoPreviewArea");

  if (videoInput) {
    videoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        videoPreview.innerHTML = `<video src="${url}" controls style="max-width:100%; max-height:300px; border-radius:8px;"></video>`;
      }
    });
  }

  if (videoBtn) {
    videoBtn.addEventListener("click", async () => {
      const caption = document.getElementById("videoCaption").value.trim();
      const file = videoInput.files[0];

      if (!file) {
        alert("Veuillez sélectionner une vidéo.");
        return;
      }
      
      // Vérification taille/type basique
      if (file.size > 50 * 1024 * 1024) { // 50MB max
        alert("Vidéo trop volumineuse (max 50MB).");
        return;
      }

      videoBtn.textContent = "Publication en cours (patience)...";
      videoBtn.disabled = true;

      try {
        // Upload
        const mediaData = await uploadMediaToCloudinary(file);
        
        if (mediaData.type !== 'video') {
          throw new Error("Le fichier n'est pas reconnu comme une vidéo.");
        }

        // Sauvegarde Firestore
        await saveShortVideo({
          userId: user.id,
          userName: user.nom || "Utilisateur",
          userAvatar: user.photo_profil || "",
          userPhone: user.numero_whatsapp || "",
          videoUrl: mediaData.url,
          caption: caption
        });

        alert("Vidéo publiée avec succès !");
        window.location.href = "videos.html";

      } catch (e) {
        console.error(e);
        alert("Erreur: " + e.message);
        videoBtn.textContent = "Publier la vidéo";
        videoBtn.disabled = false;
      }
    });
  }
}

/* --- GESTION DES AVIS --- */
function renderReviewsSection(container, product, user) {
  // Nettoyer l'existant
  const existing = document.getElementById("reviewsSection");
  if (existing) existing.remove();

  const section = document.createElement("section");
  section.id = "reviewsSection";
  section.className = "panel reviews-section";
  section.innerHTML = `
    <h3>Avis clients</h3>
    <div id="reviewsList" class="reviews-list">Chargement des avis...</div>
    ${user ? `
      <div class="review-form">
        <h4>Laisser un avis</h4>
        <div class="star-rating" id="starRatingInput">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>
        <textarea id="reviewComment" placeholder="Votre commentaire..." rows="3"></textarea>
        <button id="submitReviewBtn" style="margin-top:10px;">Publier l'avis</button>
      </div>
    ` : `<p><a href="login.html" style="color:var(--primary);">Connectez-vous</a> pour laisser un avis.</p>`}
  `;

  container.appendChild(section);

  // Logique de notation (étoiles)
  let currentRating = 0;
  if (user) {
    const stars = section.querySelectorAll(".star");
    stars.forEach(star => {
      star.addEventListener("click", () => {
        currentRating = parseInt(star.dataset.value);
        stars.forEach(s => {
          s.classList.toggle("active", parseInt(s.dataset.value) <= currentRating);
        });
      });
    });

    document.getElementById("submitReviewBtn").addEventListener("click", async () => {
      const comment = document.getElementById("reviewComment").value.trim();
      if (currentRating === 0) return alert("Veuillez sélectionner une note (étoiles).");
      
      try {
        await saveReview({
          productId: product.id,
          userId: user.id,
          userName: user.nom || user.email,
          rating: currentRating,
          comment: comment
        });
        alert("Avis publié !");
        window.location.reload(); // Recharger pour voir l'avis
      } catch (e) {
        console.error(e);
        alert("Erreur lors de l'envoi de l'avis.");
      }
    });
  }

  return document.getElementById("reviewsList");
}

async function setupProductDetailPage() {
  const page = document.body.dataset.page;
  if (page !== 'product') return;

  function findProduct() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const origin = params.get("origin");
    if (!id) return null;

    const isOccasion = origin === "occasion";
    const products = isOccasion ? getOccasionProducts() : getProducts();
    const product = products.find(p => p.id === id);

    if (!product) return null;
    return isOccasion ? mapOccasionToMarketplace(product) : mapRegularProduct(product);
  }

  const title = document.getElementById("galleryTitle");
  const meta = document.getElementById("galleryMeta");
  const description = document.getElementById("galleryDescription");
  const mainImage = document.getElementById("galleryMainImage");
  const thumbnails = document.getElementById("galleryThumbnails");
  const whatsapp = document.getElementById("galleryWhatsapp");
  const source = document.getElementById("gallerySource");
  const addToCartBtn = document.getElementById("galleryAddToCart");
  const notFound = document.getElementById("galleryNotFound");
  const pageContainer = document.querySelector(".page"); // Conteneur principal pour ajouter la section avis

  if (!title || !mainImage || !notFound) return;

  const product = findProduct();

  if (!product) {
    document.querySelector('.gallery-container')?.classList.add('hidden');
    notFound.classList.remove('hidden');
    return;
  }

  const galleryImages = product.images.length ? product.images : [PLACEHOLDER_IMAGE];

  title.textContent = product.name;
  meta.textContent = `${formatPrice(product.price)} • ${product.category || "Autre"} • ${product.status === "sold" ? "Vendu" : "Disponible"}`;

  // --- PARTAGE SOCIAL ---
  const currentUrl = window.location.href;
  const shareText = `Regarde ça : ${product.name} sur Kome-Gab`;
  
  // Supprimer les anciens boutons s'ils existent déjà (évite les doublons)
  const oldShare = document.querySelector(".share-buttons");
  if(oldShare) oldShare.remove();

  const shareDiv = document.createElement("div");
  shareDiv.className = "share-buttons";
  const btnStyle = "width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; text-decoration: none; border: none; cursor: pointer; font-size: 18px; transition: transform 0.2s;";

  shareDiv.innerHTML = `
    <span class="meta" style="margin-right:8px">Partager:</span>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}" target="_blank" style="${btnStyle} background-color: #1877f2;" title="Facebook"><i class="fab fa-facebook-f"></i></a>
    <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareText)}" target="_blank" style="${btnStyle} background-color: #000000;" title="X (Twitter)"><i class="fa-brands fa-x-twitter"></i></a>
    <a href="https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareText)}" target="_blank" style="${btnStyle} background-color: #229ED9;" title="Telegram"><i class="fab fa-telegram-plane"></i></a>
    <button id="shareIgBtn" title="Copier lien pour Instagram" style="${btnStyle} background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%);"><i class="fab fa-instagram"></i></button>
    <btn id="shareTiktokBtn" title="Copier lien pour TikTok" style="${btnStyle} background-color: #000000;"><i class="fab fa-tiktok"></i></btn>
    <btn id="shareCpBtn" title="Copier le lien" style="${btnStyle} background-color: #555;"><i class="fas fa-link"></i></btn>
  `;
  
  // Insérer après les métadonnées (Prix • Catégorie)
  meta.parentNode.insertBefore(shareDiv, meta.nextSibling);

  // Logique pour copier le lien (Instagram & Copier)
  const copyLinkAction = () => {
      navigator.clipboard.writeText(currentUrl).then(() => alert("Lien copié ! Vous pouvez le coller sur vos réseaux."));
  };
  shareDiv.querySelector("#shareIgBtn").addEventListener("click", copyLinkAction);
  shareDiv.querySelector("#shareTiktokBtn").addEventListener("click", copyLinkAction);
  shareDiv.querySelector("#shareCpBtn").addEventListener("click", copyLinkAction);
  
  // --- CHARGEMENT DES AVIS ---
  const reviews = await getReviews(product.id);
  
  // Calcul moyenne
  if (reviews.length > 0) {
    const avg = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    const starsStr = "★".repeat(Math.round(avg)) + "☆".repeat(5 - Math.round(avg));
    // Ajouter la moyenne sous le titre
    const ratingEl = document.createElement("div");
    ratingEl.innerHTML = `<span style="color:#ffc107; font-size:1.1rem;">${starsStr}</span> <span class="meta">(${reviews.length} avis)</span>`;
    title.parentNode.insertBefore(ratingEl, title.nextSibling);
  }

  // Afficher la section avis
  if (pageContainer) {
    const reviewsListEl = renderReviewsSection(pageContainer, product, currentUser());
    if (reviews.length === 0) {
      reviewsListEl.innerHTML = "<p class='meta'>Aucun avis pour le moment.</p>";
    } else {
      reviewsListEl.innerHTML = reviews.map(r => `
        <div class="review-item">
          <div class="review-header">
            <span>${r.userName}</span>
            <span class="review-stars">${"★".repeat(r.rating)}</span>
          </div>
          <p>${r.comment || ""}</p>
          <small class="meta">${new Date(r.createdAt).toLocaleDateString()}</small>
        </div>
      `).join("");
    }
  }

  description.textContent = product.description || "Sans description";  
  // Pour l'image principale de la galerie, on veut une bonne qualité (800px)
  mainImage.src = optimizeCloudinaryUrl(galleryImages[0], 800);

  thumbnails.innerHTML = galleryImages
    .map((src, index) => {
        const thumbUrl = optimizeCloudinaryUrl(src, 150); // Miniature optimisée
        const fullUrl = optimizeCloudinaryUrl(src, 800);  // URL HD pour le clic
        return `<img class="gallery-thumb ${index === 0 ? "active" : ""}" src="${thumbUrl}" data-src="${fullUrl}" alt="Image ${index + 1}">`;
    })
    .join("");

  thumbnails.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      mainImage.src = thumb.dataset.src || "";
      thumbnails.querySelectorAll(".gallery-thumb").forEach((el) => el.classList.remove("active"));
      thumb.classList.add("active");
    });
  });

  const whatsappMessage = product.isOccasion ? buildOccasionWhatsappMessage(product) : buildOrderMessage("standard", product);
  whatsapp.href = `https://wa.me/${normalizePhone(product.phone)}?text=${encodeURIComponent(whatsappMessage)}`;

  if (product.isOccasion) {
    source.href = "occasion.html";
    source.textContent = "Voir toutes les annonces";
    addToCartBtn?.classList.add("hidden");
      } else {
    const shopParam = product.shopId ? `?shop=${encodeURIComponent(product.shopId)}` : "";
    source.href = `boutique.html${shopParam}`;
    source.textContent = "Voir la boutique";
    addToCartBtn?.classList.remove("hidden");
    addToCartBtn?.addEventListener("click", () => addToCart(product));
    }
}

function setupCartPage() {
  const container = document.getElementById("cartItems");
  if (!container) return;

  const empty = document.getElementById("emptyCart");
  const totalEl = document.getElementById("cartTotal");
  const templateEl = document.getElementById("orderTemplate");
  const clearBtn = document.getElementById("clearCartBtn");
  const orderAllBtn = document.getElementById("orderAllBtn");

  function render() {
    const items = getCartItems();

    if (!items.length) {
      container.innerHTML = "";
      empty.style.display = "block";
      totalEl.textContent = "Total: 0 FCFA";
      if (orderAllBtn) orderAllBtn.style.display = "none";
      updateCartCountUI();
      return;
    }

    empty.style.display = "none";

    container.innerHTML = items
      .map((item) => {
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
        return `
          <article class="cart-item">
            <img src="${item.image || PLACEHOLDER_IMAGE}" alt="${item.name}">
            <div class="cart-item-body">
              <h4>${item.name}</h4>
              <p class="meta">Prix unitaire: ${formatPrice(item.price)}</p>
              <p class="meta">Sous-total: ${formatPrice(lineTotal)}</p>
              <div class="row-actions">
                <button type="button" class="secondary" data-action="qty-minus" data-id="${item.productId}">-</button>
                <span class="qty">${item.quantity}</span>
                <button type="button" class="secondary" data-action="qty-plus" data-id="${item.productId}">+</button>
                <button type="button" class="warning" data-action="remove-item" data-id="${item.productId}">Retirer</button>
                <a class="link-btn" target="_blank" rel="noopener" data-action="order-whatsapp" data-id="${item.productId}" href="#">Commander</a>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    totalEl.textContent = `Total: ${formatPrice(total)}`;

    container.querySelectorAll("[data-action='qty-plus']").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateCartQuantity(btn.getAttribute("data-id") || "", 1);
        render();
      });
    });

    container.querySelectorAll("[data-action='qty-minus']").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateCartQuantity(btn.getAttribute("data-id") || "", -1);
        render();
      });
    });

    container.querySelectorAll("[data-action='remove-item']").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeFromCart(btn.getAttribute("data-id") || "");
        render();
      });
    });

    container.querySelectorAll("[data-action='order-whatsapp']").forEach((link) => {
      const id = link.getAttribute("data-id") || "";
      const item = items.find((x) => x.productId === id);
      if (!item) return;

      const template = templateEl?.value || "standard";
      const msg = buildOrderMessage(template, item);
      link.href = `https://wa.me/${normalizePhone(item.phone)}?text=${encodeURIComponent(msg)}`;
    });

    if (orderAllBtn && items.length > 1) {
      orderAllBtn.style.display = "inline-flex";
      const template = templateEl?.value || "standard";
      const msg = buildMultipleOrderMessage(template, items);
      
      if (items.length > 0) {
        const firstItem = items[0];
        orderAllBtn.href = `https://wa.me/${normalizePhone(firstItem.phone)}?text=${encodeURIComponent(msg)}`;
      }
    } else if (orderAllBtn) {
      orderAllBtn.style.display = "none";
    }

    updateCartCountUI();
  }

  templateEl?.addEventListener("change", render);
  clearBtn?.addEventListener("click", () => {
    clearCart();
    render();
  });

  render();
}

function setupProfilePage() {
  const avatar = document.getElementById("profileAvatar");
  const photoInput = document.getElementById("profilePhotoFile");
    const nameInput = document.getElementById("profileNameInput");
    const phoneInput = document.getElementById("profilePhoneInput");
  const emailEl = document.getElementById("profileEmail");
  const roleEl = document.getElementById("profileRole");
  const saveBtn = document.getElementById("saveProfileBtn");
  const profileForm = document.getElementById("profileForm");
  const editProfileBtn = document.getElementById("editProfileBtn");
  const cancelProfileBtn = document.getElementById("cancelProfileBtn");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  const deconnexionBtn = document.getElementById("deconnexionBtn");
    
  if (!profileForm) {
    return;
  }

  const logged = currentUser();
  if (!logged) {
    alert("Connectez-vous pour accéder au profil.");
    window.location.href = "login.html";
    return;
  }

  function render(user) {
    avatar.src = user.photo_profil || "https://placehold.co/160x160?text=Profil";
    // Display elements
    document.getElementById("profileNameDisplay").textContent = user.nom || "-";
    document.getElementById("profilePhoneDisplay").textContent = user.numero_whatsapp || "-";
    // Input elements
    nameInput.value = user.nom || "";
    phoneInput.value = user.numero_whatsapp || "";
    emailEl.textContent = user.email || "-";
    roleEl.textContent = user.type_compte === "seller" ? "Vendeur" : "Utilisateur";

  }

  photoInput?.addEventListener("change", async () => {
    try {
      const imgs = await getImagesDataFromInput("profilePhotoFile");
      if (imgs[0]) {
        avatar.src = imgs[0];
      }
    } catch (error) {
      alert(error.message);
      photoInput.value = "";
    }
  });

  editProfileBtn.addEventListener("click", () => {
    profileForm.classList.add("is-editing");
  });

  cancelProfileBtn.addEventListener("click", () => {
    profileForm.classList.remove("is-editing");
    // Re-render to discard changes
    render(currentUser());
  });

  saveBtn.addEventListener("click", async () => {
    const nom = nameInput.value.trim();
    const numero_whatsapp = normalizePhone(phoneInput.value);
  
    if (!nom || !numero_whatsapp) {
      alert("Nom et téléphone sont obligatoires.");
      return;
    }

    // Feedback visuel
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = "Sauvegarde en cours...";
    saveBtn.disabled = true;

    let photoProfil = avatar.src;
    const fileInput = document.getElementById("profilePhotoFile");

    try {
      // 1. Upload de la nouvelle image si sélectionnée
      if (fileInput && fileInput.files.length > 0) {
        try {
          photoProfil = await uploadImageToCloudinary(fileInput.files[0]);
        } catch (error) {
          alert("Erreur lors de l'envoi de l'image : " + error.message);
          saveBtn.textContent = originalBtnText;
          saveBtn.disabled = false;
          return;
        }
      }

      // 2. Préparation des données
      const updateData = {
        nom: nom,
        numero_whatsapp: numero_whatsapp,
        photo_profil: photoProfil
      };

      // 3. Sauvegarde dans Firestore
      await updateUserInFirestore(logged.id, updateData);

      // 4. Mise à jour de la session locale (pour affichage immédiat sans rechargement)
      const updatedUser = { ...logged, ...updateData };
      write(STORAGE_KEYS.loggedUser, updatedUser);
      
      alert("Profil mis à jour avec succès !");
      render(updatedUser);
      updateAuthLink(); // Mettre à jour le header immédiatement
      profileForm.classList.remove("is-editing"); // Back to view mode
      if (fileInput) fileInput.value = "";

    } catch (error) {
      console.error(error);
      alert("Erreur lors de la mise à jour : " + error.message);
    } finally {
      saveBtn.textContent = originalBtnText;
      saveBtn.disabled = false;
    }
  });

  // Gestion de la suppression de compte
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      if (confirm("⚠️ ATTENTION : Cette action est irréversible.\n\nVoulez-vous vraiment supprimer votre compte ?\nCela effacera définitivement votre profil, votre boutique et tous vos produits.")) {
        const userId = logged.id;

        // 4. Déconnexion et redirection
        write(STORAGE_KEYS.loggedUser, null);
        alert("Votre compte a été supprimé avec succès.");
        window.location.href = "index.html";
      }
    });
  }

  // Gestion de la déconnexion depuis le profil
  if (deconnexionBtn) {
    deconnexionBtn.addEventListener("click", async () => {
      if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
        await logoutUser();
        write(STORAGE_KEYS.loggedUser, null);
        window.location.href = "index-no-connexion.html";
      }
    });
  }

  render(logged);

  // --- SECTION FAVORIS ---
  const favoritesContainer = document.createElement("section");
  favoritesContainer.className = "panel";
  favoritesContainer.innerHTML = `
    <h2>Mes Favoris</h2>
    <h3>Produits aimés</h3>
    <div id="likedProductsList" class="cards" style="margin-bottom: 20px;"></div>
    <p id="emptyLikedProducts" class="empty">Aucun produit en favori.</p>
    
    <h3>Boutiques suivies</h3>
    <div id="followedShopsList" class="cards"></div>
    <p id="emptyFollowedShops" class="empty">Aucune boutique suivie.</p>
  `;
  
  // Insérer après la section profil (avant "Mes produits")
  const profileCard = document.querySelector(".profile-card");
  profileCard.parentNode.insertBefore(favoritesContainer, profileCard.nextSibling);

  async function renderFavorites() {
    const currentUserData = currentUser(); // Recharger les données fraîches
    
    // 1. Produits
    const likedIds = currentUserData.likedProducts || [];
    const allProducts = getMarketplaceProducts();
    const likedProducts = allProducts.filter(p => likedIds.includes(p.id));
    
    const productsContainer = document.getElementById("likedProductsList");
    const emptyProducts = document.getElementById("emptyLikedProducts");
    
    productsContainer.innerHTML = likedProducts.map(p => renderProductCard(p)).join("");
    emptyProducts.style.display = likedProducts.length ? "none" : "block";
    bindAddToCartButtons(productsContainer); // Activer les boutons like/cart

    // 2. Boutiques
    const favShopIds = currentUserData.favoriteShops || [];
    const allShops = getShops();
    const favShops = allShops.filter(s => favShopIds.includes(s.id));
    
    const shopsContainer = document.getElementById("followedShopsList");
    const emptyShops = document.getElementById("emptyFollowedShops");

    // Réutilisation simple du snippet boutique ou carte simplifiée
    shopsContainer.innerHTML = favShops.map(s => `
      <div class="card compact-card" style="text-align:center; padding:10px;">
        <a href="boutique.html?shop=${s.id}">
          <img src="${s.logo || "https://placehold.co/100x100"}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; margin:0 auto 10px;">
          <h4>${s.nom}</h4>
        </a>
        <button class="like-btn active" data-id="${s.id}" data-type="shop" style="position:static; margin:0 auto;">♥</button>
      </div>
    `).join("");
    
    emptyShops.style.display = favShops.length ? "none" : "block";

    // Bind boutons like boutiques dans le profil
    shopsContainer.querySelectorAll(".like-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = btn.getAttribute("data-id");
        await toggleLike(id, 'shop');
        renderFavorites(); // Re-render pour enlever l'élément
      });
    });
  }

  renderFavorites();

  // Ajouter la fonctionnalité "Mes produits"
  setupMyProducts();
  
  // Ajouter les événements pour les photos de profil
  setupProfileImageModal();
}

async function setupMyProducts() {
  const container = document.getElementById("myProducts");
  const empty = document.getElementById("emptyMyProducts");
  
  if (!container) return;
  
  const user = currentUser();
  if (!user) return;
  
  function renderMyProducts() {
    const occasion = getOccasionProducts().filter(p => p.vendeur_id === user.id).map(mapOccasionToMarketplace);
    const mapped = [...occasion];
    
    if (mapped.length === 0) {
      container.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    
    if (empty) empty.style.display = "none";
    container.innerHTML = mapped.map(p => renderProductCard(p, { sellerActions: true })).join("");
    
    // Ajouter les événements pour marquer comme vendu
    container.querySelectorAll("button[data-action='toggle-sold']").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        
        // Vérifier d'abord les produits réguliers
        const allRegular = getProducts();
        const targetRegular = allRegular.find(p => p.id === id && p.vendeur_id === user.id);
        
        if (targetRegular) {
          targetRegular.status = targetRegular.status === "sold" ? "available" : "sold";
        } else {
          // Sinon vérifier les produits d'occasion
          const allOccasion = getOccasionProducts();
          const targetOccasion = allOccasion.find(p => p.id === id && p.vendeur_id === user.id);
          if (targetOccasion) {
            // Mettre à jour le statut (utiliser 'status' pour la cohérence, même si 'statut' existe parfois)
            targetOccasion.status = targetOccasion.status === "sold" ? "available" : "sold";
          }
        }
        renderMyProducts();
      });
    });

    // Ajouter les événements pour supprimer
    container.querySelectorAll("button[data-action='delete-product']").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;
        if (!confirm("Voulez-vous vraiment supprimer ce produit (irreversible) ?")) return;
        const id = btn.getAttribute("data-id");
        const origin = btn.getAttribute("data-origin");

        renderMyProducts();
        deleteProductFirestore(id).then(async () => {
            await syncData();
            renderMyProducts();
        });
      });
    });
  }
  
  renderMyProducts();
}

// Fonctions globales pour la gestion des contacts
window.addContact = function() {
  const container = document.getElementById("additionalContacts");
  const newContact = document.createElement("div");
  newContact.className = "contact-item";
  newContact.innerHTML = `
    <input type="email" placeholder="Email additionnel" class="additional-email">
    <input type="tel" placeholder="WhatsApp additionnel" class="additional-whatsapp">
    <button type="button" onclick="removeContact(this)">Supprimer</button>
  `;
  container.appendChild(newContact);
};

window.removeContact = function(button) {
  button.parentElement.remove();
};

// Fonctions pour la modal des photos de profil
window.openProfileImageModal = function(imageSrc) {
  const modal = document.getElementById("profileImageModal");
  const modalImg = document.getElementById("modalProfileImage");
  
  if (modal && modalImg && imageSrc) {
    modalImg.src = imageSrc;
    modal.classList.add("active");
    document.body.style.overflow = "hidden"; // Bloquer le scroll
  }
};

window.closeProfileImageModal = function() {
  const modal = document.getElementById("profileImageModal");
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = ""; // Réactiver le scroll
  }
};

async function setupProfileImageModal() {
  // Ajouter les événements click sur toutes les photos de profil
  const profileAvatars = document.querySelectorAll(".profile-avatar");
  const shopLogoDisplay = document.getElementById("shopLogoDisplay");
  
  profileAvatars.forEach(avatar => {
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      const imageSrc = avatar.src;
      if (imageSrc && !imageSrc.includes("placehold.co")) {
        openProfileImageModal(imageSrc);
      }
    });
  });
  
  if (shopLogoDisplay) {
    shopLogoDisplay.addEventListener("click", (e) => {
      e.stopPropagation();
      const imageSrc = shopLogoDisplay.src;
      if (imageSrc && !imageSrc.includes("placehold.co")) {
        openProfileImageModal(imageSrc);
      }
    });
  }
  
  // Fermer la modal avec la touche Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProfileImageModal();
    }
  });
}

async function setupSellerShop() {
  const user = currentUser();
  if (!user || user.type_compte !== "seller") return;
  
  const saveShopBtn = document.getElementById("saveShopBtn");
  const shopLogoDisplay = document.getElementById("shopLogoDisplay");
  const shopLogoFile = document.getElementById("shopLogoFile");
  const shopForm = document.getElementById("shopForm");
  const editShopBtn = document.getElementById("editShopBtn");
  const cancelShopBtn = document.getElementById("cancelShopBtn");
  const deleteShopBtn = document.getElementById("deleteShopBtn");
  
  if (!shopForm) return;

  // Afficher la section si elle existe (qu'elle soit dans profile ou dashboard)
  const sellerSection = document.getElementById("sellerShopSection");
  if (sellerSection) {
    sellerSection.style.display = "block";
    
    // --- INJECTION DES STATS (Abonnés / Abonnements) DANS LE DASHBOARD ---
    // Nettoyer l'existant si nécessaire
    const existingStats = sellerSection.querySelector(".profile-stats");
    if (existingStats) existingStats.remove();

    const myShop = getShops().find(s => s.vendeur_id === user.id);

    if (myShop) {
      const statsContainer = document.createElement("div");
      statsContainer.className = "profile-stats";
      
      // Calculs pour le dashboard
      const followingCount = (user.favoriteShops || []).length;
      let followersCount = 0;
      if (myShop.followers) {
        followersCount = myShop.followers.length;
      }

      statsContainer.innerHTML = `
        <div class="stat-item">
          <span class="stat-value">${followingCount}</span>
          <span class="stat-label">Abonnements</span>
        </div>
        <div class="stat-item" id="viewFollowersBtn" style="cursor: ${followersCount > 0 ? 'pointer' : 'default'}">
          <span class="stat-value">${followersCount}</span>
          <span class="stat-label">Abonnés</span>
        </div>
      `;

      // Insérer après l'avatar de la boutique
      const avatarWrap = sellerSection.querySelector(".profile-avatar-wrap");
      if (avatarWrap) {
        avatarWrap.parentNode.insertBefore(statsContainer, avatarWrap.nextSibling);
      }

      // --- GESTION CLICK ABONNÉS ---
      const viewFollowersBtn = statsContainer.querySelector("#viewFollowersBtn");
      if (viewFollowersBtn && followersCount > 0) {
        viewFollowersBtn.addEventListener("click", async () => {
          const modal = document.getElementById("followersModal");
          const listContainer = document.getElementById("followersList");
          
          if (modal && listContainer) {
            modal.classList.add("active");
            listContainer.innerHTML = '<p class="empty" style="text-align:center;">Chargement...</p>';
            
            try {
              // Récupérer les infos des abonnés
              const users = await getUsersByIds(myShop.followers);
              
              if (users.length === 0) {
                listContainer.innerHTML = '<p class="empty" style="text-align:center;">Aucun abonné trouvé.</p>';
              } else {
                listContainer.innerHTML = users.map(u => `
                  <div class="follower-item">
                    <img src="${u.photo_profil || `https://ui-avatars.com/api/?name=${u.nom || "User"}&background=random`}" class="follower-avatar">
                    <div>
                      <div style="font-weight:700; font-size:0.95rem;">${u.nom || "Utilisateur"}</div>
                      <div style="font-size:0.8rem; color:#666;">${u.email || ""}</div>
                    </div>
                  </div>
                `).join("");
              }
            } catch (e) {
              listContainer.innerHTML = '<p class="empty" style="color:red; text-align:center;">Erreur chargement.</p>';
            }
          }
        });
      }
    }

    // Fermeture de la modale
    const closeModalBtn = document.querySelector(".close-modal");
    if (closeModalBtn) {
      closeModalBtn.onclick = () => document.getElementById("followersModal").classList.remove("active");
    }
    window.onclick = (e) => {
      const m = document.getElementById("followersModal");
      if (e.target === m) m.classList.remove("active");
    };
  }

  // Récupérer la boutique existante
  const shops = getShops();
  const shop = shops.find(s => s.vendeur_id === user.id);
  
  function renderShop(currentShop) {
    const noShopActions = document.getElementById("noShopActions");
    const addProductSection = document.getElementById("addProductSection");
    const manageProductsSection = document.getElementById("manageProductsSection");

    // Remplir le formulaire si la boutique existe
    if (currentShop) {
      // Afficher l'interface complète
      if (shopForm) shopForm.style.display = "grid";
      if (noShopActions) noShopActions.style.display = "none";
      if (addProductSection) addProductSection.style.display = "block";
      if (manageProductsSection) manageProductsSection.style.display = "block";

      if (editShopBtn) editShopBtn.style.display = "inline-block";
      // View state
      document.getElementById("shopNameDisplay").textContent = currentShop.nom || "-";
      document.getElementById("shopDescriptionDisplay").textContent = currentShop.description || "-";
      if (document.getElementById("shopAddressDisplay")) document.getElementById("shopAddressDisplay").textContent = currentShop.adresse || "-";
      const linkDisplay = document.getElementById("shopExternalLinkDisplay");
      if (currentShop.lien_site) {
        linkDisplay.textContent = currentShop.lien_site;
        linkDisplay.href = currentShop.lien_site;
        linkDisplay.style.display = 'inline';
      } else {
        linkDisplay.textContent = "Non défini";
        linkDisplay.href = "#";
      }
      
      if (document.getElementById("shopOpenDaysDisplay")) document.getElementById("shopOpenDaysDisplay").textContent = currentShop.horaires || "-";
      document.getElementById("shopHoursDisplay").textContent = (currentShop.openTime && currentShop.closeTime) ? `${currentShop.openTime} - ${currentShop.closeTime}` : "-";

      // Edit state
      document.getElementById("shopNameInput").value = currentShop.nom || "";
      document.getElementById("shopDescriptionInput").value = currentShop.description || "";
      document.getElementById("shopLogoInput").value = currentShop.logo || "";
      if (document.getElementById("shopAddressInput")) document.getElementById("shopAddressInput").value = currentShop.adresse || "";
      if (document.getElementById("shopExternalLinkInput")) document.getElementById("shopExternalLinkInput").value = currentShop.lien_site || "";
      const hoursInput = document.getElementById("shopHoursInput");
      if (hoursInput) hoursInput.value = currentShop.horaires || "";
      const openInput = document.getElementById("shopOpenTimeInput");
      const closeInput = document.getElementById("shopCloseTimeInput");
      if (openInput) openInput.value = currentShop.openTime || "";
      if (closeInput) closeInput.value = currentShop.closeTime || "";
      if (shopLogoDisplay && currentShop.logo) {
        shopLogoDisplay.src = currentShop.logo;
      }

      // Afficher le bouton supprimer si la boutique existe
      if (deleteShopBtn) deleteShopBtn.style.display = "block";
    } else {
      // MASQUER TOUT sauf l'avatar et le bouton créer
      if (shopForm) shopForm.style.display = "none";
      if (addProductSection) addProductSection.style.display = "none";
      if (manageProductsSection) manageProductsSection.style.display = "none";
      
      // Afficher le bloc d'action "Créer boutique"
      if (noShopActions) noShopActions.style.display = "block";
      
      // Réinitialiser l'avatar à un placeholder neutre si nécessaire
      if (shopLogoDisplay) shopLogoDisplay.src = "https://placehold.co/160x160/e0e0e0/ffffff?text=Empty";
    }
  }

  // Empêcher le clic sur la modification du logo si la boutique n'existe pas
  const shopLogoLabel = document.querySelector("label[for='shopLogoFile']");
  if (shopLogoLabel) {
    shopLogoLabel.addEventListener("click", (e) => {
      const myShop = getShops().find(s => s.vendeur_id === user.id);
      if (!myShop) {
        e.preventDefault();
        alert("Veuillez d'abord créer une boutique avant de modifier la photo de profil.");
      }
    });
  }

  // Prévisualisation du logo de la boutique lors de la sélection
  shopLogoFile?.addEventListener("change", async () => {
    try {
      const imgs = await getImagesDataFromInput("shopLogoFile");
      if (imgs[0] && shopLogoDisplay) {
        shopLogoDisplay.src = imgs[0];
      }
    } catch (error) {
      alert(error.message);
      shopLogoFile.value = "";
    }
  });
  
  // Mettre à jour la photo de profil avec le logo de la boutique
  if (shopLogoDisplay && shop && shop.logo) {
    const profileAvatar = document.getElementById("profileAvatar");
    if (profileAvatar) {
      profileAvatar.src = shop.logo;
    }
  }

  editShopBtn.addEventListener("click", () => {
    shopForm.classList.add("is-editing");
  });

  cancelShopBtn.addEventListener("click", () => {
    shopForm.classList.remove("is-editing");
    // Re-render to discard changes
    renderShop(shop);
  });
  
  // Gérer la sauvegarde de la boutique
  if (saveShopBtn) {
    saveShopBtn.addEventListener("click", async () => {
      const nom = document.getElementById("shopNameInput").value.trim();
      const description = document.getElementById("shopDescriptionInput").value.trim();
      const adresse = document.getElementById("shopAddressInput")?.value.trim() || null;
      const lien_site = document.getElementById("shopExternalLinkInput")?.value.trim() || null;
      const horaires = document.getElementById("shopHoursInput")?.value.trim() || null;
      const openTime = document.getElementById("shopOpenTimeInput")?.value || null;
      const closeTime = document.getElementById("shopCloseTimeInput")?.value || null;
      
      if (!nom) {
        alert("Le nom de la boutique est obligatoire.");
        return;
      }
      
      // Récupérer les contacts supplémentaires
      const additionalEmails = [];
      const additionalWhatsapps = [];
      
      document.querySelectorAll(".additional-email").forEach(input => {
        if (input.value.trim()) {
          additionalEmails.push(input.value.trim());
        }
      });
      
      document.querySelectorAll(".additional-whatsapp").forEach(input => {
        if (input.value.trim()) {
          additionalWhatsapps.push(normalizePhone(input.value.trim()));
        }
      });

      // Feedback visuel
      const originalBtnText = saveShopBtn.textContent;
      saveShopBtn.textContent = "Sauvegarde en cours...";
      saveShopBtn.disabled = true;

      try {
        let logoUrl = document.getElementById("shopLogoInput").value.trim();
        
        // Upload de la nouvelle image si sélectionnée
        if (shopLogoFile && shopLogoFile.files.length > 0) {
          logoUrl = await uploadImageToCloudinary(shopLogoFile.files[0]);
        } else if (!logoUrl && shop && shop.logo) {
          // Si pas de nouveau fichier et pas d'URL saisie manuellement, on garde l'ancien logo
          logoUrl = shop.logo;
        }
      
      const shopData = {
          nom,
          description,
          adresse,
          logo: logoUrl,
          lien_site,
          horaires,
          openTime,
          closeTime,
          vendeur_id: user.id,
          contact_whatsapp: user.numero_whatsapp,
          additional_emails: additionalEmails,
          additional_whatsapps: additionalWhatsapps
      };

          await saveShopToFirestore(shopData, shop ? shop.id : null);
          await syncData();
          if (shopLogoDisplay && logoUrl) {
            shopLogoDisplay.src = logoUrl;
            const profileAvatar = document.getElementById("profileAvatar");
            if (profileAvatar) profileAvatar.src = logoUrl;
          }  
          
          updateAuthLink();
          alert("Boutique enregistrée avec succès !");
          shopForm.classList.remove("is-editing"); // Back to view mode
          // Re-render with new data
          const newShopData = getShops().find(s => s.vendeur_id === user.id);
          renderShop(newShopData);
          if (shopLogoFile) shopLogoFile.value = ""; // Reset de l'input
      } catch(e) {
          console.error(e);
          alert("Erreur: " + e.message);
      } finally {
          saveShopBtn.textContent = originalBtnText;
          saveShopBtn.disabled = false;
      }
    });
  }

  renderShop(shop);

  // Gestion de la suppression de boutique
  if (deleteShopBtn) {
    deleteShopBtn.addEventListener("click", async () => {
      if (confirm("⚠️ ATTENTION : Cette action est irréversible.\n\nVoulez-vous vraiment supprimer votre boutique ?\nCela la supprimera de la base de données et dissociera tous vos produits.")) {
        
        const shopToDelete = getShops().find(s => s.vendeur_id === user.id);
        if (!shopToDelete) {
          alert("Aucune boutique à supprimer.");
          return;
        }

        const originalText = deleteShopBtn.textContent;
        deleteShopBtn.textContent = "Suppression en cours...";
        deleteShopBtn.disabled = true;

        try {
          // Appel de la fonction qui supprime de Firestore
          await deleteShopAndDissociateProducts(shopToDelete.id);
          await syncData(); // Mettre à jour le cache local

          alert("Boutique supprimée avec succès.");
          window.location.reload();
        } catch (error) {
          console.error("Erreur lors de la suppression de la boutique:", error);
          alert("Une erreur est survenue lors de la suppression.");
          deleteShopBtn.textContent = originalText;
          deleteShopBtn.disabled = false;
        }
      }
    });
  }
}

async function setupVideosPage() {
  const page = document.body.dataset.page;
  if (page !== 'videos' && page !== 'videos-no-connexion') return;

  const container = document.getElementById("videoFeed");
  const empty = document.getElementById("emptyVideos");
  const user = currentUser();
  
  try {
    const videos = await getShortVideos();
    
    if (videos.length === 0) {
      empty.classList.remove("hidden");
      return;
    }

    container.innerHTML = videos.map(v => {
      const likes = v.likes || [];
      const isLiked = user && likes.includes(user.id);
      const likeCount = likes.length;
      
      // Préparation du lien WhatsApp
      const phone = v.userPhone ? normalizePhone(v.userPhone) : "";
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent("Bonjour, je suis intéressé par votre vidéo sur Kome-Gab : " + (v.caption || ""))}` : "#";
      const waDisplay = phone ? "flex" : "none";

      return `
        <div class="video-card">
          <video class="video-player" src="${v.videoUrl}" controls loop playsinline></video>
          
          <a href="${waLink}" class="whatsapp-btn" target="_blank" style="display:${waDisplay}" title="Contacter sur WhatsApp">
            <i class="fa-brands fa-whatsapp"></i>
          </a>

          <button class="like-btn ${isLiked ? 'active' : ''}" data-id="${v.id}" data-type="video">♥</button>
          <span class="video-like-count" data-id="${v.id}">${likeCount}</span>

          <div class="video-overlay">
            <div class="video-user">@${v.userName}</div>
            <p>${v.caption || ""}</p>
          </div>
        </div>
      `;
    }).join("");

    // Bind des boutons like vidéo
    container.querySelectorAll(".like-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        toggleLike(id, 'video');
      });
    });

    // --- GESTION AUTOPLAY AU DÉFILEMENT ---
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) {
          video.play().catch(e => console.log("Autoplay bloqué (interaction requise):", e));
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.6 }); // Se déclenche quand 60% de la vidéo est visible

    container.querySelectorAll("video").forEach(video => observer.observe(video));

  } catch (e) {
    console.error("Erreur chargement vidéos", e);
  }
}

async function setupCreateShopPage() {
  const form = document.getElementById("createShopForm");
  if (!form) return;

  const user = requireSeller();
  if (!user) return;

  const existingShop = getShops().find(s => s.vendeur_id === user.id);
  
  if (existingShop) {
    alert("Vous avez déjà une boutique ! Redirection vers le tableau de bord.");
    window.location.href = "dashboard.html";
    return;
  }

  setupFilesPreview("shopLogo", "shopLogoPreview");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById("createShopBtn");
    const originalText = btn.textContent;
    btn.textContent = "Création en cours...";
    btn.disabled = true;

    try {
      const name = document.getElementById("shopName").value.trim();
      const description = document.getElementById("shopDescription").value.trim();
      const address = document.getElementById("shopAddress").value.trim();
      const hours = document.getElementById("shopOpenDayInput").value.trim();
      const openTime = document.getElementById("shopOpenTimeInput").value;
      const closeTime = document.getElementById("shopCloseTimeInput").value;
      const logoInput = document.getElementById("shopLogo");

      let logoUrl = "";
      if (logoInput.files.length > 0) {
        logoUrl = await uploadImageToCloudinary(logoInput.files[0]);
      }

      const shopData = {
        nom: name,
        description: description,
        adresse: address,
        horaires: hours,
        openTime,
        closeTime,
        logo: logoUrl,
        vendeur_id: user.id,
        contact_whatsapp: user.numero_whatsapp,
        date_creation: new Date().toISOString(),
        followers: []
      };

      await saveShopToFirestore(shopData);
      await syncData(); // Force la mise à jour du cache
      
      alert("Félicitations ! Votre boutique a été créée avec succès.");
      window.location.href = "dashboard.html";

    } catch (error) {
      console.error(error);
      alert("Erreur: " + error.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

/* ===================================
   LOGIQUE PAGE DÉTAIL BOUTIQUE (shop-details.html)
   =================================== */
async function setupShopDetailsPage() {
  const page = document.body.dataset.page;
  if (page !== 'shop-details') return;

  const params = new URLSearchParams(window.location.search);
  const shopId = params.get("id");

  if (!shopId) {
    alert("Boutique introuvable");
    window.location.href = "boutique.html";
    return;
  }

  const shops = getShops();
  const shop = shops.find(s => s.id === shopId);

  if (!shop) {
    document.body.innerHTML = "<h1 style='text-align:center; margin-top:50px;'>Boutique introuvable ou supprimée.</h1><p style='text-align:center;'><a href='index.html'>Retour à l'accueil</a></p>";
    return;
  }

  // 1. Remplissage des infos de la boutique
  document.title = `${shop.nom} - Kome-Gab`;
  
  // Logo
  const logoImg = document.getElementById("shopLogoImg");
  if (logoImg && shop.logo) {
    logoImg.src = optimizeCloudinaryUrl(shop.logo, 100);
    logoImg.style.cursor = "pointer";
    logoImg.onclick = () => window.openProfileImageModal(optimizeCloudinaryUrl(shop.logo, 800));
  }

  // Hero Section
  document.getElementById("shopNameHero").textContent = shop.nom;
  document.getElementById("shopDescHero").textContent = shop.description || "Bienvenue dans notre boutique.";
  
  // Footer Infos
  document.getElementById("shopNameFooter").textContent = shop.nom;
  document.getElementById("shopAddressFooter").textContent = shop.adresse || "";
  document.getElementById("shopHoursFooter").textContent = shop.horaires || "";

  // Bouton WhatsApp Flottant
  const waBtn = document.getElementById("shopWhatsappBtn");
  if (waBtn) {
    if (shop.contact_whatsapp) {
      waBtn.href = `https://wa.me/${normalizePhone(shop.contact_whatsapp)}`;
    } else {
      waBtn.style.display = 'none';
    }
  }

  // Gestion bouton "Suivre" (Follow)
  const followBtn = document.getElementById("followShopBtn");
  const user = currentUser();
  if (user && followBtn) {
    const isFollowing = (user.favoriteShops || []).includes(shop.id);
    followBtn.textContent = isFollowing ? "Ne plus suivre" : "Suivre la boutique";
    followBtn.onclick = async () => {
      await toggleLike(shop.id, 'shop');
      const updatedUser = currentUser(); // Recharger user local mis à jour par toggleLike
      const newStatus = (updatedUser.favoriteShops || []).includes(shop.id);
      followBtn.textContent = newStatus ? "Ne plus suivre" : "Suivre la boutique";
    };
  } else if (followBtn) {
    followBtn.onclick = () => window.location.href = "login.html";
  }

  // Gestion bouton "Partager"
  const shareBtn = document.getElementById("shareShopBtn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      const currentUrl = window.location.href;
      if (navigator.share) {
        navigator.share({
          title: shop.nom,
          text: `Découvrez la boutique ${shop.nom} sur Kome-Gab !`,
          url: currentUrl
        }).catch(console.error);
      } else {
        navigator.clipboard.writeText(currentUrl).then(() => {
          alert("Lien de la boutique copié !");
        });
      }
    };
  }

  // 2. Affichage des produits
  const productsGrid = document.getElementById("productsGrid");
  const allProducts = getProducts().map(mapRegularProduct);
  const shopProducts = allProducts.filter(p => p.shopId === shop.id || p.boutique_id === shop.id);

  function renderShopProducts(list) {
    if (list.length === 0) {
      productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 40px;">Aucun produit disponible pour le moment.</p>`;
      return;
    }

    productsGrid.innerHTML = list.map(p => {
      const imgUrl = optimizeCloudinaryUrl(p.image || PLACEHOLDER_IMAGE, 400);
      
      const whatsappOrderMessage = buildOrderMessage("standard", {
        name: p.name,
        price: p.price,
        quantity: 1,
        image: p.image,
        shopId: p.shopId,
        phone: p.phone
      });
      const whatsappHref = `https://wa.me/${normalizePhone(p.phone)}?text=${encodeURIComponent(whatsappOrderMessage)}`;

      return `
        <div class="shop-product-card">
          <a href="product.html?id=${p.id}&origin=regular" style="text-decoration:none; color:inherit;">
            <img src="${imgUrl}" class="shop-product-img" alt="${p.name}">
            <h3 class="shop-product-title">${p.name}</h3>
            <p class="shop-product-price">${formatPrice(p.price)}</p>
          </a>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
             <a href="${whatsappHref}" target="_blank" class="shop-btn-small" style="background:#25D366; text-align:center; flex:1; display: flex; align-items: center; justify-content: center; gap: 5px;"><i class="fab fa-whatsapp"></i> Commander</a>
             <button class="shop-btn-small" style="flex:1; padding: 8px 5px; display: flex; align-items: center; justify-content: center; gap: 5px;" onclick="event.preventDefault(); window.addToCartFromId('${p.id}')"><i class="fas fa-shopping-cart"></i> Panier</button>
          </div>
        </div>
      `;
    }).join("");
  }
  
  // Exposer une fonction helper pour le onclick inline
  window.addToCartFromId = (id) => {
      const p = shopProducts.find(x => x.id === id);
      if(p) addToCart(p);
  };

  renderShopProducts(shopProducts);

  // 3. Recherche interne
  const searchInput = document.getElementById("shopSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = shopProducts.filter(p => p.name.toLowerCase().includes(term));
      renderShopProducts(filtered);
    });
  }
}

/**
 * Fonction utilitaire pour lancer le setup de la page courante
 * Permet de rafraichir l'interface après la synchro réseau
 */
function runPageSetup(pageName) {
    switch (pageName) {
      case 'home': case 'home-no-connexion': setupHome(); break;
      case 'dashboard': setupDashboard(); setupSellerShop(); break;
      case 'boutique': case 'boutique-no-connexion': setupBoutiquePage(); break;
      case 'occasion': case 'occasion-no-connexion': setupOccasionPage(); break;
      case 'product': setupProductDetailPage(); break;
      case 'shop-details': setupShopDetailsPage(); break;
      case 'profile': setupProfilePage(); break; // Inclut renderFavorites et MyProducts
      case 'create-shop': setupCreateShopPage(); break;
      case 'publication': setupPublication(); break;
      case 'videos': case 'videos-no-connexion': setupVideosPage(); break;
    }
}

/* ===================================
   INITIALISATION PRINCIPALE
   =================================== */
async function bootstrap() {
  const page = document.body.dataset.page;
  const user = currentUser();

  if (user) { // L'utilisateur est connecté, il ne devrait pas être sur les pages visiteur
    switch (page) {
      case 'videos': 
        // Autorisé
        break;
      case 'create-shop':
        // Autorisé pour les vendeurs connectés (vérifié dans setupCreateShopPage)
        break;
      case 'home-no-connexion':
        window.location.href = 'home.html';
        return;
      case 'occasion-no-connexion':
        window.location.href = 'occasion.html';
        return;
      case 'boutique-no-connexion':
        window.location.href = 'boutique.html';
        return;
      case 'videos-no-connexion':
        window.location.href = 'videos.html';
        return;
      case 'login':
      case 'register':
        // Un utilisateur connecté sur la page de connexion/inscription doit être redirigé
        window.location.href = 'home.html';
        return;
    }
  } else {
    // L'utilisateur n'est PAS connecté : protection des pages membres
    switch (page) {
      case 'home':        // home.html
        window.location.href = 'index-no-connexion.html';
        return;
      case 'occasion':    // occasion.html
      case 'boutique':    // boutique.html
      case 'dashboard':   // dashboard.html
      case 'videos':      // videos.html
      case 'publication': // publication.html
      case 'profile':     // profile.html
      case 'product':     // product.html
      case 'create-shop': // create-shop.html
        window.location.href = 'login.html';
        return;
    }
  }

  ensureMenu();
  highlightActiveMenu(); // Active l'icône de la page courante
  updateAuthLink();
  setupRegister();
  setupLogin();
  setupPasswordToggle();
  setupPasswordValidation();
  setupStories(); // Initialisation des stories
  setupCartPage();
  setupSidebarCart(); // Ajout du panier latéral
  updateCartCountUI();

  // 1. Rendu immédiat avec le cache (Rapide ⚡)
  runPageSetup(page);

  // 2. Synchronisation réseau en arrière-plan (Invisible ☁️)
  // Une fois terminé, on relance le setup pour afficher les nouveautés
  syncData().then(() => {
      // Petit log pour debug
      // console.log("Mise à jour de l'interface avec les données fraîches");
      runPageSetup(page);
  }).catch(err => console.error("Erreur sync background:", err));
}

document.addEventListener("DOMContentLoaded", bootstrap);
