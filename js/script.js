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
  if (!authLink) return;

  const user = currentUser();
  if (user) {
    authLink.textContent = "DÃ©connexion";
    authLink.href = "#";
    authLink.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(STORAGE_KEYS.loggedUser);
      window.location.reload();
    });
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
    id: item.id,
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
    category: "Occasion",
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

function updateCartCountUI() {
  document.querySelectorAll("#cartCount").forEach((el) => {
    el.textContent = String(getCartCount());
  });
}

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

function buildOrderMessage(template, item) {
  const total = Number(item.price || 0) * Number(item.quantity || 1);

  if (template === "livraison") {
    return [
      "Bonjour,",
      `Je souhaite commander: ${item.name}.`,
      `QuantitÃ©: ${item.quantity}.`,
      `Montant estimÃ©: ${formatPrice(total)}.`,
      "Pouvez-vous confirmer la disponibilitÃ©, le mode de livraison et le dÃ©lai ?",
      "Merci."
    ].join("\n");
  }

  if (template === "reservation") {
    return [
      "Bonjour,",
      `Je souhaite rÃ©server le produit suivant: ${item.name}.`,
      `QuantitÃ©: ${item.quantity}.`,
      `Budget: ${formatPrice(total)}.`,
      "Merci de me confirmer la rÃ©servation et les prochaines Ã©tapes.",
      "Merci."
    ].join("\n");
  }

  return [
    "Bonjour,",
    `Je souhaite commander le produit: ${item.name}.`,
    `QuantitÃ©: ${item.quantity}.`,
    `Montant estimÃ©: ${formatPrice(total)}.`,
    "Merci de me confirmer la disponibilitÃ©.",
    "Cordialement."
  ].join("\n");
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
    ? `<a class="shop-snippet" href="boutique.html?shop=${encodeURIComponent(shop.id)}"><img src="${shop.logo || "https://placehold.co/48x48?text=S"}" alt="${shop.nom}"><span>${shop.nom}</span></a>`
    : "";

  const sourceAction = normalized.isOccasion
    ? `<a class="link-btn secondary" href="occasion.html">Annonce occasion</a>`
    : `<a class="link-btn secondary" href="boutique.html${shopParam}">Boutique</a>`;

  const cartAction = !normalized.isOccasion
    ? `<button class="secondary" data-action="add-cart" data-id="${normalized.id}" type="button">Ajouter au panier</button>`
    : "";

  const whatsappHref = normalized.isOccasion
    ? `https://wa.me/${normalizePhone(normalized.phone)}?text=${encodeURIComponent(buildOccasionWhatsappMessage(normalized))}`
    : `https://wa.me/${normalizePhone(normalized.phone)}`;

  return `
    <article class="card compact-card">
      <a class="card-image-link" href="${galleryUrl}">
        <img src="${coverImage}" alt="${normalized.name}">
      </a>
      <div class="card-body">
        ${shopSnippet}
        <span class="tag ${isSold ? "sold" : ""}">${isSold ? "Vendu" : "Disponible"}</span>
        <h4><a class="product-title-link" href="${galleryUrl}">${normalized.name}</a></h4>
        <p class="meta">${formatPrice(normalized.price)} â€¢ ${normalized.category || "Autre"}</p>
        <p class="meta clamp-two">${normalized.description || "Sans description"}</p>
        <div class="row-actions">
          <a class="link-btn" href="${whatsappHref}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="link-btn secondary" href="${galleryUrl}">Galerie</a>
          ${sourceAction}
          ${cartAction}
          ${opts.sellerActions ? `<button class="warning" data-action="toggle-sold" data-id="${normalized.id}">${isSold ? "Remettre disponible" : "Marquer vendu"}</button>` : ""}
        </div>
      </div>
    </article>
  `;
}
function getUsers() {
  return read(STORAGE_KEYS.users, []);
}

function saveUsers(users) {
  write(STORAGE_KEYS.users, users);
}

function getProducts() {
  return read(STORAGE_KEYS.products, []);
}

function saveProducts(products) {
  write(STORAGE_KEYS.products, products);
}

function getShops() {
  return read(STORAGE_KEYS.shops, []);
}

function saveShops(shops) {
  write(STORAGE_KEYS.shops, shops);
}

function getOccasionProducts() {
  return read(STORAGE_KEYS.occasionProducts, []);
}

function saveOccasionProducts(products) {
  write(STORAGE_KEYS.occasionProducts, products);
}

function getMarketplaceProducts() {
  const regular = getProducts().map(mapRegularProduct);
  const occasion = getOccasionProducts().map(mapOccasionToMarketplace);
  return [...regular, ...occasion];
}

function setupRegister() {
  const btn = document.getElementById("registerBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const whatsapp = normalizePhone(document.getElementById("whatsapp").value);
    const role = document.getElementById("role").value;

    if (!name || !email || !password || !whatsapp) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    const users = getUsers();
    if (users.some((u) => u.email === email)) {
      alert("Cet email existe dÃ©jÃ .");
      return;
    }

    const user = {
      id: uid("user"),
      nom: name,
      email,
      mot_de_passe: password,
      numero_whatsapp: whatsapp,
      type_compte: role,
      photo_profil: "",
      date_creation: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);
    alert("Compte crÃ©Ã© avec succÃ¨s.");
    window.location.href = "login.html";
  });
}

