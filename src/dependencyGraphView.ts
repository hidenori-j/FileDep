import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraphProvider } from './dependencyGraphProvider';
import * as fs from 'fs';

interface GraphNode {
    id: string;
    name: string;
    fullPath: string;
    dirPath: string;
    description: string;
    connections: number;
}

interface GraphLink {
    source: string;
    target: string;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    config: {
        targetExtensions: { extension: string; enabled: boolean }[];
        directories: { path: string; enabled: boolean }[];
    };
}

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
                case 'selectFile':
                    await this.handleFileSelect(message.filePath);
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
        const dependencies = await this.provider.getDependencies();
        const uniqueDirectories = await this.provider.getUniqueDirectories();
        const graphData = await this.convertToGraphData(dependencies, uniqueDirectories);
        
        this.panel.webview.html = await this.getWebviewContent(graphData);

        this.panel.webview.onDidReceiveMessage(this.messageHandler);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private async convertToGraphData(dependencies: Map<string, string[]>, uniqueDirectories: string[]): Promise<GraphData> {
        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];
        const nodeMap = new Map<string, boolean>();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        // まず全てのノードを収集（依存関係の両端）
        for (const [source, targets] of dependencies) {
            if (!nodeMap.has(source)) {
                nodeMap.set(source, true);
            }
            for (const target of targets) {
                if (!nodeMap.has(target)) {
                    nodeMap.set(target, true);
                }
            }
        }

        // ノードの作成（非同期処理を含む）
        for (const filePath of nodeMap.keys()) {
            const relativePath = path.relative(workspaceRoot, filePath);
            const shortPath = path.basename(filePath);
            const dirPath = path.dirname(relativePath);
            
            // ファイルの説明を取得
            const description = await (this.provider as any).getFileDescription(filePath);
            
            nodes.push({
                id: filePath,
                name: shortPath,
                fullPath: filePath,
                dirPath: dirPath === '.' ? '' : dirPath,
                description,
                connections: (dependencies.get(filePath)?.length || 0) +
                    Array.from(dependencies.values()).filter(deps => deps.includes(filePath)).length
            });
        }

        // リンクの作成
        for (const [source, targets] of dependencies) {
            for (const target of targets) {
                links.push({
                    source,
                    target
                });
            }
        }

        return {
            nodes,
            links,
            config: {
                targetExtensions: this.provider.getTargetExtensions(),
                directories: uniqueDirectories.map((dir: string) => ({
                    path: dir,
                    enabled: this.provider.isDirectoryEnabled(dir)
                }))
            }
        };
    }

    private async getWebviewContent(graphData: any) {
        const webview = this.panel!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'script.js')
        );
        const shapesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'shapes.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'style.css')
        );

        const csp = `
            default-src 'none';
            img-src ${webview.cspSource} https: data:;
            script-src ${webview.cspSource} https: 'unsafe-inline' 'unsafe-eval';
            style-src ${webview.cspSource} https: 'unsafe-inline';
            font-src ${webview.cspSource} https:;
        `;

        const uniqueDirectories = await this.provider.getUniqueDirectories();
        const webviewData = {
            ...graphData,
            config: {
                targetExtensions: this.provider.getTargetExtensions(),
                directories: uniqueDirectories.map(dir => ({
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
                    <button id="toggleFilters" class="toggle-filters-button">
                        <span class="icon">⚙️</span>
                    </button>
                    <div class="filter-container">
                        <!-- フィルターコンテンツはscript.tsのcreateFilterControls()で動的に生成されます -->
                    </div>
                    <button id="toggleForce" class="control-button">
                        <span class="icon">🔗</span>
                    </button>
                </div>
                <script src="${shapesUri}"></script>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private async updateGraph(): Promise<void> {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = await this.provider.getDependencies();
            const uniqueDirectories = await this.provider.getUniqueDirectories();
            const graphData = await this.convertToGraphData(dependencies, uniqueDirectories);
            
            this.panel.webview.postMessage({ 
                command: 'updateDependencyGraph', 
                data: graphData 
            });
        }
    }

    private async handleExtensionToggle(extension: string, checked: boolean) {
        this.provider.setExtensionEnabled(extension, checked);
        await this.provider.updateDependencies();
        await this.updateGraph();
    }

    private async handleDirectoryToggle(directory: string, checked: boolean) {
        await this.provider.setDirectoryEnabled(directory, checked);
        await this.updateGraph();
    }

    private async handleFileSelect(filePath: string) {
        try {
            if (!filePath) {
                const errorMessage = 'ファイルパスが指定されていません';
                console.error(errorMessage);
                this.panel?.webview.postMessage({
                    command: 'error',
                    message: errorMessage
                });
                return;
            }

            const uri = vscode.Uri.file(filePath);
            
            // ファイルが存在するか確認
            try {
                await vscode.workspace.fs.stat(uri);
            } catch (error) {
                const errorMessage = `ファイルが見つかりません: ${filePath}`;
                console.error(errorMessage);
                this.panel?.webview.postMessage({
                    command: 'error',
                    message: errorMessage
                });
                return;
            }

            // エクスプローラーでファイルを選択（フォーカスは移動しない）
            await vscode.commands.executeCommand('revealInExplorer', uri);

            // ファイルを開く（フォーカスは維持）
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, {
                preserveFocus: true,  // フォーカスを維持
                preview: true,        // プレビューモードで開く
                viewColumn: vscode.ViewColumn.Beside  // 現在のビューの横に表示
            });

        } catch (error) {
            const errorMessage = `ファイルの選択中にエラーが発生しました: ${error}`;
            console.error(errorMessage);
            this.panel?.webview.postMessage({
                command: 'error',
                message: errorMessage
            });
        }
    }

    public async setTargetExtensions(extensions: string[]) {
        this.provider.setTargetExtensions(extensions);
        await this.updateGraph();
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