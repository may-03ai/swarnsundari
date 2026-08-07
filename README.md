<<<<<<< HEAD
# swarnasundari
=======
Svarnsundari — Premium 1 Gram Gold Jewellery (Static Site)

Project structure:
- index.html
- css/style.css
- js/main.js
- assets/images/ (place product & hero images here)
- assets/icons/

Configuration:
- Open `js/main.js` and set `WHATSAPP_NUMBER` to the store number in international format without the + (e.g., 919876543210).

Notes:
- Uses Google Fonts: Playfair Display and Montserrat.
- Placeholder images use Unsplash; replace with brand images in `assets/images/` and update `products` array in `js/main.js`.
- To run: open `index.html` in a browser.
 - To run: open `index.html` in a browser.

Configuration:
- Open `js/main.js` and set `WHATSAPP_NUMBER` to the store number in international format without the + (e.g., `919876543210`).
- Replace placeholder address and telephone values in `index.html` JSON-LD and contact section.
- Replace sample images in `assets/images/` and update the `products` array in `js/main.js` to use local paths (e.g., `assets/images/product1.jpg`).

Configuration summary:
- WhatsApp number is set to `+91 7414926847` inside `js/main.js` (variable `WHATSAPP_NUMBER`).
- Contact name: Ganesh Ingavale; Address updated in `index.html` JSON-LD and contact section.
- Replace sample images in `assets/images/` and update the `products` array in `js/main.js` to use local paths (e.g., `assets/images/product1.jpg`) for production use.

Notes:
- The site uses a lightweight JavaScript lightbox. Clicking gallery or product images opens a preview. Use high-resolution images for best results.
- For production, optimize images (WebP/AVIF), minify CSS/JS, and host fonts locally if using licensed typefaces.

Additional production steps:
- Replace `assets/images/og-image.svg` with a branded Open Graph image (1200x630) and update `index.html` if needed.
- Replace `assets/icons/favicon.svg` with a designed favicon; different sizes can be added to `assets/icons/`.
- Update `sitemap.xml` with your real URLs and host at your domain root; update `robots.txt` sitemap URL.
- Optimize product images (WebP/AVIF) and provide multiple sizes; update `products` array to use local optimized assets.
- For improved SEO, provide unique `og:image` and `og:title` per product page (future enhancement if you add per-product pages).

Deploy:
- Upload the folder contents to your hosting provider or static host (Netlify, Vercel, S3 + CloudFront).
- Ensure `sitemap.xml` and `robots.txt` are reachable at the domain root.
>>>>>>> 26d5536 (Add admin panel)
