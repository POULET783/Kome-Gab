// Script.js

// Import des fonctions Firebase et Cloudinary
import { uploadImageToCloudinary, saveOccasionProduct, registerUser, loginUser, saveUserToFirestore, getUserFromFirestore, logoutUser, getAllProducts, saveProductToFirestore, deleteProductFirestore, updateProductFirestore, getAllShops, saveShopToFirestore } from '../firebase-app.js';

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

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// --- SYSTEME DE CACHE SYNCRO FIREBASE ---
let cachedProducts = [];
let cachedShops = [];

async function syncData() {
  cachedProducts = await getAllProducts();
  cachedShops = await getAllShops();
  console.log("Données synchronisées depuis Firebase");
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
      
      if (logged.type_compte === "seller") {
        const shops = getShops();
        const shop = shops.find(s => s.vendeur_id === logged.id);
        if (shop && shop.logo) {
          profileImage = shop.logo;
        }
      }
      
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
      throw new Error("Tous les fichiers doivent Ãªtre des images.");
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
    .map((src, index) => `<img src="${src}" alt="AperÃ§u ${index + 1}">`)
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
      return `
        <li>
          <a href="${productUrl}" class="cart-item-link">
            <img src="${item.image || PLACEHOLDER_IMAGE}" alt="${item.name}">
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
    alert("Le panier est rÃ©servÃ© aux produits de boutique.");
    return;
  }

  if (product.status === "sold") {
    alert("Ce produit est marquÃ© comme vendu.");
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
  alert("Produit ajoutÃ© au panier.");
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
  const coverImage = images[0] || PLACEHOLDER_IMAGE;
  const shopParam = normalized.shopId ? `?shop=${encodeURIComponent(normalized.shopId)}` : "";
  const isSold = normalized.status === "sold";
  const galleryUrl = getProductDetailUrl(normalized);

  const shop = !normalized.isOccasion
    ? getShops().find((s) => s.id === normalized.shopId || s.id === normalized.boutique_id)
    : null;

  const shopSnippet = shop
    ? `<a class="shop-snippet" href="boutique.html?shop=${encodeURIComponent(shop.id)}"><img src="${shop.logo || "https://placehold.co/50x50/ff6a00/ffffff?text=K"}" alt="${shop.nom}"><span>${shop.nom}</span></a>`
    : "";

  const sourceAction = normalized.isOccasion
    ? `<a class="link-btn secondary" href="occasion.html">Annonce occasion</a>`
    : `<a class="link-btn secondary" href="boutique.html${shopParam}">Boutique</a>`;

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
        <img src="${coverImage}" alt="${normalized.name}">
      </a>
      <div class="card-body">
        ${shopSnippet}
        <span class="tag ${isSold ? "sold" : ""}">${isSold ? "Vendu" : "Disponible"}</span>
        <h4><a class="product-title-link" href="${galleryUrl}">${normalized.name}</a></h4>
        <p class="meta">${formatPrice(normalized.price)} • ${normalized.category || "Autre"}</p>
        <p class="meta clamp-two">${normalized.description || "Sans description"}</p>
        <div class="row-actions">
          <a class="link-btn" href="${whatsappHref}" target="_blank" rel="noopener">Commander</a>
          <a class="link-btn secondary" href="${galleryUrl}">Galerie</a>
          ${sourceAction}
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
function getUsers() {
  // Les utilisateurs sont gérés par Auth, on garde ça simple pour l'instant
  return read(STORAGE_KEYS.users, []);
}

function saveUsers(users) {
  // Obsolète avec Firebase Auth, mais gardé pour compatibilité locale temporaire
  write(STORAGE_KEYS.users, users);
}

function getProducts() {
  // Retourne les produits qui NE SONT PAS d'occasion (donc boutiques)
  return cachedProducts.filter(p => p.category !== 'Occasion');
}

function saveProducts(products) {
  write(STORAGE_KEYS.products, products);
  // Cette fonction locale est remplacée par saveProductToFirestore
}

function getShops() {
  return cachedShops;
}

function saveShops(shops) {
  write(STORAGE_KEYS.shops, shops);
  // Remplacée par saveShopToFirestore
}

function getOccasionProducts() {
  return cachedProducts.filter(p => p.category === 'Occasion');
}

function saveOccasionProducts(products) {
  write(STORAGE_KEYS.occasionProducts, products);
  // Remplacée par saveOccasionProduct (déjà dans setupPublication)
}

function getMarketplaceProducts() {
  const regular = getProducts().map(mapRegularProduct);
  const occasion = getOccasionProducts().map(mapOccasionToMarketplace);
  return [...regular, ...occasion];
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
      
      // On garde une copie locale pour que le reste du site fonctionne sans refonte totale
      write(STORAGE_KEYS.loggedUser, userData);
      
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

  // S'assurer que les données sont à jour
  await syncData();

  // Charger les données à jour
  await syncData();

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
  document.getElementById("searchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      render();
    }
  });
  document.getElementById("categoryFilter")?.addEventListener("change", render);
  document.getElementById("maxPriceFilter")?.addEventListener("input", render);
  render();
}

