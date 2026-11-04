# アセットの出典とライセンス

| ファイル | 出典 | ライセンス | 備考 |
| --- | --- | --- | --- |
| textures/earth_day_4096.jpg / earth_night_4096.jpg / earth_bump_roughness_clouds_4096.jpg | [Solar System Scope](https://www.solarsystemscope.com/textures/)(Three.js r170 の examples/textures/planets に含まれる縮小・合成版) | CC BY 4.0 | 画面下部・左上にクレジットを表示 |
| textures/*_2048.jpg | 上記を 2048×1024 に縮小 | CC BY 4.0 | 同上 |
| ../data/stars.json | [Yale Bright Star Catalog, 5th Revised Ed.](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html)(HEASARC) | HEASARC の利用条件に従う | tools/build-stars.mjs で変換 |

地球以外の天体の地表、太陽の表面、土星の環の模様、天の川は、すべてコードで手続き生成しています。