function setupLogin() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const user = getUsers().find(
      (u) => u.email === email && u.mot_de_passe === password
    );

    if (!user) {
      alert("Email ou mot de passe incorrect.");
      return;
    }

    write(STORAGE_KEYS.loggedUser, user);
    if (user.type_compte === "seller") {
      window.location.href = "dashboard.html";
      return;
    }
    window.location.href = "index.html";
  });
}

function setupHome() {
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
      const byCategory = !category || p.category === category;
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

function setupDashboard() {
  const list = document.getElementById("productList");
  if (!list) return;

  const user = requireSeller();
  if (!user) return;

  const addProductBtn = document.getElementById("addProductBtn");
  const saveShopBtn = document.getElementById("saveShopBtn");
  const empty = document.getElementById("emptySellerProducts");

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
    const products = getProducts()
      .filter((p) => p.vendeur_id === user.id)
      .map(mapRegularProduct);

    list.innerHTML = products.map((p) => renderProductCard(p, { sellerActions: true })).join("");
    empty.style.display = products.length ? "none" : "block";

    list.querySelectorAll("button[data-action='toggle-sold']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const all = getProducts();
        const target = all.find((p) => p.id === id && p.vendeur_id === user.id);
        if (!target) return;
        target.status = target.status === "sold" ? "available" : "sold";
        saveProducts(all);
        renderSellerProducts();
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
    let shop = shops.find((s) => s.vendeur_id === user.id);

    if (!shop) {
      shop = {
        id: uid("shop"),
        nom,
        description,
        logo,
        vendeur_id: user.id,
        contact_whatsapp: user.numero_whatsapp,
        lien_site
      };
      shops.push(shop);
    } else {
      shop.nom = nom;
      shop.description = description;
      shop.logo = logo;
      shop.lien_site = lien_site;
      shop.contact_whatsapp = user.numero_whatsapp;
    }

    saveShops(shops);
    renderUploadPreview("shopLogoPreview", logo ? [logo] : []);
    alert("Boutique enregistrÃ©e.");
  });

  addProductBtn.addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const description = document.getElementById("description").value.trim();
    const price = Number(document.getElementById("price").value || 0);
    const category = document.getElementById("category").value;

    const shop = getSellerShop();
    if (!shop) {
      alert("CrÃ©ez d'abord votre boutique.");
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
      alert("Veuillez sÃ©lectionner au moins une image depuis vos dossiers.");
      return;
    }

    const all = getProducts();
    all.push({
      id: uid("product"),
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
      status: "available"
    });

    saveProducts(all);
    renderSellerProducts();
    alert("Produit ajoutÃ©.");

    document.getElementById("name").value = "";
    document.getElementById("description").value = "";
    document.getElementById("price").value = "";
    document.getElementById("category").value = "TÃ©lÃ©phone";
    resetFilesPreview("imageFiles", "imagePreviewList");
  });

  fillShopForm();
  renderSellerProducts();
}

