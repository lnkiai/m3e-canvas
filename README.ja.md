<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/banner-dark.png" />
    <img src="docs/readme/banner-light.png" width="800" alt="M3E Canvas" />
  </picture>
</p>

<p align="center">
  <strong>Material 3 Expressive の画面をブラウザで組み立てて、画面同士をつなぎ、タップして確かめ、そのまま AI コーディング用のプロンプトにするツールです。</strong>
</p>

<p align="center">
  <a href="https://github.com/lnkiai/m3e-canvas/stargazers"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/github/stars/lnkiai/m3e-canvas?style=flat-square&logo=github&logoColor=white&color=6750A4&labelColor=1D1B20" /><img alt="GitHub stars" src="https://img.shields.io/github/stars/lnkiai/m3e-canvas?style=for-the-badge&logo=github&logoColor=white&color=6750A4&labelColor=1D1B20" /></picture></a>
  <a href="https://github.com/sponsors/lnkiai"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/github/sponsors/lnkiai?style=flat-square&logo=githubsponsors&logoColor=white&color=7D5260&labelColor=1D1B20" /><img alt="Sponsors" src="https://img.shields.io/github/sponsors/lnkiai?style=for-the-badge&logo=githubsponsors&logoColor=white&color=7D5260&labelColor=1D1B20" /></picture></a>
  <a href="LICENSE"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/badge/license-MIT-625B71?style=flat-square&labelColor=1D1B20" /><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-625B71?style=for-the-badge&labelColor=1D1B20" /></picture></a>
  <br />
  <a href="https://m3.material.io/"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/badge/Material_3-Expressive-6750A4?style=flat-square&logo=materialdesign&logoColor=white&labelColor=1D1B20" /><img alt="Material 3 Expressive" src="https://img.shields.io/badge/Material_3-Expressive-6750A4?style=for-the-badge&logo=materialdesign&logoColor=white&labelColor=1D1B20" /></picture></a>
  <a href="https://nextjs.org/"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/badge/Next.js-16-625B71?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=1D1B20" /><img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-625B71?style=for-the-badge&logo=nextdotjs&logoColor=white&labelColor=1D1B20" /></picture></a>
  <a href="https://react.dev/"><picture><source media="(max-width: 767px)" srcset="https://img.shields.io/badge/React-19-625B71?style=flat-square&logo=react&logoColor=61DAFB&labelColor=1D1B20" /><img alt="React 19" src="https://img.shields.io/badge/React-19-625B71?style=for-the-badge&logo=react&logoColor=61DAFB&labelColor=1D1B20" /></picture></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/208608"><img alt="Trendshift: #1 repository of the day" src="https://trendshift.io/api/badge/trendshift/repositories/208608/daily" width="250" height="55" /></a>
</p>

<p align="center"><a href="README.md"><img src="docs/readme/ui/lang-en.png" height="40" alt="English" /></a><a href="README.ja.md"><img src="docs/readme/ui/lang-ja-on.png" height="40" alt="日本語" /></a><a href="README.zh.md"><img src="docs/readme/ui/lang-zh.png" height="40" alt="中文" /></a><a href="README.ko.md"><img src="docs/readme/ui/lang-ko.png" height="40" alt="한국어" /></a></p>

<p align="center"><img src="docs/readme/demo.gif" alt="M3E Canvas でレシピアプリ Pantry を組み、画面をタップして確かめ、プロンプトをコピーし、ターミナルの Claude Code がアプリを作り、完成したアプリがスマホで動くまで" /></p>

<p align="center">画面を組み、タップで流れを確かめ、プロンプトをコピーして、AI コーディングツールにアプリを作ってもらう。（<a href="docs/readme/demo.mp4">mp4</a>）</p>

M3E Canvas は、本物の Material 3 Expressive の部品でアプリの画面を描ける、無料のオープンソースのスケッチツールです。ブラウザだけで動き、アカウントもサーバーもインストールもいりません。描いた画面は正確なプロンプトになり、Claude Code、Codex、Gemini CLI、Cursor など、プロンプトを受け取れる AI コーディングツールならどれでも、動くアプリに仕上げられます。

<p align="center"><a href="https://lnkiai.github.io/m3e-canvas/"><img src="docs/readme/ui/open-ja.png" height="56" alt="アプリを開く" /></a></p>

## <img src="docs/readme/ui/icon-how.png" width="32" height="32" align="absmiddle" alt="" /> 使い方

