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
        console.log('Workspace folders:', workspaceFolders);
        for (const folder of workspaceFolders) {
            console.log('Scanning directory:', folder.uri.fsPath);
            await this.scanDirectory(folder.uri.fsPath);
        }
        console.log('Dependencies found:', this.dependencies);
    }
    async scanDirectory(dirPath) {
        try {
            const files = await fs.promises.readdir(dirPath);
            console.log('Files in directory:', dirPath, files);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);
                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git') { // これらのディレクトリはスキップ
                        await this.scanDirectory(fullPath);
                    }
                }
                else if (this.isJavaScriptFile(file)) {
                    console.log('Analyzing file:', fullPath);
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
            console.log('Found imports in', filePath, ':', imports);
            this.dependencies.set(filePath, imports);
        }
        catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }
    extractImports(content) {
        const imports = [];
        // import文のパターン
        const patterns = [
            /import\s+.*\s+from\s+['"](.+)['"]/g,
            /import\s+['"](.+)['"]/g,
            /require\s*\(\s*['"](.+)['"]\s*\)/g // require('...')
        ];
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                imports.push(match[1]);
            }
        });
        return imports;
    }
    getDependencies() {
        return this.dependencies;
    }
}
exports.DependencyGraphProvider = DependencyGraphProvider;
//# sourceMappingURL=dependencyGraphProvider.js.map