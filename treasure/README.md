# 宝箱(TREASURE)

リアルでポップな宝箱の3D。タップするとフタが開き、金貨と宝石があふれ出します。

- 設計書: [../docs/design/treasure.md](../docs/design/treasure.md)
- Three.js r170 を同梱し、ビルドなしで動きます。https で配信してください(`file://` では動きません)。
- 手元で見るときは、このフォルダで `python3 -m http.server` を起動して開きます。

## 操作

- タップ、クリック、スペース、Enter: 開ける / 閉じる
- ドラッグ: 視点を回す。ホイールやピンチ: 拡大縮小
- `?q=low` を付けると軽い画質になります(スマホでは自動で軽い画質)

## 調整

寸法、色、動きは `data/chest.json`、背景、光、カメラは `data/scene.json` で変えられます。
