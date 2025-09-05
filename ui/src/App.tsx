import React, { useState, useEffect } from 'react';

interface HeaderEntry {
  key: string;
  value: string;
}

interface HeadersEditorProps {
  headers: HeaderEntry[];
  onChange: (headers: HeaderEntry[]) => void;
}

const HeadersEditor: React.FC<HeadersEditorProps> = ({ headers, onChange }) => {
  const addHeader = () => {
    onChange([...headers, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    onChange(newHeaders);
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = headers.map((header, i) => 
      i === index ? { ...header, [field]: value } : header
    );
    onChange(newHeaders);
  };

  return (
    <div className="headers-editor">
      <div className="headers-list">
        {headers.map((header, index) => (
          <div key={index} className="header-entry">
            <input
              type="text"
              placeholder="Header name"
              value={header.key}
              onChange={(e) => updateHeader(index, 'key', e.target.value)}
              className="header-input header-key"
            />
            <input
              type="text"
              placeholder="Header value"
              value={header.value}
              onChange={(e) => updateHeader(index, 'value', e.target.value)}
              className="header-input header-value"
            />
            <button
              onClick={() => removeHeader(index)}
              className="header-remove-btn"
              title="Remove header"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button onClick={addHeader} className="add-header-btn">
        + Add Header
      </button>
    </div>
  );
};

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  type?: string;
  description?: string;
  schema?: any;
  example?: any;
}

interface Operation {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: any;
}

interface TestResult {
  operationId: string;
  result?: string;
  status?: number;
  error?: string;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => any;
  }
}

const LOCALES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'fr-FR', name: 'French (France)' },
  { code: 'de-DE', name: 'German (Germany)' },
  { code: 'it-IT', name: 'Italian (Italy)' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ja-JP', name: 'Japanese (Japan)' },
  { code: 'ko-KR', name: 'Korean (South Korea)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ru-RU', name: 'Russian (Russia)' },
  { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
  { code: 'hi-IN', name: 'Hindi (India)' },
  { code: 'nl-NL', name: 'Dutch (Netherlands)' },
  { code: 'sv-SE', name: 'Swedish (Sweden)' },
  { code: 'da-DK', name: 'Danish (Denmark)' },
  { code: 'no-NO', name: 'Norwegian (Norway)' },
  { code: 'fi-FI', name: 'Finnish (Finland)' }
];

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, Record<string, string>>>({});
  const [requestBodies, setRequestBodies] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [vscode, setVscode] = useState<any>(null);
  const [baseApiUrl, setBaseApiUrl] = useState<string>('');
  const [openApiSpec, setOpenApiSpec] = useState<any>(null);
  const [openApiSpecUrl, setOpenApiSpecUrl] = useState<string>('');
  const [selectedLocale, setSelectedLocale] = useState<string>('en-US');
  const [llmGeneratedJson, setLlmGeneratedJson] = useState<Record<string, string>>({});
  const [generatingLlm, setGeneratingLlm] = useState<Record<string, boolean>>({});
  const [llmProvider, setLlmProvider] = useState<Record<string, string>>({});
  const [editableJsonInput, setEditableJsonInput] = useState<Record<string, string>>({});
  const [customHeaders, setCustomHeaders] = useState<Record<string, Array<{key: string, value: string}>>>({});
  const [globalHeaders, setGlobalHeaders] = useState<Array<{key: string, value: string}>>([]);
  
  // Fallback mode states
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackJsonInput, setFallbackJsonInput] = useState('{\n  "key": "value"\n}');
  const [fallbackHeaders, setFallbackHeaders] = useState<Array<{key: string, value: string}>>([]);
  const [fallbackResponse, setFallbackResponse] = useState<string>('');
  const [lastFallbackMethod, setLastFallbackMethod] = useState<string>('');
  
  // Client certificate states
  const [clientCertEnabled, setClientCertEnabled] = useState(false);
  const [clientCertPath, setClientCertPath] = useState<string>('');
  const [clientKeyPath, setClientKeyPath] = useState<string>('');
  const [clientCertPassphrase, setClientCertPassphrase] = useState<string>('');
  const [caCertPath, setCaCertPath] = useState<string>('');

  // Auto-enable fallback mode when error conditions are met
  useEffect(() => {
    if (error && operations.length === 0 && url.trim() && !fallbackMode) {
      setFallbackMode(true);
      if (!baseApiUrl) {
        setBaseApiUrl(url.trim());
      }
    }
  }, [error, operations.length, url, fallbackMode, baseApiUrl]);

  useEffect(() => {
    if (window.acquireVsCodeApi) {
      const vscodeApi = window.acquireVsCodeApi();
      setVscode(vscodeApi);

      // Restore saved state
      const previousState = vscodeApi.getState();
      if (previousState) {
        setUrl(previousState.url || '');
        setBaseApiUrl(previousState.baseApiUrl || '');
        setOpenApiSpecUrl(previousState.openApiSpecUrl || '');
        setOperations(previousState.operations || []);
        setSelectedOperation(previousState.selectedOperation || null);
        setParameterValues(previousState.parameterValues || {});
        setRequestBodies(previousState.requestBodies || {});
        setTestResults(previousState.testResults || {});
        setSelectedLocale(previousState.selectedLocale || 'en-US');
        setLlmGeneratedJson(previousState.llmGeneratedJson || {});
        setLlmProvider(previousState.llmProvider || {});
        setEditableJsonInput(previousState.editableJsonInput || {});
        setCustomHeaders(previousState.customHeaders || {});
        setGlobalHeaders(previousState.globalHeaders || []);
        setFallbackMode(previousState.fallbackMode || false);
        setFallbackJsonInput(previousState.fallbackJsonInput || '{\n  "key": "value"\n}');
        setFallbackHeaders(previousState.fallbackHeaders || []);
        setLastFallbackMethod(previousState.lastFallbackMethod || '');
        setClientCertEnabled(previousState.clientCertEnabled || false);
        setClientCertPath(previousState.clientCertPath || '');
        setClientKeyPath(previousState.clientKeyPath || '');
        setClientCertPassphrase(previousState.clientCertPassphrase || '');
        setCaCertPath(previousState.caCertPath || '');
        setOpenApiSpec(previousState.openApiSpec || null);
      }

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.command) {
          case 'openApiSpecLoaded':
            setError(null); // Clear errors when spec loads successfully
            handleOpenApiSpecLoaded(message.spec, message.specUrl);
            break;
          case 'operationTestResult':
            setTestResults(prev => ({
              ...prev,
              [message.operationId]: {
                operationId: message.operationId,
                result: message.result,
                status: message.status
              }
            }));
            break;
          case 'operationTestError':
            setTestResults(prev => ({
              ...prev,
              [message.operationId]: {
                operationId: message.operationId,
                error: message.error
              }
            }));
            break;
          case 'error':
            setError(message.message);
            setLoading(false);
            // Enable fallback mode if URL was provided but spec loading failed
            if (url.trim()) {
              setFallbackMode(true);
              setBaseApiUrl(url.trim());
            }
            break;
          case 'llmJsonGenerated':
            setLlmGeneratedJson(prev => ({
              ...prev,
              [message.operationId]: message.generatedJson
            }));
            setLlmProvider(prev => ({
              ...prev,
              [message.operationId]: message.provider || 'Claude'
            }));
            // Also update the editable JSON input so user can see and edit the generated JSON
            setEditableJsonInput(prev => ({
              ...prev,
              [message.operationId]: message.generatedJson
            }));
            setGeneratingLlm(prev => ({
              ...prev,
              [message.operationId]: false
            }));
            break;
          case 'llmJsonError':
            setError(`LLM Generation Error: ${message.error}`);
            setGeneratingLlm(prev => ({
              ...prev,
              [message.operationId]: false
            }));
            break;
          case 'debugInfo':
            console.log('SpekAi Debug:', message.message);
            break;
          case 'testDataSaved':
            // Clear any existing errors when save succeeds
            setError(null);
            break;
          case 'testDataLoaded':
            // Load the test data into the UI
            if (message.testData) {
              const loadedOperation = message.testData.operation;
              
              // Check if this is fallback mode data
              if (message.testData.fallbackMode || loadedOperation.method === 'FALLBACK') {
                // Load fallback mode data
                setError(null);
                setFallbackMode(true);
                setFallbackJsonInput(message.testData.inputJson || '{\n  "key": "value"\n}');
                setFallbackHeaders(message.testData.customHeaders || []);
                
                // Load global headers if available
                if (message.testData.globalHeaders) {
                  setGlobalHeaders(message.testData.globalHeaders);
                }
                
                // Load client certificate data if available
                if (message.testData.clientCert) {
                  setClientCertEnabled(message.testData.clientCert.enabled || false);
                  setClientCertPath(message.testData.clientCert.certPath || '');
                  setClientKeyPath(message.testData.clientCert.keyPath || '');
                  setClientCertPassphrase(message.testData.clientCert.passphrase || '');
                  setCaCertPath(message.testData.clientCert.caCertPath || '');
                }
                
                if (message.testData.apiBaseUrl && message.testData.apiBaseUrl !== baseApiUrl) {
                  const shouldUpdateUrl = confirm(
                    `The loaded test data uses a different API base URL:\n${message.testData.apiBaseUrl}\n\nDo you want to update the current API base URL?`
                  );
                  if (shouldUpdateUrl) {
                    setBaseApiUrl(message.testData.apiBaseUrl);
                  }
                }
              } else {
                // Get current operations state immediately and also through state access
                setOperations(currentOps => {
                  // Find the matching operation in the current operations list
                  const matchingOperation = currentOps.find(op => 
                    op.method === loadedOperation.method && op.path === loadedOperation.path
                  );
                  
                  if (matchingOperation) {
                    // Clear any existing errors when load succeeds
                    setError(null);
                    
                    // Set the matching operation as selected
                    setSelectedOperation(matchingOperation);
                    
                    // Load the input JSON for this operation
                    setEditableJsonInput(prev => ({
                      ...prev,
                      [matchingOperation.id]: message.testData.inputJson
                    }));
                    
                    // Load custom headers if available
                    if (message.testData.customHeaders) {
                      setCustomHeaders(prev => ({
                        ...prev,
                        [matchingOperation.id]: message.testData.customHeaders
                      }));
                    }
                    
                    // Load global headers if available
                    if (message.testData.globalHeaders) {
                      setGlobalHeaders(message.testData.globalHeaders);
                    }
                    
                    // Load client certificate data if available
                    if (message.testData.clientCert) {
                      setClientCertEnabled(message.testData.clientCert.enabled || false);
                      setClientCertPath(message.testData.clientCert.certPath || '');
                      setClientKeyPath(message.testData.clientCert.keyPath || '');
                      setClientCertPassphrase(message.testData.clientCert.passphrase || '');
                      setCaCertPath(message.testData.clientCert.caCertPath || '');
                    }
                    
                    // Optionally update API base URL
                    if (message.testData.apiBaseUrl && message.testData.apiBaseUrl !== baseApiUrl) {
                      const shouldUpdateUrl = confirm(
                        `The loaded test data uses a different API base URL:\n${message.testData.apiBaseUrl}\n\nDo you want to update the current API base URL?`
                      );
                      if (shouldUpdateUrl) {
                        setBaseApiUrl(message.testData.apiBaseUrl);
                      }
                    }
                  } else {
                    // Check if any operations are loaded at all
                    if (currentOps.length === 0) {
                      setError(
                        `Could not find matching operation: ${loadedOperation.method} ${loadedOperation.path}\n\n` +
                        `No operations are currently loaded. Please load an OpenAPI specification first, then try loading your test data again.`
                      );
                    } else {
                      // Show available operations to help user understand the mismatch
                      const availableOps = currentOps.map(op => `${op.method} ${op.path}`).join(', ');
                      setError(
                        `Could not find matching operation: ${loadedOperation.method} ${loadedOperation.path}\n\n` +
                        `Available operations in current spec: ${availableOps}\n\n` +
                        `Please load the correct OpenAPI specification that contains this operation.`
                      );
                    }
                  }
                  
                  // Return the same operations (no change)
                  return currentOps;
                });
              }
            }
            break;
          case 'saveLoadError':
            setError(message.error);
            break;
          case 'fileSelected':
            // Handle file selection from browse dialog
            if (message.fileType && message.filePath) {
              switch (message.fileType) {
                case 'clientCert':
                  setClientCertPath(message.filePath);
                  break;
                case 'clientKey':
                  setClientKeyPath(message.filePath);
                  break;
                case 'caCert':
                  setCaCertPath(message.filePath);
                  break;
                case 'openApiSpec':
                  // Convert file path to file:// URL format
                  const fileUrl = message.filePath.startsWith('file://') 
                    ? message.filePath 
                    : `file://${message.filePath.replace(/\\/g, '/')}`;
                  setUrl(fileUrl);
                  break;
              }
            }
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  // Save state whenever key state variables change
  useEffect(() => {
    if (vscode) {
      const currentState = {
        url,
        baseApiUrl,
        openApiSpecUrl,
        operations,
        selectedOperation,
        parameterValues,
        requestBodies,
        testResults,
        selectedLocale,
        llmGeneratedJson,
        llmProvider,
        editableJsonInput,
        customHeaders,
        globalHeaders,
        fallbackMode,
        fallbackJsonInput,
        fallbackHeaders,
        lastFallbackMethod,
        clientCertEnabled,
        clientCertPath,
        clientKeyPath,
        clientCertPassphrase,
        caCertPath,
        openApiSpec
      };
      vscode.setState(currentState);
    }
  }, [vscode, url, baseApiUrl, openApiSpecUrl, operations, selectedOperation, parameterValues, 
      requestBodies, testResults, selectedLocale, llmGeneratedJson, llmProvider, editableJsonInput,
      customHeaders, globalHeaders, fallbackMode, fallbackJsonInput, fallbackHeaders, 
      lastFallbackMethod, clientCertEnabled, clientCertPath, clientKeyPath, clientCertPassphrase, 
      caCertPath, openApiSpec]);

  const handleOpenApiSpecLoaded = (spec: any, specUrl: string) => {
    setLoading(false);
    setError(null);
    setOpenApiSpec(spec);
    setOpenApiSpecUrl(specUrl);
    
    // Extract base API URL from servers
    let apiBaseUrl = '';
    try {
      console.log('Base URL Extraction Debug:');
      console.log('- spec.servers:', spec.servers);
      console.log('- specUrl:', specUrl);
      
      if (spec.servers && spec.servers.length > 0) {
        apiBaseUrl = spec.servers[0].url;
        console.log('- Using servers[0].url:', apiBaseUrl);
        
        // Handle relative URLs in servers
        if (apiBaseUrl.startsWith('/')) {
          const specUrlObj = new URL(specUrl);
          apiBaseUrl = `${specUrlObj.protocol}//${specUrlObj.host}${apiBaseUrl}`;
          console.log('- Converted relative URL to:', apiBaseUrl);
        }
      } else {
        console.log('- No servers found, using fallback extraction');
        // Fallback: try to extract from the spec URL
        const specUrlObj = new URL(specUrl);
        apiBaseUrl = `${specUrlObj.protocol}//${specUrlObj.host}`;
        console.log('- Base from spec URL:', apiBaseUrl);
        
        // Remove common spec paths like /openapi.json, /swagger.json, /api-docs, etc.
        let basePath = specUrlObj.pathname
          .replace(/\/openapi\.json$/, '')
          .replace(/\/swagger\.json$/, '')
          .replace(/\/api-docs.*$/, '')
          .replace(/\/v[0-9]+\/openapi\.json$/, '')
          .replace(/\/swagger$/, '')
          .replace(/\/docs$/, '');
        
        console.log('- Original pathname:', specUrlObj.pathname);
        console.log('- Processed basePath:', basePath);
        
        if (basePath && basePath !== '/') {
          apiBaseUrl += basePath;
        }
      }
      
      console.log('- Final apiBaseUrl:', apiBaseUrl);
      
      // Validate the constructed base URL
      new URL(apiBaseUrl);
      console.log('Base URL validation successful');
    } catch (error) {
      console.error('Base URL extraction failed:', error);
      setError(`Failed to extract valid base API URL. Spec URL: "${specUrl}", Extracted: "${apiBaseUrl}". Error: ${error}`);
      setLoading(false);
      return;
    }
    
    setBaseApiUrl(apiBaseUrl);
    
    const ops: Operation[] = [];
    const paths = spec.paths || {};
    
    Object.keys(paths).forEach(path => {
      const pathItem = paths[path];
      Object.keys(pathItem).forEach(method => {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          const operation = pathItem[method];
          
          console.log(`Parsing operation: ${method.toUpperCase()} ${path}`);
          console.log('- operation.parameters:', operation.parameters);
          console.log('- operation.requestBody:', operation.requestBody);
          
          // Merge path-level and operation-level parameters
          const allParameters = [
            ...(pathItem.parameters || []),
            ...(operation.parameters || [])
          ];
          
          console.log('- allParameters:', allParameters);
          
          ops.push({
            id: `${method.toUpperCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
            method: method.toUpperCase(),
            path,
            summary: operation.summary,
            description: operation.description,
            parameters: allParameters,
            requestBody: operation.requestBody
          });
        }
      });
    });
    
    setOperations(ops);
    setSelectedOperation(null);
  };

  const handleLoadSpec = () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError(null);
    setOperations([]);
    setBaseApiUrl('');
    setOpenApiSpec(null);
    setFallbackMode(false);
    setFallbackResponse('');
    
    // Prepare client certificate data if enabled
    const clientCert = clientCertEnabled ? {
      enabled: true,
      certPath: clientCertPath,
      keyPath: clientKeyPath,
      passphrase: clientCertPassphrase || undefined,
      caCertPath: caCertPath || undefined
    } : undefined;

    if (vscode) {
      vscode.postMessage({
        command: 'fetchOpenApiSpec',
        url: url.trim(),
        clientCert,
        globalHeaders: globalHeaders
      });
    } else {
      setError('VSCode API not available');
      setLoading(false);
    }
  };

  const handleParameterChange = (operationId: string, paramName: string, value: string) => {
    setParameterValues(prev => ({
      ...prev,
      [operationId]: {
        ...prev[operationId],
        [paramName]: value
      }
    }));
  };

  const handleRequestBodyChange = (operationId: string, value: string) => {
    setRequestBodies(prev => ({
      ...prev,
      [operationId]: value
    }));
  };

  const handleTestOperation = (operation: Operation) => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    if (!baseApiUrl) {
      setError('Base API URL not available');
      return;
    }

    const params = parameterValues[operation.id] || {};
    
    console.log('Parameter Debug:');
    console.log('- parameterValues[operation.id]:', params);
    console.log('- operation.parameters:', operation.parameters);
    
    // Construct proper URL using base API URL and operation path
    let testUrl: string;
    try {
      console.log('URL Construction Debug:');
      console.log('- baseApiUrl:', baseApiUrl);
      console.log('- operation.path:', operation.path);
      
      // Normalize the base URL and path
      const normalizedBase = baseApiUrl.endsWith('/') ? baseApiUrl.slice(0, -1) : baseApiUrl;
      const normalizedPath = operation.path.startsWith('/') ? operation.path : '/' + operation.path;
      testUrl = normalizedBase + normalizedPath;
      
      console.log('- normalizedBase:', normalizedBase);
      console.log('- normalizedPath:', normalizedPath);
      console.log('- testUrl:', testUrl);
      
      // Validate the URL construction
      new URL(testUrl); // This will throw if URL is invalid
      console.log('URL validation successful');
    } catch (error) {
      console.error('URL construction failed:', error);
      setError(`Invalid URL construction: baseApiUrl="${baseApiUrl}", path="${operation.path}", result="${testUrl || 'undefined'}". Error: ${error}`);
      return;
    }
    
    const headers: Record<string, string> = {};
    const queryParams: string[] = [];

    // Add global headers first
    globalHeaders.forEach(header => {
      if (header.key.trim() && header.value.trim()) {
        headers[header.key.trim()] = header.value.trim();
      }
    });

    // Add custom headers (operation-specific headers can override global headers)
    const operationCustomHeaders = customHeaders[operation.id] || [];
    operationCustomHeaders.forEach(header => {
      if (header.key.trim() && header.value.trim()) {
        headers[header.key.trim()] = header.value.trim();
      }
    });

    operation.parameters?.forEach(param => {
      const value = params[param.name];
      console.log(`Parameter replacement: ${param.name} (${param.in}) = "${value}"`);
      
      if (value) {
        if (param.in === 'path') {
          console.log(`Replacing {${param.name}} with ${value} in URL: ${testUrl}`);
          testUrl = testUrl.replace(`{${param.name}}`, encodeURIComponent(value));
          console.log(`After replacement: ${testUrl}`);
        } else if (param.in === 'query') {
          queryParams.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`);
        } else if (param.in === 'header') {
          headers[param.name] = value;
        }
      } else {
        console.warn(`No value found for parameter: ${param.name}`);
      }
    });

    if (queryParams.length > 0) {
      testUrl += '?' + queryParams.join('&');
    }

    let requestBody;
    
    // Get request body from the JSON input editor for all operations
    if (operation.requestBody) {
      try {
        // Get the current value from the JSON editor (this is what the user sees/edits)
        const jsonEditorValue = getCurrentJsonInput(operation);
        const inputData = JSON.parse(jsonEditorValue);
        
        // Check if inputData has a requestBody property or if inputData itself is the request body
        if (inputData.requestBody !== undefined && typeof inputData.requestBody === 'object') {
          // Case 1: JSON is wrapped with requestBody property
          requestBody = inputData.requestBody;
          headers['Content-Type'] = 'application/json';
        } else if (typeof inputData === 'object' && inputData !== null && !inputData.hasOwnProperty('pathParameters') && !inputData.hasOwnProperty('queryParameters')) {
          // Case 2: JSON itself is the request body (no wrapper)
          requestBody = inputData;
          headers['Content-Type'] = 'application/json';
        }
      } catch (e) {
        // Failed to parse JSON input
        requestBody = undefined;
      }
    }


    // Prepare client certificate data if enabled
    const clientCert = clientCertEnabled ? {
      enabled: true,
      certPath: clientCertPath,
      keyPath: clientKeyPath,
      passphrase: clientCertPassphrase || undefined,
      caCertPath: caCertPath || undefined
    } : undefined;

    vscode.postMessage({
      command: 'testApiOperation',
      operation: {
        id: operation.id,
        url: testUrl,
        method: operation.method,
        headers,
        body: requestBody,
        clientCert
      }
    });

    setTestResults(prev => ({
      ...prev,
      [operation.id]: { operationId: operation.id }
    }));
  };

  const getMethodClass = (method: string) => {
    return `method-${method.toLowerCase()}`;
  };

  const resolveSchemaRef = (ref: string, spec: any): any => {
    if (!ref || !ref.startsWith('#/')) return null;
    
    const path = ref.replace('#/', '').split('/');
    let current = spec;
    
    for (const segment of path) {
      if (current && current[segment]) {
        current = current[segment];
      } else {
        console.warn(`Could not resolve reference: ${ref}`);
        return null;
      }
    }
    
    return current;
  };

  const resolveAllRefs = (schema: any, spec: any, depth: number = 0): any => {
    if (!schema || depth > 10) return schema; // Prevent infinite recursion
    
    if (schema.$ref) {
      const resolved = resolveSchemaRef(schema.$ref, spec);
      return resolved ? resolveAllRefs(resolved, spec, depth + 1) : schema;
    }
    
    if (Array.isArray(schema)) {
      return schema.map(item => resolveAllRefs(item, spec, depth + 1));
    }
    
    if (typeof schema === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(schema)) {
        resolved[key] = resolveAllRefs(value, spec, depth + 1);
      }
      return resolved;
    }
    
    return schema;
  };

  const extractParameterSchemas = (operation: Operation): any => {
    if (!operation.parameters || !openApiSpec) return {};
    
    const schemas: any = {
      pathParameters: {},
      queryParameters: {},
      headerParameters: {}
    };
    
    operation.parameters.forEach(param => {
      let paramSchema = param.schema || param;
      
      // Resolve references
      if (paramSchema.$ref) {
        paramSchema = resolveSchemaRef(paramSchema.$ref, openApiSpec);
      }
      
      // Fully resolve all nested references
      paramSchema = resolveAllRefs(paramSchema, openApiSpec);
      
      const paramInfo = {
        type: paramSchema.type || param.type,
        description: param.description,
        required: param.required,
        schema: paramSchema,
        example: param.example || paramSchema.example,
        enum: paramSchema.enum,
        format: paramSchema.format,
        minimum: paramSchema.minimum,
        maximum: paramSchema.maximum,
        pattern: paramSchema.pattern
      };
      
      if (param.in === 'path') {
        schemas.pathParameters[param.name] = paramInfo;
      } else if (param.in === 'query') {
        schemas.queryParameters[param.name] = paramInfo;
      } else if (param.in === 'header') {
        schemas.headerParameters[param.name] = paramInfo;
      }
    });
    
    return schemas;
  };

  const extractRequestBodySchema = (operation: Operation): any => {
    if (!operation.requestBody || !openApiSpec) return null;
    
    let requestBodySchema = operation.requestBody;
    
    // Handle OpenAPI 3.0 request body structure
    if (requestBodySchema.content) {
      // Try application/json first
      if (requestBodySchema.content['application/json']?.schema) {
        requestBodySchema = requestBodySchema.content['application/json'].schema;
      } else {
        // Try first available content type
        const contentTypes = Object.keys(requestBodySchema.content);
        if (contentTypes.length > 0 && requestBodySchema.content[contentTypes[0]]?.schema) {
          requestBodySchema = requestBodySchema.content[contentTypes[0]].schema;
        }
      }
    }
    
    // Resolve all references recursively
    return resolveAllRefs(requestBodySchema, openApiSpec);
  };

  const generateLLMPrompt = (operation: Operation, locale: string): string => {
    const localeInfo = LOCALES.find(l => l.code === locale) || LOCALES[0];
    
    // Extract detailed schemas from the operation
    const parameterSchemas = extractParameterSchemas(operation);
    const requestBodySchema = extractRequestBodySchema(operation);
    
    let prompt = `You are a helpful assistant that generates realistic test data for API operations. 

Generate realistic, valid JSON test data for the following API operation in the ${localeInfo.name} locale:

**Operation**: ${operation.method} ${operation.path}
**Description**: ${operation.description || operation.summary || 'No description provided'}

**Instructions:**
1. Generate realistic data appropriate for ${localeInfo.name} locale
2. Use real-looking names, addresses, phone numbers, emails, etc. for the locale
3. Follow the exact JSON schemas provided below - these are the ACTUAL schemas from the OpenAPI specification
4. Do not include the "url" field in your response
5. Make the data diverse and realistic
6. Use proper data types and respect constraints (enums, formats, min/max values, patterns)
7. Generate data that would pass validation against the provided schemas

`;

    // Add detailed parameter schemas
    if (parameterSchemas.pathParameters && Object.keys(parameterSchemas.pathParameters).length > 0) {
      prompt += `**Path Parameters Schema:**\n`;
      prompt += `"pathParameters": {\n`;
      Object.entries(parameterSchemas.pathParameters).forEach(([name, schema]: [string, any]) => {
        prompt += `  "${name}": {\n`;
        prompt += `    "type": "${schema.type || 'string'}",\n`;
        if (schema.description) prompt += `    "description": "${schema.description}",\n`;
        if (schema.required) prompt += `    "required": ${schema.required},\n`;
        if (schema.enum) prompt += `    "enum": ${JSON.stringify(schema.enum)},\n`;
        if (schema.format) prompt += `    "format": "${schema.format}",\n`;
        if (schema.pattern) prompt += `    "pattern": "${schema.pattern}",\n`;
        if (schema.minimum !== undefined) prompt += `    "minimum": ${schema.minimum},\n`;
        if (schema.maximum !== undefined) prompt += `    "maximum": ${schema.maximum},\n`;
        if (schema.example !== undefined) prompt += `    "example": ${JSON.stringify(schema.example)},\n`;
        prompt += `    "schema": ${JSON.stringify(schema.schema, null, 2)}\n`;
        prompt += `  },\n`;
      });
      prompt += `},\n\n`;
    }

    if (parameterSchemas.queryParameters && Object.keys(parameterSchemas.queryParameters).length > 0) {
      prompt += `**Query Parameters Schema:**\n`;
      prompt += `"queryParameters": {\n`;
      Object.entries(parameterSchemas.queryParameters).forEach(([name, schema]: [string, any]) => {
        prompt += `  "${name}": {\n`;
        prompt += `    "type": "${schema.type || 'string'}",\n`;
        if (schema.description) prompt += `    "description": "${schema.description}",\n`;
        if (schema.required) prompt += `    "required": ${schema.required},\n`;
        if (schema.enum) prompt += `    "enum": ${JSON.stringify(schema.enum)},\n`;
        if (schema.format) prompt += `    "format": "${schema.format}",\n`;
        if (schema.pattern) prompt += `    "pattern": "${schema.pattern}",\n`;
        if (schema.minimum !== undefined) prompt += `    "minimum": ${schema.minimum},\n`;
        if (schema.maximum !== undefined) prompt += `    "maximum": ${schema.maximum},\n`;
        if (schema.example !== undefined) prompt += `    "example": ${JSON.stringify(schema.example)},\n`;
        prompt += `    "schema": ${JSON.stringify(schema.schema, null, 2)}\n`;
        prompt += `  },\n`;
      });
      prompt += `},\n\n`;
    }

    if (parameterSchemas.headerParameters && Object.keys(parameterSchemas.headerParameters).length > 0) {
      prompt += `**Header Parameters Schema:**\n`;
      prompt += `"headerParameters": {\n`;
      Object.entries(parameterSchemas.headerParameters).forEach(([name, schema]: [string, any]) => {
        prompt += `  "${name}": {\n`;
        prompt += `    "type": "${schema.type || 'string'}",\n`;
        if (schema.description) prompt += `    "description": "${schema.description}",\n`;
        if (schema.required) prompt += `    "required": ${schema.required},\n`;
        if (schema.enum) prompt += `    "enum": ${JSON.stringify(schema.enum)},\n`;
        if (schema.format) prompt += `    "format": "${schema.format}",\n`;
        if (schema.pattern) prompt += `    "pattern": "${schema.pattern}",\n`;
        if (schema.minimum !== undefined) prompt += `    "minimum": ${schema.minimum},\n`;
        if (schema.maximum !== undefined) prompt += `    "maximum": ${schema.maximum},\n`;
        if (schema.example !== undefined) prompt += `    "example": ${JSON.stringify(schema.example)},\n`;
        prompt += `    "schema": ${JSON.stringify(schema.schema, null, 2)}\n`;
        prompt += `  },\n`;
      });
      prompt += `},\n\n`;
    }

    // Add detailed request body schema
    if (requestBodySchema) {
      prompt += `**Request Body Schema:**\n`;
      prompt += `"requestBody": ${JSON.stringify(requestBodySchema, null, 2)}\n\n`;
    }

    prompt += `**Expected JSON Output Structure:**\n{\n`;
    
    if (parameterSchemas.pathParameters && Object.keys(parameterSchemas.pathParameters).length > 0) {
      prompt += `  "pathParameters": {\n`;
      Object.keys(parameterSchemas.pathParameters).forEach((name, index, arr) => {
        prompt += `    "${name}": <value conforming to schema above>`;
        if (index < arr.length - 1) prompt += ',';
        prompt += '\n';
      });
      prompt += `  },\n`;
    }

    if (parameterSchemas.queryParameters && Object.keys(parameterSchemas.queryParameters).length > 0) {
      prompt += `  "queryParameters": {\n`;
      Object.keys(parameterSchemas.queryParameters).forEach((name, index, arr) => {
        prompt += `    "${name}": <value conforming to schema above>`;
        if (index < arr.length - 1) prompt += ',';
        prompt += '\n';
      });
      prompt += `  },\n`;
    }

    if (parameterSchemas.headerParameters && Object.keys(parameterSchemas.headerParameters).length > 0) {
      prompt += `  "headerParameters": {\n`;
      Object.keys(parameterSchemas.headerParameters).forEach((name, index, arr) => {
        prompt += `    "${name}": <value conforming to schema above>`;
        if (index < arr.length - 1) prompt += ',';
        prompt += '\n';
      });
      prompt += `  },\n`;
    }

    if (requestBodySchema) {
      prompt += `  "requestBody": <object conforming to schema above>\n`;
    }

    prompt += `}\n\n`;

    prompt += `**Examples of locale-appropriate data for ${localeInfo.name}:**\n`;
    
    switch (locale) {
      case 'en-US':
        prompt += `- Names: "John Smith", "Sarah Johnson", "Michael Brown"\n- Cities: "New York", "Los Angeles", "Chicago"\n- Phone: "+1-555-123-4567"\n- Email: "john.smith@example.com"`;
        break;
      case 'es-ES':
        prompt += `- Names: "María García", "José Rodríguez", "Carmen López"\n- Cities: "Madrid", "Barcelona", "Valencia"\n- Phone: "+34-123-456-789"\n- Email: "maria.garcia@ejemplo.es"`;
        break;
      case 'fr-FR':
        prompt += `- Names: "Pierre Dupont", "Marie Martin", "Jean Bernard"\n- Cities: "Paris", "Lyon", "Marseille"\n- Phone: "+33-1-23-45-67-89"\n- Email: "pierre.dupont@exemple.fr"`;
        break;
      case 'de-DE':
        prompt += `- Names: "Hans Müller", "Anna Schmidt", "Klaus Weber"\n- Cities: "Berlin", "München", "Hamburg"\n- Phone: "+49-30-12345678"\n- Email: "hans.mueller@beispiel.de"`;
        break;
      case 'ja-JP':
        prompt += `- Names: "田中太郎", "佐藤花子", "鈴木一郎"\n- Cities: "東京", "大阪", "名古屋"\n- Phone: "+81-3-1234-5678"\n- Email: "tanaka@example.jp"`;
        break;
      default:
        prompt += `- Use culturally appropriate names, cities, and contact information\n- Follow local formatting conventions`;
    }

    prompt += `\n\n**IMPORTANT:** Please respond with ONLY the JSON object conforming to the schemas above, no additional text or explanation.`;
    
    return prompt;
  };

  const getParameterTypeExample = (param: Parameter, locale: string): string => {
    if (param.schema) {
      switch (param.schema.type) {
        case 'integer': return 'number (e.g., 123)';
        case 'string': return 'string (locale-appropriate)';
        case 'boolean': return 'boolean (true/false)';
        default: return 'appropriate value';
      }
    }
    switch (param.type) {
      case 'integer': return 'number (e.g., 123)';
      case 'string': return 'string (locale-appropriate)';
      case 'boolean': return 'boolean (true/false)';
      default: return 'appropriate value';
    }
  };

  const generateExampleFromSchema = (schema: any, depth: number = 0): any => {
    if (!schema) return '';
    
    // Prevent infinite recursion
    if (depth > 5) return '...';
    
    // Return example if provided
    if (schema.example !== undefined) return schema.example;
    
    // Handle $ref - resolve the reference
    if (schema.$ref) {
      if (openApiSpec) {
        const resolvedSchema = resolveSchemaRef(schema.$ref, openApiSpec);
        if (resolvedSchema) {
          return generateExampleFromSchema(resolvedSchema, depth + 1);
        }
      }
      return `<ref: ${schema.$ref}>`;
    }
    
    // Handle allOf, oneOf, anyOf
    if (schema.allOf && schema.allOf.length > 0) {
      // For allOf, merge all schemas (simplified - just use first for now)
      let mergedSchema = schema.allOf[0];
      if (mergedSchema.$ref && openApiSpec) {
        mergedSchema = resolveSchemaRef(mergedSchema.$ref, openApiSpec) || mergedSchema;
      }
      return generateExampleFromSchema(mergedSchema, depth + 1);
    }
    if (schema.oneOf && schema.oneOf.length > 0) {
      let selectedSchema = schema.oneOf[0];
      if (selectedSchema.$ref && openApiSpec) {
        selectedSchema = resolveSchemaRef(selectedSchema.$ref, openApiSpec) || selectedSchema;
      }
      return generateExampleFromSchema(selectedSchema, depth + 1);
    }
    if (schema.anyOf && schema.anyOf.length > 0) {
      let selectedSchema = schema.anyOf[0];
      if (selectedSchema.$ref && openApiSpec) {
        selectedSchema = resolveSchemaRef(selectedSchema.$ref, openApiSpec) || selectedSchema;
      }
      return generateExampleFromSchema(selectedSchema, depth + 1);
    }
    
    // Handle different schema types
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date') return '2023-12-01';
        if (schema.format === 'date-time') return '2023-12-01T10:00:00Z';
        if (schema.format === 'email') return 'user@example.com';
        if (schema.format === 'uri') return 'https://example.com';
        if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        if (schema.format === 'password') return 'password123';
        if (schema.enum) return schema.enum[0];
        if (schema.pattern) return 'string';
        // Better defaults for common pet store fields
        if (schema.title && schema.title.toLowerCase().includes('name')) return 'Fluffy';
        if (schema.description && schema.description.toLowerCase().includes('status')) return 'available';
        return schema.default || 'string';
      
      case 'integer':
        if (schema.enum) return schema.enum[0];
        return schema.default || schema.minimum || schema.maximum || 1;
      
      case 'number':
        if (schema.enum) return schema.enum[0];
        return schema.default || schema.minimum || schema.maximum || 1.0;
      
      case 'boolean':
        return schema.default !== undefined ? schema.default : true;
      
      case 'array':
        if (schema.items) {
          const itemExample = generateExampleFromSchema(schema.items, depth + 1);
          const minItems = schema.minItems || 1;
          return Array(Math.min(minItems, 3)).fill(itemExample);
        }
        return [];
      
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          Object.keys(schema.properties).forEach(prop => {
            // Only include required properties by default, or all if none specified
            if (!schema.required || schema.required.includes(prop) || Object.keys(schema.properties).length <= 5) {
              obj[prop] = generateExampleFromSchema(schema.properties[prop], depth + 1);
            }
          });
        }
        return obj;
      
      default:
        // Handle OpenAPI 3.0 schemas without explicit type
        if (schema.properties) {
          const obj: any = {};
          Object.keys(schema.properties).forEach(prop => {
            // Only include required properties by default, or all if none specified
            if (!schema.required || schema.required.includes(prop) || Object.keys(schema.properties).length <= 5) {
              obj[prop] = generateExampleFromSchema(schema.properties[prop], depth + 1);
            }
          });
          return obj;
        }
        if (schema.items) {
          const itemExample = generateExampleFromSchema(schema.items, depth + 1);
          return [itemExample];
        }
        if (schema.enum) return schema.enum[0];
        return schema.default || '';
    }
  };

  const generateRequestBodyExample = (requestBody: any): any => {
    if (!requestBody) return null;
    
    // Handle OpenAPI 3.0 request body structure
    if (requestBody.content) {
      // Try application/json first
      if (requestBody.content['application/json']) {
        const schema = requestBody.content['application/json'].schema;
        return generateExampleFromSchema(schema);
      }
      
      // Try first available content type
      const contentTypes = Object.keys(requestBody.content);
      if (contentTypes.length > 0) {
        const schema = requestBody.content[contentTypes[0]].schema;
        return generateExampleFromSchema(schema);
      }
    }
    
    // Handle OpenAPI 2.0 style
    if (requestBody.schema) {
      return generateExampleFromSchema(requestBody.schema);
    }
    
    return null;
  };

  const generateLLMJson = (operation: Operation) => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    setGeneratingLlm(prev => ({
      ...prev,
      [operation.id]: true
    }));

    const prompt = generateLLMPrompt(operation, selectedLocale);
    
    vscode.postMessage({
      command: 'generateLLMJson',
      prompt: prompt,
      operationId: operation.id,
      operation: operation,
      locale: selectedLocale,
      openApiSpec: openApiSpec,
      globalHeaders: globalHeaders
    });
  };

  const getCurrentJsonInput = (operation: Operation) => {
    // Return user's edited version if it exists, otherwise generate default
    if (editableJsonInput[operation.id]) {
      return editableJsonInput[operation.id];
    }
    return formatJsonInput(operation);
  };

  const formatJsonInput = (operation: Operation) => {
    // Use LLM-generated JSON if available
    if (llmGeneratedJson[operation.id]) {
      return llmGeneratedJson[operation.id];
    }

    const params = parameterValues[operation.id] || {};
    const inputJson: any = {};
    
    // Add parameters to input JSON with schema-based examples
    if (operation.parameters && operation.parameters.length > 0) {
      const pathParams: any = {};
      const queryParams: any = {};
      const headerParams: any = {};
      
      operation.parameters.forEach(param => {
        // Use existing value if available, otherwise generate example from schema
        let value = params[param.name];
        if (!value) {
          if (param.example !== undefined) {
            value = param.example;
          } else if (param.schema) {
            value = generateExampleFromSchema(param.schema);
          } else {
            // Fallback based on type
            switch (param.type) {
              case 'integer':
                value = 1;
                break;
              case 'number':
                value = 1.0;
                break;
              case 'boolean':
                value = true;
                break;
              case 'array':
                value = [];
                break;
              default:
                value = `<${param.name}>`;
            }
          }
        }
        
        if (param.in === 'path') {
          pathParams[param.name] = value;
        } else if (param.in === 'query') {
          queryParams[param.name] = value;
        } else if (param.in === 'header') {
          headerParams[param.name] = value;
        }
      });
      
      if (Object.keys(pathParams).length > 0) inputJson.pathParameters = pathParams;
      if (Object.keys(queryParams).length > 0) inputJson.queryParameters = queryParams;
      if (Object.keys(headerParams).length > 0) inputJson.headerParameters = headerParams;
    }
    
    // Add request body with schema-based example
    if (operation.requestBody) {
      let requestBodyValue;
      
      // Use existing value if available
      if (requestBodies[operation.id]) {
        try {
          requestBodyValue = JSON.parse(requestBodies[operation.id]);
        } catch {
          requestBodyValue = requestBodies[operation.id];
        }
      } else {
        // Generate example from schema
        requestBodyValue = generateRequestBodyExample(operation.requestBody);
      }
      
      if (requestBodyValue !== null) {
        inputJson.requestBody = requestBodyValue;
      }
    }
    
    return JSON.stringify(inputJson, null, 2);
  };

  const saveTestData = (operation: Operation) => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    try {
      const testData = {
        operation: {
          id: operation.id,
          method: operation.method,
          path: operation.path,
          summary: operation.summary
        },
        inputJson: getCurrentJsonInput(operation),
        outputJson: formatJsonOutput(operation),
        customHeaders: customHeaders[operation.id] || [],
        globalHeaders: globalHeaders,
        clientCert: clientCertEnabled ? {
          enabled: true,
          certPath: clientCertPath,
          keyPath: clientKeyPath,
          passphrase: clientCertPassphrase,
          caCertPath: caCertPath
        } : undefined,
        timestamp: new Date().toISOString(),
        apiBaseUrl: baseApiUrl,
        openApiSpecUrl: openApiSpecUrl
      };

      vscode.postMessage({
        command: 'saveTestData',
        testData: testData,
        operationId: operation.id
      });
    } catch (error) {
      setError(`Failed to save test data: ${error}`);
    }
  };

  const loadTestData = (operation: Operation) => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    try {
      vscode.postMessage({
        command: 'loadTestData',
        currentOperationId: operation.id  // Just for reference, but we'll load any operation
      });
    } catch (error) {
      setError(`Failed to load test data: ${error}`);
    }
  };

  const saveFallbackTestData = () => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    try {
      const effectiveApiUrl = baseApiUrl || url.trim();
      const testData = {
        operation: {
          id: `fallback_${lastFallbackMethod || 'manual'}`,
          method: 'FALLBACK',
          path: effectiveApiUrl,
          summary: 'Manual API Testing'
        },
        inputJson: fallbackJsonInput,
        outputJson: lastFallbackMethod ? getFallbackResponse(lastFallbackMethod) : '',
        customHeaders: fallbackHeaders,
        globalHeaders: globalHeaders,
        clientCert: clientCertEnabled ? {
          enabled: true,
          certPath: clientCertPath,
          keyPath: clientKeyPath,
          passphrase: clientCertPassphrase,
          caCertPath: caCertPath
        } : undefined,
        timestamp: new Date().toISOString(),
        apiBaseUrl: effectiveApiUrl,
        openApiSpecUrl: openApiSpecUrl || url.trim(),
        fallbackMode: true
      };

      vscode.postMessage({
        command: 'saveTestData',
        testData: testData,
        operationId: `fallback_${lastFallbackMethod || 'manual'}`
      });
    } catch (error) {
      setError(`Failed to save fallback test data: ${error}`);
    }
  };

  const loadFallbackTestData = () => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    try {
      vscode.postMessage({
        command: 'loadTestData',
        currentOperationId: `fallback_${lastFallbackMethod || 'manual'}`,
        fallbackMode: true
      });
    } catch (error) {
      setError(`Failed to load fallback test data: ${error}`);
    }
  };

  const handleBrowseFile = (fileType: 'clientCert' | 'clientKey' | 'caCert' | 'openApiSpec') => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    vscode.postMessage({
      command: 'browseFile',
      fileType: fileType
    });
  };

  const formatJsonOutput = (operation: Operation) => {
    const result = testResults[operation.id];
    if (!result) return '';
    
    // If there's only raw result/error text (no status), show it directly
    if (result.result && !result.status && !result.error) {
      try {
        JSON.parse(result.result);
        // If it's valid JSON, format it nicely
        return JSON.stringify(JSON.parse(result.result), null, 2);
      } catch {
        // If it's not valid JSON, return raw text
        return result.result;
      }
    }
    
    // If there's an error only, show it directly
    if (result.error && !result.result && !result.status) {
      return result.error;
    }
    
    // Otherwise, create structured output with status
    const outputJson: any = {};
    
    if (result.status) {
      outputJson.status = result.status;
    }
    
    if (result.result) {
      try {
        outputJson.response = JSON.parse(result.result);
      } catch {
        // For raw text responses, show them directly under response field
        outputJson.response = result.result;
      }
    }
    
    if (result.error) {
      outputJson.error = result.error;
    }
    
    return JSON.stringify(outputJson, null, 2);
  };

  const handleFallbackOperation = (method: string) => {
    if (!vscode) {
      setError('VSCode API not available');
      return;
    }

    const effectiveApiUrl = baseApiUrl || url.trim();
    if (!effectiveApiUrl) {
      setError('URL not available');
      return;
    }

    setFallbackResponse('');
    setError(null);
    setFallbackMode(true);

    try {
      const headers: Record<string, string> = {};
      
      // Add global headers first
      globalHeaders.forEach(header => {
        if (header.key.trim() && header.value.trim()) {
          headers[header.key.trim()] = header.value.trim();
        }
      });

      // Add custom headers (fallback-specific headers can override global headers)
      fallbackHeaders.forEach(header => {
        if (header.key.trim() && header.value.trim()) {
          headers[header.key.trim()] = header.value.trim();
        }
      });

      let requestBody;
      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        try {
          requestBody = JSON.parse(fallbackJsonInput);
          headers['Content-Type'] = 'application/json';
        } catch (e) {
          setError('Invalid JSON in request body');
          return;
        }
      }

      // Prepare client certificate data if enabled
      const clientCert = clientCertEnabled ? {
        enabled: true,
        certPath: clientCertPath,
        keyPath: clientKeyPath,
        passphrase: clientCertPassphrase || undefined,
        caCertPath: caCertPath || undefined
      } : undefined;

      vscode.postMessage({
        command: 'testApiOperation',
        operation: {
          id: `fallback_${method.toLowerCase()}`,
          url: effectiveApiUrl,
          method: method.toUpperCase(),
          headers,
          body: requestBody,
          clientCert
        }
      });

      // Set a placeholder result to show loading state and track the last method used
      setLastFallbackMethod(method.toLowerCase());
      setTestResults(prev => ({
        ...prev,
        [`fallback_${method.toLowerCase()}`]: { operationId: `fallback_${method.toLowerCase()}` }
      }));

    } catch (error) {
      setError(`Failed to execute ${method} request: ${error}`);
    }
  };

  const getFallbackResponse = (method: string) => {
    const result = testResults[`fallback_${method.toLowerCase()}`];
    if (!result) return '';
    
    // If there's only raw result/error text (no status), show it directly
    if (result.result && !result.status && !result.error) {
      try {
        JSON.parse(result.result);
        // If it's valid JSON, format it nicely
        return JSON.stringify(JSON.parse(result.result), null, 2);
      } catch {
        // If it's not valid JSON, return raw text
        return result.result;
      }
    }
    
    // If there's an error only, show it directly
    if (result.error && !result.result && !result.status) {
      return result.error;
    }
    
    // Otherwise, create structured output with status
    const outputJson: any = {};
    
    if (result.status) {
      outputJson.status = result.status;
    }
    
    if (result.result) {
      try {
        outputJson.response = JSON.parse(result.result);
      } catch {
        // For raw text responses, show them directly under response field
        outputJson.response = result.result;
      }
    }
    
    if (result.error) {
      outputJson.error = result.error;
    }
    
    return JSON.stringify(outputJson, null, 2);
  };

  return (
    <div className="container">
      <div className="url-input-section">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter OpenAPI spec URL or file path..."
          className="url-input"
          onKeyDown={(e) => e.key === 'Enter' && handleLoadSpec()}
        />
        <button
          onClick={() => handleBrowseFile('openApiSpec')}
          className="load-button"
          style={{ 
            backgroundColor: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            marginRight: '5px'
          }}
        >
          Browse
        </button>
        <button
          onClick={handleLoadSpec}
          disabled={loading}
          className="load-button"
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
        <select
          value={selectedLocale}
          onChange={(e) => setSelectedLocale(e.target.value)}
          className="locale-select"
        >
          {LOCALES.map(locale => (
            <option key={locale.code} value={locale.code}>
              {locale.name}
            </option>
          ))}
        </select>
      </div>

      {/* Global Headers Section */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: 'var(--vscode-textCodeBlock-background)', 
        borderRadius: '4px', 
        border: '1px solid var(--vscode-panel-border)' 
      }}>
        <h3 style={{ 
          margin: '0 0 15px 0', 
          fontSize: '14px',
          fontWeight: 'bold',
          color: 'var(--vscode-foreground)'
        }}>
          Global Headers (Applied to all operations)
        </h3>
        <HeadersEditor
          headers={globalHeaders}
          onChange={setGlobalHeaders}
        />
        <div style={{ 
          fontSize: '11px', 
          color: 'var(--vscode-descriptionForeground)', 
          marginTop: '10px' 
        }}>
          These headers will be added to all API requests. Operation-specific headers can override global headers.
        </div>
      </div>

      {/* Client Certificate Section */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: 'var(--vscode-textCodeBlock-background)', 
        borderRadius: '4px', 
        border: '1px solid var(--vscode-panel-border)' 
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '15px',
          gap: '10px'
        }}>
          <input
            type="checkbox"
            id="clientCertEnabled"
            checked={clientCertEnabled}
            onChange={(e) => setClientCertEnabled(e.target.checked)}
          />
          <label 
            htmlFor="clientCertEnabled" 
            style={{ 
              fontSize: '14px',
              fontWeight: 'bold',
              color: 'var(--vscode-foreground)'
            }}
          >
            Enable Client Certificate Authentication
          </label>
        </div>
        
        {clientCertEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
              <label style={{ 
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '120px'
              }}>
                Client Certificate:
              </label>
              <input
                type="text"
                value={clientCertPath}
                onChange={(e) => setClientCertPath(e.target.value)}
                placeholder="Path to client certificate file (.crt, .pem)"
                className="url-input"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => handleBrowseFile('clientCert')}
                className="load-button"
                style={{ 
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  minWidth: 'auto'
                }}
              >
                Browse
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
              <label style={{ 
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '120px'
              }}>
                Private Key:
              </label>
              <input
                type="text"
                value={clientKeyPath}
                onChange={(e) => setClientKeyPath(e.target.value)}
                placeholder="Path to private key file (.key, .pem)"
                className="url-input"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => handleBrowseFile('clientKey')}
                className="load-button"
                style={{ 
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  minWidth: 'auto'
                }}
              >
                Browse
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
              <label style={{ 
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '120px'
              }}>
                Passphrase (optional):
              </label>
              <input
                type="password"
                value={clientCertPassphrase}
                onChange={(e) => setClientCertPassphrase(e.target.value)}
                placeholder="Private key passphrase"
                className="url-input"
                style={{ flex: 1 }}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
              <label style={{ 
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '120px'
              }}>
                CA Certificate (optional):
              </label>
              <input
                type="text"
                value={caCertPath}
                onChange={(e) => setCaCertPath(e.target.value)}
                placeholder="Path to CA certificate file (.crt, .pem)"
                className="url-input"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => handleBrowseFile('caCert')}
                className="load-button"
                style={{ 
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  minWidth: 'auto'
                }}
              >
                Browse
              </button>
            </div>
            
            <div style={{ 
              fontSize: '11px', 
              color: 'var(--vscode-descriptionForeground)', 
              marginTop: '5px' 
            }}>
              Configure client certificate authentication for mTLS (mutual TLS). All file paths should be absolute paths.
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--vscode-errorForeground)',
              cursor: 'pointer',
              fontSize: '16px',
              marginLeft: '10px',
              padding: '0 5px'
            }}
            title="Clear error message"
          >
            ×
          </button>
        </div>
      )}


      {baseApiUrl && (
        <div style={{ 
          marginBottom: '10px', 
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <label style={{ 
            fontSize: '12px',
            fontWeight: 'bold',
            minWidth: '100px'
          }}>
            API Base URL:
          </label>
          <input
            type="text"
            value={baseApiUrl}
            onChange={(e) => setBaseApiUrl(e.target.value)}
            className="url-input"
            style={{ flex: 1, fontSize: '12px' }}
            placeholder="Enter API base URL..."
          />
        </div>
      )}

      {fallbackMode || (error && operations.length === 0 && url.trim()) ? (
        <div className="fallback-mode">
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'var(--vscode-textCodeBlock-background)', borderRadius: '4px', border: '1px solid var(--vscode-panel-border)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--vscode-foreground)' }}>Manual API Testing</h3>
            <p style={{ margin: 0, color: 'var(--vscode-descriptionForeground)', fontSize: '14px' }}>
              Unable to load OpenAPI specification. You can still test the API manually using the buttons below.
            </p>
          </div>

          <div className="fallback-content">
            <div className="fallback-left-panel">
              <div className="json-section">
                <h3>Request Body (JSON)</h3>
                <textarea
                  className="json-editor"
                  value={fallbackJsonInput}
                  onChange={(e) => setFallbackJsonInput(e.target.value)}
                  placeholder="Enter JSON request body for POST/PUT operations..."
                />
              </div>

              <div className="json-section">
                <h3>Custom Headers</h3>
                <HeadersEditor
                  headers={fallbackHeaders}
                  onChange={(headers) => setFallbackHeaders(headers)}
                />
              </div>

              <div className="http-methods-section">
                <h3>HTTP Methods</h3>
                <div className="http-methods-grid">
                  {['GET', 'POST', 'PUT', 'DELETE'].map(method => (
                    <button
                      key={method}
                      onClick={() => handleFallbackOperation(method)}
                      className={`test-button method-button ${getMethodClass(method)}`}
                      style={{ 
                        padding: '12px', 
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
                <button
                  onClick={() => saveFallbackTestData()}
                  className="test-button"
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '14px', 
                    backgroundColor: 'var(--vscode-button-secondaryBackground)', 
                    color: 'var(--vscode-button-secondaryForeground)' 
                  }}
                >
                  Save Test Data
                </button>
                <button
                  onClick={() => loadFallbackTestData()}
                  className="test-button"
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '14px', 
                    backgroundColor: 'var(--vscode-button-secondaryBackground)', 
                    color: 'var(--vscode-button-secondaryForeground)' 
                  }}
                >
                  Load Test Data
                </button>
              </div>
            </div>

            <div className="fallback-right-panel">
              <div className="json-section">
                <h3>Response</h3>
                <textarea
                  className="json-editor"
                  value={lastFallbackMethod ? getFallbackResponse(lastFallbackMethod) : ''}
                  readOnly
                  placeholder="Response will appear here after making a request..."
                />
              </div>
            </div>
          </div>
        </div>
      ) : operations.length > 0 ? (
        <div className="main-content">
          <div className="left-panel">
            <ul className="operations-list">
              {operations.map(operation => (
                <li 
                  key={operation.id} 
                  className={`operation-list-item ${selectedOperation?.id === operation.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedOperation(operation);
                    if (!parameterValues[operation.id] && operation.parameters) {
                      const initialParams: Record<string, string> = {};
                      operation.parameters.forEach(param => {
                        if (param.example !== undefined) {
                          initialParams[param.name] = String(param.example);
                        } else if (param.schema) {
                          const exampleValue = generateExampleFromSchema(param.schema);
                          initialParams[param.name] = String(exampleValue);
                        } else {
                          switch (param.type) {
                            case 'integer':
                              initialParams[param.name] = '1';
                              break;
                            case 'number':
                              initialParams[param.name] = '1.0';
                              break;
                            case 'boolean':
                              initialParams[param.name] = 'true';
                              break;
                            default:
                              initialParams[param.name] = `${param.name}`;
                          }
                        }
                      });
                      setParameterValues(prev => ({
                        ...prev,
                        [operation.id]: initialParams
                      }));
                    }
                    // Initialize custom headers if not already set
                    if (!customHeaders[operation.id]) {
                      setCustomHeaders(prev => ({
                        ...prev,
                        [operation.id]: []
                      }));
                    }
                  }}
                >
                  <div className="operation-list-header">
                    <span className={`operation-method ${getMethodClass(operation.method)}`}>
                      {operation.method}
                    </span>
                    <div className="operation-list-content">
                      <div className="operation-list-path">{operation.path}</div>
                      {operation.summary && (
                        <div className="operation-list-summary">{operation.summary}</div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="right-panel">
            {selectedOperation ? (
              <div className="operation-details">
                <div className="operation-title">
                  <span className={`operation-method ${getMethodClass(selectedOperation.method)}`}>
                    {selectedOperation.method}
                  </span>
                  <span>{selectedOperation.path}</span>
                </div>

                {selectedOperation.description && (
                  <p style={{ marginBottom: '20px', color: 'var(--vscode-descriptionForeground)' }}>
                    {selectedOperation.description}
                  </p>
                )}

                <div className="json-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0 }}>Input JSON</h3>
                      {llmProvider[selectedOperation.id] && (
                        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                          (Generated by {llmProvider[selectedOperation.id]})
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => generateLLMJson(selectedOperation)}
                      disabled={generatingLlm[selectedOperation.id]}
                      className="test-button"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {generatingLlm[selectedOperation.id] ? 'Generating...' : 'Generate with AI'}
                    </button>
                  </div>
                  <textarea
                    className="json-editor"
                    value={getCurrentJsonInput(selectedOperation)}
                    onChange={(e) => {
                      // Store the user's edited JSON
                      setEditableJsonInput(prev => ({
                        ...prev,
                        [selectedOperation.id]: e.target.value
                      }));

                      // Try to parse and extract data for internal state
                      try {
                        const inputData = JSON.parse(e.target.value);
                        
                        // Extract parameter values for this operation
                        if (inputData.pathParameters) {
                          setParameterValues(prev => ({
                            ...prev,
                            [selectedOperation.id]: {
                              ...prev[selectedOperation.id],
                              ...inputData.pathParameters
                            }
                          }));
                        }
                      } catch (error) {
                        // Invalid JSON, that's okay - user might still be typing
                      }
                    }}
                    placeholder="Input parameters and request body will appear here..."
                  />
                </div>

                <div className="json-section">
                  <h3>Custom Headers</h3>
                  <HeadersEditor
                    headers={customHeaders[selectedOperation.id] || []}
                    onChange={(headers) => {
                      setCustomHeaders(prev => ({
                        ...prev,
                        [selectedOperation.id]: headers
                      }));
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
                  <button
                    onClick={() => handleTestOperation(selectedOperation)}
                    className="test-button"
                    style={{ padding: '12px 24px', fontSize: '14px' }}
                  >
                    Test Operation
                  </button>
                  <button
                    onClick={() => saveTestData(selectedOperation)}
                    className="test-button"
                    style={{ padding: '12px 24px', fontSize: '14px', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}
                  >
                    Save Test Data
                  </button>
                  <button
                    onClick={() => loadTestData(selectedOperation)}
                    className="test-button"
                    style={{ padding: '12px 24px', fontSize: '14px', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}
                  >
                    Load Test Data
                  </button>
                </div>

                <div className="json-section">
                  <h3>Response</h3>
                  <textarea
                    className="json-editor"
                    value={formatJsonOutput(selectedOperation)}
                    readOnly
                    placeholder="Response will appear here after making a request..."
                  />
                </div>
              </div>
            ) : (
              <div className="no-operation-selected">
                Select an operation from the left panel to view details and test it
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
          Load an OpenAPI specification to begin testing
        </div>
      )}
    </div>
  );
};

export default App;