function setupBoutiquePage() {
  const container = document.getElementById("shopProducts");
  if (!container) return;

  const empty = document.getElementById("emptyShopProducts");
  const title = document.getElementById("shopName");
  const searchInput = document.getElementById("boutiqueSearchInput");
  const searchBtn = document.getElementById("boutiqueSearchBtn");
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get("shop");

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
function setupOccasion() {
  const publishBtn = document.getElementById("publishOccasionBtn");
  const list = document.getElementById("occasionList");
  if (!publishBtn || !list) return;

  const empty = document.getElementById("emptyOccasion");

  setupFilesPreview("occImageFiles", "occImagePreviewList");

  function render() {
    const items = getOccasionProducts().map(mapOccasionToMarketplace);
    list.innerHTML = items.map((item) => renderProductCard(item)).join("");
    empty.style.display = items.length ? "none" : "block";
  }

  publishBtn.addEventListener("click", async () => {
    const nom = document.getElementById("occName").value.trim();
    const description = document.getElementById("occDescription").value.trim();
    const prix = Number(document.getElementById("occPrice").value || 0);
    const numero_whatsapp = normalizePhone(document.getElementById("occPhone").value);

    if (!nom || !prix || !numero_whatsapp) {
      alert("Nom, prix et WhatsApp sont obligatoires.");
      return;
    }

    let images = [];
    try {
      images = await getImagesDataFromInput("occImageFiles");
    } catch (error) {
      alert(error.message);
      return;
    }

    if (!images.length) {
      alert("Veuillez sÃ©lectionner au moins une image depuis vos dossiers.");
      return;
    }

    const items = getOccasionProducts();
    items.unshift({
      id: uid("occ"),
      nom,
      description,
      prix,
      image: images[0],
      images,
      numero_whatsapp,
      statut: "available",
      date_publication: new Date().toISOString()
    });

    saveOccasionProducts(items);
    render();

    document.getElementById("occName").value = "";
    document.getElementById("occDescription").value = "";
    document.getElementById("occPrice").value = "";
    document.getElementById("occPhone").value = "";
    resetFilesPreview("occImageFiles", "occImagePreviewList");
  });

  render();
}

function setupProductGallery() {
  const title = document.getElementById("galleryTitle");
  const meta = document.getElementById("galleryMeta");
  const description = document.getElementById("galleryDescription");
  const mainImage = document.getElementById("galleryMainImage");
  const thumbnails = document.getElementById("galleryThumbnails");
  const whatsapp = document.getElementById("galleryWhatsapp");
  const source = document.getElementById("gallerySource");
  const addToCartBtn = document.getElementById("galleryAddToCart");
  const notFound = document.getElementById("galleryNotFound");

  if (!title || !meta || !description || !mainImage || !thumbnails || !whatsapp || !source || !notFound) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const origin = params.get("origin");

  function findProduct() {
    if (!id) return null;

    if (origin === "occasion") {
      const fromOccasion = getOccasionProducts().find((item) => item.id === id);
      if (fromOccasion) return mapOccasionToMarketplace(fromOccasion);
    }

    if (origin === "regular") {
      const fromRegular = getProducts().find((item) => item.id === id);
      if (fromRegular) return mapRegularProduct(fromRegular);
    }

    const regularFallback = getProducts().find((item) => item.id === id);
    if (regularFallback) return mapRegularProduct(regularFallback);

    const occasionFallback = getOccasionProducts().find((item) => item.id === id);
    if (occasionFallback) return mapOccasionToMarketplace(occasionFallback);

    return null;
  }

  const product = findProduct();

  if (!product) {
    title.textContent = "Produit introuvable";
    meta.textContent = "";
    description.textContent = "";
    mainImage.classList.add("hidden");
    thumbnails.classList.add("hidden");
    whatsapp.classList.add("hidden");
    source.classList.add("hidden");
    if (addToCartBtn) addToCartBtn.classList.add("hidden");
    notFound.classList.remove("hidden");
    return;
  }

  const images = normalizeImageArray(product.images, product.image);
  const galleryImages = images.length ? images : [PLACEHOLDER_IMAGE];

  title.textContent = product.name;
  meta.textContent = `${formatPrice(product.price)} â€¢ ${product.category || "Autre"} â€¢ ${product.status === "sold" ? "Vendu" : "Disponible"}`;
  description.textContent = product.description || "Sans description";
  mainImage.src = galleryImages[0];
  mainImage.classList.remove("hidden");

  thumbnails.innerHTML = galleryImages
    .map((src, index) => `<img class="gallery-thumb ${index === 0 ? "active" : ""}" src="${src}" data-src="${src}" alt="Image ${index + 1}">`)
    .join("");
  thumbnails.classList.remove("hidden");

  thumbnails.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const src = thumb.getAttribute("data-src") || "";
      if (src) {
        mainImage.src = src;
      }

      thumbnails.querySelectorAll(".gallery-thumb").forEach((el) => el.classList.remove("active"));
      thumb.classList.add("active");
    });
  });

  const whatsappMessage = product.isOccasion
    ? `?text=${encodeURIComponent(buildOccasionWhatsappMessage(product))}`
    : "";
  whatsapp.href = `https://wa.me/${normalizePhone(product.phone)}${whatsappMessage}`;
  whatsapp.classList.remove("hidden");

  if (product.isOccasion) {
    source.href = "occasion.html";
    source.textContent = "Voir sur Occasion";
    if (addToCartBtn) {
      addToCartBtn.classList.add("hidden");
    }
  } else {
    const shopParam = product.shopId ? `?shop=${encodeURIComponent(product.shopId)}` : "";
    source.href = `boutique.html${shopParam}`;
    source.textContent = "Voir la boutique";

    if (addToCartBtn) {
      addToCartBtn.classList.remove("hidden");
      addToCartBtn.addEventListener("click", () => addToCart(product));
    }
  }

  source.classList.remove("hidden");
}

function setupCartPage() {
  const container = document.getElementById("cartItems");
  if (!container) return;

  const empty = document.getElementById("emptyCart");
  const totalEl = document.getElementById("cartTotal");
  const templateEl = document.getElementById("orderTemplate");
  const clearBtn = document.getElementById("clearCartBtn");

  function render() {
    const items = getCartItems();

    if (!items.length) {
      container.innerHTML = "";
      empty.style.display = "block";
      totalEl.textContent = "Total: 0 FCFA";
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
      alert("Nom et tÃ©lÃ©phone sont obligatoires.");
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
    if (photoInput) {
      photoInput.value = "";
    }
  });

  render(logged);
}
function bootstrap() {
  ensureMenu();
  updateAuthLink();
  setupRegister();
  setupLogin();
  setupHome();
  setupDashboard();
  setupBoutiquePage();
  setupOccasion();
  setupProductGallery();
  setupCartPage();
  setupProfilePage();
  updateCartCountUI();
}

document.addEventListener("DOMContentLoaded", bootstrap);





