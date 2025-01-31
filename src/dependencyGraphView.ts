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
                    this.extensionUri,
                    vscode.Uri.parse('https://d3js.org/')
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
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'dependencyGraph.html');
        const cssPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'style.css');
        const jsPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'script.js');

        let html = fs.readFileSync(htmlPath, 'utf-8');
        const css = fs.readFileSync(cssPath, 'utf-8');
        const js = fs.readFileSync(jsPath, 'utf-8');

        // WebViewのリソースURIを取得
        const cssUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(cssPath));
        const jsUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(jsPath));

        // HTMLにグラフデータを注入
        html = html.replace('</head>', `
            <style>${css}</style>
            <script id="graphData" type="application/json">${JSON.stringify(graphData)}</script>
            </head>
        `);

        // スクリプトを注入
        html = html.replace('</body>', `
            <script>${js}</script>
            </body>
        `);

        return html;
    }

    private async updateGraph(): Promise<void> {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = this.provider.getDependencies();
            const graphData = this.convertToGraphData(dependencies);
            this.panel.webview.postMessage({ command: 'updateGraph', data: graphData });
        }
    }
} 