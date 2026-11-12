<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/banner-dark.png" />
    <img src="docs/readme/banner-light.png" width="800" alt="M3E Canvas" />
  </picture>
</p>

<p align="center">
  <strong>Material 3 Expressive 화면을 브라우저에서 스케치하고, 화면끼리 연결하고, 탭해 보며, 그대로 AI 코딩 도구용 프롬프트로 만드는 도구입니다.</strong>
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

<p align="center"><a href="README.md"><img src="docs/readme/ui/lang-en.png" height="40" alt="English" /></a><a href="README.ja.md"><img src="docs/readme/ui/lang-ja.png" height="40" alt="日本語" /></a><a href="README.zh.md"><img src="docs/readme/ui/lang-zh.png" height="40" alt="中文" /></a><a href="README.ko.md"><img src="docs/readme/ui/lang-ko-on.png" height="40" alt="한국어" /></a></p>

<p align="center"><img src="docs/readme/demo.gif" alt="M3E Canvas에서 레시피 앱 Pantry를 만들고, 화면을 탭해 보고, 프롬프트를 복사해 터미널의 Claude Code가 앱을 만들고, 완성된 앱이 휴대전화에서 실행되기까지" /></p>

<p align="center">화면을 만들고, 흐름을 탭해 보고, 프롬프트를 복사해 AI 코딩 도구가 앱을 만들게 합니다. (<a href="docs/readme/demo.mp4">mp4</a>)</p>

M3E Canvas는 진짜 Material 3 Expressive 부품으로 앱 화면을 그리는 무료 오픈소스 스케치 도구입니다. 브라우저에서만 동작하며 계정도, 서버도, 설치도 필요 없습니다. 그린 화면은 정확한 프롬프트가 되어, Claude Code, Codex, Gemini CLI, Cursor 등 프롬프트를 받을 수 있는 AI 코딩 도구라면 무엇이든 동작하는 앱으로 만들 수 있습니다.

<p align="center"><a href="https://lnkiai.github.io/m3e-canvas/"><img src="docs/readme/ui/open-ko.png" height="56" alt="앱 열기" /></a></p>

## <img src="docs/readme/ui/icon-how.png" width="32" height="32" align="absmiddle" alt="" /> 사용 방법

<picture>
  <source media="(max-width: 767px)" srcset="docs/readme/cards/how-narrow.png" />
  <img src="docs/readme/cards/how-wide.png" alt="세 단계: 부품 패널로 화면을 만들고, 미리보기에서 탭해 보고, 프롬프트를 복사합니다" />
</picture>

1. **스케치** — 부품을 휴대전화나 데스크톱 화면으로 드래그합니다. 부품끼리 붙고 4dp 그리드에 맞춰집니다.
2. **탭해 보기** — 부품을 화면에 연결하고 미리보기를 누르면 전환 효과까지 포함해 흐름을 시험할 수 있습니다.
3. **프롬프트 복사** — 디자인 전체가 선택한 언어의 짧은 지시문이 됩니다. AI 코딩 도구에 붙여 넣으면 됩니다.

## <img src="docs/readme/ui/icon-features.png" width="32" height="32" align="absmiddle" alt="" /> 주요 기능

<picture>
  <source media="(max-width: 767px)" srcset="docs/readme/cards/features-narrow.png" />
  <img src="docs/readme/cards/features-wide.png" alt="네 가지 기능: 부품별 패널, 연결된 화면, 색상 패널, 'AI에게 맡기기' 대화상자" />
</picture>

<img src="docs/readme/ui/feature-parts.png" width="24" height="24" align="absmiddle" alt="" /> **진짜 M3 Expressive 부품** — 버튼, FAB, 바, 탭, 카드, 목록, 시트, 선택기, 캐러셀, 로딩 표시기 등. 부품마다 텍스트, 스타일, 크기, 탭했을 때의 동작을 정하는 패널이 있습니다.

<img src="docs/readme/ui/feature-flow.png" width="24" height="24" align="absmiddle" alt="" /> **화면과 흐름** — 휴대전화와 데스크톱 화면, 스크롤되는 긴 화면, 탭이나 스와이프로 원하는 전환 효과와 함께 다른 화면 열기. 전체 흐름은 화살표로 보입니다.

