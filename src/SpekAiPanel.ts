import * as vscode from 'vscode';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';

export class SpekAiPanel {
    public static currentPanel: SpekAiPanel | undefined;
    public static readonly viewType = 'spekai';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SpekAiPanel.currentPanel) {
            SpekAiPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            SpekAiPanel.viewType,
            'SpekAi Tester',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'ui', 'dist')]
            }
        );

        SpekAiPanel.currentPanel = new SpekAiPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'fetchOpenApiSpec':
                        this._fetchOpenApiSpec(message.url, message.clientCert);
                        return;
                    case 'testApiOperation':
                        this._testApiOperation(message.operation);
                        return;
                    case 'generateLLMJson':
                        this._generateLLMJson(message.prompt, message.operationId);
                        return;
                    case 'saveTestData':
                        this._saveTestData(message.testData, message.operationId);
                        return;
                    case 'loadTestData':
                        this._loadTestData(message.currentOperationId);
                        return;
                    case 'browseFile':
                        this._browseFile(message.fileType);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        SpekAiPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'ui', 'dist', 'index.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        const stylePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'ui', 'dist', 'index.css');
        const styleUri = webview.asWebviewUri(stylePathOnDisk);

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>SpekAi Tester</title>
            </head>
            <body>
                <div id="root"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async _fetchOpenApiSpec(url: string, clientCert?: any) {
        try {
            let content: string;
            let spec: any;

            if (url.startsWith('file://')) {
                // Handle local file loading
                let filePath = url.replace('file://', '');
                
                // Handle Windows-style paths vs Unix-style paths
                if (process.platform === 'win32') {
                    // On Windows, remove leading slash and convert forward slashes to backslashes
                    filePath = filePath.replace(/^\//, '').replace(/\//g, '\\');
                } else {
                    // On Unix-like systems, ensure leading slash is present
                    if (!filePath.startsWith('/')) {
                        filePath = '/' + filePath;
                    }
                }
                
                content = await fs.promises.readFile(filePath, 'utf8');
            } else {
                // Handle HTTP/HTTPS URLs
                content = await this._httpGet(url, clientCert);
            }

            // Parse the content - try JSON first, then YAML
            try {
                spec = JSON.parse(content);
            } catch (jsonError) {
                // If JSON parsing fails, try YAML parsing
                try {
                    spec = yaml.load(content);
                } catch (yamlError) {
                    throw new Error(`Failed to parse as JSON or YAML: JSON error: ${jsonError}, YAML error: ${yamlError}`);
                }
            }
            
            this._panel.webview.postMessage({
                command: 'openApiSpecLoaded',
                spec: spec,
                specUrl: url
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Failed to fetch OpenAPI spec: ${error}`
            });
        }
    }

    private async _testApiOperation(operation: any) {
        try {
            // Handle request body properly - don't double-stringify
            let requestBody: string | undefined;
            if (operation.body !== undefined) {
                // Safety check: make sure we're not sending schema objects
                if (typeof operation.body === 'object' && 
                    (operation.body.hasOwnProperty('content') || 
                     operation.body.hasOwnProperty('schema') ||
                     operation.body.hasOwnProperty('description'))) {
                    console.error('Detected schema object being sent as request body:', operation.body);
                    requestBody = undefined;
                } else if (typeof operation.body === 'string') {
                    requestBody = operation.body;
                } else {
                    requestBody = JSON.stringify(operation.body);
                }
            }

            const result = await this._httpRequest(operation.url, {
                method: operation.method,
                headers: operation.headers || {},
                body: requestBody,
                clientCert: operation.clientCert
            });
            
            this._panel.webview.postMessage({
                command: 'operationTestResult',
                operationId: operation.id,
                result: result.body,
                status: result.statusCode
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'operationTestError',
                operationId: operation.id,
                error: `Test failed: ${error}`
            });
        }
    }

    private async _httpGet(url: string, clientCert?: any): Promise<string> {
        const response = await this._httpRequest(url, {
            method: 'GET',
            headers: {},
            clientCert: clientCert
        });
        return response.body;
    }

    private _httpRequest(url: string, options: any): Promise<{body: string, statusCode: number}> {
        return new Promise((resolve, reject) => {
            let urlObj: URL;
            try {
                urlObj = new URL(url);
            } catch (error) {
                reject(new Error(`Invalid URL: ${url}. Error: ${error}`));
                return;
            }
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions: any = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {}
            };

            // Add client certificate options if provided
            if (options.clientCert && options.clientCert.enabled) {
                try {
                    if (options.clientCert.certPath) {
                        requestOptions.cert = fs.readFileSync(options.clientCert.certPath);
                    }
                    if (options.clientCert.keyPath) {
                        requestOptions.key = fs.readFileSync(options.clientCert.keyPath);
                    }
                    if (options.clientCert.passphrase) {
                        requestOptions.passphrase = options.clientCert.passphrase;
                    }
                    if (options.clientCert.caCertPath) {
                        requestOptions.ca = fs.readFileSync(options.clientCert.caCertPath);
                    }
                } catch (certError) {
                    reject(new Error(`Client certificate error: ${certError}`));
                    return;
                }
            }

            const req = client.request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({
                        body: data,
                        statusCode: res.statusCode || 0
                    });
                });
            });

            req.on('error', reject);

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    private async _generateLLMJson(prompt: string, operationId: string) {
        try {
            // Get Claude API key from VSCode settings or environment variables
            const config = vscode.workspace.getConfiguration('spekai');
            let apiKey = config.get<string>('claudeApiKey');
            
            // Fallback to environment variable if not in settings
            if (!apiKey) {
                apiKey = process.env.ANTHROPIC_API_KEY;
            }
            
            if (!apiKey) {
                throw new Error('Claude API key not found. Please set it in VSCode settings (spekai.claudeApiKey) or ANTHROPIC_API_KEY environment variable.');
            }

            const anthropic = new Anthropic({
                apiKey: apiKey,
            });

            const message = await anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2000,
                temperature: 0.7,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            });

            // Extract the generated JSON from Claude's response
            const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
            
            // Try to extract JSON from the response (in case Claude adds explanation)
            let generatedJson = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                generatedJson = jsonMatch[0];
            }

            // Validate that it's proper JSON
            try {
                JSON.parse(generatedJson);
            } catch (parseError) {
                throw new Error(`Generated content is not valid JSON: ${parseError}`);
            }
            
            this._panel.webview.postMessage({
                command: 'llmJsonGenerated',
                operationId: operationId,
                generatedJson: generatedJson
            });

        } catch (error) {
            console.error('Claude API error:', error);
            this._panel.webview.postMessage({
                command: 'llmJsonError',
                operationId: operationId,
                error: `LLM generation failed: ${error instanceof Error ? error.message : error}`
            });
        }
    }

    private async _saveTestData(testData: any, operationId: string) {
        try {
            // Create a safe filename
            const operation = testData.operation;
            const safePathName = operation.path.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `spekai-test-${operation.method}-${safePathName}-${Date.now()}.json`;
            
            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                const dataStr = JSON.stringify(testData, null, 2);
                await fs.promises.writeFile(saveUri.fsPath, dataStr, 'utf8');
                
                this._panel.webview.postMessage({
                    command: 'testDataSaved',
                    operationId: operationId,
                    filePath: saveUri.fsPath
                });

                vscode.window.showInformationMessage(`Test data saved to ${path.basename(saveUri.fsPath)}`);
            }
        } catch (error) {
            console.error('Save test data error:', error);
            this._panel.webview.postMessage({
                command: 'saveLoadError',
                error: `Failed to save test data: ${error instanceof Error ? error.message : error}`
            });
        }
    }

    private async _loadTestData(currentOperationId: string) {
        try {
            // Show open dialog
            const openUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (openUri && openUri[0]) {
                const fileContent = await fs.promises.readFile(openUri[0].fsPath, 'utf8');
                const testData = JSON.parse(fileContent);
                
                // Validate the file format
                if (!testData.inputJson || !testData.operation) {
                    throw new Error('Invalid test data file format');
                }
                
                this._panel.webview.postMessage({
                    command: 'testDataLoaded',
                    testData: testData  // Send the full test data, frontend will find the matching operation
                });

                const operation = testData.operation;
                vscode.window.showInformationMessage(
                    `Test data loaded from ${path.basename(openUri[0].fsPath)} for ${operation.method} ${operation.path}`
                );
            }
        } catch (error) {
            console.error('Load test data error:', error);
            this._panel.webview.postMessage({
                command: 'saveLoadError',
                error: `Failed to load test data: ${error instanceof Error ? error.message : error}`
            });
        }
    }

    private async _browseFile(fileType: string) {
        try {
            // Determine file filters based on file type
            let filters: { [name: string]: string[] };
            let title: string;
            
            switch (fileType) {
                case 'clientCert':
                    filters = {
                        'Certificate Files': ['crt', 'pem', 'cer'],
                        'All Files': ['*']
                    };
                    title = 'Select Client Certificate File';
                    break;
                case 'clientKey':
                    filters = {
                        'Key Files': ['key', 'pem'],
                        'All Files': ['*']
                    };
                    title = 'Select Client Private Key File';
                    break;
                case 'caCert':
                    filters = {
                        'Certificate Files': ['crt', 'pem', 'cer'],
                        'All Files': ['*']
                    };
                    title = 'Select CA Certificate File';
                    break;
                case 'openApiSpec':
                    filters = {
                        'OpenAPI/Swagger Files': ['json', 'yaml', 'yml'],
                        'JSON Files': ['json'],
                        'YAML Files': ['yaml', 'yml'],
                        'All Files': ['*']
                    };
                    title = 'Select OpenAPI Specification File';
                    break;
                default:
                    filters = {
                        'All Files': ['*']
                    };
                    title = 'Select File';
            }

            // Show open dialog
            const openUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: filters,
                openLabel: 'Select',
                title: title
            });

            if (openUri && openUri[0]) {
                this._panel.webview.postMessage({
                    command: 'fileSelected',
                    fileType: fileType,
                    filePath: openUri[0].fsPath
                });
            }
        } catch (error) {
            console.error('Browse file error:', error);
            vscode.window.showErrorMessage(`Failed to browse file: ${error instanceof Error ? error.message : error}`);
        }
    }
}