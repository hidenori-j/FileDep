import * as vscode from 'vscode';
import { DependencyGraphProvider } from './dependencyGraphProvider';
import { DependencyGraphView } from './dependencyGraphView';

export function activate(context: vscode.ExtensionContext) {
    const provider = new DependencyGraphProvider();
    const view = new DependencyGraphView(context.extensionUri, provider);

    context.subscriptions.push(
        vscode.commands.registerCommand('filedep.showGraph', async () => {
            await view.show();
        })
    );
}

export function deactivate() {} 