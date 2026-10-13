const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');
const { createRegistrationDb } = require('../../utils/registration-db');
const { handlers, dispatch, resolveAction, PUBLIC_ACTIONS } = require('../../utils/registration-handlers');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = Object.fromEntries(url.searchParams.entries());
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const action = resolveAction(req, query, body);

    const handler = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : null;
    if (!handler) return res.status(404).json({ success: false, message: `Unknown action: ${action}` });

    let user = null;
    if (!PUBLIC_ACTIONS.has(action)) {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token provided' });
        try {
            const decoded = AuthUtils.verifyJWT(authHeader.substring(7));
            user = { id: decoded.id, role: decoded.role, name: decoded.name, username: decoded.username, email: decoded.email };
        } catch (error) {
            const expired = error.name === 'TokenExpiredError';
            return res.status(401).json({ success: false, message: expired ? 'Token has expired. Please login again.' : 'Invalid token' });
        }
    }

    try {
        const db = createRegistrationDb(createSupabaseClient());
        const result = await dispatch(action, {
            user, method: req.method, query, body, db,
            ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
            userAgent: (req.headers['user-agent'] || '').slice(0, 300),
            now: new Date(),
            origin: req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : 'https://homelessaid.co.uk')
        });
        if (result.raw !== undefined) {
            for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
            return res.status(result.status).send(result.raw);
        }
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error(`Registration API error [${action}]:`, error);
        return res.status(500).json({ success: false, message: 'An error occurred while processing the request' });
    }
};
