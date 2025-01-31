import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DependencyGraphProvider {
    private dependencies: Map<string, string[]> = new Map();

    public async updateDependencies() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('No workspace folders found');
            return;
        }

        // 依存関係をリセット
        this.dependencies.clear();

        for (const folder of workspaceFolders) {
            console.log('Scanning directory:', folder.uri.fsPath);
            await this.scanDirectory(folder.uri.fsPath);
        }

        console.log('Final dependencies:', this.dependencies);
    }

    private async scanDirectory(dirPath: string) {
        try {
            const files = await fs.promises.readdir(dirPath);
            
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);

                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git' && file !== 'out') {
                        await this.scanDirectory(fullPath);
                    }
                } else if (this.isJavaScriptFile(file)) {
                    await this.analyzeDependencies(fullPath);
                }
            }
        } catch (error) {
            console.error('Error scanning directory:', dirPath, error);
        }
    }

    private isJavaScriptFile(fileName: string): boolean {
        return /\.(js|ts|jsx|tsx)$/.test(fileName);
    }

    private async analyzeDependencies(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            
            // 相対パスを絶対パスに変換
            const resolvedImports = imports.map(importPath => {
                if (importPath.startsWith('.')) {
                    // 相対パスを解決
                    const resolvedPath = path.resolve(path.dirname(filePath), importPath);
                    
                    // JSX/TSXファイルのインポートの場合、拡張子がない可能性がある
                    if (!path.extname(resolvedPath)) {
                        const extensions = ['.tsx', '.jsx', '.ts', '.js'];
                        for (const ext of extensions) {
                            const pathWithExt = resolvedPath + ext;
                            if (fs.existsSync(pathWithExt)) {
                                return pathWithExt;
                            }
                        }
                        // index.tsx/jsx のチェック
                        for (const ext of extensions) {
                            const indexPath = path.join(resolvedPath, `index${ext}`);
                            if (fs.existsSync(indexPath)) {
                                return indexPath;
                            }
                        }
                    }
                    return resolvedPath;
                }
                return null;
            }).filter(Boolean) as string[];

            // 存在するファイルのみをフィルタリング
            const fullImports = resolvedImports.filter(importPath => {
                try {
                    return fs.existsSync(importPath) || 
                           fs.existsSync(importPath + '.tsx') || 
                           fs.existsSync(importPath + '.jsx') || 
                           fs.existsSync(importPath + '.ts') || 
                           fs.existsSync(importPath + '.js') ||
                           fs.existsSync(path.join(importPath, 'index.tsx')) ||
                           fs.existsSync(path.join(importPath, 'index.jsx')) ||
                           fs.existsSync(path.join(importPath, 'index.ts')) ||
                           fs.existsSync(path.join(importPath, 'index.js'));
                } catch (error) {
                    console.error('Error checking file existence:', importPath, error);
                    return false;
                }
            });

            console.log('File:', filePath);
            console.log('Found imports:', fullImports);

            if (fullImports.length > 0) {
                this.dependencies.set(filePath, fullImports);
            }
        } catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }

    private extractImports(content: string): string[] {
        const imports: Set<string> = new Set();

        // import文のパターン
        const patterns = [
            // ES6 imports（デフォルトインポート、名前付きインポート、全てインポート）
            /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+[^,\s]+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
            // require
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // dynamic import
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // JSXのコンポーネントインポート
            /(?:import|from)\s+['"]([^'"]+)['"]/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                // node_modulesからのインポートは除外
                if (!importPath.startsWith('.')) continue;
                imports.add(importPath);
            }
        });

        return Array.from(imports);
    }

    public getDependencies(): Map<string, string[]> {
        return this.dependencies;
    }
} 