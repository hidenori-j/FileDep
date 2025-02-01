import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const DEFAULT_TARGET_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.css'];

export class DependencyGraphProvider {
    private dependencies: Map<string, string[]> = new Map();
    private targetExtensions: string[] = DEFAULT_TARGET_EXTENSIONS;
    private disabledExtensions: Set<string> = new Set();

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
        const ext = '.' + fileName.split('.').pop()?.toLowerCase();
        // ファイルの拡張子が対象拡張子の一つで、かつ無効化されていない場合のみtrue
        return this.targetExtensions.includes(ext) && !this.disabledExtensions.has(ext);
    }

    private async analyzeDependencies(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            
            // すべてのファイルをノードとして追加（依存関係がなくても）
            this.dependencies.set(filePath, []);
            
            if (imports.length > 0) {
                const resolvedImports = await Promise.all(imports.map(async importPath => {
                    if (importPath.startsWith('.')) {
                        const absolutePath = path.resolve(path.dirname(filePath), importPath);
                        const fileExt = path.extname(filePath).toLowerCase();
                        
                        // 拡張子が指定されている場合は直接チェック
                        if (path.extname(importPath)) {
                            if (fs.existsSync(absolutePath)) {
                                return absolutePath;
                            }
                            return null;
                        }

                        // CSSファイルからのインポートは.cssのみを探す
                        if (fileExt === '.css') {
                            const cssPath = absolutePath + '.css';
                            if (fs.existsSync(cssPath)) {
                                return cssPath;
                            }
                            return null;
                        }

                        // その他のファイルタイプの場合
                        for (const ext of this.targetExtensions) {
                            // 直接ファイル
                            const pathWithExt = absolutePath + ext;
                            if (fs.existsSync(pathWithExt)) {
                                return pathWithExt;
                            }

                            // indexファイル
                            const indexPath = path.join(absolutePath, `index${ext}`);
                            if (fs.existsSync(indexPath)) {
                                return indexPath;
                            }
                        }
                    }
                    return null;
                }));

                const validImports = resolvedImports.filter(Boolean) as string[];
                if (validImports.length > 0) {
                    this.dependencies.set(filePath, validImports);
                }
            }
        } catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
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
            /(?:import|from)\s+['"]([^'"]+)['"]/g,
            // CSS imports (@import)
            /@import\s+['"]([^'"]+)['"]/g,
            // CSS url imports
            /url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/g
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