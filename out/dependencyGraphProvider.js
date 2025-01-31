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
        // 依存関係をリセット
        this.dependencies.clear();
        for (const folder of workspaceFolders) {
            console.log('Scanning directory:', folder.uri.fsPath);
            await this.scanDirectory(folder.uri.fsPath);
        }
        console.log('Final dependencies:', this.dependencies);
    }
    async scanDirectory(dirPath) {
        try {
            const files = await fs.promises.readdir(dirPath);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);
                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git' && file !== 'out') {
                        await this.scanDirectory(fullPath);
                    }
                }
                else if (this.isJavaScriptFile(file)) {
                    await this.analyzeDependencies(fullPath);
                }
            }
        }
        catch (error) {
            console.error('Error scanning directory:', dirPath, error);
        }
    }
    isJavaScriptFile(fileName) {
        return /\.(js|ts|jsx|tsx)$/.test(fileName);
    }
    async analyzeDependencies(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            // 相対パスを絶対パスに変換
            const resolvedImports = imports.map(importPath => {
                if (importPath.startsWith('.')) {
                    // 相対パスを解決
                    return path.resolve(path.dirname(filePath), importPath);
                }
                // node_modulesからのインポートは除外
                return null;
            }).filter(Boolean);
            // ファイル拡張子を補完
            const fullImports = resolvedImports.map(importPath => {
                if (fs.existsSync(importPath)) {
                    return importPath;
                }
                // 拡張子を試す
                const extensions = ['.ts', '.tsx', '.js', '.jsx'];
                for (const ext of extensions) {
                    const pathWithExt = importPath + ext;
                    if (fs.existsSync(pathWithExt)) {
                        return pathWithExt;
                    }
                }
                return null;
            }).filter(Boolean);
            console.log('File:', filePath);
            console.log('Found imports:', fullImports);
            if (fullImports.length > 0) {
                this.dependencies.set(filePath, fullImports);
            }
        }
        catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }
    extractImports(content) {
        const imports = new Set();
        // import文のパターン
        const patterns = [
            // ES6 imports
            /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+[^,\s]+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
            // require
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // dynamic import
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
        ];
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                // node_modulesからのインポートは除外
                if (!importPath.startsWith('.'))
                    continue;
                imports.add(importPath);
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