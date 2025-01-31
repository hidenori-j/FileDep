// グローバル変数
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let isForceEnabled = false;
let width: number;
let height: number;
let graphData: GraphData;
let toggleForceButton: HTMLButtonElement;

interface GraphNode {
    id: string | number;
    name: string;
    fullPath: string;
    dirPath: string;
    connections: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

interface GraphLink {
    source: string | number;
    target: string | number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

declare const vscode: {
    postMessage: (message: any) => void;
};

// メインの初期化関数
window.addEventListener('load', () => {
    try {
        const graphDataElement = document.getElementById('graphData');
        if (!graphDataElement) {
            throw new Error('Graph data element not found');
        }
        
        graphData = JSON.parse(graphDataElement.textContent || '{}') as GraphData;
        if (!graphData || !graphData.nodes || !graphData.links) {
            throw new Error('Invalid graph data format');
        }
        
        width = window.innerWidth;
        height = window.innerHeight;
        toggleForceButton = document.getElementById('toggleForce') as HTMLButtonElement;
        if (!toggleForceButton) {
            throw new Error('Toggle force button not found');
        }
        
        console.log('Initializing graph with data:', graphData); // デバッグ用
        initializeGraph(graphData);
        
        // イベントリスナーの設定
        window.addEventListener('resize', handleResize);
        toggleForceButton.addEventListener('click', handleToggleForce);
    } catch (error) {
        console.error('Failed to initialize graph:', error);
    }
});

function initializeGraph(data: GraphData): void {
    console.log('InitializeGraph called with data:', data); // デバッグ用
    const graphDiv = document.getElementById('graph');
    if (!graphDiv) return;
    
    const tooltip = d3.select('.tooltip');
    
    graphDiv.innerHTML = '';
    const svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>();
    d3.select<SVGSVGElement, unknown>('#graph svg')
        .call(zoom
            .scaleExtent([0.1, 4])
            .filter((event: any) => event.shiftKey || event.type === 'wheel')
            .on('zoom', (event) => {
                svg.attr('transform', event.transform.toString());
            })
        );

    simulation = d3.forceSimulation<GraphNode>(data.nodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(data.links)
            .id(d => d.id)
            .distance(150)
            .strength(1))
        .force('charge', d3.forceManyBody()
            .strength(-1000)
            .distanceMax(500))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(80));

    const link = svg.append('g')
        .selectAll('line')
        .data(data.links)
        .enter()
        .append('line')
        .attr('class', 'link');

    const node = svg.append('g')
        .selectAll('g')
        .data(data.nodes)
        .enter()
        .append('g')
        .attr('class', d => `node ${getNodeClass(d)}`)
        .call(d3.drag<SVGGElement, GraphNode>()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    node.each(function(this: SVGGElement, d: GraphNode) {
        const element = d3.select<SVGGElement, GraphNode>(this);
        if (isCssFile(d)) {
            const size = 10 + Math.min(10, d.connections * 2);
            element.append('path')
                .attr('d', `M0,${size} L${size},${-size} L${-size},${-size} Z`)
                .attr('class', 'node-shape');
        } else {
            element.append('circle')
                .attr('r', d => 5 + Math.min(10, d.connections * 2))
                .attr('class', 'node-shape');
        }
    });

    node.append('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .text(d => d.name);

    simulation.on('tick', () => {
        link
            .attr('x1', d => ((d.source as unknown) as GraphNode).x || 0)
            .attr('y1', d => ((d.source as unknown) as GraphNode).y || 0)
            .attr('x2', d => ((d.target as unknown) as GraphNode).x || 0)
            .attr('y2', d => ((d.target as unknown) as GraphNode).y || 0);

        node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // ノードのダブルクリックイベントを追加
    node.on('dblclick', (event, d) => {
        vscode.postMessage({
            command: 'openFile',
            filePath: d.fullPath
        });
    });
}

// イベントハンドラーの型定義
function handleResize(): void {
    width = window.innerWidth;
    height = window.innerHeight;
    
    d3.select('#graph svg')
        .attr('width', width)
        .attr('height', height);
    
    if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
    }
}

function handleToggleForce(): void {
    if (!simulation) return;
    
    isForceEnabled = !isForceEnabled;
    if (isForceEnabled) {
        simulation
            .force('link', d3.forceLink(graphData.links)
                .id((d: any) => d.id)
                .distance(150)
                .strength(1))
            .force('charge', d3.forceManyBody()
                .strength(-1000)
                .distanceMax(500))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(80))
            .alpha(0.3)
            .restart();
        toggleForceButton.style.background = 'var(--vscode-button-secondaryBackground)';
    } else {
        simulation.force('link', null)
            .force('charge', null)
            .force('center', null)
            .force('collision', null)
            .stop();
        toggleForceButton.style.background = 'var(--vscode-button-background)';
    }
}

function cleanup(): void {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
    
    window.removeEventListener('resize', handleResize);
    toggleForceButton?.removeEventListener('click', handleToggleForce);
}

window.addEventListener('unload', cleanup);

// グラフの初期設定
const container = document.getElementById('network') as HTMLElement;
const options = {
    nodes: {
        shape: 'box',
        margin: 10,
        font: {
            size: 14
        }
    },
    edges: {
        arrows: 'to',
        smooth: {
            type: 'cubicBezier'
        }
    },
    physics: {
        enabled: true,
        solver: 'forceAtlas2Based'
    }
};

let network: vis.Network;

// ダブルクリックイベントの型定義を追加
interface NetworkClickEvent {
    nodes: string[];
    edges: string[];
    event: Event;
}

// メッセージハンドラーの設定
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateDependencyGraph':
            const graphData = {
                nodes: message.data.nodes.map((node: any) => ({
                    id: node.id,
                    name: node.label,
                    connections: 1
                })),
                links: message.data.edges.map((edge: any) => ({
                    source: edge.from,
                    target: edge.to
                }))
            };
            initializeGraph(graphData);
            break;
    }
});

function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    if (!event.active && simulation) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// ファイルタイプを判定するヘルパー関数を追加
function isCssFile(node: GraphNode): boolean {
    return node.fullPath.toLowerCase().endsWith('.css');
}

function getNodeClass(node: GraphNode): string {
    return isCssFile(node) ? 'css-file' : 'default-file';
} 