<img src="docs/readme/ui/feature-theme.png" width="24" height="24" align="absmiddle" alt="" /> **테마를 한곳에서** — 색상, 모양, 글꼴, 모션. 7가지 팔레트 또는 나만의 기준 색상, 라이트와 다크, 3단계 대비, 모서리 스타일, 글꼴, 익스프레시브 스프링 모션.

<img src="docs/readme/ui/feature-ai.png" width="24" height="24" align="absmiddle" alt="" /> **선택형 AI 도움** — 자신의 키로 디자인 초안이나 설명을 쓰게 하거나, 코딩 에이전트용 지시를 복사해 공유 링크로 답을 받을 수 있습니다. 키는 브라우저 밖으로 나가지 않습니다.

<details>
<summary><b>할 수 있는 모든 것</b></summary>

- **부품** – 버튼, 아이콘 버튼, FAB와 확장 FAB, FAB 메뉴, 분할 버튼, 칩, 상단 앱 바, 내비게이션 바와 레일, 플로팅 도구 모음, 탭, 검색창, 카드, 목록 항목, 상자, 하단 시트, 대화상자, 스낵바, 텍스트 입력란, 드롭다운, 스위치, 체크박스, 라디오 버튼, 슬라이더, 날짜와 시간 선택기, 텍스트, 이미지, 캐러셀, 카메라와 지도 자리표시자, 구분선, 모양이 변하는 로딩 표시기와 물결 모양 진행 표시기. 모든 부품에 텍스트, 스타일, 크기, 정렬을 정하는 패널과, 탭했을 때의 동작을 정하는 트리거 탭이 있습니다.
- **자석처럼 붙는 연결** – 버튼, 칩, 목록 항목을 가까이 가져가면 하나의 그룹으로 붙고, 맞닿는 모서리가 부드럽게 이어집니다.
- **휴대전화 화면과 데스크톱 화면** – 화면을 원하는 만큼 추가할 수 있습니다. 화면 레이블에서 412×892 휴대전화와 1280×800 데스크톱을 전환하면 바는 늘어나고 내비게이션 바는 레일이 되며(되돌리면 다시 바로), 부품은 다시 배치됩니다. 이름이 같은 화면은 프롬프트에 "한 화면의 두 너비"로 적힙니다.
- **스크롤되는 화면** – 화면을 기기보다 길게 만들면 미리보기에서 본문이 바 아래로 스크롤됩니다. 아래 베젤의 손잡이를 드래그하거나 화면 패널에서 1x~3x를 고를 수 있습니다.
- **탭과 스와이프로 이동** – 탭할 수 있는 부품, 앱 바 아이콘, 내비게이션 항목에 이동할 화면(또는 "뒤로")과 전환 효과를 지정합니다. 상하좌우 슬라이드, 페이드, 확대, 없음. 스와이프로 다른 화면을 열 수도 있으며, 미리보기에서 모두 재생되고 뒤로 갈 때는 반대로 재생됩니다.
- **레이어와 그룹** – 화면마다 레이어 패널에서 겹침 순서를 바꿀 수 있습니다. 그룹으로 묶으면 겹침을 유지한 채 함께 움직이고, 선택한 부품을 통째로 복사해 다른 화면에 붙여 넣을 수 있습니다.
- **테마** – 7가지 팔레트 또는 기준 색상 하나로 만드는 Material 3 색상 구성(세부 조정 가능), 라이트와 다크, 3단계 대비, 동적 색상. 모든 부품의 모서리를 사각형/둥근형/완전 둥근형으로 한 번에 전환. Roboto, Roboto Flex, Roboto Serif, 시스템 글꼴. 표준 또는 익스프레시브 모션이며 미리보기에도 반영됩니다.
- **프롬프트** – 디자인 전체 또는 화면 하나를 일본어·영어·중국어·한국어의 간결한 지시문으로 만들고, 부품별 메모도 넣습니다. 가로 배치, 겹침, 정렬된 카드 그리드까지 적어 주므로 생성되는 레이아웃이 잘 무너지지 않습니다. 구현 대상은 Android 또는 웹을 고를 수 있고, 복사 전에 직접 편집하거나 화면을 PNG로 저장할 수 있습니다.
- **정리** – 버튼 하나로 바를 가장자리에, FAB를 모서리에 붙이고, 이웃한 부품을 연결하며, 나머지를 16dp 여백으로 다시 쌓습니다. 한 번 더 누르면 되돌립니다.
- **AI 도우미(선택)** – OpenAI, Claude, Gemini, DeepSeek 키를 넣으면 한 문장으로 디자인 초안을 만들거나 부품의 동작과 화면 설명을 써 줍니다. 고쳐 쓴 내용은 모두 되돌릴 수 있습니다. 요청은 브라우저에서 제공업체로 직접 전송됩니다.
- **공유 링크** – 디자인을 다른 사람의 캔버스에서 여는 링크를 복사할 수 있습니다. Claude Code, Codex 같은 에이전트용 지시도 복사할 수 있으며, 에이전트가 [agent.md](public/agent.md)를 읽고 스케치를 만들어 그런 링크로 답합니다.
- **그 밖에** – 정렬 안내선과 4dp 그리드, 실행 취소/다시 실행, 키보드 단축키, 키보드로 쓸 수 있는 부품 패널, 즐겨찾기, 앱으로 설치, 브라우저 자동 저장.
- **휴대전화에서는** – 화면 하나가 고정된 버튼 전용 편집기가 되며 하단 시트에서 편집합니다. 전체 기능은 데스크톱 브라우저용입니다.

