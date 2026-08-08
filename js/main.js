// Configuration
const WHATSAPP_NUMBER = '917414926847'; // Indian number with country code (91)

// Helper: format INR
function formatINR(n){
  return '₹' + n.toLocaleString('en-IN');
}

// Products are loaded from products.json at runtime.
// `products` will be populated by `loadProducts()`.
let products = [];

const PUBLIC_IMAGE_BASE = (typeof location !== 'undefined' && location.origin && location.origin !== 'null')
  ? location.origin
  : 'https://swarnasundari.netlify.app';

function normalizeImagePath(path){
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '');
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildImageUrl(path){
  const normalized = normalizeImagePath(path);
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return new URL(normalized, PUBLIC_IMAGE_BASE + '/').href;
}

// Apply randomized discounts (30-50%) to a few random products for marketing
function randomizeDiscounts(count=4){
  if(!Array.isArray(products) || products.length===0) return;
  const ids = [];
  while(ids.length < Math.min(count, products.length)){
    const idx = Math.floor(Math.random()*products.length);
    if(!ids.includes(idx)) ids.push(idx);
  }
  ids.forEach(i=>{
    const pct = 30 + Math.floor(Math.random()*21); // 30-50
    products[i].discount = pct;
  });
}

// Load products from JSON
async function loadProducts(){
  try{
    const res = await fetch('products.json', {cache: 'no-store'});
    if(!res.ok) throw new Error('Failed to load products.json');
    products = await res.json();
    if(Array.isArray(products)){
      products = products.map(p=>({
        ...p,
        image: normalizeImagePath(p.image || ''),
        imageUrl: p.imageUrl || buildImageUrl(p.image || '')
      }));
    }
    randomizeDiscounts(4);
    populateFilterOptions();
    renderProducts(products);
  }catch(err){
    console.error('Could not load products.json, falling back to empty list.',err);
    products = [];
    renderProducts(products);
  }
}

