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
    description?: string;
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
let toggleFiltersButton: HTMLButtonElement;
let svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
let isFiltersVisible = true;

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
    
    // パスの各部分を分解
    const parts = dirPath.split(/[\/\\]/);
    let currentPath = '';
    let parentColor = '';

    // 親ディレクトリを順に検索
    for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        
        // 現在のパスの色が既にある場合はそれを使用
        if (directoryColors.has(currentPath)) {
            parentColor = directoryColors.get(currentPath)!;
            continue;
        }

        // configDirsに含まれているか確認
        if (configDirs.includes(currentPath)) {
            // 親の色があればそれを使用、なければ新しい色を生成
            const color = parentColor || `hsl(${Math.abs(hashString(currentPath)) % 360}, 70%, 50%)`;
            directoryColors.set(currentPath, color);
            parentColor = color;
        }
    }

    // 最終的な色を設定（親の色があればそれを使用、なければグレー）
    const finalColor = parentColor || 'hsl(0, 0%, 70%)';
    directoryColors.set(dirPath, finalColor);
    return finalColor;
}

// 初期化時にディレクトリの色を生成
function initializeDirectoryColors() {
    if (config && config.directories) {
        // 全てのユニークなディレクトリパスを収集（親ディレクトリも含む）
        const allPaths = new Set<string>();
        config.directories.forEach(dir => {
            const parts = dir.path.split(/[\/\\]/);
            let currentPath = '';
            parts.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                allPaths.add(currentPath);
            });
        });

        // パスを配列に変換してソート（階層の浅い順）
        const sortedPaths = Array.from(allPaths).sort((a, b) => {
            const depthA = a.split(/[\/\\]/).length;
            const depthB = b.split(/[\/\\]/).length;
            if (depthA !== depthB) {
                return depthA - depthB;
            }
            return a.localeCompare(b);
        });

        // 色相の間隔を計算（360度を全パス数で割る）
        const hueStep = 360 / sortedPaths.length;

        // 各パスに色を割り当て
        sortedPaths.forEach((path, index) => {
            const hue = (index * hueStep) % 360;
            const color = `hsl(${hue}, 70%, 50%)`;
            directoryColors.set(path, color);
        });
    }
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
                
                // ディレクトリの色を取得
                const dirPath = d.dirPath || '';
                let dirColor = 'hsl(0, 0%, 70%)';  // デフォルトはグレー

                // dirPathの各階層をチェックして、最も具体的な色を見つける
                const parts = dirPath.split(/[\/\\]/);
                let currentPath = '';
                for (let i = 0; i < parts.length; i++) {
                    currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                    if (directoryColors.has(currentPath)) {
                        dirColor = directoryColors.get(currentPath)!;
                    }
                }

                element.select('.node-shape')
                    .style('fill', dirColor)
                    .style('stroke', '#fff')
                    .style('stroke-width', '2px');
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
            
            // ツールチップの内容を更新
            const tooltipContent = `
                <div class="tooltip-content">
                    <div class="tooltip-path">${d.dirPath || ''}</div>
                    ${d.description ? `<div class="tooltip-description">${d.description}</div>` : ''}
                </div>
            `;
            
            tooltip.html(tooltipContent)
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

        // ノードの表示/非表示状態を更新
        updateNodeVisibility();

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

function handleToggleFilters(): void {
    isFiltersVisible = !isFiltersVisible;
    const filterContainer = document.querySelector('.filter-container');
    const controls = document.querySelector('.controls');
    
    if (filterContainer && controls) {
        filterContainer.classList.toggle('hidden', !isFiltersVisible);
        controls.classList.toggle('filters-hidden', !isFiltersVisible);
    }
}

function cleanup(): void {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
    
    window.removeEventListener('resize', handleResize);
    toggleForceButton?.removeEventListener('click', handleToggleForce);
    toggleFiltersButton?.removeEventListener('click', handleToggleFilters);
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
                // 現在のディレクトリの状態を保存
                const currentState = new Map<string, boolean>();
                if (config && config.directories) {
                    config.directories.forEach(dir => {
                        const checkbox = document.getElementById(`toggleDir${dir.path.replace(/[\/\\]/g, '_')}`) as HTMLInputElement;
                        if (checkbox) {
                            currentState.set(dir.path, checkbox.checked);
                        }
                    });
                }

                // 新しい設定を適用
                config = message.data.config;

                // 保存した状態を新しい設定に反映
                if (config && config.directories) {
                    config.directories = config.directories.map(dir => ({
                        ...dir,
                        enabled: currentState.has(dir.path) ? currentState.get(dir.path)! : dir.enabled
                    }));
                }

                // グラフデータを更新
                graphData = {
                    nodes: message.data.nodes,
                    links: message.data.links
                };

                // 先にディレクトリの色を初期化
                initializeDirectoryColors();

                // フィルターUIを再生成（グラフの初期化前に行う）
                createFilterControls();

                // UIを再描画（ディレクトリの色が決定された後）
                const graphDiv = document.getElementById('graph');
                if (graphDiv) {
                    graphDiv.innerHTML = '';
                    initializeGraph(graphData);
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

        // ディレクトリツリーを構築
        const directoryTree = buildDirectoryTree(config.directories);
        
        // ツリーを再帰的にレンダリング
        const treeContainer = document.createElement('div');
        treeContainer.className = 'directory-tree';
        renderDirectoryTree(directoryTree, treeContainer, 0);

        directoriesContainer.appendChild(treeContainer);
        filterContainer.appendChild(directoriesContainer);
    }

    controls.appendChild(filterContainer);
}

