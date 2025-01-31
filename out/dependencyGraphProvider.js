"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyGraphProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DependencyGraphProvider {
    constructor() {
        this.dependencies = new Map();
    }
    async updateDependencies() {
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
    async scanDirectory(dirPath) {
        try {
            const files = await fs.promises.readdir(dirPath);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);
                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git' && file !== 'out' && !file.startsWith('.')) {
                        await this.scanDirectory(fullPath);
                    }
                }
                else if (this.isTargetFile(file)) {
                    await this.analyzeDependencies(fullPath);
                }
            }
        }
        catch (error) {
            console.error('Error scanning directory:', dirPath, error);
        }
    }
    isTargetFile(fileName) {
        // 解析対象のファイル拡張子を拡大
        return /\.(js|jsx|ts|tsx|vue|svelte)$/.test(fileName);
    }
    async analyzeDependencies(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            // すべてのファイルをノードとして追加（依存関係がなくても）
            this.dependencies.set(filePath, []);
            if (imports.length > 0) {
                this.dependencies.set(filePath, imports);
            }
        }
        catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }
    resolveDependencies() {
        const resolvedDeps = new Map();
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
            }).filter(Boolean);
            resolvedDeps.set(filePath, resolvedImports);
        });
        this.dependencies = resolvedDeps;
    }
    extractImports(content) {
        const imports = new Set();
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
    getDependencies() {
        return this.dependencies;
    }
}
exports.DependencyGraphProvider = DependencyGraphProvider;
//# sourceMappingURL=dependencyGraphProvider.js.map