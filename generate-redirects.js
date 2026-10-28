const fs = require('fs');
const path = require('path');
const https = require('https');

const DOMAIN = 'https://pageaura.xyz';
const HOST = 'pageaura.xyz';
const INDEXNOW_KEY = 'indexnowkey12345'; // Apni indexnowapi.txt wali key yahan rakhein
const KEY_FILENAME = 'indexnowapi.txt';

const destFile = path.join(__dirname, 'destinations.txt');
const dbFile = path.join(__dirname, 'database.json');
const urlsOutputFile = path.join(__dirname, 'urls.txt');

function generateRandomString(length = 9) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 1. Load existing database (slug -> targetUrl mapping)
let db = {};
if (fs.existsSync(dbFile)) {
    try {
        db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
        db = {};
    }
}

// 2. Read new destinations from destinations.txt
let destinations = [];
if (fs.existsSync(destFile)) {
    destinations = fs.readFileSync(destFile, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

// 3. Map existing targets to avoid duplicate slugs for same URLs
let newlyAddedUrls = [];
const targetToSlug = {};
for (const [slug, targetUrl] of Object.entries(db)) {
    targetToSlug[targetUrl] = slug;
}

destinations.forEach(targetUrl => {
    let slug = targetToSlug[targetUrl];
    if (!slug) {
        // Generate a unique 9-character slug
        do {
            slug = generateRandomString(9);
        } while (db[slug]);

        db[slug] = targetUrl;
        newlyAddedUrls.push(`${DOMAIN}/${slug}/`);
    }
});

// Save updated database
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
console.log(`Database updated. Total active redirects: ${Object.keys(db).length}`);

// 4. Generate physical folders & HTML files for ALL redirects in DB
let allGeneratedUrls = [];
const now = new Date().toISOString();

Object.entries(db).forEach(([slug, targetUrl]) => {
    const folderPath = path.join(__dirname, slug);
    fs.mkdirSync(folderPath, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=${targetUrl}">
    <title>Redirecting...</title>
    <script>
        window.location.href = "${targetUrl}";
    </script>
</head>
<body>
    <p>Redirecting to <a href="${targetUrl}">${targetUrl}</a>...</p>
</body>
</html>`;

    fs.writeFileSync(path.join(folderPath, 'index.html'), htmlContent, 'utf8');
    allGeneratedUrls.push(`${DOMAIN}/${slug}/`);
});

// 5. Save all URLs to urls.txt
fs.writeFileSync(urlsOutputFile, allGeneratedUrls.join('\n'), 'utf8');

// 6. Generate sitemap.xml with ALL URLs (old + new)
let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
sitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

allGeneratedUrls.forEach(url => {
    sitemapXML += `  <url>\n`;
    sitemapXML += `    <loc>${url}</loc>\n`;
    sitemapXML += `    <lastmod>${now}</lastmod>\n`;
    sitemapXML += `  </url>\n`;
});

sitemapXML += `</urlset>`;
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemapXML, 'utf8');

// 7. Generate robots.txt
const robotsTxtContent = `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`;
fs.writeFileSync(path.join(__dirname, 'robots.txt'), robotsTxtContent, 'utf8');

// 8. Send IndexNow API Request for newly added URLs
if (newlyAddedUrls.length > 0) {
    const payload = JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${DOMAIN}/${KEY_FILENAME}`,
        urlList: newlyAddedUrls
    });

    const options = {
        hostname: 'api.indexnow.org',
        port: 443,
        path: '/indexnow',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        console.log(`IndexNow statusCode: ${res.statusCode}`);
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (error) => {
        console.error('IndexNow Error:', error);
    });

    req.write(payload);
    req.end();
} else {
    console.log('No new URLs to ping IndexNow.');
}
