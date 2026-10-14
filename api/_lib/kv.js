// Vercel 에 연결한 Upstash Redis(REST) 를 쓰는 작은 도우미. 추가 패키지 없이 fetch 로 부른다.
// 환경변수(KV_REST_API_URL·KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_URL·UPSTASH_REDIS_REST_TOKEN)가 없으면
// hasKv() 가 false 이고, 저장소는 로컬 JSON 파일을 쓴다.
// 붙여 넣을 때 섞인 앞뒤 공백·따옴표, 빠진 https:// 는 바로잡는다
const clean = value => String(value || '').trim().replace(/^["']|["']$/g, '').trim();
const env = () => {
  let url = clean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
  return { url: url.replace(/\/+$/, ''), token: clean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN) };
};

export const hasKv = () => { const { url, token } = env(); return Boolean(url && token); };

/** redis('SET', 'key', 'value', 'NX') → result */
export async function redis(...command) {
  const { url, token } = env();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command.map(String)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(`redis ${command[0]} failed: ${data.error || response.status}`);
  return data.result;
}

/* ── 횟수 제한(로그인 실패·문의 도배) ──
   서버리스는 요청마다 다른 서버가 받을 수 있어 메모리 대신 Redis 에 센다. Redis 가 없으면 메모리. */
const memory = new Map();

export async function countHits(name, key, now = Date.now()) {
  const id = `ailo:hits:${name}:${key}`;
  if (hasKv()) return Number(await redis('GET', id)) || 0;
  const entry = memory.get(id);
  if (!entry || entry.until <= now) { memory.delete(id); return 0; }
  return entry.count;
}

export async function addHit(name, key, windowMs, now = Date.now()) {
  const id = `ailo:hits:${name}:${key}`;
  if (hasKv()) {
    const count = await redis('INCR', id);
    if (Number(count) === 1) await redis('PEXPIRE', id, windowMs);   // 첫 번째부터 windowMs 동안 센다
    return Number(count);
  }
  const entry = memory.get(id);
  if (!entry || entry.until <= now) memory.set(id, { count: 1, until: now + windowMs });
  else entry.count += 1;
  return memory.get(id).count;
}

export async function clearHits(name, key) {
  const id = `ailo:hits:${name}:${key}`;
  if (hasKv()) await redis('DEL', id);
  else memory.delete(id);
}
