// Script.js

// Import des fonctions Firebase et Cloudinary
import { 
  logoutUser, registerUser, loginUser, saveUserToFirestore, getUserFromFirestore, getUsersByIds,
  uploadMediaToCloudinary, uploadImageToCloudinary, saveOccasionProduct, getAllProducts, saveProductToFirestore, deleteProductFirestore, updateProductFirestore, getAllShops, saveShopToFirestore, deleteShopAndDissociateProducts, toggleShopFollow, saveReview, getReviews, updateUserInFirestore, saveStory, getActiveStories, deleteStory, viewStory,
  saveShortVideo, getShortVideos, toggleVideoLike, addVideoComment, toggleVideoCommentLike, deleteVideoComment, deleteShortVideo,
  recordProductView, getSellerDailyProductViews, recordShopView, syncSellerWhatsappNumber // <-- AJOUTÉES
} from "../firebase-app.js";

const STORAGE_KEYS = {
  users: "mg_users",
  products: "mg_products",
  shops: "mg_shops",
  occasionProducts: "mg_occasion_products",
  loggedUser: "mg_logged_user",
  cart: "mg_cart"
};

// CONFIGURATION EMAILJS
const EMAIL_SERVICE_ID = "service_02gpcxp";   // À REMPLACER
const EMAIL_TEMPLATE_ID = "template_6qkt2ys"; // À REMPLACER

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

// --- FONCTION EMAIL LOG ---
function sendEmailLog(type, id, publicId) {
  if (!window.emailjs) {
    console.warn("EmailJS non chargé.");
    return;
  }

  const templateParams = {
    type: type,         // "Produit", "Boutique", "Compte"
    id: id,             // ID de l'élément concerné
    publicId: publicId, // Email ou ID de l'utilisateur qui fait l'action
    date: new Date().toLocaleString("fr-FR")
  };

  emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, templateParams)
    .then(() => console.log(`Email log envoyé : ${type} - ${id}`))
    .catch((err) => console.error("Erreur envoi email log:", err));
}

// --- SYSTEME DE CACHE SYNCRO FIREBASE ---
// 1. Initialisation immédiate avec les données locales (LocalStorage)
let cachedProducts = read(STORAGE_KEYS.products, []);
let cachedShops = read(STORAGE_KEYS.shops, []);
let profilePageListenersController = null;
let publicationPageListenersController = null;
let dashboardPageListenersController = null;

