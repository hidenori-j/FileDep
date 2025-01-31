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

        this.dependencies.clear();
        
        for (const folder of workspaceFolders) {
            console.log('Scanning directory:', folder.uri.fsPath);
            await this.scanDirectory(folder.uri.fsPath);
        }

        // 依存関係の解決を改善
        this.resolveDependencies();
        console.log('Final dependencies:', this.dependencies);
    }

    private async scanDirectory(dirPath: string) {
        try {
            const files = await fs.promises.readdir(dirPath);
            
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);

                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git' && file !== 'out' && !file.startsWith('.')) {
                        await this.scanDirectory(fullPath);
                    }
                } else if (this.isTargetFile(file)) {
                    await this.analyzeDependencies(fullPath);
                }
            }
        } catch (error) {
            console.error('Error scanning directory:', dirPath, error);
        }
    }

    private isTargetFile(fileName: string): boolean {
        // 解析対象のファイル拡張子を拡大
        return /\.(js|jsx|ts|tsx|vue|svelte)$/.test(fileName);
    }

    private async analyzeDependencies(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            
            // すべてのファイルをノードとして追加（依存関係がなくても）
            this.dependencies.set(filePath, []);
            
            if (imports.length > 0) {
                this.dependencies.set(filePath, imports);
            }
        } catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }

    private resolveDependencies() {
        const resolvedDeps = new Map<string, string[]>();
        
        this.dependencies.forEach((imports, filePath) => {
            const resolvedImports = imports.map(importPath => {
                if (importPath.startsWith('.')) {
                    const absolutePath = path.resolve(path.dirname(filePath), importPath);
                    // 拡張子の解決を試みる
                    const extensions = ['.tsx', '.ts', '.jsx', '.js', ''];
                    for (const ext of extensions) {
                        const pathWithExt = absolutePath + ext;
                        if (this.dependencies.has(pathWithExt)) {
                            return pathWithExt;
                        }
                        // index ファイルのチェック
                        const indexPath = path.join(absolutePath, `index${ext}`);
                        if (this.dependencies.has(indexPath)) {
                            return indexPath;
                        }
                    }
                }
                return null;
            }).filter(Boolean) as string[];

            resolvedDeps.set(filePath, resolvedImports);
        });

        this.dependencies = resolvedDeps;
    }

    private extractImports(content: string): string[] {
        const imports = new Set<string>();
        
        const patterns = [
            // ES6 imports
            /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+[^,\s]+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
            // require
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // dynamic import
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // JSX/TSX specific imports
            /(?:import|from)\s+['"]([^'"]+)['"]/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                if (importPath.startsWith('.')) {
                    imports.add(importPath);
                }
            }
        });

        return Array.from(imports);
    }

    public getDependencies(): Map<string, string[]> {
        return this.dependencies;
    }
} 