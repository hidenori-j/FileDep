// グローバル変数
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let isForceEnabled = false;
let width: number;
let height: number;
let graphData: GraphData;
let toggleForceButton: HTMLButtonElement;

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
        
        initializeGraph(graphData);
        
        // イベントリスナーの設定をここに移動
        window.addEventListener('resize', handleResize);
        toggleForceButton.addEventListener('click', handleToggleForce);
    } catch (error) {
        console.error('Failed to initialize graph:', error);
    }
});

function initializeGraph(data: GraphData): void {
    const graphDiv = document.getElementById('graph');
    if (!graphDiv) return;
    
    const tooltip = d3.select('.tooltip');
    
    graphDiv.innerHTML = '';
    const svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g');

    // ... 残りのコードは同じですが、以下のような型付けを追加 ...
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .filter((event: any) => {
            return event.shiftKey || event.type === 'wheel';
        })
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
            svg.attr('transform', event.transform.toString());
        });

    // ノードとリンクの型付け
    const link = svg.append('g')
        .selectAll<SVGLineElement, GraphLink>('line')
        .data(data.links)
        .enter()
        .append('line')
        .attr('class', 'link');

    const node = svg.append('g')
        .selectAll<SVGGElement, GraphNode>('g')
        .data(data.nodes)
        .enter()
        .append('g')
        .attr('class', (d: GraphNode) => 'node' + (d.name.endsWith('.css') ? ' css-file' : ''));

    // ... 残りのコードも同様に型付けを追加 ...
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