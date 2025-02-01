// グローバル変数の前に追加
declare function acquireVsCodeApi(): any;
const vscode = acquireVsCodeApi();

// グローバル変数
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let isForceEnabled = false;
let width: number;
let height: number;
let graphData: GraphData;
let toggleForceButton: HTMLButtonElement;
let svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;

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

interface ExtensionConfig {
    extension: string;
    enabled: boolean;
}

interface GraphConfig {
    targetExtensions: ExtensionConfig[];
}

// グローバル変数に追加
let config: GraphConfig;

// メインの初期化関数
window.addEventListener('load', () => {
    try {
        const graphDataElement = document.getElementById('graphData');
        if (!graphDataElement) {
            throw new Error('Graph data element not found');
        }
        
        const parsedData = JSON.parse(graphDataElement.textContent || '{}');
        graphData = parsedData as GraphData;
        config = parsedData.config as GraphConfig;
        
        if (!graphData || !graphData.nodes || !graphData.links) {
            throw new Error('Invalid graph data format');
        }
        
        console.log('Parsed config:', config);
        
        width = window.innerWidth;
        height = window.innerHeight;
        toggleForceButton = document.getElementById('toggleForce') as HTMLButtonElement;
        if (!toggleForceButton) {
            throw new Error('Toggle force button not found');
        }
        
        // フィルターUIを生成（グラフの初期化前に行う）
        createFilterControls();
        
        console.log('Initializing graph with data:', graphData);
        initializeGraph(graphData);
        
        // イベントリスナーの設定
        window.addEventListener('resize', handleResize);
        toggleForceButton.addEventListener('click', handleToggleForce);
        
    } catch (error) {
        console.error('Failed to initialize graph:', error);
    }
});

