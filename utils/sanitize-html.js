const ALLOWED = new Set(['p','br','h1','h2','h3','h4','strong','em','b','i','u','ul','ol','li','a','blockquote','table','thead','tbody','tr','th','td']);

function sanitizeHtml(html) {
    if (typeof html !== 'string' || !html) return '';
    let out = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag, attrs) => {
        const tag = rawTag.toLowerCase();
        const closing = match.startsWith('</');
        if (!ALLOWED.has(tag)) return '';
        if (closing) return `</${tag}>`;
        if (tag === 'a') {
            const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
            const href = m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : '';
            if (/^(https?:\/\/|mailto:)/i.test(href)) {
                return `<a href="${href.replace(/"/g, '&quot;')}">`;
            }
            return '<a>';
        }
        if (tag === 'br') return '<br>';
        return `<${tag}>`;
    });
    return out;
}

module.exports = { sanitizeHtml };
