# m3e-canvas

A [Model Context Protocol](https://modelcontextprotocol.io/) server for [M3E Canvas](https://lnkiai.github.io/m3e-canvas/), the browser editor for Material 3 Expressive screens.

With it connected, an AI agent can design the screens of an app and hand you a link. Opening the link adds the design to your projects in M3E Canvas, where you refine it. Give the agent the link of the finished design, and it builds the app from the prompt M3E Canvas writes for it.

The server runs on your machine and talks only to the agent that started it. It sends nothing anywhere and does not drive a browser: the link itself carries the design. While it runs, the one thing it can write is a design file, when the agent is asked for one, and the one thing it reads is a design file you point it at.

## Set up

You need Node.js 20 or later. Run this in a terminal, on macOS, Linux or Windows:

```sh
npx -y m3e-canvas@latest setup
```

It finds Claude Code, Codex, Claude Desktop, Cursor and VS Code on your computer, shows which settings would change, and registers the server with the ones you pick. Your other servers and settings keep their values, and a file it cannot read whole is left alone. Restart the tools afterwards.

Run it again to renew an older setting, the ones 1.0.0 made for single folders in Claude Code among them. To take the server out again:

```sh
npx -y m3e-canvas@latest remove
```

Both take the names of tools (`claude-code`, `codex`, `claude-desktop`, `cursor`, `vscode`) to leave the others alone, and `--yes` to be asked nothing.

<details>
<summary>Set it up by hand</summary>

**Claude Code**

```sh
claude mcp add --scope user m3e-canvas -- npx -y m3e-canvas
```

**Codex**

```sh
codex mcp add m3e-canvas -- npx -y m3e-canvas
```

**Claude Desktop, Cursor and other clients that read `mcpServers`**

```json
{
  "mcpServers": {
    "m3e-canvas": {
      "command": "npx",
      "args": ["-y", "m3e-canvas"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "m3e-canvas": {
      "command": "npx",
      "args": ["-y", "m3e-canvas"]
    }
  }
}
```

On Windows, a client that cannot start `npx` takes `"command": "cmd"` with `"args": ["/c", "npx", "-y", "m3e-canvas"]`.

</details>

Then ask for a design:

> In M3E Canvas, design the screens of an app for saving and searching recipes.

The agent replies with a link. Open it.

## Tools

| Tool | What it does |
|---|---|
| `get_guide` | Returns the guide to the design format: the document's fields and every kind of part. |
| `create_design_link` | Checks a design and returns the link that opens it as a new project, or says what to fix, with the path of each field. |
| `save_design_file` | Checks a design and saves it as a `.json` file, for a design too large for a link. Never writes over an existing file. |
| `read_design` | Returns the design in a link or a saved file, so an existing design can be changed. |
| `get_build_prompt` | Returns the prompt M3E Canvas writes for a design, from its link or its saved file, so the agent can build the app that was drawn. |

To change a design you already have, press **Copy link** in the app's **Ask an AI** dialog and give the link to the agent.

To have the app built, give the agent the same link and ask for it:

> Build the app in this M3E Canvas design: https://lnkiai.github.io/m3e-canvas/#docz=...

The agent gets the prompt the app itself writes for that design (the screens part by part, the color scheme, the theme, and how the screens connect) and builds from it. The prompt is in English unless you ask for Japanese, Chinese or Korean.

A saved file opens from the projects page: **Open from file**, or drop it on the page.

## Options

`M3E_CANVAS_URL` sets the address the links open, for a copy of the app hosted somewhere else. It defaults to `https://lnkiai.github.io/m3e-canvas/`. Set while `setup` runs, it is written into the settings.

## License

MIT. The source is in [`packages/mcp`](https://github.com/lnkiai/m3e-canvas/tree/main/packages/mcp) of the M3E Canvas repository.
