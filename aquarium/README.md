# Aquarium — 静かな水槽

ブラウザで眺める3Dアクアリウムです。光・水・生き物の質感だけで見入る環境映像を目指しています。
Three.js(r170)を同梱しており、ビルド工程なしで静的ホスティングにそのまま置けます。

## 動かし方

https(またはローカルの http サーバー)で配信してください。`file://` で直接開くと JSON とシェーダーを読み込めません。

```sh
cd aquarium
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

## 操作

| 操作 | 内容 |
| --- | --- |
| ドラッグ / スワイプ | 視点を回す(範囲は水槽内に制限) |
| ホイール / ピンチ | 寄る・引く |
| F キー / 餌やりボタン | 餌を落とす |
| 1 / 2 / 3 キー | 朝 / 昼 / 夜 |
| 画質メニュー | 自動 / 低 / 中 / 高 |

画面を触らずに5秒たつと、カメラがゆっくり漂い始めます。

## URLパラメータ

| パラメータ | 例 | 内容 |
| --- | --- | --- |
| `time` | `?time=night` | 開始時の時間帯(morning / day / night) |
| `quality` | `?quality=high` | 画質を固定(auto / low / medium / high) |
| `dev` | `?dev` | 調整パネルを表示。決めた値は「JSONをコピー」で `data/palettes.json` に貼り戻す |

## ディレクトリ構成

```text
index.html            importmap と起動のみ
src/
  main.js             初期化とメインループ
  core/               loader, camera, quality, noise, patch(水中表現の差し込み)
  world/              lighting, environment, terrain, rocks, plants, water
  life/               boids(群れ), fish, fishGeometry, food
  post/               composer(ポストプロセス)
  shaders/            *.glsl(fetch で読み込み)
  ui/                 hud, devgui, style.css
data/
  species.json        魚の種類・形・色・群れの係数
  palettes.json       色と時間帯プリセット
  scene.json          配置、カメラ、底砂、粒子
  quality.json        画質プリセットと自動調整
vendor/three/         Three.js r170(使う部分のみ)
```

調整値はすべて `data/*.json` にあり、コードを触らずに見た目や魚の数を変えられます。

## 魚の種類を追加する

`data/species.json` の `species` に1件追加します。

- `behavior`: `school`(群泳) / `loose`(緩い群れ) / `bottom`(底生) / `solo`(単独で巡回)
- `pattern`: `plain` / `neon` / `bars` / `spots` / `wedge` / `gourami`
- `shape`: 体高・幅・尾・背びれ・尻びれの大きさ(全長1に対する比)
- `depth`: 泳ぐ層(0 = 底、1 = 水面付近)

## 品質と性能

- 画質「自動」は、最初の数秒のフレームレートを見て高 → 中 → 低と段階的に下げます。
- 群れの計算は約1ms/フレーム(約100匹)。描画は魚の種類ごとにまとめて行います。
- 前後比較用のスクリーンショットは `docs/shots/` に置きます。

## ライセンス

- 本体コード: 自作
- Three.js: MIT License(`vendor/three/LICENSE`)
- 3Dモデル・テクスチャ: すべて手続き生成で、外部素材は使っていません(`assets/LICENSES.md`)

## 色の設計(v0.2)

- 配分: 地の色(水・水草の青緑)が約6割、中間色(砂・岩・流木)が約3割、差し色(オレンジ・赤)は約1割
- 差し色は主役と手前に集める: コイ・エンゼル(白・橙・黒)、ハニードワーフグラミー(橙金)、カーディナルテトラの赤い腹、赤い有茎草(奥の3か所)、流木と岩の上のチェリーシュリンプ(scene.json の shrimp)
- 水の赤の吸収は本物の水槽(奥行き数十cm)に合わせて弱め、魚の補助光は水の色ではなく明るさを主に足して、暖色がくすまないようにしている
