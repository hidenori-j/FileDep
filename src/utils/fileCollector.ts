import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileCollector {
    private readonly extensions: string[];
    private readonly disabled: Set<string>;

    constructor(
        targetExtensions: string[],
        disabledExtensions: Set<string>
    ) {
        this.extensions = [...targetExtensions];
        this.disabled = new Set(disabledExtensions);
    }

    public async collectAllFiles(rootPath: string): Promise<string[]> {
        const allFiles: string[] = [];
        
        const collect = async (dirPath: string) => {
            try {
                const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    
                    if (entry.isDirectory()) {
                        if (!this.shouldSkipDirectory(entry.name)) {
                            await collect(fullPath);
                        }
                    } else if (entry.isFile()) {
                        if (this.shouldIncludeFile(entry.name)) {
                            allFiles.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error collecting files from ${dirPath}:`, error);
            }
        };

        await collect(rootPath);
        return allFiles;
    }

    private shouldSkipDirectory(dirName: string): boolean {
        return dirName.startsWith('.') || 
               ['node_modules', 'dist', 'build', 'out', '.git', '.vscode'].includes(dirName);
    }

    private shouldIncludeFile(fileName: string): boolean {
        const ext = path.extname(fileName).toLowerCase();
        return this.extensions.includes(ext) && !this.disabled.has(ext);
    }
} 