async function syncData() {
  // 2. Récupération réseau et mise à jour du cache local
  const products = await getAllProducts();
  const shops = await getAllShops();
  
  // Mise à jour mémoire et persistante uniquement si la récupération a réussi (non null)
  if (products !== null) {
    cachedProducts = products;
    write(STORAGE_KEYS.products, products);
  } else {
    console.warn("Échec récupération produits, utilisation du cache existant.");
  }
  
  if (shops !== null) {
    cachedShops = shops;
    write(STORAGE_KEYS.shops, shops);
  }
  
  console.log("Synchronisation terminée.");
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

  const path = String(window.location.pathname || "").toLowerCase();
  const currentFile = (path.split("/").pop() || "index.html")
    .split("?")[0]
    .split("#")[0];
  const links = menu.querySelectorAll("a");

  links.forEach(link => {
    const href = String(link.getAttribute("href") || "").toLowerCase();
    if (!href) return;
    const hrefFile = href.split("?")[0].split("#")[0];

    let isActive = false;

    // Correspondance exacte du nom de fichier
    if (currentFile === hrefFile) isActive = true;

    // Fallback Android / WebView (path complet qui se termine par le fichier)
    if (!isActive && path.endsWith(`/${hrefFile}`)) isActive = true;

    // Cas particuliers pour l'accueil (home.html contient souvent un lien vers index.html)
    if ((currentFile === "home.html" || currentFile === "") && hrefFile === "index.html") isActive = true;

    if (isActive) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

function updateAuthLink() {
  const authLink = document.getElementById("authLink");
  const profileAvatarLink = document.getElementById("profileAvatarLink");
  const profileTextLink = document.getElementById("profileTextLink"); // Peut être null
  const headerProfileAvatar = document.getElementById("headerProfileAvatar");
  const quickProfileLink = document.getElementById("quickProfileLink");
  const quickProfileAvatar = document.getElementById("quickProfileAvatar");
  const quickProfileName = document.getElementById("quickProfileName");
  const quickProfileHint = document.getElementById("quickProfileHint");
  
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
  
  if (logged) {
    let profileImage = logged.photo_profil;
    const resolvedAvatar = (profileImage && !profileImage.includes("placehold.co"))
      ? profileImage
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(logged.nom || "User")}&background=3b82f6&color=fff&size=64`;

    if (profileAvatarLink) {
      profileAvatarLink.href = "profile.html";
      profileAvatarLink.style.display = "inline-flex";
    }
    if (headerProfileAvatar) {
      headerProfileAvatar.src = resolvedAvatar;
      headerProfileAvatar.onclick = null;
    }
    if (profileTextLink) {
      profileTextLink.textContent = logged.nom ? String(logged.nom) : "Mon profil";
      profileTextLink.href = "profile.html";
      profileTextLink.style.display = "inline-flex";
    }
    if (quickProfileLink) quickProfileLink.href = "profile.html";
    if (quickProfileAvatar) quickProfileAvatar.src = resolvedAvatar;
    if (quickProfileName) quickProfileName.textContent = logged.nom ? String(logged.nom) : "Mon profil";
    if (quickProfileHint) quickProfileHint.textContent = "Voir mon profil";
  } else {
    if (profileAvatarLink) {
      profileAvatarLink.href = "login.html";
      profileAvatarLink.style.display = "inline-flex";
    }
    if (headerProfileAvatar) {
      headerProfileAvatar.src = "https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff&size=64";
      headerProfileAvatar.onclick = null;
    }
    if (profileTextLink) {
      profileTextLink.textContent = "Se connecter";
      profileTextLink.href = "login.html";
      profileTextLink.style.display = "inline-flex";
    }
    if (quickProfileLink) quickProfileLink.href = "login.html";
    if (quickProfileAvatar) quickProfileAvatar.src = "https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff&size=96";
    if (quickProfileName) quickProfileName.textContent = "Mon profil";
    if (quickProfileHint) quickProfileHint.textContent = "Touchez pour vous connecter";
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
      // UI optimiste déterministe (évite les inversions si double déclenchement tactile)
      const btns = Array.from(document.querySelectorAll(`.like-btn[data-id="${id}"][data-type="video"]`));
      const countEls = Array.from(document.querySelectorAll(`.video-like-count[data-id="${id}"]`));
      const wasActive = btns.some((b) => b.classList.contains("active"));
      const isNowActive = !wasActive;

      btns.forEach((b) => b.classList.toggle("active", isNowActive));
      countEls.forEach((countEl) => {
        const count = parseInt(countEl.textContent || "0", 10);
        countEl.textContent = String(isNowActive ? count + 1 : Math.max(0, count - 1));
      });

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
    
    // Mettre à jour l'UI immédiatement (état explicite, stable sur mobile)
    const isActive = list.includes(id);
    document.querySelectorAll(`.like-btn[data-id="${id}"][data-type="${type}"]`).forEach(btn => {
      btn.classList.toggle("active", isActive);
    });
    
  } catch (error) {
    console.error("Erreur sauvegarde like:", error);
    alert("Erreur lors de la mise à jour des favoris.");
  }
}

async function toggleSavedVideo(videoId) {
  const user = currentUser();
  if (!user) {
    alert("Connectez-vous pour enregistrer une vidéo.");
    return false;
  }
  if (!videoId) return false;

  const current = Array.isArray(user.savedVideoIds) ? [...user.savedVideoIds] : [];
  const exists = current.includes(videoId);
  const next = exists ? current.filter((id) => id !== videoId) : [...current, videoId];

  await updateUserInFirestore(user.id, { savedVideoIds: next });
  user.savedVideoIds = next;
  write(STORAGE_KEYS.loggedUser, user);
  return !exists;
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
  const defaultAvatar = user?.photo_profil || "https://ui-avatars.com/api/?name=Me&background=eee&color=333";
  let myStoryHtml = '';
  // Si l'utilisateur a des stories, préparer la case "Ma Story"
  if (myStories.length > 0) {
    const latestStory = myStories[0];
    
    // Utiliser la dernière story comme image de fond de la case
    let storyThumbnail = defaultAvatar;
    
    if (latestStory.mediaType === 'image') {
      storyThumbnail = latestStory.mediaUrl;
    } else if (latestStory.mediaType === 'video') {
      // Astuce pour Cloudinary : changer l'extension vidéo par .jpg pour avoir la miniature
      storyThumbnail = latestStory.mediaUrl.replace(/\.[^/.]+$/, ".jpg");
    }

    storyThumbnail = optimizeCloudinaryUrl(storyThumbnail, 320);
    const myAvatar = optimizeCloudinaryUrl(defaultAvatar, 96);

    myStoryHtml = `
      <div class="story-item" id="myStoryBtn">
        <img src="${storyThumbnail}" class="story-bg" alt="Ma Story">
        <div class="story-gradient"></div>
        <div class="story-ring">
          <img src="${myAvatar}" class="story-avatar" alt="Moi">
        </div>
        <span class="story-name">Ma Story</span>
      </div>
    `;
  }

  // Toujours afficher le bouton "Créer story"
  const createBg = optimizeCloudinaryUrl(defaultAvatar, 320);
  const createAvatar = optimizeCloudinaryUrl(defaultAvatar, 96);
  const createStoryHtml = `
    <div class="story-item create" id="addStoryBtn">
      <img src="${createBg}" class="story-bg" alt="Créer story">
      <div class="story-gradient"></div>
      <div class="story-ring">
        <img src="${createAvatar}" class="story-avatar" alt="Moi">
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

    // Par défaut avatar; on remplace le fond par la dernière story
    let img = group.userAvatar || "https://placehold.co/100x100";
    
    if (latest) {
      if (latest.mediaType === 'image') {
        img = latest.mediaUrl;
      } else if (latest.mediaType === 'video') {
        // Astuce Cloudinary : remplacer l'extension vidéo par .jpg pour la miniature
        img = latest.mediaUrl.replace(/\.[^/.]+$/, ".jpg");
      }
    }
    
    // Fond case + avatar rond
    const bgImg = optimizeCloudinaryUrl(img, 320);
    const avatarImg = optimizeCloudinaryUrl(group.userAvatar || img, 96);

    otherStoriesHtml += `
      <div class="story-item view-story" data-userid="${userId}">
        <img src="${bgImg}" class="story-bg" alt="${group.userName}">
        <div class="story-gradient"></div>
        <div class="story-ring">
          <img src="${avatarImg}" class="story-avatar" alt="${group.userName}">
        </div>
        <span class="story-name">${group.userName}</span>
      </div>
    `;
  });
  
  // Assembler le tout: Créer, Ma Story (si elle existe), puis les autres
  container.innerHTML = `${createStoryHtml}${myStoryHtml}${otherStoriesHtml}`;

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
  const galleryUrl = getProductDetailUrl(normalized);

  // État du like
  const user = currentUser();
  const isLiked = user && user.likedProducts && user.likedProducts.includes(normalized.id);
  const likeBtn = `<button class="like-btn ${isLiked ? 'active' : ''}" data-id="${normalized.id}" data-type="product" title="${isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}">♥</button>`;

  // Calcul du badge "Nouveau" (moins de 3 jours)
  let isNew = false;
  const dateVal = normalized.createdAt || normalized.date_publication || normalized.date_creation;
  if (dateVal) {
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
        ${isNew ? `<span class="tag" style="background: #e6f4ea; color: #1e8e3e; margin-left: 4px;">Nouveau</span>` : ""}
        <h4><a class="product-title-link" href="${galleryUrl}">${normalized.name}</a></h4>
        <p class="meta">${formatPrice(normalized.price)} • ${normalized.category || "Autre"}</p>
        <p class="meta clamp-two">${normalized.description || "Sans description"}</p>
        <div class="row-actions">
          <a class="link-btn" href="${whatsappHref}" target="_blank" rel="noopener">Commander</a>
          ${cartAction}
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

    const products = getMarketplaceProducts().filter((p) => {
      const byText = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
      let byCategory = !category || p.category === category;
      // Cas spécial pour la catégorie "Occasion" sur la page d'accueil
      if (category === "Occasion") {
        byCategory = p.isOccasion;
      }
      return byText && byCategory;
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

  if (dashboardPageListenersController) {
    dashboardPageListenersController.abort();
  }
  dashboardPageListenersController = new AbortController();
  const listenerOptions = { signal: dashboardPageListenersController.signal };

  const addProductBtn = document.getElementById("addProductBtn");
  const empty = document.getElementById("emptySellerProducts");

  // --- GESTION DU MODE SÉLECTION ---
  const bulkBar = document.getElementById("bulkActionsBar");
  const bulkBtn = document.getElementById("bulkActionBtn");
  const selectedCountEl = document.getElementById("selectedCount");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const cancelBulkBtn = document.getElementById("cancelBulkBtn");
  let isSelectionMode = false;

  // --- GESTION DES ONGLETS DU DASHBOARD ---
  const dashboardTabs = document.querySelectorAll(".profile-tab");
  const dashboardPanes = document.querySelectorAll(".dashboard-tab-pane");

  dashboardTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      
      // Mise à jour visuelle des onglets
      dashboardTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // Affichage du bon contenu
      dashboardPanes.forEach(p => p.classList.add("hidden"));
      const activePane = document.getElementById(`tab-${target}`);
      if (activePane) activePane.classList.remove("hidden");

      if (target === 'stats') initEvolutionChart();
    }, listenerOptions);
  });

  function updateSelectionUI() {
    if (isSelectionMode) {
      list.classList.add("selection-mode");
      bulkBar?.classList.add("active");
    } else {
      list.classList.remove("selection-mode");
      bulkBar?.classList.remove("active");
      list.querySelectorAll(".grid-checkbox").forEach(cb => cb.checked = false);
      updateCount();
    }
  }

  function updateCount() {
    const checkboxes = list.querySelectorAll(".grid-checkbox");
    const count = Array.from(checkboxes).filter(cb => cb.checked).length;
    if (selectedCountEl) selectedCountEl.textContent = `${count} sélectionné(s)`;
    if (bulkBtn) {
      bulkBtn.disabled = count === 0;
      bulkBtn.style.opacity = count === 0 ? "0.5" : "1";
    }
    if (selectAllBtn) {
      const allChecked = checkboxes.length > 0 && count === checkboxes.length;
      selectAllBtn.textContent = allChecked ? "Tout désélectionner" : "Tout sélectionner";
    }
  }

  let isChartLoading = false;
  async function initEvolutionChart() {
    if (isChartLoading) return;
    
    const ctx = document.getElementById('evolutionChart')?.getContext('2d');
    const filter = document.getElementById('chartPeriodFilter');
    const chartCanvas = document.getElementById('evolutionChart');

    if (!ctx || !window.Chart || !chartCanvas) return;

    isChartLoading = true;
    const days = filter ? parseInt(filter.value) : 7;

    const user = currentUser(); // Récupère l'utilisateur actuel (vendeur)
    if (!user || user.type_compte !== "seller") {
      // Affiche un message si l'utilisateur n'est pas un vendeur ou n'est pas connecté
      ctx.canvas.parentNode.innerHTML = '<p class="empty" style="text-align:center; padding:20px;">Connectez-vous en tant que vendeur pour voir les statistiques.</p>';
      return;
    }

    try {
      // Récupère les données de vues quotidiennes pour le vendeur
      const dailyViewsData = await getSellerDailyProductViews(user.id, days).finally(() => { isChartLoading = false; });

      // Prépare les labels (jours de la semaine) et les données (nombre de vues)
      const labels = dailyViewsData.map(item => {
        const date = new Date(item.date);
        return days <= 7 
          ? date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) 
          : date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
      });
      const views = dailyViewsData.map(item => item.views);

      // Nettoyage impératif : détruire toute instance associée à ce canvas avant d'en créer une nouvelle
      const existingChart = window.Chart.getChart(chartCanvas);
      if (existingChart) existingChart.destroy();

      window.myDashboardChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels, // Utilise les labels dynamiques
          datasets: [{
            label: 'Vues de la boutique',
            data: views, // Utilise les données de vues dynamiques
            borderColor: '#ff6a00',
            backgroundColor: 'rgba(255, 106, 0, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: { y: { beginAtZero: true, ticks: { callback: function(value) { if (Number.isInteger(value)) { return value; } } } } } // Force les ticks à être des entiers
        }
      });
    } catch (error) {
      isChartLoading = false;
      console.error("Error fetching chart data:", error);
      const errorMsg = document.getElementById('chartErrorMsg') || document.createElement('p');
      errorMsg.id = 'chartErrorMsg';
      errorMsg.style = "text-align:center; color:red; font-size:0.8rem;";
      errorMsg.textContent = "Erreur de chargement des statistiques.";
      if (!document.getElementById('chartErrorMsg')) chartCanvas.parentNode.appendChild(errorMsg);
    }
  }

  // Ajouter l'écouteur sur le changement de période
  document.getElementById("chartPeriodFilter")?.addEventListener("change", () => initEvolutionChart(), listenerOptions);

  initEvolutionChart();

  const imageFilesInput = document.getElementById("imageFiles");
  if (imageFilesInput && !imageFilesInput.dataset.previewBoundDashboard) {
    setupFilesPreview("imageFiles", "imagePreviewList");
    imageFilesInput.dataset.previewBoundDashboard = "1";
  }

  function getSellerShop() {
    return getShops().find((s) => s.vendeur_id === user.id) || null;
  }

  function renderSellerProducts() {
    const products = getProducts().filter((p) => p.vendeur_id === user.id)
      .map(mapRegularProduct);

    list.innerHTML = products.map((p) => {
      const img = optimizeCloudinaryUrl(p.image || PLACEHOLDER_IMAGE, 300);
      return `
        <div class="profile-grid-item" data-id="${p.id}">
          <a href="product.html?id=${p.id}&origin=regular" class="grid-link">
            <img src="${img}" alt="${p.name}" loading="lazy">
          </a>
          <div class="grid-select-overlay">
            <input type="checkbox" class="grid-checkbox" value="${p.id}">
          </div>
        </div>
      `;
    }).join("");
    empty.style.display = products.length ? "none" : "block";
    updateSelectionUI();
  }

  const optionsMenu = document.getElementById("dashboardOptionsMenu");
  const sectionOptionsBtn = document.getElementById("dashboardSectionOptions");

  sectionOptionsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    optionsMenu.innerHTML = `
      <button class="action-item" data-action="select">Sélectionner</button>
      <button class="action-item danger" data-action="delete">Supprimer la sélection</button>
    `;
    optionsMenu.classList.add("active");
    const rect = sectionOptionsBtn.getBoundingClientRect();
    optionsMenu.style.top = `${rect.bottom + 5}px`;
    optionsMenu.style.left = `${rect.left - optionsMenu.offsetWidth + rect.width}px`;
  }, listenerOptions);

  list.addEventListener("click", (e) => {
    if (e.target.closest(".grid-select-overlay")) {
      if (!isSelectionMode) return;
      const checkbox = e.target.closest(".grid-select-overlay").querySelector(".grid-checkbox");
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      updateCount();
    } else if (e.target.classList.contains("grid-checkbox")) {
      updateCount();
    }
  }, listenerOptions);

  async function executeDashboardAction(action, ids) {
    if (action === "select") {
      isSelectionMode = true;
      updateSelectionUI();
      return;
    }

    let targets = ids.filter(id => id !== undefined && id !== null && id !== "undefined");
    if (targets.length === 0) {
      targets = Array.from(list.querySelectorAll(".grid-checkbox:checked")).map(cb => cb.value);
    }

    if (action === "delete") {
      if (targets.length === 0) {
        alert("Veuillez sélectionner au moins un produit.");
        return;
      }
      if (!confirm(`Voulez-vous vraiment supprimer ${targets.length} produit(s) ?`)) return;
      for (const id of targets) {
        await deleteProductFirestore(id);
      }
      sendEmailLog("Produit (Bulk Delete Dashboard)", targets.join(','), user.email || user.id);
      await syncData();
      renderSellerProducts();
    }
  }

  optionsMenu?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".action-item");
    if (!btn) return;
    
    const action = btn.dataset.action;
    if (action === "select") {
      isSelectionMode = true;
      updateSelectionUI();
    } else {
      // Pour supprimer via le menu, on prend soit l'id du bouton (individuel), soit la sélection
      await executeDashboardAction(action, [btn.dataset.id]);
      isSelectionMode = false;
      updateSelectionUI();
    }
    optionsMenu.classList.remove("active");
  }, listenerOptions);

  bulkBtn?.addEventListener("click", async () => {
    const checked = Array.from(list.querySelectorAll(".grid-checkbox:checked")).map(cb => cb.value);
    await executeDashboardAction("delete", checked);
    isSelectionMode = false;
    updateSelectionUI();
  }, listenerOptions);

  selectAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelectionMode) {
      isSelectionMode = true;
      updateSelectionUI();
    }
    const checkboxes = list.querySelectorAll(".grid-checkbox");
    if (checkboxes.length === 0) return;
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateCount();
  }, listenerOptions);

  cancelBulkBtn?.addEventListener("click", () => {
    isSelectionMode = false;
    updateSelectionUI();
  }, listenerOptions);

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".grid-options-btn") && !e.target.closest("#dashboardOptionsMenu")) {
      optionsMenu?.classList.remove("active");
    }
  }, listenerOptions);

  window.addEventListener("scroll", () => optionsMenu?.classList.remove("active"), { passive: true, signal: dashboardPageListenersController.signal });

  addProductBtn.addEventListener("click", async () => {
    if (addProductBtn.disabled) return;
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

    const fileInput = document.getElementById("imageFiles");
    const files = Array.from(fileInput?.files || []);

    if (!files.length) {
      alert("Veuillez sélectionner au moins une image.");
      return;
    }

    const originalBtnText = addProductBtn.textContent;
    addProductBtn.textContent = "Publication en cours...";
    addProductBtn.disabled = true;

    try {
      // 1. Upload des images vers Cloudinary
      const imageUrls = [];
      for (const file of files) {
        const url = await uploadImageToCloudinary(file);
        imageUrls.push(url);
      }

    const productData = {
      nom: name,
      name,
      description,
      prix: price,
      price,
      image: imageUrls[0],
      images: imageUrls,
      vendeur_id: user.id,
      shopId: shop.id,
      boutique_id: shop.id,
      phone: user.numero_whatsapp,
      date_publication: new Date().toISOString(),
      // date_publication gérée par createdAt
      status: "available"
    };

        // NOUVEAU: Proposer de publier en story
        if (confirm("Voulez-vous également publier la première photo de ce produit dans votre story ?")) {
            try {
                await saveStory({
                    userId: user.id,
                    userName: user.nom || shop.nom,
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
    } finally {
        addProductBtn.textContent = originalBtnText;
        addProductBtn.disabled = false;
    }
  }, listenerOptions);

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

  function render() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const category = categoryFilter?.value || "";

    const products = getOccasionProducts()
      .map(mapOccasionToMarketplace)
      .filter((p) => {
        const byText = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
        const byCategory = !category || p.category === category;
        return byText && byCategory;
      });

    container.innerHTML = products.map((p) => renderProductCard(p)).join("");
    bindAddToCartButtons(container); // Important pour attacher les événements like
    if (empty) empty.style.display = products.length ? "none" : "block";
  }

  searchBtn?.addEventListener("click", render);
  searchInput?.addEventListener("input", render);
  categoryFilter?.addEventListener("change", render);
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

  if (publicationPageListenersController) {
    publicationPageListenersController.abort();
  }
  publicationPageListenersController = new AbortController();
  const listenerOptions = { signal: publicationPageListenersController.signal };

  const occImageInput = document.getElementById("occImageFiles");
  if (occImageInput && !occImageInput.dataset.previewBound) {
    setupFilesPreview("occImageFiles", "occImagePreviewList");
    occImageInput.dataset.previewBound = "1";
  }

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
    }, listenerOptions);
  });

  // --- PUBLICATION PRODUIT (PHOTO) ---
  publishBtn.addEventListener("click", async () => {
    if (publishBtn.disabled) return;
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
  }, listenerOptions);

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
    }, listenerOptions);
  }

  if (videoBtn) {
    videoBtn.addEventListener("click", async () => {
      if (videoBtn.disabled) return;
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
    }, listenerOptions);
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

  // --- NOUVEAU: Enregistrer la vue du produit ---
  if (product.id && product.vendeur_id) { 
    recordProductView(product.id, product.vendeur_id);
  }
  // --- FIN NOUVEAU ---
  const galleryImages = product.images.length ? product.images : [PLACEHOLDER_IMAGE];

  title.textContent = product.name;
  meta.textContent = `${formatPrice(product.price)} • ${product.category || "Autre"}`;

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

  if (avatar && !avatar.dataset.modalBound) {
    avatar.style.cursor = "pointer";
    avatar.title = "Voir la photo en grand";
    avatar.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const src = avatar.src || "";
      if (src) {
        openProfileImageModal(src);
      }
    });
    avatar.dataset.modalBound = "1";
  }

  const logged = currentUser();
  if (!logged) {
    alert("Connectez-vous pour accéder au profil.");
    window.location.href = "login.html";
    return;
  }

  if (profilePageListenersController) {
    profilePageListenersController.abort();
  }
  profilePageListenersController = new AbortController();
  const listenerOptions = { signal: profilePageListenersController.signal };

  let lastAlert = { message: "", at: 0 };
  function showAlert(message) {
    const now = Date.now();
    if (lastAlert.message === message && now - lastAlert.at < 1000) return;
    lastAlert = { message, at: now };
    alert(message);
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
      showAlert(error.message);
      photoInput.value = "";
    }
  }, listenerOptions);

  editProfileBtn.addEventListener("click", () => {
    profileForm.classList.add("is-editing");
  }, listenerOptions);

  cancelProfileBtn.addEventListener("click", () => {
    profileForm.classList.remove("is-editing");
    // Re-render to discard changes
    render(currentUser());
  }, listenerOptions);

  saveBtn.addEventListener("click", async () => {
    if (saveBtn.disabled) return;
    const nom = nameInput.value.trim();
    const numero_whatsapp = normalizePhone(phoneInput.value);
  
    if (!nom || !numero_whatsapp) {
      showAlert("Nom et téléphone sont obligatoires.");
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
          showAlert("Erreur lors de l'envoi de l'image : " + error.message);
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

      // 3bis. Propager le nouveau numéro WhatsApp sur les contenus liés (commandes, boutique, vidéos)
      const previousWhatsapp = normalizePhone(logged.numero_whatsapp || "");
      if (previousWhatsapp !== numero_whatsapp) {
        await syncSellerWhatsappNumber(logged.id, numero_whatsapp);
        await syncData();
      }

      // 4. Mise à jour de la session locale (pour affichage immédiat sans rechargement)
      const updatedUser = { ...logged, ...updateData };
      write(STORAGE_KEYS.loggedUser, updatedUser);
      
      showAlert("Profil mis à jour avec succès !");
      render(updatedUser);
      updateAuthLink(); // Mettre à jour le header immédiatement
      profileForm.classList.remove("is-editing"); // Back to view mode
      if (fileInput) fileInput.value = "";

    } catch (error) {
      console.error(error);
      showAlert("Erreur lors de la mise à jour : " + error.message);
    } finally {
      saveBtn.textContent = originalBtnText;
      saveBtn.disabled = false;
    }
  }, listenerOptions);

  // Gestion de la suppression de compte
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      if (deleteAccountBtn.disabled) return;
      if (confirm("⚠️ ATTENTION : Cette action est irréversible.\n\nVoulez-vous vraiment supprimer votre compte ?\nCela effacera définitivement votre profil, votre boutique et tous vos produits.")) {
        deleteAccountBtn.disabled = true;
        const userId = logged.id;

        // 4. Déconnexion et redirection
        sendEmailLog("Compte (Delete)", userId, logged.email || logged.nom);
        write(STORAGE_KEYS.loggedUser, null);
        showAlert("Votre compte a été supprimé avec succès.");
        window.location.href = "index.html";
      }
    }, listenerOptions);
  }

  // Gestion de la déconnexion depuis le profil
  if (deconnexionBtn) {
    deconnexionBtn.addEventListener("click", async () => {
      if (deconnexionBtn.disabled) return;
      if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
        deconnexionBtn.disabled = true;
        try {
          await logoutUser();
          write(STORAGE_KEYS.loggedUser, null);
          window.location.href = "index-no-connexion.html";
        } finally {
          deconnexionBtn.disabled = false;
        }
      }
    }, listenerOptions);
  }

  render(logged);

  // --- GESTION DU DASHBOARD (ONGLÉS) ---
  const grid = document.getElementById("profileGrid");
  const emptyMsg = document.getElementById("profileEmptyMsg");
  const tabs = document.querySelectorAll(".profile-tab");
  const cancelBulkBtn = document.getElementById("cancelBulkBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const bulkBar = document.getElementById("bulkActionsBar");
  const bulkBtn = document.getElementById("bulkActionBtn");
  const selectedCountEl = document.getElementById("selectedCount");
  const globalOptionsMenu = document.getElementById("globalOptionsMenu");
  
  const initialActiveTab = document.querySelector(".profile-tab.active")?.dataset.tab || "products";
  let currentTab = initialActiveTab;
  let isSelectionMode = false;
  let isActionInProgress = false;
  
  // Fonction pour charger le contenu de la grille
  async function loadTabContent(tabName) {
    currentTab = tabName;
    isSelectionMode = false; // Reset mode selection
    updateSelectionUI();

    const user = currentUser();
    grid.innerHTML = "";
    emptyMsg.style.display = "none";
    let itemsHTML = "";
    let isEmpty = true;
    
    // Config boutons
    let actionLabel = "";
    let actionType = "";

    if (tabName === "products") {
      // --- MES PRODUITS (Boutique + Occasion) ---
      actionLabel = "Supprimer";
      actionType = "delete";
      bulkBtn.textContent = "Supprimer la sélection";

      const myShopIds = getShops()
        .filter((s) => s.vendeur_id === user.id)
        .map((s) => s.id);

      const regular = getProducts()
        .filter((p) => p.vendeur_id === user.id || myShopIds.includes(p.shopId) || myShopIds.includes(p.boutique_id))
        .map(mapRegularProduct)
        .map((p) => ({ ...p, _origin: "regular" }));

      const occasion = getOccasionProducts()
        .filter((p) => p.vendeur_id === user.id || myShopIds.includes(p.shopId) || myShopIds.includes(p.boutique_id))
        .map(mapOccasionToMarketplace)
        .map((p) => ({ ...p, _origin: "occasion" }));

      const myProducts = [...regular, ...occasion];

      if (myProducts.length > 0) {
        isEmpty = false;
        itemsHTML = myProducts.map(p => {
          const img = optimizeCloudinaryUrl(p.image || PLACEHOLDER_IMAGE, 300); // 300px suffisant pour grille
          return `
            <div class="profile-grid-item" data-id="${p.id}">
              <a href="product.html?id=${p.id}&origin=${p._origin}" class="grid-link">
                <img src="${img}" alt="${p.name}" loading="lazy">
              </a>

              <div class="grid-select-overlay">
                <input type="checkbox" class="grid-checkbox" value="${p.id}">
              </div>
            </div>
          `;
        }).join("");
      } else {
        emptyMsg.textContent = "Vous n'avez publié aucun produit.";
      }

    } else if (tabName === "my-videos") {
      actionLabel = "Supprimer";
      actionType = "delete-video";
      bulkBtn.textContent = "Supprimer la sélection";

      const allVideos = await getShortVideos();
      const myVideos = allVideos.filter((v) => user && v.userId === user.id);

      if (myVideos.length > 0) {
        isEmpty = false;
        itemsHTML = myVideos.map((v) => `
            <div class="profile-grid-item" data-id="${v.id}">
              <a href="videos.html" class="grid-link">
                <video src="${v.videoUrl}" muted playsinline preload="metadata" style="width:100%; height:100%; object-fit:cover; background:#000;"></video>
              </a>
              <div class="grid-badge">Vidéo</div>
              <div class="grid-select-overlay">
                <input type="checkbox" class="grid-checkbox" value="${v.id}">
              </div>
            </div>
          `).join("");
      } else {
        emptyMsg.textContent = "Vous n'avez publié aucune vidéo.";
      }

    } else if (tabName === "saved-videos") {
      actionLabel = "Retirer des enregistrées";
      actionType = "unsave-video";
      bulkBtn.textContent = "Retirer la sélection";

      const savedIds = user.savedVideoIds || [];
      const allVideos = await getShortVideos();
      const savedVideos = allVideos.filter((v) => savedIds.includes(v.id));

      if (savedVideos.length > 0) {
        isEmpty = false;
        itemsHTML = savedVideos.map((v) => `
            <div class="profile-grid-item" data-id="${v.id}">
              <a href="videos.html" class="grid-link">
                <video src="${v.videoUrl}" muted playsinline preload="metadata" style="width:100%; height:100%; object-fit:cover; background:#000;"></video>
              </a>
              <div class="grid-badge">Enregistrée</div>
              <div class="grid-select-overlay">
                <input type="checkbox" class="grid-checkbox" value="${v.id}">
              </div>
            </div>
          `).join("");
      } else {
        emptyMsg.textContent = "Aucune vidéo enregistrée.";
      }

    } else if (tabName === "favorites") {
      // --- FAVORIS (Produits) ---
      actionLabel = "Retirer des favoris";
      actionType = "unlike";
      bulkBtn.textContent = "Retirer de la liste";

      const likedIds = user.likedProducts || [];
      const allProducts = getMarketplaceProducts();
      const likedProducts = allProducts.filter(p => likedIds.includes(p.id));

      if (likedProducts.length > 0) {
        isEmpty = false;
        itemsHTML = likedProducts.map(p => {
          const img = optimizeCloudinaryUrl(p.image || PLACEHOLDER_IMAGE, 300);
          const origin = p.isOccasion ? 'occasion' : 'regular';
          return `
            <div class="profile-grid-item" data-id="${p.id}">
              <a href="product.html?id=${p.id}&origin=${origin}" class="grid-link">
                <img src="${img}" alt="${p.name}" loading="lazy">
              </a>

              <div class="grid-select-overlay">
                <input type="checkbox" class="grid-checkbox" value="${p.id}">
              </div>
            </div>
          `;
        }).join("");
      } else {
        emptyMsg.textContent = "Aucun produit en favori.";
      }

    } else if (tabName === "shops") {
      // --- BOUTIQUES SUIVIES ---
      actionLabel = "Ne plus suivre";
      actionType = "unfollow";
      bulkBtn.textContent = "Ne plus suivre";

      const favShopIds = user.favoriteShops || [];
      const allShops = getShops();
      const favShops = allShops.filter(s => favShopIds.includes(s.id));

      if (favShops.length > 0) {
        isEmpty = false;
        itemsHTML = favShops.map(s => {
          const img = optimizeCloudinaryUrl(s.logo || "https://placehold.co/300x300?text=Shop", 300);
          return `
            <div class="profile-grid-item" data-id="${s.id}">
              <a href="shop-details.html?id=${s.id}" class="grid-link">
                <img src="${img}" alt="${s.nom}" style="padding: 10px; background:white;">
              </a>

              <div class="grid-select-overlay">
                <input type="checkbox" class="grid-checkbox" value="${s.id}">
              </div>
            </div>
          `;
        }).join("");
      } else {
        emptyMsg.textContent = "Vous ne suivez aucune boutique.";
      }
    }

    if (isEmpty) {
      emptyMsg.style.display = "block";
    } else {
      grid.innerHTML = itemsHTML;
    }
  }

  // --- LOGIQUE DES ACTIONS ET SÉLECTIONS ---

  function updateSelectionUI() {
    if (isSelectionMode) {
      grid.classList.add("selection-mode");
      bulkBar.classList.add("active");
    } else {
      grid.classList.remove("selection-mode");
      bulkBar.classList.remove("active");
      // Décocher tout
      grid.querySelectorAll(".grid-checkbox").forEach(cb => cb.checked = false);
      updateCount();
    }
  }

  function updateCount() {
    const checkboxes = grid.querySelectorAll(".grid-checkbox");
    const count = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectedCountEl.textContent = `${count} sélectionné(s)`;
    bulkBtn.disabled = count === 0;
    bulkBtn.style.opacity = count === 0 ? "0.5" : "1";

    if (selectAllBtn) {
      const allChecked = checkboxes.length > 0 && count === checkboxes.length;
      selectAllBtn.textContent = allChecked ? "Tout désélectionner" : "Tout sélectionner";
    }
  }

  // Quitter le mode sélection
  cancelBulkBtn?.addEventListener("click", () => {
    isSelectionMode = false;
    updateSelectionUI();
  }, listenerOptions);

  // Tout sélectionner / Désélectionner
  selectAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelectionMode) {
      isSelectionMode = true;
      updateSelectionUI();
    }
    const checkboxes = grid.querySelectorAll(".grid-checkbox");
    if (checkboxes.length === 0) return;
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateCount();
  }, listenerOptions);

  const profileSectionOptionsBtn = document.getElementById("profileSectionOptions");
  profileSectionOptionsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    let actionLabel = "Supprimer", actionType = "delete";
    if (currentTab === "favorites") { actionLabel = "Retirer"; actionType = "unlike"; }
    else if (currentTab === "shops") { actionLabel = "Ne plus suivre"; actionType = "unfollow"; }
    else if (currentTab === "my-videos") { actionLabel = "Supprimer"; actionType = "delete-video"; }
    else if (currentTab === "saved-videos") { actionLabel = "Retirer"; actionType = "unsave-video"; }

    globalOptionsMenu.innerHTML = `
      <button class="action-item" data-action="select">Sélectionner</button>
      <button class="action-item danger" data-action="${actionType}">${actionLabel} la sélection</button>
    `;
    globalOptionsMenu.classList.add("active");
    const rect = profileSectionOptionsBtn.getBoundingClientRect();
    globalOptionsMenu.style.top = `${rect.bottom + 5}px`;
    globalOptionsMenu.style.left = `${rect.left - globalOptionsMenu.offsetWidth + rect.width}px`;
  }, listenerOptions);

  grid.addEventListener("click", (e) => {
    if (e.target.closest(".grid-select-overlay")) {
      if (!isSelectionMode) return;
      const checkbox = e.target.closest(".grid-select-overlay").querySelector(".grid-checkbox");
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      updateCount();
    } else if (e.target.classList.contains("grid-checkbox")) {
      updateCount();
    }
  }, listenerOptions);

  // Listener pour le menu d'options global
  globalOptionsMenu?.addEventListener("click", async (e) => {
    if (isActionInProgress) return;
    const btn = e.target.closest(".action-item");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "select") {
      isSelectionMode = true;
      updateSelectionUI();
    } else {
      // On passe [btn.dataset.id] qui sera undefined pour les actions de groupe, 
      // la fonction executeAction gérera alors la récupération des éléments cochés.
      await executeAction(action, [btn.dataset.id]);
      isSelectionMode = false;
      updateSelectionUI();
    }
    globalOptionsMenu.classList.remove("active");
  }, listenerOptions);

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".grid-options-btn") && !e.target.closest("#globalOptionsMenu")) {
      globalOptionsMenu.classList.remove("active");
      globalOptionsMenu.removeAttribute("data-target-id");
    }
  }, listenerOptions);

  // Fermer le menu au défilement pour éviter qu'il reste flottant de manière incohérente
  window.addEventListener("scroll", () => {
    if (globalOptionsMenu.classList.contains("active")) {
      globalOptionsMenu.classList.remove("active");
      globalOptionsMenu.removeAttribute("data-target-id");
    }
  }, { passive: true, signal: profilePageListenersController.signal });

  // Click bouton Bulk Action
  bulkBtn.addEventListener("click", async () => {
    if (isActionInProgress) return;
    const checked = Array.from(grid.querySelectorAll(".grid-checkbox:checked")).map(cb => cb.value);
    let action = "";
    if (currentTab === "products") action = "delete";
    else if (currentTab === "favorites") action = "unlike";
    else if (currentTab === "shops") action = "unfollow";
    else if (currentTab === "my-videos") action = "delete-video";
    else if (currentTab === "saved-videos") action = "unsave-video";

    await executeAction(action, checked);
    isSelectionMode = false;
    updateSelectionUI();
  }, listenerOptions);

  // Fonction centrale d'exécution
  async function executeAction(action, ids) {
    if (isActionInProgress) return;
    isActionInProgress = true;
    const user = currentUser();
    
    try {
      if (action === "select") {
        isSelectionMode = true;
        updateSelectionUI();
        return;
      }

    let targets = ids.filter(id => id !== undefined && id !== null && id !== "undefined");
    if (targets.length === 0) {
      targets = Array.from(grid.querySelectorAll(".grid-checkbox:checked")).map(cb => cb.value);
    }

    if (action === "delete") {
        // Suppression produits (Mes produits)
      if (targets.length === 0) { showAlert("Veuillez sélectionner au moins un produit."); return; }
      if (!confirm(`Voulez-vous vraiment supprimer ${targets.length} produit(s) ?`)) return;
      for (const id of targets) {
          await deleteProductFirestore(id);
        }
      sendEmailLog("Produit (Bulk Delete Profile)", targets.join(','), user.email || user.id);
        await syncData(); // Recharger données
        
      } else if (action === "unlike") {
        // Retirer favoris
      if (targets.length === 0) { showAlert("Veuillez sélectionner au moins un élément."); return; }
        let liked = user.likedProducts || [];
      liked = liked.filter(id => !targets.includes(id));
        await updateUserInFirestore(user.id, { likedProducts: liked });
        
        // Mise à jour locale session
        user.likedProducts = liked;
      write(STORAGE_KEYS.loggedUser, user);
        
      } else if (action === "unfollow") {
        // Ne plus suivre boutique
      if (targets.length === 0) { showAlert("Veuillez sélectionner au moins une boutique."); return; }
      if (!confirm(`Voulez-vous vraiment ne plus suivre ces ${targets.length} boutique(s) ?`)) return;
        const serverUserBefore = await getUserFromFirestore(user.id);
        const serverFavoritesBefore = serverUserBefore?.favoriteShops || [];

        // On force un retrait réel: toggle uniquement si la boutique est suivie côté serveur.
        for (const id of targets) {
          if (serverFavoritesBefore.includes(id)) {
            await toggleShopFollow(user.id, id);
          }
        }

        // Synchroniser la session locale utilisateur avec l'état Firestore final.
        const serverUserAfter = await getUserFromFirestore(user.id);
        user.favoriteShops = serverUserAfter?.favoriteShops || [];
        write(STORAGE_KEYS.loggedUser, user);
        await syncData(); // Important pour shops
      } else if (action === "delete-video") {
        if (targets.length === 0) { showAlert("Veuillez sélectionner au moins une vidéo."); return; }
        if (!confirm(`Voulez-vous vraiment supprimer ${targets.length} vidéo(s) ?`)) return;

        for (const id of targets) {
          await deleteShortVideo(id, user.id);
        }

        const savedIds = Array.isArray(user.savedVideoIds) ? user.savedVideoIds : [];
        const nextSaved = savedIds.filter((id) => !targets.includes(id));
        if (nextSaved.length !== savedIds.length) {
          await updateUserInFirestore(user.id, { savedVideoIds: nextSaved });
          user.savedVideoIds = nextSaved;
          write(STORAGE_KEYS.loggedUser, user);
        }
      } else if (action === "unsave-video") {
        if (targets.length === 0) { showAlert("Veuillez sélectionner au moins une vidéo."); return; }
        const savedIds = Array.isArray(user.savedVideoIds) ? user.savedVideoIds : [];
        const nextSaved = savedIds.filter((id) => !targets.includes(id));
        await updateUserInFirestore(user.id, { savedVideoIds: nextSaved });
        user.savedVideoIds = nextSaved;
        write(STORAGE_KEYS.loggedUser, user);
      }
      
      // Rafraichir la grille
      await loadTabContent(currentTab);
      
    } catch (e) {
      console.error(e);
      showAlert("Une erreur est survenue.");
    } finally {
      isActionInProgress = false;
    }
  }

  // Gestion du clic sur les onglets
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      loadTabContent(tab.dataset.tab);
    }, listenerOptions);
  });
  
  // Charger l'onglet par défaut (Produits)
  loadTabContent(initialActiveTab);

  // Ajouter les événements pour les photos de profil
  setupProfileImageModal(profilePageListenersController.signal);
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

