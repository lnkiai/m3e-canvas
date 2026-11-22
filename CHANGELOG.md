# Changelog

## 1.0.0

M3E Canvas now keeps many designs instead of one, and an AI agent can use it directly: to draw the screens for you, and to build the app from the screens you drew.

### Projects

- **Many designs, each a project.** The projects page lists them with a preview of their screens. Search, rename, duplicate, save one to a file, or delete it (with undo).
- **The design you already had becomes your first project.** Nothing is lost on the way: it is copied, and the original is left where it was.
- **A link or a file opens as a new project** instead of replacing what you were working on. Open one from a file, from a pasted link, or by dropping a file on the page.
- **Projects are kept in the browser's database**, so designs with pictures fit where they did not before. Editing the same project in two tabs is guarded: the second tab opens it read-only.
- **Export all** writes every project into one file, and opening that file brings the list back, in another browser too. The app also asks the browser not to clear its storage on its own.
- The page wears the colors of the project you opened last.

### MCP server

The [`m3e-canvas`](https://www.npmjs.com/package/m3e-canvas) package on npm is an MCP server. It connects M3E Canvas to Claude Code, Claude Desktop, Cursor, VS Code, Codex or any other MCP client.

```bash
claude mcp add m3e-canvas -- npx -y m3e-canvas
# on Windows
claude mcp add m3e-canvas -- cmd /c npx -y m3e-canvas
```

- **Ask for a design, get a link.** The agent reads the guide, writes the design, has it checked, and replies with the link that opens it as a new project. A very large design is saved as a file instead.
- **Change a design you have.** Give the agent the design's link and say what to change.
- **Have the app built.** Give the agent the link of a design you finished: it gets the same prompt the app writes (every screen part by part, the color scheme, the theme, how the screens connect) and builds from it.
- Six tools: `get_guide`, `check_design`, `create_design_link`, `save_design_file`, `read_design_link`, `get_build_prompt`.
- It runs on your machine, sends nothing anywhere and does not drive a browser. It needs Node.js 20 or later.
- The set-up for each client is in the app: **Ask an AI → MCP integration**, or `/mcp/`.

### Ask an AI

- The dialog is rebuilt around three ways to work with an AI: have it draw here, hand an instruction to your own agent, or connect over MCP.
- The app has a character: a Material shape with eyes that follows the pointer and reacts as you type.
- The agent guide (`agent.md`) is no longer marked beta.

### Editor

- **One Theme tab.** Color, shape, type and motion are gathered in it; the rail is now Parts, Layers, Theme and AI.
- **Zooming is eased**, from the buttons, the keyboard, the wheel and a pinch alike.
- **The right panel slides** open and shut instead of jumping.
- The logo leads to the projects page, and from there back to the editor.

### Prompt

- A group of parts that do not connect (checkboxes or lines of text put in one group, as an agent may write them) is now described part by part. It used to be called a connected button group.
- Your own sentences (the app's description, a screen's note) end with the full stop of the language they are written in, whatever language the prompt is in.

### Notes

- Everything is still stored in your browser and nothing is uploaded. Keep a copy of work that matters: **Export all** on the projects page, or **Save project** for one.
- The phone editor works on one project at a time and has no way to the projects page yet.
