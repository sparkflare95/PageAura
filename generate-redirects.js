const fs = require('fs');
const path = require('path');
const https = require('https');

const DOMAIN = 'https://pageaura.xyz';
const HOST = 'pageaura.xyz';
const INDEXNOW_KEY = 'indexnowkey12345'; // Apni indexnowapi.txt wali key yahan rakhein
const KEY_FILENAME = 'indexnowapi.txt';
const PUBLICATION_NAME = 'PageAura'; // Aap yahan apni site ka brand name likh sakte hain

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

// Helper to generate a clean readable news title from target URL
function generateNewsTitle(url) {
    try {
        const parsed = new URL(url);
        let segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
            let lastSegment = segments[segments.length - 1];
            // Clean up hyphens and underscores into readable words
            let clean = lastSegment.replace(/[-_]/g, ' ').replace(/\.[^/.]+$/, '');
            if (clean.length > 3) {
                return clean.charAt(0).toUpperCase() + clean.slice(1);
            }
        }
        return `Updates from ${parsed.hostname}`;
    } catch (e) {
        return 'Latest Update and Information';
    }
}

// 1. Load existing database and handle format migration if needed
let db = {};
if (fs.existsSync(dbFile)) {
    try {
        const rawDb = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        // Migrate old string format to object format { targetUrl, pubDate, title }
        for (const [slug, val] of Object.entries(rawDb)) {
            if (typeof val === 'string') {
                db[slug] = {
                    targetUrl: val,
                    pubDate: new Date().toISOString(),
                    title: generateNewsTitle(val)
                };
            } else {
                db[slug] = val;
            }
        }
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

// 3. Map existing targets to prevent duplicate slugs
let newlyAddedUrls = [];
const targetToSlug = {};
for (const [slug, data] of Object.entries(db)) {
    targetToSlug[data.targetUrl] = slug;
}

const nowISO = new Date().toISOString();

destinations.forEach(targetUrl => {
    let slug = targetToSlug[targetUrl];
    if (!slug) {
        // Generate a unique 9-character slug
        do {
            slug = generateRandomString(9);
        } while (db[slug]);

        db[slug] = {
            targetUrl: targetUrl,
            pubDate: nowISO,
            title: generateNewsTitle(targetUrl)
        };
        newlyAddedUrls.push(`${DOMAIN}/${slug}/`);
    }
});

// Save updated database
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
console.log(`Database updated. Total active redirects: ${Object.keys(db).length}`);

// 4. Generate physical folders & HTML files for ALL redirects in DB
let allGeneratedUrls = [];

Object.entries(db).forEach(([slug, data]) => {
    const folderPath = path.join(__dirname, slug);
    fs.mkdirSync(folderPath, { recursive: true });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=${data.targetUrl}">
    <title>${data.title}</title>
    <script>
        window.location.href = "${data.targetUrl}";
    </script>
</head>
<body>
    <p>Redirecting to <a href="${data.targetUrl}">${data.targetUrl}</a>...</p>
</body>
</html>`;

    fs.writeFileSync(path.join(folderPath, 'index.html'), htmlContent, 'utf8');
    allGeneratedUrls.push(`${DOMAIN}/${slug}/`);
});

// 5. Save all URLs to urls.txt
fs.writeFileSync(urlsOutputFile, allGeneratedUrls.join('\n'), 'utf8');

// 6. Generate Google News Sitemap XML with all required tags
let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
sitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
sitemapXML += `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;

Object.entries(db).forEach(([slug, data]) => {
    const pageUrl = `${DOMAIN}/${slug}/`;
    sitemapXML += `  <url>\n`;
    sitemapXML += `    <loc>${pageUrl}</loc>\n`;
    sitemapXML += `    <news:news>\n`;
    sitemapXML += `      <news:publication>\n`;
    sitemapXML += `        <news:name>${PUBLICATION_NAME}</news:name>\n`;
    sitemapXML += `        <news:language>en</news:language>\n`;
    sitemapXML += `      </news:publication>\n`;
    sitemapXML += `      <news:publication_date>${data.pubDate}</news:publication_date>\n`;
    sitemapXML += `      <news:title><![CDATA[${data.title}]]></news:title>\n`;
    sitemapXML += `    </news:news>\n`;
    sitemapXML += `  </url>\n`;
});

sitemapXML += `</urlset>`;

fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemapXML, 'utf8');
console.log(`Successfully generated Google News sitemap.xml`);

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
