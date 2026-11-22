# Contributing to M3E Canvas

Thanks for your interest. This page explains how to report problems, propose
changes and send code. Japanese, Chinese and Korean summaries are at the end.

## Before you start

- **Bugs and small fixes**: open an issue or a pull request directly.
- **New parts, new panels, prompt wording, anything larger**: please open an
  issue first so we can agree on the shape of the change before you spend
  time on it. Material 3 Expressive has a specific vocabulary, and the prompt
  is tuned carefully; a short discussion up front saves rework.
- **Questions and ideas**: use [Discussions](https://github.com/lnkiai/m3e-canvas/discussions).

## Setting up

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
npm run build      # static export into out/
npm run build:mcp  # the MCP server, into packages/mcp/dist/
```

Node 22.12 or newer is required (the test suite needs it); CI uses Node 22. The app is a single Next.js page with no server; everything is stored in the browser.

## Where things live

| Area | Files |
|---|---|
| Part definitions, sizes, corners, theme | `lib/tokens.ts` |
| UI strings and part defaults (ja / en / zh / ko) | `lib/i18n.ts` |
| Drawing a part | `components/M3Node.tsx` |
| Editing a part (desktop / phone) | `components/Inspector.tsx`, `components/Mobile.tsx` |
| Tap-through preview | `components/Preview.tsx` |
| Prompt text (ja / en / zh / ko) | `lib/prompt.ts` |
| Color schemes | `lib/color.ts`, `components/ColorPanel.tsx` |
| Shape / type / motion panels | `components/ThemePanel.tsx` |
| The editor itself | `app/Editor.tsx` (`app/page.tsx` picks the project it opens) |
| Projects: the store, the list page, backups | `lib/projects.ts`, `components/Projects.tsx`, `lib/backup.ts` |
| What a design file or link must hold | `lib/project.ts`, `lib/check.ts`, `lib/share.ts` |
| The guide an AI agent reads | `public/agent.md` |
| MCP server (published to npm as `m3e-canvas`) | `packages/mcp/` |

### Adding a part

A new kind touches all of these; the existing kinds are the reference:

1. `Kind`, `KIND_SPEC`, `KIND_ORDER` and, if needed, `sizeOf` / `baseRadii` / `iconSlotsOf` in `lib/tokens.ts`
2. `KIND_TEXT` for all four languages in `lib/i18n.ts`
3. Rendering in `components/M3Node.tsx` (and `MEASURED` / `NO_BOX` when it applies). A kind added to `MEASURED` is as wide as its text: give it a case in `estimatedWidth` in `lib/widths.ts` as well, which is how the MCP server places it without a browser
4. The item sentence in `itemJa`, `itemEn`, `itemZh`, `itemKo` and a `STYLE_NOTES` entry per language in `lib/prompt.ts`
5. Any special editor in `components/Inspector.tsx`; tap targets in `components/Preview.tsx` if it is tappable
6. The kind and its fields in `public/agent.md`, and the checks in `lib/check.ts`, so an agent can write it

The MCP server carries its own copy of the guide, the checks and the prompt, so changes to those reach people's agents only when the server is published again. [RELEASING.md](RELEASING.md) says when and how.

## Conventions

- Code comments are in English. UI strings and prompt text exist in Japanese,
  English, Chinese and Korean; a string added in one language must be added in all four.
- Use the standard Material 3 Expressive values (sizes, corners, tokens) and name
  them the way Material does. When in doubt, link the Material page in your PR.
- Keep the editor chrome and the parts on separate paths: parts are drawn from the
  palette tokens only, so they stay correct in dark mode and under every scheme.
- Small, focused pull requests are easier to review than one large one.
- Commit messages are in English and describe the change, not the file.

## Pull requests

- Branch from `main` in your fork.
- Run `npm run typecheck`, `npm test` and `npm run build`; CI runs the same on every PR, and builds the MCP server too.
- Fill in the PR template: what changed, why, and how you checked it. Screenshots
  help for anything visual.
- By contributing you agree that your changes are licensed under the project's
  [MIT license](LICENSE).

## 日本語

- バグ報告や小さな修正は Issue または PR を直接どうぞ。
- 新しい部品やパネル、プロンプトの文言など大きめの変更は、先に Issue で相談してください。
- 質問やアイデアは Discussions へ。
- コードのコメントは英語で書きます。UI の文言とプロンプト文は日本語・英語・中国語・韓国語の 4 言語すべてに追加してください。
- PR の前に `npm run typecheck`、`npm test`、`npm run build` を通してください。CI でも同じものが走ります。
- 貢献したコードは MIT ライセンスで公開されます。

## 中文

- Bug 报告和小修改可以直接提 Issue 或 PR。
- 新组件、新面板、提示词措辞等较大的改动，请先开 Issue 讨论。
- 提问和想法请到 Discussions。
- 代码注释用英文。UI 文字和提示词需同时提供日文、英文、中文、韩文四种语言。
- 提交 PR 前请运行 `npm run typecheck`、`npm test` 和 `npm run build`，CI 会执行同样的检查。
- 贡献的代码以 MIT 许可证发布。

## 한국어

- 버그 보고나 작은 수정은 Issue 또는 PR로 바로 보내 주세요.
- 새 부품, 새 패널, 프롬프트 문구 등 비교적 큰 변경은 먼저 Issue에서 상의해 주세요.
- 질문과 아이디어는 Discussions로.
- 코드 주석은 영어로 씁니다. UI 문구와 프롬프트 문장은 일본어·영어·중국어·한국어 네 언어 모두에 추가해 주세요.
- PR 전에 `npm run typecheck`, `npm test`, `npm run build`를 통과시켜 주세요. CI에서도 같은 검사가 실행됩니다.
- 기여한 코드는 MIT 라이선스로 공개됩니다.