<picture>
  <source media="(max-width: 767px)" srcset="docs/readme/cards/how-narrow.png" />
  <img src="docs/readme/cards/how-wide.png" alt="3 つの手順：部品パネルで画面を組む、プレビューでタップして確かめる、プロンプトをコピーする" />
</picture>

1. **組む**：部品をスマホやデスクトップの画面にドラッグします。部品同士はくっつき、4dp グリッドにそろいます。
2. **タップして確かめる**：部品に移動先の画面をつなぎ、プレビューで遷移ごと動きを試せます。
3. **プロンプトをコピー**：デザイン全体が、選んだ言語の短い指示文になります。AI コーディングツールに貼るだけです。

## <img src="docs/readme/ui/icon-features.png" width="32" height="32" align="absmiddle" alt="" /> 主な機能

<picture>
  <source media="(max-width: 767px)" srcset="docs/readme/cards/features-narrow.png" />
  <img src="docs/readme/cards/features-wide.png" alt="4 つの機能：部品ごとのパネル、つながった画面、カラーパネル、「AI に頼む」ダイアログ" />
</picture>

<img src="docs/readme/ui/feature-parts.png" width="24" height="24" align="absmiddle" alt="" /> **本物の M3 Expressive 部品**：ボタン、FAB、バー、タブ、カード、リスト、シート、ピッカー、カルーセル、ローディングなど。部品ごとにテキスト、スタイル、サイズ、タップしたときの動きを決めるパネルがあります。

<img src="docs/readme/ui/feature-flow.png" width="24" height="24" align="absmiddle" alt="" /> **画面と遷移**：スマホとデスクトップの画面、スクロールする長い画面、タップやスワイプで好きな遷移を付けて開く画面。全体の流れは矢印で見えます。

<img src="docs/readme/ui/feature-theme.png" width="24" height="24" align="absmiddle" alt="" /> **テーマを 1 か所で**：カラー、シェイプ、タイポグラフィ、モーション。7 種のパレットか自分のベース色、ライトとダーク、3 段階のコントラスト、角丸、フォント、エクスプレッシブなばねの動き。

<img src="docs/readme/ui/feature-ai.png" width="24" height="24" align="absmiddle" alt="" /> **AI の手助け（任意）**：自分のキーでデザインの下書きや説明文を書かせたり、コーディングエージェント向けの指示をコピーして共有リンクで返してもらったりできます。キーはブラウザの外に出ません。

<details>
<summary><b>できることの一覧</b></summary>

- **部品** – ボタン、アイコンボタン、FAB と拡張 FAB、FAB メニュー、スプリットボタン、チップ、トップアプリバー、ナビゲーションバーとレール、フローティングツールバー、タブ、検索バー、カード、リスト項目、ボックス、ボトムシート、ダイアログ、スナックバー、テキスト入力、ドロップダウン、スイッチ、チェックボックス、ラジオボタン、スライダー、日付と時刻のピッカー、テキスト、画像、カルーセル、カメラと地図のプレースホルダー、区切り線、形が変化するローディングと波形のプログレス。どの部品にもテキスト、スタイル、サイズ、配置を決めるパネルと、タップしたときの動きを決めるトリガーのタブがあります。
- **磁石のような連結** – ボタン、チップ、リスト項目を近づけると 1 つのグループにくっつき、角が溶けてつながります。
- **スマホ画面とデスクトップ画面** – 画面は何枚でも追加できます。画面のラベルから 412×892 のスマホと 1280×800 のデスクトップを切り替えられ、バーは伸び、ナビゲーションバーはレールに（戻せばバーに）なり、部品は並べ直されます。同じ名前の画面はプロンプトで「1 つの画面の 2 つの幅」として書かれます。
- **スクロールする画面** – 画面を端末より長くすると、プレビューでは本文がバーの下でスクロールします。下のベゼルの取っ手をドラッグするか、画面パネルで 1x〜3x を選べます。
- **タップとスワイプで遷移** – 部品、アプリバーのアイコン、ナビゲーションの項目に移動先の画面（または「戻る」）と遷移を設定できます。スライドは上下左右、ほかにフェード、拡大、なし。スワイプで別の画面を開くこともでき、プレビューですべて再生され、戻るときは逆再生されます。
- **レイヤーとグループ** – 画面ごとのレイヤーパネルで重なり順を変えられます。グループにすると重なりを保ったまま一緒に動き、選んだ部品はまとめてコピーして別の画面に貼り付けられます。
- **テーマ** – 7 種のパレットか、ベース色 1 つから作る Material 3 のスキーム（微調整可）、ライトとダーク、3 段階のコントラスト、ダイナミックカラー。全部品の角丸をスクエア、標準、フルでまとめて切り替え。Roboto、Roboto Flex、Roboto Serif、システムフォント。スタンダードかエクスプレッシブのモーションで、プレビューにも反映されます。
- **プロンプト** – デザイン全体か 1 画面を、日本語・英語・中国語・韓国語の簡潔な指示文にします。部品ごとのメモも入ります。横並び、重なり、そろったカードのグリッドも書き出すので、生成されるレイアウトが崩れにくくなります。実装先は Android か Web を選べ、コピー前に手で編集したり、画面を PNG で保存したりできます。
- **整える** – ボタンひとつでバーを端に、FAB を隅に寄せ、隣り合う部品をつなげ、残りを余白 16dp で積み直します。もう一度押すと元に戻ります。
- **AI 補助（任意）** – OpenAI、Claude、Gemini、DeepSeek の自分のキーを入れると、ひと言からデザインを下書きしたり、部品の動作や画面の説明を書いたりしてくれます。書き換えはすべて元に戻せます。リクエストはブラウザからプロバイダへ直接送られます。
- **共有リンク** – デザインを相手のキャンバスで開けるリンクをコピーできます。Claude Code や Codex などのエージェント向けの指示もコピーでき、エージェントは [agent.md](public/agent.md) を読んでスケッチを作り、そのリンクで返してきます。
- **そのほか** – 補助線と 4dp グリッド、Undo / Redo、キーボードショートカット、キーボードで使える部品パネル、お気に入り、アプリとしてインストール、ブラウザへの自動保存。
- **スマホでは** – 1 画面固定のボタン専用エディタになり、ボトムシートで編集します。フル機能は PC のブラウザ向けです。

