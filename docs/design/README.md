# 設計書

3d-gallery の各作品の設計書です。作品を作る前にここで設計を決め、作ったあとに決めたことは各設計書の「変更履歴」に追記します。

| 作品 | 設計書 | 作品のフォルダ |
| --- | --- | --- |
| 静かな水槽 | [aquarium.md](aquarium.md) | `aquarium/` |
| 太陽系ビューア | [solar-system.md](solar-system.md) | `solar-system/` |
| 機械式時計 | [clock.md](clock.md) | `clock/` |

## 運用

- 新しい作品の設計書は `docs/design/<作品のフォルダ名>.md` に置く
- 設計を変えたら、コードと同じコミットで設計書も更新する
- 図(埋め込みの図版)は Markdown にしたときに文字の置き換えになっている。図が必要なときは画像として `docs/design/img/` に置く