async function setupProfileImageModal(signal = null) {
  // Ajouter les événements click sur toutes les photos de profil
  const profileAvatars = document.querySelectorAll(".profile-avatar");
  const shopLogoDisplay = document.getElementById("shopLogoDisplay");
  const listenerOptions = signal ? { signal } : undefined;
  
  profileAvatars.forEach(avatar => {
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      const imageSrc = avatar.src;
      if (imageSrc && !imageSrc.includes("placehold.co")) {
        openProfileImageModal(imageSrc);
      }
    }, listenerOptions);
  });
  
  if (shopLogoDisplay) {
    shopLogoDisplay.addEventListener("click", (e) => {
      e.stopPropagation();
      const imageSrc = shopLogoDisplay.src;
      if (imageSrc && !imageSrc.includes("placehold.co")) {
        openProfileImageModal(imageSrc);
      }
    }, listenerOptions);
  }
  
  // Fermer la modal avec la touche Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProfileImageModal();
    }
  }, listenerOptions);
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

  if (shopLogoDisplay && !shopLogoDisplay.dataset.modalBound) {
    shopLogoDisplay.style.cursor = "pointer";
    shopLogoDisplay.title = "Voir le logo en grand";
    shopLogoDisplay.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentSrc = shopLogoDisplay.src || "";
      if (currentSrc) {
        openProfileImageModal(currentSrc);
      }
    });
    shopLogoDisplay.dataset.modalBound = "1";
  }

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
          sendEmailLog("Boutique (Delete)", shopToDelete.id, user.email || user.id);
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
  const searchToggleBtn = document.getElementById("videoSearchToggle");
  const searchBar = document.getElementById("videoSearchBar");
  const searchInput = document.getElementById("videoSearchInput");
  const user = currentUser();
  const openPanels = new Set(
    Array.from(container?.querySelectorAll(".video-comments-panel.active") || [])
      .map((el) => el.getAttribute("data-id"))
      .filter(Boolean)
  );

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  
  try {
    const videos = await getShortVideos();
    const query = (searchInput?.value || "").trim().toLowerCase();
    const filteredVideos = query
      ? videos.filter((v) => {
          const username = String(v.userName || "").toLowerCase();
          const caption = String(v.caption || "").toLowerCase();
          return username.includes(query) || caption.includes(query);
        })
      : videos;
    
    if (filteredVideos.length === 0) {
      container.innerHTML = "";
      empty.classList.remove("hidden");
      empty.textContent = query
        ? "Aucune vidéo ne correspond à votre recherche."
        : "Aucune vidéo pour le moment.";
      return;
    }
    empty.classList.add("hidden");

    container.innerHTML = filteredVideos.map(v => {
      const likes = v.likes || [];
      const isLiked = user && likes.includes(user.id);
      const savedIds = Array.isArray(user?.savedVideoIds) ? user.savedVideoIds : [];
      const isSaved = user ? savedIds.includes(v.id) : false;
      const likeCount = likes.length;
      const comments = Array.isArray(v.comments) ? v.comments : [];
      const commentCount = comments.length;
      const canDelete = !!(user && v.userId === user.id);
      const publishLabel = formatTimeAgo(v.createdAt || v.date_publication || "");
      
      // Préparation du lien WhatsApp
      const phone = v.userPhone ? normalizePhone(v.userPhone) : "";
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent("Bonjour, je suis intéressé par votre vidéo sur Kome-Gab : " + (v.caption || ""))}` : "#";
      const waDisplay = phone ? "flex" : "none";
      const commentsByParent = new Map();
      comments.forEach((c) => {
        const key = c.parentId || "__root__";
        if (!commentsByParent.has(key)) commentsByParent.set(key, []);
        commentsByParent.get(key).push(c);
      });

      function collectDescendants(parentId, acc = []) {
        const children = commentsByParent.get(parentId) || [];
        children.forEach((child) => {
          acc.push(child);
          collectDescendants(child.id, acc);
        });
        return acc;
      }

      function renderCommentItem(c, isReply = false) {
        const likeUsers = Array.isArray(c.likes) ? c.likes : [];
        const likeCount = likeUsers.length;
        const isLikedByMe = !!(user && likeUsers.includes(user.id));
        const replyLine = c.replyToUserName ? `<div class="video-reply-to-line">Réponse à @${escapeHtml(c.replyToUserName)}</div>` : "";
        const canDeleteComment = !!(user && user.id === c.userId);
        const commentDate = formatTimeAgo(c.createdAt || "");
        return `
          <div class="video-comment-item ${isReply ? "is-reply" : ""}" data-comment-id="${c.id}">
            <strong>${escapeHtml(c.userName || "Utilisateur")}</strong>
            <div class="video-comment-date">${escapeHtml(commentDate)}</div>
            ${replyLine}
            <span>${escapeHtml(c.text || "")}</span>
            <div class="video-comment-actions">
              ${user ? `<button type="button" class="video-comment-reply-btn" data-video-id="${v.id}" data-comment-id="${c.id}" data-reply-to="${escapeHtml(c.userName || "Utilisateur")}">Répondre</button>` : ""}
              ${user ? `<button type="button" class="video-comment-like-btn ${isLikedByMe ? "active" : ""}" data-video-id="${v.id}" data-comment-id="${c.id}">&#9829; ${likeCount}</button>` : `<span class="video-comment-like-static">&#9829; ${likeCount}</span>`}
              ${canDeleteComment ? `<button type="button" class="video-comment-delete-btn" data-video-id="${v.id}" data-comment-id="${c.id}">Supprimer</button>` : ""}
            </div>
          </div>
        `;
      }

      function renderCommentThreadFlat() {
        const roots = commentsByParent.get("__root__") || [];
        const rootsSorted = [...roots].sort((a, b) => {
          const ta = new Date(a.createdAt || 0).getTime();
          const tb = new Date(b.createdAt || 0).getTime();
          return tb - ta; // plus récent d'abord
        });
        return rootsSorted.map((root) => {
          const descendants = collectDescendants(root.id, []);
          const hasManyReplies = descendants.length > 2;
          const hiddenRepliesCount = Math.max(0, descendants.length - 2);
          const repliesHtml = descendants.map((reply, idx) => `
            <div class="video-comment-child ${idx >= 2 ? "reply-collapsed" : ""}">
              ${renderCommentItem(reply, true)}
            </div>
          `).join("");

          return `
            <div class="video-comment-thread" data-comment-id="${root.id}">
              ${renderCommentItem(root, false)}
              ${descendants.length ? `<div class="video-comment-children">${repliesHtml}</div>` : ""}
              ${hasManyReplies ? `<button type="button" class="video-replies-toggle-btn" data-expanded="0">+ Plus (${hiddenRepliesCount})</button>` : ""}
            </div>
          `;
        }).join("");
      }

      const commentsHtml = comments.length
        ? renderCommentThreadFlat()
        : `<p class="video-comment-empty">Aucun commentaire.</p>`;

      return `
        <div class="video-card" data-video-id="${v.id}">
          ${canDelete ? `<button class="video-delete-btn" data-id="${v.id}" title="Supprimer ma vidéo"><i class="fas fa-trash"></i></button>` : ""}
          <video class="video-player" src="${v.videoUrl}" controls loop playsinline></video>
          
          <button class="like-btn ${isLiked ? 'active' : ''}" data-id="${v.id}" data-type="video">&#9829;</button>
          <span class="video-like-count" data-id="${v.id}">${likeCount}</span>

          <button class="video-comment-toggle-btn" data-id="${v.id}" title="Commentaires">
            <i class="fa-regular fa-comment"></i>
          </button>
          <span class="video-comment-count" data-id="${v.id}">${commentCount}</span>

          <a href="${waLink}" class="whatsapp-btn" target="_blank" style="display:${waDisplay}" title="Contacter sur WhatsApp">
            <i class="fa-brands fa-whatsapp"></i>
          </a>

          <button class="video-share-btn" data-id="${v.id}" data-caption="${escapeHtml(v.caption || "")}" title="Partager">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="video-save-btn ${isSaved ? 'active' : ''}" data-id="${v.id}" title="Enregistrer">
            <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
          </button>


          <div class="video-overlay">
            <div class="video-user">@${escapeHtml(v.userName || "Utilisateur")}</div>
            <div class="video-meta-date">${escapeHtml(publishLabel || "")}</div>
            <p>${escapeHtml(v.caption || "")}</p>
          </div>

          <div class="video-comments-panel" data-id="${v.id}">
            <div class="video-comments-header">
              <span>Commentaires (${commentCount})</span>
              <button type="button" class="video-comments-close-btn" data-id="${v.id}" title="Fermer">X</button>
            </div>
            <div class="video-comments">${commentsHtml}</div>
            ${user ? `
              <div class="video-comment-form">
                <div class="video-comment-reply-target" data-id="${v.id}" style="display:none;">
                  <span class="reply-label"></span>
                  <button type="button" class="video-reply-cancel-btn" data-id="${v.id}">Annuler</button>
                </div>
                <input type="text" class="video-comment-input" data-id="${v.id}" maxlength="250" placeholder="Ajouter un commentaire...">
                <button type="button" class="video-comment-send" data-id="${v.id}">Envoyer</button>
              </div>
            ` : `
              <div class="video-comment-login-hint">
                <a href="login.html">Connectez-vous</a> pour commenter.
              </div>
            `}
          </div>
        </div>
      `;
    }).join("");

    openPanels.forEach((id) => {
      const panel = container.querySelector(`.video-comments-panel[data-id="${id}"]`);
      if (panel) panel.classList.add("active");
    });

    // Bind des boutons like vidéo
    container.querySelectorAll(".like-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        toggleLike(id, 'video');
      });
    });

    // Double-clic style TikTok : active le like si pas déjà actif
    container.querySelectorAll(".video-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (container.classList.contains("video-feed-fullscreen")) return;
        if (e.target.closest(".video-comments-panel, .video-comment-toggle-btn, .video-share-btn, .video-save-btn, .whatsapp-btn, .like-btn, .video-delete-btn, .video-comment-input, .video-comment-send, .video-comment-reply-btn, .video-comment-delete-btn, .video-comment-like-btn, .video-comments-close-btn, .video-replies-toggle-btn")) {
          return;
        }

        const cards = Array.from(container.querySelectorAll(".video-card"));
        const idx = cards.indexOf(card);
        container.classList.add("video-feed-fullscreen");
        document.body.classList.add("cart-open", "video-fullscreen-open");
        closeFeedBtn.classList.add("active");
        searchFeedBtn.classList.add("active");

        const top = idx * window.innerHeight;
        container.scrollTo({ top, behavior: "auto" });
      });

      card.addEventListener("dblclick", (e) => {
        if (!user) return;
        if (e.target.closest(".video-comments-panel, .video-comment-toggle-btn, .video-share-btn, .video-save-btn, .whatsapp-btn, .like-btn, .video-delete-btn, .video-comment-input, .video-comment-send, .video-comment-reply-btn, .video-comment-delete-btn, .video-comment-like-btn, .video-comments-close-btn, .video-replies-toggle-btn")) {
          return;
        }

        const likeBtn = card.querySelector('.like-btn[data-type="video"]');
        if (!likeBtn) return;
        if (likeBtn.classList.contains("active")) return;

        const id = likeBtn.getAttribute("data-id");
        if (id) toggleLike(id, "video");
      });
    });

    // Commentaires vidéos
    container.querySelectorAll(".video-comment-send").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          alert("Connectez-vous pour commenter.");
          return;
        }

        const videoId = btn.getAttribute("data-id");
        const input = container.querySelector(`.video-comment-input[data-id="${videoId}"]`);
        const replyTarget = container.querySelector(`.video-comment-reply-target[data-id="${videoId}"]`);
        const text = (input?.value || "").trim();
        if (!text) {
          alert("Le commentaire est vide.");
          return;
        }

        const parentId = input?.dataset.replyToCommentId || null;
        const replyToUserName = input?.dataset.replyToUserName || null;

        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = "...";
        try {
          await addVideoComment(videoId, {
            userId: user.id,
            userName: user.nom || user.email || "Utilisateur",
            text,
            parentId,
            replyToUserName
          });
          if (input) {
            input.value = "";
            delete input.dataset.replyToCommentId;
            delete input.dataset.replyToUserName;
          }
          if (replyTarget) {
            replyTarget.style.display = "none";
            const label = replyTarget.querySelector(".reply-label");
            if (label) label.textContent = "";
          }
          await setupVideosPage();
        } catch (error) {
          console.error("Erreur ajout commentaire vidéo:", error);
          alert("Impossible d'ajouter le commentaire.");
        } finally {
          btn.textContent = oldText;
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll(".video-comment-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const videoId = input.getAttribute("data-id");
          const sendBtn = container.querySelector(`.video-comment-send[data-id="${videoId}"]`);
          sendBtn?.click();
        }
      });
    });

    container.querySelectorAll(".video-comment-reply-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const videoId = btn.getAttribute("data-video-id");
        const commentId = btn.getAttribute("data-comment-id");
        const replyTo = btn.getAttribute("data-reply-to") || "Utilisateur";
        const input = container.querySelector(`.video-comment-input[data-id="${videoId}"]`);
        const replyTarget = container.querySelector(`.video-comment-reply-target[data-id="${videoId}"]`);
        if (!input || !replyTarget) return;

        input.dataset.replyToCommentId = commentId;
        input.dataset.replyToUserName = replyTo;
        input.placeholder = `Répondre à @${replyTo}...`;
        replyTarget.style.display = "flex";
        const label = replyTarget.querySelector(".reply-label");
        if (label) label.textContent = `Réponse à @${replyTo}`;
        input.focus();
      });
    });

    container.querySelectorAll(".video-reply-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const videoId = btn.getAttribute("data-id");
        const input = container.querySelector(`.video-comment-input[data-id="${videoId}"]`);
        const replyTarget = container.querySelector(`.video-comment-reply-target[data-id="${videoId}"]`);
        if (input) {
          delete input.dataset.replyToCommentId;
          delete input.dataset.replyToUserName;
          input.placeholder = "Ajouter un commentaire...";
        }
        if (replyTarget) {
          replyTarget.style.display = "none";
          const label = replyTarget.querySelector(".reply-label");
          if (label) label.textContent = "";
        }
      });
    });

    container.querySelectorAll(".video-comment-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return;
        const videoId = btn.getAttribute("data-video-id");
        const commentId = btn.getAttribute("data-comment-id");
        if (!videoId || !commentId) return;
        if (!confirm("Supprimer ce commentaire ?")) return;

        btn.disabled = true;
        try {
          await deleteVideoComment(videoId, commentId, user.id);
          await setupVideosPage();
        } catch (error) {
          console.error("Erreur suppression commentaire vidéo:", error);
          alert(error?.message || "Impossible de supprimer ce commentaire.");
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll(".video-comment-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const videoId = btn.getAttribute("data-id");
        const panel = container.querySelector(`.video-comments-panel[data-id="${videoId}"]`);
        if (!panel) return;
        panel.classList.toggle("active");
      });
    });

    container.querySelectorAll(".video-share-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const videoId = btn.getAttribute("data-id") || "";
        const caption = btn.getAttribute("data-caption") || "";
        const shareUrl = `${window.location.origin}${window.location.pathname}?video=${encodeURIComponent(videoId)}`;
        const shareText = caption ? `Regarde cette vidéo: ${caption}` : "Regarde cette vidéo sur Kome-Gab";
        try {
          if (navigator.share) {
            await navigator.share({
              title: "Kome-Gab - Vidéo",
              text: shareText,
              url: shareUrl
            });
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            alert("Lien vidéo copié.");
          } else {
            alert("Le partage n'est pas disponible sur cet appareil.");
          }
        } catch (error) {
          // Ignorer l'annulation utilisateur; afficher seulement les vraies erreurs
          if (error && error.name !== "AbortError") {
            console.error("Erreur partage vidéo:", error);
            alert("Impossible de partager la vidéo.");
          }
        }
      });
    });

    container.querySelectorAll(".video-save-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          alert("Connectez-vous pour enregistrer une vidéo.");
          return;
        }
        const videoId = btn.getAttribute("data-id");
        if (!videoId) return;

        btn.disabled = true;
        try {
          const saved = await toggleSavedVideo(videoId);
          btn.classList.toggle("active", saved);
          const icon = btn.querySelector("i");
          if (icon) {
            icon.className = saved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
          }
        } catch (error) {
          console.error("Erreur enregistrement vidéo:", error);
          alert("Impossible d'enregistrer cette vidéo.");
        } finally {
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll(".video-comments-close-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const videoId = btn.getAttribute("data-id");
        const panel = container.querySelector(`.video-comments-panel[data-id="${videoId}"]`);
        if (!panel) return;
        panel.classList.remove("active");
      });
    });

    container.querySelectorAll(".video-replies-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const thread = btn.closest(".video-comment-thread");
        if (!thread) return;
        const hiddenChildren = thread.querySelectorAll(":scope > .video-comment-children > .video-comment-child.reply-collapsed");
        const isExpanded = btn.getAttribute("data-expanded") === "1";
        if (isExpanded) {
          hiddenChildren.forEach((el) => el.classList.add("reply-collapsed"));
          const count = hiddenChildren.length;
          btn.setAttribute("data-expanded", "0");
          btn.textContent = `+ Plus (${count})`;
        } else {
          hiddenChildren.forEach((el) => el.classList.remove("reply-collapsed"));
          btn.setAttribute("data-expanded", "1");
          btn.textContent = "- Moins";
        }
      });
    });

    container.querySelectorAll(".video-comment-like-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          alert("Connectez-vous pour liker un commentaire.");
          return;
        }
        const videoId = btn.getAttribute("data-video-id");
        const commentId = btn.getAttribute("data-comment-id");
        if (!videoId || !commentId) return;
        btn.disabled = true;
        try {
          await toggleVideoCommentLike(videoId, commentId, user.id);
          await setupVideosPage();
        } catch (error) {
          console.error("Erreur like commentaire:", error);
          alert("Impossible de liker ce commentaire.");
          btn.disabled = false;
        }
      });
    });

    // Suppression vidéo (propriétaire uniquement)
    container.querySelectorAll(".video-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return;
        const videoId = btn.getAttribute("data-id");
        if (!confirm("Voulez-vous vraiment supprimer cette vidéo ?")) return;

        btn.disabled = true;
        try {
          await deleteShortVideo(videoId, user.id);
          alert("Vidéo supprimée.");
          await setupVideosPage();
        } catch (error) {
          console.error("Erreur suppression vidéo:", error);
          alert(error?.message || "Impossible de supprimer la vidéo.");
          btn.disabled = false;
        }
      });
    });

    // --- GESTION AUTOPLAY AU DÉFILEMENT (style TikTok) ---
    const allVideoEls = Array.from(container.querySelectorAll("video"));
    const visibilityMap = new Map();
    let autoplayRaf = null;
    let currentAutoplayIndex = 0;
    let lastScrollTop = container.scrollTop || 0;

    const playVideoAtIndex = (idx) => {
      if (idx < 0 || idx >= allVideoEls.length) return;
      const target = allVideoEls[idx];
      currentAutoplayIndex = idx;
      allVideoEls.forEach((video, i) => {
        if (i !== idx && !video.paused) video.pause();
      });
      if (target.paused) {
        target.play().catch(e => console.log("Autoplay bloqué (interaction requise):", e));
      }
    };

    const playInOrderedSequence = () => {
      if (!allVideoEls.length) return;

      const currentRatio = visibilityMap.get(allVideoEls[currentAutoplayIndex]) || 0;
      if (currentRatio >= 0.35) {
        // Tant que la vidéo courante est encore bien visible, on la garde.
        playVideoAtIndex(currentAutoplayIndex);
        return;
      }

      const goingDown = (container.scrollTop || 0) >= lastScrollTop;
      const direction = goingDown ? 1 : -1;
      lastScrollTop = container.scrollTop || 0;

      // Avance/recul dans l'ordre des cartes (gauche->droite puis ligne suivante).
      let nextIdx = currentAutoplayIndex + direction;
      while (nextIdx >= 0 && nextIdx < allVideoEls.length) {
        const ratio = visibilityMap.get(allVideoEls[nextIdx]) || 0;
        if (ratio >= 0.2) {
          playVideoAtIndex(nextIdx);
          return;
        }
        nextIdx += direction;
      }

      // Fallback: première vidéo visible dans le sens du scroll.
      const scan = goingDown
        ? [...allVideoEls.keys()]
        : [...allVideoEls.keys()].reverse();
      for (const idx of scan) {
        const ratio = visibilityMap.get(allVideoEls[idx]) || 0;
        if (ratio >= 0.2) {
          playVideoAtIndex(idx);
          return;
        }
      }
    };

    const scheduleAutoplayCheck = () => {
      if (autoplayRaf) cancelAnimationFrame(autoplayRaf);
      autoplayRaf = requestAnimationFrame(playInOrderedSequence);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        visibilityMap.set(entry.target, entry.intersectionRatio || 0);
      });
      scheduleAutoplayCheck();
    }, { threshold: [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1] });

    allVideoEls.forEach((video) => {
      video.muted = true; // facilite l'autoplay mobile
      observer.observe(video);
      video.addEventListener("play", () => {
        allVideoEls.forEach((other) => {
          if (other !== video && !other.paused) {
            other.pause();
          }
        });
      });
    });

    // Démarrer la première vidéo immédiatement
    const firstVideo = allVideoEls[0];
    if (firstVideo) {
      allVideoEls.forEach((video, idx) => {
        if (idx !== 0) video.pause();
      });
      firstVideo.play().catch(() => {});
    }

    container.addEventListener("scroll", scheduleAutoplayCheck, { passive: true });
    window.addEventListener("resize", scheduleAutoplayCheck, { passive: true });

    const closeFeedBtn = document.getElementById("videoFeedCloseBtn") || (() => {
      const btn = document.createElement("button");
      btn.id = "videoFeedCloseBtn";
      btn.className = "video-feed-close-btn";
      btn.type = "button";
      btn.innerHTML = '<i class="fas fa-arrow-left"></i>';
      btn.setAttribute("aria-label", "Fermer le plein écran");
      document.body.appendChild(btn);
      return btn;
    })();

    const searchFeedBtn = document.getElementById("videoFeedSearchBtn") || (() => {
      const btn = document.createElement("button");
      btn.id = "videoFeedSearchBtn";
      btn.className = "video-feed-search-btn";
      btn.type = "button";
      btn.innerHTML = '<i class="fas fa-search"></i>';
      btn.setAttribute("aria-label", "Rechercher une vidéo");
      document.body.appendChild(btn);
      return btn;
    })();

    const exitFullscreenFeed = () => {
      container.classList.remove("video-feed-fullscreen");
      closeFeedBtn.classList.remove("active");
      searchFeedBtn.classList.remove("active");
      document.body.classList.remove("cart-open", "video-fullscreen-open");
      if (searchBar) searchBar.classList.add("hidden");
    };

    closeFeedBtn.onclick = exitFullscreenFeed;
    searchFeedBtn.onclick = () => {
      // Style TikTok: quitter le plein écran et revenir à la recherche de la grille.
      exitFullscreenFeed();
      if (!searchBar) return;
      searchBar.classList.remove("hidden");
      if (searchInput) searchInput.focus();
    };
    if (!closeFeedBtn.dataset.escBound) {
      document.addEventListener("keydown", (evt) => {
        if (evt.key === "Escape" && container.classList.contains("video-feed-fullscreen")) {
          exitFullscreenFeed();
        }
      });
      closeFeedBtn.dataset.escBound = "1";
    }

  } catch (e) {
    console.error("Erreur chargement vidéos", e);
  }

  if (searchToggleBtn && searchBar && !searchToggleBtn.dataset.bound) {
    searchToggleBtn.addEventListener("click", () => {
      const willOpen = searchBar.classList.contains("hidden");
      searchBar.classList.toggle("hidden");
      if (willOpen && searchInput) {
        searchInput.focus();
      } else if (searchInput && searchInput.value.trim()) {
        searchInput.value = "";
        setupVideosPage();
      }
    });
    searchToggleBtn.dataset.bound = "1";
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", () => {
      setupVideosPage();
    });
    searchInput.dataset.bound = "1";
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

  // --- ENREGISTRER LA VUE DE LA BOUTIQUE ---
  if (shop.id && shop.vendeur_id) {
    recordShopView(shop.id, shop.vendeur_id);
  }

  // 1. Remplissage des infos de la boutique
  document.title = `${shop.nom} - Kome-Gab`;
  
  // Logo
  const logoImg = document.getElementById("shopLogoImg");
  if (logoImg) {
    const logoSrc = shop.logo || "https://placehold.co/300x300?text=Shop";
    logoImg.src = optimizeCloudinaryUrl(logoSrc, 100);
    logoImg.style.cursor = "pointer";
    logoImg.title = "Voir la photo en grand";
    logoImg.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const largeSrc = optimizeCloudinaryUrl(logoSrc, 900) || logoImg.src;
      window.openProfileImageModal(largeSrc);
    };
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

  // Bouton Dashboard boutique: visible uniquement pour le propriétaire
  const dashboardBtn = document.getElementById("shopDashboardBtn");
  if (dashboardBtn) {
    const isOwner = !!(user && shop.vendeur_id && user.id === shop.vendeur_id);
    dashboardBtn.style.display = isOwner ? "flex" : "none";
    dashboardBtn.href = "dashboard.html";
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