// 色生成のためのヘルパー関数を追加
function getDirectoryColor(dirPath: string): string {
    // ディレクトリパスをハッシュ値に変換
    let hash = 0;
    for (let i = 0; i < dirPath.length; i++) {
        hash = dirPath.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // HSLカラーを生成（彩度と明度を固定して、色相のみを変化させる）
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
}

function initializeGraph(data: GraphData): void {
    console.log('InitializeGraph called with data:', data);
    const graphDiv = document.getElementById('graph');
    if (!graphDiv) return;

    // グラフコンテナをクリア
    graphDiv.innerHTML = '';

    // 新しいSVGを作成
    svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g');

    const tooltip = d3.select('.tooltip');

    // ズーム設定
    const zoom = d3.zoom<SVGSVGElement, unknown>();
    d3.select<SVGSVGElement, unknown>('#graph svg')
        .call(zoom
            .scaleExtent([0.1, 4])
            .filter((event: any) => event.shiftKey || event.type === 'wheel')
            .on('zoom', (event) => {
                svg.attr('transform', event.transform.toString());
            })
        );

    // シミュレーションの設定と開始（先に設定）
    simulation = d3.forceSimulation<GraphNode>(data.nodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(data.links)
            .id(d => d.id)
            .distance(d => {
                const source = data.nodes.find(n => n.id === d.source);
                const target = data.nodes.find(n => n.id === d.target);
                if (!source || !target) return 100;

                // 親子関係の判定（ディレクトリパスを比較）
                const isParentChild = source.dirPath === target.dirPath || 
                    source.dirPath.startsWith(target.dirPath + '/') || 
                    target.dirPath.startsWith(source.dirPath + '/');

                return isParentChild ? 50 : 150;
            }))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));

    // リンクとノードの作成
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

    // ノードの形状を設定
    node.each(function(this: SVGGElement, d: GraphNode) {
        const element = d3.select<SVGGElement, GraphNode>(this);
        if (isCssFile(d)) {
            const size = (8 + Math.sqrt(d.connections) * 6) * 0.75;
            element.append('path')
                .attr('d', `M0,${size} L${size},${-size} L${-size},${-size} Z`)
                .attr('class', 'node-shape')
                .style('fill', () => getDirectoryColor(d.dirPath));
        } else if (isJsFile(d)) {
            const size = (8 + Math.sqrt(d.connections) * 6) * 0.75;
            element.append('rect')
                .attr('x', -size)
                .attr('y', -size)
                .attr('width', size * 2)
                .attr('height', size * 2)
                .attr('class', 'node-shape')
                .style('fill', () => getDirectoryColor(d.dirPath));
        } else {
            element.append('circle')
                .attr('r', d => 5 + Math.sqrt(d.connections) * 4)
                .attr('class', 'node-shape')
                .style('fill', () => getDirectoryColor(d.dirPath));
        }
    });

    // ノードのラベルを追加
    node.append('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .text(d => d.name);

    // tickイベントの設定を最後に行う
    simulation.on('tick', () => {
        link
            .attr('x1', d => ((d.source as unknown) as GraphNode).x || 0)
            .attr('y1', d => ((d.source as unknown) as GraphNode).y || 0)
            .attr('x2', d => ((d.target as unknown) as GraphNode).x || 0)
            .attr('y2', d => ((d.target as unknown) as GraphNode).y || 0);

        node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // シミュレーションを開始
    simulation.alpha(1).restart();

    // イベントハンドラーの設定
    node.on('dblclick', (event, d) => {
        vscode.postMessage({
            command: 'openFile',
            filePath: d.fullPath
        });
    });

    node.on('mouseover', (event, d) => {
        tooltip.transition()
            .duration(200)
            .style('opacity', .9);
        tooltip.html(d.dirPath)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', () => {
        tooltip.transition()
            .duration(500)
            .style('opacity', 0);
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

// フィルタリング処理を更新
function handleExtensionToggle(extension: string, checked: boolean) {
    // VSCodeにメッセージを送信
    vscode.postMessage({
        command: 'toggleExtension',
        extension: extension,
        checked: checked
    });

    // 既存のグラフをクリア
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
    const graphDiv = document.getElementById('graph');
    if (graphDiv) {
        graphDiv.innerHTML = '';
    }
}

// メッセージハンドラーを更新
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateDependencyGraph':
            if (message.data && message.data.nodes && message.data.links) {
                // ノードのマップを作成
                const nodeMap = new Map(
                    message.data.nodes.map(node => [node.id, true])
                );

                // 有効なリンクのみをフィルタリング
                const validLinks = message.data.links.filter(link => 
                    nodeMap.has(link.source) && nodeMap.has(link.target)
                );

                graphData = {
                    nodes: message.data.nodes.map((node: any) => ({
                        id: node.id,
                        name: node.name,
                        fullPath: node.fullPath,
                        dirPath: node.dirPath,
                        connections: node.connections || 1
                    })),
                    links: validLinks.map((link: any) => ({
                        source: link.source,
                        target: link.target
                    }))
                };
                config = message.data.config;  // 更新された設定を保存
                
                // グラフを完全に再描画
                const graphDiv = document.getElementById('graph');
                if (graphDiv) {
                    graphDiv.innerHTML = '';
                    initializeGraph(graphData);
                    createFilterControls();  // 更新された状態でUIを再生成
                }
            }
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

// ファイルタイプを判定するヘルパー関数を更新
function isCssFile(node: GraphNode): boolean {
    return node.fullPath.toLowerCase().endsWith('.css');
}

function isJsFile(node: GraphNode): boolean {
    // .jsxと.tsxは除外し、.jsと.tsのみを対象に
    return /\.(js|ts)$/.test(node.fullPath.toLowerCase());
}

function isJsxFile(node: GraphNode): boolean {
    // .jsxと.tsxファイルを判定
    return /\.(jsx|tsx)$/.test(node.fullPath.toLowerCase());
}

function getNodeClass(node: GraphNode): string {
    if (isCssFile(node)) return 'css-file';
    if (isJsFile(node)) return 'js-file';
    if (isJsxFile(node)) return 'jsx-file';
    return 'default-file';
}

// フィルターUIを生成する関数を更新
function createFilterControls() {
    console.log('Creating filter controls with config:', config);
    
    const controls = document.querySelector('.controls');
    if (!controls) {
        console.error('Controls element not found');
        return;
    }

    // 既存のフィルターコンテナを削除
    const existingContainer = document.querySelector('.filter-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // 新しいフィルターコンテナを作成
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-container';

    if (!config || !config.targetExtensions) {
        console.error('No target extensions found in config');
        return;
    }

    // 拡張子ごとのフィルターを作成
    config.targetExtensions.forEach(({ extension, enabled }) => {
        const label = document.createElement('label');
        label.className = 'control-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggle${extension.replace('.', '')}`;
        checkbox.checked = enabled;  // 現在の状態を反映
        
        checkbox.addEventListener('change', () => {
            handleExtensionToggle(extension, checkbox.checked);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(extension));
        filterContainer.appendChild(label);
    });

    controls.appendChild(filterContainer);
} 