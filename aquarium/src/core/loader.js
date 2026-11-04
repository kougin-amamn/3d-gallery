// データとシェーダーの読み込み。https配信を前提に fetch で取得する。

export async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} の読み込みに失敗しました(HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url} のJSONを解釈できません: ${e.message}`);
  }
}

export async function loadText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} の読み込みに失敗しました(HTTP ${res.status})`);
  return res.text();
}

export async function loadShaders(base, names) {
  const pairs = await Promise.all(
    names.map(async (n) => [n, await loadText(`${base}/${n}.glsl`)])
  );
  return Object.fromEntries(pairs);
}

// 必須項目の検証。足りないときは分かるエラーを出す。
export function requireKeys(obj, file, keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
    if (v === undefined) throw new Error(`${file} に必須項目「${k}」がありません`);
  }
}
