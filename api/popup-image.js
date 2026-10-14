// GET /api/popup-image?id=...  → 팝업 이미지 파일
import { readPopupImage } from './_lib/store.js';

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
  const image = req.method === 'GET' && /^p-[a-z0-9]+-[a-f0-9]{6}$/.test(id) ? await readPopupImage(id) : null;
  if (!image) { res.statusCode = 404; return res.end('Not found'); }
  if (image.redirect) { res.statusCode = 302; res.setHeader('Location', image.redirect); return res.end(); }
  res.statusCode = 200;
  res.setHeader('Content-Type', image.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(image.buffer);
}
