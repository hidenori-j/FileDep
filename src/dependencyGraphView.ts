import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraphProvider } from './dependencyGraphProvider';
import * as fs from 'fs';

export class DependencyGraphView {
    private panel: vscode.WebviewPanel | undefined;
    private readonly extensionUri: vscode.Uri;
    private provider: DependencyGraphProvider;

    constructor(extensionUri: vscode.Uri, provider: DependencyGraphProvider) {
        this.extensionUri = extensionUri;
        this.provider = provider;
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

        this.panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'requestData') {
                this.updateGraph();
            }
            if (message.command === 'toggleCss') {
                this.handleCssToggle(message.checked);
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private convertToGraphData(dependencies: Map<string, string[]>) {
        console.log('Converting dependencies to graph data:', dependencies);
        const nodes: any[] = [];
        const links: any[] = [];
        const nodeMap = new Map<string, number>();

        // ワークスペースのルートパスを取得
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        // 接続数をカウント
        const connectionCounts = new Map<string, number>();
        dependencies.forEach((imports, filePath) => {
            // 出力の接続数
            connectionCounts.set(filePath, (connectionCounts.get(filePath) || 0) + imports.length);
            // 入力の接続数
            imports.forEach(importPath => {
                const fullImportPath = path.resolve(path.dirname(filePath), importPath);
                connectionCounts.set(fullImportPath, (connectionCounts.get(fullImportPath) || 0) + 1);
            });
        });

        let index = 0;
        dependencies.forEach((_, filePath) => {
            // 相対パスを計算
            const relativePath = path.relative(workspaceRoot, filePath);
            const shortPath = path.basename(filePath);
            // ディレクトリパスのみを取得
            const dirPath = path.dirname(relativePath);
            
            if (!nodeMap.has(filePath)) {
                nodeMap.set(filePath, index);
                nodes.push({ 
                    id: index, 
                    name: shortPath, 
                    fullPath: filePath,
                    dirPath: dirPath === '.' ? '' : dirPath,
                    connections: connectionCounts.get(filePath) || 0  // 接続数を追加
                });
                index++;
            }
        });

        console.log('Created nodes:', nodes);

        dependencies.forEach((imports, filePath) => {
            const sourceIndex = nodeMap.get(filePath);
            imports.forEach(importPath => {
                try {
                    const fullImportPath = path.resolve(path.dirname(filePath), importPath);
                    console.log('Resolving import path:', importPath, 'to:', fullImportPath);
                    if (nodeMap.has(fullImportPath)) {
                        const targetIndex = nodeMap.get(fullImportPath);
                        links.push({
                            source: sourceIndex,
                            target: targetIndex
                        });
                    }
                } catch (error) {
                    console.error('Error resolving import path:', error);
                }
            });
        });

        console.log('Created links:', links);
        return { nodes, links };
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
                <script id="graphData" type="application/json">${JSON.stringify(graphData)}</script>
            </head>
            <body>
                <div id="graph"></div>
                <div class="tooltip"></div>
                <div class="controls">
                    <button id="toggleForce" class="control-button">
                        <span class="icon">🔗</span>
                    </button>
                    <label class="control-checkbox">
                        <input type="checkbox" id="toggleCss" checked>
                        CSS表示
                    </label>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async updateGraph(): Promise<void> {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = this.provider.getDependencies();
            const graphData = this.convertToGraphData(dependencies);
            this.panel.webview.postMessage({ command: 'updateGraph', data: graphData });
        }
    }

    private async handleCssToggle(checked: boolean) {
        this.provider.setIncludeCss(checked);
        await this.provider.updateDependencies();
        const dependencies = this.provider.getDependencies();
        const graphData = {
            nodes: Array.from(dependencies.keys()).map(path => ({
                id: path,
                name: path.split(/[\\/]/).pop() || '',  // Windows対応のため修正
                fullPath: path,
                dirPath: path.split(/[\\/]/).slice(0, -1).join('/'),
                connections: dependencies.get(path)?.length || 0
            })),
            links: Array.from(dependencies.entries()).flatMap(([source, targets]) =>
                targets.map(target => ({
                    source,
                    target
                }))
            )
        };
        
        this.panel?.webview.postMessage({ 
            command: 'updateDependencyGraph',
            data: graphData
        });
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