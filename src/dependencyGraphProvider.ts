import * as vscode from 'vscode';
import { FileCollector } from './utils/fileCollector';
import { DependencyAnalyzer } from './utils/dependencyAnalyzer';
import { PathResolver } from './utils/pathResolver';
import * as path from 'path';

export class DependencyGraphProvider {
    private dependencies: Map<string, Set<string>> = new Map();
    private reverseDependencies: Map<string, Set<string>> = new Map();
    private targetExtensions: string[] = ['.js', '.ts', '.jsx', '.tsx', '.css', '.html'];
    private disabledExtensions: Set<string> = new Set();
    private disabledDirectories: Set<string> = new Set();

    private fileCollector: FileCollector;
    private pathResolver: PathResolver;
    private dependencyAnalyzer: DependencyAnalyzer;

    constructor() {
        this.fileCollector = new FileCollector(this.targetExtensions, this.disabledExtensions);
        this.pathResolver = new PathResolver(this.targetExtensions);
        this.dependencyAnalyzer = new DependencyAnalyzer(this.pathResolver);
    }

    public async updateDependencies() {
        this.dependencies.clear();
        this.reverseDependencies.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const allFiles = await this.fileCollector.collectAllFiles(workspaceFolders[0].uri.fsPath);
        
        for (const file of allFiles) {
            const deps = await this.dependencyAnalyzer.analyzeDependencies(file);
            this.dependencies.set(file, deps);
        }

        this.buildBidirectionalDependencies();
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
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return result;
        }
        
        // 双方向の依存関係をマージ
        this.dependencies.forEach((deps, file) => {
            // ワークスペースからの相対パスに変換
            const relativePath = path.relative(workspaceRoot, file);
            const fileDir = path.dirname(relativePath);
            
            if (!this.isDirectoryEnabled(fileDir)) {
                return;
            }

            const allDeps = new Set<string>();
            
            // フィルタリングされていない依存関係のみを追加
            deps.forEach(dep => {
                const relativeDepPath = path.relative(workspaceRoot, dep);
                const depDir = path.dirname(relativeDepPath);
                if (this.isDirectoryEnabled(depDir)) {
                    allDeps.add(dep);
                }
            });
            
            // 逆方向の依存関係を追加
            const reverseDeps = this.reverseDependencies.get(file);
            if (reverseDeps) {
                reverseDeps.forEach(dep => {
                    const relativeDepPath = path.relative(workspaceRoot, dep);
                    const depDir = path.dirname(relativeDepPath);
                    if (this.isDirectoryEnabled(depDir)) {
                        allDeps.add(dep);
                    }
                });
            }
            
            if (allDeps.size > 0) {
                result.set(file, Array.from(allDeps));
            }
        });
        
        return result;
    }

    public setTargetExtensions(extensions: string[]) {
        this.targetExtensions = extensions.map(ext => 
            ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
        );
        this.fileCollector = new FileCollector(this.targetExtensions, this.disabledExtensions);
        this.pathResolver = new PathResolver(this.targetExtensions);
        this.dependencyAnalyzer = new DependencyAnalyzer(this.pathResolver);
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

    public isExtensionEnabled(extension: string): boolean {
        return !this.disabledExtensions.has(extension);
    }

    public setDirectoryEnabled(directory: string, enabled: boolean) {
        const allDirectories = this.getUniqueDirectories();
        
        if (enabled) {
            // 有効化する場合は、指定されたディレクトリのみを有効化
            this.disabledDirectories.delete(directory);
        } else {
            // 無効化する場合は、指定されたディレクトリとその子ディレクトリをすべて無効化
            allDirectories.forEach(dir => {
                if (dir === directory || dir.startsWith(directory + path.sep) || dir.startsWith(directory + '/')) {
                    this.disabledDirectories.add(dir);
                }
            });
        }
    }

    public isDirectoryEnabled(directory: string): boolean {
        // 自身のディレクトリが無効な場合
        if (this.disabledDirectories.has(directory)) {
            return false;
        }

        // 親ディレクトリのチェック
        let currentDir = directory;
        while (currentDir !== '.' && currentDir !== '') {
            currentDir = path.dirname(currentDir);
            if (this.disabledDirectories.has(currentDir)) {
                return false;
            }
        }

        return true;
    }

    public getUniqueDirectories(): string[] {
        const directories = new Set<string>();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return [];
        }
        
        // すべてのファイルのディレクトリパスを収集
        this.dependencies.forEach((_, file) => {
            const relativePath = path.relative(workspaceRoot, file);
            let currentDir = path.dirname(relativePath);
            
            // ディレクトリとその親ディレクトリをすべて追加
            while (currentDir !== '.' && currentDir !== '') {
                directories.add(currentDir);
                currentDir = path.dirname(currentDir);
            }
            if (currentDir === '.') {
                directories.add('.');
            }
        });

        // パスの深さでソート（深いパスが後に来るように）
        return Array.from(directories).sort((a, b) => {
            const depthA = a.split(/[\\/]/).length;
            const depthB = b.split(/[\\/]/).length;
            if (depthA === depthB) {
                return a.localeCompare(b);
            }
            return depthA - depthB;
        });
    }
} 