function requireSeller() {
  const user = currentUser();
  if (!user || user.type_compte !== "seller") {
    alert("AccÃ¨s vendeur requis.");
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
  const saveShopBtn = document.getElementById("saveShopBtn");
  const empty = document.getElementById("emptySellerProducts");

  // Charger les données à jour
  await syncData();

  setupFilesPreview("imageFiles", "imagePreviewList");
  setupFilesPreview("shopLogoFile", "shopLogoPreview");

  function getSellerShop() {
    return getShops().find((s) => s.vendeur_id === user.id) || null;
  }

  function fillShopForm() {
    const shop = getSellerShop();
    if (!shop) {
      renderUploadPreview("shopLogoPreview", []);
    return;
  }

    document.getElementById("shopNameInput").value = shop.nom || "";
    document.getElementById("shopDescriptionInput").value = shop.description || "";
    document.getElementById("shopLogoInput").value = shop.logo || "";
    document.getElementById("shopExternalLinkInput").value = shop.lien_site || "";
    renderUploadPreview("shopLogoPreview", shop.logo ? [shop.logo] : []);
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
        saveProducts(all);
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
        const all = getProducts();
        const filtered = all.filter((p) => p.id !== id);
        saveProducts(filtered);
        renderSellerProducts();
        deleteProductFirestore(id).then(async () => {
            await syncData();
            renderSellerProducts();
        });
      });
    });
  }

  saveShopBtn.addEventListener("click", async () => {
    const nom = document.getElementById("shopNameInput").value.trim();
    const description = document.getElementById("shopDescriptionInput").value.trim();
    const logoFromUrl = document.getElementById("shopLogoInput").value.trim();
    const lien_site = document.getElementById("shopExternalLinkInput").value.trim();

    if (!nom) {
      alert("Le nom de la boutique est obligatoire.");
      return;
    }

    let logoFromFile = "";
    try {
      const logos = await getImagesDataFromInput("shopLogoFile");
      logoFromFile = logos[0] || "";
    } catch (error) {
      alert(error.message);
      return;
    }

    const logo = logoFromFile || logoFromUrl;

    const shops = getShops();
    // Gestion création/update boutique
    let shop = getSellerShop();
    const shopData = {
        nom,
        description,
        logo,
        vendeur_id: user.id,
        contact_whatsapp: user.numero_whatsapp,
        lien_site
      };

    try {
        await saveShopToFirestore(shopData, shop ? shop.id : null);
        await syncData();
        renderUploadPreview("shopLogoPreview", logo ? [logo] : []);
        alert("Boutique enregistrée.");
    } catch(e) {
        alert("Erreur: " + e.message);
    }
  });

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

  fillShopForm();
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

  await syncData();

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
    return `
          <article class="card compact-card">
            <img src="${shop.logo || "https://placehold.co/640x360?text=Boutique"}" alt="${shop.nom}">
        <div class="card-body">
          <h4>${shop.nom}</h4>
              <p class="meta clamp-two">${shop.description || "Sans description"}</p>
          <p class="meta">${count} produit(s)</p>
          <div class="row-actions">
                <a class="link-btn" href="https://wa.me/${normalizePhone(shop.contact_whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="link-btn secondary" href="boutique.html?shop=${encodeURIComponent(shop.id)}">Voir les produits</a>
          </div>
        </div>
      </article>
    `;
      });

    container.innerHTML = byShop.join("");
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
}

