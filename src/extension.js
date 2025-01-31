"use strict";
exports.__esModule = true;
exports.deactivate = exports.activate = void 0;
var vscode = require("vscode");
var dependencyGraphProvider_1 = require("./dependencyGraphProvider");
var dependencyGraphView_1 = require("./dependencyGraphView");
function activate(context) {
    var provider = new dependencyGraphProvider_1.DependencyGraphProvider();
    var view = new dependencyGraphView_1.DependencyGraphView(context.extensionUri);
    context.subscriptions.push(vscode.commands.registerCommand('dependency-visualizer.showGraph', function () {
        view.show();
        provider.updateDependencies();
    }));
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
