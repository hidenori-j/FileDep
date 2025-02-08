// VSCode APIの型定義
declare function acquireVsCodeApi(): any;
const vscode = acquireVsCodeApi();

// D3.jsの型定義
interface D3EventBase<GElement extends d3.BaseType, Datum> {
    type: string;
    target: EventTarget;
    currentTarget: EventTarget;
    pageX: number;
    pageY: number;
    preventDefault(): void;
    stopPropagation(): void;
}

// グラフノードの型定義
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

// グラフリンクの型定義
interface GraphLink {
    source: string | number;
    target: string | number;
}

// グラフデータの型定義
interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

// 拡張子設定の型定義
interface ExtensionConfig {
    extension: string;
    enabled: boolean;
}

// グラフ設定の型定義
interface GraphConfig {
    targetExtensions: ExtensionConfig[];
    directories: { path: string; enabled: boolean }[];
}

// グローバル変数
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let isForceEnabled = false;
let width: number;
let height: number;
let graphData: GraphData;
let config: GraphConfig;
let initialExtensions: ExtensionConfig[] = [];  // 初期の拡張子リストを保持
let toggleForceButton: HTMLButtonElement;
let svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;

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

        // 実際のノードから拡張子を収集
        const existingExtensions = new Set<string>();
        graphData.nodes.forEach(node => {
            const ext = node.fullPath.match(/\.[^.]+$/)?.[0];
            if (ext) {
                existingExtensions.add(ext.toLowerCase());
            }
        });

        // 設定された拡張子のうち、実際に存在するもののみを保持
        initialExtensions = config.targetExtensions.filter(
            ({ extension }) => existingExtensions.has(extension.toLowerCase())
        );
        
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

// 色生成のためのヘルパー関数を更新
const directoryColors = new Map<string, string>();

function getDirectoryColor(dirPath: string): string {
    // ルートディレクトリの場合
    if (!dirPath || dirPath === '.') {
        return 'hsl(0, 70%, 50%)';
    }

    // キャッシュされた色があれば使用
    if (directoryColors.has(dirPath)) {
        return directoryColors.get(dirPath)!;
    }

    // configのディレクトリリストを取得
    const configDirs = config?.directories?.map(d => d.path) || [];
    
    // 最も近い親ディレクトリの色を見つける
    let currentPath = dirPath;
    while (currentPath) {
        // 現在のパスがconfigDirsに含まれているか確認
        if (configDirs.includes(currentPath)) {
            if (!directoryColors.has(currentPath)) {
                // 新しい色を生成
                const hue = Math.abs(hashString(currentPath)) % 360;
                const newColor = `hsl(${hue}, 70%, 50%)`;
                directoryColors.set(currentPath, newColor);
            }
            return directoryColors.get(currentPath)!;
        }
        
        // 親ディレクトリに移動
        const parentPath = currentPath.split(/[\/\\]/).slice(0, -1).join('/');
        if (parentPath === currentPath) break;
        currentPath = parentPath;
    }

    // フィルターに含まれるディレクトリが見つからない場合はデフォルトの色を返す
    return 'hsl(0, 0%, 70%)';  // グレー
}

// 文字列からハッシュ値を生成する関数
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

