 # CodeForge Studio — A modern code notebook in two modes (programming language + SQL)

**English** | **[Русский](README.md)**

A clean, fast desktop code editor with execution, compilation, file handling, and SQL support.

## 🚀 Features

- ✨ Modern UI in dark theme
- 🎨 Syntax highlighting for many languages (CodeMirror 6)
- ⚡ Fast editing, current line highlight, line numbers, code folding, minimap
- ▶️ Run JavaScript in the browser; Python, Java, C++, C#, Go via Electron
- 📁 **File operations:** Open, Save, Save As (OS dialogs)
- 📂 **Recent files** — dropdown of last opened/saved files
- 📑 **Split view** — left and right panes, each with its own tabs and Open/Save buttons
- 🗄️ **SQL mode** — queries on the left, tables and ER diagram on the right (SQLite in-memory, PostgreSQL, Oracle)
- ⌨️ Shortcuts (F8, Ctrl+Enter, Ctrl+Alt+L, Ctrl+T, etc.)
- 💾 Auto-save of tabs and code to localStorage; **dirty tabs** (• in the name and a prompt when closing)

## 📋 Requirements

- Node.js (v16 or higher)
- npm or yarn

## 🔧 Install and run

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development mode

```bash
npm run electron-dev
```

Starts React at http://localhost:3000 and the Electron window.

### 3. Production build

```bash
npm run build
npm run electron
```

### 4. Create installer

```bash
npm run electron-pack
```

For Windows:

```bash
npm run electron-pack-win
```

## 🎮 Usage

1. Select the language from the dropdown.
2. Write code in the editor.
3. Click **Run** or press `Ctrl+Enter` / `F8` — output appears in the result panel.

### File operations

- **Open** — file picker; content is loaded into the current tab (in split view, the left pane’s active tab).
- **Save** — saves to the current tab’s file (or opens Save As if no path).
- **Save As** — always asks for a path and saves to the chosen file.
- **Recent files** — dropdown in the top bar; choosing an item opens that file in the current editor.

In **Split view**, the right pane has its own **Open / Save / Save As** for the right pane’s active tab.

### Tabs and unsaved changes

- If the tab’s code changed after open or last save, a **•** is shown in the tab name.
- Closing such a tab asks: “Save changes?”.

### SQL mode

- The **SQL** button switches to query mode: SQL editor on the left, table list, table data view, and ER diagram on the right.
- Dialects: **SQL (in-memory)** (sql.js), **PostgreSQL**, **Oracle** (connection settings in the panel for the last two).

## 🛠️ Supported languages

- JavaScript (runs in browser)
- TypeScript, Python, Java, Go, C++, C#
+- HTML, CSS
+- Plain text (no syntax highlighting)

## ⌨️ Shortcuts

| Action          | Keys                 |
|-----------------|----------------------|
| Run code        | `F8`, `Alt+F8`, `Ctrl+Enter` |
| Format code     | `Ctrl+Alt+L`         |
| New tab         | `Ctrl+T`             |
| Toggle comment  | `Ctrl+/`             |
| Duplicate line  | `Ctrl+D`             |
| Select all      | `Ctrl+A`             |
| Trim line       | `Ctrl+L`             |

## 📝 Notes

- JavaScript runs in the browser; **Java, Python, C++, C#, Go** run via Electron (main process). They do not run in the browser without Electron.
- For Java / C++ / C# / Go you need the corresponding compilers/interpreters in PATH (JDK, Python, g++/MSVC, .NET SDK, Go).
- For **clean Java code**, you can use `google-java-format` (if installed and available in PATH): press `Ctrl+Alt+L` when the language is Java.
- There is a dedicated stdin field for Java: everything you type there is passed to `Scanner(System.in)` as standard input lines.
- The editor is built on **CodeMirror 6** (@uiw/react-codemirror).

## 🎨 Interface

- Dark theme, customizable themes and syntax colors
- Current line highlight in the editor
- Settings: font, size, tab width, minimap

## 💬 Feedback

- **[Issues](https://github.com/Alexiisssss/CodeForgeStudio/issues)** — bugs and ideas
- **[Discussions](https://github.com/Alexiisssss/CodeForgeStudio/discussions)** — discussions and questions

---

Made with ❤️ for comfortable coding · **Aleksey Volkov**
