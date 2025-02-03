import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileCollector {
    constructor(
        private targetExtensions: string[],
        private disabledExtensions: Set<string>
    ) {}

    public async collectAllFiles(rootPath: string): Promise<string[]> {
        const allFiles: string[] = [];
        
        const collect = async (dirPath: string) => {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && 
                        !['node_modules', 'dist', 'build', 'out'].includes(entry.name)) {
                        await collect(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this.targetExtensions.includes(ext) && !this.disabledExtensions.has(ext)) {
                        allFiles.push(fullPath);
                    }
                }
            }
        };

        await collect(rootPath);
        return allFiles;
    }
} 