function populateFilterOptions(){
  if(!filterSelect) return;
  const cats = Array.from(new Set(products.map(p=>p.category))).sort();
  filterSelect.innerHTML = '<option value="all">All categories</option>' + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  // render mobile chips
  const chipRow = document.getElementById('chipRow');
  if(chipRow){
    const all = ['All', ...cats];
    chipRow.innerHTML = all.map((c,i)=>`<button role="tab" aria-selected="${i===0}" data-cat="${escapeHtml(c==='All'?'all':c)}" class="chip ${i===0?'active':''}">${escapeHtml(c)}</button>`).join('');
    chipRow.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button[data-cat]');
      if(!btn) return;
      const cat = btn.getAttribute('data-cat');
      // update active
      chipRow.querySelectorAll('.chip').forEach(b=>{ b.classList.toggle('active', b===btn); b.setAttribute('aria-selected', b===btn); });
      // sync select and filter
      if(filterSelect) filterSelect.value = cat;
      if(searchInput) searchInput.value = '';
      applySearchFilter();
      // on small screens, scroll products into view
      if(window.innerWidth < 800){
        const grid = document.getElementById('productsGrid');
        grid && grid.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
  }
}

function bindChipToggle(){
  const toggle = document.getElementById('chipToggle');
  const shell = document.querySelector('.chip-row-shell');
  if(!toggle || !shell) return;
  toggle.addEventListener('click', ()=>{
    const expanded = shell.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.textContent = expanded ? 'Show fewer categories' : 'Show more categories';
  });
}

// DOM references
const productGrid = document.getElementById('productsGrid');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');

function createProductCard(p){
  const card = document.createElement('article');
  card.className='card fade-in';
  const hasDiscount = p.discount && p.discount > 0;
  const discountedPrice = hasDiscount ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
  const imageSrc = p.imageUrl || p.image;
  card.innerHTML = `
    <div style="position:relative">
      <img data-src="${escapeHtml(imageSrc)}" alt="${escapeHtml(p.name)}" class="lazy" onclick="openLightbox(this)">
      ${hasDiscount ? `<div class="badge" style="position:absolute;left:12px;top:12px;background:linear-gradient(90deg,var(--gold),var(--gold-dark));color:#111">-${escapeHtml(p.discount)}%</div>` : ''}
    </div>
    <div class="card-body">
      <span class="badge">Premium</span>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div style="margin:8px 0">
        ${hasDiscount ? `<div style="font-size:14px;color:#888;text-decoration:line-through">${formatINR(p.price)}</div><div style="font-size:18px;font-weight:700;color:var(--gold-dark)">${formatINR(discountedPrice)}</div>` : `<div style="font-size:18px;font-weight:700;color:var(--gold-dark)">${formatINR(p.price)}</div>`}
      </div>
      <div class="actions">
        <small>${escapeHtml(p.category)}</small>
      </div>
      <div style="padding:12px">
        <button class="btn btn-primary btn-card-cta" onclick='enquire(${p.id})'>Enquire on WhatsApp</button>
      </div>
    </div>
  `;
  return card;
}

function renderProducts(list){
  productGrid.innerHTML='';
  list.forEach(p=>productGrid.appendChild(createProductCard(p)));
  observeFadeIns();
  lazyLoadImages();
}

function enquire(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  enquireProduct(p.name, p.category, p.discount && p.discount>0 ? `${formatINR(Math.round(p.price*(1-p.discount/100)))} (was ${formatINR(p.price)})` : formatINR(p.price), p.imageUrl || p.image);
}

function enquireProduct(name, category, priceText, imagePath){
  const phone = WHATSAPP_NUMBER;
  const imageUrl = buildImageUrl(imagePath);
  const lines = [
    'Hello, I am interested in this product.',
    '',
    `Product Name: ${name}`,
    `Category: ${category}`,
    `Price: ${priceText}`,
    `Image: ${imageUrl}`,
    '',
    'Please share price and availability.'
  ];
  const msg = encodeURIComponent(lines.join('\n'));
  const url = `https://wa.me/${phone}?text=${msg}`;
  window.open(url,'_blank');
}

// Header scroll: add glassmorphism on scroll
const headerEl = document.querySelector('.header');
window.addEventListener('scroll',()=>{
  if(window.scrollY>60) headerEl && headerEl.classList.add('scrolled'); else headerEl && headerEl.classList.remove('scrolled');
});

// Search & filter
function applySearchFilter(){
  const q = searchInput.value.trim().toLowerCase();
  const f = filterSelect.value;
  const filtered = products.filter(p=>{
    const matchesQ = p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    const matchesF = f==='all' ? true : p.category===f;
    return matchesQ && matchesF;
  });
  renderProducts(filtered);
}

searchInput.addEventListener('input',applySearchFilter);
filterSelect.addEventListener('change',applySearchFilter);

// Fade-in on scroll
function observeFadeIns(){
  const items = document.querySelectorAll('.fade-in');
  const io = new IntersectionObserver((entries,obs)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('visible'); obs.unobserve(e.target); } });
  },{threshold:0.12});
  items.forEach(i=>io.observe(i));
}

// Sticky nav toggle for mobile
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.querySelector('.nav-links');
if(menuToggle){ menuToggle.addEventListener('click',()=>{ navLinks.classList.toggle('open'); }) }

// Scroll helpers for bottom navigation
function getScrollRoot(){
  return document.scrollingElement || document.body || document.documentElement;
}
function setScrollPosition(top){
  const root = getScrollRoot();
  if(root && typeof root.scrollTo==='function'){
    root.scrollTo({top,behavior:'smooth'});
  }
  if(window && typeof window.scrollTo==='function'){
    window.scrollTo({top,behavior:'smooth'});
  }
  if(document.body){
    document.body.scrollTop = top;
  }
  if(document.documentElement){
    document.documentElement.scrollTop = top;
  }
}
function scrollToTop(){
  setScrollPosition(0);
}
function scrollToCategories(){
  const categories = document.getElementById('categories') || document.getElementById('productsGrid');
  if(categories){
    const rect = categories.getBoundingClientRect();
    const top = rect.top + (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
    setScrollPosition(top);
  } else {
    scrollToTop();
  }
}
function scrollToContact(){
  const contact = document.getElementById('contact');
  if(contact){
    const rect = contact.getBoundingClientRect();
    const top = rect.top + (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
    setScrollPosition(top);
  } else {
    setScrollPosition(document.body.scrollHeight || document.documentElement.scrollHeight || 0);
  }
}

// Scroll to top button
const toTop = document.getElementById('toTop');
window.addEventListener('scroll',()=>{ if(window.scrollY>400) toTop.style.display='block'; else toTop.style.display='none'; });
toTop.addEventListener('click',()=>scrollToTop());

// Floating WhatsApp button
function bindFloatWA(){
  const el = document.getElementById('floatWA');
  if(!el) return;
  el.addEventListener('click',()=>{
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello, I would like to enquire about your jewellery collection.')}`;
    window.open(url,'_blank');
  });
}
bindFloatWA();
// if element is injected later, try again
setTimeout(bindFloatWA, 600);

// Lazy load images using IntersectionObserver
function lazyLoadImages(){
  const imgs = document.querySelectorAll('img.lazy');
  if('IntersectionObserver' in window){
    const iob = new IntersectionObserver((entries,obs)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy');
          obs.unobserve(img);
        }
      });
    },{rootMargin:'200px'});
    imgs.forEach(i=>iob.observe(i));
  }else{
    imgs.forEach(i=>{ i.src = i.dataset.src; i.classList.remove('lazy'); });
  }
}