async function setupProductDetailPage() {
  const page = document.body.dataset.page;
  if (page !== 'product') return;

  await syncData();

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
  description.textContent = product.description || "Sans description";
  mainImage.src = galleryImages[0];

  thumbnails.innerHTML = galleryImages
    .map((src, index) => `<img class="gallery-thumb ${index === 0 ? "active" : ""}" src="${src}" data-src="${src}" alt="Image ${index + 1}">`)
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
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
    
  if (!avatar || !nameInput || !phoneInput || !emailEl || !roleEl || !saveBtn) {
    return;
  }

  const logged = currentUser();
  if (!logged) {
    alert("Connectez-vous pour accÃ©der au profil.");
    window.location.href = "login.html";
    return;
  }

  function render(user) {
    avatar.src = user.photo_profil || "https://placehold.co/160x160?text=Profil";
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

  saveBtn.addEventListener("click", async () => {
    const nom = nameInput.value.trim();
    const numero_whatsapp = normalizePhone(phoneInput.value);
  
    if (!nom || !numero_whatsapp) {
      alert("Nom et téléphone sont obligatoires.");
      return;
    }

    let photoProfil = avatar.src;
    try {
      const imgs = await getImagesDataFromInput("profilePhotoFile");
      if (imgs[0]) {
        photoProfil = imgs[0];
      }
    } catch (error) {
      alert(error.message);
      return;
    }

    const users = getUsers();
    const user = users.find((u) => u.id === logged.id || u.email === logged.email);
    if (!user) {
      alert("Utilisateur introuvable.");
      return;
}

    user.nom = nom;
    user.numero_whatsapp = numero_whatsapp;
    user.photo_profil = photoProfil;

    saveUsers(users);
    write(STORAGE_KEYS.loggedUser, user);

    if (user.type_compte === "seller") {
      const shops = getShops();
      shops.forEach((s) => {
        if (s.vendeur_id === user.id) {
          s.contact_whatsapp = numero_whatsapp;
        }
      });
      saveShops(shops);

      const products = getProducts();
      products.forEach((p) => {
        if (p.vendeur_id === user.id) {
          p.phone = numero_whatsapp;
        }
      });
      saveProducts(products);
    }

    alert("Profil mis Ã  jour.");
    render(user);
    updateAuthLink(); // Mettre à jour le header immédiatement
    if (photoInput) {
      photoInput.value = "";
  }
  });

  // Gestion de la suppression de compte
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      if (confirm("⚠️ ATTENTION : Cette action est irréversible.\n\nVoulez-vous vraiment supprimer votre compte ?\nCela effacera définitivement votre profil, votre boutique et tous vos produits.")) {
        const userId = logged.id;

        // 1. Supprimer l'utilisateur
        const users = getUsers().filter((u) => u.id !== userId);
        saveUsers(users);

        // 2. Supprimer la boutique associée
        const shops = getShops().filter((s) => s.vendeur_id !== userId);
        saveShops(shops);

        // 3. Supprimer les produits et annonces
        const products = getProducts().filter((p) => p.vendeur_id !== userId);
        saveProducts(products);
        
        const occasions = getOccasionProducts().filter((p) => p.vendeur_id !== userId);
        saveOccasionProducts(occasions);

        // 4. Déconnexion et redirection
        write(STORAGE_KEYS.loggedUser, null);
        alert("Votre compte a été supprimé avec succès.");
        window.location.href = "index.html";
      }
    });
  }

  render(logged);

  // Ajouter la fonctionnalité "Mes produits"
  setupMyProducts();
  
  // Afficher la section boutique pour les vendeurs
  if (logged.type_compte === "seller") {
    const sellerSection = document.getElementById("sellerShopSection");
    if (sellerSection) {
      sellerSection.style.display = "block";
      setupSellerShop();
    }
  }
  
  // Ajouter les événements pour les photos de profil
  setupProfileImageModal();
}

