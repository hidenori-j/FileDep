import * as vscode from 'vscode';
import { DependencyGraphProvider } from './dependencyGraphProvider';
import { DependencyGraphView } from './dependencyGraphView';

export function activate(context: vscode.ExtensionContext) {
    const provider = new DependencyGraphProvider();
    const view = new DependencyGraphView(context.extensionUri, provider);

    context.subscriptions.push(
        vscode.commands.registerCommand('filedep.showGraph', async () => {
            await view.show();
        }),

        vscode.commands.registerCommand('filedep.setTargetExtensions', async () => {
            const input = await vscode.window.showInputBox({
                prompt: '対象とする拡張子をカンマ区切りで入力してください（例: .js,.ts,.vue）',
                value: provider.getTargetExtensions().join(',')
            });

            if (input) {
                const extensions = input.split(',')
                    .map(ext => ext.trim())
                    .filter(ext => ext);
                view.setTargetExtensions(extensions);
            }
        })
    );
}

export function deactivate() {} 