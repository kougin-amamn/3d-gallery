# 太陽系ビューア

実際の暦で動く3D太陽系です。開いた瞬間の日時で惑星の位置を計算し、天体を選んでそこへ飛んでいけます。
Three.js(r170)を同梱しており、ビルド工程なしで静的ホスティングにそのまま置けます。

## 動かし方

https(またはローカルの http サーバー)で配信してください。`file://` で直接開くと JSON とシェーダーを読み込めません。

```sh
cd solar-system
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

## 操作

| 操作 | 内容 |
| --- | --- |
| ドラッグ / スワイプ | 視点を回す |
| ホイール / ピンチ | 寄る・引く |
| 天体・名前をクリック | その天体へ飛ぶ |
| 0〜9 キー | 太陽、水星〜海王星、冥王星 |
| Esc | 全体表示に戻る |
| スペース | 時間の一時停止・再生 |
| [ / ] | 時間を遅く・速く(停止より遅くすると逆再生) |
| 日時の欄 | 好きな日時へ移動(紀元前3000年〜3000年) |
| 見やすい / 実寸 | 表示スケールの切替(2.5秒かけて補間) |

10秒操作がないと、カメラがゆっくり回り始めます。

## URLパラメータ

| パラメータ | 例 | 内容 |
| --- | --- | --- |
| `focus` | `?focus=saturn` | 最初に表示する天体(bodies.json の id、または `system`) |
| `date` | `?date=2024-04-08T18:18Z` | 開始日時 |
| `scale` | `?scale=real` | 実寸表示で開始 |
| `quality` | `?quality=high` | 画質を固定(auto / low / medium / high) |
| `dev` | `?dev` | 露出・ブルームなどの調整パネルとフレームレートを表示 |

## 構成

```text
index.html             importmap と画面の骨組み
src/
  main.js              初期化とメインループ(浮動原点・露出・ラベル・軌道線)
  core/                camera(飛行演出), clock(時間), quality, loader
  astro/               kepler(惑星), moons(衛星), rotation(自転), scale(表示変換), ephemeris, time
  bodies/              bodies(太陽・惑星・環・大気・雲), bake(地表の手続き生成)
  sky/                 恒星、天の川、小惑星帯、軌道線、光点
  post/                ブルーム、レンズフレア、仕上げ
  shaders/             *.glsl
  ui/                  hud(操作バー・情報パネル・ラベル), style.css
data/
  bodies.json          天体の大きさ・軌道要素・自転・地表の色・説明
  stars.json           輝星星表(約9,100星)を変換したもの
  theme.json           UI と軌道線の色
  quality.json         画質プリセット
assets/textures/       地球の画像(2K と 4K)
tools/
  build-stars.mjs      星表のテキストを stars.json に変換する
  test-orbits.mjs      軌道計算の確認(node tools/test-orbits.mjs)
vendor/three/          Three.js r170(使う部分のみ)
```

## 計算の方法と精度

- **惑星:** JPL「Approximate Positions of the Planets」のケプラー軌道要素。1800〜2050年は表1、それ以外は表2a・2b を使います。冥王星は同ページの旧版の値です。
- **月:** 天文年鑑の簡易式(誤差 約0.3度)。月相や食の日付は合いますが、日食の影の位置は正確ではありません。
- **ガリレオ衛星:** Meeus『Astronomical Algorithms』第44章の低精度式。タイタンは円軌道で、位相は概算です。
- **自転:** IAU の北極方向と本初子午線。地球は時刻どおりに回り、日本が夜なら日本側が暗く見えます。
- **確認:** `node tools/test-orbits.mjs` で、春分・衝・2024年4月8日の日食・2025年9月7日の月食について位置関係を照合します。

## 見た目の調整

- **夜側の明るさ:** `data/bodies.json` の `display.nightFill`(昼の光に対する割合、初期値 0.06)。実際より明るくする演出で、0 にすると実際どおり真っ暗になります。
- **軌道線の濃さ:** `data/theme.json` の `orbitOpacity`(全体表示 / 天体に寄ったとき / 衛星)。
- `?dev` を付けて開くと、これらをスライダーで試せます。

## 画質と性能

- 「自動」は最初の数秒のフレームレートを見て、高 → 中 → 低と段階的に下げます。
- 地表の解像度と球の分割数は起動時の画質で決まります。途中で画質を変えると、解像度倍率・ブルーム・星の数・小惑星の数が切り替わります。
- 地球の4K画像は、地球に近づいたときに読み込みます(画質「中」以上)。

## ライセンス

- 本体コード: 自作
- Three.js: MIT License(`vendor/three/LICENSE`)
- 地球の画像: Solar System Scope(CC BY 4.0)。Three.js のサンプルに含まれる縮小・合成版を使用しています。画面にクレジットを表示しています
- 恒星のデータ: Yale Bright Star Catalog, 5th Revised Ed.(HEASARC)
- 地球以外の地表、太陽、天の川: すべてコードで手続き生成
