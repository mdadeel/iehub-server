import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await Product.find({ verificationStatus: 'verified' }).select('_id updatedAt').lean();
    const baseUrl = process.env.CLIENT_URL || 'https://iehub-client.vercel.app';

    const staticRoutes = [
      '',
      '/products',
      '/categories',
      '/trades',
      '/shipping',
      '/about',
      '/contact'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    staticRoutes.forEach((route) => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${route}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>${route === '' ? '1.0' : '0.8'}</priority>\n`;
      xml += `  </url>\n`;
    });

    products.forEach((p) => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/products/${p._id}</loc>\n`;
      xml += `    <lastmod>${new Date(p.updatedAt || Date.now()).toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    res.status(500).end();
  }
});

export default router;
