import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DependencyGraphProvider {
    private dependencies: Map<string, string[]> = new Map();

    public async updateDependencies() {
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

    private async scanDirectory(dirPath: string) {
        try {
            const files = await fs.promises.readdir(dirPath);
            console.log('Files in directory:', dirPath, files);
            
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.promises.stat(fullPath);

                if (stat.isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git') {  // これらのディレクトリはスキップ
                        await this.scanDirectory(fullPath);
                    }
                } else if (this.isJavaScriptFile(file)) {
                    console.log('Analyzing file:', fullPath);
                    await this.analyzeDependencies(fullPath);
                }
            }
        } catch (error) {
            console.error('Error scanning directory:', dirPath, error);
        }
    }

    private isJavaScriptFile(fileName: string): boolean {
        return /\.(js|ts|jsx|tsx)$/.test(fileName);
    }

    private async analyzeDependencies(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const imports = this.extractImports(content);
            console.log('Found imports in', filePath, ':', imports);
            this.dependencies.set(filePath, imports);
        } catch (error) {
            console.error('Error analyzing file:', filePath, error);
        }
    }

    private extractImports(content: string): string[] {
        const imports: string[] = [];
        
        // import文のパターン
        const patterns = [
            /import\s+.*\s+from\s+['"](.+)['"]/g,  // import ... from '...'
            /import\s+['"](.+)['"]/g,               // import '...'
            /require\s*\(\s*['"](.+)['"]\s*\)/g     // require('...')
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                imports.push(match[1]);
            }
        });

        return imports;
    }

    public getDependencies(): Map<string, string[]> {
        return this.dependencies;
    }
} 