// ディレクトリツリーを構築する関数
interface DirectoryNode {
    path: string;
    enabled: boolean;
    children: Map<string, DirectoryNode>;
    parent?: DirectoryNode;  // 親ノードへの参照を追加
}

function buildDirectoryTree(directories: { path: string; enabled: boolean }[]): Map<string, DirectoryNode> {
    const root = new Map<string, DirectoryNode>();

    // ディレクトリを深さでソート（浅い順）
    const sortedDirs = [...directories].sort((a, b) => {
        const depthA = a.path.split(/[\/\\]/).length;
        const depthB = b.path.split(/[\/\\]/).length;
        return depthA - depthB;
    });

    // ノードを取得または作成する補助関数
    function getOrCreateNode(path: string, enabled: boolean, parent?: DirectoryNode): DirectoryNode {
        const parts = path.split(/[\/\\]/);
        let currentLevel = root;
        let currentPath = '';
        let currentNode: DirectoryNode | undefined;

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            if (!currentLevel.has(part)) {
                const newNode: DirectoryNode = {
                    path: currentPath,
                    enabled: enabled,
                    children: new Map(),
                    parent: currentNode
                };
                currentLevel.set(part, newNode);
                currentNode = newNode;
            } else {
                currentNode = currentLevel.get(part)!;
            }
            currentLevel = currentNode.children;
        }

        return currentNode!;
    }

    // ディレクトリツリーを構築
    for (const dir of sortedDirs) {
        const node = getOrCreateNode(dir.path, dir.enabled);
        
        // 親が無効な場合、子も無効にする
        if (node.parent && !node.parent.enabled) {
            node.enabled = false;
        }
    }

    return root;
}

// ディレクトリツリーをレンダリングする関数
function renderDirectoryTree(tree: Map<string, DirectoryNode>, container: HTMLElement, depth: number) {
    for (const [name, node] of tree) {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'directory-item';
        itemContainer.style.paddingLeft = `${depth * 20}px`;

        const label = document.createElement('label');
        label.className = 'control-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggleDir${node.path.replace(/[\/\\]/g, '_')}`;
        checkbox.checked = node.enabled;
        
        // チェックボックスの状態変更時の処理を更新
        checkbox.addEventListener('change', () => {
            updateDirectoryState(node, checkbox.checked);
        });

        // カラーパレットを追加
        const colorPalette = document.createElement('span');
        colorPalette.className = 'color-palette';
        colorPalette.style.backgroundColor = directoryColors.get(node.path) || 'hsl(0, 0%, 70%)';  // 色がない場合はグレー

        // 展開/折りたたみアイコンを追加（子ノードがある場合のみ）
        if (node.children.size > 0) {
            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'directory-toggle';
            toggleIcon.textContent = '▼';
            label.appendChild(toggleIcon);

            // クリックイベントを追加
            toggleIcon.addEventListener('click', (e) => {
                e.preventDefault();
                const childContainer = itemContainer.querySelector('.directory-children');
                if (childContainer) {
                    const isHidden = childContainer.classList.toggle('hidden');
                    toggleIcon.textContent = isHidden ? '▶' : '▼';
                }
            });
        }

        label.appendChild(checkbox);
        label.appendChild(colorPalette);
        label.appendChild(document.createTextNode(name));
        itemContainer.appendChild(label);

        // 子ノードがある場合は再帰的にレンダリング
        if (node.children.size > 0) {
            const childContainer = document.createElement('div');
            childContainer.className = 'directory-children';
            renderDirectoryTree(node.children, childContainer, depth + 1);
            itemContainer.appendChild(childContainer);
        }

        container.appendChild(itemContainer);
    }
}

