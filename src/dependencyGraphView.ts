import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraphProvider } from './dependencyGraphProvider';

export class DependencyGraphView {
    private panel: vscode.WebviewPanel | undefined;
    private readonly extensionUri: vscode.Uri;
    private provider: DependencyGraphProvider;

    constructor(extensionUri: vscode.Uri, provider: DependencyGraphProvider) {
        this.extensionUri = extensionUri;
        this.provider = provider;
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'dependencyGraph',
            '依存関係グラフ',
            {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: true
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    this.extensionUri,
                    vscode.Uri.parse('https://d3js.org/')
                ]
            }
        );

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

    private convertToGraphData(dependencies: Map<string, string[]>) {
        console.log('Converting dependencies to graph data:', dependencies);
        const nodes: any[] = [];
        const links: any[] = [];
        const nodeMap = new Map<string, number>();

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
                } catch (error) {
                    console.error('Error resolving import path:', error);
                }
            });
        });

        console.log('Created links:', links);
        return { nodes, links };
    }

    private getWebviewContent(graphData: any) {
        const graphDataStr = JSON.stringify(graphData);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>依存関係グラフ</title>
                <script src="https://d3js.org/d3.v7.min.js"></script>
                <style>
                    body { 
                        margin: 0;
                        padding: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    #graph { 
                        width: 100%; 
                        height: 100vh;
                        overflow: hidden;
                    }
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
                    svg {
                        background-color: transparent;
                    }
                </style>
            </head>
            <body>
                <div id="graph"></div>
                <script>
                    const graphData = ${graphDataStr};
                    let simulation;
                    
                    window.addEventListener('load', () => {
                        const width = window.innerWidth;
                        const height = window.innerHeight;
                        const graphDiv = document.getElementById('graph');
                        
                        graphDiv.innerHTML = '';
                        const svg = d3.select('#graph')
                            .append('svg')
                            .attr('width', width)
                            .attr('height', height)
                            .append('g');

                        const zoom = d3.zoom()
                            .scaleExtent([0.1, 4])
                            .filter(event => {
                                // シフトキーが押されているときのみパン操作を許可
                                // ホイールによるズームは常に許可
                                return event.shiftKey || event.type === 'wheel';
                            })
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

    private async updateGraph() {
        if (this.panel) {
            await this.provider.updateDependencies();
            const dependencies = this.provider.getDependencies();
            const graphData = this.convertToGraphData(dependencies);
            this.panel.webview.postMessage({ command: 'updateGraph', data: graphData });
        }
    }
} 