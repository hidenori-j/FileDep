"use strict";
exports.__esModule = true;
exports.DependencyGraphView = void 0;
var vscode = require("vscode");
var DependencyGraphView = /** @class */ (function () {
    function DependencyGraphView(extensionUri) {
        this.extensionUri = extensionUri;
    }
    DependencyGraphView.prototype.show = function () {
        var _this = this;
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('dependencyGraph', '依存関係グラフ', vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        });
        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(function () {
            _this.panel = undefined;
        });
    };
    DependencyGraphView.prototype.getWebviewContent = function () {
        return "\n            <!DOCTYPE html>\n            <html>\n            <head>\n                <title>\u4F9D\u5B58\u95A2\u4FC2\u30B0\u30E9\u30D5</title>\n                <script src=\"https://d3js.org/d3.v7.min.js\"></script>\n                <style>\n                    #graph { width: 100%; height: 100vh; }\n                </style>\n            </head>\n            <body>\n                <div id=\"graph\"></div>\n                <script>\n                    // \u3053\u3053\u306BD3.js\u3092\u4F7F\u7528\u3057\u305F\u30B0\u30E9\u30D5\u63CF\u753B\u306E\u30B3\u30FC\u30C9\u3092\u8FFD\u52A0\n                </script>\n            </body>\n            </html>\n        ";
    };
    return DependencyGraphView;
}());
exports.DependencyGraphView = DependencyGraphView;
