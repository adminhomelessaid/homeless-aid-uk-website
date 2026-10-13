// Serves the static site and routes /api/* to the Vercel function modules, so the
// portal can be tested locally. Reads .env for SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}
const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || [];
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv', '.ico': 'image/x-icon' };

function shim(res) {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = (b) => { res.end(b); };
    return res;
}

http.createServer(async (req, res) => {
    let url = new URL(req.url, 'http://localhost');
    for (const r of rewrites) {
        if (url.pathname === r.source) { const d = new URL(r.destination, 'http://localhost'); d.searchParams.forEach((v, k) => url.searchParams.set(k, v)); url.pathname = d.pathname; break; }
    }
    if (url.pathname.startsWith('/api/')) {
        const rel = url.pathname.replace(/^\/api\//, '');
        const candidates = [path.join(ROOT, 'api', rel + '.js'), path.join(ROOT, 'api', rel, 'index.js')];
        const file = candidates.find(f => fs.existsSync(f));
        if (!file) { res.statusCode = 404; return res.end('No such function'); }
        let raw = ''; for await (const chunk of req) raw += chunk;
        req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
        req.query = Object.fromEntries(url.searchParams.entries());
        req.url = url.pathname + url.search;
        delete require.cache[file];
        try { await require(file)(req, shim(res)); } catch (e) { console.error(e); res.statusCode = 500; res.end('Function error'); }
        return;
    }
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) filePath += '.html';
    if (!fs.existsSync(filePath)) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
}).listen(3000, () => console.log('Dev server on http://localhost:3000'));
