const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://sparkflare95.pages.dev'; // Apni main domain/repo ke mutabiq adjust kar sakte hain
const KEY = process.env.INDEXNOW_KEY || 'YOUR_INDEXNOW_KEY'; // Apni key yahan ya env se set karein

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const URLS_FILE = path.join(ROOT, 'urls.txt');
const REDIRECTS_FILE = path.join(PUBLIC_DIR, '_redirects');
const SITEMAP_FILE = path.join(PUBLIC_DIR, 'sitemap.xml');

if (!fs.existsSync(URLS_FILE)) {
  throw new Error('urls.txt is missing. Deployment stopped.');
}

if (!fs.existsSync(REDIRECTS_FILE)) {
  throw new Error('public/_redirects is missing. Deployment stopped.');
}

const redirectRules = fs.readFileSync(REDIRECTS_FILE, 'utf8')
  .split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#'));

if (redirectRules.length > 2000) {
  throw new Error(`Redirect validation failed: ${redirectRules.length} rules.`);
}

const rawUrls = fs.readFileSync(URLS_FILE, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

const urls = [];

for (const value of rawUrls) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL in urls.txt: ${value}`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(`Unexpected URL in urls.txt: ${value}`);
  }

  url.protocol = 'https:';
  url.pathname = '/' + url.pathname.split('/').filter(Boolean).join('/');

  // Title generation from slug/path for Google News
  const pathSegments = url.pathname.split('/').filter(Boolean);
  let title = 'Latest Updates & Articles';
  if (pathSegments.length > 0) {
    const lastSegment = pathSegments[pathSegments.length - 1];
    title = lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\.\w+$/, '')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  urls.push({
    href: url.href,
    title: title
  });
}

if (urls.length === 0) {
  throw new Error('No valid URLs found. Deployment stopped.');
}

const lastmod = new Date().toISOString();

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// XML Structure with Google News Namespace
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
xml += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';

for (const item of urls) {
  xml += '  <url>\n';
  xml += `    <loc>${escapeXml(item.href)}</loc>\n`;
  xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += '    <changefreq>hourly</changefreq>\n';
  xml += '    <news:news>\n';
  xml += '      <news:publication>\n';
  xml += `        <news:name>PageAura</news:name>\n`;
  xml += `        <news:language>en</news:language>\n`;
  xml += '      </news:publication>\n';
  xml += `      <news:publication_date>${lastmod}</news:publication_date>\n`;
  xml += `      <news:title>${escapeXml(item.title)}</news:title>\n`;
  xml += '    </news:news>\n';
  xml += '  </url>\n';
}

xml += '</urlset>\n';

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(SITEMAP_FILE, xml, 'utf8');

if (!fs.existsSync(REDIRECTS_FILE)) {
  throw new Error('_redirects is missing after sitemap generation.');
}

if (!fs.existsSync(SITEMAP_FILE)) {
  throw new Error('Sitemap file generation failed.');
}

console.log(`Sitemap URLs processed: ${urls.length}`);
console.log(`lastmod: ${lastmod}`);
console.log('changefreq: hourly with Google News tags injected.');
console.log('Build validation passed.');
