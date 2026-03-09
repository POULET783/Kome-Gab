// cript-new.js
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/80x80";
const STORAGE_KEYS = { cart: "komegab_cart", profile: "komegab_profile" };

/* ===================================
   FONCTIONS DE STOCKAGE
   =================================== */
function cartStorageKey() {
  return STORAGE_KEYS.cart;
}

function getCartItems() {
  try {
    return JSON.parse(localStorage.getItem(cartStorageKey())) || [];
  } catch (e) {
    console.error("Erreur lecture panier:", e);
    return [];
  }
}

function saveCartItems(items) {
  try {
    localStorage.setItem(cartStorageKey(), JSON.stringify(items));
  } catch (e) {
    console.error("Erreur sauvegarde panier:", e);
  }
}

function getCartCount() {
  return getCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

/* ===================================
   FONCTIONS DE PRIX
   =================================== */
function formatPrice(price) {
  const num = Number(price) || 0;
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/* ===================================
   FONCTIONS WHATSAPP
   =================================== */
function normalizePhone(phone) {
  if (!phone) return "237699999999";
  return phone.replace(/[^0-9]/g, "").replace(/^0+/, "") || "237699999999";
}

function buildMultipleOrderMessage(template, items) {
  if (!items || items.length === 0) return "";

  let message = "";
  const shopName = items[0].shopName || "Kome-Gab";
  const shopPhone = items[0].phone || "237699999999";

  switch (template) {
    case "livraison":
      message = `🚚 *COMMANDE AVEC LIVRAISON*\n\n*Magasin:* ${shopName}\n*Contact:* ${shopPhone}\n\n*📦 Produits commandés:*\n`;
      break;
    case "reservation":
      message = `🔒 *RÉSERVATION PRODUITS*\n\n*Magasin:* ${shopName}\n*Contact:* ${shopPhone}\n\n*📦 Produits à réserver:*\n`;
      break;
    default:
      message = `🛒 *COMMANDE PRODUITS*\n\n*Magasin:* ${shopName}\n*Contact:* ${shopPhone}\n\n*📦 Produits commandés:*\n`;
  }

  items.forEach((item, index) => {
    const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
    message += `${index + 1}. *${item.name}*\n   • Quantité: ${item.quantity}\n   • Prix: ${formatPrice(item.price)} FCFA\n   • Sous-total: ${formatPrice(lineTotal)} FCFA\n\n`;
  });

  const total = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  message += `💰 *Total général: ${formatPrice(total)} FCFA*\n\n`;

  switch (template) {
    case "livraison":
      message += `📍 *Adresse de livraison:* [Votre adresse]\n⏰ *Disponibilité:* [Précisez quand vous êtes disponible]\n\n`;
      break;
    case "reservation":
      message += `⏰ *Date de retrait souhaitée:* [Précisez la date]\n👤 *Nom complet:* [Votre nom]\n\n`;
      break;
  }

  message += `✅ *Merci pour votre confiance!*`;
  return message;
}

/* ===================================
   GESTION DU PANIER
   =================================== */
function updateCartQuantity(productId, delta) {
  const items = getCartItems();
  const item = items.find(i => i.productId === productId);
  
  if (item) {
    item.quantity = Math.max(1, Number(item.quantity || 1) + delta);
    saveCartItems(items);
    updateCartCountUI();
  }
}

function removeFromCart(productId) {
  const items = getCartItems();
  const filtered = items.filter(i => i.productId !== productId);
  saveCartItems(filtered);
  updateCartCountUI();
}

function clearCart() {
  saveCartItems([]);
  updateCartCountUI();
}

/* ===================================
   SETUP DU PANIER LATERAL
   =================================== */
function setupSidebarCart() {
  const container = document.getElementById("cartSidebarContainer");
  if (!container) return;

  fetch("smart-wagon.html")
    .then(response => response.text())
    .then(html => {
      container.innerHTML = html;
      initializeSmartWagon();
    })
    .catch(error => {
      console.error("Erreur chargement panier:", error);
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

  // Fonction toggle du panier
  window.toggleCart = function() {
    wagon?.classList.toggle("active");
    overlay?.classList.toggle("active");
  };

  // Fonction render du panier
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
      return `
        <li>
          <img src="${item.image || PLACEHOLDER_IMAGE}" alt="${item.name}">
          <div class="cart-item-details">
            <h4>${item.name}</h4>
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
      clearCart();
      renderSmartWagon();
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

/* ===================================
   FONCTIONS PRODUITS
   =================================== */
function mapRegularProduct(product) {
  return {
    productId: product.id || product.productId || `product_${Date.now()}`,
    name: product.name || product.title || "Produit",
    price: Number(product.price) || 0,
    quantity: Number(product.quantity) || 1,
    image: product.image || product.imageUrl || PLACEHOLDER_IMAGE,
    shopName: product.shopName || "Kome-Gab",
    phone: product.phone || "237699999999",
    description: product.description || ""
  };
}

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
  const existing = items.find(i => i.productId === normalized.productId);

  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + Number(normalized.quantity || 1);
  } else {
    items.push(normalized);
  }

  saveCartItems(items);
  updateCartCountUI();
  
  // Notification visuelle
  const badge = document.getElementById("cartBadge");
  if (badge) {
    badge.style.transform = "scale(1.3)";
    setTimeout(() => {
      badge.style.transform = "scale(1)";
    }, 200);
  }
}

/* ===================================
   INITIALISATION PRINCIPALE
   =================================== */
document.addEventListener('DOMContentLoaded', function() {
  // Initialiser le panier
  setupSidebarCart();
  
  // Mettre à jour les compteurs
  updateCartCountUI();
});

/* ===================================
   FONCTIONS D'INITIALISATION DES PAGES
   =================================== */
function setupProductGallery() {
  // À implémenter si nécessaire
}

function setupCartPage() {
  // À implémenter si nécessaire
}

function setupProfilePage() {
  // À implémenter si nécessaire
}

/* ===================================
   EXPORT GLOBAL
   =================================== */
window.komegab = {
  addToCart,
  removeFromCart,
  clearCart,
  getCartItems,
  getCartCount,
  updateCartCountUI,
  toggleCart
};
