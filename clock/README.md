# 機械式時計 v0.1

機械式時計のムーブメントを裏側から見る3D作品です。今の時刻に合わせて、てんぷ・脱進機・輪列が動きます。

## 構成

```text
index.html
data/
  movement.json   部品の配置・歯数・寸法(mm)
  materials.json  素材(色・粗さ・異方性反射)
  lighting.json   スタジオの光(写り込む光の板)
  views.json      視点・速さ・画質の段階
  parts.json      部品の名前と説明(分解表示の名札)
src/
  mech/train.js   時刻から各部品の角度を計算(描画に依存しない)
  mech/gear.js    歯車・受けの平面形状
  parts/movement.js  ムーブメントの組み立てと分解表示
  look/           仕上げ模様・素材・スタジオ照明
  main.js         画面・操作・後処理
tools/
  test-train.mjs  歯車の比と針の角度のテスト(node tools/test-train.mjs)
  layout.py       部品どうしがぶつからない配置の探索
vendor/three/     three.js r170
```

## 操作

- ドラッグで回転、ホイールで拡大
- 1〜4: 脱進機 / てんぷ / 巻き上げ / 全体、E: 分解、スペース: 一時停止
- 部品(または分解時の名札)をクリックすると説明が出ます

## 確認用の URL パラメーター

`?t=43210&pause` 時刻を固定、`?view=balance` 視点、`?q=low|medium|high` 画質、`?explode` 分解した状態で開く

## 今後

文字盤側(針・小秒針・ムーンフェイズ)は次の段階で作ります。