async function setupMyProducts() {
  const container = document.getElementById("myProducts");
  const empty = document.getElementById("emptyMyProducts");
  
  if (!container) return;
  
  const user = currentUser();
  if (!user) return;
  
  await syncData();

  function renderMyProducts() {
    const regular = getProducts().filter(p => p.vendeur_id === user.id).map(mapRegularProduct);
    const occasion = getOccasionProducts().filter(p => p.vendeur_id === user.id).map(mapOccasionToMarketplace);
    const mapped = [...regular, ...occasion];
    
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
          saveProducts(allRegular);
        } else {
          // Sinon vérifier les produits d'occasion
          const allOccasion = getOccasionProducts();
          const targetOccasion = allOccasion.find(p => p.id === id && p.vendeur_id === user.id);
          if (targetOccasion) {
            // Mettre à jour le statut (utiliser 'status' pour la cohérence, même si 'statut' existe parfois)
            targetOccasion.status = targetOccasion.status === "sold" ? "available" : "sold";
            saveOccasionProducts(allOccasion);
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

        if (origin === 'occasion') {
          const all = getOccasionProducts();
          const filtered = all.filter(p => p.id !== id);
          saveOccasionProducts(filtered);
        } else {
          const all = getProducts();
          const filtered = all.filter(p => p.id !== id);
          saveProducts(filtered);
        }
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

  await syncData();
  
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
  const deleteShopBtn = document.getElementById("deleteShopBtn");
  
  // Récupérer la boutique existante
  const shops = getShops();
  const shop = shops.find(s => s.vendeur_id === user.id);
  
  // Remplir le formulaire si la boutique existe
  if (shop) {
    document.getElementById("shopNameInput").value = shop.nom || "";
    document.getElementById("shopDescriptionInput").value = shop.description || "";
    document.getElementById("shopLogoInput").value = shop.logo || "";
    document.getElementById("shopExternalLinkInput").value = shop.lien_site || "";
    if (shopLogoDisplay && shop.logo) {
      shopLogoDisplay.src = shop.logo;
    }

    // Afficher le bouton supprimer si la boutique existe
    if (deleteShopBtn) deleteShopBtn.style.display = "block";
  } else {
    // Cacher le bouton supprimer si pas de boutique
    if (deleteShopBtn) deleteShopBtn.style.display = "none";
  }
  
  // Mettre à jour la photo de profil avec le logo de la boutique
  if (shopLogoDisplay && shop && shop.logo) {
    const profileAvatar = document.getElementById("profileAvatar");
    if (profileAvatar) {
      profileAvatar.src = shop.logo;
    }
  }
  
  // Gérer la sauvegarde de la boutique
  if (saveShopBtn) {
    saveShopBtn.addEventListener("click", () => {
      const nom = document.getElementById("shopNameInput").value.trim();
      const description = document.getElementById("shopDescriptionInput").value.trim();
      const logo = document.getElementById("shopLogoInput").value.trim();
      const lien_site = document.getElementById("shopExternalLinkInput").value.trim();
      
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
      
      // Mettre à jour ou créer la boutique
      const allShops = getShops();
      let targetShop = allShops.find(s => s.vendeur_id === user.id);
      
      if (!targetShop) {
        targetShop = {
          id: uid("shop"),
          vendeur_id: user.id,
          contact_whatsapp: user.numero_whatsapp,
          date_creation: new Date().toISOString()
        };
        allShops.push(targetShop);
      }
      
      targetShop.nom = nom;
      targetShop.description = description;
      targetShop.logo = logo;
      targetShop.lien_site = lien_site;
      targetShop.additional_emails = additionalEmails;
      targetShop.additional_whatsapps = additionalWhatsapps;
      
      saveShops(allShops);
      
      // Mettre à jour la photo de profil
      if (shopLogoDisplay && logo) {
        shopLogoDisplay.src = logo;
        const profileAvatar = document.getElementById("profileAvatar");
        if (profileAvatar) {
          profileAvatar.src = logo;
        }
      }
      
      updateAuthLink(); // Mettre à jour le header avec le nouveau logo
      alert("Boutique enregistrée avec succès !");
    });
  }

  // Gestion de la suppression de boutique
  if (deleteShopBtn) {
    deleteShopBtn.addEventListener("click", () => {
      if (confirm("Voulez-vous vraiment supprimer votre boutique ?\n\nVos produits resteront visibles mais ne seront plus associés à une page boutique.")) {
        const allShops = getShops().filter((s) => s.vendeur_id !== user.id);
        saveShops(allShops);

        // Optionnel : Désassocier les produits de la boutique supprimée
        const products = getProducts();
        products.forEach((p) => {
          if (p.vendeur_id === user.id) {
            p.boutique_id = "";
            p.shopId = "";
          }
        });
        saveProducts(products);

        alert("Boutique supprimée avec succès.");
        window.location.reload();
      }
    });
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
      case 'home-no-connexion':
        window.location.href = 'home.html';
        return;
      case 'occasion-no-connexion':
        window.location.href = 'occasion.html';
        return;
      case 'boutique-no-connexion':
        window.location.href = 'boutique.html';
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
      case 'occasion':    // occasion.html
      case 'boutique':    // boutique.html
      case 'dashboard':   // dashboard.html
      case 'publication': // publication.html
      case 'profile':     // profile.html
      case 'product':     // product.html
        window.location.href = 'login.html';
        return;
    }
  }

  // Chargement global initial des données Firestore
  await syncData();

  ensureMenu();
  updateAuthLink();
  setupRegister();
  setupLogin();
  setupPasswordToggle();
  setupPasswordValidation();
  setupHome();
  setupDashboard();
  setupBoutiquePage();
  setupPublication();
  setupOccasionPage();
  setupProductDetailPage();
  setupCartPage();
  setupProfilePage();
  setupSidebarCart(); // Ajout du panier latéral
  updateCartCountUI();
}

document.addEventListener("DOMContentLoaded", bootstrap);
