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
            /(?:src|href|path|component)=\{(?:['"]([^'"]+)['"]|\s*require\(['"]([^'"]+)['"]\))\}/g,
            // React.lazy と dynamic import
            /lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g,
            // Next.js dynamic import
            /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g,
            // React Router v6のroute定義
            /{\s*path:\s*['"].*?['"],\s*(?:element|Component):\s*(?:<\s*)?([A-Za-z0-9_]+)/g,
            // importされたコンポーネント名を抽出
            /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g
        ];

        // JSXの特殊なケースを処理
        const jsxPatterns = [
            // コンポーネントの使用を検出
            /<([A-Z][A-Za-z0-9_]*)/g,
            // Routeコンポーネント
            /<Route[^>]*component={([^}]+)}/g,
            /<Route[^>]*element={[^>]*<([A-Z][A-Za-z0-9_]*)/g,
            // Suspense + lazy
            /React\.lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g
        ];

        // 通常のimportパターンを処理
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1] || match[2];
                if (importPath && (importPath.startsWith('.') || importPath.startsWith('/'))) {
                    dependencies.add(importPath);
                }
            }
        }

        // importされたコンポーネント名とパスのマッピングを作成
        const importedComponents = new Map<string, string>();
        const importPattern = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
        let importMatch;
        while ((importMatch = importPattern.exec(content)) !== null) {
            const components = importMatch[1].split(',').map(c => c.trim().split(' as ')[0]);
            const importPath = importMatch[2];
            components.forEach(component => {
                if (importPath.startsWith('.') || importPath.startsWith('/')) {
                    importedComponents.set(component, importPath);
                }
            });
        }

        // JSXパターンを処理
        const jsxContent = content.replace(/\s+/g, ' ');
        for (const pattern of jsxPatterns) {
            let match;
            while ((match = pattern.exec(jsxContent)) !== null) {
                const componentName = match[1];
                if (componentName && importedComponents.has(componentName)) {
                    dependencies.add(importedComponents.get(componentName)!);
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
} 