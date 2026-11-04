# 3d-gallery

ブラウザで動く3D作品をまとめたサイトです。ビルド工程はなく、フォルダごと静的ホスティングに置けば動きます。

## 構成

```text
index.html            作品一覧(上位のページ)
assets/
  style.css           一覧のデザイン
  portal.js           data/works.json から一覧を作る
  thumbs/             作品のサムネイル(960×540)
data/
  works.json          作品の一覧(タイトル・説明・リンク・サムネイル)
solar-system/         太陽系ビューア(詳しくは solar-system/README.md)
aquarium/             静かな水槽(詳しくは aquarium/README.md)
```

各作品のページ左上(水槽は操作バーの左端)に、一覧へ戻るリンクがあります。

## 動かし方

https(またはローカルの http サーバー)で配信してください。`file://` で直接開くと JSON を読み込めません。

```sh
cd 3d-site
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

## 作品を追加する

1. 作品のフォルダ(例: `ocean/`)をこのフォルダの直下に置く
2. サムネイルを `assets/thumbs/` に置く(16:9、960×540 程度)
3. `data/works.json` の `works` に1件追加する

```json
{
  "id": "ocean",
  "title": "作品名",
  "en": "English Title",
  "href": "./ocean/",
  "thumb": "./assets/thumbs/ocean.jpg",
  "accent": "#7FD8E0",
  "description": "一覧に出す説明",
  "features": ["特徴1", "特徴2"],
  "controls": "操作のひとこと説明",
  "version": "v0.1"
}
```

一覧の並びは `works` の順番どおりです。サイト名と説明文は `site` で変えられます。

## ライセンス

- 作品のコード: 自作
- Three.js: MIT License
- 地球の画像: Solar System Scope(CC BY 4.0)
- 恒星のデータ: Yale Bright Star Catalog(HEASARC)
