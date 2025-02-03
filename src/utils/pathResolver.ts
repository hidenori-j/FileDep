import * as path from 'path';
import * as fs from 'fs';

export class PathResolver {
    constructor(private targetExtensions: string[]) {}

    public async resolveDependencyPaths(filePath: string, dependencies: Set<string>): Promise<Set<string>> {
        const baseDir = path.dirname(filePath);
        const resolved = new Set<string>();

        for (const dep of dependencies) {
            const resolvedPath = await this.resolveImportPath(baseDir, dep);
            if (resolvedPath) {
                resolved.add(resolvedPath);
            }
        }

        return resolved;
    }

    private async resolveImportPath(baseDir: string, importPath: string): Promise<string | null> {
        if (path.extname(importPath)) {
            const fullPath = path.resolve(baseDir, importPath);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        for (const ext of this.targetExtensions) {
            const fullPath = path.resolve(baseDir, importPath + ext);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }

            const indexPath = path.resolve(baseDir, importPath, 'index' + ext);
            if (await this.fileExists(indexPath)) {
                return indexPath;
            }
        }

        return null;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isFile();
        } catch {
            return false;
        }
    }
} 