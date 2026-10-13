const MAX_BYTES = 307200;
const MAX_SIDE = 400;

function readJpegSize(buf) {
    if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let i = 2;
    while (i + 9 < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
        if (marker === 0xD9 || marker === 0xDA) return null;
        const len = buf.readUInt16BE(i + 2);
        const isSof = (marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
        if (isSof) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
    }
    return null;
}

function validatePhoto(input) {
    if (typeof input !== 'string' || !input.trim()) return { ok: false, message: 'No photo provided' };
    const b64 = input.replace(/^data:image\/jpeg;base64,/i, '').trim();
    if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false, message: 'Photo must be base64 encoded' };
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_BYTES) return { ok: false, message: 'Photo must be 300 KB or smaller' };
    if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
        return { ok: false, message: 'Photo must be a JPEG image' };
    }
    const size = readJpegSize(buffer);
    if (!size) return { ok: false, message: 'Could not read JPEG dimensions' };
    if (size.width !== size.height) return { ok: false, message: 'Photo must be square' };
    if (size.width > MAX_SIDE) return { ok: false, message: `Photo must be ${MAX_SIDE}x${MAX_SIDE} or smaller` };
    return { ok: true, buffer, width: size.width, height: size.height };
}

module.exports = { validatePhoto, readJpegSize, MAX_BYTES, MAX_SIDE };
