import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraphProvider } from './dependencyGraphProvider';
import * as fs from 'fs';

export class DependencyGraphView {
    private panel: vscode.WebviewPanel | undefined;
    private readonly extensionUri: vscode.Uri;
    private provider: DependencyGraphProvider;
    private messageHandler: (message: any) => Promise<void>;

    constructor(extensionUri: vscode.Uri, provider: DependencyGraphProvider) {
        this.extensionUri = extensionUri;
        this.provider = provider;

        // メッセージハンドラーを設定
        this.messageHandler = async (message: any) => {
            switch (message.command) {
                case 'toggleExtension':
                    await this.handleExtensionToggle(message.extension, message.checked);
                    break;
                case 'toggleDirectory':
                    await this.handleDirectoryToggle(message.directory, message.checked);
                    break;
            }
        };
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'dependencyGraph',
            'FileDep',
            {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: true
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    this.extensionUri
                ]
            }
        );

        await this.provider.updateDependencies();
        const dependencies = this.provider.getDependencies();
        const graphData = this.convertToGraphData(dependencies);
        
        this.panel.webview.html = this.getWebviewContent(graphData);

        this.panel.webview.onDidReceiveMessage(this.messageHandler);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private convertToGraphData(dependencies: Map<string, string[]>) {
        const nodes: any[] = [];
        const links: any[] = [];
        const nodeMap = new Map<string, boolean>();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const uniqueDirectories = this.provider.getUniqueDirectories();

        // まず全てのノードを収集（依存関係の両端）
        dependencies.forEach((targets, source) => {
            if (!nodeMap.has(source)) {
                nodeMap.set(source, true);
            }
            targets.forEach(target => {
                if (!nodeMap.has(target)) {
                    nodeMap.set(target, true);
                }
            });
        });

        // ノードの作成
        Array.from(nodeMap.keys()).forEach(filePath => {
            const relativePath = path.relative(workspaceRoot, filePath);
            const shortPath = path.basename(filePath);
            const dirPath = path.dirname(relativePath);
            
            nodes.push({
                id: filePath,
                name: shortPath,
                fullPath: filePath,
                dirPath: dirPath === '.' ? '' : dirPath,
                connections: (dependencies.get(filePath)?.length || 0) +
                    Array.from(dependencies.values()).filter(deps => deps.includes(filePath)).length
            });
        });

        // リンクの作成
        dependencies.forEach((targets, source) => {
            targets.forEach(target => {
                links.push({
                    source: source,
                    target: target
                });
            });
        });

        return {
            nodes,
            links,
            config: {
                targetExtensions: this.provider.getTargetExtensions(),
                directories: uniqueDirectories.map(dir => ({
                    path: dir,
                    enabled: this.provider.isDirectoryEnabled(dir)
                }))
            }
        };
    }

    private getWebviewContent(graphData: any) {
        const webview = this.panel!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'script.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'style.css')
        );

        // CSPをより寛容に設定
        const nonce = getNonce();
        const csp = `
            default-src 'none';
            img-src ${webview.cspSource} https: data:;
            script-src ${webview.cspSource} https: 'unsafe-inline' 'unsafe-eval';
            style-src ${webview.cspSource} https: 'unsafe-inline';
            font-src ${webview.cspSource} https:;
        `;

        const webviewData = {
            ...graphData,
            config: {
                targetExtensions: this.provider.getTargetExtensions(),
                directories: this.provider.getUniqueDirectories().map(dir => ({
                    path: dir,
                    enabled: this.provider.isDirectoryEnabled(dir)
                }))
            }
        };
        
        console.log('Webview data:', webviewData); // デバッグ用ログを追加

        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="${csp}">
                <title>依存関係グラフ</title>
                <script src="https://d3js.org/d3.v7.min.js"></script>
                <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
                <link rel="stylesheet" href="${styleUri}">
                <script id="graphData" type="application/json">${JSON.stringify(webviewData)}</script>
            </head>
            <body>
                <div id="graph"></div>
                <div class="tooltip"></div>
                <div class="controls">
                    <button id="toggleForce" class="control-button">
                        <span class="icon">🔗</span>
                    </button>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async updateGraph(): Promise<void> {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = this.provider.getDependencies();
            const graphData = {
                nodes: Array.from(dependencies.keys()).map(path => ({
                    id: path,
                    name: path.split(/[\\/]/).pop() || '',
                    fullPath: path,
                    dirPath: path.split(/[\\/]/).slice(0, -1).join('/'),
                    connections: dependencies.get(path)?.length || 0
                })),
                links: Array.from(dependencies.entries()).flatMap(([source, targets]) =>
                    targets.map(target => ({
                        source,
                        target
                    }))
                ),
                config: {
                    targetExtensions: this.provider.getTargetExtensions(),
                    directories: this.provider.getUniqueDirectories().map(dir => ({
                        path: dir,
                        enabled: this.provider.isDirectoryEnabled(dir)
                    }))
                }
            };
            this.panel.webview.postMessage({ 
                command: 'updateDependencyGraph', 
                data: graphData 
            });
        }
    }

    private async handleExtensionToggle(extension: string, checked: boolean) {
        this.provider.setExtensionEnabled(extension, checked);
        await this.provider.updateDependencies();
        const dependencies = this.provider.getDependencies();
        const graphData = {
            nodes: Array.from(dependencies.keys()).map(path => ({
                id: path,
                name: path.split(/[\\/]/).pop() || '',
                fullPath: path,
                dirPath: path.split(/[\\/]/).slice(0, -1).join('/'),
                connections: dependencies.get(path)?.length || 0
            })),
            links: Array.from(dependencies.entries()).flatMap(([source, targets]) =>
                targets.map(target => ({
                    source,
                    target
                }))
            ),
            config: {
                targetExtensions: this.provider.getTargetExtensions(),
                directories: this.provider.getUniqueDirectories().map(dir => ({
                    path: dir,
                    enabled: this.provider.isDirectoryEnabled(dir)
                }))
            }
        };
        
        this.panel?.webview.postMessage({ 
            command: 'updateDependencyGraph',
            data: graphData
        });
    }

    private async handleDirectoryToggle(directory: string, checked: boolean) {
        this.provider.setDirectoryEnabled(directory, checked);
        await this.updateGraph();
    }

    public setTargetExtensions(extensions: string[]) {
        this.provider.setTargetExtensions(extensions);
        this.updateGraph();
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 