function initializeGraph(data: GraphData): void {
    try {
        console.log('InitializeGraph called with data:', data);
        const graphDiv = document.getElementById('graph');
        if (!graphDiv) {
            console.error('グラフコンテナが見つかりません');
            return;
        }

        // グラフコンテナをクリア
        graphDiv.innerHTML = '';

        // 新しいSVGを作成
        const svgContainer = d3.select('#graph')
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        svg = svgContainer.append('g');

        const tooltip = d3.select('.tooltip');

        // ズーム設定
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .filter((event: any) => event.shiftKey || event.type === 'wheel')
            .on('zoom', (event) => {
                svg.attr('transform', event.transform.toString());
            });

        svgContainer.call(zoom);

        // シミュレーションの設定
        simulation = d3.forceSimulation<GraphNode>(data.nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(data.links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(30));

        // リンクの作成
        const linkGroup = svg.append('g').attr('class', 'links');
        const link = linkGroup
            .selectAll('line')
            .data(data.links)
            .join('line')
            .attr('class', 'link');

        // ノードの作成
        const nodeGroup = svg.append('g').attr('class', 'nodes');
        const node = nodeGroup
            .selectAll('g')
            .data(data.nodes)
            .join('g')
            .attr('class', d => `node ${getNodeClass(d)}`);

        // ドラッグ動作の設定
        const drag = d3.drag<SVGGElement, GraphNode>()
            .on('start', (event, d) => {
                if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active && simulation) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        node.call(drag as any);  // 一時的な型キャストを使用

        // クリックイベントの設定
        node.on('click', function(event: Event) {
            try {
                // イベントとthisの型安全性を確保
                if (!(event instanceof MouseEvent)) {
                    console.error('無効なイベントタイプです');
                    return;
                }

                if (!(this instanceof SVGGElement)) {
                    console.error('無効なターゲット要素です');
                    return;
                }

                // イベントの伝播を停止
                event.preventDefault();
                event.stopPropagation();

                // データの取得と検証
                const element = d3.select(this);
                const data = element.datum() as GraphNode;

                if (!data) {
                    console.error('ノードデータが見つかりません');
                    return;
                }

                if (!data.fullPath) {
                    console.error('ファイルパスが見つかりません:', data);
                    return;
                }

                // 選択状態を更新
                try {
                    const allNodes = d3.selectAll('.node');
                    if (allNodes.empty()) {
                        console.error('ノード要素が見つかりません');
                        return;
                    }

                    allNodes.classed('selected', false);
                    element.classed('selected', true);
                } catch (selectError) {
                    console.error('選択状態の更新に失敗:', selectError);
                }

                // VSCodeにメッセージを送信
                try {
                    if (typeof vscode === 'undefined') {
                        throw new Error('VSCode APIが利用できません');
                    }

                    vscode.postMessage({
                        command: 'selectFile',
                        filePath: data.fullPath
                    });
                } catch (messageError) {
                    console.error('メッセージの送信に失敗:', messageError);
                    // エラーメッセージをVSCodeに送信
                    try {
                        vscode.postMessage({
                            command: 'error',
                            message: `ファイルの選択中にエラーが発生しました: ${messageError}`
                        });
                    } catch (notifyError) {
                        console.error('エラー通知の送信に失敗:', notifyError);
                    }
                }
            } catch (error) {
                console.error('クリックイベントの処理に失敗:', error);
                try {
                    vscode.postMessage({
                        command: 'error',
                        message: `予期せぬエラーが発生しました: ${error}`
                    });
                } catch (notifyError) {
                    console.error('エラー通知の送信に失敗:', notifyError);
                }
            }
        });

        // ノードの形状を設定
        node.each(function(d) {
            const element = d3.select(this);
            try {
                const size = (8 + Math.sqrt(d.connections || 1) * 6) * 0.75;
                const shapeType = (window as any).shapes.getShapeType(d.fullPath);
                (window as any).shapes.shapeDefinitions[shapeType].createNodeShape(element, size);
                element.select('.node-shape').style('fill', () => getDirectoryColor(d.dirPath || ''));
            } catch (error) {
                console.error('ノード形状の作成エラー:', error);
            }
        });

        // ノードのラベルを追加
        node.append('text')
            .attr('dx', 12)
            .attr('dy', '.35em')
            .text(d => d.name || '');

        // ツールチップの設定
        node.on('mouseover', function(event: MouseEvent, d: GraphNode) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(d.dirPath || '')
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', () => {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });

        // tickイベントの設定
        simulation.on('tick', () => {
            try {
                link
                    .attr('x1', d => ((d.source as any).x || 0))
                    .attr('y1', d => ((d.source as any).y || 0))
                    .attr('x2', d => ((d.target as any).x || 0))
                    .attr('y2', d => ((d.target as any).y || 0));

                node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
            } catch (error) {
                console.error('Tickイベントエラー:', error);
            }
        });

        // シミュレーションを開始
        simulation.alpha(1).restart();

    } catch (error) {
        console.error('グラフの初期化エラー:', error);
        vscode.postMessage({
            command: 'error',
            message: `グラフの初期化中にエラーが発生しました: ${error}`
        });
    }
}

// イベントハンドラーの型定義を更新
// 重複した定義を削除
// interface NodeClickEvent extends d3.D3Event<SVGGElement, GraphNode> {
//     currentTarget: SVGGElement;
// }

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
                    message.data.nodes.map((node: GraphNode) => [node.id, true])
                );

                // 有効なリンクのみをフィルタリング
                const validLinks = message.data.links.filter((link: { source: string; target: string }) => 
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

                // 新しい設定を適用
                config = message.data.config;
                
                // 初期の拡張子リストの状態を更新（enabled状態のみ）
                initialExtensions = initialExtensions.map(ext => ({
                    ...ext,
                    enabled: message.data.config.targetExtensions.find(
                        (newExt: ExtensionConfig) => newExt.extension === ext.extension
                    )?.enabled ?? false
                }));
                
                // グラフを完全に再描画
                const graphDiv = document.getElementById('graph');
                if (graphDiv) {
                    graphDiv.innerHTML = '';
                    initializeGraph(graphData);
                    createFilterControls();  // 更新された状態でUIを再生成
                }
            }
            break;
        case 'error':
            // エラーメッセージを表示
            const tooltip = d3.select('.tooltip');
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(message.message)
                .style('left', '50%')
                .style('top', '20px')
                .style('transform', 'translateX(-50%)')
                .style('background', 'var(--vscode-errorForeground)')
                .style('color', 'var(--vscode-editor-background)');
            
            setTimeout(() => {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
            }, 3000);
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

// 拡張子の形状クラスを取得する関数を追加
function getExtensionShapeClass(extension: string): string {
    if (extension.match(/\.(js|ts)$/)) return 'js';
    if (extension.match(/\.(jsx|tsx)$/)) return 'jsx';
    if (extension.match(/\.css$/)) return 'css';
    return 'default';
}

// フィルターUIを生成する関数を更新
function createFilterControls() {
    console.log('Creating filter controls with config:', config);
    
    // 形状スタイルを更新
    (window as any).shapes.updateFilterShapeStyles();
    
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

    // 拡張子フィルター
    if (initialExtensions.length > 0) {
        const extensionsContainer = document.createElement('div');
        extensionsContainer.className = 'filter-section';
        extensionsContainer.innerHTML = '<h3>拡張子フィルター</h3>';

        // 初期の拡張子リストを使用し、現在の有効/無効状態を適用
        initialExtensions.forEach(({ extension }) => {
            const currentState = config.targetExtensions.find(e => e.extension === extension);
            const enabled = currentState ? currentState.enabled : false;

            const label = document.createElement('label');
            label.className = 'control-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `toggle${extension.replace('.', '')}`;
            checkbox.checked = enabled;
            
            checkbox.addEventListener('change', () => {
                handleExtensionToggle(extension, checkbox.checked);
            });

            // 形状サンプルを追加
            const shapeIndicator = document.createElement('span');
            shapeIndicator.className = `extension-shape ${(window as any).shapes.getShapeType(extension)}`;

            label.appendChild(checkbox);
            label.appendChild(shapeIndicator);
            label.appendChild(document.createTextNode(extension));
            extensionsContainer.appendChild(label);
        });

        filterContainer.appendChild(extensionsContainer);
    }

    // ディレクトリフィルター
    if (config && config.directories) {
        const directoriesContainer = document.createElement('div');
        directoriesContainer.className = 'filter-section';
        directoriesContainer.innerHTML = '<h3>ディレクトリフィルター</h3>';

        config.directories.forEach(({ path, enabled }) => {
            const label = document.createElement('label');
            label.className = 'control-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `toggleDir${path.replace(/[\/\\]/g, '_')}`;
            checkbox.checked = enabled;
            
            checkbox.addEventListener('change', () => {
                handleDirectoryToggle(path, checkbox.checked);
            });

            // カラーパレットを追加
            const colorPalette = document.createElement('span');
            colorPalette.className = 'color-palette';
            colorPalette.style.backgroundColor = getDirectoryColor(path);

            label.appendChild(checkbox);
            label.appendChild(colorPalette);
            label.appendChild(document.createTextNode(path || '(root)'));
            directoriesContainer.appendChild(label);
        });

        filterContainer.appendChild(directoriesContainer);
    }

    controls.appendChild(filterContainer);
}

function handleDirectoryToggle(directory: string, checked: boolean) {
    vscode.postMessage({
        command: 'toggleDirectory',
        directory: directory,
        checked: checked
    });
} 