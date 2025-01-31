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
exports.DependencyGraphView = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class DependencyGraphView {
    constructor(extensionUri, provider) {
        this.extensionUri = extensionUri;
        this.provider = provider;
    }
    async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('dependencyGraph', '依存関係グラフ', {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: true
        }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                this.extensionUri,
                vscode.Uri.parse('https://d3js.org/')
            ]
        });
        await this.provider.updateDependencies();
        const dependencies = this.provider.getDependencies();
        const graphData = this.convertToGraphData(dependencies);
        this.panel.webview.html = this.getWebviewContent(graphData);
        this.panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'requestData') {
                this.updateGraph();
            }
        });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }
    convertToGraphData(dependencies) {
        console.log('Converting dependencies to graph data:', dependencies);
        const nodes = [];
        const links = [];
        const nodeMap = new Map();
        let index = 0;
        dependencies.forEach((_, filePath) => {
            const shortPath = path.basename(filePath);
            if (!nodeMap.has(filePath)) {
                nodeMap.set(filePath, index);
                nodes.push({ id: index, name: shortPath, fullPath: filePath });
                index++;
            }
        });
        console.log('Created nodes:', nodes);
        dependencies.forEach((imports, filePath) => {
            const sourceIndex = nodeMap.get(filePath);
            imports.forEach(importPath => {
                try {
                    const fullImportPath = path.resolve(path.dirname(filePath), importPath);
                    console.log('Resolving import path:', importPath, 'to:', fullImportPath);
                    if (nodeMap.has(fullImportPath)) {
                        const targetIndex = nodeMap.get(fullImportPath);
                        links.push({
                            source: sourceIndex,
                            target: targetIndex
                        });
                    }
                }
                catch (error) {
                    console.error('Error resolving import path:', error);
                }
            });
        });
        console.log('Created links:', links);
        return { nodes, links };
    }
    getWebviewContent(graphData) {
        const graphDataStr = JSON.stringify(graphData);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>依存関係グラフ</title>
                <script src="https://d3js.org/d3.v7.min.js"></script>
                <script src="https://unpkg.com/three@0.137.0/build/three.min.js"></script>
                <script src="https://unpkg.com/3d-force-graph"></script>
                <style>
                    body { 
                        margin: 0;
                        padding: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    #controls {
                        position: fixed;
                        top: 10px;
                        left: 10px;
                        z-index: 100;
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        border: 1px solid var(--vscode-editor-foreground);
                        border-radius: 4px;
                    }
                    #graph { 
                        width: 100%; 
                        height: 100vh;
                        overflow: hidden;
                    }
                    /* 2D表示用のスタイル */
                    .node circle {
                        fill: #4CAF50;
                        stroke: #fff;
                        stroke-width: 2px;
                    }
                    .node text {
                        font-size: 12px;
                        fill: var(--vscode-editor-foreground);
                        font-family: var(--vscode-font-family);
                    }
                    .link {
                        stroke: var(--vscode-editor-foreground);
                        stroke-opacity: 0.3;
                        stroke-width: 1px;
                    }
                    .toggle-button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-family: var(--vscode-font-family);
                    }
                    .toggle-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    /* SVG背景色を透明に */
                    svg {
                        background-color: transparent;
                    }
                </style>
            </head>
            <body>
                <div id="controls">
                    <button id="toggleView" class="toggle-button">3D表示に切り替え</button>
                </div>
                <div id="graph"></div>
                <script>
                    const graphData = ${graphDataStr};
                    let simulation;
                    let graph3D;
                    let is3D = false;
                    
                    window.addEventListener('load', () => {
                        const width = window.innerWidth;
                        const height = window.innerHeight;
                        const graphDiv = document.getElementById('graph');
                        
                        function init2D() {
                            graphDiv.innerHTML = '';
                            const svg = d3.select('#graph')
                                .append('svg')
                                .attr('width', width)
                                .attr('height', height)
                                .append('g');

                            const zoom = d3.zoom()
                                .scaleExtent([0.1, 4])
                                .on('zoom', (event) => {
                                    svg.attr('transform', event.transform);
                                });

                            d3.select('#graph svg').call(zoom);

                            simulation = d3.forceSimulation(graphData.nodes)
                                .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(100))
                                .force('charge', d3.forceManyBody().strength(-300))
                                .force('center', d3.forceCenter(width / 2, height / 2))
                                .force('collision', d3.forceCollide().radius(50));

                            const link = svg.append('g')
                                .selectAll('line')
                                .data(graphData.links)
                                .enter()
                                .append('line')
                                .attr('class', 'link');

                            const node = svg.append('g')
                                .selectAll('g')
                                .data(graphData.nodes)
                                .enter()
                                .append('g')
                                .attr('class', 'node')
                                .call(d3.drag()
                                    .on('start', dragstarted)
                                    .on('drag', dragged)
                                    .on('end', dragended));

                            node.append('circle')
                                .attr('r', 8);

                            node.append('text')
                                .attr('dx', 12)
                                .attr('dy', '.35em')
                                .text(d => d.name)
                                .style('font-size', '12px');

                            simulation.on('tick', () => {
                                link
                                    .attr('x1', d => d.source.x)
                                    .attr('y1', d => d.source.y)
                                    .attr('x2', d => d.target.x)
                                    .attr('y2', d => d.target.y);
                                
                                node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
                            });
                        }

                        function init3D() {
                            graphDiv.innerHTML = '';
                            graph3D = ForceGraph3D()(graphDiv)
                                .graphData(graphData)
                                .nodeLabel('name')
                                .nodeColor(() => '#4CAF50')
                                .linkColor(() => '#999')
                                .backgroundColor(getComputedStyle(document.body).backgroundColor)
                                .width(width)
                                .height(height);
                        }

                        // 初期表示（2D）
                        init2D();

                        // 切り替えボタンのイベントリスナー
                        document.getElementById('toggleView').addEventListener('click', () => {
                            is3D = !is3D;
                            document.getElementById('toggleView').textContent = 
                                is3D ? '2D表示に切り替え' : '3D表示に切り替え';
                            
                            if (is3D) {
                                if (simulation) simulation.stop();
                                init3D();
                            } else {
                                if (graph3D) graph3D._destructor();
                                init2D();
                            }
                        });

                        function dragstarted(event, d) {
                            if (!event.active) simulation.alphaTarget(0.3).restart();
                            d.fx = d.x;
                            d.fy = d.y;
                        }
                        
                        function dragged(event, d) {
                            d.fx = event.x;
                            d.fy = event.y;
                        }
                        
                        function dragended(event, d) {
                            if (!event.active) simulation.alphaTarget(0);
                            d.fx = null;
                            d.fy = null;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
    async updateGraph() {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = this.provider.getDependencies();
            const graphData = this.convertToGraphData(dependencies);
            this.panel.webview.postMessage({ command: 'updateGraph', data: graphData });
        }
    }
}
exports.DependencyGraphView = DependencyGraphView;
//# sourceMappingURL=dependencyGraphView.js.map