"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.DependencyGraphProvider = void 0;
var vscode = require("vscode");
var path = require("path");
var fs = require("fs");
var DependencyGraphProvider = /** @class */ (function () {
    function DependencyGraphProvider() {
        this.dependencies = new Map();
    }
    DependencyGraphProvider.prototype.updateDependencies = function () {
        return __awaiter(this, void 0, void 0, function () {
            var workspaceFolders, _i, workspaceFolders_1, folder;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders)
                            return [2 /*return*/];
                        _i = 0, workspaceFolders_1 = workspaceFolders;
                        _a.label = 1;
                    case 1:
                        if (!(_i < workspaceFolders_1.length)) return [3 /*break*/, 4];
                        folder = workspaceFolders_1[_i];
                        return [4 /*yield*/, this.scanDirectory(folder.uri.fsPath)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    DependencyGraphProvider.prototype.scanDirectory = function (dirPath) {
        return __awaiter(this, void 0, void 0, function () {
            var files, _i, files_1, file, fullPath, stat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.promises.readdir(dirPath)];
                    case 1:
                        files = _a.sent();
                        _i = 0, files_1 = files;
                        _a.label = 2;
                    case 2:
                        if (!(_i < files_1.length)) return [3 /*break*/, 8];
                        file = files_1[_i];
                        fullPath = path.join(dirPath, file);
                        return [4 /*yield*/, fs.promises.stat(fullPath)];
                    case 3:
                        stat = _a.sent();
                        if (!stat.isDirectory()) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.scanDirectory(fullPath)];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5:
                        if (!this.isJavaScriptFile(file)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.analyzeDependencies(fullPath)];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 2];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    DependencyGraphProvider.prototype.isJavaScriptFile = function (fileName) {
        return /\.(js|ts|jsx|tsx)$/.test(fileName);
    };
    DependencyGraphProvider.prototype.analyzeDependencies = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var content, imports;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.promises.readFile(filePath, 'utf-8')];
                    case 1:
                        content = _a.sent();
                        imports = this.extractImports(content);
                        this.dependencies.set(filePath, imports);
                        return [2 /*return*/];
                }
            });
        });
    };
    DependencyGraphProvider.prototype.extractImports = function (content) {
        // 簡単な例として、import文を正規表現で抽出
        var importRegex = /import.*from\s+['"](.+)['"]/g;
        var imports = [];
        var match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    };
    DependencyGraphProvider.prototype.getDependencies = function () {
        return this.dependencies;
    };
    return DependencyGraphProvider;
}());
exports.DependencyGraphProvider = DependencyGraphProvider;
