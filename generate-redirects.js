const fs = require('fs');
const path = require('path');
const https = require('https');

const DOMAIN = 'https://sparkflare95.github.io/ZeroDowntime';
const HOST = 'sparkflare95.github.io'; 
const INDEXNOW_KEY = 'YOUR_INDEXNOW_KEY_HERE'; // Yahan apni IndexNow key likh dein (agar key nahi hai toh koi bhi random text daal dein)

const destFile = path.join(__dirname, 'destinations.txt');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

function generateRandomString(length = 9) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

let destinations = [];
if (fs.existsSync(destFile)) {
    destinations = fs.readFileSync(destFile, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

if (destinations.length === 0) {
    console.log('No destination URLs found in destinations.txt');
    return;
}

let generatedUrls = [];
const now = new Date().toISOString();

destinations.forEach(targetUrl => {
    const randomSlug = generateRandomString(9);
    const folderPath = path.join(publicDir, randomSlug);
    
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

    const fullPageUrl = `${DOMAIN}/${randomSlug}/`;
    generatedUrls.push(fullPageUrl);
});

let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
sitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

generatedUrls.forEach(url => {
    sitemapXML += `  <url>\n`;
    sitemapXML += `    <loc>${url}</loc>\n`;
    sitemapXML += `    <lastmod>${now}</lastmod>\n`;
    sitemapXML += `  </url>\n`;
});

sitemapXML += `</urlset>`;

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXML, 'utf8');
console.log(`Successfully generated ${generatedUrls.length} redirect pages and sitemap.xml`);

const payload = JSON.stringify({
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/ZeroDowntime/${INDEXNOW_KEY}.txt`,
    urlList: generatedUrls
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