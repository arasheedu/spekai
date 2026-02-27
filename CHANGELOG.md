# Changelog

All notable changes to the SpekAi extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-26

### Changed
- **VS Code Language Model API Integration**: Replaced Claude API with VS Code's built-in Language Model API
  - Uses `vscode.lm.selectChatModels()` for AI-powered test data generation
  - Leverages GitHub Copilot's GPT-4o model instead of external Claude API
  - Maintains all existing functionality including locale support and sophisticated prompting

- **Removed External Dependencies**: Eliminated `@anthropic-ai/sdk` dependency from `package.json`
  - No more external API key configuration required
  - Simplified extension setup and reduced bundle size

- **Updated Configuration**: Replaced Claude API key settings with GitHub Copilot integration
  - GitHub Copilot subscription is now a prerequisite for AI features
  - Removed Claude API key configuration requirements

### Added
- **Load Saved Request Button**: Added a dedicated full-width button on the main screen to load previously saved test requests
  - Auto-loads the OpenAPI specification from the saved file
  - Automatically selects the matching operation and populates all saved data (input JSON, headers, certificates)
  - Supports loading different saved requests sequentially, reloading the spec as needed

### Improved
- **Language Selector Placement**: Moved the locale dropdown from the top URL bar to sit adjacent to the "Generate with AI" button for better contextual grouping

- **Streamlined UI**: Removed redundant "Load Test Data" button from the Request/Response panel to avoid duplication with the main screen button

### Updated
- **Documentation**: Updated README.md to reflect GitHub Copilot integration
  - Added clear prerequisites for GitHub Copilot subscription
  - Removed references to Claude API key setup

## [0.2.0] - 2024-08-26

### Added
- **Fallback Testing Mode**: Automatic fallback UI when OpenAPI specification loading fails
  - Manual HTTP method testing (GET, POST, PUT, DELETE)
  - Persistent fallback interface that doesn't disappear during testing
  - JSON request body editor for manual testing
  - Error recovery with graceful handling of invalid OpenAPI specs

- **Client Certificate Authentication**: Full mTLS (mutual TLS) support
  - Client certificate file configuration (.crt, .pem)
  - Private key file support (.key, .pem) with optional passphrase
  - CA certificate chain support
  - Global certificate settings applied to all operations
  - Browse buttons for easy file selection

- **Local File Support**: Load OpenAPI specifications from local files
  - Native file browsing with OS-specific dialogs
  - Automatic file:// URL conversion
  - Cross-platform file path handling (Windows, macOS, Linux)
  - Support for both absolute and relative file paths

- **Multi-format Support**: Enhanced OpenAPI specification parsing
  - JSON format support (existing)
  - YAML format support (.yaml, .yml files)
  - Automatic format detection and parsing
  - Comprehensive error handling for invalid formats

- **AI-Powered Test Data Generation**: LLM integration for realistic test data
  - Claude AI integration for generating test data
  - Multi-locale support (20+ languages/regions)
  - Schema-aware data generation based on OpenAPI schemas
  - Realistic names, addresses, phone numbers for different locales
  - Context-aware parameter generation

- **Enhanced Save/Load System**: Comprehensive test data persistence
  - Save complete test configurations including JSON, headers, certificates
  - Cross-session data persistence
  - Flexible loading compatible with different operations
  - Fallback mode save/load support
  - API base URL configuration persistence

- **Browse Button Functionality**: Native file selection throughout UI
  - Browse buttons for OpenAPI specification files
  - Browse buttons for all certificate files (client cert, key, CA cert)
  - Native OS file dialogs with appropriate file filters
  - Consistent button styling and height alignment

- **Developer Experience Improvements**:
  - Enhanced error messages with recovery suggestions
  - Real-time JSON validation and syntax highlighting
  - Editable API base URL with automatic extraction from specs
  - Operation organization with clean list view
  - Comprehensive parameter validation against schemas

### Enhanced
- **UI/UX Improvements**:
  - Consistent button heights across all Browse buttons
  - Secondary button styling for Browse buttons
  - Improved visual alignment and spacing
  - Enhanced input placeholders and help text
  - Professional client certificate configuration panel

- **Technical Capabilities**:
  - OpenAPI 3.0 full compatibility with reference resolution
  - Multiple content type support for requests/responses
  - Concurrent operation handling
  - Cross-platform compatibility (Windows, macOS, Linux)
  - Enhanced schema validation and constraint handling

- **Custom Headers Management**:
  - Add, edit, and remove custom HTTP headers per operation
  - Headers editor with key-value pair interface
  - Header persistence in save/load functionality
  - Global headers support for authentication tokens

### Fixed
- Fallback UI stability issues when clicking operations
- File path handling across different operating systems
- JSON parsing and validation error handling
- Button alignment and consistent styling
- OpenAPI specification reference resolution

### Dependencies
- Added `js-yaml` for YAML parsing support
- Added `@types/js-yaml` for TypeScript support
- Updated to support Node.js file system operations for local files

## [0.1.0] - 2024-08-25

### Added
- **Initial Release**: Basic OpenAPI testing functionality
- **URL Input**: Enter OpenAPI specification URLs for testing
- **Dynamic UI Generation**: Automatic UI component generation from OpenAPI specs
- **Parameter Input**: Edit request parameters, headers, and query parameters
- **Request Body Editor**: JSON editor for request payloads
- **Test Execution**: Execute API calls directly from VS Code
- **Response Display**: View API responses with status codes and error handling
- **VS Code Integration**: Seamless webview integration with VS Code
- **Basic Error Handling**: Error messages for failed API calls

### Technical Features
- React-based UI with TypeScript
- OpenAPI 3.0 specification parsing
- HTTP/HTTPS request handling
- JSON request/response processing
- VS Code webview API integration
- Extension development infrastructure

---

## Development Notes

### Version 0.2.0 Highlights
This major update transforms SpekAi from a basic OpenAPI testing tool into a comprehensive API development and testing suite. Key improvements include enterprise-grade security features (mTLS), AI-powered test generation, robust local file support, and a fallback mode that ensures the tool remains useful even when specifications fail to load.


For detailed usage instructions and examples, see the [README.md](README.md) file.