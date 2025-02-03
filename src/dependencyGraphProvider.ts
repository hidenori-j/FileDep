import * as vscode from 'vscode';
import { FileCollector } from './utils/fileCollector';
import { DependencyAnalyzer } from './utils/dependencyAnalyzer';
import { PathResolver } from './utils/pathResolver';

export class DependencyGraphProvider {
    private dependencies: Map<string, Set<string>> = new Map();
    private reverseDependencies: Map<string, Set<string>> = new Map();
    private targetExtensions: string[] = ['.js', '.ts', '.jsx', '.tsx', '.css', '.html'];
    private disabledExtensions: Set<string> = new Set();

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
} 