// Hide preloader when ready
document.addEventListener('DOMContentLoaded',()=>{
  const pre = document.getElementById('preloader');
  if(pre){ setTimeout(()=>pre.classList.add('hidden'),400); }
  bindChipToggle();
});

// Initial render: load products.json then render
document.addEventListener('DOMContentLoaded',()=>{
  loadProducts();
});

// Ensure compact sticky header and non-overlapping chips on small screens
function enforceMobileHeader(){
  const hdr = document.getElementById('siteHeader');
  const main = document.querySelector('main');
  if(!hdr || !main) return;
  if(window.innerWidth <= 820){
    hdr.classList.remove('transparent');
    hdr.style.height = '50px';
    hdr.style.background = '#fff8f0';
    hdr.style.zIndex = '120';
    // ensure main content sits below header
    main.style.paddingTop = hdr.offsetHeight + 'px';
  }else{
    hdr.style.height = '';
    hdr.style.background = '';
    hdr.style.zIndex = '';
    main.style.paddingTop = '';
  }
}
window.addEventListener('resize', enforceMobileHeader);
document.addEventListener('DOMContentLoaded', enforceMobileHeader);

// Lightbox functionality
let lightboxImages = [];
let currentLbIndex = -1;

function buildLightboxList(){
  lightboxImages = Array.from(document.querySelectorAll('.gallery img, .card img')).map(img=>({src:img.src||img.dataset.src,alt:img.alt||''}));
}

function openLightbox(imgEl){
  const src = imgEl.src || imgEl.dataset.src;
  buildLightboxList();
  currentLbIndex = lightboxImages.findIndex(i=>i.src===src);
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-image');
  const lbCaption = document.getElementById('lb-caption');
  lbImg.src = src;
  lbImg.alt = imgEl.alt || '';
  lbCaption.textContent = imgEl.alt || '';
  lb.classList.add('open');
  lb.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}

function closeLightbox(){
  const lb = document.getElementById('lightbox');
  lb.classList.remove('open');
  lb.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

function prevLightbox(){
  if(currentLbIndex<=0) return;
  currentLbIndex--;
  const img = lightboxImages[currentLbIndex];
  document.getElementById('lb-image').src = img.src;
  document.getElementById('lb-caption').textContent = img.alt || '';
}

function nextLightbox(){
  if(currentLbIndex>=lightboxImages.length-1) return;
  currentLbIndex++;
  const img = lightboxImages[currentLbIndex];
  document.getElementById('lb-image').src = img.src;
  document.getElementById('lb-caption').textContent = img.alt || '';
}

// Keyboard support
document.addEventListener('keydown',(e)=>{
  const lb = document.getElementById('lightbox');
  if(!lb || !lb.classList.contains('open')) return;
  if(e.key==='Escape') closeLightbox();
  if(e.key==='ArrowLeft') prevLightbox();
  if(e.key==='ArrowRight') nextLightbox();
});

// Attach click handlers for gallery images that are static (not lazy)
document.addEventListener('click',(e)=>{
  const t = e.target;
  if(t && t.tagName==='IMG' && t.closest('.gallery')){ openLightbox(t); }
});