</details>

## <img src="docs/readme/ui/icon-keyboard.png" width="32" height="32" align="absmiddle" alt="" /> キーボード

| キー | 操作 |
| --- | --- |
| `V` / `H` | 選択 / ハンドツール（`Space` 長押しでパン） |
| ホイール、`Ctrl` + ホイール | パン、ズーム |
| `+` `-` `0` | 拡大、縮小、全体表示 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 元に戻す / やり直す |
| `Ctrl+C` / `Ctrl+V` | 部品のコピー / 貼り付け（画面をまたいでも可） |
| `Ctrl+D` | 複製 |
| `Ctrl+G` / `Ctrl+Shift+G` | グループ化 / 解除 |
| `Shift` + クリック | 選択に追加 |
| 矢印キー（`Shift` で 8dp） | 少しずつ移動 |
| `Ctrl` + ドラッグ | スナップせずに移動（補助線と 4dp グリッドなし） |
| `Delete` | 部品や画面を削除 |
| `P` | プレビュー |

## <img src="docs/readme/ui/icon-run.png" width="32" height="32" align="absmiddle" alt="" /> 手元で動かす

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # ./out に静的書き出し
```

静的サイトとして書き出す構成です。サブパス（GitHub Pages のプロジェクトサイトなど）で配信するときはビルド時に `NEXT_PUBLIC_BASE_PATH=/リポジトリ名` を指定してください。`.github/workflows/deploy.yml` が `main` への push ごとにこれを行い、GitHub Pages に公開します。

## <img src="docs/readme/ui/icon-contribute.png" width="32" height="32" align="absmiddle" alt="" /> 貢献

バグ報告、部品のリクエスト、PR を歓迎します。手順と約束事（コメントは英語、文言は 4 言語すべて）は [CONTRIBUTING.md](CONTRIBUTING.md) にまとめています。質問は [Discussions](https://github.com/lnkiai/m3e-canvas/discussions) へどうぞ。

## <img src="docs/readme/ui/icon-support.png" width="32" height="32" align="absmiddle" alt="" /> 支援

M3E Canvas は無料で MIT ライセンスのまま続けます。時間の節約になったら、[GitHub Sponsors](https://github.com/sponsors/lnkiai) で開発を支えてもらえると助かります。新しい部品、プロンプトの調整、貢献のレビューにかかる時間に充てます。支援の有無で使える機能は変わりません。

<p><a href="https://github.com/sponsors/lnkiai"><img src="docs/readme/ui/sponsor-ja.png" height="48" alt="GitHub Sponsors で支援する" /></a></p>

開発を支えてくださっているスポンサーの方々に感謝します。

<!-- sponsors:start -->
<p><a href="https://github.com/YspritanHyzygy" title="YspritanHyzygy"><img src="docs/readme/people/YspritanHyzygy.png" width="52" height="52" alt="YspritanHyzygy" /></a></p>
<!-- sponsors:end -->

## <img src="docs/readme/ui/icon-thanks.png" width="32" height="32" align="absmiddle" alt="" /> 謝辞

コード、アイデア、レビューで関わってくださったみなさん、ありがとうございます。

<!-- contributors:start -->
<p><a href="https://github.com/CQMHV" title="CQMHV"><img src="docs/readme/people/CQMHV.png" width="52" height="52" alt="CQMHV" /></a> <a href="https://github.com/Cokedog320" title="Cokedog320"><img src="docs/readme/people/Cokedog320.png" width="52" height="52" alt="Cokedog320" /></a> <a href="https://github.com/Grenish" title="Grenish"><img src="docs/readme/people/Grenish.png" width="52" height="52" alt="Grenish" /></a> <a href="https://github.com/YspritanHyzygy" title="YspritanHyzygy"><img src="docs/readme/people/YspritanHyzygy.png" width="52" height="52" alt="YspritanHyzygy" /></a> <a href="https://github.com/andrewwbuilds" title="andrewwbuilds"><img src="docs/readme/people/andrewwbuilds.png" width="52" height="52" alt="andrewwbuilds" /></a> <a href="https://github.com/rishabhiskawai" title="rishabhiskawai"><img src="docs/readme/people/rishabhiskawai.png" width="52" height="52" alt="rishabhiskawai" /></a> <a href="https://github.com/j-token" title="j-token"><img src="docs/readme/people/j-token.png" width="52" height="52" alt="j-token" /></a> <a href="https://github.com/FlyGues2889" title="FlyGues2889"><img src="docs/readme/people/FlyGues2889.png" width="52" height="52" alt="FlyGues2889" /></a> <a href="https://github.com/xiehuanyi" title="xiehuanyi"><img src="docs/readme/people/xiehuanyi.png" width="52" height="52" alt="xiehuanyi" /></a> <a href="https://github.com/Razshy" title="Razshy"><img src="docs/readme/people/Razshy.png" width="52" height="52" alt="Razshy" /></a> <a href="https://github.com/aakash-kharb" title="aakash-kharb"><img src="docs/readme/people/aakash-kharb.png" width="52" height="52" alt="aakash-kharb" /></a> <a href="https://github.com/kevin9327" title="kevin9327"><img src="docs/readme/people/kevin9327.png" width="52" height="52" alt="kevin9327" /></a></p>
<!-- contributors:end -->

## <img src="docs/readme/ui/icon-credits.png" width="32" height="32" align="absmiddle" alt="" /> クレジット

- ローディングの形とアニメーションのモデル: [material-components-android](https://github.com/material-components/material-components-android)（Apache-2.0）、[Aler1x/m3-loading-indicator](https://github.com/Aler1x/m3-loading-indicator) 経由。`NOTICE` を参照してください。
- アイコン: [Material Symbols](https://fonts.google.com/icons)（Apache-2.0）。フォントは Google Fonts から読み込みます。

## <img src="docs/readme/ui/icon-seealso.png" width="32" height="32" align="absmiddle" alt="" /> 関連プロジェクト

- [matraic/m3e](https://github.com/matraic/m3e) – Material 3 Expressive を Lit の Web Components にしたもの（MIT）。React バインディングとアイコンパッケージ付き。ここで描いた画面の実装先に向いています。
- [Beer CSS](https://www.beercss.com/) – Material Design 3 の CSS フレームワーク（MIT）。描いた画面を Web で作るもう 1 つの選択肢です。

## <img src="docs/readme/ui/icon-contact.png" width="32" height="32" align="absmiddle" alt="" /> 連絡先

Issue に向かない相談（協業や取材など）は、こちらからどうぞ。

<p><a href="mailto:info@lnkiai.com"><img src="docs/readme/ui/contact-mail.png" height="48" alt="info@lnkiai.com" /></a><a href="https://x.com/lnkiai"><img src="docs/readme/ui/contact-x.png" height="48" alt="@lnkiai on X" /></a></p>

## <img src="docs/readme/ui/icon-license.png" width="32" height="32" align="absmiddle" alt="" /> ライセンス

MIT © lnkiai
