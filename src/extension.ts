import * as vscode from 'vscode';
import { SpekAiPanel } from './SpekAiPanel';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('spekai.openTester', () => {
        SpekAiPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}