</details>

## <img src="docs/readme/ui/icon-keyboard.png" width="32" height="32" align="absmiddle" alt="" /> 키보드

| 키 | 동작 |
| --- | --- |
| `V` / `H` | 선택 / 손 도구 (`Space`를 누르고 있으면 이동) |
| 휠, `Ctrl` + 휠 | 이동, 확대/축소 |
| `+` `-` `0` | 확대, 축소, 전체 맞춤 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 실행 취소 / 다시 실행 |
| `Ctrl+C` / `Ctrl+V` | 부품 복사 / 붙여넣기 (화면 간에도 가능) |
| `Ctrl+D` | 복제 |
| `Ctrl+G` / `Ctrl+Shift+G` | 그룹 / 그룹 해제 |
| `Shift` + 클릭 | 선택에 추가 |
| 화살표 (`Shift` = 8dp) | 조금씩 이동 |
| `Ctrl` + 드래그 | 스냅 없이 이동 (안내선과 4dp 그리드 없음) |
| `Delete` | 부품 또는 화면 삭제 |
| `P` | 미리보기 |

## <img src="docs/readme/ui/icon-run.png" width="32" height="32" align="absmiddle" alt="" /> 직접 실행하기

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # ./out 에 정적 내보내기
```

정적 사이트로 내보내는 구성입니다. 하위 경로(GitHub Pages 프로젝트 사이트 등)에서 제공하려면 빌드 시 `NEXT_PUBLIC_BASE_PATH=/저장소이름`을 지정하세요. `.github/workflows/deploy.yml`이 `main`에 push할 때마다 이를 수행해 GitHub Pages에 공개합니다.

## <img src="docs/readme/ui/icon-contribute.png" width="32" height="32" align="absmiddle" alt="" /> 기여

버그 보고, 부품 요청, PR을 환영합니다. 절차와 약속(주석은 영어, 모든 문구는 4개 언어)은 [CONTRIBUTING.md](CONTRIBUTING.md)에 정리되어 있습니다. 질문은 [Discussions](https://github.com/lnkiai/m3e-canvas/discussions)로 보내 주세요.

## <img src="docs/readme/ui/icon-support.png" width="32" height="32" align="absmiddle" alt="" /> 후원

M3E Canvas는 무료이며 MIT 라이선스로 계속 유지됩니다. 시간을 아끼는 데 도움이 되었다면 [GitHub Sponsors](https://github.com/sponsors/lnkiai)에서 개발을 후원해 주세요. 새 부품, 프롬프트 다듬기, 기여 검토에 드는 시간에 쓰입니다. 후원 여부로 기능이 달라지지 않습니다.

<p><a href="https://github.com/sponsors/lnkiai"><img src="docs/readme/ui/sponsor-ko.png" height="48" alt="GitHub에서 후원하기" /></a></p>

개발을 이어갈 수 있게 후원해 주신 분들께 감사드립니다.

<!-- sponsors:start -->
<p><a href="https://github.com/YspritanHyzygy" title="YspritanHyzygy"><img src="docs/readme/people/YspritanHyzygy.png" width="52" height="52" alt="YspritanHyzygy" /></a></p>
<!-- sponsors:end -->

## <img src="docs/readme/ui/icon-thanks.png" width="32" height="32" align="absmiddle" alt="" /> 감사의 말

코드, 아이디어, 리뷰로 함께해 주신 모든 분께 감사드립니다.

<!-- contributors:start -->
<p><a href="https://github.com/CQMHV" title="CQMHV"><img src="docs/readme/people/CQMHV.png" width="52" height="52" alt="CQMHV" /></a> <a href="https://github.com/Cokedog320" title="Cokedog320"><img src="docs/readme/people/Cokedog320.png" width="52" height="52" alt="Cokedog320" /></a> <a href="https://github.com/Grenish" title="Grenish"><img src="docs/readme/people/Grenish.png" width="52" height="52" alt="Grenish" /></a> <a href="https://github.com/YspritanHyzygy" title="YspritanHyzygy"><img src="docs/readme/people/YspritanHyzygy.png" width="52" height="52" alt="YspritanHyzygy" /></a> <a href="https://github.com/andrewwbuilds" title="andrewwbuilds"><img src="docs/readme/people/andrewwbuilds.png" width="52" height="52" alt="andrewwbuilds" /></a> <a href="https://github.com/rishabhiskawai" title="rishabhiskawai"><img src="docs/readme/people/rishabhiskawai.png" width="52" height="52" alt="rishabhiskawai" /></a> <a href="https://github.com/j-token" title="j-token"><img src="docs/readme/people/j-token.png" width="52" height="52" alt="j-token" /></a> <a href="https://github.com/FlyGues2889" title="FlyGues2889"><img src="docs/readme/people/FlyGues2889.png" width="52" height="52" alt="FlyGues2889" /></a> <a href="https://github.com/xiehuanyi" title="xiehuanyi"><img src="docs/readme/people/xiehuanyi.png" width="52" height="52" alt="xiehuanyi" /></a> <a href="https://github.com/Razshy" title="Razshy"><img src="docs/readme/people/Razshy.png" width="52" height="52" alt="Razshy" /></a> <a href="https://github.com/aakash-kharb" title="aakash-kharb"><img src="docs/readme/people/aakash-kharb.png" width="52" height="52" alt="aakash-kharb" /></a> <a href="https://github.com/kevin9327" title="kevin9327"><img src="docs/readme/people/kevin9327.png" width="52" height="52" alt="kevin9327" /></a></p>
<!-- contributors:end -->

## <img src="docs/readme/ui/icon-credits.png" width="32" height="32" align="absmiddle" alt="" /> 크레딧

- 로딩 표시기의 모양과 애니메이션 모델: [material-components-android](https://github.com/material-components/material-components-android)(Apache-2.0), [Aler1x/m3-loading-indicator](https://github.com/Aler1x/m3-loading-indicator)를 거쳐 사용. `NOTICE`를 참고하세요.
- 아이콘: [Material Symbols](https://fonts.google.com/icons)(Apache-2.0). 글꼴은 Google Fonts에서 불러옵니다.

## <img src="docs/readme/ui/icon-seealso.png" width="32" height="32" align="absmiddle" alt="" /> 함께 보기

- [matraic/m3e](https://github.com/matraic/m3e) – Material 3 Expressive를 Lit 웹 컴포넌트로 만든 것(MIT). React 바인딩과 아이콘 패키지 포함. 여기서 그린 화면을 구현하기에 좋습니다.
- [Beer CSS](https://www.beercss.com/) – 순수 CSS로 된 Material Design 3 프레임워크(MIT). 그린 화면을 웹으로 만드는 또 하나의 방법입니다.

## <img src="docs/readme/ui/icon-contact.png" width="32" height="32" align="absmiddle" alt="" /> 연락처

협업이나 취재처럼 Issue에 맞지 않는 문의는 아래로 연락해 주세요.

<p><a href="mailto:info@lnkiai.com"><img src="docs/readme/ui/contact-mail.png" height="48" alt="info@lnkiai.com" /></a><a href="https://x.com/lnkiai"><img src="docs/readme/ui/contact-x.png" height="48" alt="@lnkiai on X" /></a></p>

## <img src="docs/readme/ui/icon-license.png" width="32" height="32" align="absmiddle" alt="" /> 라이선스

MIT © lnkiai
