import * as path from 'path';
import * as fs from 'fs';

export class PathResolver {
    private readonly extensions: string[];

    constructor(targetExtensions: string[]) {
        this.extensions = [...targetExtensions];
    }

    public async resolveDependencyPaths(filePath: string, dependencies: Set<string>): Promise<Set<string>> {
        const baseDir = path.dirname(filePath);
        const resolved = new Set<string>();

        for (const dep of dependencies) {
            const resolvedPath = await this.resolveImportPath(baseDir, dep);
            if (resolvedPath) {
                resolved.add(resolvedPath);
            }
        }

        return resolved;
    }

    private async resolveImportPath(baseDir: string, importPath: string): Promise<string | null> {
        // 既に拡張子がある場合
        if (path.extname(importPath)) {
            const fullPath = path.resolve(baseDir, importPath);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        // 拡張子なしのパスを処理
        const possibleExtensions = [...this.extensions];
        
        // 試すパスのパターンを作成
        const pathPatterns = [
            // 直接ファイル
            importPath,
            // index付きのパス
            path.join(importPath, 'index')
        ];

        // 各パターンと拡張子の組み合わせを試す
        for (const pattern of pathPatterns) {
            for (const ext of possibleExtensions) {
                const fullPath = path.resolve(baseDir, pattern + ext);
                try {
                    if (await this.fileExists(fullPath)) {
                        return fullPath;
                    }
                } catch (error) {
                    console.error(`Error checking path ${fullPath}:`, error);
                }
            }
        }

        // JSXファイルの特別な処理
        if (!path.extname(importPath)) {
            const jsxPath = path.resolve(baseDir, `${importPath}.jsx`);
            if (await this.fileExists(jsxPath)) {
                return jsxPath;
            }
            
            const tsxPath = path.resolve(baseDir, `${importPath}.tsx`);
            if (await this.fileExists(tsxPath)) {
                return tsxPath;
            }

            // index.jsxファイルのチェック
            const indexJsxPath = path.resolve(baseDir, importPath, 'index.jsx');
            if (await this.fileExists(indexJsxPath)) {
                return indexJsxPath;
            }

            // index.tsxファイルのチェック
            const indexTsxPath = path.resolve(baseDir, importPath, 'index.tsx');
            if (await this.fileExists(indexTsxPath)) {
                return indexTsxPath;
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
} 