function normaliseName(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function addMonths(date, n) {
    const d = new Date(date.getTime());
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
}

function computeRegistrationState(user, latestSignature, activePolicies, now = new Date()) {
    const details_complete = Boolean(user.date_of_birth && user.mobile_phone && user.team && user.next_of_kin_name && user.next_of_kin_phone);
    const photo_complete = Boolean(user.has_photo);

    let signature_status = 'none';
    let outdated_policies = [];
    let signature = null;

    if (latestSignature) {
        signature = { signed_at: latestSignature.signed_at, expires_at: latestSignature.expires_at };
        const signed = new Set(latestSignature.version_ids || []);
        outdated_policies = activePolicies
            .filter(p => !signed.has(p.current_version.id))
            .map(p => p.title);
        if (new Date(latestSignature.expires_at) <= now) {
            signature_status = 'expired';
        } else if (outdated_policies.length > 0) {
            signature_status = 'outdated';
        } else {
            signature_status = 'signed';
        }
    }

    return {
        details_complete,
        photo_complete,
        signature_status,
        outdated_policies: signature_status === 'outdated' ? outdated_policies : [],
        signature,
        registration_complete: details_complete && photo_complete && signature_status === 'signed'
    };
}

module.exports = { computeRegistrationState, normaliseName, addMonths };