// ディレクトリの状態を更新する関数
function updateDirectoryState(node: DirectoryNode, enabled: boolean) {
    // 現在のノードの状態を更新
    node.enabled = enabled;
    
    // チェックボックスの状態を更新
    const checkbox = document.getElementById(`toggleDir${node.path.replace(/[\/\\]/g, '_')}`) as HTMLInputElement;
    if (checkbox) {
        checkbox.checked = enabled;
    }

    // 子ノードの状態を更新
    const updateChildren = (node: DirectoryNode, enabled: boolean) => {
        for (const childNode of node.children.values()) {
            childNode.enabled = enabled;
            const childCheckbox = document.getElementById(`toggleDir${childNode.path.replace(/[\/\\]/g, '_')}`) as HTMLInputElement;
            if (childCheckbox) {
                childCheckbox.checked = enabled;
            }
            updateChildren(childNode, enabled);
        }
    };
    updateChildren(node, enabled);

    // 親ノードの状態を更新
    const updateParents = (node: DirectoryNode) => {
        let currentNode = node;
        while (currentNode.parent) {
            const parentNode = currentNode.parent;
            const siblings = Array.from(parentNode.children.values());
            const hasEnabledChild = siblings.some(sibling => sibling.enabled);
            
            parentNode.enabled = hasEnabledChild;
            const parentCheckbox = document.getElementById(`toggleDir${parentNode.path.replace(/[\/\\]/g, '_')}`) as HTMLInputElement;
            if (parentCheckbox) {
                parentCheckbox.checked = hasEnabledChild;
            }
            
            currentNode = parentNode;
        }
    };
    updateParents(node);

    // VSCodeに状態変更を通知
    handleDirectoryToggle(node.path, enabled);
}

function handleDirectoryToggle(directory: string, checked: boolean) {
    // VSCodeにメッセージを送信
    vscode.postMessage({
        command: 'toggleDirectory',
        directory: directory,
        checked: checked
    });

    // configのディレクトリ状態を更新
    if (config && config.directories) {
        const targetDir = config.directories.find(dir => dir.path === directory);
        if (targetDir) {
            targetDir.enabled = checked;
        }
    }
}

// ノードとリンクの表示/非表示を更新する関数
function updateNodeVisibility() {
    const nodes = d3.selectAll('.node');
    nodes.each(function(d: any) {
        const dirPath = d.dirPath || '';
        const shouldShow = isDirectoryEnabled(dirPath);
        d3.select(this).classed('hidden', !shouldShow);
    });

    // リンクの表示/非表示を更新
    const links = d3.selectAll('.link');
    links.each(function(d: any) {
        const sourceDir = (d.source as any).dirPath || '';
        const targetDir = (d.target as any).dirPath || '';
        const shouldShow = isDirectoryEnabled(sourceDir) && isDirectoryEnabled(targetDir);
        d3.select(this).classed('hidden', !shouldShow);
    });
}

// ディレクトリが有効かどうかを判定する関数
function isDirectoryEnabled(dirPath: string): boolean {
    if (!dirPath) return true;
    
    // configからディレクトリツリーを構築
    const directoryTree = buildDirectoryTree(config.directories);
    
    // パスを分解して各階層をチェック
    const parts = dirPath.split(/[\/\\]/);
    let currentPath = '';
    let currentLevel = directoryTree;
    let lastMatchedNode: DirectoryNode | undefined;
    
    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        // 現在のレベルのノードをチェック
        const exactMatch = Array.from(currentLevel.values()).find(n => n.path === currentPath);
        if (exactMatch) {
            lastMatchedNode = exactMatch;
            currentLevel = exactMatch.children;
        } else {
            // 完全一致がない場合、最後にマッチしたノードの状態を使用
            return lastMatchedNode ? lastMatchedNode.enabled : true;
        }
    }
    
    // 完全一致した場合はそのノードの状態を返す
    return lastMatchedNode ? lastMatchedNode.enabled : true;
}

// メインの初期化関数
function initializeApp() {
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

        // DOM要素の取得を確実に行う
        const forceButton = document.getElementById('toggleForce');
        const filtersButton = document.getElementById('toggleFilters');

        if (!forceButton || !filtersButton) {
            throw new Error('Required buttons not found in DOM');
        }

        toggleForceButton = forceButton as HTMLButtonElement;
        toggleFiltersButton = filtersButton as HTMLButtonElement;
        
        // 先にディレクトリの色を初期化
        initializeDirectoryColors();
        
        // フィルターUIを生成（グラフの初期化前に行う）
        createFilterControls();
        
        // グラフを初期化（ディレクトリの色が決定された後）
        console.log('Initializing graph with data:', graphData);
        initializeGraph(graphData);
        
        // イベントリスナーの設定
        window.addEventListener('resize', handleResize);
        toggleForceButton.addEventListener('click', handleToggleForce);
        toggleFiltersButton.addEventListener('click', handleToggleFilters);
    } catch (error) {
        console.error('Failed to initialize graph:', error);
        vscode.postMessage({
            command: 'error',
            message: `グラフの初期化中にエラーが発生しました: ${error}`
        });
    }
}

// DOMContentLoadedイベントで初期化を行う
document.addEventListener('DOMContentLoaded', initializeApp); 