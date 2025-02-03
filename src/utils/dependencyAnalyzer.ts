import * as path from 'path';
import * as fs from 'fs';
import { PathResolver } from './pathResolver';

export class DependencyAnalyzer {
    constructor(private pathResolver: PathResolver) {}

    public async analyzeDependencies(filePath: string): Promise<Set<string>> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const fileExt = path.extname(filePath).toLowerCase();
            const dependencies = new Set<string>();
            
            if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExt)) {
                this.extractJsImports(content, dependencies);
            }
            
            if (fileExt === '.css') {
                this.extractCssImports(content, dependencies);
            } else {
                this.extractCssReferences(content, dependencies);
            }
            
            if (['.html', '.htm'].includes(fileExt)) {
                this.extractHtmlImports(content, dependencies);
            }

            return await this.pathResolver.resolveDependencyPaths(filePath, dependencies);

        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error);
            return new Set();
        }
    }

    private extractJsImports(content: string, dependencies: Set<string>) {
        const patterns = [
            // 基本的なES6 imports
            /import\s+.*?from\s+['"]([^'"]+)['"]/g,
            // 動的import
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // require
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // React Router関連
            /component:\s*(?:async\s*\(\)\s*=>\s*)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            /element:\s*<[^>]*?(?:component|path)=['"]([^'"]+)['"]/g,
            // Reactコンポーネントのインポート
            /React\.lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g,
            // JSX属性内のパス
            /(?:src|href|path|component)=\{(?:['"]([^'"]+)['"]|\s*require\(['"]([^'"]+)['"]\))\}/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1] || match[2];
                if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
                    dependencies.add(importPath);
                }
            }
        }

        // JSXの特殊なケースを処理
        const jsxContent = content.replace(/\s+/g, ' ');
        const jsxPatterns = [
            // Route要素のコンポーネント参照
            /<Route[^>]*component\s*=\s*\{([^}]+)\}/g,
            // Lazy loading
            /lazy\s*\(\s*\(\)\s*=>\s*import\s*\([^)]*['"](.[^'"]+)['"]\s*\)/g
        ];

        jsxPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(jsxContent)) !== null) {
                const importPath = match[1];
                if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
                    dependencies.add(importPath.trim());
                }
            }
        });
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
} 