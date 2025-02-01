import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DependencyGraphProvider {
    private dependencies: Map<string, Set<string>> = new Map();
    private reverseDependencies: Map<string, Set<string>> = new Map();
    private targetExtensions: string[] = ['.js', '.ts', '.jsx', '.tsx', '.css', '.html'];
    private disabledExtensions: Set<string> = new Set();

    public async updateDependencies() {
        this.dependencies.clear();
        this.reverseDependencies.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        // まず全てのターゲットファイルを収集
        const allFiles = await this.collectAllFiles(workspaceFolders[0].uri.fsPath);
        
        // 各ファイルの依存関係を解析
        for (const file of allFiles) {
            await this.analyzeDependencies(file);
        }

        // 双方向の依存関係を構築
        this.buildBidirectionalDependencies();
    }

    private async collectAllFiles(rootPath: string): Promise<string[]> {
        const allFiles: string[] = [];
        
        const collect = async (dirPath: string) => {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && 
                        !['node_modules', 'dist', 'build', 'out'].includes(entry.name)) {
                        await collect(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this.targetExtensions.includes(ext) && !this.disabledExtensions.has(ext)) {
                        allFiles.push(fullPath);
                    }
                }
            }
        };

        await collect(rootPath);
        return allFiles;
    }

    private async analyzeDependencies(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const fileExt = path.extname(filePath).toLowerCase();
            
            // ファイルタイプに基づいて依存関係を抽出
            const dependencies = new Set<string>();
            
            // 1. 通常のインポート（JS/TS）
            if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExt)) {
                this.extractJsImports(content, dependencies);
            }
            
            // 2. CSSの依存関係
            if (fileExt === '.css') {
                this.extractCssImports(content, dependencies);
            } else {
                // CSS以外のファイルからのCSSインポート
                this.extractCssReferences(content, dependencies);
            }
            
            // 3. HTMLの依存関係
            if (['.html', '.htm'].includes(fileExt)) {
                this.extractHtmlImports(content, dependencies);
            }

            // パスを解決して依存関係を保存
            const resolvedDeps = await this.resolveDependencyPaths(filePath, dependencies);
            this.dependencies.set(filePath, new Set(resolvedDeps));

        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error);
        }
    }

    private extractJsImports(content: string, dependencies: Set<string>) {
        const patterns = [
            /import\s+.*?from\s+['"]([^'"]+)['"]/g,
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1].startsWith('.')) {
                    dependencies.add(match[1]);
                }
            }
        }
    }

    private extractCssImports(content: string, dependencies: Set<string>) {
        const patterns = [
            /@import\s+['"]([^'"]+)['"]/g,
            /@import\s+url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/g,
            /url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1].startsWith('.')) {
                    dependencies.add(match[1]);
                }
            }
        }
    }

    private extractCssReferences(content: string, dependencies: Set<string>) {
        const patterns = [
            /import\s+['"]([^'"]+\.css)['"]/g,
            /require\s*\(\s*['"]([^'"]+\.css)['"]\s*\)/g,
            /['"]([^'"]+\.css)['"]/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1].startsWith('.')) {
                    dependencies.add(match[1]);
                }
            }
        }
    }

    private extractHtmlImports(content: string, dependencies: Set<string>) {
        const patterns = [
            /<link[^>]+href=["']([^"']+)["']/g,
            /<script[^>]+src=["']([^"']+)["']/g,
            /<img[^>]+src=["']([^"']+)["']/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1].startsWith('.')) {
                    dependencies.add(match[1]);
                }
            }
        }
    }

    private async resolveDependencyPaths(sourcePath: string, dependencies: Set<string>): Promise<string[]> {
        const baseDir = path.dirname(sourcePath);
        const resolved = new Set<string>();

        for (const dep of dependencies) {
            const resolvedPath = await this.resolveImportPath(baseDir, dep);
            if (resolvedPath) {
                resolved.add(resolvedPath);
            }
        }

        return Array.from(resolved);
    }

    private async resolveImportPath(baseDir: string, importPath: string): Promise<string | null> {
        // 拡張子が指定されている場合
        if (path.extname(importPath)) {
            const fullPath = path.resolve(baseDir, importPath);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        // 拡張子を試行
        for (const ext of this.targetExtensions) {
            const fullPath = path.resolve(baseDir, importPath + ext);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }

            // index ファイルを試行
            const indexPath = path.resolve(baseDir, importPath, 'index' + ext);
            if (await this.fileExists(indexPath)) {
                return indexPath;
            }
        }

        return null;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    private buildBidirectionalDependencies() {
        // 逆方向の依存関係を構築
        this.dependencies.forEach((deps, file) => {
            deps.forEach(dep => {
                if (!this.reverseDependencies.has(dep)) {
                    this.reverseDependencies.set(dep, new Set());
                }
                this.reverseDependencies.get(dep)!.add(file);
            });
        });
    }

    public getDependencies(): Map<string, string[]> {
        const result = new Map<string, string[]>();
        
        // 双方向の依存関係をマージ
        this.dependencies.forEach((deps, file) => {
            const allDeps = new Set(deps);
            
            // 逆方向の依存関係を追加
            const reverseDeps = this.reverseDependencies.get(file);
            if (reverseDeps) {
                reverseDeps.forEach(dep => allDeps.add(dep));
            }
            
            result.set(file, Array.from(allDeps));
        });
        
        return result;
    }

    // 拡張子設定用のメソッドを追加
    public setTargetExtensions(extensions: string[]) {
        this.targetExtensions = extensions.map(ext => 
            ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
        );
    }

    public getTargetExtensions(): { extension: string; enabled: boolean }[] {
        return this.targetExtensions.map(ext => ({
            extension: ext,
            enabled: !this.disabledExtensions.has(ext)
        }));
    }

    public setExtensionEnabled(extension: string, enabled: boolean) {
        if (enabled) {
            this.disabledExtensions.delete(extension);
        } else {
            this.disabledExtensions.add(extension);
        }
    }

    // 拡張子の有効/無効状態を取得するメソッドを追加
    public isExtensionEnabled(extension: string): boolean {
        return !this.disabledExtensions.has(extension);
    }
} 