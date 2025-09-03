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
    private _openApiSpec: any = null; // Store the full OpenAPI spec for reference resolution

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
                        this._fetchOpenApiSpec(message.url, message.clientCert, message.globalHeaders);
                        return;
                    case 'testApiOperation':
                        this._testApiOperation(message.operation);
                        return;
                    case 'generateLLMJson':
                        this._openApiSpec = message.openApiSpec; // Store the spec for reference resolution
                        this._generateLLMJson(message.prompt, message.operationId, message.operation, message.locale, message.globalHeaders);
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

    private async _fetchOpenApiSpec(url: string, clientCert?: any, globalHeaders?: Array<{key: string, value: string}>) {
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
                content = await this._httpGet(url, clientCert, globalHeaders);
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

    private async _httpGet(url: string, clientCert?: any, globalHeaders?: Array<{key: string, value: string}>): Promise<string> {
        // Build headers object from global headers
        const headers: Record<string, string> = {};
        if (globalHeaders && globalHeaders.length > 0) {
            globalHeaders.forEach(header => {
                if (header.key.trim() && header.value.trim()) {
                    headers[header.key.trim()] = header.value.trim();
                }
            });
            console.log('Using global headers for OpenAPI spec request:', Object.keys(headers).join(', '));
        }

        const response = await this._httpRequest(url, {
            method: 'GET',
            headers: headers,
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



    private _buildSchemaInfo(operation: any): string {
        let schemaInfo = `Operation: ${operation.method.toUpperCase()} ${operation.path}\n`;
        
        if (operation.summary) {
            schemaInfo += `Summary: ${operation.summary}\n`;
        }
        
        if (operation.description) {
            schemaInfo += `Description: ${operation.description}\n`;
        }
        
        // Add parameters information
        if (operation.parameters && operation.parameters.length > 0) {
            schemaInfo += '\nParameters:\n';
            operation.parameters.forEach((param: any) => {
                const resolvedSchema = this._resolveSchemaRef(param.schema);
                schemaInfo += `- ${param.name} (${param.in}): ${resolvedSchema?.type || 'string'} - ${param.description || 'No description'}\n`;
                if (param.required) schemaInfo += `  Required: true\n`;
                if (resolvedSchema?.example) schemaInfo += `  Example: ${resolvedSchema.example}\n`;
            });
        }
        
        // Add request body schema
        if (operation.requestBody) {
            schemaInfo += '\nRequest Body Schema:\n';
            const content = operation.requestBody.content;
            if (content) {
                Object.keys(content).forEach(mediaType => {
                    if (content[mediaType].schema) {
                        const resolvedSchema = this._resolveSchemaRef(content[mediaType].schema);
                        schemaInfo += `Content-Type: ${mediaType}\n`;
                        schemaInfo += `Resolved Schema: ${JSON.stringify(resolvedSchema, null, 2)}\n`;
                    }
                });
            }
        }
        
        return schemaInfo;
    }

    private _resolveSchemaRef(schema: any): any {
        if (!schema) return schema;
        
        // If it's a $ref, try to resolve it
        if (schema.$ref) {
            console.log('Resolving schema reference:', schema.$ref);
            
            // Extract the reference path (e.g., "#/components/schemas/Activity")
            const refPath = schema.$ref;
            
            // Try to get the OpenAPI spec from the current context
            // This assumes we have access to the full spec - we'll need to pass it through
            const resolvedSchema = this._getSchemaFromRef(refPath);
            
            if (resolvedSchema) {
                console.log('Successfully resolved schema:', resolvedSchema);
                return resolvedSchema;
            } else {
                console.warn('Could not resolve schema reference:', refPath);
                // Return a placeholder schema with useful info
                return {
                    type: 'object',
                    description: `Referenced schema: ${refPath}`,
                    properties: {
                        id: { type: 'string', example: 'example-id' },
                        name: { type: 'string', example: 'Example Name' }
                    }
                };
            }
        }
        
        // If it's not a ref, return as-is but recursively resolve any nested refs
        if (schema.properties) {
            const resolvedProperties: any = {};
            Object.keys(schema.properties).forEach(key => {
                resolvedProperties[key] = this._resolveSchemaRef(schema.properties[key]);
            });
            return { ...schema, properties: resolvedProperties };
        }
        
        if (schema.items) {
            return { ...schema, items: this._resolveSchemaRef(schema.items) };
        }
        
        return schema;
    }

    private _getSchemaFromRef(refPath: string): any {
        if (!this._openApiSpec) {
            console.warn('No OpenAPI spec available for reference resolution');
            return null;
        }
        
        console.log('Attempting to resolve reference:', refPath);
        
        // Parse the reference path (e.g., "#/components/schemas/Activity")
        if (refPath.startsWith('#/')) {
            const pathParts = refPath.substring(2).split('/'); // Remove "#/" and split
            
            // Navigate through the spec object
            let current = this._openApiSpec;
            for (const part of pathParts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    console.warn(`Could not find path part "${part}" in reference: ${refPath}`);
                    return null;
                }
            }
            
            console.log('Successfully resolved reference to:', current);
            return current;
        }
        
        console.warn('Unsupported reference format:', refPath);
        return null;
    }

    private _buildExampleStructure(operation: any): string {
        let example = '{\n';
        
        // Add parameters
        const pathParams: any = {};
        const queryParams: any = {};
        const headerParams: any = {};
        
        if (operation.parameters) {
            operation.parameters.forEach((param: any) => {
                const resolvedSchema = this._resolveSchemaRef(param.schema) || { type: 'string' };
                const exampleValue = this._generateExampleValue(resolvedSchema, param.name);
                
                switch (param.in) {
                    case 'path':
                        pathParams[param.name] = exampleValue;
                        break;
                    case 'query':
                        queryParams[param.name] = exampleValue;
                        break;
                    case 'header':
                        headerParams[param.name] = exampleValue;
                        break;
                }
            });
        }
        
        if (Object.keys(pathParams).length > 0) {
            example += `  "pathParameters": ${JSON.stringify(pathParams, null, 2).replace(/\n/g, '\n  ')},\n`;
        }
        
        if (Object.keys(queryParams).length > 0) {
            example += `  "queryParameters": ${JSON.stringify(queryParams, null, 2).replace(/\n/g, '\n  ')},\n`;
        }
        
        if (Object.keys(headerParams).length > 0) {
            example += `  "headerParameters": ${JSON.stringify(headerParams, null, 2).replace(/\n/g, '\n  ')},\n`;
        }
        
        // Add request body
        if (operation.requestBody) {
            const content = operation.requestBody.content;
            if (content) {
                const mediaType = Object.keys(content)[0]; // Get first content type
                if (content[mediaType]?.schema) {
                    const resolvedSchema = this._resolveSchemaRef(content[mediaType].schema);
                    const requestBodyExample = this._generateExampleFromSchema(resolvedSchema || {});
                    example += `  "requestBody": ${JSON.stringify(requestBodyExample, null, 2).replace(/\n/g, '\n  ')}\n`;
                } else {
                    example += '  "requestBody": {}\n';
                }
            }
        } else if (operation.method.toLowerCase() === 'post' || operation.method.toLowerCase() === 'put') {
            example += '  "requestBody": {}\n';
        }
        
        example += '}';
        return example;
    }

    private _generateExampleValue(schema: any, fieldName?: string): any {
        if (schema.example !== undefined) {
            return schema.example;
        }
        
        switch (schema.type) {
            case 'string':
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'date') return '2023-12-01';
                if (schema.format === 'date-time') return '2023-12-01T10:00:00Z';
                if (fieldName?.toLowerCase().includes('name')) return 'John Doe';
                if (fieldName?.toLowerCase().includes('id')) return 'abc123';
                return 'example value';
            case 'integer':
            case 'number':
                return schema.minimum || 1;
            case 'boolean':
                return true;
            case 'array':
                return schema.items ? [this._generateExampleValue(schema.items)] : [];
            case 'object':
                return this._generateExampleFromSchema(schema);
            default:
                return 'example';
        }
    }

    private _generateExampleFromSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') {
            return {};
        }
        
        // Resolve any references in the schema first
        const resolvedSchema = this._resolveSchemaRef(schema);
        if (!resolvedSchema) {
            return {};
        }
        
        const example: any = {};
        
        if (resolvedSchema.properties) {
            Object.keys(resolvedSchema.properties).forEach(key => {
                example[key] = this._generateExampleValue(resolvedSchema.properties[key], key);
            });
        }
        
        return example;
    }

    private _getLocaleInfo(locale: string): { code: string, name: string } {
        const locales = [
            { code: 'en-US', name: 'English (US)' },
            { code: 'en-GB', name: 'English (UK)' },
            { code: 'es-ES', name: 'Spanish (Spain)' },
            { code: 'fr-FR', name: 'French (France)' },
            { code: 'de-DE', name: 'German (Germany)' },
            { code: 'ja-JP', name: 'Japanese (Japan)' },
            // Add more as needed
        ];
        return locales.find(l => l.code === locale) || locales[0];
    }

    private _getLocaleExamples(locale: string): string {
        switch (locale) {
            case 'en-US':
                return '- Names: "John Smith", "Sarah Johnson"\n- Cities: "New York", "Los Angeles"\n- Phone: "+1-555-123-4567"';
            case 'es-ES':
                return '- Names: "María García", "José Rodríguez"\n- Cities: "Madrid", "Barcelona"\n- Phone: "+34-123-456-789"';
            case 'fr-FR':
                return '- Names: "Pierre Dupont", "Marie Martin"\n- Cities: "Paris", "Lyon"\n- Phone: "+33-1-23-45-67-89"';
            case 'de-DE':
                return '- Names: "Hans Müller", "Anna Schmidt"\n- Cities: "Berlin", "München"\n- Phone: "+49-30-12345678"';
            case 'ja-JP':
                return '- Names: "田中太郎", "佐藤花子"\n- Cities: "東京", "大阪"\n- Phone: "+81-3-1234-5678"';
            default:
                return '- Use culturally appropriate names, cities, and contact information';
        }
    }



    
    private _generateRealisticJSON(operation: any, locale: string, globalHeaders?: Array<{key: string, value: string}>): string {
        console.log('🎨 Generating realistic JSON manually for locale:', locale, 'operation:', operation.method, operation.path);
        if (globalHeaders && globalHeaders.length > 0) {
            console.log('🎨 Available global headers for context:', globalHeaders.map(h => h.key).join(', '));
        }
        
        try {
            // First priority: Use example from OpenAPI spec
            const exampleFromSpec = this._getExampleFromOpenAPISpec(operation);
            if (exampleFromSpec) {
                console.log('🎨 Using example from OpenAPI spec:', JSON.stringify(exampleFromSpec, null, 2).substring(0, 200) + '...');
                return JSON.stringify(exampleFromSpec, null, 2);
            }

            // Second priority: Generate realistic JSON based on the operation's request body schema
            const realisticData = this._generateRealisticJSONFromOperation(operation, locale);
            
            console.log('🎨 Generated realistic data:', JSON.stringify(realisticData, null, 2).substring(0, 200) + '...');
            
            return JSON.stringify(realisticData, null, 2);
        } catch (error) {
            console.error('🎨 Failed to generate realistic JSON from schema, falling back to basic structure:', error);
            
            // Fallback to basic example structure
            return this._buildExampleStructure(operation);
        }
    }

    private _getExampleFromOpenAPISpec(operation: any): any {
        console.log('🔍 Looking for examples in OpenAPI spec for operation:', operation.method, operation.path);
        
        try {
            // Check for examples in request body
            if (operation.requestBody && operation.requestBody.content) {
                const content = operation.requestBody.content;
                const mediaTypes = Object.keys(content);
                
                // Prefer JSON content types
                const jsonMediaType = mediaTypes.find(type => 
                    type.includes('json') || type.includes('application/json')
                ) || mediaTypes[0];
                
                if (content[jsonMediaType]) {
                    const mediaTypeObj = content[jsonMediaType];
                    
                    // Check for direct example
                    if (mediaTypeObj.example !== undefined) {
                        console.log('🔍 Found direct example in request body');
                        return mediaTypeObj.example;
                    }
                    
                    // Check for examples object
                    if (mediaTypeObj.examples && typeof mediaTypeObj.examples === 'object') {
                        const exampleKeys = Object.keys(mediaTypeObj.examples);
                        if (exampleKeys.length > 0) {
                            const firstExample = mediaTypeObj.examples[exampleKeys[0]];
                            if (firstExample.value !== undefined) {
                                console.log('🔍 Found example from examples object:', exampleKeys[0]);
                                return firstExample.value;
                            }
                        }
                    }
                    
                    // Check for schema example
                    if (mediaTypeObj.schema) {
                        const schema = this._resolveSchemaRef(mediaTypeObj.schema);
                        if (schema && schema.example !== undefined) {
                            console.log('🔍 Found example in schema');
                            return schema.example;
                        }
                        
                        // Check for examples in schema properties
                        if (schema && schema.properties) {
                            const exampleFromProperties = this._extractExampleFromProperties(schema.properties);
                            if (exampleFromProperties && Object.keys(exampleFromProperties).length > 0) {
                                console.log('🔍 Built example from schema properties');
                                return exampleFromProperties;
                            }
                        }
                    }
                }
            }
            
            console.log('🔍 No examples found in OpenAPI spec');
            return null;
        } catch (error) {
            console.error('🔍 Error extracting example from OpenAPI spec:', error);
            return null;
        }
    }

    private _extractExampleFromProperties(properties: any): any {
        const example: any = {};
        let hasAnyExample = false;
        
        for (const [propName, propSchema] of Object.entries(properties)) {
            const resolvedSchema = this._resolveSchemaRef(propSchema);
            if (resolvedSchema && resolvedSchema.example !== undefined) {
                example[propName] = resolvedSchema.example;
                hasAnyExample = true;
            }
        }
        
        return hasAnyExample ? example : null;
    }
    
    private _generateRealisticJSONFromOperation(operation: any, locale: string): any {
        console.log('🎯 Analyzing operation for schema-based realistic JSON generation');
        
        // First, try to get the request body schema
        if (operation.requestBody && operation.requestBody.content) {
            const content = operation.requestBody.content;
            const mediaTypes = Object.keys(content);
            
            // Prefer JSON content types
            const jsonMediaType = mediaTypes.find(type => 
                type.includes('json') || type.includes('application/json')
            ) || mediaTypes[0];
            
            if (content[jsonMediaType] && content[jsonMediaType].schema) {
                const schema = this._resolveSchemaRef(content[jsonMediaType].schema);
                console.log('🎯 Found request body schema:', JSON.stringify(schema, null, 2).substring(0, 300) + '...');
                
                return this._generateRealisticValueFromSchema(schema, locale);
            }
        }
        
        // If no request body schema, try to generate from parameters
        if (operation.parameters && operation.parameters.length > 0) {
            console.log('🎯 No request body schema, generating from parameters');
            const parameterData: any = {};
            
            operation.parameters.forEach((param: any) => {
                if (param.in === 'query' || param.in === 'header') {
                    const resolvedSchema = this._resolveSchemaRef(param.schema) || { type: 'string' };
                    parameterData[param.name] = this._generateRealisticValueFromSchema(resolvedSchema, locale, param.name);
                }
            });
            
            return parameterData;
        }
        
        // Last resort: generate a basic realistic object
        console.log('🎯 No schema found, generating basic realistic object');
        return this._generateBasicRealisticObject(locale);
    }
    
    private _generateRealisticValueFromSchema(schema: any, locale: string, fieldName?: string): any {
        // Use existing example if available
        if (schema.example !== undefined) {
            return schema.example;
        }
        
        // Get locale-specific data pools
        const names = this._getLocaleNames(locale);
        const companies = this._getLocaleCompanies(locale);
        const cities = this._getLocaleCities(locale);
        
        switch (schema.type) {
            case 'string':
                return this._generateRealisticString(schema, fieldName, names, companies, cities);
                
            case 'number':
            case 'integer':
                return this._generateRealisticNumber(schema, fieldName);
                
            case 'boolean':
                return Math.random() > 0.5;
                
            case 'array':
                if (schema.items) {
                    const itemCount = Math.floor(Math.random() * 3) + 1; // 1-3 items
                    const items = [];
                    for (let i = 0; i < itemCount; i++) {
                        items.push(this._generateRealisticValueFromSchema(schema.items, locale));
                    }
                    return items;
                }
                return [];
                
            case 'object':
                return this._generateRealisticObjectFromSchema(schema, locale);
                
            default:
                console.log('🎯 Unknown schema type:', schema.type, 'using basic generation');
                return this._generateExampleValue(schema, fieldName);
        }
    }
    
    private _generateRealisticString(schema: any, fieldName?: string, names?: string[], companies?: string[], cities?: string[]): string {
        // Handle format-specific strings
        if (schema.format === 'email') {
            const name = names?.[Math.floor(Math.random() * names.length)] || 'user';
            const company = companies?.[Math.floor(Math.random() * companies.length)] || 'example';
            const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
            const cleanCompany = company.toLowerCase().replace(/[^a-z]/g, '');
            return `${cleanName}@${cleanCompany}.com`;
        }
        
        if (schema.format === 'date') {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 365));
            return date.toISOString().split('T')[0];
        }
        
        if (schema.format === 'date-time') {
            const date = new Date();
            date.setHours(date.getHours() - Math.floor(Math.random() * 24 * 30)); // Random time in last 30 days
            return date.toISOString();
        }
        
        if (schema.format === 'uuid') {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        // Handle field name-based realistic values
        if (fieldName) {
            const lowerFieldName = fieldName.toLowerCase();
            
            if (lowerFieldName.includes('name') && names) {
                return names[Math.floor(Math.random() * names.length)];
            }
            
            if (lowerFieldName.includes('company') && companies) {
                return companies[Math.floor(Math.random() * companies.length)];
            }
            
            if (lowerFieldName.includes('city') && cities) {
                return cities[Math.floor(Math.random() * cities.length)];
            }
            
            if (lowerFieldName.includes('status')) {
                return ['active', 'inactive', 'pending', 'completed', 'draft'][Math.floor(Math.random() * 5)];
            }
            
            if (lowerFieldName.includes('phone')) {
                return '+1-555-' + Math.floor(Math.random() * 9000 + 1000);
            }
        }
        
        // Handle enum values
        if (schema.enum && schema.enum.length > 0) {
            return schema.enum[Math.floor(Math.random() * schema.enum.length)];
        }
        
        // Fallback to basic string generation
        return fieldName ? `example_${fieldName}` : 'example_value';
    }
    
    private _generateRealisticNumber(schema: any, fieldName?: string): number {
        // Handle field name-based realistic numbers
        if (fieldName) {
            const lowerFieldName = fieldName.toLowerCase();
            
            if (lowerFieldName.includes('id')) {
                return Math.floor(Math.random() * 90000) + 10000; // 5-digit IDs
            }
            
            if (lowerFieldName.includes('age')) {
                return Math.floor(Math.random() * 50) + 18; // 18-67 years old
            }
            
            if (lowerFieldName.includes('price') || lowerFieldName.includes('cost') || lowerFieldName.includes('amount')) {
                return Math.round((Math.random() * 1000 + 10) * 100) / 100; // $10.00 - $1010.00
            }
            
            if (lowerFieldName.includes('quantity') || lowerFieldName.includes('count')) {
                return Math.floor(Math.random() * 100) + 1; // 1-100
            }
        }
        
        // Handle schema constraints
        if (schema.minimum !== undefined && schema.maximum !== undefined) {
            return Math.random() * (schema.maximum - schema.minimum) + schema.minimum;
        }
        
        if (schema.minimum !== undefined) {
            return schema.minimum + Math.random() * 1000;
        }
        
        if (schema.maximum !== undefined) {
            return Math.random() * schema.maximum;
        }
        
        // Default number generation
        if (schema.type === 'integer') {
            return Math.floor(Math.random() * 1000) + 1;
        }
        
        return Math.round(Math.random() * 1000 * 100) / 100; // Up to 1000.00 with 2 decimals
    }
    
    private _generateRealisticObjectFromSchema(schema: any, locale: string): any {
        const result: any = {};
        
        if (schema.properties) {
            Object.keys(schema.properties).forEach(key => {
                const propSchema = this._resolveSchemaRef(schema.properties[key]);
                result[key] = this._generateRealisticValueFromSchema(propSchema, locale, key);
            });
        }
        
        return result;
    }
    
    private _generateBasicRealisticObject(locale: string): any {
        const names = this._getLocaleNames(locale);
        const companies = this._getLocaleCompanies(locale);
        const cities = this._getLocaleCities(locale);
        
        const randomName = names[Math.floor(Math.random() * names.length)];
        const randomCompany = companies[Math.floor(Math.random() * companies.length)];
        const randomCity = cities[Math.floor(Math.random() * cities.length)];
        
        return {
            id: Math.floor(Math.random() * 90000) + 10000,
            name: randomName,
            email: `${randomName.toLowerCase().replace(/[^a-z]/g, '')}@${randomCompany.toLowerCase().replace(/[^a-z]/g, '')}.com`,
            company: randomCompany,
            city: randomCity,
            active: Math.random() > 0.5,
            createdAt: new Date().toISOString(),
        };
    }
    
    private _getLocaleNames(locale: string): string[] {
        const names: { [key: string]: string[] } = {
            'en-US': ['John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson', 'Jessica Miller'],
            'es-ES': ['Carlos García', 'María López', 'José Martínez', 'Carmen Rodríguez', 'Antonio González'],
            'fr-FR': ['Jean Dupont', 'Marie Martin', 'Pierre Bernard', 'Sophie Dubois', 'Michel Robert'],
            'de-DE': ['Hans Mueller', 'Anna Schmidt', 'Peter Weber', 'Sabine Fischer', 'Thomas Wagner'],
            'ja-JP': ['田中太郎', '佐藤花子', '鈴木一郎', '高橋美咲', '渡辺健太'],
            'default': ['Alex Smith', 'Jordan Brown', 'Casey Davis', 'Taylor Wilson', 'Morgan Jones']
        };
        
        return names[locale] || names['default'];
    }
    
    private _getLocaleCompanies(locale: string): string[] {
        const companies: { [key: string]: string[] } = {
            'en-US': ['TechCorp', 'DataSystems Inc', 'Innovation Labs', 'Global Solutions', 'NextGen Tech'],
            'es-ES': ['Tecnología SA', 'Innovación Digital', 'Sistemas Globales', 'Desarrollo Tech', 'Soluciones Pro'],
            'fr-FR': ['TechnoFrance', 'Solutions Numériques', 'Innovation SA', 'Systèmes Avancés', 'Digital Pro'],
            'de-DE': ['TechGmbH', 'Innovation Systems', 'Digital Solutions', 'Advanced Tech', 'Modern Systems'],
            'ja-JP': ['テクノロジー株式会社', 'イノベーション・ラボ', 'デジタル・ソリューションズ', 'アドバンステック'],
            'default': ['Tech Company', 'Digital Solutions', 'Innovation Corp', 'Modern Systems', 'Advanced Tech']
        };
        
        return companies[locale] || companies['default'];
    }
    
    private _getLocaleCities(locale: string): string[] {
        const cities: { [key: string]: string[] } = {
            'en-US': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'],
            'es-ES': ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga'],
            'fr-FR': ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes'],
            'de-DE': ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart'],
            'ja-JP': ['東京', '大阪', '名古屋', '横浜', '京都', '福岡'],
            'default': ['Metropolis', 'Central City', 'Downtown', 'Riverside', 'Hillside', 'Parkview']
        };
        
        return cities[locale] || cities['default'];
    }
    
    private _isValidJSONStructure(jsonString: string): boolean {
        try {
            if (!jsonString || typeof jsonString !== 'string') return false;
            
            const trimmed = jsonString.trim();
            
            
            // Must start and end with appropriate brackets
            if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && 
                !(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                return false;
            }
            
            // Try to parse it
            const parsed = JSON.parse(trimmed);
            return typeof parsed === 'object' && parsed !== null;
            
        } catch (error) {
            console.log(`🔍 JSON structure validation failed: ${error instanceof Error ? error.message : error}`);
            return false;
        }
    }
    



    private _extractJSON(text: string): string {
        try {
            if (!text || typeof text !== 'string') {
                throw new Error('Invalid text input for JSON extraction');
            }
            
            // Try to find JSON object in the text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return jsonMatch[0];
            }
            
            // Try to find JSON array
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                return arrayMatch[0];
            }
            
            return text.trim();
        } catch (error) {
            console.log('Error in _extractJSON:', error);
            throw new Error(`JSON extraction failed: ${error instanceof Error ? error.message : error}`);
        }
    }

    private _validateAndFormatJSON(jsonString: string): string {
        try {
            console.log('✅ Validating and formatting JSON string:', jsonString.substring(0, 200) + '...');
            
            // First, clean up the JSON string
            let cleanedJson = jsonString.trim();
            
            // If it's "[object Object]", it means we got a bad conversion
            if (cleanedJson === '[object Object]') {
                throw new Error('Received "[object Object]" instead of valid JSON - completion item was not properly converted');
            }
            
            // Additional cleaning: remove trailing commas and fix common issues
            cleanedJson = this._cleanupJSONString(cleanedJson);
            
            // Try to parse the JSON
            const parsed = JSON.parse(cleanedJson);
            console.log('✅ Successfully parsed JSON:', typeof parsed, Object.keys(parsed || {}).length, 'keys');
            
            // Accept objects and arrays as valid JSON for API testing
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error(`Generated JSON is not a valid object or array, got: ${typeof parsed}`);
            }
            
            // Return formatted JSON
            const formatted = JSON.stringify(parsed, null, 2);
            console.log('✅ JSON validation successful, formatted length:', formatted.length);
            return formatted;
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('💥 JSON validation failed:', errorMsg);
            console.error('💥 Input was:', jsonString.substring(0, 500) + (jsonString.length > 500 ? '...' : ''));
            
            // Try to provide helpful error context
            if (errorMsg.includes('Unterminated string')) {
                console.error('💡 Suggestion: The JSON contains an unterminated string. This often happens when Copilot provides incomplete completions.');
            } else if (errorMsg.includes('Unexpected token')) {
                console.error('💡 Suggestion: The JSON contains invalid syntax. This might be due to incomplete Copilot generation.');
            }
            
            throw new Error(`JSON validation failed: ${errorMsg}`);
        }
    }
    
    private _cleanupJSONString(jsonString: string): string {
        let cleaned = jsonString;
        
        // Remove trailing commas before closing braces/brackets
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
        
        // Remove comments (basic)
        cleaned = cleaned.replace(/\/\/.*$/gm, '');
        cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
        
        return cleaned.trim();
    }


    private async _generateLLMJson(prompt: string, operationId: string, operation?: any, locale?: string, globalHeaders?: Array<{key: string, value: string}>) {
        try {
            const config = vscode.workspace.getConfiguration('spekai');
            const aiProvider = config.get<string>('aiProvider', 'auto');
            const enableFallback = config.get<boolean>('enableFallback', true);
            
            let generatedJson: string | undefined;
            let provider = 'Claude';
            
            const providers = await this._getAvailableProviders();
            console.log('Available AI providers:', providers);
            
            // Send debug info to UI
            this._panel.webview.postMessage({
                command: 'debugInfo',
                message: `AI Provider Setting: ${aiProvider}, Available: Claude=${providers.claude}, Fallback: ${enableFallback}`
            });

            let lastError: Error | null = null;
            let attemptedProviders: string[] = [];
            
            // Try Claude first if available
            if (providers.claude) {
                attemptedProviders.push('claude');
                try {
                    console.log('Trying provider: claude');
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: 'Attempting to generate JSON using Claude...'
                    });
                    
                    generatedJson = await this._generateWithClaude(prompt);
                    provider = 'Claude';
                    
                    console.log('Successfully generated JSON using Claude');
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: '✅ Successfully generated JSON using Claude'
                    });
                    
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error('Claude generation failed:', error);
                    lastError = error instanceof Error ? error : new Error(errorMessage);
                    
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: `❌ Claude failed: ${errorMessage}`
                    });
                }
            }
            
            // If Claude failed or is not available, use manual generation
            if (!generatedJson) {
                attemptedProviders.push('manual');
                try {
                    console.log('Trying manual realistic JSON generation');
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: 'Generating realistic JSON manually...'
                    });
                    
                    generatedJson = this._generateRealisticJSON(operation || { method: 'POST', path: '/api/test' }, locale || 'en-US', globalHeaders);
                    provider = 'Manual Generation';
                    
                    console.log('Successfully generated JSON manually');
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: '✅ Successfully generated JSON manually'
                    });
                    
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error('Manual generation failed:', error);
                    lastError = error instanceof Error ? error : new Error(errorMessage);
                    
                    this._panel.webview.postMessage({
                        command: 'debugInfo',
                        message: `❌ Manual generation failed: ${errorMessage}`
                    });
                }
            }
            
            if (!generatedJson) {
                const errorDetails = `
Attempted providers: ${attemptedProviders.join(', ')}
Last error: ${lastError?.message || 'Unknown error'}
Provider availability: Claude=${providers.claude}
                `.trim();
                throw new Error(`All providers failed to generate JSON. ${errorDetails}`);
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
                generatedJson: generatedJson,
                provider: provider
            });

        } catch (error) {
            console.error('AI generation error:', error);
            this._panel.webview.postMessage({
                command: 'llmJsonError',
                operationId: operationId,
                error: `AI generation failed: ${error instanceof Error ? error.message : error}`
            });
        }
    }

    private async _getAvailableProviders(): Promise<{claude: boolean}> {
        return {
            claude: this._isClaudeConfigured()
        };
    }

    private _isClaudeConfigured(): boolean {
        const config = vscode.workspace.getConfiguration('spekai');
        const apiKey = config.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY;
        const isConfigured = !!apiKey;
        console.log(`Claude configuration check: API key ${isConfigured ? 'found' : 'not found'}`);
        return isConfigured;
    }


    private async _generateWithClaude(prompt: string): Promise<string> {
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

        return generatedJson;
    }

    private async _saveTestData(testData: any, operationId: string) {
        try {
            // Create a safe filename with readable datetime stamp
            const operation = testData.operation;
            const safePathName = operation.path.replace(/[^a-zA-Z0-9]/g, '_');
            
            // Extract server name from apiBaseUrl or openApiSpecUrl
            let serverName = '';
            try {
                const url = testData.apiBaseUrl || testData.openApiSpecUrl || '';
                if (url) {
                    const urlObj = new URL(url);
                    serverName = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '-');
                }
            } catch (error) {
                // If URL parsing fails, use a fallback
                console.log('Could not parse server name from URL:', error);
                serverName = 'unknown-server';
            }
            
            // Create readable datetime stamp: YYYYMMDD_HHMMSS
            const now = new Date();
            const dateTimeStamp = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') + '_' +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0') +
                now.getSeconds().toString().padStart(2, '0');
            
            const filename = serverName 
                ? `spekai-test-${serverName}-${operation.method}-${safePathName}-${dateTimeStamp}.json`
                : `spekai-test-${operation.method}-${safePathName}-${dateTimeStamp}.json`;
            
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