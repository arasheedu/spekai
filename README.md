# SpekAi - OpenAPI Testing Extension for VS Code

A VS Code extension that provides a React-based UI for testing OpenAPI specifications.

## Features

- **URL Input**: Enter any OpenAPI specification URL
- **Dynamic UI Generation**: Automatically generates UI components for each API operation
- **Parameter Input**: Edit request parameters, headers, and query parameters
- **Request Body Editor**: JSON editor for request bodies
- **Test Execution**: Execute API calls directly from the UI
- **Response Display**: View API responses with status codes and error handling

## Usage

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run the command "Open SpekAi Tester"
3. Enter an OpenAPI specification URL (e.g., `https://petstore3.swagger.io/api/v3/openapi.json`)
4. Click "Load" to fetch and parse the specification
5. Fill in parameters and request bodies for the operations you want to test
6. Click "Test" to execute API calls and view responses

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm

### Setup

```bash
# Install dependencies
npm install
cd ui && npm install && cd ..

# Build the extension
npm run compile
cd ui && npm run build && cd ..
```

### Running

1. **Open this folder in VS Code**
2. **Make sure all dependencies are installed**: Run `npm install` and `cd ui && npm install`
3. **Build the project**: Run `npm run compile` and `cd ui && npm run build`  
4. **Press F5** to run the extension in a new Extension Development Host window
5. **In the new window**, open Command Palette (`Ctrl+Shift+P`) and run **"Open SpekAi Tester"**

### Troubleshooting

If you get "Cannot find module 'vscode'" error:
- This error is normal when testing the extension outside VSCode
- The `vscode` module is only available inside VSCode's extension host environment
- Make sure to run the extension using F5 from within VSCode, not from command line
- Ensure you have built both the extension (`npm run compile`) and UI (`cd ui && npm run build`)

## Project Structure

```
├── src/                 # Extension TypeScript source
│   ├── extension.ts     # Main extension entry point
│   └── SpekAiPanel.ts   # Webview panel management
├── ui/                  # React UI source
│   ├── src/
│   │   ├── App.tsx      # Main React component
│   │   ├── index.tsx    # React entry point
│   │   └── index.css    # Styles
│   ├── dist/            # Built UI files
│   └── package.json     # UI dependencies
├── out/                 # Compiled extension
└── package.json         # Extension manifest
```

## Building for Distribution

```bash
npm run vscode:prepublish
```

This will compile the extension and build the UI for production.