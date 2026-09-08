# Security

M3E Canvas is a static site. It has no server and no accounts; everything you draw
stays in your browser's local storage. The only network calls are loading fonts
and, if you turn it on, the optional AI helper: with your own API key entered in
the AI tab, the browser sends the generated description of your whole design
straight to the provider you chose (OpenAI, Anthropic, Google or DeepSeek) and
nothing else. The key is kept in this browser's local storage under `m3e:ai` and
never appears in the prompt, in an exported image, or in the saved document. That keeps
the attack surface small, but if you find something, please tell us.

## Reporting

Use GitHub's private vulnerability reporting for this repository:
**Security → Report a vulnerability**. Please do not open a public issue for
security problems.

Include what you found, how to reproduce it and, if you can, what impact you think
it has. You will get a reply within a week.

## Scope

Things that count: anything that lets a page, a pasted image or a crafted document
run code, read data it should not, or break the site for other visitors. Things
that do not: the prompt text an AI tool generates from your sketch, and the
behaviour of that tool.
