// グローバル変数
let simulation;
let isForceEnabled = false;
let width;
let height;
let graphData;
let toggleForceButton;

// メインの初期化関数
window.addEventListener('load', () => {
    try {
        const graphDataElement = document.getElementById('graphData');
        if (!graphDataElement) {
            throw new Error('Graph data element not found');
        }
        
        graphData = JSON.parse(graphDataElement.textContent);
        if (!graphData || !graphData.nodes || !graphData.links) {
            throw new Error('Invalid graph data format');
        }
        
        width = window.innerWidth;
        height = window.innerHeight;
        toggleForceButton = document.getElementById('toggleForce');
        
        initializeGraph(graphData);
    } catch (error) {
        console.error('Failed to initialize graph:', error);
        // エラーメッセージを画面に表示するなどの対応
    }
});

function initializeGraph(graphData) {
    const graphDiv = document.getElementById('graph');
    const tooltip = d3.select('.tooltip');
    
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
        .force('link', d3.forceLink(graphData.links)
            .id(d => d.id)
            .distance(150)
            .strength(1))
        .force('charge', d3.forceManyBody()
            .strength(-1000)
            .distanceMax(500))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(80))
        .alpha(1)
        .alphaDecay(0.01)
        .alphaMin(0.001);

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
        .attr('class', d => 'node' + (d.name.endsWith('.css') ? ' css-file' : ''))
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended))
        .on('mouseover', (event, d) => {
            tooltip
                .style('opacity', 1)
                .html(d.dirPath)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', () => {
            tooltip.style('opacity', 0);
        })
        .on('mousemove', (event) => {
            tooltip
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        });

    node.each(function(d) {
        const el = d3.select(this);
        const size = 5 + Math.min(10, d.connections * 2);
        
        if (d.name.endsWith('.css')) {
            el.append('path')
                .attr('d', d3.symbol()
                    .type(d3.symbolTriangle)
                    .size(Math.PI * size * size))
                .attr('transform', 'translate(0,' + size/2 + ')');
        } else {
            el.append('circle')
                .attr('r', size);
        }
    });

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
        
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    simulation.on("end", () => {
        simulation.force('link', null);
        simulation.force('charge', null);
        simulation.force('center', null);
        simulation.force('collision', null);
        simulation.stop();
    });
}

function dragstarted(event, d) {
    if (!event.active) {
        simulation.alphaTarget(0.3)
            .force('collision', d3.forceCollide().radius(50))
            .restart();
    }
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) {
        simulation.alphaTarget(0);
        if (!isForceEnabled) {
            simulation.force('link', null)
                .force('charge', null)
                .force('center', null)
                .force('collision', null)
                .stop();
        }
    }
    d.x = d.fx;
    d.y = d.fy;
    d.fx = null;
    d.fy = null;
}

// フォースレイアウトの切り替えボタンの設定
document.getElementById('toggleForce').addEventListener('click', () => {
    isForceEnabled = !isForceEnabled;
    if (isForceEnabled) {
        simulation
            .force('link', d3.forceLink(graphData.links)
                .id(d => d.id)
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
});

// リサイズイベントの追加
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    
    // SVGのサイズを更新
    d3.select('#graph svg')
        .attr('width', width)
        .attr('height', height);
    
    // フォースレイアウトの中心を更新
    if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
    }
});

// クリーンアップ関数の追加
function cleanup() {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
    
    // イベントリスナーの削除
    window.removeEventListener('resize', handleResize);
    toggleForceButton.removeEventListener('click', handleToggleForce);
}

// ページアンロード時のクリーンアップ
window.addEventListener('unload', cleanup); 