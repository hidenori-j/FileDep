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
        console.log('Analyzing imports in content');
        
        // インポートマッピングを作成
        const importedComponents = new Map<string, string>();

        // デフォルトインポートを最初に処理
        const defaultImportPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = defaultImportPattern.exec(content)) !== null) {
            const componentName = match[1];
            const importPath = match[2];
            console.log('Found default import:', { componentName, importPath });
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
                importedComponents.set(componentName, importPath);
                dependencies.add(importPath);
            }
        }

        // 名前付きインポートを処理
        const namedImportPattern = /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g;
        while ((match = namedImportPattern.exec(content)) !== null) {
            const components = match[1].split(',').map(c => c.trim().split(' as ')[0]);
            const importPath = match[2];
            console.log('Found named imports:', { components, importPath });
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
                components.forEach(component => {
                    importedComponents.set(component, importPath);
                });
                dependencies.add(importPath);
            }
        }

        // その他のインポートパターン
        const patterns = [
            // 動的import
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // require
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // JSX属性内のパス
            /(?:src|href|path|component)=\{(?:['"]([^'"]+)['"]|\s*require\(['"]([^'"]+)['"]\))\}/g,
            // React.lazy
            /React\.lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g,
            // 通常のlazy
            /lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g,
            // Next.js dynamic import
            /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g
        ];

        // 通常のインポートパターンを処理
        for (const pattern of patterns) {
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1] || match[2];
                if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
                    console.log('Found other import:', importPath);
                    dependencies.add(importPath);
                }
            }
        }

        // JSXパターンを処理
        const jsxContent = content.replace(/\s+/g, ' ');
        
        // Route要素の処理（より包括的なパターン）
        const routePatterns = [
            // 基本的なRoute要素
            /<Route[^>]*element=\{[\s]*<([A-Z][A-Za-z0-9_]*)[^>]*?\/?\s*>\s*\}/g,
            // 自己終了タグ形式
            /<Route[^>]*element=\{[\s]*([A-Z][A-Za-z0-9_]*)\s*\/?\s*\}/g,
            // コンポーネント参照形式
            /<Route[^>]*element=\{[\s]*([A-Z][A-Za-z0-9_]*)\s*\}/g,
            // 古い形式のcomponent prop
            /<Route[^>]*component=\{([A-Z][A-Za-z0-9_]*)\}/g
        ];

        for (const pattern of routePatterns) {
            while ((match = pattern.exec(jsxContent)) !== null) {
                const componentName = match[1];
                console.log('Found Route component:', componentName);
                if (componentName && importedComponents.has(componentName)) {
                    const importPath = importedComponents.get(componentName)!;
                    console.log('Adding Route dependency:', importPath);
                    dependencies.add(importPath);
                }
            }
        }

        // 一般的なJSXコンポーネントの使用を検出
        const jsxComponentPattern = /<([A-Z][A-Za-z0-9_]*)[^>]*?\/?>/g;
        while ((match = jsxComponentPattern.exec(jsxContent)) !== null) {
            const componentName = match[1];
            console.log('Found JSX component:', componentName);
            if (componentName && importedComponents.has(componentName)) {
                const importPath = importedComponents.get(componentName)!;
                console.log('Adding JSX dependency:', importPath);
                dependencies.add(importPath);
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
} 