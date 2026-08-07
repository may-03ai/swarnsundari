Images folder (images/)

- This folder contains placeholder SVG images for each jewellery category.
- Filenames are meaningful so you can replace them with real product photos later.

How to replace with real images:
1. Keep the same filename and image format (e.g., "necklace-01.svg" -> replace with "necklace-01.webp" or "necklace-01.jpg" using the same name).
2. If you change the filename, update `products.json` to point to the new filename (property: `image`).
3. For best performance, provide optimized images (WebP/AVIF) in multiple sizes and update `products.json` to include `srcset` if desired.

Notes:
- `products.json` maps products to filenames inside the project root. No code changes are required when you replace image files and keep the same names.
- The `products.json` file is used by `js/main.js` to load product data dynamically.
